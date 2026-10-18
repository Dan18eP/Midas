"""Pruebas del diálogo proactivo y la memoria por sesión."""

from langgraph.checkpoint.memory import InMemorySaver

from src.agent.graph.builder import build_graph, invoke_turn


def test_greeting_lists_sources_and_three_suggestions():
    graph = build_graph(InMemorySaver())

    result = invoke_turn(graph, "session-1", "Hola, ¿qué puedo consultar?")

    assert "PostgreSQL" in result["response"]
    assert "Excel" in result["response"]
    assert "API REST" in result["response"]
    assert len(result["suggestions"]) == 3


def test_sales_without_year_asks_for_options_before_sql():
    graph = build_graph(InMemorySaver(), generate_sql=lambda *_: "SELECT 1")

    result = invoke_turn(graph, "session-1", "Quiero ver las ventas")

    assert "2024, 2025 o 2026" in result["response"]
    assert "sql" not in result


def test_analytic_request_runs_sql_guardrails_and_query():
    seen_queries = []
    graph = build_graph(
        InMemorySaver(),
        generate_sql=lambda *_: "SELECT region FROM silver.crm_transacciones",
        execute_query=lambda sql: seen_queries.append(sql) or [{"region": "Norte"}],
    )

    result = invoke_turn(graph, "session-1", "Compara ingresos para 2026")

    assert seen_queries == ["SELECT region FROM silver.crm_transacciones LIMIT 1000"]
    assert "1 filas" in result["response"]


def test_session_memory_is_isolated_by_thread_id():
    graph = build_graph(InMemorySaver())

    first = invoke_turn(graph, "session-1", "Hola")
    second = invoke_turn(graph, "session-1", "¿Qué datos tienes?")
    separate = invoke_turn(graph, "session-2", "Hola")

    assert len(first["messages"]) == 1
    assert len(second["messages"]) == 2
    assert len(separate["messages"]) == 1


def test_active_source_provider_replaces_demo_catalog():
    graph = build_graph(
        InMemorySaver(),
        source_provider=lambda: [{"name": "crm_live", "kind": "PostgreSQL", "tables": ["transacciones"]}],
    )

    result = invoke_turn(graph, "session-1", "Hola")

    assert "crm_live" in result["response"]
    assert "Presupuesto_Corporativo_2026.xlsx" not in result["response"]


def test_guardrails_reject_mutations():
    graph = build_graph(
        InMemorySaver(),
        generate_sql=lambda *_: "DELETE FROM silver.crm_transacciones",
        execute_query=lambda _: (_ for _ in ()).throw(AssertionError("query should be blocked")),
    )

    result = invoke_turn(graph, "session-1", "Elimina ventas de 2026")

    assert "bloqueada por seguridad" in result["response"]
