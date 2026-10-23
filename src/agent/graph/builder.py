"""Construye el grafo de conversación con memoria PostgreSQL."""

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from langchain_core.messages import HumanMessage
from langgraph.checkpoint.base import BaseCheckpointSaver
from langgraph.checkpoint.postgres import PostgresSaver
from langgraph.graph import END, START, StateGraph

from src.agent.graph.nodes.dialogic import make_introspector, proactive_suggest
from src.agent.graph.nodes.pipeline import QueryExecutor, SqlGenerator, make_analytic_nodes
from src.agent.graph.nodes.router import route_intent
from src.agent.state import AgentState
from src.agent.tools.text_to_sql import TextToSqlGenerator
from src.agent.models.model_router import ModelRouter


@contextmanager
def postgres_checkpointer(database_url: str) -> Iterator[PostgresSaver]:
    """Abre el guardado de sesiones y prepara sus tablas."""
    with PostgresSaver.from_conn_string(database_url) as checkpointer:
        checkpointer.setup()
        yield checkpointer


def build_graph(
    checkpointer: BaseCheckpointSaver,
    *,
    generate_sql: SqlGenerator | None = None,
    execute_query: QueryExecutor | None = None,
    source_provider=None,
):
    """Compila el diálogo y guarda cada turno bajo su thread_id."""
    if generate_sql is None:
        generate_sql = TextToSqlGenerator(ModelRouter())
    generate, validate, execute, synthesize = make_analytic_nodes(generate_sql, execute_query)
    graph = StateGraph(AgentState)
    graph.add_node("route_intent", route_intent)
    graph.add_node("introspect_schema", make_introspector(source_provider))
    graph.add_node("proactive_suggest", proactive_suggest)
    graph.add_node("generate_sql", generate)
    graph.add_node("validate_guardrails", validate)
    graph.add_node("execute_query", execute)
    graph.add_node("synthesize_storytelling", synthesize)

    graph.add_edge(START, "route_intent")
    graph.add_edge("route_intent", "introspect_schema")
    graph.add_edge("introspect_schema", "proactive_suggest")
    graph.add_conditional_edges(
        "proactive_suggest",
        lambda state: "finish" if state.get("intent") == "discovery" or state.get("needs_clarification") else "analyze",
        {"finish": END, "analyze": "generate_sql"},
    )
    graph.add_edge("generate_sql", "validate_guardrails")
    graph.add_conditional_edges(
        "validate_guardrails",
        lambda state: "reject" if state.get("query_error") else "execute",
        {"reject": "synthesize_storytelling", "execute": "execute_query"},
    )
    graph.add_edge("execute_query", "synthesize_storytelling")
    graph.add_edge("synthesize_storytelling", END)
    return graph.compile(checkpointer=checkpointer)


def invoke_turn(
    graph: Any,
    thread_id: str,
    user_message: str,
    user_role: str = "director_general",
    inference_mode: str = "cloud",
) -> AgentState:
    """Envía un turno y lo guarda en la sesión indicada con su rol Zero-Trust."""
    if not thread_id.strip():
        raise ValueError("thread_id no puede estar vacío.")
    if not user_message.strip():
        raise ValueError("El mensaje no puede estar vacío.")
    return graph.invoke(
        {
            "messages": [HumanMessage(content=user_message)],
            "user_message": user_message,
            "user_role": user_role,
            "inference_mode": inference_mode,
        },
        {"configurable": {"thread_id": thread_id}},
    )
