"""Integration tests for FastAPI endpoints: Health, Swagger/OpenAPI, and Telemetry SSE."""

import json
from fastapi.testclient import TestClient
import pytest

from src.api.main import app
from src.core.telemetry.hub import get_telemetry_hub

client = TestClient(app)


@pytest.fixture(autouse=True)
def clean_hub():
    """Ensure clean hub buffer before each test."""
    hub = get_telemetry_hub()
    hub.clear()
    yield
    hub.clear()


def test_health_endpoints():
    """Verify /health and /api/v1/health return 200 and expected schema."""
    resp1 = client.get("/health")
    assert resp1.status_code == 200
    data1 = resp1.json()
    assert data1["status"] == "healthy"
    assert data1["service"] == "midas-api-gateway"
    assert data1["version"] == "1.0.0"
    assert "uptime_seconds" in data1

    resp2 = client.get("/api/v1/health")
    assert resp2.status_code == 200
    assert resp2.json()["status"] == "healthy"


def test_swagger_and_openapi_docs():
    """Verify Swagger UI and OpenAPI 3.1 JSON schemas are accessible and validated."""
    resp_docs = client.get("/docs")
    assert resp_docs.status_code == 200
    assert "SwaggerUIBundle" in resp_docs.text

    resp_openapi = client.get("/openapi.json")
    assert resp_openapi.status_code == 200
    schema = resp_openapi.json()
    assert "openapi" in schema
    assert "Midas Enterprise Platform" in schema["info"]["title"]
    assert "/api/v1/telemetry/stream" in schema["paths"]
    assert "/api/v1/telemetry/publish" in schema["paths"]


def test_telemetry_publish_and_buffer_inspection():
    """Verify publishing an event populates the buffer and returns 201."""
    payload = {
        "pipeline_id": "pipe_cleansing_01",
        "node_id": "silver_cleansing",
        "status": "RUNNING",
        "records_in": 1200,
        "records_out": 1186,
        "latency_ms": 42.0,
        "details": {"quarantined_records": 14},
    }

    pub_resp = client.post("/api/v1/telemetry/publish", json=payload)
    assert pub_resp.status_code == 201
    pub_data = pub_resp.json()
    assert pub_data["status"] == "published"
    assert pub_data["node_id"] == "silver_cleansing"
    assert "event_id" in pub_data

    # Check buffer
    buf_resp = client.get("/api/v1/telemetry/buffer")
    assert buf_resp.status_code == 200
    buf_data = buf_resp.json()
    assert buf_data["buffer_size"] == 1
    stored_event = buf_data["events"][0]
    assert stored_event["pipeline_id"] == "pipe_cleansing_01"
    assert stored_event["records_out"] == 1186


def test_telemetry_stream_reconnection_with_last_event_id():
    """Verify GET /api/v1/telemetry/stream replays events when Last-Event-ID header is provided."""
    # Pre-populate 3 events
    evt_ids = []
    for i in range(3):
        res = client.post(
            "/api/v1/telemetry/publish",
            json={
                "pipeline_id": "p_stream",
                "node_id": f"node_{i}",
                "status": "HEALTHY",
                "records_in": 100 * (i + 1),
                "records_out": 100 * (i + 1),
                "latency_ms": 15.0,
            },
        )
        assert res.status_code == 201
        evt_ids.append(res.json()["event_id"])

    # Client reconnects with Last-Event-ID pointing to the first event
    with client.stream(
        "GET",
        "/api/v1/telemetry/stream?max_events=2",
        headers={"Last-Event-ID": evt_ids[0]},
    ) as response:
        assert response.status_code == 200
        assert "text/event-stream" in response.headers["content-type"]

        # Read first replayed line chunk
        lines = []
        for line in response.iter_lines():
            if line:
                lines.append(line)
            if len(lines) >= 6:  # 2 replayed events (id, event, data each)
                break

        content_str = "\n".join(lines)
        # Event 1 and Event 2 should be in the stream
        assert evt_ids[1] in content_str
        assert evt_ids[2] in content_str
        # Event 0 should NOT be replayed because it was already received
        assert evt_ids[0] not in content_str


def test_auth_roles_endpoint():
    """Verify /api/v1/auth/roles returns the 3 canonical Zero-Trust test identities."""
    resp = client.get("/api/v1/auth/roles")
    assert resp.status_code == 200
    roles = resp.json()
    assert len(roles) == 3

    role_ids = [r["role_id"] for r in roles]
    assert "director_general" in role_ids
    assert "gerente_norte" in role_ids
    assert "analista_externo" in role_ids

    # Validate Ranger policies defined for roles
    gerente = next(r for r in roles if r["role_id"] == "gerente_norte")
    assert gerente["ranger_row_filter"] == "region = 'NORTE'"

    analista = next(r for r in roles if r["role_id"] == "analista_externo")
    assert "gold_marts" in analista["locked_nodes"]


def test_telemetry_scenarios_endpoints():
    """Verify /api/v1/telemetry/scenarios lists T0-T3 and retrieves scenario snapshots."""
    list_resp = client.get("/api/v1/telemetry/scenarios")
    assert list_resp.status_code == 200
    scenarios = list_resp.json()
    assert set(scenarios.keys()) == {"T0", "T1", "T2", "T3"}

    # Get T1 (Incidente Inyectado F3)
    t1_resp = client.get("/api/v1/telemetry/scenarios/T1")
    assert t1_resp.status_code == 200
    t1_data = t1_resp.json()
    assert t1_data["scenario_id"] == "T1"
    assert t1_data["event_count"] >= 2
    # Verify presence of F3 negative amount anomaly
    slv_event = next(e for e in t1_data["events"] if e["node_id"] == "silver_cleansing")
    assert slv_event["status"] == "DEGRADED"
    assert slv_event["details"]["anomaly_type"] == "F3_NEGATIVE_AMOUNT"


def test_telemetry_scenario_injection():
    """Verify injecting a scenario broadcasts events to the hub and buffer."""
    inject_resp = client.post("/api/v1/telemetry/scenarios/inject/T2")
    assert inject_resp.status_code == 200
    data = inject_resp.json()
    assert data["status"] == "injected"
    assert data["scenario_id"] == "T2"

    # Verify hub buffer now has the Guardian PB-03 auto-healing events
    buf_resp = client.get("/api/v1/telemetry/buffer")
    assert buf_resp.status_code == 200
    events = buf_resp.json()["events"]
    guardian_evts = [e for e in events if e["node_id"] == "guardian_monitor"]
    assert len(guardian_evts) >= 1
    assert guardian_evts[0]["status"] == "AUTO_HEALING"
    assert guardian_evts[0]["details"]["playbook_id"] == "PB-03-QUARANTINE"

