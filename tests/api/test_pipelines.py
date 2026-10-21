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
