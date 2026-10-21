"""Midas Enterprise Platform — API Gateway Core & Telemetry SSE Hub.

Main FastAPI application entrypoint providing high-performance REST APIs,
distributed request tracing via X-Correlation-ID, and real-time Server-Sent Events (SSE).
"""

from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.middleware import CorrelationIdMiddleware
from src.api.routes.agent import router as agent_router
from src.api.routes.auth import router as auth_router
from src.api.routes.connections import router as connections_router
from src.api.routes.health import router as health_router
from src.api.routes.lineage import router as lineage_router
from src.api.routes.query import router as query_router
from src.api.routes.sessions import router as sessions_router
from src.api.routes.telemetry import router as telemetry_router
from src.core.telemetry.hub import get_telemetry_hub

# Configure application logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] [corr=%(name)s] %(message)s",
)
logger = logging.getLogger("midas.api")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI application."""
    logger.info("Initializing Midas API Gateway and Telemetry Hub...")
    # Initialize global hub singleton
    get_telemetry_hub()
    yield
    logger.info("Shutting down Midas API Gateway...")


# Instantiate FastAPI Application
app = FastAPI(
    title="Midas Enterprise Platform — API Gateway & Telemetry SSE Hub",
    description=(
        "Enterprise Active Lakehouse & Conversational Intelligence Platform.\n\n"
        "Key Services:\n"
        "- **Server-Sent Events (SSE) Hub**: Real-time event broadcasting to React Flow Canvas.\n"
        "- **Distributed Tracing**: Automated X-Correlation-ID propagation.\n"
        "- **Pipeline Observability**: Telemetry ingestion for Bronze, Silver, Gold, and Guardian nodes.\n"
        "- **Data Lineage & Certification**: Medallion 4-layer lineage with KaTeX formulas and SHA-256 audit hashes.\n"
        "- **Conversational Sessions**: ChatGPT-style multi-session history with Qwen 2.5 local inference.\n"
        "- **Dynamic Source Connections**: Multi-source registration and MinIO isolation.\n"
        "- **Zero-Trust Lens**: Security role switching and Ranger policy simulation."
    ),
    version="1.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
)

# 1. Traceability Middleware (must be registered before CORS)
app.add_middleware(CorrelationIdMiddleware)

# 2. CORS Middleware for Frontend & Tools Integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Correlation-ID", "X-User-Role", "Last-Event-ID", "Content-Type"],
)

# 3. Register Route Controllers
app.include_router(health_router)
app.include_router(telemetry_router)
app.include_router(lineage_router)
app.include_router(sessions_router)
app.include_router(auth_router)
app.include_router(agent_router)
app.include_router(query_router)
app.include_router(connections_router)


@app.get("/", include_in_schema=False)
async def root_redirect():
    """Root endpoint providing a friendly status greeting."""
    return {
        "service": "Midas Enterprise API Gateway",
        "version": "1.0.0",
        "docs": "/docs",
        "telemetry_stream": "/api/v1/telemetry/stream",
        "sessions": "/api/v1/sessions",
        "lineage": "/api/v1/lineage/table/{table}",
    }
