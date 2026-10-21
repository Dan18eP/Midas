"""ASGI Middleware for traceability (X-Correlation-ID) and Zero-Trust role propagation (X-User-Role)."""

import uuid
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

        # 2. Extract Zero-Trust role or default to director_general
        user_role_bytes = headers.get(USER_ROLE_BYTES)
        if user_role_bytes:
            user_role = user_role_bytes.decode("latin-1")
        else:
            user_role = DEFAULT_USER_ROLE

        # Store in scope state for downstream handlers
        if "state" not in scope:
            scope["state"] = {}
        scope["state"]["correlation_id"] = correlation_id
        scope["state"]["user_role"] = user_role

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                res_headers = list(message.get("headers", []))
                res_headers.append((CORRELATION_ID_BYTES, correlation_id.encode("latin-1")))
                res_headers.append((USER_ROLE_BYTES, user_role.encode("latin-1")))
                message["headers"] = res_headers
            await send(message)

        await self.app(scope, receive, send_wrapper)


