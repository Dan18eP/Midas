"""Prevent role spoofing and access through an unauthenticated API."""

from fastapi.testclient import TestClient

from src.api.main import app


def test_anonymous_query_is_rejected():
    response = TestClient(app).post("/api/v1/query/execute", headers={"Authorization": ""},
                                    json={"sql": "SELECT 1"})
    assert response.status_code == 401


def test_role_header_does_not_grant_access():
    response = TestClient(app).get("/api/v1/sessions", headers={"Authorization": "", "X-User-Role": "director_general"})
    assert response.status_code == 401


def test_login_issues_httponly_cookie():
    client = TestClient(app)
    response = client.post("/api/v1/auth/login", json={"token": "audit-test-operator-token-with-at-least-32-characters"})
    assert response.status_code == 200
    assert "httponly" in response.headers["set-cookie"].lower()
    assert client.get("/api/v1/sessions", headers={"Authorization": ""}).status_code == 200


def test_publisher_token_cannot_read_data(monkeypatch):
    token = "audit-publisher-token-with-at-least-32-characters"
    monkeypatch.setenv("MIDAS_TELEMETRY_TOKEN", token)
    response = TestClient(app).get("/api/v1/sessions", headers={"Authorization": f"Bearer {token}"})
    assert response.status_code == 401
