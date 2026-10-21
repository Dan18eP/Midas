"""Midas API - Pruebas Automatizadas del Módulo de Gobernanza y Cuarentena.

Historia de Usuario: HU-GOV-01 & HU-LAKE-03
Autor: Daniel Echeverría (Backend & API Architect)
"""

from starlette.testclient import TestClient

from src.api.main import app
from src.api.routes.governance import register_quarantine_incident_locally


def test_list_and_get_quarantine_incidents():
    """Valida el listado y detalle de incidentes de calidad aislados."""
    client = TestClient(app)

    # Registrar incidente de prueba en caché local
    sample_incident = {
        "incident_id": "inc_qa_001",
        "connection_id": "conn_crm_bogota",
        "error_type": "NEGATIVE_AMOUNT",
        "bad_record": {"id": 1001, "monto": -450.0, "cliente": "Juan Perez"},
        "quarantine_timestamp": "2026-10-21T13:00:00Z",
    }
    register_quarantine_incident_locally(sample_incident)

    # 1. Listar incidentes
    res_list = client.get("/api/v1/governance/quarantine")
    assert res_list.status_code == 200
    incidents = res_list.json()
    assert len(incidents) >= 1
    assert any(i["incident_id"] == "inc_qa_001" for i in incidents)

    # 2. Consultar detalle del incidente
    res_detail = client.get("/api/v1/governance/quarantine/inc_qa_001")
    assert res_detail.status_code == 200
    detail = res_detail.json()
    assert detail["incident_id"] == "inc_qa_001"
    assert detail["error_type"] == "NEGATIVE_AMOUNT"
    assert detail["bad_record"]["monto"] == -450.0

    # 3. Validar 404 para incidente inexistente
    res_not_found = client.get("/api/v1/governance/quarantine/inc_no_existe_999")
    assert res_not_found.status_code == 404
