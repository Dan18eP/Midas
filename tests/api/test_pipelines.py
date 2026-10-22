"""Midas API - Pruebas Automatizadas de Disparo y Monitoreo de Pipelines Lakehouse.

Historia de Usuario: HU-BACK-03 & HU-LAKE-05
Autor: Daniel Echeverría (Backend & API Architect)
"""

import pytest
from starlette.testclient import TestClient

from src.api.main import app
from src.core.telemetry.hub import get_telemetry_hub
from src.lakehouse.ingestion.connection_registry import reset_connection_registry, get_connection_registry
from src.lakehouse.models.connection import SourceConnectionCreate, SourceType


@pytest.fixture(autouse=True)
def clean_environment():
    """Limpia el hub de telemetría y el registro de conexiones."""
    hub = get_telemetry_hub()
    hub.clear()
    reset_connection_registry()
    yield
    hub.clear()
    reset_connection_registry()


def test_pipeline_trigger_not_found():
    """Valida respuesta 404 si la conexión no existe."""
    client = TestClient(app)
    response = client.post("/api/v1/pipelines/conn_inexistente_999/trigger")
    assert response.status_code == 404
    assert "no existe" in response.json()["detail"]


def test_pipeline_trigger_success_and_telemetry():
    """Valida la ejecución en caliente del pipeline y la emisión de telemetría."""
    client = TestClient(app)
    reg = get_connection_registry()

    # Registrar conexión de prueba
    created = reg.register_connection(
        SourceConnectionCreate(
            name="Fuente CSV Trigger Test",
            source_type=SourceType.CSV,
            config_payload={"delimiter": ",", "encoding": "utf-8"},
        )
    )
    cid = created.connection_id

    # Disparar ejecución del pipeline
    response = client.post(f"/api/v1/pipelines/{cid}/trigger")
    assert response.status_code == 200
    data = response.json()

    assert data["connection_id"] == cid
    assert data["status"] in ("HEALTHY", "DEGRADED")
    assert data["duration_ms"] > 0
    assert len(data["output_tables"]) >= 3
    assert any("gold.fact_ventas" in t for t in data["output_tables"])

    # Validar que se emitió telemetría viva al Hub
    hub = get_telemetry_hub()
    snapshot = hub.get_snapshot()
    assert len(snapshot) > 0


def test_pipeline_get_status():
    """Valida la consulta del estado operativo del pipeline."""
    client = TestClient(app)
    reg = get_connection_registry()

    created = reg.register_connection(
        SourceConnectionCreate(
            name="Fuente Status Test",
            source_type=SourceType.EXCEL,
            config_payload={"file_path": "test.xlsx"},
        )
    )
    cid = created.connection_id

    response = client.get(f"/api/v1/pipelines/{cid}/status")
    assert response.status_code == 200
    data = response.json()

    assert data["connection_id"] == cid
    assert "active_status" in data
    assert "last_updated" in data


def test_approve_gold_proposal_endpoint():
    """Valida la aprobación de un modelo Gold y la emisión de telemetría hacia el Canvas."""
    client = TestClient(app)
    payload = {
        "proposal_id": "gold_ventas_by_canal",
        "target_table": "gold.fct_ventas_canal",
        "sql": "SELECT canal_venta, SUM(monto) AS total_monto FROM silver.clean_data GROUP BY canal_venta",
        "pipeline_id": "pipeline_silver_to_gold",
        "quality_policies": ["row_count_gt_zero"],
    }
    response = client.post("/api/v1/pipelines/gold/approve", json=payload)
    assert response.status_code == 200
    data = response.json()

    assert data["status"] == "APPROVED"
    assert data["target_table"] == "gold.fct_ventas_canal"
    assert data["execution_mode"] == "ICEBERG_WAP"
    assert data["telemetry_event_id"] is not None

    # Verificar que el evento de telemetría fue publicado en el Hub
    hub = get_telemetry_hub()
    snapshot = hub.get_snapshot()
    assert "gold_fct_ventas_canal" in snapshot
    assert snapshot["gold_fct_ventas_canal"].status.value == "HEALTHY"
