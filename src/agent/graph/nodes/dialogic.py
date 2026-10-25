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

            # Identificar columnas numéricas y categóricas reales para cualquier materia (RRHH, Salud, Logística, Finanzas, Ventas, etc.)
            num_cols = [
                c for c in cols
                if any(k in str(c).lower() for k in (
                    "monto", "precio", "valor", "total", "costo", "cantidad", "horas",
                    "unitprice", "quantity", "stock", "neto", "salario", "sueldo",
                    "edad", "duracion", "peso", "temperatura", "puntuacion", "rating",
                    "score", "tickets", "registros"
                ))
            ]
            cat_cols = [
                c for c in cols
                if any(k in str(c).lower() for k in (
                    "region", "ciudad", "área", "area", "proveedor", "producto", "categoria",
                    "supplier", "warehouse", "cliente", "canal", "name", "nombre",
                    "departamento", "cargo", "puesto", "estado", "sede", "tipo",
                    "diagnostico", "especialidad", "paciente", "curso", "carrier"
                ))
            ]

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
            all_sources = source_provider() if source_provider else DEMO_SOURCES
            active_cid = state.get("connection_id")
            if active_cid:
                # Filtrar estrictamente a la conexión de esta sesión para aislamiento 1:1
                active_cid_clean = str(active_cid).lower().replace("conn_", "")
                filtered = [
                    s for s in all_sources
                    if str(s.get("connection_id", "")).lower() == str(active_cid).lower()
                    or active_cid_clean in str(s.get("connection_id", "")).lower()
                    or any(active_cid_clean in str(t.get("table", "")).lower() for t in s.get("tables", []) if isinstance(t, dict))
                ]
                gold_sources = [
                    s for s in all_sources
                    if s.get("kind") == "Iceberg" and any("gold." in str(t.get("table", "")).lower() for t in s.get("tables", []) if isinstance(t, dict))
                ]
                sources = filtered if filtered else all_sources
                if filtered and gold_sources:
                    sources = filtered + gold_sources
            else:
                sources = all_sources
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
    """Ofrece opciones o pregunta lo que falta para continuar adaptado a cualquier dominio."""
    if state.get("needs_clarification"):
        pending = str(state.get("pending_query") or state.get("user_message") or "").lower()
        if any(k in pending for k in ("venta", "ingreso", "facturaci")):
            question = "¿De qué año quieres consultar las ventas: 2024, 2025 o 2026?"
        else:
            question = "¿Podrías indicar la dimensión de agrupación o el período que deseas analizar en tus datos?"
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
