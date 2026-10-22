"""Pruebas Automatizadas de Gobernanza Universal Dinamica y Conexion con el Agente Copilot.

Historia de Usuario: HU-GOV-03, HU-AI-01 & ADR-011
Autor: Daniel Echeverria (Backend & API Architect)
"""

import pytest
from starlette.testclient import TestClient

from src.api.main import app
from src.api.routes.auth import reset_roles_catalog
from src.security_governance.ranger.policy_store import clear_cache


@pytest.fixture(autouse=True)
def clean_roles():
    """Limpia el catalogo de roles dinámicos y la cache de politicas entre pruebas."""
    reset_roles_catalog()
    clear_cache()
    yield
    reset_roles_catalog()
    clear_cache()


def test_list_canonical_and_dynamic_roles():
    """Verifica que el catalogo liste los arquetipos canonicos y permita roles dinamicos."""
    client = TestClient(app)

    # 1. Listado inicial: exactamente los 3 roles por defecto
    res = client.get("/api/v1/auth/roles")
    assert res.status_code == 200
    roles = res.json()
    assert len(roles) == 3

    # Verificar presencia de campos de arquetipo
    director = next(r for r in roles if r["role_id"] == "director_general")
    assert director["archetype"] == "DATA_OWNER"

    gerente = next(r for r in roles if r["role_id"] == "gerente_norte")
    assert gerente["archetype"] == "RESTRICTED_OPERATOR"
    assert gerente["scope_column"] == "region"

    analista = next(r for r in roles if r["role_id"] == "analista_externo")
    assert analista["archetype"] == "COMPLIANCE_AUDITOR"

    # 2. Registrar un rol personalizado para una empresa de salud / logistica
    custom_payload = {
        "role_id": "operador_bogota",
        "title": "Operador Sede Bogota (Salud)",
        "description": "Acceso condicionado a la sede Bogota sin acoplamiento a retail",
        "archetype": "RESTRICTED_OPERATOR",
        "scope_column": "sede",
        "scope_value": "BOGOTA",
    }
    create_res = client.post("/api/v1/auth/roles", json=custom_payload)
    assert create_res.status_code == 201
    created_role = create_res.json()
    assert created_role["role_id"] == "operador_bogota"
    assert created_role["ranger_row_filter"] == "sede = 'BOGOTA'"

    # 3. Listar de nuevo: ahora incluye el rol personalizado
    res2 = client.get("/api/v1/auth/roles")
    assert res2.status_code == 200
    roles2 = res2.json()
    assert len(roles2) == 4
    assert any(r["role_id"] == "operador_bogota" for r in roles2)


def test_agent_chat_receives_role_and_reflects_governance():
    """Valida que el Copiloto reciba el rol del header X-User-Role y reporte gobernanza activa."""
    client = TestClient(app)

    # 1. Chat bajo rol de operador restringido
    headers_restricted = {"X-User-Role": "gerente_norte"}
    resp_restricted = client.post(
        "/api/v1/agent/chat",
        json={"message": "Hola, ¿cómo estás?", "thread_id": "session_test_gov_1"},
        headers=headers_restricted,
    )
    assert resp_restricted.status_code == 200
    assert resp_restricted.headers.get("X-User-Role") == "gerente_norte"

    # 2. Chat bajo rol de auditor de cumplimiento
    headers_auditor = {"X-User-Role": "analista_externo"}
    resp_auditor = client.post(
        "/api/v1/agent/chat",
        json={"message": "Hola, ¿cómo estás?", "thread_id": "session_test_gov_2"},
        headers=headers_auditor,
    )
    assert resp_auditor.status_code == 200
    assert resp_auditor.headers.get("X-User-Role") == "analista_externo"

    # 3. Chat bajo rol universal data_owner
    headers_owner = {"X-User-Role": "data_owner"}
    resp_owner = client.post(
        "/api/v1/agent/chat",
        json={"message": "Hola, ¿cómo estás?", "thread_id": "session_test_gov_3"},
        headers=headers_owner,
    )
    assert resp_owner.status_code == 200
    assert resp_owner.headers.get("X-User-Role") == "data_owner"
