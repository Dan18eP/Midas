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
    """Genera sugerencias dinámicas basadas en las fuentes y tablas conectadas."""
    if not sources:
        return [
            "¿Cuáles son las ventas totales de 2026?",
            "Comparar presupuesto corporativo con ingresos reales",
            "Materializar este reporte como tabla Gold diaria",
        ]
    suggestions = []
    for source in sources:
        tables = source.get("tables", [])
        table_names = [t.get("table", t) if isinstance(t, dict) else str(t) for t in tables]
        for t in table_names:
            t_low = str(t).lower()
            if "transac" in t_low or "venta" in t_low:
                suggestions.append("¿Cuáles son las ventas totales por región en 2026?")
            elif "presupuesto" in t_low or "meta" in t_low or "costo" in t_low:
                suggestions.append("Comparar presupuesto corporativo con ingresos de 2026")
            elif "ticket" in t_low or "csat" in t_low:
                suggestions.append("Consultar satisfacción de soporte y tickets")
            elif "cliente" in t_low:
                suggestions.append("Ver clientes con mayores compras")

    seen = set()
    unique = [s for s in suggestions if not (s in seen or seen.add(s))]
    fallback_pool = [
        "¿Cuáles son las ventas totales de 2026?",
        "Comparar presupuesto corporativo con ingresos de 2026",
        "Materializar este reporte como tabla Gold diaria",
    ]
    for fb in fallback_pool:
        if len(unique) >= 3:
            break
        if fb not in seen:
            seen.add(fb)
            unique.append(fb)
    return unique[:3]


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
