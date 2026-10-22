"""Tests for Gemini LLM routing, SQL generation and fallback."""

import pytest
from src.agent.models.model_router import ModelRouter, _clean_sql_output
from src.agent.tools.text_to_sql import TextToSqlGenerator


CATALOG = [
    {
        "table": "silver.crm_transacciones",
        "columns": ["transaccion_id", "monto", "region", "canal_venta"],
    },
    {"table": "gold.fact_ventas", "columns": ["region", "monto_neto"]},
]


def test_clean_sql_output_markdown_block():
    raw = "```sql\nSELECT * FROM silver.crm_transacciones;\n```"
    assert _clean_sql_output(raw) == "SELECT * FROM silver.crm_transacciones"


def test_clean_sql_output_prose_and_semicolon():
    raw = "Aquí tienes la consulta para Trino: SELECT monto FROM silver.crm_transacciones WHERE region = 'NORTE'; Espero sea útil."
    assert _clean_sql_output(raw) == "SELECT monto FROM silver.crm_transacciones WHERE region = 'NORTE'"


def test_gemini_router_invokes_gemini_when_key_present(monkeypatch):
    calls = []

    class FakeResponse:
        text = "SELECT monto FROM silver.crm_transacciones"

    class FakeModels:
        def generate_content(self, model, contents):
            calls.append((model, contents))
            return FakeResponse()

    class FakeClient:
        def __init__(self, api_key):
            self.api_key = api_key
            self.models = FakeModels()

    import google.genai
    monkeypatch.setattr(google.genai, "Client", FakeClient)

    router = ModelRouter(api_key="fake-test-key", model="gemini-3.1-flash-lite")
    generator = TextToSqlGenerator(router)

    sql = generator("Muestra el monto de transacciones", CATALOG)
    assert sql == "SELECT monto FROM silver.crm_transacciones LIMIT 1000"
    assert len(calls) == 1
    assert calls[0][0] == "gemini-3.1-flash-lite"


def test_router_prefers_deterministic_sql_over_gemini_for_supported_questions(monkeypatch):
    calls = []

    class FakeModels:
        def generate_content(self, model, contents):
            calls.append(model)
            raise AssertionError("Gemini no debe invocarse para una intención soportada")

    class FakeClient:
        def __init__(self, api_key):
            self.api_key = api_key
            self.models = FakeModels()

    import google.genai
    monkeypatch.setattr(google.genai, "Client", FakeClient)

    router = ModelRouter(api_key="fake-test-key", model="gemini-3.1-flash-lite")
    generator = TextToSqlGenerator(router)

    sql = generator("¿Cuántos registros hay de ventas?", CATALOG)
    assert "COUNT(*)" in sql
    assert "gold.fact_ventas" in sql
    assert calls == []
