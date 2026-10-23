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
            import inspect
            sig = inspect.signature(generate_sql)
            inf_mode = state.get("inference_mode", "cloud")
            if "inference_mode" in sig.parameters:
                sql = generate_sql(message, schemas, inference_mode=inf_mode)
            else:
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
            sql = state.get("sql", "")
            role = state.get("user_role") or "data_owner"
            import inspect
            sig = inspect.signature(execute_query)
            if "user_role" in sig.parameters or len(sig.parameters) >= 2:
                rows = execute_query(sql, user_role=role)
            else:
                rows = execute_query(sql)
            return {"query_rows": rows, "query_error": ""}
        except Exception as exc:  # La conversación continúa sin mostrar datos internos.
            return {"query_error": f"No pude ejecutar la consulta con Trino: {exc}"}

    def synthesize(state: AgentState) -> dict[str, object]:
        error = state.get("query_error", "")
        if error:
            response = error
            result = None
        else:
            rows = state.get("query_rows", [])
            result = synthesize_storytelling(rows)
            response = str(result["narrative"])
            role = state.get("user_role", "")
            if role in ("gerente_norte", "restricted_operator", "scoped_operator"):
                response += "\n\n> **Gobernanza Activa:** Cifra filtrada bajo políticas de Apache Ranger (RLS) para el alcance asignado."
            elif role in ("analista_externo", "compliance_auditor", "auditor"):
                response += "\n\n> **Gobernanza Activa:** Columnas identificadas con datos sensibles (PII) fueron enmascaradas bajo la directiva de privacidad."

        suggestions = [
            "Definir dimensiones y métricas para convertir este reporte en tabla Gold",
            "Modificar filtros o agrupaciones de la consulta",
            "Consultar fuentes y tablas conectadas",
        ]
        return {
            "response": response,
            "messages": [AIMessage(content=response)],
            "storytelling_result": result,
            "suggestions": suggestions,
        }

    return generate, validate, execute, synthesize
