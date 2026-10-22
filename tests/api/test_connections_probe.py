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


def test_upload_file_short_name_and_cors():
    """Valida que un archivo con nombre corto (ej. 'b' de 1 carácter) se procese con 201 y cabeceras CORS."""
    client = TestClient(app)
    csv_content = b"id,val\n1,100\n2,200\n"

    res = client.post(
        "/api/v1/connections/upload",
        files={"file": ("b.csv", csv_content, "text/csv")},
        data={"name": "b"},
        headers={"Origin": "http://localhost:3000"},
    )
    assert res.status_code == 201
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"
    data = res.json()
    assert data["name"] == "b"
    assert data["source_type"] == "CSV"
    assert "id" in data["detected_columns"]


def test_cors_headers_on_validation_error():
    """Valida que peticiones con errores de validación mantengan cabeceras CORS evitando 'Failed to fetch'."""
    client = TestClient(app)

    # Archivo vacío provoca 400 Bad Request
    res = client.post(
        "/api/v1/connections/upload",
        files={"file": ("empty.csv", b"", "text/csv")},
        headers={"Origin": "http://localhost:3000"},
    )
    assert res.status_code == 400
    assert res.headers.get("access-control-allow-origin") == "http://localhost:3000"

