import json
from time import perf_counter
from urllib.error import URLError

import pytest

from src.agent.guardrails.query_guardrail import QueryValidationError, validate_query
from src.agent.models.model_router import (
    ModelRouter,
    deterministic_sql,
    validate_sql_alignment,
)
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
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)
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


def test_fallback_understands_ranking_wording_without_por_dimension():
    sql = deterministic_sql("Hazme un ranking de regiones por venta neta en 2011", CATALOG)

    assert "SELECT region_id AS region_id, SUM(venta_neta)" in sql
    assert "GROUP BY region_id" in sql
    assert "ORDER BY venta_neta DESC" in sql


def test_fallback_selects_sales_table_for_ticket_metric_without_venta_word():
    sql = deterministic_sql("Ticket promedio por región en 2012", CATALOG)

    assert "FROM gold.fact_ventas" in sql
    assert "AVG(ticket_promedio)" in sql
    assert "GROUP BY region_id" in sql


def test_fallback_prefers_explicit_ticket_metric_and_canal_dimension():
    sql = deterministic_sql(
        "¿Qué canal de venta tuvo mejor ticket promedio en 2012?", CATALOG
    )

    assert "SELECT canal_venta AS canal_venta, AVG(ticket_promedio)" in sql
    assert "GROUP BY canal_venta" in sql
    assert "ORDER BY ticket_promedio DESC" in sql
    assert "LIMIT 1" in sql


def test_fallback_superlative_uses_sum_and_single_winner():
    sql = deterministic_sql("¿Cuál es la región con mayor venta neta en 2011?", CATALOG)

    assert "SELECT region_id AS region_id, SUM(venta_neta)" in sql
    assert "GROUP BY region_id" in sql
    assert "ORDER BY venta_neta DESC" in sql
    assert "LIMIT 1" in sql


def test_fallback_keeps_explicit_limit_before_superlative():
    sql = deterministic_sql("Dame las 3 regiones con mayor venta neta en 2011", CATALOG)

    assert "GROUP BY region_id" in sql
    assert "LIMIT 3" in sql


def test_fallback_understands_vendio_mas_superlative():
    sql = deterministic_sql("¿Qué región vendió más en 2011?", CATALOG)

    assert "SELECT region_id AS region_id, SUM(venta_neta)" in sql
    assert "GROUP BY region_id" in sql
    assert "ORDER BY venta_neta DESC" in sql
    assert "LIMIT 1" in sql


def test_fallback_orders_worst_superlative_ascending():
    sql = deterministic_sql("¿Qué tienda vende menos en 2011?", CATALOG)

    assert "GROUP BY tienda_id" in sql
    assert "ORDER BY venta_neta ASC" in sql
    assert "LIMIT 1" in sql


def test_fallback_delegates_unknown_dimension_instead_of_returning_global_total():
    with pytest.raises(ValueError, match="dimensión"):
        deterministic_sql("Ventas por producto en 2011", CATALOG)


def test_fallback_delegates_unknown_superlative_dimension():
    with pytest.raises(ValueError, match="dimensión"):
        deterministic_sql("¿Cuál es el producto más vendido?", CATALOG)


def test_fallback_delegates_unsupported_business_metric():
    with pytest.raises(ValueError, match="métrica"):
        deterministic_sql("Margen de ventas por región en 2011", CATALOG)


def test_fallback_delegates_relative_time_questions():
    with pytest.raises(ValueError, match="plantilla"):
        deterministic_sql("¿Cuánto vendimos el año pasado?", CATALOG)


def test_alignment_rejects_global_total_for_grouped_question():
    error = validate_sql_alignment(
        "Ventas por región en 2011",
        "SELECT SUM(venta_neta) AS venta_neta FROM gold.fact_ventas WHERE anio = 2011",
    )

    assert error is not None
    assert "GROUP BY" in error


def test_alignment_accepts_grouped_question():
    error = validate_sql_alignment(
        "Ventas por región en 2011",
        "SELECT region_id, SUM(venta_neta) AS venta_neta FROM gold.fact_ventas "
        "WHERE anio = 2011 GROUP BY region_id",
    )

    assert error is None


def test_alignment_rejects_ranking_without_order():
    error = validate_sql_alignment(
        "Top 5 tiendas por ventas en 2011",
        "SELECT tienda_id, SUM(venta_neta) AS venta_neta FROM gold.fact_ventas "
        "WHERE anio = 2011 GROUP BY tienda_id",
    )

    assert error is not None
    assert "ORDER BY" in error


def test_alignment_rejects_missing_second_dimension():
    error = validate_sql_alignment(
        "Ventas por región y producto",
        "SELECT region, SUM(monto_neto) AS venta FROM gold.fact_ventas GROUP BY region",
    )

    assert error is not None
    assert "dimensiones" in error


def test_alignment_rejects_wrong_ticket_metric():
    error = validate_sql_alignment(
        "¿Qué canal de venta tuvo mejor ticket promedio en 2012?",
        "SELECT canal_venta, AVG(venta_neta) AS ticket FROM gold.fact_ventas "
        "WHERE anio = 2012 GROUP BY canal_venta ORDER BY ticket DESC LIMIT 1",
    )

    assert error is not None
    assert "ticket" in error


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


def test_router_rejects_external_cloud_endpoints(monkeypatch):
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    monkeypatch.delenv("GOOGLE_API_KEY", raising=False)

    with pytest.raises(ValueError, match="endpoints locales aprobados"):
        ModelRouter(base_url="https://api.openai.com/v1")

    with pytest.raises(ValueError, match="endpoints locales aprobados"):
        ModelRouter(base_url="https://generativelanguage.googleapis.com")
