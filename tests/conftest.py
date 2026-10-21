"""Existing endpoint tests run as the configured local operator."""

import pytest
from starlette.testclient import TestClient


@pytest.fixture(autouse=True)
def authenticated_operator(monkeypatch):
    token = "audit-test-operator-token-with-at-least-32-characters"
    monkeypatch.setenv("MIDAS_OPERATOR_TOKEN", token)
    original = TestClient.send

    def send(self, request, **kwargs):
        # Authentication tests pass an explicit empty or invalid header.
        if "authorization" not in request.headers:
            request.headers["Authorization"] = f"Bearer {token}"
        return original(self, request, **kwargs)

    monkeypatch.setattr(TestClient, "send", send)
    def offline_model(*args, **kwargs):
        raise OSError("Local model is disabled in offline tests")

    monkeypatch.setattr("src.agent.models.model_router.urlopen", offline_model)
