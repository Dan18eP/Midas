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
    # Check that response mentions canonical sources
    assert "crm_operaciones" in data["response"]
    assert "Presupuesto_Corporativo_2026.xlsx" in data["response"]
    assert "helpdesk_tickets_live" in data["response"]


def test_agent_sales_query_requests_clarification():
    """Verify query without year flags needs_clarification and asks for 2024/2025/2026."""
    payload = {
        "thread_id": "test_session_clarify_01",
        "message": "Quiero consultar las ventas",
    }
    response = client.post("/api/v1/agent/chat", json=payload)
    assert response.status_code == 200

    data = response.json()
    assert data["needs_clarification"] is True
    assert "2024, 2025 o 2026" in data["response"]


def test_agent_empty_message_validation():
    """Verify empty message returns 422 Unprocessable Entity."""
    response = client.post("/api/v1/agent/chat", json={"message": "   "})
    assert response.status_code == 422


def test_agent_stream_greeting_emits_sse_events():
    """Verify POST /api/v1/agent/chat/stream returns valid SSE stream with tokens and result."""
    payload = {"message": "Hola Midas, ¿qué información tenemos disponible?"}
    response = client.post("/api/v1/agent/chat/stream", json=payload)
    assert response.status_code == 200
    assert "text/event-stream" in response.headers["content-type"]
    text = response.text
    assert "event: status" in text
    assert "event: token" in text
    assert "event: result" in text
    assert "discovery" in text
