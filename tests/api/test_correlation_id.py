"""Unit tests for Correlation ID Middleware and Request Tracing."""

import uuid
from fastapi.testclient import TestClient

from src.api.main import app

client = TestClient(app)


def test_correlation_id_generated_automatically_when_absent():
    """Verify X-Correlation-ID is automatically assigned if not provided in request."""
    response = client.get("/health")
    assert response.status_code == 200

    header_val = response.headers.get("X-Correlation-ID")
    assert header_val is not None
    # Validate it is a valid UUID
    parsed_uuid = uuid.UUID(header_val)
    assert str(parsed_uuid) == header_val


def test_correlation_id_propagated_when_provided_by_client():
    """Verify incoming X-Correlation-ID is preserved across request/response lifecycle."""
    custom_id = "midas-trace-abcdef123456"
    response = client.get("/health", headers={"X-Correlation-ID": custom_id})
    assert response.status_code == 200
    assert response.headers.get("X-Correlation-ID") == custom_id
