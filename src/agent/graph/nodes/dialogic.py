"""Prepara preguntas y sugerencias para guiar al usuario."""

from collections.abc import Callable
from typing import Any

from langchain_core.messages import AIMessage

from src.agent.state import AgentState


DEMO_SOURCES = [
    {"name": "crm_operaciones", "kind": "PostgreSQL", "tables": ["clientes", "transacciones"]},
    {"name": "Presupuesto_Corporativo_2026.xlsx", "kind": "Excel", "tables": ["Presupuesto_Metas", "Costos_Operativos"]},
    {"name": "helpdesk_tickets_live", "kind": "API REST", "tables": ["tickets", "satisfacción CSAT"]},
]


def _generate_suggestions(sources: list[dict[str, Any]]) -> list[str]:
    """Genera sugerencias dinámicas basadas en las fuentes conectadas."""
    if not sources:
        return []
    suggestions = []
    for source in sources:
        name = source.get("name", "")
        tables = source.get("tables", [])
        table_names = [t.get("table", t) if isinstance(t, dict) else t for t in tables]
        if any("transac" in str(t).lower() or "venta" in str(t).lower() for t in table_names):
            suggestions.append(f"Explorar transacciones y ventas de {name}.")
        elif any("presupuesto" in str(t).lower() or "meta" in str(t).lower() for t in table_names):
            suggestions.append(f"Comparar ingresos reales con metas de {name}.")
        elif any("ticket" in str(t).lower() or "soporte" in str(t).lower() for t in table_names):
            suggestions.append(f"Revisar tiempos de respuesta y satisfacción de {name}.")
        elif any("cliente" in str(t).lower() for t in table_names):
            suggestions.append(f"Analizar segmentación de clientes en {name}.")
        else:
            suggestions.append(f"Explorar datos de {name}.")
    return suggestions[:3]


def make_introspector(
    source_provider: Callable[[], list[dict[str, Any]]] | None = None,
) -> Callable[[AgentState], dict[str, object]]:
    """Crea el paso que consulta las fuentes conectadas."""
    def introspect_schema(state: AgentState) -> dict[str, object]:
        sources = state.get("sources")
        if sources is None:
            sources = source_provider() if source_provider else DEMO_SOURCES
        schemas = []
        for source in sources:
            schemas.extend(source.get("schemas", []))
            for table in source.get("tables", []):
                if isinstance(table, dict) and table.get("columns"):
                    schemas.append({
                        "table": table.get("table") or table.get("name"),
                        "columns": table["columns"],
                    })
        return {"sources": sources, "schemas": schemas}

    return introspect_schema


def proactive_suggest(state: AgentState) -> dict[str, object]:
    """Ofrece opciones o pregunta lo que falta para continuar."""
    if state.get("needs_clarification"):
        question = "¿De qué año quieres consultar las ventas: 2024, 2025 o 2026?"
        return {
            "clarification": question,
            "response": question,
            "suggestions": [],
            "messages": [AIMessage(content=question)],
        }

    sources = state.get("sources", DEMO_SOURCES)
    suggestions = _generate_suggestions(sources)

    if state.get("intent") == "discovery":
        source_lines = []
        for source in sources:
            name = source.get("name", "")
            kind = source.get("kind", "Fuente")
            tables = source.get("tables", [])
            tbl_strs = []
            for t in tables:
                if isinstance(t, dict):
                    tbl_name = t.get("table") or t.get("name")
                    if tbl_name:
                        tbl_strs.append(str(tbl_name))
                elif isinstance(t, str):
                    tbl_strs.append(t)
            if tbl_strs:
                source_lines.append(f"- **{kind}** (`{name}`): {', '.join(tbl_strs[:3])}")
            else:
                source_lines.append(f"- **{kind}**: `{name}`")

        response = "Los datos disponibles en la plataforma corresponden a las siguientes fuentes analíticas:\n\n"
        response += "\n".join(source_lines)
        if suggestions:
            response += "\n\n¿Con cuál te gustaría empezar? También puedes seleccionar:\n"
            response += "\n".join(f"{index}. {item}" for index, item in enumerate(suggestions, 1))
        return {
            "suggestions": suggestions,
            "response": response,
            "messages": [AIMessage(content=response)],
        }

    return {"suggestions": suggestions}
