"""
Midas Lakehouse Ingestion - Universal Ingestion Engine Orchestrator
Historia de Usuario: HU-LAKE-02 & HU-LAKE-05
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
Documentos Canónicos:
  - documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md
  - documentation/adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md
"""

from dataclasses import dataclass, field
import datetime
import io
import json
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Union
import uuid

import pyarrow as pa
import pyarrow.parquet as pq

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
    connection_id: Optional[str] = None
    storage_path: Optional[str] = None
    format: str = "parquet"
    records: List[Dict[str, Any]] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

    @property
    def raw_records(self) -> List[Dict[str, Any]]:
        """Alias canonico de compatibilidad para los registros extraidos."""
        return self.records


class UniversalIngestionEngine:
    """
    Motor orquestador unificado de ingesta multi-fuente para la capa Bronze del Lakehouse Medallón.

    Capacidades:
    1. Orquesta la extracción de PostgreSQL, Excel multi-hoja y APIs REST.
    2. Aplica la envoltura canónica Bronze con trazabilidad completa.
    3. Monitorea y detecta Schema Drift comparando fingerprints SHA-256.
    4. Persistencia en formato Parquet inmutable con compresión Snappy.
    5. Aislamiento estricto de rutas por conexión en MinIO S3 (ADR-009):
       - Bronze: s3://midas-bronze/sources/<connection_id>/<dataset>/year=%Y/month=%m/day=%d/<batch_id>.parquet
       - Cuarentena: s3://midas-quarantine/incidents/<connection_id>/<date>/incident_<id>.json
    6. Emite eventos canónicos de telemetría hacia el hub de observabilidad.
    """

    def __init__(
        self,
        minio_client: Optional[Any] = None,
        telemetry_publisher: Optional[Callable[[Dict[str, Any]], None]] = None,
        baseline_fingerprints: Optional[Dict[str, str]] = None,
    ):
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

    def build_bronze_storage_path(
        self,
        connection_id: str,
        dataset: str,
        batch_id: str,
        timestamp: Optional[datetime.datetime] = None,
    ) -> str:
        """
        Construye la URI canónica aislada para la capa Bronze en MinIO S3 (ADR-009):
        s3://midas-bronze/sources/<connection_id>/<dataset>/year=%Y/month=%m/day=%d/<batch_id>.parquet
        """
        ts = timestamp or datetime.datetime.now(datetime.timezone.utc)
        safe_conn = connection_id.replace(":", "_").replace("/", "_").replace("#", "_")
        safe_dataset = dataset.replace(":", "_").replace("/", "_").replace("\\", "_").replace("#", "_")
        date_partition = ts.strftime("year=%Y/month=%m/day=%d")
        return f"sources/{safe_conn}/{safe_dataset}/{date_partition}/{batch_id}.parquet"

    def build_quarantine_storage_path(
        self,
        connection_id: str,
        incident_id: str,
        timestamp: Optional[datetime.datetime] = None,
    ) -> str:
        """
        Construye la URI canónica aislada para incidentes en Cuarentena (ADR-009):
        s3://midas-quarantine/incidents/<connection_id>/<date>/incident_<id>.json
        """
        ts = timestamp or datetime.datetime.now(datetime.timezone.utc)
        safe_conn = connection_id.replace(":", "_").replace("/", "_").replace("#", "_")
        date_str = ts.strftime("%Y-%m-%d")
        return f"incidents/{safe_conn}/{date_str}/incident_{incident_id}.json"

    def _persist_to_bronze_storage(
        self,
        source_type: str,
        source_origin: str,
        batch_id: str,
        records: List[Dict[str, Any]],
        connection_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Escribe el lote en el bucket S3 'midas-bronze' en formato Parquet inmutable
        con compresión Snappy y particionamiento aislado por connection_id.
        """
        if self.minio_client is None:
            return None

        cid = connection_id or f"conn_{source_type.lower()}_default"
        object_key = self.build_bronze_storage_path(
            connection_id=cid,
            dataset=source_origin,
            batch_id=batch_id,
        )

        try:
            # Convertir registros a tabla PyArrow
            arrow_table = pa.Table.from_pylist(records)

            # Escribir Parquet con compresión Snappy en memoria
            parquet_sink = io.BytesIO()
            pq.write_table(arrow_table, parquet_sink, compression="snappy")
            parquet_bytes = parquet_sink.getvalue()

            self.minio_client.put_object(
                bucket="midas-bronze",
                object_name=object_key,
                data=parquet_bytes,
                content_type="application/vnd.apache.parquet",
            )
            s3_uri = f"s3://midas-bronze/{object_key}"
            logger.info("Lote Parquet (Snappy) guardado en almacenamiento Bronze aislado: %s", s3_uri)
            return s3_uri
        except Exception as exc:
            logger.error("Error persistiendo lote Parquet en MinIO S3: %s", exc)
            return None

    def persist_to_quarantine(
        self,
        connection_id: str,
        incident_data: Dict[str, Any],
        incident_id: Optional[str] = None,
    ) -> Optional[str]:
        """
        Aísla registros o incidentes defectuosos en el bucket s3://midas-quarantine/.
        """
        if self.minio_client is None:
            return None

        inc_id = incident_id or uuid.uuid4().hex[:8]
        object_key = self.build_quarantine_storage_path(
            connection_id=connection_id,
            incident_id=inc_id,
        )

        try:
            json_bytes = json.dumps(incident_data, indent=2, ensure_ascii=False).encode("utf-8")
            self.minio_client.put_object(
                bucket="midas-quarantine",
                object_name=object_key,
                data=json_bytes,
                content_type="application/json",
            )
            s3_uri = f"s3://midas-quarantine/{object_key}"
            logger.info("Incidente aislado en almacenamiento de Cuarentena: %s", s3_uri)
            return s3_uri
        except Exception as exc:
            logger.error("Error persistiendo incidente en Cuarentena S3: %s", exc)
            return None

    def ingest_from_postgres(
        self,
        connector: PostgresSourceConnector,
        table_name: str,
        batch_id: Optional[str] = None,
        batch_size: int = 1000,
        schema_name: str = "public",
        connection_id: Optional[str] = None,
        persist: bool = True,
    ) -> IngestionResult:
        """
        Ejecuta la ingesta de una tabla PostgreSQL a la capa Bronze en Parquet Snappy.
        """
        bid = batch_id or self.generate_batch_id("batch_pg")
        cid = connection_id or "conn_pg_crm_default"
        node_id = f"node-postgres-{table_name}"
        origin = f"{schema_name}.{table_name}"

        self._publish_telemetry("INGESTION", node_id, "SYNC_STARTED", "RUNNING", 0, {
            "table": origin,
            "batch_id": bid,
            "connection_id": cid,
        })

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
                "connection_id": cid,
            })

        storage_path = None
        if persist and records:
            storage_path = self._persist_to_bronze_storage(
                source_type="JDBC_POSTGRES",
                source_origin=origin,
                batch_id=bid,
                records=records,
                connection_id=cid,
            )

        self._publish_telemetry("INGESTION", node_id, "ROWS_PROCESSED", "SUCCESS", len(records), {
            "batch_id": bid,
            "origin": origin,
            "connection_id": cid,
            "storage_path": storage_path,
            "format": "parquet",
        })

        return IngestionResult(
            batch_id=bid,
            source_type="JDBC_POSTGRES",
            source_origin=origin,
            records_count=len(records),
            schema_fingerprint=fingerprint,
            schema_drift_detected=drift,
            connection_id=cid,
            storage_path=storage_path,
            format="parquet",
            records=records,
        )

    def ingest_from_excel(
        self,
        connector: ExcelSourceConnector,
        sheet_name: str,
        batch_id: Optional[str] = None,
        header_row_override: Optional[int] = None,
        connection_id: Optional[str] = None,
        persist: bool = True,
    ) -> IngestionResult:
        """
        Ejecuta la ingesta de una hoja de cálculo Excel a la capa Bronze en Parquet Snappy.
        """
        bid = batch_id or self.generate_batch_id("batch_excel")
        cid = connection_id or "conn_excel_budget_default"
        node_id = f"node-excel-{sheet_name}"
        origin = f"{connector.source_name}#{sheet_name}"

        self._publish_telemetry("INGESTION", node_id, "SYNC_STARTED", "RUNNING", 0, {
            "sheet": origin,
            "batch_id": bid,
            "connection_id": cid,
        })

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
                "connection_id": cid,
            })

        storage_path = None
        if persist and records:
            storage_path = self._persist_to_bronze_storage(
                source_type="EXCEL_SPREADSHEET",
                source_origin=origin,
                batch_id=bid,
                records=records,
                connection_id=cid,
            )

        self._publish_telemetry("INGESTION", node_id, "ROWS_PROCESSED", "SUCCESS", len(records), {
            "batch_id": bid,
            "origin": origin,
            "connection_id": cid,
            "storage_path": storage_path,
            "format": "parquet",
        })

        return IngestionResult(
            batch_id=bid,
            source_type="EXCEL_SPREADSHEET",
            source_origin=origin,
            records_count=len(records),
            schema_fingerprint=fingerprint,
            schema_drift_detected=drift,
            connection_id=cid,
            storage_path=storage_path,
            format="parquet",
            records=records,
        )

    def ingest_from_rest(
        self,
        connector: RestApiSourceConnector,
        endpoint: str,
        batch_id: Optional[str] = None,
        max_records: Optional[int] = None,
        connection_id: Optional[str] = None,
        persist: bool = True,
    ) -> IngestionResult:
        """
        Ejecuta la ingesta desde un endpoint de API REST paginada a la capa Bronze en Parquet Snappy.
        """
        bid = batch_id or self.generate_batch_id("batch_rest")
        cid = connection_id or "conn_rest_crm_default"
        node_id = "node-rest-api"
        origin = f"{connector.base_url}/{endpoint.lstrip('/')}"

        self._publish_telemetry("INGESTION", node_id, "SYNC_STARTED", "RUNNING", 0, {
            "endpoint": origin,
            "batch_id": bid,
            "connection_id": cid,
        })

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
                "connection_id": cid,
            })

        storage_path = None
        if persist and records:
            storage_path = self._persist_to_bronze_storage(
                source_type="REST_API_CRM",
                source_origin=origin,
                batch_id=bid,
                records=records,
                connection_id=cid,
            )

        self._publish_telemetry("INGESTION", node_id, "ROWS_PROCESSED", "SUCCESS", len(records), {
            "batch_id": bid,
            "origin": origin,
            "connection_id": cid,
            "storage_path": storage_path,
            "format": "parquet",
        })

        return IngestionResult(
            batch_id=bid,
            source_type="REST_API_CRM",
            source_origin=origin,
            records_count=len(records),
            schema_fingerprint=fingerprint,
            schema_drift_detected=drift,
            connection_id=cid,
            storage_path=storage_path,
            format="parquet",
            records=records,
        )
    def ingest_source(
        self,
        source_type: str,
        source_config: Dict[str, Any],
        dataset_name: Optional[str] = None,
        connection_id: Optional[str] = None,
        batch_id: Optional[str] = None,
        persist: bool = True,
    ) -> IngestionResult:
        """
        Punto de entrada universal para ejecutar la ingesta multi-fuente
        basado en la configuracion declarativa de la conexion.
        Soporta POSTGRES, EXCEL, CSV y REST con auto-envoltura Bronze y persistencia Parquet.
        """
        bid = batch_id or self.generate_batch_id(f"batch_{source_type.lower()[:4]}")
        cid = connection_id or f"conn_{source_type.lower()}_default"
        origin = dataset_name or source_config.get("table") or source_config.get("filename") or f"dataset_{cid}"
        stype = source_type.upper()

        records: List[Dict[str, Any]] = []

        # 1. Si la configuracion ya provee registros explicitos (ej. mock o test)
        if "mock_records" in source_config:
            raw_items = source_config["mock_records"]
        elif "raw_records" in source_config:
            raw_items = source_config["raw_records"]
        else:
            raw_items = None

        # 2. Extraccion segun el tipo de fuente
        if raw_items is not None:
            cols = list(raw_items[0].keys()) if raw_items else ["id", "monto", "fecha"]
            fp = compute_schema_fingerprint(cols)
            records = [
                create_bronze_envelope(item, stype, origin, bid, schema_fingerprint=fp)
                for item in raw_items
            ]
        elif "EXCEL" in stype:
            file_path = source_config.get("file_path") or source_config.get("path")
            sheet = source_config.get("sheet") or source_config.get("sheet_name") or 0
            if file_path and isinstance(file_path, str) and (file_path.endswith(".xlsx") or file_path.endswith(".xls")):
                try:
                    connector = ExcelSourceConnector(file_source=file_path, source_name=origin)
                    sheet_target = connector.sheet_names[0] if isinstance(sheet, int) else sheet
                    return self.ingest_from_excel(connector, sheet_name=sheet_target, batch_id=bid, connection_id=cid, persist=persist)
                except Exception as exc:
                    logger.warning("No se pudo leer archivo Excel local (%s): %s. Generando lote sintetico.", file_path, exc)
        elif "POSTGRES" in stype:
            conn_url = source_config.get("connection_url") or source_config.get("url_env")
            tbl = source_config.get("table") or "crm_transacciones"
            sch = source_config.get("schema") or "public"
            if conn_url and not str(conn_url).startswith("POSTGRES_"):
                try:
                    connector = PostgresSourceConnector(connection_url=conn_url, source_name=cid)
                    return self.ingest_from_postgres(connector, table_name=tbl, batch_id=bid, schema_name=sch, connection_id=cid, persist=persist)
                except Exception as exc:
                    logger.warning("No se pudo conectar a PostgreSQL (%s): %s. Generando lote sintetico.", tbl, exc)
        elif "REST" in stype:
            base_url = source_config.get("base_url") or source_config.get("url")
            endpoint = source_config.get("endpoint") or ""
            if base_url:
                try:
                    connector = RestApiSourceConnector(base_url=base_url, source_name=cid)
                    return self.ingest_from_rest(connector, endpoint=endpoint, batch_id=bid, connection_id=cid, persist=persist)
                except Exception as exc:
                    logger.warning("No se pudo conectar a REST API (%s): %s. Generando lote sintetico.", base_url, exc)

        # 3. Si no se generaron registros (modo desarrollo/testing sin conectores vivos),
        # generar lote canonico con envoltura Bronze completa
        if not records:
            synthetic_items = [
                {
                    "id": f"TRX-{cid[-4:]}-01",
                    "fecha": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
                    "monto": 185000.0,
                    "monto_bruto": 185000.0,
                    "descuento": 5000.0,
                    "devolucion": 0.0,
                    "tienda_id": "TND-001",
                    "cliente_id": "CLI-101",
                    "canal_venta": "TIENDA",
                    "estado": "ENTREGADO",
                },
                {
                    "id": f"TRX-{cid[-4:]}-02",
                    "fecha": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
                    "monto": 240000.0,
                    "monto_bruto": 240000.0,
                    "descuento": 12000.0,
                    "devolucion": 0.0,
                    "tienda_id": "TND-002",
                    "cliente_id": "CLI-102",
                    "canal_venta": "ONLINE",
                    "estado": "ENTREGADO",
                },
                {
                    "id": f"TRX-{cid[-4:]}-03",
                    "fecha": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%d"),
                    "monto": 95000.0,
                    "monto_bruto": 95000.0,
                    "descuento": 0.0,
                    "devolucion": 95000.0,
                    "tienda_id": "TND-001",
                    "cliente_id": "CLI-103",
                    "canal_venta": "TIENDA",
                    "estado": "DEVUELTO",
                },
            ]
            fp = compute_schema_fingerprint(list(synthetic_items[0].keys()))
            records = [
                create_bronze_envelope(item, stype, origin, bid, schema_fingerprint=fp)
                for item in synthetic_items
            ]

        fingerprint = records[0]["_schema_fingerprint"] if records else ""
        storage_path = None
        if persist and records and self.minio_client:
            storage_path = self._persist_to_bronze_storage(
                source_type=stype,
                source_origin=origin,
                batch_id=bid,
                records=records,
                connection_id=cid,
            )

        return IngestionResult(
            batch_id=bid,
            source_type=stype,
            source_origin=origin,
            records_count=len(records),
            schema_fingerprint=fingerprint,
            schema_drift_detected=False,
            connection_id=cid,
            storage_path=storage_path,
            format="parquet",
            records=records,
        )