import json
from time import perf_counter
from urllib.error import URLError

import pytest

from src.agent.guardrails.query_guardrail import QueryValidationError, validate_query
from src.agent.models.model_router import ModelRouter, deterministic_sql
from src.agent.tools.text_to_sql import TextToSqlGenerator


CATALOG = [
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

    sql = generator("Muestra ventas por región", CATALOG)

    assert requests[0][0] == "http://midas-ollama:11434/api/generate"
    assert requests[0][1]["model"] == "qwen2.5:3b"
    assert sql == "SELECT region FROM silver.crm_transacciones LIMIT 1000"


def test_router_uses_ast_fallback_when_ollama_is_offline(monkeypatch):
    def offline(*_, **__):
        raise URLError("offline")

    monkeypatch.setattr("src.agent.models.model_router.urlopen", offline)
    generator = TextToSqlGenerator(ModelRouter())

    sql = generator("¿Cuántos registros hay de ventas?", CATALOG)

    assert sql == "SELECT COUNT(*) AS total_registros FROM silver.crm_transacciones LIMIT 1000"


def test_router_uses_fallback_when_ollama_sql_is_invalid(monkeypatch):
    class Response:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self):
            return b'{"response": "DELETE FROM silver.crm_transacciones"}'

    monkeypatch.setattr("src.agent.models.model_router.urlopen", lambda *_args, **_kwargs: Response())
    generator = TextToSqlGenerator(ModelRouter())

    sql = generator("¿Cuántos registros hay de ventas?", CATALOG)

    assert "COUNT(*)" in sql


def test_fallback_rejects_ambiguous_intents():
    with pytest.raises(ValueError, match="intención"):
        deterministic_sql("Explora las ventas por región", CATALOG)


def test_fallback_applies_a_precertified_category_filter():
    sql = deterministic_sql("Cuenta ventas de la región norte", CATALOG)

    assert "WHERE region = 'NORTE'" in sql


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
