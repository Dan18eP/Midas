import json
from time import perf_counter
from urllib.error import URLError

import pytest

from src.agent.guardrails.query_guardrail import QueryValidationError, validate_query
from src.agent.models.model_router import ModelRouter, deterministic_sql
from src.agent.tools.text_to_sql import TextToSqlGenerator


CATALOG = [
    {
        "table": "gold.fact_ventas",
        "columns": [
            "fecha",
            "anio",
            "mes",
            "dia",
            "region_id",
            "tienda_id",
            "cliente_id",
            "canal_venta",
            "venta_bruta",
            "total_descuento",
            "total_devoluciones",
            "venta_neta",
            "pedidos_validos",
            "ticket_promedio",
            "tasa_devolucion",
        ],
    },
    {
        "table": "silver.crm_transacciones",
        "columns": ["transaccion_id", "monto", "region", "canal_venta"],
    },
    {"table": "gold.mart_ventas", "columns": ["region", "monto_neto"]},
]


def test_router_uses_local_qwen_and_validates_its_sql(monkeypatch):
    requests = []

    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self):
            return json.dumps({"response": "SELECT region FROM silver.crm_transacciones"}).encode()

    def fake_urlopen(request, timeout):
        requests.append((request.full_url, json.loads(request.data), timeout))
        return Response()

    monkeypatch.setattr("src.agent.models.model_router.urlopen", fake_urlopen)
    generator = TextToSqlGenerator(ModelRouter())

    sql = generator("Muestra las regiones disponibles", CATALOG)

    assert requests[0][0] == "http://midas-ollama:11434/api/generate"
    assert requests[0][1]["model"] == "qwen2.5:3b"
    assert sql == "SELECT region FROM silver.crm_transacciones LIMIT 1000"


def test_router_uses_ast_fallback_when_ollama_is_offline(monkeypatch):
    def offline(*_, **__):
        raise URLError("offline")

    monkeypatch.setattr("src.agent.models.model_router.urlopen", offline)
    generator = TextToSqlGenerator(ModelRouter())

    sql = generator("¿Cuántos registros hay de ventas?", CATALOG)

    assert sql == "SELECT COUNT(*) AS total_registros FROM gold.fact_ventas LIMIT 1000"


def test_router_prefers_deterministic_sql_for_supported_questions(monkeypatch):
    def unexpected_model_call(*_args, **_kwargs):
        raise AssertionError("El modelo no debe invocarse para una intención soportada")

    monkeypatch.setattr("src.agent.models.model_router.urlopen", unexpected_model_call)
    generator = TextToSqlGenerator(ModelRouter())

    sql = generator("¿Cuántos registros hay de ventas?", CATALOG)

    assert "COUNT(*)" in sql
    assert "gold.fact_ventas" in sql


def test_fallback_rejects_comparisons_between_years():
    with pytest.raises(ValueError, match="plantilla"):
        deterministic_sql("Compara las ventas de 2011 y 2012", CATALOG)


def test_fallback_applies_a_precertified_region_filter():
    sql = deterministic_sql("Cuenta ventas de la región norte", CATALOG)

    assert "WHERE region_id = 'REG-NORTE'" in sql
    assert "SUM(venta_neta)" in sql


def test_fallback_groups_sales_by_region():
    sql = deterministic_sql("Ventas por región en 2011", CATALOG)

    assert "SELECT region_id AS region_id, SUM(venta_neta)" in sql
    assert "FROM gold.fact_ventas" in sql
    assert "WHERE anio = 2011" in sql
    assert "GROUP BY region_id" in sql
    assert "ORDER BY venta_neta DESC" in sql


def test_fallback_groups_sales_by_month():
    sql = deterministic_sql("Ventas por mes en 2011", CATALOG)

    assert "GROUP BY mes" in sql
    assert "SUM(venta_neta)" in sql
    assert "WHERE anio = 2011" in sql
    assert "ORDER BY mes ASC" in sql


def test_fallback_supports_top_n_entities():
    sql = deterministic_sql("Top 5 tiendas por ventas en 2011", CATALOG)

    assert "SELECT tienda_id AS tienda_id, SUM(venta_neta)" in sql
    assert "GROUP BY tienda_id" in sql
    assert "ORDER BY venta_neta DESC" in sql
    assert "LIMIT 5" in sql


def test_fallback_rejects_more_than_one_grouping_dimension():
    with pytest.raises(ValueError, match="una dimensión"):
        deterministic_sql("Ventas por región y mes en 2011", CATALOG)


def test_fallback_uses_canonical_net_sales_metric():
    sql = deterministic_sql("¿Cuál es el total de ventas 2011?", CATALOG)

    assert "SUM(venta_neta) AS sum_venta_neta" in sql
    assert "FROM gold.fact_ventas" in sql
    assert "WHERE anio = 2011" in sql


def test_fallback_latency_is_under_ten_milliseconds():
    start = perf_counter()

    deterministic_sql("¿Cuántos registros hay de ventas?", CATALOG)

    assert (perf_counter() - start) * 1000 < 10


def test_guardrail_rejects_tables_outside_silver_and_gold():
    catalog = CATALOG + [{"table": "bronze.crm_transacciones", "columns": ["monto"]}]

    with pytest.raises(QueryValidationError):
        validate_query("SELECT monto FROM bronze.crm_transacciones", catalog)


def test_router_accepts_localhost_and_env_variable(monkeypatch):
    monkeypatch.setenv("OLLAMA_BASE_URL", "http://localhost:11434")
    router = ModelRouter()
    assert router._base_url == "http://localhost:11434"

    router_127 = ModelRouter(base_url="http://127.0.0.1:11434")
    assert router_127._base_url == "http://127.0.0.1:11434"


def test_router_rejects_external_cloud_endpoints():
    with pytest.raises(ValueError, match="endpoints locales aprobados"):
        ModelRouter(base_url="https://api.openai.com/v1")

    with pytest.raises(ValueError, match="endpoints locales aprobados"):
        ModelRouter(base_url="https://generativelanguage.googleapis.com")
