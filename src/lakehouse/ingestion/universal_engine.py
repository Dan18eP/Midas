"""
Midas Lakehouse Ingestion - Universal Ingestion Engine Orchestrator
Historia de Usuario: HU-LAKE-02 (Universal Ingestion Multi-Fuente)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
"""

import datetime
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Dict, List, Optional, Union

from src.lakehouse.ingestion.fingerprint import (
    compute_schema_fingerprint,
    create_bronze_envelope,
    detect_schema_drift,
)
from src.lakehouse.ingestion.postgres_connector import PostgresSourceConnector
from src.lakehouse.ingestion.excel_connector import ExcelSourceConnector
from src.lakehouse.ingestion.rest_connector import RestApiSourceConnector

logger = logging.getLogger("midas.lakehouse.ingestion.engine")


@dataclass
class IngestionResult:
    """Resultado estructurado de un trabajo de ingesta en capa Bronze."""
    batch_id: str
    source_type: str
    source_origin: str
    records_count: int
    schema_fingerprint: str
    schema_drift_detected: bool
    storage_path: Optional[str] = None
    records: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)


class UniversalIngestionEngine:
    """
    Motor orquestador unificado de ingesta multi-fuente para la capa Bronze del Lakehouse Medallón.
    
    Capacidades:
    1. Orquesta la extracción de PostgreSQL, Excel multi-hoja y APIs REST.
    2. Aplica la envoltura canónica Bronze con trazabilidad completa.
    3. Monitorea y detecta Schema Drift comparando fingerprints SHA-256.
    4. Opcionalmente persiste los lotes en MinIO S3 (midas-bronze).
    5. Emite eventos canónicos de telemetría hacia el hub de observabilidad.
    """

    def __init__(
        self,
        minio_client: Optional[Any] = None,
        telemetry_publisher: Optional[Callable[[Dict[str, Any]], None]] = None,
        baseline_fingerprints: Optional[Dict[str, str]] = None,
    ):
        """
        :param minio_client: Instancia de MidasMinioClient para persistir en midas-bronze.
        :param telemetry_publisher: Callback para enviar eventos a FastAPI TelemetryHub.
        :param baseline_fingerprints: Diccionario opcional de huellas de esquema base {source_origin: sha256_hash}.
        """
        self.minio_client = minio_client
        self.telemetry_publisher = telemetry_publisher
        self.baselines: Dict[str, str] = baseline_fingerprints or {}

    def generate_batch_id(self, prefix: str = "batch") -> str:
        """Genera un identificador único y cronológico de lote."""
        ts = int(time.time())
        token = uuid.uuid4().hex[:6]
        return f"{prefix}_{ts}_{token}"

    def register_baseline_fingerprint(self, source_origin: str, fingerprint: str) -> None:
        """Registra una huella dactilar canónica como línea base para detección de Schema Drift."""
        self.baselines[source_origin] = fingerprint

    def _publish_telemetry(
        self,
        stage: str,
        node_id: str,
        event_type: str,
        status: str,
        records_count: int,
        payload: Dict[str, Any],
    ) -> None:
        """Emite evento de telemetría si hay un publicador configurado."""
        if self.telemetry_publisher is None:
            return

        event_data = {
            "stage": stage,
            "node_id": node_id,
            "event_type": event_type,
            "status": status,
            "records_count": records_count,
            "payload": payload,
            "created_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        }
        try:
            self.telemetry_publisher(event_data)
        except Exception as exc:
            logger.warning("Fallo al emitir evento de telemetría: %s", exc)

    def _persist_to_bronze_storage(
        self,
        source_type: str,
        source_origin: str,
        batch_id: str,
        records: List[Dict[str, Any]],
    ) -> Optional[str]:
        """Escribe el lote en el bucket S3 'midas-bronze' si MinIO está disponible."""
        if self.minio_client is None:
            return None

        # Limpiar caracteres en el path
        safe_origin = source_origin.replace(":", "_").replace("/", "_").replace("\\", "_").replace("#", "_")
        date_partition = datetime.datetime.now(datetime.timezone.utc).strftime("year=%Y/month=%m/day=%d")
        object_key = f"raw/{source_type.lower()}/{safe_origin}/{date_partition}/{batch_id}.json"

        try:
            json_data = json.dumps(records, indent=2, ensure_ascii=False).encode("utf-8")
            self.minio_client.put_object(
                bucket="midas-bronze",
                object_name=object_key,
                data=json_data,
                content_type="application/json",
            )
            s3_uri = f"s3://midas-bronze/{object_key}"
            logger.info("Lote guardado en almacenamiento Bronze: %s", s3_uri)
            return s3_uri
        except Exception as exc:
            logger.error("Error persistiendo lote en MinIO S3: %s", exc)
            return None

    def ingest_from_postgres(
        self,
        connector: PostgresSourceConnector,
        table_name: str,
        batch_id: Optional[str] = None,
        batch_size: int = 1000,
        schema_name: str = "public",
        persist: bool = True,
    ) -> IngestionResult:
        """
        Ejecuta la ingesta de una tabla PostgreSQL a la capa Bronze.
        """
        bid = batch_id or self.generate_batch_id("batch_pg")
        node_id = f"node-postgres-{table_name}"
        origin = f"{schema_name}.{table_name}"

        self._publish_telemetry("INGESTION", node_id, "SYNC_STARTED", "RUNNING", 0, {"table": origin, "batch_id": bid})

        records = connector.extract_batch(
            table_name=table_name,
            batch_id=bid,
            batch_size=batch_size,
            schema_name=schema_name,
        )

        fingerprint = records[0]["_schema_fingerprint"] if records else ""
        baseline = self.baselines.get(origin)
        drift = detect_schema_drift(baseline, fingerprint) if baseline else False

        if drift:
            logger.warning("ALERTA: Detectado Schema Drift en fuente PostgreSQL '%s'! (Baseline: %s, Actual: %s)", origin, baseline, fingerprint)
            self._publish_telemetry("INGESTION", node_id, "QUALITY_ALERT", "WARNING", len(records), {
                "alert": "SCHEMA_DRIFT_DETECTED",
                "baseline_fingerprint": baseline,
                "current_fingerprint": fingerprint,
            })

        storage_path = None
        if persist and records:
            storage_path = self._persist_to_bronze_storage("JDBC_POSTGRES", origin, bid, records)

        self._publish_telemetry("INGESTION", node_id, "ROWS_PROCESSED", "SUCCESS", len(records), {
            "batch_id": bid,
            "origin": origin,
            "storage_path": storage_path,
        })

        return IngestionResult(
            batch_id=bid,
            source_type="JDBC_POSTGRES",
            source_origin=origin,
            records_count=len(records),
            schema_fingerprint=fingerprint,
            schema_drift_detected=drift,
            storage_path=storage_path,
            records=records,
        )

    def ingest_from_excel(
        self,
        connector: ExcelSourceConnector,
        sheet_name: str,
        batch_id: Optional[str] = None,
        header_row_override: Optional[int] = None,
        persist: bool = True,
    ) -> IngestionResult:
        """
        Ejecuta la ingesta de una hoja de cálculo Excel a la capa Bronze.
        """
        bid = batch_id or self.generate_batch_id("batch_excel")
        node_id = f"node-excel-{sheet_name}"
        origin = f"{connector.source_name}#{sheet_name}"

        self._publish_telemetry("INGESTION", node_id, "SYNC_STARTED", "RUNNING", 0, {"sheet": origin, "batch_id": bid})

        records = connector.extract_sheet(
            sheet_name=sheet_name,
            batch_id=bid,
            header_row_override=header_row_override,
        )

        fingerprint = records[0]["_schema_fingerprint"] if records else ""
        baseline = self.baselines.get(origin)
        drift = detect_schema_drift(baseline, fingerprint) if baseline else False

        if drift:
            logger.warning("ALERTA: Detectado Schema Drift en hoja Excel '%s'!", origin)
            self._publish_telemetry("INGESTION", node_id, "QUALITY_ALERT", "WARNING", len(records), {
                "alert": "SCHEMA_DRIFT_DETECTED",
                "baseline_fingerprint": baseline,
                "current_fingerprint": fingerprint,
            })

        storage_path = None
        if persist and records:
            storage_path = self._persist_to_bronze_storage("EXCEL_SPREADSHEET", origin, bid, records)

        self._publish_telemetry("INGESTION", node_id, "ROWS_PROCESSED", "SUCCESS", len(records), {
            "batch_id": bid,
            "origin": origin,
            "storage_path": storage_path,
        })

        return IngestionResult(
            batch_id=bid,
            source_type="EXCEL_SPREADSHEET",
            source_origin=origin,
            records_count=len(records),
            schema_fingerprint=fingerprint,
            schema_drift_detected=drift,
            storage_path=storage_path,
            records=records,
        )

    def ingest_from_rest(
        self,
        connector: RestApiSourceConnector,
        endpoint: str,
        batch_id: Optional[str] = None,
        max_records: Optional[int] = None,
        persist: bool = True,
    ) -> IngestionResult:
        """
        Ejecuta la ingesta desde un endpoint de API REST paginada a la capa Bronze.
        """
        bid = batch_id or self.generate_batch_id("batch_rest")
        node_id = "node-rest-api"
        origin = f"{connector.base_url}/{endpoint.lstrip('/')}"

        self._publish_telemetry("INGESTION", node_id, "SYNC_STARTED", "RUNNING", 0, {"endpoint": origin, "batch_id": bid})

        records = connector.extract_cursor_paginated(
            endpoint=endpoint,
            batch_id=bid,
            max_records=max_records,
        )

        fingerprint = records[0]["_schema_fingerprint"] if records else ""
        baseline = self.baselines.get(origin)
        drift = detect_schema_drift(baseline, fingerprint) if baseline else False

        if drift:
            logger.warning("ALERTA: Detectado Schema Drift en API REST '%s'!", origin)
            self._publish_telemetry("INGESTION", node_id, "QUALITY_ALERT", "WARNING", len(records), {
                "alert": "SCHEMA_DRIFT_DETECTED",
                "baseline_fingerprint": baseline,
                "current_fingerprint": fingerprint,
            })

        storage_path = None
        if persist and records:
            storage_path = self._persist_to_bronze_storage("REST_API_CRM", origin, bid, records)

        self._publish_telemetry("INGESTION", node_id, "ROWS_PROCESSED", "SUCCESS", len(records), {
            "batch_id": bid,
            "origin": origin,
            "storage_path": storage_path,
        })

        return IngestionResult(
            batch_id=bid,
            source_type="REST_API_CRM",
            source_origin=origin,
            records_count=len(records),
            schema_fingerprint=fingerprint,
            schema_drift_detected=drift,
            storage_path=storage_path,
            records=records,
        )
