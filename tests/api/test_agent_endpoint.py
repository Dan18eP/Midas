"""Integration tests for Copilot Agent HTTP endpoint POST /api/v1/agent/chat."""

from fastapi.testclient import TestClient
import pytest

from src.api.main import app
from src.api.routes.agent import reset_agent_graph

client = TestClient(app)


@pytest.fixture(autouse=True)
def reset_graph():
    """Reset agent graph before each test."""
    reset_agent_graph()
    yield
    reset_agent_graph()


def test_agent_greeting_triggers_proactive_discovery():
    """Verify greeting returns proactive source discovery and 3 suggestions."""
    payload = {"message": "Hola Midas, ¿qué información tenemos disponible?"}
    response = client.post("/api/v1/agent/chat", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["intent"] == "discovery"
    assert "thread_id" in data
    assert len(data["suggestions"]) == 3
    # Check that response lists the real connected source families
    response_text = data["response"].lower()
    assert "postgres" in response_text
    assert "excel" in response_text
    assert "rest" in response_text


def test_agent_sales_query_requests_clarification():
    """Verify query without year asks for a real available year, never hardcoded ones."""
    payload = {
        "thread_id": "test_session_clarify_01",
        "message": "Quiero consultar las ventas",
    }
    response = client.post("/api/v1/agent/chat", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["needs_clarification"] is True
    assert "¿De qué año" in data["response"]
    assert "2024, 2025 o 2026" not in data["response"]


def test_agent_empty_message_validation():
    """Verify empty message returns 422 Unprocessable Entity."""
    response = client.post("/api/v1/agent/chat", json={"message": "   "})
    assert response.status_code == 422
