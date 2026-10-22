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
    subsystems: dict = Field(default_factory=dict, description="Status of auxiliary subsystems (minio, trino, postgres, telemetry).")
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
    subsystems_status = {
        "telemetry_hub": "healthy" if hub else "degraded",
    }

    # 1. Chequeo dinÃ¡mico de PostgreSQL operacional
    db_url = os.getenv("OPERATIONAL_DB_URL") or os.getenv("POSTGRES_OPERATIONAL_URL") or os.getenv("DATABASE_URL")
    if db_url and "postgresql" in db_url:
        try:
            from sqlalchemy import create_engine, text
            engine = create_engine(db_url, connect_args={"connect_timeout": 1})
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            subsystems_status["postgres"] = "healthy"
        except Exception:
            subsystems_status["postgres"] = "degraded"
    else:
        subsystems_status["postgres"] = "in_memory"

    # 2. Chequeo dinÃ¡mico de MinIO S3
    try:
        from src.lakehouse.storage.minio_client import MidasMinioClient
        minio_healthy = MidasMinioClient().check_health(timeout_sec=0.5)
        subsystems_status["minio"] = "healthy" if minio_healthy else "unavailable"
    except Exception:
        subsystems_status["minio"] = "unavailable"

    # 3. Chequeo dinÃ¡mico de Trino Coordinator
    try:
        from src.core.query_engine.trino_client import TrinoClient
        trino_cli = TrinoClient()
        trino_healthy = await trino_cli.check_health()
        subsystems_status["trino"] = "healthy" if trino_healthy else "unavailable"
    except Exception:
        subsystems_status["trino"] = "unavailable"

    # Determinar estado global: degraded si algún subsistema no está healthy
    degraded = any(v not in ("healthy", "in_memory") for v in subsystems_status.values())
    overall_status = "degraded" if degraded else "healthy"

    return HealthResponse(
        status=overall_status,
        service="midas-api-gateway",
        version="1.0.0",
        uptime_seconds=round(time.time() - START_TIME, 2),
        active_sse_subscribers=hub.subscriber_count,
        environment=os.getenv("ENVIRONMENT", "development"),
        subsystems=subsystems_status,
    )
