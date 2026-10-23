"""
Midas Query Engine - Automated Tests for Trino Engine, Guardrails & API Routes
Historia de Usuario: HU-BACK-02 (Trino Query Engine & Catálogos Iceberg/PG)
Responsable: Daniel Echeverría (Team Leader & Principal Backend Architect)
"""

import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.core.query_engine.guardrails import (
    enforce_limit_and_read_only,
    mask_sensitive_credentials,
    SecurityGuardrailError,
)
from src.core.query_engine.trino_client import (
    TrinoClient,
    QueryResult,
    QueryCostEstimate,
)

client = TestClient(app)


# ==============================================================================
# 1. Tests de Guardrails AST & Inyección de LIMIT 1000
# ==============================================================================

def test_limit_injection_when_limit_missing():
    """Valida que una consulta sin cláusula LIMIT reciba automáticamente LIMIT 1000."""
    sql = "SELECT region, sum(monto) AS total FROM silver.crm_transacciones GROUP BY region"
    transformed = enforce_limit_and_read_only(sql, default_limit=1000, max_limit=1000)

    assert "LIMIT 1000" in transformed
    assert "GROUP BY region" in transformed


def test_limit_clamping_when_limit_exceeds_1000():
    """Valida que consultas con LIMIT superior a 1000 sean restringidas a 1000."""
    sql = "SELECT * FROM silver.crm_clientes LIMIT 50000"
    transformed = enforce_limit_and_read_only(sql, default_limit=1000, max_limit=1000)

    assert "LIMIT 1000" in transformed
    assert "50000" not in transformed


def test_limit_preserved_when_under_threshold():
    """Valida que un LIMIT menor o igual a 1000 se preserve intacto."""
    sql = "SELECT cliente_id, nombre_completo FROM silver.crm_clientes LIMIT 50"
    transformed = enforce_limit_and_read_only(sql, default_limit=1000, max_limit=1000)

    assert "LIMIT 50" in transformed


def test_read_only_guardrail_blocks_destructive_operations():
    """Valida el bloqueo estricto de cualquier comando de mutación DDL o DML."""
    malicious_queries = [
        "DROP TABLE silver.crm_transacciones",
        "DELETE FROM silver.crm_clientes WHERE cliente_id = '123'",
        "UPDATE silver.crm_transacciones SET monto = 0",
        "INSERT INTO silver.crm_clientes VALUES ('c1', 'hacker')",
        "ALTER TABLE silver.crm_transacciones ADD COLUMN bad_col INT",
        "TRUNCATE TABLE silver.crm_transacciones",
        "GRANT ALL PRIVILEGES ON silver.crm_clientes TO public",
    ]

    for bad_sql in malicious_queries:
        with pytest.raises(SecurityGuardrailError) as exc_info:
            enforce_limit_and_read_only(bad_sql)
        assert "no permitida" in str(exc_info.value).lower() or "bloqueado" in str(exc_info.value).lower()


def test_multi_statement_is_rejected():
    """Valida que se rechace la ejecución de múltiples sentencias encadenadas con punto y coma."""
    sql = "SELECT * FROM silver.crm_transacciones; DROP TABLE silver.crm_transacciones"
    with pytest.raises(SecurityGuardrailError, match="única consulta"):
        enforce_limit_and_read_only(sql)


# ==============================================================================
# 2. Tests de Enmascaramiento y Cero Fuga de Credenciales (Criterio 4)
# ==============================================================================

def test_credential_masking_in_logs_and_errors():
    """Valida que las contraseñas, secretos y tokens sean sustituidos por ***MASKED***."""
    raw_trace = "Connection failed: postgresql://admin:secret_pass_123@localhost:5432/db"
    masked = mask_sensitive_credentials(raw_trace)
    assert "secret_pass_123" not in masked
    assert "***MASKED***" in masked

    token_trace = "Authorization failed for Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.xyz"
    masked_token = mask_sensitive_credentials(token_trace)
    assert "eyJhbGci" not in masked_token
    assert "***MASKED***" in masked_token

    param_trace = "Config: password='super_secret_password_2026' & secret_key=midas_s3_key"
    masked_params = mask_sensitive_credentials(param_trace)
    assert "super_secret_password_2026" not in masked_params
    assert "midas_s3_key" not in masked_params


# ==============================================================================
# 3. Tests de Endpoints REST en FastAPI Gateway
# ==============================================================================

def test_query_execute_endpoint_success():
    """Valida la ejecución exitosa de una consulta analítica a través de /api/v1/query/execute."""
    payload = {
        "sql": "SELECT region, total_neto FROM silver.crm_transacciones",
        "catalog": "iceberg",
        "schema_name": "silver",
        "timeout_sec": 10.0,
    }
    response = client.post("/api/v1/query/execute", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert "columns" in body
    assert "data" in body
    assert "row_count" in body
    assert body["row_count"] > 0
    assert body["catalog"] == "iceberg"
    assert body["schema_name"] == "silver"
    assert "cost_estimate" in body
    assert body["cost_estimate"]["cost_level"] in ["LOW", "MEDIUM", "HIGH"]


def test_query_execute_endpoint_rejects_mutation():
    """Valida que /api/v1/query/execute retorne HTTP 400 ante intentos de mutación."""
    payload = {
        "sql": "DROP TABLE silver.crm_clientes",
    }
    response = client.post("/api/v1/query/execute", json=payload)
    assert response.status_code == 400
    assert "no permitida" in response.json()["detail"].lower() or "bloqueado" in response.json()["detail"].lower()


def test_query_explain_endpoint():
    """Valida el análisis de plan y costo computacional en /api/v1/query/explain."""
    payload = {
        "sql": "SELECT region, sum(monto) FROM silver.crm_transacciones GROUP BY region",
        "catalog": "iceberg",
        "schema_name": "silver",
    }
    response = client.post("/api/v1/query/explain", json=payload)
    assert response.status_code == 200

    body = response.json()
    assert body["valid"] is True
    assert "LIMIT 1000" in body["transformed_sql"]
    assert body["cost_estimate"]["estimated_rows"] <= 1000
    assert body["cost_estimate"]["cost_level"] in ["LOW", "MEDIUM", "HIGH"]
    assert "Distributed Execution Plan" in body["cost_estimate"]["plan_summary"]


def test_query_catalogs_endpoint():
    """Valida la introspección de catálogos federados en /api/v1/query/catalogs."""
    response = client.get("/api/v1/query/catalogs")
    assert response.status_code == 200

    catalogs = response.json().get("catalogs", [])
    cat_names = [c["name"] for c in catalogs]
    assert "iceberg" in cat_names
    assert "postgresql" in cat_names


@pytest.mark.asyncio
async def test_trino_client_timeout_handling():
    """Valida que el cliente respete estrictamente los límites de tiempo configurados."""
    # Instanciamos cliente apuntando a un puerto inaccesible con fallback desactivado para timeout
    client_trino = TrinoClient(
        host="192.0.2.1",  # Dirección IP TEST-NET no enrutable
        port=8082,
        timeout_sec=0.1,   # Timeout muy corto
        fallback_for_testing=False,
    )

    with pytest.raises((TimeoutError, ConnectionError)):
        await client_trino.execute_query(
            sql="SELECT * FROM silver.crm_transacciones",
            timeout_sec=0.1,
        )
    await client_trino.close()

def test_trino_client_execute_query_sync_fail_closed():
    """Valida que execute_query_sync falle cerrado con TimeoutError o ConnectionError cuando Trino no esta accesible en modo produccion."""
    client_trino = TrinoClient(
        host="192.0.2.1",
        port=8082,
        timeout_sec=0.2,
        fallback_for_testing=False,
    )
    with pytest.raises((TimeoutError, ConnectionError)):
        client_trino.execute_query_sync(
            sql="SELECT * FROM silver.crm_transacciones",
            timeout_sec=0.2,
        )


def test_trino_client_execute_query_sync_deterministic_fallback():
    """Valida que execute_query_sync use motor determinista en modo testing."""
    client_trino = TrinoClient(
        host="localhost",
        port=8082,
        fallback_for_testing=True,
    )
    result = client_trino.execute_query_sync(
        sql="SELECT region, total_neto FROM silver.crm_transacciones",
    )
    assert result.row_count > 0
    assert "region" in result.columns


def test_trino_client_production_missing_entity_never_returns_fixtures(monkeypatch):
    """En producción una tabla inexistente debe fallar, no devolver filas sintéticas."""
    from src.core.query_engine import trino_client as trino_module

    class BrokenClient:
        def __init__(self, *args, **kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def post(self, *args, **kwargs):
            raise RuntimeError("Table silver.crm_transacciones does not exist")

        def get(self, *args, **kwargs):
            raise RuntimeError("unexpected GET")

    monkeypatch.setattr(
        trino_module.httpx,
        "Client",
        lambda *args, **kwargs: BrokenClient(),
    )
    client_trino = TrinoClient(
        host="localhost",
        port=8082,
        fallback_for_testing=False,
    )

    with pytest.raises(RuntimeError, match="no existe"):
        client_trino.execute_query_sync(
            sql="SELECT region FROM silver.crm_transacciones",
        )
