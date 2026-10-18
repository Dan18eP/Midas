"""Unit tests for Telemetry Event Model and TelemetryHub."""

import asyncio
import json
import pytest

from src.core.telemetry.events import NodeStatus, TelemetryEvent
from src.core.telemetry.hub import TelemetryHub


def test_telemetry_event_creation_and_canonical_contract():
    """Verify event complies with criterion 1 structure."""
    event = TelemetryEvent(
        pipeline_id="pipe_test_01",
        node_id="silver_cleansing",
        status=NodeStatus.RUNNING,
        records_in=1200,
        records_out=1186,
        latency_ms=42.5,
        details={"quarantined_records": 14},
    )

    data = event.to_dict()
    assert data["pipeline_id"] == "pipe_test_01"
    assert data["node_id"] == "silver_cleansing"
    assert data["status"] == "RUNNING"
    assert data["records_in"] == 1200
    assert data["records_out"] == 1186
    assert data["latency_ms"] == 42.5
    assert data["details"]["quarantined_records"] == 14
    assert "event_id" in data
    assert "timestamp" in data


def test_telemetry_event_sse_formatting():
    """Verify event formats as valid W3C SSE packet."""
    event = TelemetryEvent(
        event_id="evt_canonical_001",
        pipeline_id="pipe_test_01",
        node_id="silver_cleansing",
        status=NodeStatus.HEALTHY,
        records_in=500,
        records_out=500,
        latency_ms=12.0,
    )

    sse_text = event.to_sse_format(event_type="telemetry")
    lines = sse_text.splitlines()

    assert lines[0] == "id: evt_canonical_001"
    assert lines[1] == "event: telemetry"
    assert lines[2].startswith("data: ")

    payload_json = json.loads(lines[2][len("data: ") :])
    assert payload_json["event_id"] == "evt_canonical_001"
    assert payload_json["node_id"] == "silver_cleansing"
    assert payload_json["status"] == "HEALTHY"


@pytest.mark.asyncio
async def test_hub_ring_buffer_capacity_limit_100():
    """Verify the ring buffer caps strictly at 100 events, discarding oldest."""
    hub = TelemetryHub(max_buffer_size=100)

    # Publish 120 events
    for i in range(120):
        evt = TelemetryEvent(
            event_id=f"evt_{i:04d}",
            pipeline_id="pipe_bulk",
            node_id="bronze_raw",
            status=NodeStatus.RUNNING,
            records_in=i,
            records_out=i,
            latency_ms=float(i),
        )
        await hub.publish(evt)

    buffered = hub.get_buffered_events()
    assert len(buffered) == 100
    assert hub.buffer_size == 100
    # First buffered should be evt_0020 (0 through 19 were evicted)
    assert buffered[0].event_id == "evt_0020"
    # Last buffered should be evt_0119
    assert buffered[-1].event_id == "evt_0119"


@pytest.mark.asyncio
async def test_hub_last_event_id_replay():
    """Verify transparent reconnection replaying events strictly after Last-Event-ID."""
    hub = TelemetryHub(max_buffer_size=100)

    for i in range(10):
        evt = TelemetryEvent(
            event_id=f"evt_seq_{i}",
            pipeline_id="pipe_replay",
            node_id="guardian_monitor",
            status=NodeStatus.HEALTHY,
        )
        await hub.publish(evt)

    # Ask for events after evt_seq_6 (expecting 7, 8, 9)
    missed = hub.get_events_after("evt_seq_6")
    assert len(missed) == 3
    assert [e.event_id for e in missed] == ["evt_seq_7", "evt_seq_8", "evt_seq_9"]

    # If last_event_id is the very latest, missed should be empty
    assert hub.get_events_after("evt_seq_9") == []


@pytest.mark.asyncio
async def test_hub_concurrent_subscribers_broadcast():
    """Verify all concurrent subscribers receive the published events."""
    hub = TelemetryHub(max_buffer_size=50)

    received_sub1 = []
    received_sub2 = []

    async def client_worker(storage_list, target_count):
        async for chunk in hub.subscribe(heartbeat_interval=2.0):
            if chunk.startswith("id:"):
                storage_list.append(chunk)
                if len(storage_list) >= target_count:
                    break

    # Start 2 subscribers
    task1 = asyncio.create_task(client_worker(received_sub1, 2))
    task2 = asyncio.create_task(client_worker(received_sub2, 2))

    # Give a tiny yield for subscribers to register
    await asyncio.sleep(0.05)
    assert hub.subscriber_count == 2

    # Publish 2 events
    evt1 = TelemetryEvent(pipeline_id="p1", node_id="bronze_raw", status=NodeStatus.RUNNING)
    evt2 = TelemetryEvent(pipeline_id="p1", node_id="silver_cleansing", status=NodeStatus.HEALTHY)
    await hub.publish(evt1)
    await hub.publish(evt2)

    await asyncio.wait_for(asyncio.gather(task1, task2), timeout=3.0)

    assert len(received_sub1) == 2
    assert len(received_sub2) == 2
    # Verify cleanup on exit
    await asyncio.sleep(0.05)
    assert hub.subscriber_count == 0
