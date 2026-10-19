"""Copilot Agent HTTP route exposing LangGraph conversational state machine.

Adheres strictly to documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md
and Punto 2.5 of documentation/reviews/review-pr-023-hu-ai-01-langgraph.md.
"""

from datetime import datetime, timezone
import json
import logging
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

logger = logging.getLogger("midas.api.agent")

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

            checkpointer = InMemorySaver()
            _compiled_graph = build_graph(checkpointer=checkpointer)
            logger.info("LangGraph conversational state machine compiled successfully.")
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
        result_state = invoke_turn(graph=graph, thread_id=thread_id, user_message=user_message)
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

    return ChatResponse(
        thread_id=thread_id,
        intent=intent,
        response=clean_markdown,
        suggestions=suggestions if isinstance(suggestions, list) else [],
        needs_clarification=bool(needs_clarification),
        echarts_option=echarts_option if isinstance(echarts_option, dict) else None,
        metrics_summary=metrics_summary if isinstance(metrics_summary, list) else [],
    )
