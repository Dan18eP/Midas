"""Health and readiness endpoints for Midas API Gateway."""

from datetime import datetime, timezone
import os
import time
from fastapi import APIRouter
from pydantic import BaseModel, Field

from src.core.telemetry.hub import get_telemetry_hub

router = APIRouter(tags=["Health & Status"])

START_TIME = time.time()


class HealthResponse(BaseModel):
    """Health check status response."""
    status: str = Field("healthy", description="Operational health status.")
    service: str = Field("midas-api-gateway", description="Service identifier.")
    version: str = Field("1.0.0", description="API Gateway software version.")
    uptime_seconds: float = Field(..., description="Seconds elapsed since gateway process start.")
    active_sse_subscribers: int = Field(..., description="Count of currently active SSE stream clients.")
    environment: str = Field(..., description="Current running environment (development, staging, production).")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="Gateway Health Check",
    description="Returns high-level health metrics, uptime and active SSE connections.",
)
@router.get(
    "/api/v1/health",
    response_model=HealthResponse,
    summary="API v1 Gateway Health Check",
    include_in_schema=True,
)
async def get_health() -> HealthResponse:
    hub = get_telemetry_hub()
    return HealthResponse(
        status="healthy",
        service="midas-api-gateway",
        version="1.0.0",
        uptime_seconds=round(time.time() - START_TIME, 2),
        active_sse_subscribers=hub.subscriber_count,
        environment=os.getenv("ENVIRONMENT", "development"),
    )
