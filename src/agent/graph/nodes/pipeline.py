"""Pasos analíticos que se conectan con el generador y Trino."""

import re
from collections.abc import Callable

from src.agent.state import AgentState


SqlGenerator = Callable[[str, list[dict[str, object]]], str]
QueryExecutor = Callable[[str], list[dict[str, object]]]
_FORBIDDEN = re.compile(r"\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b", re.I)
_SELECT = re.compile(r"^\s*(select|with)\b", re.I)
_LIMIT = re.compile(r"\blimit\s+\d+\b", re.I)


def make_analytic_nodes(
    generate_sql: SqlGenerator | None,
    execute_query: QueryExecutor | None,
) -> tuple[Callable[[AgentState], dict[str, object]], ...]:
    """Crea los pasos analíticos con los servicios disponibles."""
    def generate(state: AgentState) -> dict[str, object]:
        if generate_sql is None:
            return {"query_error": "El generador SQL no está configurado."}
        sql = generate_sql(state.get("user_message", ""), state.get("schemas", []))
        return {"sql": sql, "query_error": ""}

    def validate(state: AgentState) -> dict[str, object]:
        sql = state.get("sql", "").strip()
        if not sql or not _SELECT.match(sql) or _FORBIDDEN.search(sql) or ";" in sql:
            return {"query_error": state.get("query_error") or "La consulta fue bloqueada por seguridad."}
        if not _LIMIT.search(sql):
            sql = f"{sql.rstrip()} LIMIT 1000"
        return {"sql": sql, "query_error": ""}

    def execute(state: AgentState) -> dict[str, object]:
        if execute_query is None:
            return {"query_error": "El ejecutor Trino no está configurado."}
        try:
            return {"query_rows": execute_query(state["sql"]), "query_error": ""}
        except Exception:  # La conversación continúa sin mostrar datos internos.
            return {"query_error": "No pude ejecutar la consulta con Trino."}

    def synthesize(state: AgentState) -> dict[str, object]:
        error = state.get("query_error", "")
        if error:
            return {"response": error}
        rows = state.get("query_rows", [])
        return {"response": f"La consulta terminó. Encontré {len(rows)} filas."}

    return generate, validate, execute, synthesize
