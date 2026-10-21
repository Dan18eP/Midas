"""Copilot Agent HTTP route exposing LangGraph conversational state machine.

Adheres strictly to documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md
and Punto 2.5 of documentation/reviews/review-pr-023-hu-ai-01-langgraph.md.
"""

from datetime import datetime, timezone
import json
import logging
import re
from typing import Any, Dict, List, Optional
import uuid
import asyncio
import os
from contextlib import ExitStack
from fastapi import APIRouter, HTTPException, status
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
_graph_resources = ExitStack()


def get_agent_graph() -> Any:
    """Lazily instantiate and compile the LangGraph conversational graph."""
    global _compiled_graph
    if _compiled_graph is None:
        try:
            # Tests can use memory; configured deployments use PostgreSQL.
            from langgraph.checkpoint.memory import InMemorySaver
            from src.agent.graph.builder import build_graph

            from src.agent.graph.builder import postgres_checkpointer
            from src.agent.services import execute_query, load_sources

            db_url = os.getenv("DATABASE_URL")
            checkpointer = _graph_resources.enter_context(postgres_checkpointer(db_url)) if db_url else InMemorySaver()
            _compiled_graph = build_graph(checkpointer=checkpointer, execute_query=execute_query,
                                          source_provider=load_sources)
            logger.info("LangGraph conversational state machine compiled successfully.")
        except Exception as exc:
            logger.error("Failed to compile LangGraph state machine: %s", exc, exc_info=True)
            raise RuntimeError(f"No se pudo inicializar el grafo del Copiloto: {exc}") from exc

    return _compiled_graph


def reset_agent_graph() -> None:
    """Reset the compiled graph singleton (useful for test isolation)."""
    global _compiled_graph
    _compiled_graph = None
    _graph_resources.close()


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
async def chat_with_agent(payload: ChatRequest) -> ChatResponse:
    """Execute a conversational turn with the Copilot Agent."""
    thread_id = payload.thread_id.strip() if payload.thread_id else f"session_{uuid.uuid4().hex[:8]}"
    user_message = payload.message.strip()

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
            if not sql or not schemas or previous_state.get("query_error"):
                raise HTTPException(
                    status_code=status.HTTP_409_CONFLICT,
                    detail="Run a validated report in this chat before confirming Gold materialization.",
                )

            from src.agent.tools.dag_generator import build_pipeline_spec, publish_pipeline_spec

            spec = build_pipeline_spec(
                previous_state.get("user_message", "Gold report"),
                sql,
                schemas,
            )
            spec_uri = publish_pipeline_spec(spec, confirmed=True)
            confirmation_msg = f"Gold pipeline **{spec.pipeline_id}** is scheduled daily. Contract: `{spec_uri}`."
            try:
                from src.core.session.store import get_session_store
                s_store = get_session_store()
                s_store.add_message(session_id=thread_id, sender="user", content=user_message)
                s_store.add_message(
                    session_id=thread_id,
                    sender="assistant",
                    content=confirmation_msg,
                    metadata={"intent": "materialize_gold", "spec_uri": spec_uri, "pipeline_id": spec.pipeline_id},
                )
            except Exception as store_err:
                logger.warning("Could not persist materialization confirmation to session store: %s", store_err)
                raise HTTPException(status_code=503, detail="The contract was published, but chat history could not be saved") from None

            return ChatResponse(
                thread_id=thread_id,
                intent="materialize_gold",
                response=confirmation_msg,
            )

        result_state = await asyncio.to_thread(invoke_turn, graph=graph, thread_id=thread_id, user_message=user_message)
    except HTTPException:
        raise
    except (ConnectionError, TimeoutError):
        raise HTTPException(status_code=503, detail="The live analytical catalog is unavailable") from None
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
        raise HTTPException(status_code=503, detail="Chat history could not be saved") from None

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
    """Match the confirmation text sent by the frontend approval card."""
    normalized = re.sub(r"[.!?\s]+", " ", message.casefold()).strip()
    return normalized == GOLD_MATERIALIZATION_CONFIRMATION
