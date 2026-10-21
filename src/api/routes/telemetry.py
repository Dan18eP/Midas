"""Telemetry Server-Sent Events (SSE) streaming and event publishing routes."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Header, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from src.core.telemetry.events import TelemetryEvent
from src.core.telemetry.hub import get_telemetry_hub

router = APIRouter(prefix="/api/v1/telemetry", tags=["Telemetry SSE Hub"])


class PublishEventResponse(BaseModel):
    """Response returned upon successful event publication."""
    status: str = Field("published", description="Publication status.")
    event_id: str = Field(..., description="Assigned unique event ID.")
    node_id: str = Field(..., description="Target Lakehouse node identifier.")


class BufferStatusResponse(BaseModel):
    """Snapshot of events stored in the in-memory ring buffer."""
    buffer_size: int = Field(..., description="Count of events currently in buffer.")
    max_capacity: int = Field(100, description="Maximum retention capacity.")
    events: List[Dict[str, Any]] = Field(..., description="Chronological list of buffered events.")

class TelemetryHistoryResponse(BaseModel):
    """Snapshot of historical telemetry events for Time-Travel replay scrubber."""
    window: str = Field("24h", description="Selected time window.")
    total_events: int = Field(..., description="Total events in this snapshot.")
    events: List[Dict[str, Any]] = Field(..., description="Chronological list of events.")
    nodes_summary: Dict[str, Any] = Field(..., description="Consolidated node statuses and metrics.")
    active_alerts_count: int = Field(0, description="Count of active alerts/anomalies.")
    retrieved_at: str = Field(..., description="ISO 8601 timestamp.")



@router.get(
    "/stream",
    summary="Real-time Telemetry Server-Sent Events (SSE) Stream",
    description=(
        "Streams live node execution events to the React Flow Canvas. "
        "Supports transparent reconnection with the 'Last-Event-ID' header or query parameter, "
        "replaying missed events from the in-memory ring buffer (up to 100 events)."
    ),
    response_class=StreamingResponse,
    responses={
        200: {
            "description": "Continuous stream of Server-Sent Events.",
            "content": {"text/event-stream": {}},
        }
    },
)
async def stream_telemetry(
    last_event_id_header: Optional[str] = Header(None, alias="Last-Event-ID"),
    last_event_id: Optional[str] = Query(None, description="Fallback query param for Last-Event-ID"),
    max_events: Optional[int] = Query(None, description="Optional upper limit of events before closing stream."),
):
    """Continuous SSE stream endpoint for Canvas live dataflow."""
    effective_last_id = last_event_id or last_event_id_header
    hub = get_telemetry_hub()

    return StreamingResponse(
        hub.subscribe(last_event_id=effective_last_id, max_events=max_events),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-transform",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/publish",
    response_model=PublishEventResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Publish Pipeline Telemetry Event",
    description="Allows data pipelines (Airflow, Spark, Guardian) or test runners to emit telemetry into the Hub.",
)
async def publish_telemetry(event: TelemetryEvent) -> PublishEventResponse:
    """Ingest a telemetry event and broadcast it to all active SSE subscribers."""
    hub = get_telemetry_hub()
    await hub.publish(event)
    return PublishEventResponse(
        status="published",
        event_id=event.event_id,
        node_id=event.node_id,
    )


@router.get(
    "/buffer",
    response_model=BufferStatusResponse,
    summary="Inspect Telemetry Ring Buffer",
    description="Returns the current events stored in the in-memory ring buffer for diagnostics.",
)
async def get_buffer() -> BufferStatusResponse:
    """Retrieve buffered events."""
    hub = get_telemetry_hub()
    events = hub.get_buffered_events()
    return BufferStatusResponse(
        buffer_size=len(events),
        max_capacity=100,
        events=[e.to_dict() for e in events],
    )


@router.post(
    "/reset",
    summary="Reset Telemetry Buffer",
    description="Flushes the ring buffer. Primarily used for automated testing.",
)
async def reset_buffer() -> Dict[str, Any]:
    """Flush the buffer."""
    hub = get_telemetry_hub()
    hub.clear()
    return {"status": "cleared", "buffer_size": 0}


@router.get(
    "/history",
    response_model=TelemetryHistoryResponse,
    summary="Retrieve Telemetry History for Time-Travel Scrubber",
    description="Returns chronological events and consolidated node statuses for the 24-hour Canvas scrubber.",
)
async def get_telemetry_history(
    window: str = Query("24h", description="Time window filter (1h, 6h, 12h, 24h, all)"),
    limit: int = Query(200, ge=1, le=1000, description="Max number of events to return"),
    node_id: Optional[str] = Query(None, description="Optional node_id filter"),
) -> TelemetryHistoryResponse:
    """Query telemetry history for Time-Travel slider."""
    from datetime import datetime, timezone
    from src.core.telemetry.scenarios import get_scenario_events

    hub = get_telemetry_hub()
    buffered = hub.get_buffered_events()
    if not buffered:
        buffered = get_scenario_events("T0")

    events = [e.to_dict() for e in buffered]
    if node_id:
        events = [e for e in events if e.get("node_id") == node_id]

    events = events[-limit:]

    nodes_summary: Dict[str, Any] = {}
    active_alerts = 0
    for evt in events:
        nid = evt.get("node_id")
        if nid:
            nodes_summary[nid] = {
                "status": evt.get("status", "HEALTHY"),
                "records_in": evt.get("records_in", 0),
                "records_out": evt.get("records_out", 0),
                "latency_ms": evt.get("latency_ms", 0.0),
                "last_event_id": evt.get("event_id"),
            }
            if evt.get("status") in ("DEGRADED", "FAILED", "AUTO_HEALING"):
                active_alerts += 1

    return TelemetryHistoryResponse(
        window=window,
        total_events=len(events),
        events=events,
        nodes_summary=nodes_summary,
        active_alerts_count=active_alerts,
        retrieved_at=datetime.now(timezone.utc).isoformat(),
    )



# ==============================================================================
# Time-Travel Replay Scenarios (HU-FRONT-03 / Canvas Demo)
# ==============================================================================


@router.get(
    "/scenarios",
    summary="List Predefined Time-Travel Scenarios",
    description="Returns available Time-Travel demo scenarios (T0, T1, T2, T3) per canonical frontend specification.",
)
async def get_scenarios() -> Dict[str, str]:
    """List available Time-Travel scenarios."""
    from src.core.telemetry.scenarios import list_available_scenarios

    return list_available_scenarios()


@router.get(
    "/scenarios/{scenario_id}",
    summary="Get Events for a Time-Travel Scenario",
    description="Returns the snapshot events for a given scenario (T0, T1, T2, T3).",
)
async def get_scenario(scenario_id: str) -> Dict[str, Any]:
    """Retrieve snapshot events for a specific scenario."""
    from src.core.telemetry.scenarios import get_scenario_events

    try:
        events = get_scenario_events(scenario_id)
        return {
            "scenario_id": scenario_id.upper(),
            "event_count": len(events),
            "events": [e.to_dict() for e in events],
        }
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.post(
    "/scenarios/inject/{scenario_id}",
    summary="Inject a Time-Travel Scenario into Live SSE Hub",
    description="Broadcasts all events from scenario T0, T1, T2, or T3 to all active SSE subscribers.",
)
async def inject_scenario(scenario_id: str) -> Dict[str, Any]:
    """Inject scenario events into live SSE stream."""
    from src.core.telemetry.scenarios import get_scenario_events

    try:
        events = get_scenario_events(scenario_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))

    hub = get_telemetry_hub()
    for event in events:
        await hub.publish(event)

    return {
        "status": "injected",
        "scenario_id": scenario_id.upper(),
        "injected_events": len(events),
    }

