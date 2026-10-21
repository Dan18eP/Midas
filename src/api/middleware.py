"""ASGI Middleware for traceability (X-Correlation-ID) and Zero-Trust role propagation (X-User-Role)."""

import uuid
from starlette.responses import JSONResponse
from src.api.security import identity
from starlette.types import ASGIApp, Receive, Scope, Send

CORRELATION_ID_HEADER = "X-Correlation-ID"
CORRELATION_ID_BYTES = b"x-correlation-id"

USER_ROLE_HEADER = "X-User-Role"
USER_ROLE_BYTES = b"x-user-role"
DEFAULT_USER_ROLE = "director_general"


class CorrelationIdMiddleware:
    """Pure ASGI middleware for request correlation ID tracing and Zero-Trust role context.

    Unlike BaseHTTPMiddleware, this pure ASGI implementation does not buffer
    or block infinite streaming responses like Server-Sent Events (SSE).
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        # 1. Extract incoming X-Correlation-ID or generate new UUID
        headers = dict(scope.get("headers", []))
        correlation_id_bytes = headers.get(CORRELATION_ID_BYTES)
        if correlation_id_bytes:
            correlation_id = correlation_id_bytes.decode("latin-1")
        else:
            correlation_id = str(uuid.uuid4())

        path = scope.get("path", "")
        public_paths = {"/api/v1/health", "/api/v1/auth/login", "/api/v1/auth/roles"}
        authenticated = identity(headers, path)
        if path.startswith("/api/v1/") and path not in public_paths and scope.get("method") != "OPTIONS" and not authenticated:
            await JSONResponse({"detail": "Authentication required"}, status_code=401)(scope, receive, send)
            return
        # Role headers never establish an identity.
        user_id, user_role = authenticated or ("anonymous", "anonymous")

        # Store in scope state for downstream handlers
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["correlation_id"] = correlation_id
        scope["state"]["user_role"] = user_role
        scope["state"]["user_id"] = user_id

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                res_headers = list(message.get("headers", []))
                res_headers.append((CORRELATION_ID_BYTES, correlation_id.encode("latin-1")))
                res_headers.append((USER_ROLE_BYTES, user_role.encode("latin-1")))
                message["headers"] = res_headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


