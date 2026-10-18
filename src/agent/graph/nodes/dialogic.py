"""Prepara preguntas y sugerencias para guiar al usuario."""

from collections.abc import Callable
from typing import Any

from src.agent.state import AgentState


DEMO_SOURCES = [
    {"name": "crm_operaciones", "kind": "PostgreSQL", "tables": ["clientes", "transacciones"]},
    {"name": "Presupuesto_Corporativo_2026.xlsx", "kind": "Excel", "tables": ["Presupuesto_Metas", "Costos_Operativos"]},
    {"name": "helpdesk_tickets_live", "kind": "API REST", "tables": ["tickets", "satisfacción CSAT"]},
]

SUGGESTIONS = [
    "Explorar clientes y transacciones del CRM.",
    "Comparar ingresos reales con las metas del presupuesto.",
    "Revisar tiempos de respuesta y satisfacción de soporte.",
]


def make_introspector(
    source_provider: Callable[[], list[dict[str, Any]]] | None = None,
) -> Callable[[AgentState], dict[str, object]]:
    """Crea el paso que consulta las fuentes conectadas."""
    def introspect_schema(state: AgentState) -> dict[str, object]:
        sources = state.get("sources")
        if sources is None:
            sources = source_provider() if source_provider else DEMO_SOURCES
        schemas = [
            {"source": source["name"], "tables": source["tables"]}
            for source in sources
        ]
        return {"sources": sources, "schemas": schemas}

    return introspect_schema


def proactive_suggest(state: AgentState) -> dict[str, object]:
    """Ofrece opciones o pregunta lo que falta para continuar."""
    if state.get("needs_clarification"):
        question = "¿De qué año quieres consultar las ventas: 2024, 2025 o 2026?"
        return {"clarification": question, "response": question, "suggestions": []}

    suggestions = list(SUGGESTIONS)
    if state.get("intent") == "discovery":
        sources = state.get("sources", DEMO_SOURCES)
        source_lines = [
            f"- {source['kind']}: {source['name']}"
            for source in sources
        ]
        response = "Puedo ayudarte a explorar estas fuentes:\n"
        response += "\n".join(source_lines)
        response += "\n\n¿Con cuál empezamos? También puedes elegir:\n"
        response += "\n".join(f"{index}. {item}" for index, item in enumerate(suggestions, 1))
        return {"suggestions": suggestions, "response": response}

    return {"suggestions": suggestions}
