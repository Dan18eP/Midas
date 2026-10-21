"""Exercise the real HTTP client without a running coordinator."""

import asyncio

import httpx
import pytest

from src.core.query_engine.trino_client import TrinoClient


def make_client(handler, **kwargs):
    client = TrinoClient(**kwargs)
    client._async_client = httpx.AsyncClient(
        base_url=client.base_url, transport=httpx.MockTransport(handler)
    )
    return client


@pytest.mark.asyncio
async def test_initial_response_rows_are_consumed():
    client = make_client(lambda request: httpx.Response(200, json={
        "id": "query-1", "columns": [{"name": "value", "type": "bigint"}], "data": [[7]],
    }))
    try:
        result = await client.execute_query("SELECT 7 AS value")
        assert result.data == [{"value": 7}]
    finally:
        await client.close()


@pytest.mark.asyncio
@pytest.mark.parametrize("stage", ["initial", "poll"])
async def test_query_errors_never_become_empty_success(stage):
    def handler(request):
        if stage == "poll" and request.method == "POST":
            return httpx.Response(200, json={"id": "query-1", "nextUri": "http://localhost:8082/next"})
        return httpx.Response(200, json={"id": "query-1", "error": {"message": "Permission denied"}})

    client = make_client(handler)
    try:
        with pytest.raises(RuntimeError, match="Permission denied"):
            await client.execute_query("SELECT 7")
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_failed_page_does_not_return_partial_results():
    def handler(request):
        if request.method == "POST":
            return httpx.Response(200, json={"id": "query-1", "columns": [{"name": "x"}],
                                           "data": [[1]], "nextUri": "http://localhost:8082/next"})
        return httpx.Response(503)

    client = make_client(handler)
    try:
        with pytest.raises(ConnectionError):
            await client.execute_query("SELECT 1 AS x")
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_offline_coordinator_has_no_implicit_simulator():
    def offline(request):
        raise httpx.ConnectError("offline", request=request)

    client = make_client(offline)
    try:
        with pytest.raises(ConnectionError):
            await client.execute_query("SELECT monto FROM silver.crm_transacciones")
    finally:
        await client.close()


@pytest.mark.asyncio
async def test_timeout_cancels_query_and_preserves_identity_on_poll():
    calls = []

    async def handler(request):
        calls.append((request.method, request.headers.get("X-Trino-User")))
        if request.method == "POST":
            return httpx.Response(200, json={"id": "query-1", "nextUri": "http://localhost:8082/next"})
        if request.method == "GET":
            await asyncio.sleep(0.1)
        return httpx.Response(204)

    client = make_client(handler, timeout_sec=0.02)
    try:
        with pytest.raises(TimeoutError):
            await client.execute_query("SELECT 1")
        assert calls == [("POST", "trino_admin"), ("GET", "trino_admin"), ("DELETE", "trino_admin")]
    finally:
        await client.close()
