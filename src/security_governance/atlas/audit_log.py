"""Midas - Bitácora Inmutable de Auditoría de Clasificación PII.

Historia de Usuario: HU-GOV-02 (`ST-GOV-02.4`)
Responsable: Sebastian Castiblanco (Governance Lead)

Registro append-only en formato JSON Lines con **encadenamiento criptográfico**:
cada entrada incluye el hash de la anterior, de modo que alterar o eliminar
cualquier línea rompe la cadena y es detectable con `verify_chain()`.

La bitácora se escribe en disco y, opcionalmente, se replica en el bucket
canónico `s3://midas-governance/` declarado en HU-LAKE-01.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
import hashlib
import json
import logging
import os
from pathlib import Path
import threading
from typing import Any, Dict, Iterator, List, Optional, Sequence

logger = logging.getLogger("midas.governance.atlas.audit")

DEFAULT_AUDIT_PATH = "/var/log/midas/pii_audit.jsonl"
GOVERNANCE_BUCKET = "midas-governance"

# Hash de arranque de la cadena; marca la primera entrada de la bitácora.
GENESIS_HASH = "0" * 64


@dataclass(frozen=True)
class AuditEntry:
    """Entrada inmutable de la bitácora."""

    timestamp: str
    batch_id: str
    source_name: str
    table: str
    columns: Sequence[Dict[str, Any]]
    atlas_dispatched: bool
    prev_hash: str
    entry_hash: str = ""

    def payload_without_hash(self) -> Dict[str, Any]:
        """Contenido firmado: todo menos el propio hash de la entrada."""
        return {
            "timestamp": self.timestamp,
            "batch_id": self.batch_id,
            "source_name": self.source_name,
            "table": self.table,
            "columns": list(self.columns),
            "atlas_dispatched": self.atlas_dispatched,
            "prev_hash": self.prev_hash,
        }

    def to_dict(self) -> Dict[str, Any]:
        return {**self.payload_without_hash(), "entry_hash": self.entry_hash}


def compute_entry_hash(payload: Dict[str, Any]) -> str:
    """SHA-256 determinista del contenido de una entrada."""
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


class PIIAuditLog:
    """Bitácora append-only con cadena de hashes.

    No elimina ni reescribe líneas: la única operación de escritura es añadir.
    """

    def __init__(
        self,
        path: Optional[str] = None,
        *,
        minio_client: Optional[Any] = None,
        bucket: str = GOVERNANCE_BUCKET,
    ) -> None:
        self.path = Path(path or os.getenv("PII_AUDIT_LOG_PATH", DEFAULT_AUDIT_PATH))
        self.minio_client = minio_client
        self.bucket = bucket
        self._lock = threading.Lock()

    # ------------------------------------------------------------------
    # Lectura
    # ------------------------------------------------------------------
    def read_entries(self) -> List[Dict[str, Any]]:
        """Entradas registradas, en orden de escritura."""
        if not self.path.exists():
            return []

        entries: List[Dict[str, Any]] = []
        with self.path.open(encoding="utf-8") as handle:
            for line in handle:
                line = line.strip()
                if not line:
                    continue
                try:
                    entries.append(json.loads(line))
                except json.JSONDecodeError:
                    logger.warning("Línea corrupta en la bitácora: %s", line[:80])
        return entries

    def last_hash(self) -> str:
        """Hash de la última entrada, o el hash génesis si la bitácora está vacía."""
        entries = self.read_entries()
        if not entries:
            return GENESIS_HASH
        return str(entries[-1].get("entry_hash", GENESIS_HASH))

    def verify_chain(self) -> bool:
        """Comprueba que la cadena de hashes no haya sido alterada."""
        expected_prev = GENESIS_HASH
        for raw in self.read_entries():
            stored_hash = raw.get("entry_hash")
            payload = {key: value for key, value in raw.items() if key != "entry_hash"}

            if payload.get("prev_hash") != expected_prev:
                logger.error("Cadena rota en el lote '%s': prev_hash no concuerda.", raw.get("batch_id"))
                return False
            if compute_entry_hash(payload) != stored_hash:
                logger.error("Cadena rota en el lote '%s': contenido alterado.", raw.get("batch_id"))
                return False

            expected_prev = str(stored_hash)
        return True

    # ------------------------------------------------------------------
    # Escritura
    # ------------------------------------------------------------------
    def append(
        self,
        *,
        batch_id: str,
        source_name: str,
        table: str,
        columns: Sequence[Dict[str, Any]],
        atlas_dispatched: bool,
        timestamp: Optional[datetime] = None,
    ) -> AuditEntry:
        """Añade una entrada y devuelve su versión sellada."""
        with self._lock:
            prev_hash = self.last_hash()
            base = AuditEntry(
                timestamp=(timestamp or datetime.now(timezone.utc)).isoformat(),
                batch_id=batch_id,
                source_name=source_name,
                table=table,
                columns=list(columns),
                atlas_dispatched=atlas_dispatched,
                prev_hash=prev_hash,
            )
            entry_hash = compute_entry_hash(base.payload_without_hash())
            sealed = AuditEntry(**{**base.payload_without_hash(), "entry_hash": entry_hash})

            self.path.parent.mkdir(parents=True, exist_ok=True)
            with self.path.open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(sealed.to_dict(), default=str) + "\n")

            self._mirror_to_storage(sealed)
            return sealed

    def _mirror_to_storage(self, entry: AuditEntry) -> None:
        """Replica la entrada en el bucket de gobernanza, si hay cliente MinIO."""
        if self.minio_client is None:
            return

        object_name = f"pii_audit/{entry.batch_id}_{entry.entry_hash[:12]}.json"
        try:
            self.minio_client.put_object(
                bucket=self.bucket,
                object_name=object_name,
                data=json.dumps(entry.to_dict(), default=str).encode("utf-8"),
                content_type="application/json",
            )
        except Exception as exc:  # noqa: BLE001 - la auditoría nunca tumba el pipeline
            logger.warning("No se pudo replicar la auditoría en %s: %s", self.bucket, exc)

    def __iter__(self) -> Iterator[Dict[str, Any]]:
        return iter(self.read_entries())
