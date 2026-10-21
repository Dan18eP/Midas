"""Keep empty history honest and honor time filters."""

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from src.api.main import app
from src.core.telemetry.events import TelemetryEvent
from src.core.telemetry.hub import get_telemetry_hub, reset_telemetry_hub


def test_empty_history_does_not_invent_demo_events():
    reset_telemetry_hub()
    response = TestClient(app).get("/api/v1/telemetry/history")
    assert response.json()["events"] == []


def test_history_window_excludes_old_events():
    reset_telemetry_hub()
    hub = get_telemetry_hub()
    hub.publish_sync(TelemetryEvent(pipeline_id="audit", node_id="old", status="HEALTHY",
                                   timestamp=datetime.now(timezone.utc) - timedelta(hours=2)))
    hub.publish_sync(TelemetryEvent(pipeline_id="audit", node_id="current", status="HEALTHY"))
    response = TestClient(app).get("/api/v1/telemetry/history?window=1h")
    assert [event["node_id"] for event in response.json()["events"]] == ["current"]
    assert TestClient(app).get("/api/v1/telemetry/history?window=invalid").status_code == 422
    reset_telemetry_hub()
