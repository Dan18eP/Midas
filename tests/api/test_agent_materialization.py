"""Checks the explicit confirmation boundary for Gold materialization."""

from fastapi import FastAPI
from fastapi.testclient import TestClient

from src.api.routes import agent


def test_materialization_requires_confirmation(monkeypatch):
    published = []

    def publish(spec, *, confirmed):
        if not confirmed:
            raise ValueError("User confirmation is required")
        published.append(spec)
        return "s3://midas-governance/airflow-specs/dag_gold_orders.yaml"

    monkeypatch.setattr(
        "src.agent.tools.dag_generator.publish_pipeline_spec",
        publish,
    )
    app = FastAPI()
    app.include_router(agent.router)
    client = TestClient(app)
    payload = {
        "report_name": "Orders",
        "sql": "SELECT order_id FROM silver.orders",
        "catalog": [{"table": "silver.orders", "columns": ["order_id"]}],
    }

    response = client.post("/api/v1/agent/materialize", json=payload)

    assert response.status_code == 422
    assert not published


def test_materialization_publishes_confirmed_contract(monkeypatch):
    monkeypatch.setattr(
        "src.agent.tools.dag_generator.publish_pipeline_spec",
        lambda spec, *, confirmed: "s3://midas-governance/airflow-specs/dag_gold_orders.yaml",
    )
    app = FastAPI()
    app.include_router(agent.router)
    client = TestClient(app)

    response = client.post(
        "/api/v1/agent/materialize",
        json={
            "report_name": "Orders",
            "sql": "SELECT order_id FROM silver.orders",
            "catalog": [{"table": "silver.orders", "columns": ["order_id"]}],
            "confirmed": True,
        },
    )

    assert response.status_code == 201
    assert response.json()["pipeline_id"] == "gold_orders"
    assert response.json()["output_table"] == "gold.orders"


def test_frontend_chat_confirmation_publishes_last_validated_query(monkeypatch):
    published = []

    class Snapshot:
        values = {
            "user_message": "Show daily orders",
            "sql": "SELECT order_id FROM silver.orders",
            "schemas": [{"table": "silver.orders", "columns": ["order_id"]}],
        }

    class Graph:
        def get_state(self, config):
            assert config["configurable"]["thread_id"] == "session-1"
            return Snapshot()

    monkeypatch.setattr(agent, "get_agent_graph", lambda: Graph())
    monkeypatch.setattr(
        "src.agent.tools.dag_generator.publish_pipeline_spec",
        lambda spec, *, confirmed: published.append((spec, confirmed)) or "s3://midas-governance/airflow-specs/dag_gold_daily_orders.yaml",
    )
    app = FastAPI()
    app.include_router(agent.router)
    client = TestClient(app)

    response = client.post(
        "/api/v1/agent/chat",
        json={"thread_id": "session-1", "message": "Materializa este reporte como tabla Gold diaria"},
    )

    assert response.status_code == 200
    assert response.json()["intent"] == "materialize_gold"
    assert published[0][0].transform_sql == "SELECT order_id FROM silver.orders"
    assert published[0][1] is True
