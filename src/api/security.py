"""Authenticate the local operator and the pipeline publisher."""

import hmac
import os
from http.cookies import CookieError, SimpleCookie


def operator_token_valid(value):
    expected = os.getenv("MIDAS_OPERATOR_TOKEN", "")
    return len(expected) >= 32 and hmac.compare_digest(value.encode(), expected.encode())


def identity(headers, path):
    authorization = headers.get(b"authorization", b"").decode("latin-1")
    token = authorization.removeprefix("Bearer ") if authorization.startswith("Bearer ") else ""
    if not token:
        cookies = SimpleCookie()
        try:
            cookies.load(headers.get(b"cookie", b"").decode("latin-1"))
        except CookieError:
            return None
        token = cookies["midas_session"].value if "midas_session" in cookies else ""
    if operator_token_valid(token):
        return "user_director", "director_general"
    publisher = os.getenv("MIDAS_TELEMETRY_TOKEN", "")
    if path == "/api/v1/telemetry/publish" and len(publisher) >= 32 and hmac.compare_digest(token.encode(), publisher.encode()):
        return "pipeline_publisher", "publisher"
    return None
