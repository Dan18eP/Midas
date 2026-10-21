"""Midas - Pruebas Automatizadas de Gateway de Linaje, Telemetría Histórica, Sesiones y Topología.

Historia de Usuario: HU-BACK-03 & ADR-010
Autor: Daniel Echeverría (Backend Lead)
"""

from typing import Generator
import pytest
from fastapi.testclient import TestClient

from src.api.main import app
from src.core.session.store import get_session_store, SessionStore
from src.core.session.title_generator import generate_session_title
from src.core.telemetry.hub import get_telemetry_hub
from src.core.telemetry.events import NodeStatus, TelemetryEvent


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch):
    """Limpia el almacén de sesiones y el hub de telemetría antes de cada prueba."""
    from src.agent.graph.nodes.dialogic import DEMO_SOURCES
    monkeypatch.setattr("src.agent.services.load_sources", lambda: DEMO_SOURCES)
    session_store = get_session_store()
    session_store.clear()
    telemetry_hub = get_telemetry_hub()
    telemetry_hub.clear()
    yield
    session_store.clear()
    telemetry_hub.clear()


@pytest.fixture
def client() -> Generator[TestClient, None, None]:
    """Provee un cliente de pruebas síncrono para FastAPI."""
    with TestClient(app) as test_client:
        yield test_client


# ==============================================================================
# 1. Pruebas del Gateway de Linaje Activo (Explain Number & KaTeX)
# ==============================================================================


def test_lineage_gold_fact_ventas_payload_contract(client: TestClient):
    """Verifica que GET /api/v1/lineage/table/{table} cumpla el contrato LineageGatewayPayload."""
    response = client.get("/api/v1/lineage/table/gold.fact_ventas")
    assert response.status_code == 200
    data = response.json()

    assert data["table"] == "gold.fact_ventas"
    assert "stages" in data
    assert len(data["stages"]) == 4

    layers = [stage["layer"] for stage in data["stages"]]
    assert layers == ["source", "bronze", "silver", "gold"]

    assert "formula" in data
    formula = data["formula"]
    assert formula["key"] == "venta_neta"
    assert r"\sum(\text{monto\_bruto}" in formula["latex"]
    assert "Diccionario Semántico" in formula["description"]

    assert "certification" in data
    cert = data["certification"]
    assert cert["quality_percent"] is None
    assert cert["last_sync"] is None
    assert "not been verified" in cert["quality_summary"]
    assert len(cert["audit_hash"]) == 64


def test_lineage_venta_bruta_and_clientes_resolutions(client: TestClient):
    """Verifica la resolución contextual de fórmulas para venta bruta y clientes."""
    res_bruta = client.get("/api/v1/lineage/table/gold.fact_ventas_bruta")
    assert res_bruta.status_code == 200
    data_bruta = res_bruta.json()
    assert data_bruta["formula"]["key"] == "venta_bruta"
    assert "cantidad" in data_bruta["formula"]["latex"]

    res_cli = client.get("/api/v1/lineage/table/gold.dim_clientes")
    assert res_cli.status_code == 200
    data_cli = res_cli.json()
    stages_tables = [s["table"] for s in data_cli["stages"]]
    assert any("clientes" in t for t in stages_tables)


def test_lineage_fallback_for_arbitrary_table(client: TestClient):
    """Verifica que una tabla no registrada reciba fallback resiliente con 4 capas y hash válido."""
    res_custom = client.get("/api/v1/lineage/table/analytics.reporte_personalizado")
    assert res_custom.status_code == 200
    data = res_custom.json()
    assert data["table"] == "analytics.reporte_personalizado"
    assert len(data["stages"]) == 4
    assert len(data["certification"]["audit_hash"]) == 64


# ==============================================================================
# 2. Pruebas de Telemetría Histórica (Time-Travel Scrubber)
# ==============================================================================


def test_telemetry_history_default_window_and_hydration(client: TestClient):
    """Verifica que GET /api/v1/telemetry/history retorne estructura válida para el scrubber."""
    response = client.get("/api/v1/telemetry/history?window=24h")
    assert response.status_code == 200
    data = response.json()

    assert data["window"] == "24h"
    assert data["total_events"] == 0
    assert isinstance(data["events"], list)
    assert isinstance(data["nodes_summary"], dict)
    assert "retrieved_at" in data

    nodes = data["nodes_summary"]
    assert nodes == {}


def test_telemetry_history_filtering_and_alerts(client: TestClient):
    """Verifica el filtrado por nodo y el conteo de alertas activas ante anomalías."""
    hub = get_telemetry_hub()
    hub.publish_sync(
        TelemetryEvent(
            event_id="evt_test_degraded",
            pipeline_id="pipe_test",
            node_id="silver_cleansing",
            status=NodeStatus.DEGRADED,
            records_in=1000,
            records_out=900,
            latency_ms=120.0,
            details={"error": "F3 negative amounts detected"},
        )
    )

    response = client.get("/api/v1/telemetry/history?node_id=silver_cleansing")
    assert response.status_code == 200
    data = response.json()

    assert data["active_alerts_count"] >= 1
    assert data["nodes_summary"]["silver_cleansing"]["status"] == "DEGRADED"


# ==============================================================================
# 3. Pruebas de Sesiones Conversacionales (CRUD, Persistencia y Topología)
# ==============================================================================


def test_sessions_lifecycle_crud(client: TestClient):
    """Verifica el ciclo de vida completo de una sesión (Crear, Listar, Detallar, Mensajes, Eliminar)."""
    # 1. Crear sesión
    create_res = client.post(
        "/api/v1/sessions",
        json={"title": "Auditoría Financiera Q4", "user_id": "user_director"},
    )
    assert create_res.status_code == 201
    created = create_res.json()
    session_id = created["session_id"]
    assert session_id.startswith("sess_")
    assert created["title"] == "Auditoría Financiera Q4"
    assert created["message_count"] == 0

    # 2. Listar sesiones
    list_res = client.get("/api/v1/sessions")
    assert list_res.status_code == 200
    sessions = list_res.json()
    assert any(s["session_id"] == session_id for s in sessions)

    # 3. Agregar mensaje de usuario
    msg_user_res = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"sender": "user", "content": "¿Cuál es la venta neta en la región Andina?"},
    )
    assert msg_user_res.status_code == 201
    msg_user = msg_user_res.json()
    assert msg_user["sender"] == "user"
    assert msg_user["session_id"] == session_id

    # 4. Agregar mensaje de asistente con metadata
    msg_ast_res = client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={
            "sender": "assistant",
            "content": "La venta neta en Andina es $1,350,000 COP.",
            "metadata": {"sql": "SELECT SUM(total_neto) FROM silver.pedidos", "intent": "sql_query"},
        },
    )
    assert msg_ast_res.status_code == 201

    # 5. Consultar detalle de sesión con mensajes y topología inicial
    detail_res = client.get(f"/api/v1/sessions/{session_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()
    assert len(detail["messages"]) == 2
    assert detail["messages"][0]["sender"] == "user"
    assert detail["messages"][1]["sender"] == "assistant"
    assert detail["messages"][1]["metadata"]["intent"] == "sql_query"
    assert "topology_state" in detail

    # 6. Eliminar sesión
    del_res = client.delete(f"/api/v1/sessions/{session_id}")
    assert del_res.status_code == 200
    assert del_res.json()["status"] == "deleted"

    # 7. Verificar 404 en sesión eliminada
    not_found_res = client.get(f"/api/v1/sessions/{session_id}")
    assert not_found_res.status_code == 404


def test_session_topology_update_and_retrieval(client: TestClient):
    """Verifica que PUT /api/v1/sessions/{id}/topology actualice y preserve el grafo del Canvas."""
    create_res = client.post("/api/v1/sessions", json={"title": "Sesión Canvas Dinámico"})
    assert create_res.status_code == 201
    session_id = create_res.json()["session_id"]

    mock_topology = {
        "nodes": [
            {"id": "source_excel_custom", "type": "source", "position": {"x": 100, "y": 150}},
            {"id": "bronze_raw", "type": "stage", "position": {"x": 400, "y": 150}},
        ],
        "edges": [
            {"id": "e_excel_bronze", "source": "source_excel_custom", "target": "bronze_raw"},
        ],
    }

    # Actualizar topología
    update_res = client.put(
        f"/api/v1/sessions/{session_id}/topology",
        json={"topology_state": mock_topology},
    )
    assert update_res.status_code == 200
    updated_data = update_res.json()
    assert updated_data["topology_state"] == mock_topology

    # Recuperar detalle de sesión y validar persistencia de la topología
    detail_res = client.get(f"/api/v1/sessions/{session_id}")
    assert detail_res.status_code == 200
    assert detail_res.json()["topology_state"] == mock_topology

    # 404 para sesión inexistente
    bad_res = client.put(
        "/api/v1/sessions/sess_no_existe/topology",
        json={"topology_state": mock_topology},
    )
    assert bad_res.status_code == 404


def test_session_intelligent_title_generation(client: TestClient):
    """Verifica la generación de títulos ejecutivos de 3 a 5 palabras en el primer turno."""
    create_res = client.post("/api/v1/sessions", json={})
    assert create_res.status_code == 201
    session_id = create_res.json()["session_id"]
    assert create_res.json()["title"] == "Nueva Conversación"

    # Enviar primer mensaje con muletillas de usuario
    client.post(
        f"/api/v1/sessions/{session_id}/messages",
        json={"sender": "user", "content": "Hola por favor muéstrame las ventas de la región Andina para el cierre"},
    )

    detail_res = client.get(f"/api/v1/sessions/{session_id}")
    assert detail_res.status_code == 200
    title = detail_res.json()["title"]
    assert title != "Nueva Conversación"
    # Debe tener entre 2 y 6 palabras ejecutivas
    words = title.split()
    assert 2 <= len(words) <= 6


def test_session_store_postgres_resilience():
    """A configured database outage must not silently become volatile storage."""
    with pytest.raises(RuntimeError, match="database is unavailable"):
        SessionStore(db_url="postgresql://usuario:invalido@127.0.0.1:59999/midas_fake")


def test_sessions_error_handling_not_found(client: TestClient):
    """Verifica respuestas 404 al operar con identificadores inexistentes."""
    res_get = client.get("/api/v1/sessions/sess_inexistente_999")
    assert res_get.status_code == 404

    res_msg = client.post(
        "/api/v1/sessions/sess_inexistente_999/messages",
        json={"sender": "user", "content": "Hola"},
    )
    assert res_msg.status_code == 404

    res_del = client.delete("/api/v1/sessions/sess_inexistente_999")
    assert res_del.status_code == 404


# ==============================================================================
# 4. Prueba de Integración: Chat con Agente Persiste en Sesión
# ==============================================================================


def test_agent_chat_auto_persists_in_active_session(client: TestClient):
    """Verifica que interactuar con /api/v1/agent/chat guarde ambos turnos en la sesión activa."""
    create_res = client.post("/api/v1/sessions", json={"title": "Sesión Copiloto Test"})
    assert create_res.status_code == 201
    session_id = create_res.json()["session_id"]

    chat_res = client.post(
        "/api/v1/agent/chat",
        json={"thread_id": session_id, "message": "Hola, qué métricas puedes mostrarme?"},
    )
    assert chat_res.status_code == 200
    chat_data = chat_res.json()
    assert chat_data["thread_id"] == session_id

    detail_res = client.get(f"/api/v1/sessions/{session_id}")
    assert detail_res.status_code == 200
    detail = detail_res.json()

    assert len(detail["messages"]) >= 2
    user_msg = next((m for m in detail["messages"] if m["sender"] == "user"), None)
    ast_msg = next((m for m in detail["messages"] if m["sender"] == "assistant"), None)

    assert user_msg is not None
    assert "Hola" in user_msg["content"]
    assert ast_msg is not None
    assert len(ast_msg["content"]) > 0
