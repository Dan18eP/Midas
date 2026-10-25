"""Clasifica el primer mensaje de cada turno para cualquier dominio de datos."""

import re

from src.agent.state import AgentState


_DISCOVERY = re.compile(
    r"\b(hola|buenas|buenos días|buenos dias|buenas tardes|buenas noches|"
    r"qué puedo consultar|que puedo consultar|"
    r"qué datos tienes|que datos tienes|qué datos hay|que datos hay|"
    r"de qué son los datos|de que son los datos|de qué son|de que son|"
    r"de qué tratan los datos|de que tratan los datos|de qué tratan|de que tratan|de qué trata|de que trata|"
    r"cuáles son los datos|cuales son los datos|qué tablas hay|que tablas hay|"
    r"qué información tienes|que informacion tienes|qué fuentes hay|que fuentes hay|"
    r"qué puedo analizar|que puedo analizar|ayuda|help|info|fuentes)\b",
    re.IGNORECASE,
)
_SALES = re.compile(r"\b(ventas?|ingresos?|facturación)\b", re.IGNORECASE)
_YEAR = re.compile(r"\b(?:19|20)\d{2}\b")
_ALL_YEARS = re.compile(
    r"\b(todos los años|todos los anos|todos los periodos|todos los trimestres|todos|todo|histórico|historico|anual|global|total|cada año|por año)\b",
    re.IGNORECASE,
)
_GOLD_MATERIALIZATION = re.compile(
    r"\b(materializ|crear tabla gold|crea tabla gold|construir gold|guardar como tabla gold|generar capa gold|nueva tabla gold)\b",
    re.IGNORECASE,
)


def route_intent(state: AgentState) -> dict[str, object]:
    """Detecta intención y resuelve aclaraciones de turnos anteriores para cualquier dominio."""
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
        if _ALL_YEARS.search(message):
            query = state.get("pending_query", "").strip()
            return {
                "intent": "analytics",
                "needs_clarification": False,
                "user_message": f"{query} todos los años",
                "pending_intent": "",
                "pending_query": "",
            }
        return {"intent": "analytics", "needs_clarification": True}

    if _DISCOVERY.search(message):
        return {"intent": "discovery", "needs_clarification": False}

    if _GOLD_MATERIALIZATION.search(message):
        return {"intent": "materialize_gold", "needs_clarification": False}

    # Mantener compatibilidad con flujo dialógico de ventas cuando se consulta ventas de forma abstracta sin año
    if (
        _SALES.search(message)
        and not _YEAR.search(message)
        and not _ALL_YEARS.search(message)
        and not any(w in message.lower() for w in (" por ", "group", "agrup", "departamento", "categoria", "producto", "almacen"))
    ):
        return {
            "intent": "analytics",
            "needs_clarification": True,
            "pending_intent": "analytics",
            "pending_query": message,
        }

    return {"intent": "analytics", "needs_clarification": False}

