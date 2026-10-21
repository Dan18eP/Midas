"""Clasifica el primer mensaje de cada turno."""

import re

from src.agent.state import AgentState


_GREETINGS = re.compile(
    r"\b(hola|buenas|buenos días|buenas tardes|buenas noches|qué puedo consultar|"
    r"que puedo consultar|qué datos tienes|que datos tienes|qué puedo analizar|"
    r"que puedo analizar)\b",
    re.IGNORECASE,
)
_SALES = re.compile(r"\b(ventas?|ingresos?|facturación)\b", re.IGNORECASE)
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")


def route_intent(state: AgentState) -> dict[str, object]:
    """Detecta intención y resuelve aclaraciones de turnos anteriores."""
    message = state.get("user_message", "").strip()

    if state.get("pending_intent") == "analytics":
        year = _YEAR.search(message)
        if year:
            query = state.get("pending_query", "").strip()
            return {
                "intent": "analytics",
                "needs_clarification": False,
                "user_message": f"{query} {year.group()}",
                "pending_intent": "",
                "pending_query": "",
            }
        return {"intent": "analytics", "needs_clarification": True}

    if _GREETINGS.search(message):
        return {"intent": "discovery", "needs_clarification": False}

    if _SALES.search(message) and not _YEAR.search(message):
        return {
            "intent": "analytics",
            "needs_clarification": True,
            "pending_intent": "analytics",
            "pending_query": message,
        }

    return {"intent": "analytics", "needs_clarification": False}
