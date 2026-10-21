"""Midas - Repositorio de Persistencia de Sesiones Conversacionales.

Historia de Usuario: HU-BACK-03
Autor: Daniel Echeverría (Backend Lead)
Garantiza almacenamiento thread-safe de sesiones y mensajes para FastAPI
con rendimiento ultra-rápido (<1ms) y desacoplamiento para pruebas sin containers.
"""

from datetime import datetime, timezone
import logging
import threading
from typing import Any, Dict, List, Optional

from src.core.session.models import ChatSession, SessionMessage

logger = logging.getLogger("midas.session.store")


class SessionStore:
    """Almacén en memoria thread-safe para sesiones de chat y mensajes."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._sessions: Dict[str, ChatSession] = {}
        self._messages: Dict[str, List[SessionMessage]] = {}

    def create_session(
        self,
        user_id: str = "user_director",
        title: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> ChatSession:
        """Crea y registra una nueva sesión conversacional."""
        now_iso = datetime.now(timezone.utc).isoformat()
        session_title = title.strip() if title and title.strip() else "Nueva Conversación"
        session = ChatSession(
            user_id=user_id,
            title=session_title,
            metadata=metadata or {},
            created_at=now_iso,
            updated_at=now_iso,
        )
        if session_id:
            session.session_id = session_id

        with self._lock:
            self._sessions[session.session_id] = session
            self._messages[session.session_id] = []

        logger.info("Sesión creada: %s para usuario '%s'", session.session_id, user_id)
        return session

    def get_session(self, session_id: str) -> Optional[ChatSession]:
        """Obtiene los metadatos de una sesión por su identificador."""
        with self._lock:
            return self._sessions.get(session_id)

    def list_sessions(
        self,
        user_id: Optional[str] = None,
        limit: int = 50,
        offset: int = 0,
    ) -> List[ChatSession]:
        """Lista las sesiones ordenadas cronológicamente por updated_at descendente."""
        with self._lock:
            sessions = list(self._sessions.values())

        if user_id:
            sessions = [s for s in sessions if s.user_id == user_id]

        # Ordenar por fecha de última actualización descendente
        sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return sessions[offset : offset + limit]

    def add_message(
        self,
        session_id: str,
        sender: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        message_id: Optional[str] = None,
    ) -> SessionMessage:
        """Registra un nuevo mensaje en el hilo de la sesión y actualiza su timestamp."""
        now_iso = datetime.now(timezone.utc).isoformat()
        message = SessionMessage(
            session_id=session_id,
            sender=sender,
            content=content,
            metadata=metadata or {},
            created_at=now_iso,
        )
        if message_id:
            message.message_id = message_id

        with self._lock:
            if session_id not in self._sessions:
                # Auto-crear sesión si no existe explícitamente (resiliencia)
                self._sessions[session_id] = ChatSession(
                    session_id=session_id,
                    user_id="user_director",
                    title="Conversación Copiloto",
                    created_at=now_iso,
                    updated_at=now_iso,
                )
                self._messages[session_id] = []

            self._messages[session_id].append(message)
            # Actualizar timestamp de la sesión
            self._sessions[session_id].updated_at = now_iso

            # Si el título era el por defecto y el mensaje es de usuario, derivar título conciso
            session = self._sessions[session_id]
            if session.title in ("Nueva Conversación", "Conversación Copiloto") and sender == "user":
                derived_title = content.strip().split("\n")[0][:45]
                if derived_title:
                    session.title = derived_title

        return message

    def get_messages(self, session_id: str) -> List[SessionMessage]:
        """Retorna todos los mensajes asociados a una sesión en orden cronológico."""
        with self._lock:
            return list(self._messages.get(session_id, []))

    def delete_session(self, session_id: str) -> bool:
        """Elimina una sesión y sus mensajes asociados."""
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                self._messages.pop(session_id, None)
                logger.info("Sesión eliminada: %s", session_id)
                return True
            return False

    def get_message_count(self, session_id: str) -> int:
        """Retorna el número de mensajes registrados en la sesión."""
        with self._lock:
            return len(self._messages.get(session_id, []))

    def clear(self) -> None:
        """Limpia todo el almacén (para aislamiento de pruebas unitarias)."""
        with self._lock:
            self._sessions.clear()
            self._messages.clear()


# Singleton global
_session_store_instance: Optional[SessionStore] = None
_instance_lock = threading.Lock()


def get_session_store() -> SessionStore:
    """Retorna la instancia singleton del almacén de sesiones."""
    global _session_store_instance
    if _session_store_instance is None:
        with _instance_lock:
            if _session_store_instance is None:
                _session_store_instance = SessionStore()
    return _session_store_instance
