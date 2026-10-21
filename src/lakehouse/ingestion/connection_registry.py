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
import yaml

from src.lakehouse.ingestion.source_contract import build_source_contract

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

    def __init__(self, db_url: Optional[str] = None, storage=None):
        self.db_url = db_url or os.getenv("OPERATIONAL_DB_URL") or os.getenv("DATABASE_URL")
        self._lock = threading.Lock()
        self._memory_store: Dict[str, Dict[str, Any]] = {}
        self._name_index: Dict[str, str] = {}  # name.lower() -> connection_id
        self.storage = storage

        # Semilla canónica en memoria para funcionamiento sin DB
        if self.db_url:
            self._reload_from_postgres()
        else:
            self._seed_default_connections()

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

    def register_connection(self, create_dto: SourceConnectionCreate, connection_id=None) -> SourceConnectionResponse:
        """
        Registra una nueva conexión en el catálogo operacional.
        Lanza ValueError si el nombre ya existe.
        """
        clean_name = create_dto.name.strip()
        normalized_name = clean_name.lower()

        with self._lock:
            if normalized_name in self._name_index:
                previous = self._memory_store[self._name_index[normalized_name]]
                if previous["status"] in {"FAILED", "TESTING"} and previous["config_payload"] == create_dto.config_payload:
                    connection_id = previous["connection_id"]
                else:
                    raise ValueError(f"Ya existe una conexión registrada con el nombre '{clean_name}'.")

            connection_id = connection_id or self._generate_connection_id(create_dto.source_type, clean_name)
            now_iso = datetime.now(timezone.utc).isoformat()

            record_dict = {
                "connection_id": connection_id,
                "name": clean_name,
                "source_type": create_dto.source_type.value,
                "config_payload": create_dto.config_payload,
                "status": ConnectionStatus.ACTIVE.value,
                "created_at": now_iso,
            }

            contract = build_source_contract(record_dict)
            record_dict["status"] = "TESTING" if contract else "INACTIVE"
            if self.db_url:
                self._persist_to_postgres(record_dict)
            if contract and (self.db_url or self.storage is not None):
                from src.lakehouse.storage.minio_client import MidasMinioClient

                client = self.storage or MidasMinioClient()
                try:
                    client.put_object("midas-governance", f"source-contracts/{connection_id}.yaml",
                                      yaml.safe_dump(contract).encode(), content_type="application/yaml")
                except Exception:
                    record_dict["status"] = "FAILED"
                    if self.db_url:
                        self._persist_to_postgres(record_dict)
                    raise RuntimeError("Could not publish the source contract") from None
            record_dict["status"] = "ACTIVE" if contract else "INACTIVE"
            if self.db_url:
                self._persist_to_postgres(record_dict)
            self._memory_store[connection_id] = record_dict
            self._name_index[normalized_name] = connection_id

            logger.info("Conexión registrada exitosamente: ID=%s, Nombre='%s'", connection_id, clean_name)
            return SourceConnectionResponse.from_dict(record_dict)

    def list_connections(
        self,
        source_type: Optional[SourceType] = None,
        status: Optional[ConnectionStatus] = None,
    ) -> List[SourceConnectionResponse]:
        """Lista todas las conexiones registradas con filtrado opcional."""
        if self.db_url:
            self._reload_from_postgres()
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
        """Obtiene una conexión por su identificador único."""
        if self.db_url:
            self._reload_from_postgres()
        with self._lock:
            data = self._memory_store.get(connection_id)
        if not data:
            return None
        return SourceConnectionResponse.from_dict(data)

    def delete_connection(self, connection_id: str) -> bool:
        """Elimina una conexión por su identificador."""
        with self._lock:
            if connection_id not in self._memory_store:
                return False
            data = self._memory_store.pop(connection_id)
            norm_name = data["name"].strip().lower()
            self._name_index.pop(norm_name, None)
            return True

    def _persist_to_postgres(self, record: Dict[str, Any]) -> None:
        """Escribe el registro en midas_operational.source_connections usando psycopg2 o SQLAlchemy."""
        from sqlalchemy import create_engine, text
        engine = create_engine(self.db_url, pool_pre_ping=True)
        with engine.begin() as conn:
            conn.execute(
                text("""
                    INSERT INTO source_connections (connection_id, name, source_type, config_payload, status)
                    VALUES (:cid, :name, :stype, :payload, :status)
                    ON CONFLICT (connection_id) DO UPDATE SET status = EXCLUDED.status
                """),
                {
                    "cid": record["connection_id"],
                    "name": record["name"],
                    "stype": record["source_type"],
                    "payload": json.dumps(record["config_payload"]),
                    "status": record["status"],
                }
            )
        engine.dispose()

    def _reload_from_postgres(self):
        from sqlalchemy import create_engine, text

        engine = create_engine(self.db_url, connect_args={"connect_timeout": 3})
        try:
            with engine.connect() as connection:
                records = [dict(row) for row in connection.execute(text("SELECT * FROM source_connections")).mappings()]
            with self._lock:
                self._memory_store = {row["connection_id"]: row for row in records}
                self._name_index = {row["name"].strip().lower(): row["connection_id"] for row in records}
        finally:
            engine.dispose()


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
