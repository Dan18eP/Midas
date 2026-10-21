"""Midas - Controlador REST para Gestión de Sesiones Conversacionales y Topología.

Historia de Usuario: HU-BACK-03 & ADR-010
Autor: Daniel Echeverría (Backend Lead)
Provee los endpoints requeridos por el Workspace multi-sesión estilo ChatGPT y
la persistencia dinámica de nodos y aristas del Canvas de React Flow.
"""

from typing import List, Optional
from fastapi import APIRouter, HTTPException, Path, Query, status

from src.core.session.models import (
    CreateMessageRequest,
    CreateSessionRequest,
    SessionDetailResponse,
    SessionMessage,
    SessionSummaryResponse,
    UpdateTopologyRequest,
)
from src.core.session.store import get_session_store

router = APIRouter(prefix="/api/v1/sessions", tags=["Conversational Sessions & History"])


@router.post(
    "",
    response_model=SessionSummaryResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Crear Nueva Sesión Conversacional",
    description="Inicializa una nueva sesión de diálogo para el Copiloto con topología opcional.",
)
async def create_session(payload: Optional[CreateSessionRequest] = None) -> SessionSummaryResponse:
    """Crea una nueva sesión en el almacén persistente."""
    req = payload or CreateSessionRequest()
    store = get_session_store()
    session = store.create_session(
        user_id=req.user_id or "user_director",
        title=req.title,
        metadata=req.metadata,
        topology_state=req.topology_state,
    )
    return SessionSummaryResponse(
        session_id=session.session_id,
        user_id=session.user_id,
        title=session.title,
        message_count=0,
        created_at=session.created_at,
        updated_at=session.updated_at,
        metadata=session.metadata,
    )


@router.get(
    "",
    response_model=List[SessionSummaryResponse],
    status_code=status.HTTP_200_OK,
    summary="Listar Sesiones Conversacionales",
    description="Retorna el listado de sesiones ordenadas cronológicamente para el panel lateral de historial.",
)
async def list_sessions(
    user_id: Optional[str] = Query(None, description="Filtrar por ID de usuario"),
    limit: int = Query(50, ge=1, le=200, description="Cantidad máxima de sesiones"),
    offset: int = Query(0, ge=0, description="Paginación offset"),
) -> List[SessionSummaryResponse]:
    """Obtiene el historial de sesiones activas."""
    store = get_session_store()
    sessions = store.list_sessions(user_id=user_id, limit=limit, offset=offset)
    return [
        SessionSummaryResponse(
            session_id=s.session_id,
            user_id=s.user_id,
            title=s.title,
            message_count=store.get_message_count(s.session_id),
            created_at=s.created_at,
            updated_at=s.updated_at,
            metadata=s.metadata,
        )
        for s in sessions
    ]


@router.get(
    "/{session_id}",
    response_model=SessionDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Obtener Detalle e Historial de una Sesión",
    description="Recupera la metadata de la sesión, su topología React Flow y todos sus mensajes cronológicos.",
)
async def get_session_detail(
    session_id: str = Path(..., description="ID de la sesión conversacional"),
) -> SessionDetailResponse:
    """Obtiene el detalle completo de la sesión con sus mensajes y topología."""
    store = get_session_store()
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesión '{session_id}' no encontrada.",
        )

    messages = store.get_messages(session_id)
    return SessionDetailResponse(
        session_id=session.session_id,
        user_id=session.user_id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        metadata=session.metadata,
        topology_state=session.topology_state,
        messages=messages,
    )


@router.put(
    "/{session_id}/topology",
    response_model=SessionDetailResponse,
    status_code=status.HTTP_200_OK,
    summary="Actualizar Topología de la Sesión",
    description="Persiste el estado actual de nodos y aristas de React Flow para esta sesión.",
)
async def update_session_topology(
    session_id: str = Path(..., description="ID de la sesión a actualizar"),
    payload: UpdateTopologyRequest = ...,
) -> SessionDetailResponse:
    """Actualiza la topología del Canvas asociada a la sesión."""
    store = get_session_store()
    session = store.update_topology(session_id, payload.topology_state)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesión '{session_id}' no encontrada.",
        )

    messages = store.get_messages(session_id)
    return SessionDetailResponse(
        session_id=session.session_id,
        user_id=session.user_id,
        title=session.title,
        created_at=session.created_at,
        updated_at=session.updated_at,
        metadata=session.metadata,
        topology_state=session.topology_state,
        messages=messages,
    )


@router.post(
    "/{session_id}/messages",
    response_model=SessionMessage,
    status_code=status.HTTP_201_CREATED,
    summary="Agregar Mensaje a una Sesión",
    description="Registra un nuevo mensaje en el hilo conversacional de la sesión.",
)
async def add_message_to_session(
    session_id: str = Path(..., description="ID de la sesión destino"),
    payload: CreateMessageRequest = ...,
) -> SessionMessage:
    """Inserta un nuevo turno en la sesión."""
    store = get_session_store()
    session = store.get_session(session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesión '{session_id}' no encontrada.",
        )

    message = store.add_message(
        session_id=session_id,
        sender=payload.sender,
        content=payload.content,
        metadata=payload.metadata,
    )
    return message


@router.delete(
    "/{session_id}",
    status_code=status.HTTP_200_OK,
    summary="Eliminar una Sesión",
    description="Elimina la sesión y todos sus mensajes asociados del historial.",
)
async def delete_session(
    session_id: str = Path(..., description="ID de la sesión a eliminar"),
) -> dict:
    """Elimina la sesión especificada."""
    store = get_session_store()
    deleted = store.delete_session(session_id)
    if not deleted:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Sesión '{session_id}' no encontrada.",
        )

    return {"status": "deleted", "session_id": session_id}
