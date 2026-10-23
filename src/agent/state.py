"""Estado que comparten los nodos del diálogo."""

from typing import Annotated, Any, TypedDict

from langgraph.graph.message import add_messages


class AgentState(TypedDict, total=False):
    """Datos guardados entre pasos y turnos de una conversación."""

    messages: Annotated[list[Any], add_messages]
    user_message: str
    pending_intent: str
    pending_query: str
    intent: str
    needs_clarification: bool
    clarification: str
    sources: list[dict[str, Any]]
    schemas: list[dict[str, Any]]
    available_years: list[int]
    suggestions: list[str]
    sql: str
    query_error: str
    query_rows: list[dict[str, Any]]
    storytelling_result: dict[str, Any] | None
    response: str
    user_role: str
