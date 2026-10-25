"""
Midas Lakehouse Ingestion - Dynamic Source Connection Registry
Historia de Usuario: HU-LAKE-05 (Registro Dinámico de Conexiones Multi-Fuente)
Responsable: Edgar Corzo (Data Engineering Lead)
"""

from datetime import datetime, timezone
import json
import logging
import os
import re
import threading
from typing import Any, Dict, List, Optional
import uuid

from src.lakehouse.models.connection import (
    SourceType,
    ConnectionStatus,
    SourceConnectionCreate,
    SourceConnectionResponse,
)

logger = logging.getLogger("midas.lakehouse.ingestion.registry")


class SourceConnectionRegistry:
    """
    Repositorio central de conexiones multi-fuente.
    Soporta persistencia en PostgreSQL (midas_operational.source_connections)
    y memoria volátil para pruebas unitarias herméticas.
    """

    CANONICAL_ALIASES: Dict[str, str] = {
        "postgres": "conn_pg_crm_default",
        "source_postgres": "conn_pg_crm_default",
        "pg": "conn_pg_crm_default",
        "crm": "conn_pg_crm_default",
        "excel": "conn_excel_budget_default",
        "source_excel": "conn_excel_budget_default",
        "csv": "conn_excel_budget_default",
        "source_csv": "conn_excel_budget_default",
        "budget": "conn_excel_budget_default",
        "api": "conn_rest_crm_default",
        "source_api": "conn_rest_crm_default",
        "rest": "conn_rest_crm_default",
    }

    def __init__(self, db_url: Optional[str] = None):
        if os.getenv("PYTEST_CURRENT_TEST") or os.getenv("MIDAS_TESTING") == "1":
            self.db_url = None
        else:
            self.db_url = db_url if db_url is not None else (os.getenv("OPERATIONAL_DB_URL") or os.getenv("DATABASE_URL"))
        self._lock = threading.Lock()
        self._memory_store: Dict[str, Dict[str, Any]] = {}
        self._name_index: Dict[str, str] = {}  # name.lower() -> connection_id

        # Semilla canónica en memoria para funcionamiento sin DB
        self._seed_default_connections()

        # Hidratar desde PostgreSQL si está disponible
        if self.db_url and "postgresql" in self.db_url:
            self._hydrate_from_postgres()

    def _seed_default_connections(self) -> None:
        """Inicializa las conexiones canónicas de Midas."""
        defaults = [
            {
                "connection_id": "conn_pg_crm_default",
                "name": "CRM Operacional PostgreSQL",
                "source_type": "POSTGRES",
                "config_payload": {
                    "host": "midas-postgres",
                    "port": 5432,
                    "database": "midas_operational",
                    "schema": "public",
                },
                "status": "ACTIVE",
                "created_at": "2026-10-18T00:00:00Z",
            },
            {
                "connection_id": "conn_excel_budget_default",
                "name": "Presupuesto Corporativo Excel",
                "source_type": "EXCEL",
                "config_payload": {
                    "file_path": "data/Presupuesto_Corporativo_2026.xlsx",
                    "sheets": ["Presupuesto_Metas", "Costos_Operativos"],
                },
                "status": "ACTIVE",
                "created_at": "2026-10-18T00:00:00Z",
            },
            {
                "connection_id": "conn_rest_crm_default",
                "name": "Helpdesk Tickets Live REST API",
                "source_type": "REST",
                "config_payload": {
                    "endpoint_url": "https://api.internal.midas/v2/tickets",
                    "auth_type": "BEARER",
                },
                "status": "ACTIVE",
                "created_at": "2026-10-18T00:00:00Z",
            },
        ]
        for conn in defaults:
            self._memory_store[conn["connection_id"]] = conn
            self._name_index[conn["name"].strip().lower()] = conn["connection_id"]

    def _generate_connection_id(self, source_type: SourceType, name: str) -> str:
        """Genera un identificador limpio, legible y único para la conexión."""
        slug = re.sub(r"[^a-zA-Z0-9]+", "_", name.strip().lower()).strip("_")[:20]
        token = uuid.uuid4().hex[:6]
        return f"conn_{source_type.value.lower()}_{slug}_{token}"

    def register_connection(self, create_dto: SourceConnectionCreate) -> SourceConnectionResponse:
        """
        Registra una nueva conexión en el catálogo operacional.
        Lanza ValueError si el nombre ya existe.
        """
        clean_name = create_dto.name.strip()
        normalized_name = clean_name.lower()

        with self._lock:
            if normalized_name in self._name_index:
                raise ValueError(f"Ya existe una conexión registrada con el nombre '{clean_name}'.")

            connection_id = self._generate_connection_id(create_dto.source_type, clean_name)
            now_iso = datetime.now(timezone.utc).isoformat()

            record_dict = {
                "connection_id": connection_id,
                "name": clean_name,
                "source_type": create_dto.source_type.value,
                "config_payload": create_dto.config_payload,
                "status": ConnectionStatus.ACTIVE.value,
                "created_at": now_iso,
            }

            # Guardar en memoria
            self._memory_store[connection_id] = record_dict
            self._name_index[normalized_name] = connection_id

            # Persistencia opcional en PostgreSQL si está disponible
            if self.db_url and "postgresql" in self.db_url:
                try:
                    self._persist_to_postgres(record_dict)
                except Exception as exc:
                    logger.warning("No se pudo escribir en PostgreSQL operacional (usando fallback en memoria): %s", exc)

            logger.info("Conexión registrada exitosamente: ID=%s, Nombre='%s'", connection_id, clean_name)
            return SourceConnectionResponse.from_dict(record_dict)

    def list_connections(
        self,
        source_type: Optional[SourceType] = None,
        status: Optional[ConnectionStatus] = None,
    ) -> List[SourceConnectionResponse]:
        """Lista todas las conexiones registradas con filtrado opcional."""
        with self._lock:
            records = list(self._memory_store.values())

        results = []
        for r in records:
            if source_type and r["source_type"] != source_type.value:
                continue
            if status and r.get("status") != status.value:
                continue
            results.append(SourceConnectionResponse.from_dict(r))

        return results

    def get_connection(self, connection_id: str) -> Optional[SourceConnectionResponse]:
        """Obtiene una conexión por su identificador único o alias canónico con consulta a BD."""
        if not connection_id or not str(connection_id).strip():
            return None

        clean_id = str(connection_id).strip()

        # 1. Búsqueda directa en memoria
        with self._lock:
            data = self._memory_store.get(clean_id)
            if data:
                return SourceConnectionResponse.from_dict(data)

        # 2. Resolución por alias canónico (source_postgres, postgres, excel, api, etc.)
        alias_target = self.CANONICAL_ALIASES.get(clean_id.lower())
        if alias_target:
            with self._lock:
                data = self._memory_store.get(alias_target)
                if data:
                    return SourceConnectionResponse.from_dict(data)

        # 3. Resolución removiendo prefijo 'source_'
        if clean_id.startswith("source_"):
            stripped = clean_id[7:]
            res = self.get_connection(stripped)
            if res:
                return res

        # 4. Resolución por índice de nombre
        with self._lock:
            named_cid = self._name_index.get(clean_id.lower())
            if named_cid and named_cid in self._memory_store:
                return SourceConnectionResponse.from_dict(self._memory_store[named_cid])

        # 5. Consulta directa a PostgreSQL operacional si no está en memoria
        db_rec = self._fetch_from_postgres(clean_id)
        if db_rec:
            return SourceConnectionResponse.from_dict(db_rec)

        # 6. Búsqueda por subcadena en memoria
        with self._lock:
            for cid, cdata in self._memory_store.items():
                if clean_id.lower() in cid.lower() or cid.lower() in clean_id.lower():
                    return SourceConnectionResponse.from_dict(cdata)

        return None

    def _fetch_from_postgres(self, identifier: str) -> Optional[Dict[str, Any]]:
        """Busca una conexión directamente en la tabla operacional PostgreSQL por id o nombre."""
        if not (self.db_url and "postgresql" in self.db_url):
            return None
        try:
            from sqlalchemy import create_engine, text
            engine = create_engine(self.db_url, pool_pre_ping=True, connect_args={"connect_timeout": 2})
            with engine.connect() as conn:
                row = conn.execute(
                    text("""
                        SELECT connection_id, name, source_type, config_payload, status, created_at 
                        FROM source_connections 
                        WHERE connection_id = :ident OR LOWER(name) = :ident_low 
                        LIMIT 1
                    """),
                    {"ident": identifier, "ident_low": identifier.lower()}
                ).fetchone()
                if row:
                    payload = row[3] if isinstance(row[3], dict) else json.loads(row[3] or "{}")
                    rec = {
                        "connection_id": row[0],
                        "name": row[1],
                        "source_type": row[2],
                        "config_payload": payload,
                        "status": row[4],
                        "created_at": str(row[5]),
                    }
                    with self._lock:
                        self._memory_store[rec["connection_id"]] = rec
                        self._name_index[rec["name"].strip().lower()] = rec["connection_id"]
                    return rec
        except Exception as exc:
            logger.debug("No se pudo consultar PostgreSQL operacional para conexión '%s': %s", identifier, exc)
        return None

    def delete_connection(self, connection_id: str) -> bool:
        """Elimina una conexión por su identificador."""
        with self._lock:
            if connection_id not in self._memory_store:
                return False
            data = self._memory_store.pop(connection_id)
            norm_name = data["name"].strip().lower()
            self._name_index.pop(norm_name, None)
            return True

    def _hydrate_from_postgres(self) -> None:
        """Carga las conexiones previamente registradas desde PostgreSQL operacional."""
        try:
            from sqlalchemy import create_engine, text
            engine = create_engine(self.db_url, pool_pre_ping=True, connect_args={"connect_timeout": 2})
            with engine.connect() as conn:
                rows = conn.execute(
                    text("SELECT connection_id, name, source_type, config_payload, status, created_at FROM source_connections")
                ).fetchall()
                for r in rows:
                    cid = r[0]
                    cname = r[1]
                    stype = r[2]
                    payload = r[3] if isinstance(r[3], dict) else json.loads(r[3] or "{}")
                    status_val = r[4]
                    created_at = str(r[5])
                    rec = {
                        "connection_id": cid,
                        "name": cname,
                        "source_type": stype,
                        "config_payload": payload,
                        "status": status_val,
                        "created_at": created_at,
                    }
                    self._memory_store[cid] = rec
                    self._name_index[cname.strip().lower()] = cid
            logger.info("Hidratadas %d conexiones desde PostgreSQL operacional.", len(rows))
        except Exception as exc:
            logger.debug("No se pudo hidratar conexiones desde PostgreSQL: %s", exc)

    def _persist_to_postgres(self, record: Dict[str, Any]) -> None:
        """Escribe el registro en midas_operational.source_connections usando psycopg2 o SQLAlchemy."""
        from sqlalchemy import create_engine, text
        engine = create_engine(self.db_url, pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO source_connections (connection_id, name, source_type, config_payload, status)
                    VALUES (:cid, :name, :stype, :payload, :status)
                    ON CONFLICT (connection_id) DO NOTHING
                """),
                {
                    "cid": record["connection_id"],
                    "name": record["name"],
                    "stype": record["source_type"],
                    "payload": json.dumps(record["config_payload"]),
                    "status": record["status"],
                }
            )


# Instancia Singleton Global
_REGISTRY_INSTANCE: Optional[SourceConnectionRegistry] = None
_REGISTRY_LOCK = threading.Lock()


def get_connection_registry() -> SourceConnectionRegistry:
    """Retorna la instancia global del registro de conexiones."""
    global _REGISTRY_INSTANCE
    if _REGISTRY_INSTANCE is None:
        with _REGISTRY_LOCK:
            if _REGISTRY_INSTANCE is None:
                _REGISTRY_INSTANCE = SourceConnectionRegistry()
    return _REGISTRY_INSTANCE


def reset_connection_registry() -> None:
    """Reinicia el singleton del registro (útil para pruebas unitarias)."""
    global _REGISTRY_INSTANCE
    with _REGISTRY_LOCK:
        _REGISTRY_INSTANCE = SourceConnectionRegistry()
