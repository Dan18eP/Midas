"""Midas - Repositorio de Persistencia de Sesiones Conversacionales.

Historia de Usuario: HU-BACK-03 & ADR-010
Autor: Daniel Echeverría (Backend Lead)
Garantiza almacenamiento thread-safe de sesiones, mensajes y topología de Canvas
con soporte dual: I/O relacional en PostgreSQL (midas_operational) y caché/fallback
en memoria para rendimiento ultra-rápido (<1ms) y pruebas unitarias desacopladas.
"""

from datetime import datetime, timezone
import json
import logging
import os
import threading
from typing import Any, Dict, List, Optional

from src.core.session.models import ChatSession, SessionMessage
from src.core.session.title_generator import generate_session_title

logger = logging.getLogger("midas.session.store")


class SessionStore:
    """Almacén híbrido (PostgreSQL con caché en memoria) para sesiones de chat y Canvas."""

    def __init__(self, db_url: Optional[str] = None) -> None:
        self.db_url = db_url or os.getenv("OPERATIONAL_DB_URL") or os.getenv("DATABASE_URL")
        self._lock = threading.Lock()
        self._sessions: Dict[str, ChatSession] = {}
        self._messages: Dict[str, List[SessionMessage]] = {}
        self._engine = None
        self._postgres_available = False

        # Intentar conectar e hidratar desde PostgreSQL si está configurado y accesible
        if self.db_url and "postgresql" in self.db_url:
            try:
                from sqlalchemy import create_engine

                self._engine = create_engine(
                    self.db_url,
                    pool_pre_ping=True,
                    connect_args={"connect_timeout": 1},
                )
                self._hydrate_from_postgres()
                self._postgres_available = True
            except Exception as exc:
                raise RuntimeError("The session database is unavailable") from None

    def create_session(
        self,
        user_id: str = "user_director",
        title: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
        topology_state: Optional[Dict[str, Any]] = None,
        session_id: Optional[str] = None,
    ) -> ChatSession:
        """Crea y registra una nueva sesión conversacional con topología."""
        now_iso = datetime.now(timezone.utc).isoformat()
        session_title = title.strip() if title and title.strip() else "Nueva Conversación"
        session = ChatSession(
            user_id=user_id,
            title=session_title,
            metadata=metadata or {},
            topology_state=topology_state if topology_state is not None else {"nodes": [], "edges": []},
            created_at=now_iso,
            updated_at=now_iso,
        )
        if session_id:
            session.session_id = session_id

        with self._lock:
            self._sessions[session.session_id] = session
            self._messages[session.session_id] = []

        if self.db_url and "postgresql" in self.db_url:
            try:
                self._persist_session_to_postgres(session)
            except Exception as exc:
                raise RuntimeError("The session could not be persisted") from None

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

        sessions.sort(key=lambda s: s.updated_at, reverse=True)
        return sessions[offset : offset + limit]

    def update_topology(self, session_id: str, topology_state: Dict[str, Any]) -> Optional[ChatSession]:
        """Actualiza la topología de nodos y aristas de React Flow para la sesión especificada."""
        now_iso = datetime.now(timezone.utc).isoformat()
        with self._lock:
            session = self._sessions.get(session_id)
            if not session:
                return None
            session.topology_state = topology_state
            session.updated_at = now_iso

        if self.db_url and "postgresql" in self.db_url:
            try:
                self._persist_session_to_postgres(session)
            except Exception as exc:
                raise RuntimeError("The session could not be persisted") from None

        logger.info("Topología actualizada para sesión '%s'", session_id)
        return session

    def add_message(
        self,
        session_id: str,
        sender: str,
        content: str,
        metadata: Optional[Dict[str, Any]] = None,
        message_id: Optional[str] = None,
    ) -> SessionMessage:
        """Registra un nuevo mensaje en el hilo y titula inteligentemente el primer turno."""
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
                self._sessions[session_id] = ChatSession(
                    session_id=session_id,
                    user_id="user_director",
                    title="Conversación Copiloto",
                    topology_state={"nodes": [], "edges": []},
                    created_at=now_iso,
                    updated_at=now_iso,
                )
                self._messages[session_id] = []

            self._messages[session_id].append(message)
            session = self._sessions[session_id]
            session.updated_at = now_iso

            # Titulación inteligente automática con Qwen 2.5 / Heurística
            if session.title in ("Nueva Conversación", "Conversación Copiloto") and sender == "user":
                session.title = generate_session_title(content)

        if self.db_url and "postgresql" in self.db_url:
            try:
                self._persist_session_to_postgres(session)
                self._persist_message_to_postgres(message)
            except Exception as exc:
                raise RuntimeError("The session could not be persisted") from None

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
                deleted = True
            else:
                deleted = False

        if deleted and self.db_url and "postgresql" in self.db_url:
            try:
                self._delete_session_from_postgres(session_id)
            except Exception as exc:
                raise RuntimeError("The session could not be persisted") from None

        if deleted:
            logger.info("Sesión eliminada: %s", session_id)
        return deleted

    def get_message_count(self, session_id: str) -> int:
        """Retorna el número de mensajes registrados en la sesión."""
        with self._lock:
            return len(self._messages.get(session_id, []))

    def clear(self) -> None:
        """Limpia la memoria del almacén (para aislamiento de pruebas unitarias)."""
        with self._lock:
            self._sessions.clear()
            self._messages.clear()

    # ==========================================================================
    # Métodos de Persistencia Relacional PostgreSQL
    # ==========================================================================

    def _persist_session_to_postgres(self, session: ChatSession) -> None:
        """Escribe o actualiza los metadatos de la sesión en PostgreSQL."""
        if not self._engine:
            return
        from sqlalchemy import text

        try:
            with self._engine.begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO chat_sessions (session_id, user_id, title, metadata, topology_state, created_at, updated_at)
                        VALUES (:sid, :uid, :title, :meta, :topo, :cat, :uat)
                        ON CONFLICT (session_id) DO UPDATE SET
                            title = EXCLUDED.title,
                            metadata = EXCLUDED.metadata,
                            topology_state = EXCLUDED.topology_state,
                            updated_at = EXCLUDED.updated_at
                    """),
                    {
                        "sid": session.session_id,
                        "uid": session.user_id,
                        "title": session.title,
                        "meta": json.dumps(session.metadata),
                        "topo": json.dumps(session.topology_state),
                        "cat": session.created_at,
                        "uat": session.updated_at,
                    },
                )
        except Exception as exc:
            self._postgres_available = False
            raise RuntimeError("The session could not be persisted") from None

    def _persist_message_to_postgres(self, message: SessionMessage) -> None:
        """Inserta un mensaje en la tabla session_messages."""
        if not self._engine:
            return
        from sqlalchemy import text

        try:
            with self._engine.begin() as conn:
                conn.execute(
                    text("""
                        INSERT INTO session_messages (message_id, session_id, sender, content, metadata, created_at)
                        VALUES (:mid, :sid, :sender, :content, :meta, :cat)
                        ON CONFLICT (message_id) DO NOTHING
                    """),
                    {
                        "mid": message.message_id,
                        "sid": message.session_id,
                        "sender": message.sender,
                        "content": message.content,
                        "meta": json.dumps(message.metadata),
                        "cat": message.created_at,
                    },
                )
        except Exception as exc:
            self._postgres_available = False
            raise RuntimeError("The session could not be persisted") from None

    def _delete_session_from_postgres(self, session_id: str) -> None:
        """Elimina la sesión y sus mensajes en cascada en PostgreSQL."""
        if not self._engine:
            return
        from sqlalchemy import text

        try:
            with self._engine.begin() as conn:
                conn.execute(
                    text("DELETE FROM chat_sessions WHERE session_id = :sid"),
                    {"sid": session_id},
                )
        except Exception as exc:
            self._postgres_available = False
            raise RuntimeError("The session could not be persisted") from None

    def _hydrate_from_postgres(self) -> None:
        """Carga las sesiones y mensajes existentes desde la base de datos."""
        if not self._engine:
            return
        from sqlalchemy import text

        with self._engine.connect() as conn:
            sess_rows = conn.execute(
                text("SELECT session_id, user_id, title, metadata, topology_state, created_at, updated_at FROM chat_sessions ORDER BY updated_at DESC")
            ).fetchall()

            for r in sess_rows:
                s_meta = r[3] if isinstance(r[3], dict) else json.loads(r[3] or "{}")
                s_topo = r[4] if isinstance(r[4], dict) else json.loads(r[4] or "{}")
                self._sessions[r[0]] = ChatSession(
                    session_id=r[0],
                    user_id=r[1],
                    title=r[2],
                    metadata=s_meta,
                    topology_state=s_topo,
                    created_at=str(r[5]),
                    updated_at=str(r[6]),
                )
                self._messages[r[0]] = []

            msg_rows = conn.execute(
                text("SELECT message_id, session_id, sender, content, metadata, created_at FROM session_messages ORDER BY created_at ASC")
            ).fetchall()

            for m in msg_rows:
                m_meta = m[4] if isinstance(m[4], dict) else json.loads(m[4] or "{}")
                if m[1] in self._messages:
                    self._messages[m[1]].append(
                        SessionMessage(
                            message_id=m[0],
                            session_id=m[1],
                            sender=m[2],
                            content=m[3],
                            metadata=m_meta,
                            created_at=str(m[5]),
                        )
                    )


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
