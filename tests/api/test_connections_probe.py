"""Midas API - Pruebas Automatizadas del Pre-flight Check de Conexiones (Probe).

Historia de Usuario: HU-LAKE-05 & HU-BACK-03
Autor: Daniel Echeverría (Backend & API Architect)
"""

from starlette.testclient import TestClient

from src.api.main import app


def test_connection_test_probe_rest():
    """Valida la prueba de conectividad hacia endpoints REST."""
    client = TestClient(app)

    # 1. Caso sin URL
    res_no_url = client.post("/api/v1/connections/test", json={"source_type": "REST", "config_payload": {}})
    assert res_no_url.status_code == 200
    assert res_no_url.json()["success"] is False
    assert "url" in res_no_url.json()["detail"].lower()

    # 2. Caso con endpoint inaccesible
    res_bad = client.post(
        "/api/v1/connections/test",
        json={"source_type": "REST", "config_payload": {"url": "http://127.0.0.1:59998/nonexistent"}},
    )
    assert res_bad.status_code == 200
    assert res_bad.json()["success"] is False


def test_connection_test_probe_postgres():
    """Valida la prueba de socket para fuentes PostgreSQL."""
    client = TestClient(app)

    res = client.post(
        "/api/v1/connections/test",
        json={"source_type": "POSTGRES", "config_payload": {"host": "127.0.0.1", "port": 59997}},
    )
    assert res.status_code == 200
    # Como el puerto 59997 está cerrado, debe retornar success=False sin lanzar excepción 500
    assert res.json()["success"] is False
    assert "59997" in res.json()["detail"]


def test_connection_test_probe_tabular():
    """Valida la verificación de formatos tabulares (CSV / EXCEL)."""
    client = TestClient(app)

    res_csv = client.post("/api/v1/connections/test", json={"source_type": "CSV", "config_payload": {}})
    assert res_csv.status_code == 200
    assert res_csv.json()["success"] is True

    res_excel = client.post("/api/v1/connections/test", json={"source_type": "EXCEL", "config_payload": {}})
    assert res_excel.status_code == 200
    assert res_excel.json()["success"] is True
