"""Pasos analíticos que se conectan con el generador y Trino."""

from collections.abc import Callable

from langchain_core.messages import AIMessage

from src.agent.guardrails.prompt_injection_shield import PromptInjectionError, assert_safe_prompt
from src.agent.guardrails.query_guardrail import QueryValidationError, validate_query
from src.agent.state import AgentState
from src.agent.storytelling import synthesize_storytelling


SqlGenerator = Callable[[str, list[dict[str, object]]], str]
QueryExecutor = Callable[[str], list[dict[str, object]]]
def make_analytic_nodes(
    generate_sql: SqlGenerator | None,
    execute_query: QueryExecutor | None,
) -> tuple[Callable[[AgentState], dict[str, object]], ...]:
    """Crea los pasos analíticos con los servicios disponibles."""
    def generate(state: AgentState) -> dict[str, object]:
        if generate_sql is None:
            return {"query_error": "El generador SQL no está configurado."}
        schemas = state.get("schemas", [])
        if not any(
            isinstance(entry, dict)
            and isinstance(entry.get("table"), str)
            and bool(entry.get("columns"))
            for entry in schemas
        ):
            return {"query_error": "El catálogo de Trino no está disponible."}
        try:
            message = state.get("user_message", "")
            # Detiene los intentos de anular las reglas antes de llamar al modelo.
            assert_safe_prompt(message)
            sql = generate_sql(message, schemas)
        except PromptInjectionError as error:
            return {"query_error": str(error)}
        except Exception:
            return {"query_error": "No pude generar una consulta segura."}
        return {"sql": sql, "query_error": ""}

    def validate(state: AgentState) -> dict[str, object]:
        if state.get("query_error"):
            return {"query_error": state["query_error"]}
        try:
            sql = validate_query(state.get("sql", ""), state.get("schemas", []))
        except QueryValidationError:
            return {"query_error": "La consulta fue bloqueada por seguridad."}
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
            response = error
            result = None
        else:
            rows = state.get("query_rows", [])
            result = synthesize_storytelling(rows)
            response = str(result["narrative"])
        return {
            "response": response,
            "messages": [AIMessage(content=response)],
            "storytelling_result": result,
        }

    return generate, validate, execute, synthesize
