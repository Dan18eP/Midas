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
    """Genera sugerencias dinámicas basadas en los datos reales de las fuentes conectadas."""
    if not sources:
        return [
            "Consultar fuentes y tablas conectadas",
            "Definir dimensiones y métricas para reporte",
            "Personalizar tabla Gold",
        ]
    suggestions = []
    for source in sources:
        s_name = source.get("name", "Datos")
        tables = source.get("tables", [])
        for t in tables:
            t_name = t.get("table") or t.get("name") if isinstance(t, dict) else str(t)
            cols = t.get("columns", []) if isinstance(t, dict) else []

            # Identificar columnas numéricas y categóricas reales
            num_cols = [c for c in cols if any(k in str(c).lower() for k in ("monto", "precio", "valor", "total", "costo", "cantidad", "horas", "unitprice", "quantity", "stock", "neto"))]
            cat_cols = [c for c in cols if any(k in str(c).lower() for k in ("region", "ciudad", "área", "area", "proveedor", "producto", "categoria", "supplier", "warehouse", "cliente", "canal", "name"))]

            if num_cols and cat_cols:
                suggestions.append(f"Consultar {num_cols[0]} por {cat_cols[0]} en {s_name}")
            elif cat_cols:
                suggestions.append(f"Ver resumen por {cat_cols[0]} en {s_name}")
            elif num_cols:
                suggestions.append(f"Calcular total de {num_cols[0]} en {s_name}")
            elif t_name:
                clean_t = str(t_name).split(".")[-1]
                suggestions.append(f"Explorar registros de {clean_t}")

    # Ofrecer al usuario definir su tabla Gold personalizada
    suggestions.append("Definir dimensiones y métricas para tabla Gold personalizada")

    seen = set()
    unique = [s for s in suggestions if not (s in seen or seen.add(s))]
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
        years = state.get("available_years") or []
        if years:
            options = ", ".join(str(year) for year in years)
            question = (
                "¿De qué año quieres consultar las ventas? "
                f"Años disponibles en tus datos: {options}. "
                'También puedes escribir "todos".'
            )
        else:
            question = (
                "¿De qué año quieres consultar las ventas? "
                'Indica el año presente en tus datos o escribe "todos".'
            )
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

        response = (
            "Estas son las fuentes y conjuntos de datos reales conectados en tu sesión:\n\n"
            + "\n".join(source_lines)
            + "\n\n¿Qué dimensiones y métricas te gustaría explorar? "
            "Tú tienes el control total para decidir qué analizar o qué consolidar en tu capa Gold:\n"
        )
        if suggestions:
            response += "\n" + "\n".join(f"{index}. {item}" for index, item in enumerate(suggestions, 1))
        return {
            "suggestions": suggestions,
            "response": response,
            "messages": [AIMessage(content=response)],
        }

    return {"suggestions": suggestions}


def make_proactive_suggest(
    year_provider: Callable[[], list[int]] | None = None,
) -> Callable[[AgentState], dict[str, object]]:
    """Inyecta los años reales del catálogo antes de pedir una aclaración."""

    def node(state: AgentState) -> dict[str, object]:
        if year_provider is not None and state.get("needs_clarification"):
            enriched = dict(state)
            enriched["available_years"] = _available_years(year_provider)
            return proactive_suggest(enriched)
        return proactive_suggest(state)

    return node


def _available_years(year_provider: Callable[[], list[int]] | None) -> list[int]:
    """Obtiene años reales del catálogo, descartando valores fuera de rango."""
    if year_provider is None:
        return []
    try:
        raw_years = year_provider()
    except Exception:
        return []
    years = set()
    for value in raw_years or []:
        try:
            year = int(value)
        except (TypeError, ValueError):
            continue
        if 1900 <= year <= 2100:
            years.add(year)
    return sorted(years)

