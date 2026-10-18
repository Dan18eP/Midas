"""Telemetry Server-Sent Events (SSE) streaming and event publishing routes."""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Header, Query, status
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
