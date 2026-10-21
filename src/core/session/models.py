"""Midas - Modelos de Dominio para Sesiones Conversacionales y Mensajes.

Historia de Usuario: HU-BACK-03
Satisface la persistencia multi-sesión requerida por el Workspace ChatGPT-Style
y el seguimiento de linaje de interacciones del Copiloto (ADR-010).
"""

from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
import uuid
from pydantic import BaseModel, Field


class SessionMessage(BaseModel):
    """Mensaje individual registrado en el historial de una sesión."""

    message_id: str = Field(default_factory=lambda: f"msg_{uuid.uuid4().hex[:12]}")
    session_id: str = Field(..., description="Identificador de la sesión a la que pertenece")
    sender: str = Field(..., description="Emisor del turno: 'user', 'assistant' o 'system'")
    content: str = Field(..., description="Texto o contenido del mensaje")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadatos analíticos (SQL, ECharts, métricas)")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class ChatSession(BaseModel):
    """Sesión de conversación multi-turno persistida."""

    session_id: str = Field(default_factory=lambda: f"sess_{uuid.uuid4().hex[:12]}")
    user_id: str = Field("user_director", description="Identificador del usuario propietario")
    title: str = Field("Nueva Conversación", description="Título descriptivo de la sesión")
    metadata: Dict[str, Any] = Field(default_factory=dict, description="Metadatos contextuales de la sesión")
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())
    updated_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class CreateSessionRequest(BaseModel):
    """Solicitud para inicializar una nueva sesión conversacional."""

    title: Optional[str] = Field(None, description="Título opcional personalizado")
    user_id: Optional[str] = Field("user_director", description="Identificador del usuario")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Metadatos iniciales")


class CreateMessageRequest(BaseModel):
    """Solicitud para añadir un mensaje a una sesión existente."""

    sender: str = Field("user", description="Emisor: 'user', 'assistant' o 'system'")
    content: str = Field(..., min_length=1, description="Contenido textual del mensaje")
    metadata: Optional[Dict[str, Any]] = Field(default_factory=dict, description="Metadatos opcionales")


class SessionSummaryResponse(BaseModel):
    """Resumen de sesión para listado en la barra lateral de historial."""

    session_id: str
    user_id: str
    title: str
    message_count: int
    created_at: str
    updated_at: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class SessionDetailResponse(BaseModel):
    """Detalle completo de sesión con su historial ordenado de mensajes."""

    session_id: str
    user_id: str
    title: str
    created_at: str
    updated_at: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    messages: List[SessionMessage] = Field(default_factory=list)
