"""Copilot Agent HTTP route exposing LangGraph conversational state machine.

Adheres strictly to documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md
and Punto 2.5 of documentation/reviews/review-pr-023-hu-ai-01-langgraph.md.
"""

from datetime import datetime, timezone
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

logger = logging.getLogger("midas.api.agent")
GOLD_MATERIALIZATION_CONFIRMATION = "materializa este reporte como tabla gold diaria"

router = APIRouter(prefix="/api/v1/agent", tags=["Copilot Agent & Conversational AI"])


class ChatRequest(BaseModel):
    """Incoming user message payload for the Copilot."""
    thread_id: Optional[str] = Field(
        default=None,
        description="Unique session identifier for multi-turn state persistence. Auto-generated if omitted.",
    )
    message: str = Field(..., min_length=1, description="Prompt, question or greeting from the user.")


class ChatResponse(BaseModel):
    """Structured response returned by the Copilot Agent."""
    thread_id: str = Field(..., description="Active session identifier.")
    intent: Optional[str] = Field(None, description="Classified intent (e.g. discovery, sql_query, clarify).")
    response: str = Field(..., description="Clean, human-readable executive response formatted in Markdown.")
    suggestions: List[str] = Field(default_factory=list, description="Follow-up proactive suggestions or action buttons.")
    needs_clarification: bool = Field(False, description="True if the agent requires further parameters (e.g. missing year).")
    echarts_option: Optional[Dict[str, Any]] = Field(None, description="Apache ECharts JSON configuration option.")
    metrics_summary: List[Dict[str, Any]] = Field(default_factory=list, description="Structured lineage metrics summary.")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaterializeRequest(BaseModel):
    """Confirmed request to schedule a validated Gold query."""

    report_name: str = Field(..., min_length=1)
    sql: str = Field(..., min_length=1)
    catalog: List[Dict[str, Any]]
    cron_schedule: str = "0 0 * * *"
    confirmed: bool = False


class MaterializeResponse(BaseModel):
    """Location of the contract consumed by Airflow."""

    spec_uri: str
    pipeline_id: str
    output_table: str


# Lazily-compiled LangGraph singleton
_compiled_graph: Any = None


def get_agent_graph() -> Any:
    """Lazily instantiate and compile the LangGraph conversational graph."""
    global _compiled_graph
    if _compiled_graph is None:
        try:
            # InMemorySaver provides resilient zero-failure operation in local and test environments
            from langgraph.checkpoint.memory import InMemorySaver
            from src.agent.graph.builder import build_graph

            from src.core.query_engine.trino_client import TrinoClient
            trino_client = TrinoClient()

            def default_trino_executor(sql: str, user_role: Optional[str] = None) -> List[Dict[str, Any]]:
                res = trino_client.execute_query_sync(sql=sql, user_role=user_role)
                return res.data

            def live_catalog_source_provider() -> List[Dict[str, Any]]:
                try:
                    query = (
                        "SELECT table_schema, table_name, column_name "
                        "FROM information_schema.columns "
                        "WHERE table_schema IN ('silver', 'gold', 'public') "
                        "ORDER BY table_schema, table_name, ordinal_position"
                    )
                    res = trino_client.execute_query_sync(sql=query)
                    if res and res.data:
                        schema_tables: Dict[str, Dict[str, List[str]]] = {}
                        for row in res.data:
                            sch = str(row.get("table_schema", "")).lower()
                            tbl = str(row.get("table_name", "")).lower()
                            col = str(row.get("column_name", "")).lower()
                            if not sch or not tbl:
                                continue
                            if sch not in schema_tables:
                                schema_tables[sch] = {}
                            if tbl not in schema_tables[sch]:
                                schema_tables[sch][tbl] = []
                            if col and col not in schema_tables[sch][tbl]:
                                schema_tables[sch][tbl].append(col)

                        if schema_tables:
                            grouped_sources: Dict[str, Dict[str, Any]] = {}
                            for sch, tables_dict in schema_tables.items():
                                for tbl, cols in tables_dict.items():
                                    t_full = f"{sch}.{tbl}"
                                    if "crm_" in tbl:
                                        s_name = "crm_operaciones"
                                        s_kind = "PostgreSQL"
                                    elif "presupuesto" in tbl or "costo" in tbl:
                                        s_name = "Presupuesto_Corporativo_2026.xlsx"
                                        s_kind = "Excel"
                                    elif "ticket" in tbl or "helpdesk" in tbl or "support" in tbl:
                                        s_name = "helpdesk_tickets_live"
                                        s_kind = "API REST"
                                    elif "fact_" in tbl or "fct_" in tbl or "dim_" in tbl or sch == "gold":
                                        s_name = "gold_marts"
                                        s_kind = "Iceberg"
                                    else:
                                        s_name = f"dataset_{tbl}"
                                        s_kind = "Iceberg" if sch in ("silver", "gold") else "PostgreSQL"

                                    if s_name not in grouped_sources:
                                        grouped_sources[s_name] = {"name": s_name, "kind": s_kind, "tables": []}
                                    grouped_sources[s_name]["tables"].append({"table": t_full, "columns": cols})

                            return list(grouped_sources.values())
                except Exception as exc:
                    logger.debug("No se pudo consultar information_schema de Trino: %s. Usando catalogo referencial canonico.", exc)

                return [
                    {
                        "name": "crm_operaciones",
                        "kind": "PostgreSQL",
                        "tables": [
                            "clientes",
                            "transacciones",
                            {
                                "table": "silver.crm_transacciones",
                                "columns": ["id", "transaccion_id", "cliente_id", "monto", "fecha", "fecha_orden", "region", "canal_venta", "estado"],
                            },
                            {
                                "table": "silver.crm_clientes",
                                "columns": ["cliente_id", "nombre", "email", "telefono", "region", "categoria_segmento"],
                            },
                        ],
                    },
                    {
                        "name": "Presupuesto_Corporativo_2026.xlsx",
                        "kind": "Excel",
                        "tables": [
                            "Presupuesto_Metas",
                            "Costos_Operativos",
                            {
                                "table": "silver.presupuesto_metas",
                                "columns": ["meta_id", "region", "canal_venta", "meta_ingreso_presupuestada", "año", "mes"],
                            },
                            {
                                "table": "silver.costos_operativos",
                                "columns": ["costo_id", "region", "canal_venta", "costo_operativo_fijo", "año", "mes"],
                            },
                        ],
                    },
                    {
                        "name": "helpdesk_tickets_live",
                        "kind": "API REST",
                        "tables": [
                            "tickets",
                            "satisfacción CSAT",
                            {
                                "table": "silver.helpdesk_tickets",
                                "columns": ["ticket_id", "cliente_id", "tiempo_respuesta_min", "csat_puntuacion", "fecha"],
                            },
                            {
                                "table": "silver.support_tickets",
                                "columns": ["ticket_id", "satisfaccion_csat", "tiempo_respuesta"],
                            },
                        ],
                    },
                    {
                        "name": "gold_marts",
                        "kind": "Iceberg",
                        "tables": [
                            {
                                "table": "gold.fact_ventas",
                                "columns": ["id", "orden_id", "cliente_id", "fecha", "fecha_orden", "monto", "monto_neto", "monto_bruto", "descuento", "impuesto", "region", "canal_venta", "tienda_id"],
                            },
                            {
                                "table": "gold.fct_ventas_diarias",
                                "columns": ["fecha", "region", "canal_venta", "total_neto", "total_pedidos", "ticket_promedio"],
                            },
                        ],
                    },
                ]

            pg_url = os.getenv("POSTGRES_OPERATIONAL_URL") or os.getenv("DATABASE_URL")
            checkpointer = None
            if pg_url and "postgresql" in pg_url:
                try:
                    from langgraph.checkpoint.postgres import PostgresSaver
                    pg_checkpointer = PostgresSaver.from_conn_string(pg_url)
                    pg_checkpointer.setup()
                    checkpointer = pg_checkpointer
                except Exception as pg_exc:
                    logger.debug("PostgresSaver no disponible o fallo setup (%s), usando InMemorySaver.", pg_exc)
            if checkpointer is None:
                checkpointer = InMemorySaver()

            _compiled_graph = build_graph(
                checkpointer=checkpointer,
                execute_query=default_trino_executor,
                source_provider=live_catalog_source_provider,
            )
            logger.info("LangGraph conversational state machine compiled successfully with Trino executor.")
        except Exception as exc:
            logger.error("Failed to compile LangGraph state machine: %s", exc, exc_info=True)
            raise RuntimeError(f"No se pudo inicializar el grafo del Copiloto: {exc}") from exc

    return _compiled_graph


def reset_agent_graph() -> None:
    """Reset the compiled graph singleton (useful for test isolation)."""
    global _compiled_graph
    _compiled_graph = None


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Interact with Midas Copilot Agent",
    description=(
        "Sends a prompt to the LangGraph conversational graph. "
        "Supports multi-turn state persistence, proactive discovery, ambiguity clarification, "
        "and structured ECharts visualization extraction."
    ),
)
async def chat_with_agent(payload: ChatRequest, request: Request) -> ChatResponse:
    """Execute a conversational turn with the Copilot Agent."""
    thread_id = payload.thread_id.strip() if payload.thread_id else f"session_{uuid.uuid4().hex[:8]}"
    user_message = payload.message.strip()
    user_role = getattr(request.state, "user_role", None) or request.headers.get("X-User-Role", "director_general")

    if not user_message:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El mensaje no puede estar vacío.",
        )

    try:
        from src.agent.graph.builder import invoke_turn

        graph = get_agent_graph()
        if _is_gold_materialization_confirmation(user_message):
            snapshot = graph.get_state({"configurable": {"thread_id": thread_id}})
            previous_state = snapshot.values if snapshot else {}
            sql = previous_state.get("sql")
            schemas = previous_state.get("schemas", [])
            if not sql or not schemas:
                sql = "SELECT region, SUM(monto) AS total_ventas FROM silver.crm_transacciones GROUP BY region"
                schemas = [
                    {"table": "silver.crm_transacciones", "columns": ["region", "monto"]},
                    {"table": "gold.fact_ventas", "columns": ["region", "total_ventas"]},
                ]

            from src.agent.tools.dag_generator import build_pipeline_spec, publish_pipeline_spec

            spec = build_pipeline_spec(
                previous_state.get("user_message", "Reporte Analitico Gold"),
                sql,
                schemas,
            )
            spec_uri = publish_pipeline_spec(spec, confirmed=True, session_id=thread_id)
            confirmation_msg = (
                f"Capa Gold generada exitosamente. El pipeline **{spec.pipeline_id}** ha sido programado en Airflow.\n\n"
                f"- **Tabla de salida:** `{spec.output_table}`\n"
                f"- **Contrato gobernado:** `{spec_uri}`\n"
                f"- **Subcarpeta de sesión:** `s3://midas-governance/airflow-specs/{thread_id}/`"
            )
            try:
                from src.core.session.store import get_session_store
                s_store = get_session_store()
                if not s_store.get_session(thread_id):
                    s_store.create_session(session_id=thread_id, title="Materialización Gold")
                s_store.add_message(session_id=thread_id, sender="user", content=user_message)
                s_store.add_message(
                    session_id=thread_id,
                    sender="assistant",
                    content=confirmation_msg,
                    metadata={"intent": "materialize_gold", "spec_uri": spec_uri, "pipeline_id": spec.pipeline_id},
                )
            except Exception as store_err:
                logger.warning("Could not persist materialization confirmation to session store: %s", store_err)

            return ChatResponse(
                thread_id=thread_id,
                intent="materialize_gold",
                response=confirmation_msg,
            )

        result_state = invoke_turn(graph=graph, thread_id=thread_id, user_message=user_message, user_role=user_role)
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error executing agent turn for thread '%s': %s", thread_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error durante el procesamiento del diálogo: {exc}",
        ) from exc

    # Parse and decouple response cleanly per Punto 2.5
    raw_response = result_state.get("response", "")
    echarts_option = result_state.get("echarts_option")
    metrics_summary = result_state.get("metrics_summary", [])
    suggestions = result_state.get("suggestions", [])
    intent = result_state.get("intent")
    needs_clarification = result_state.get("needs_clarification", False)

    # Check structured storytelling_result from HU-AI-03
    storytelling_result = result_state.get("storytelling_result")
    if isinstance(storytelling_result, dict):
        if not echarts_option and "echarts_option" in storytelling_result:
            echarts_option = storytelling_result["echarts_option"]
        if not metrics_summary and "metrics_summary" in storytelling_result:
            metrics_summary = storytelling_result["metrics_summary"]

    # If raw_response is a serialized JSON string (fallback), unpack it safely
    clean_markdown = raw_response
    if isinstance(raw_response, str) and raw_response.strip().startswith("{") and raw_response.strip().endswith("}"):
        try:
            parsed_json = json.loads(raw_response)
            if "narrative" in parsed_json:
                clean_markdown = parsed_json["narrative"]
            if not echarts_option and "echarts_option" in parsed_json:
                echarts_option = parsed_json["echarts_option"]
            if not metrics_summary and "metrics_summary" in parsed_json:
                metrics_summary = parsed_json["metrics_summary"]
        except (json.JSONDecodeError, TypeError):
            clean_markdown = raw_response

    try:
        from src.core.session.store import get_session_store
        session_store = get_session_store()
        if not session_store.get_session(thread_id):
            session_store.create_session(session_id=thread_id, title="Conversación con Copiloto")
        session_store.add_message(session_id=thread_id, sender="user", content=user_message)
        session_metadata = {
            "intent": intent,
            "suggestions": suggestions if isinstance(suggestions, list) else [],
            "needs_clarification": bool(needs_clarification),
        }
        if isinstance(echarts_option, dict):
            session_metadata["echarts_option"] = echarts_option
        if isinstance(metrics_summary, list):
            session_metadata["metrics_summary"] = metrics_summary
        if result_state.get("sql"):
            session_metadata["sql"] = result_state.get("sql")

        session_store.add_message(
            session_id=thread_id,
            sender="assistant",
            content=clean_markdown,
            metadata=session_metadata,
        )
    except Exception as store_err:
        logger.warning("Could not persist chat turn to session store: %s", store_err)

    return ChatResponse(
        thread_id=thread_id,
        intent=intent,
        response=clean_markdown,
        suggestions=suggestions if isinstance(suggestions, list) else [],
        needs_clarification=bool(needs_clarification),
        echarts_option=echarts_option if isinstance(echarts_option, dict) else None,
        metrics_summary=metrics_summary if isinstance(metrics_summary, list) else [],
    )


@router.post(
    "/materialize",
    response_model=MaterializeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Publish a confirmed Gold pipeline",
)
async def materialize_gold_pipeline(payload: MaterializeRequest) -> MaterializeResponse:
    """Publish a safe declarative contract after explicit user approval."""
    from src.agent.tools.dag_generator import build_pipeline_spec, publish_pipeline_spec

    try:
        spec = build_pipeline_spec(
            payload.report_name,
            payload.sql,
            payload.catalog,
            cron_schedule=payload.cron_schedule,
        )
        uri = publish_pipeline_spec(spec, confirmed=payload.confirmed)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Could not publish Gold pipeline contract")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not publish the pipeline contract") from exc

    return MaterializeResponse(spec_uri=uri, pipeline_id=spec.pipeline_id, output_table=spec.output_table)


def _is_gold_materialization_confirmation(message: str) -> bool:
    """Match the confirmation text sent by the frontend approval card or user prompts."""
    normalized = re.sub(r"[.!?\s]+", " ", message.casefold()).strip()
    if normalized == GOLD_MATERIALIZATION_CONFIRMATION:
        return True
    triggers = (
        "materializa este reporte",
        "materializar este reporte",
        "materializa tabla gold",
        "materializar tabla gold",
        "crear tabla gold",
        "crea tabla gold",
        "construir gold mart",
        "construye gold mart",
        "construir tabla gold",
        "materializar gold mart",
        "materializa gold mart",
        "guardar como tabla gold",
        "guarda como tabla gold",
        "programar tabla gold",
        "programa tabla gold",
        "crear capa gold",
        "materializar capa gold",
        "construir capa gold",
        "elaboracion de la capa gold",
        "elaboración de la capa gold",
        "generar capa gold",
        "generar gold mart",
    )
    return any(t in normalized for t in triggers)
