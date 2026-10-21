"""Midas - Escudo PII en Caliente durante la transición Bronze → Silver.

Historia de Usuario: HU-GOV-02
Responsable: Sebastian Castiblanco (Governance Lead)

Orquesta las cuatro piezas del escudo:

1. Clasifica las columnas del lote (`pii_classifier`).
2. Despacha la clasificación a Apache Atlas **sin bloquear** la transformación
   (`ST-GOV-02.2`): el registro viaja en un hilo aparte y el lote sigue su curso.
3. Verifica la propagación hacia Ranger dentro de la ventana de 5 segundos
   exigida por `ST-GOV-02.3`.
4. Sella el resultado en la bitácora inmutable (`ST-GOV-02.4`).

El escudo es opcional por diseño: sin Atlas desplegado el lote se procesa
igual, el despacho se marca como no confirmado y la auditoría lo deja asentado.
"""

from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from dataclasses import dataclass, field
import logging
import time
from typing import Any, Dict, List, Optional, Sequence

from src.security_governance.atlas.atlas_client import (
    AtlasClient,
    TAGSYNC_DEADLINE_SECONDS,
)
from src.security_governance.atlas.audit_log import PIIAuditLog
from src.security_governance.atlas.pii_classifier import (
    PII_CLASSIFICATION,
    BatchClassificationResult,
    classify_records,
)

logger = logging.getLogger("midas.governance.atlas.shield")


@dataclass
class TagSyncResult:
    """Resultado de verificar la propagación Atlas → Ranger."""

    propagated: Optional[bool]
    elapsed_seconds: float
    deadline_seconds: float

    @property
    def within_deadline(self) -> bool:
        return bool(self.propagated) and self.elapsed_seconds <= self.deadline_seconds

    def to_dict(self) -> Dict[str, Any]:
        return {
            "propagated": self.propagated,
            "elapsed_seconds": round(self.elapsed_seconds, 3),
            "deadline_seconds": self.deadline_seconds,
            "within_deadline": self.within_deadline,
        }


@dataclass
class ShieldReport:
    """Resultado del escudo sobre un lote."""

    batch_id: str
    source_name: str
    table: str
    classification: BatchClassificationResult
    audit_entry_hash: Optional[str] = None
    atlas_dispatched: Optional[bool] = None
    tagsync: Optional[TagSyncResult] = None
    _future: Optional[Future] = field(default=None, repr=False, compare=False)

    @property
    def sensitive_columns(self) -> List[str]:
        return self.classification.sensitive_columns

    def wait(self, timeout: Optional[float] = None) -> Optional[bool]:
        """Espera el despacho asíncrono y devuelve si Atlas lo aceptó."""
        if self._future is None:
            return self.atlas_dispatched
        try:
            self.atlas_dispatched = self._future.result(timeout=timeout)
        except Exception as exc:  # noqa: BLE001 - el despacho nunca tumba el pipeline
            logger.warning("Fallo en el despacho asíncrono a Atlas: %s", exc)
            self.atlas_dispatched = False
        return self.atlas_dispatched

    def to_dict(self) -> Dict[str, Any]:
        return {
            "batch_id": self.batch_id,
            "source_name": self.source_name,
            "table": self.table,
            "sensitive_columns": self.sensitive_columns,
            "classifications": [item.to_dict() for item in self.classification.classifications],
            "atlas_dispatched": self.atlas_dispatched,
            "audit_entry_hash": self.audit_entry_hash,
            "tagsync": self.tagsync.to_dict() if self.tagsync else None,
        }


class PIIShield:
    """Escudo de detección y clasificación de datos sensibles."""

    def __init__(
        self,
        atlas_client: Optional[AtlasClient] = None,
        audit_log: Optional[PIIAuditLog] = None,
        *,
        cluster: str = "midas",
        max_workers: int = 2,
        executor: Optional[ThreadPoolExecutor] = None,
    ) -> None:
        self.atlas_client = atlas_client or AtlasClient()
        self.audit_log = audit_log or PIIAuditLog()
        self.cluster = cluster
        self._executor = executor or ThreadPoolExecutor(
            max_workers=max_workers, thread_name_prefix="midas-pii-shield"
        )

    # ------------------------------------------------------------------
    # Flujo principal
    # ------------------------------------------------------------------
    def scan_batch(
        self,
        records: Sequence[Dict[str, Any]],
        *,
        source_name: str,
        batch_id: str,
        table_qualified_name: Optional[str] = None,
    ) -> ShieldReport:
        """Clasifica el lote, despacha a Atlas en segundo plano y audita.

        Devuelve de inmediato: la llamada a Atlas queda en vuelo y se consulta
        con `ShieldReport.wait()` cuando hace falta confirmarla.
        """
        table = table_qualified_name or f"silver.{source_name}@{self.cluster}"
        classification = classify_records(
            records, source_name=source_name, batch_id=batch_id
        )

        report = ShieldReport(
            batch_id=batch_id,
            source_name=source_name,
            table=table,
            classification=classification,
        )

        if not classification.has_pii:
            logger.debug("Lote '%s' sin columnas sensibles.", batch_id)
            report.atlas_dispatched = None
            return report

        logger.info(
            "Escudo PII: %d columna(s) sensible(s) en el lote '%s': %s",
            len(classification.classifications),
            batch_id,
            ", ".join(classification.sensitive_columns),
        )

        report._future = self._executor.submit(
            self._dispatch_to_atlas, table, classification.sensitive_columns
        )

        entry = self.audit_log.append(
            batch_id=batch_id,
            source_name=source_name,
            table=table,
            columns=[item.to_dict() for item in classification.classifications],
            atlas_dispatched=False,
        )
        report.audit_entry_hash = entry.entry_hash

        return report

    def _dispatch_to_atlas(self, table: str, columns: Sequence[str]) -> bool:
        """Registra la clasificación en Atlas. Se ejecuta fuera del hilo del lote."""
        if not self.atlas_client.ensure_classification_type(PII_CLASSIFICATION):
            logger.warning("No se pudo asegurar el tipo '%s' en Atlas.", PII_CLASSIFICATION)
            return False
        return self.atlas_client.classify_columns(table, columns, cluster=self.cluster)

    # ------------------------------------------------------------------
    # CA-3 — Propagación hacia Ranger
    # ------------------------------------------------------------------
    def verify_tagsync(
        self,
        *,
        classification: str = PII_CLASSIFICATION,
        deadline_seconds: Optional[float] = None,
        poll_interval_seconds: float = 0.5,
    ) -> TagSyncResult:
        """Espera a que Ranger reciba la etiqueta dentro de la ventana exigida.

        `propagated` queda en `None` cuando Ranger no está desplegado o no
        responde: la propagación no es comprobable, que es distinto de haber
        fallado.
        """
        deadline = deadline_seconds or self.atlas_client.settings.tagsync_deadline_seconds
        started = time.monotonic()
        reachable = False

        while True:
            tags = self.atlas_client.fetch_ranger_tag_names()
            elapsed = time.monotonic() - started

            if tags is not None:
                reachable = True
                if classification in tags:
                    return TagSyncResult(True, elapsed, deadline)

            if elapsed >= deadline:
                return TagSyncResult(False if reachable else None, elapsed, deadline)

            time.sleep(poll_interval_seconds)

    def shutdown(self, wait: bool = True) -> None:
        """Cierra el pool de despacho asíncrono."""
        self._executor.shutdown(wait=wait)


def build_default_shield(minio_client: Optional[Any] = None) -> PIIShield:
    """Escudo con la bitácora replicada en el bucket de gobernanza."""
    return PIIShield(audit_log=PIIAuditLog(minio_client=minio_client))
