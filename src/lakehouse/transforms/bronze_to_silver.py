"""
Midas Lakehouse Transforms - Bronze to Silver Cleansing and Quality Gate
Historia de Usuario: HU-LAKE-03 (PySpark Bronze -> Silver Cleansing & Quality Gate)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
Documentos Canónicos:
  - documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md
  - documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
import json
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Tuple, Union
import uuid

from src.core.telemetry.events import (
    AnomalyType,
    NodeStatus,
    TelemetryEvent,
)
from src.lakehouse.quality.quality_rules import (
    QuarantineRecord,
    QualityGateResult,
    evaluate_quality_gate,
    deduplicate_records_deterministic,
    normalize_currency,
    normalize_timestamp_utc,
    is_valid_primary_key,
)

logger = logging.getLogger("midas.lakehouse.transforms.bronze_to_silver")


@dataclass
class BatchTransformResult:
    """Métricas y resultado de ejecución de un lote procesado de Bronze a Silver."""
    batch_id: str
    source_name: str
    total_read: int
    valid_count: int
    quarantined_count: int
    duplicates_dropped: int
    processing_ms: float
    valid_records: List[Dict[str, Any]] = field(default_factory=list)
    quarantined_records: List[QuarantineRecord] = field(default_factory=list)
    silver_path: Optional[str] = None
    quarantine_path: Optional[str] = None
    telemetry_event: Optional[Dict[str, Any]] = None
    pii_report: Optional[Dict[str, Any]] = None

    def to_summary_dict(self) -> Dict[str, Any]:
        """Resumen estadístico del lote para logs y telemetría."""
        return {
            "batch_id": self.batch_id,
            "source_name": self.source_name,
            "total_read": self.total_read,
            "valid_count": self.valid_count,
            "quarantined_count": self.quarantined_count,
            "duplicates_dropped": self.duplicates_dropped,
            "processing_ms": self.processing_ms,
            "silver_path": self.silver_path,
            "quarantine_path": self.quarantine_path,
            "pii_columns": (self.pii_report or {}).get("sensitive_columns", []),
        }


class BronzeToSilverTransformer:
    """
    Transformador de Calidad y Estandarización de Capa Bronze a Capa Silver.
    
    Responsabilidades:
    1. Tipado estricto de fechas a UTC ISO 8601 y normalización de montos a DECIMAL(18,2).
    2. Filtrado y desvío de registros corruptos (monto negativo F3, IDs nulos) a s3://midas-quarantine/.
    3. Deduplicación determinística basada en clave primaria de negocio y timestamp más reciente.
    4. Emisión de telemetría hacia Midas Guardian (Anomaly F3 / NodeStatus.AUTO_HEALING).
    5. Contabilidad matemática exacta de lote (total_read, valid_count, quarantined_count, processing_ms).
    """

    def __init__(
        self,
        minio_client: Optional[Any] = None,
        telemetry_publisher: Optional[Callable[[Dict[str, Any]], None]] = None,
        pipeline_id: str = "pipeline_bronze_to_silver",
        node_id: str = "silver_cleansing",
        pii_shield: Optional[Any] = None,
    ):
        """
        :param minio_client: Instancia opcional de MidasMinioClient para persistencia S3.
        :param telemetry_publisher: Callback para enviar eventos canónicos al TelemetryHub.
        :param pipeline_id: Identificador del pipeline orquestado.
        :param node_id: Identificador canónico del nodo en el Canvas ('silver_cleansing').
        :param pii_shield: Escudo PII opcional (HU-GOV-02). Si se inyecta, clasifica
            las columnas sensibles del lote y despacha las etiquetas a Apache Atlas
            sin bloquear la transformación. Si es None, el comportamiento no cambia.
        """
        self.minio_client = minio_client
        self.telemetry_publisher = telemetry_publisher
        self.pii_shield = pii_shield
        self.pipeline_id = pipeline_id
        self.node_id = node_id

    def generate_batch_id(self, prefix: str = "silver_batch") -> str:
        """Genera un identificador único para el lote procesado."""
        ts = int(time.time())
        token = uuid.uuid4().hex[:6]
        return f"{prefix}_{ts}_{token}"

    def process_batch(
        self,
        records: List[Dict[str, Any]],
        source_name: str,
        primary_key_fields: Optional[List[str]] = None,
        amount_fields: Optional[List[str]] = None,
        date_fields: Optional[List[str]] = None,
        dedup_key_fields: Optional[List[str]] = None,
        dedup_timestamp_field: Optional[str] = None,
        batch_id: Optional[str] = None,
        persist_to_storage: bool = True,
    ) -> BatchTransformResult:
        """
        Ejecuta el ciclo completo de validación, limpieza, cuarentena y deduplicación.
        
        :param records: Lista de registros crudos procedentes de Bronze (con envoltura o directos).
        :param source_name: Nombre canónico de la fuente (ej. 'crm_transacciones', 'finanzas_metas').
        :param primary_key_fields: Columnas que actúan como PK.
        :param amount_fields: Columnas que contienen montos monetarios.
        :param date_fields: Columnas que contienen fechas.
        :param dedup_key_fields: Columnas para la clave de deduplicación. Si no se especifican, se usan las PK.
        :param dedup_timestamp_field: Campo timestamp para priorizar la versión más reciente.
        :param batch_id: Identificador opcional del lote.
        :param persist_to_storage: Si es True y hay minio_client, almacena en MinIO.
        :return: BatchTransformResult con métricas y registros procesados.
        """
        start_time = time.perf_counter()
        effective_batch_id = batch_id or self.generate_batch_id(prefix=f"silver_{source_name}")
        total_read = len(records)

        pk_cols = primary_key_fields or [
            "transaccion_id",
            "id_orden",
            "id_pedido",
            "pedido_id",
            "id_registro",
            "cliente_id",
            "internal_id",
            "internal id",
            "ean",
            "sku",
            "product_id",
            "item_id",
            "id",
            "codigo",
            "codigo_consultoria",
            "_raw_id",
        ]
        amt_cols = amount_fields or [
            "monto",
            "precio_unitario",
            "total_neto",
            "total_amount",
            "monto_bruto",
            "valor",
            "valor_servicio",
            "precio",
            "price",
            "unit_price",
            "cost",
            "costo",
            "stock",
            "importe",
            "total",
        ]
        dt_cols = date_fields or [
            "fecha_transaccion",
            "fecha_pedido",
            "fecha_creacion",
            "fecha_actualizacion",
            "fecha",
            "timestamp",
            "created_at",
            "_ingested_at",
        ]
        ts_dedup = dedup_timestamp_field or dt_cols[0]

        valid_candidate_records: List[Dict[str, Any]] = []
        quarantined_records: List[QuarantineRecord] = []

        # 1. Paso de Quality Gate individual
        for raw_record in records:
            # Si el registro ya contiene columnas de negocio, evitar json.loads redundante
            has_business_keys = any(k for k in raw_record if not k.startswith("_"))
            if has_business_keys:
                record_to_eval = raw_record
            elif "_raw_payload" in raw_record and isinstance(raw_record["_raw_payload"], str):
                try:
                    payload_dict = json.loads(raw_record["_raw_payload"])
                    if isinstance(payload_dict, dict):
                        # Preservar metadatos de auditoría de Bronze (_raw_id, _batch_id, etc.)
                        for k, v in raw_record.items():
                            if k.startswith("_") and k != "_raw_payload" and k not in payload_dict:
                                payload_dict[k] = v
                        record_to_eval = payload_dict
                    else:
                        record_to_eval = raw_record
                except Exception:
                    record_to_eval = raw_record
            else:
                record_to_eval = raw_record

            qg_res = evaluate_quality_gate(
                record=record_to_eval,
                source_name=source_name,
                primary_key_fields=pk_cols,
                amount_fields=amt_cols,
                date_fields=dt_cols,
            )

            if qg_res.is_valid and qg_res.cleaned_record is not None:
                valid_candidate_records.append(qg_res.cleaned_record)
            elif qg_res.quarantine_record is not None:
                quarantined_records.append(qg_res.quarantine_record)

        # 2. Deduplicación determinística sobre registros válidos
        if dedup_key_fields:
            resolved_dedup_cols = dedup_key_fields
        elif valid_candidate_records:
            first_rec = valid_candidate_records[0]
            actual_pk = None
            for col in pk_cols:
                if col in first_rec and first_rec[col] is not None and col != "_raw_id":
                    actual_pk = col
                    break
                c_norm = col.strip().lower().replace(" ", "_").replace("-", "_")
                for rk in first_rec:
                    if rk.strip().lower().replace(" ", "_").replace("-", "_") == c_norm and first_rec[rk] is not None:
                        actual_pk = rk
                        break
                if actual_pk:
                    break

            if not actual_pk:
                for rk in first_rec:
                    rk_norm = rk.strip().lower().replace(" ", "_").replace("-", "_")
                    if rk_norm in ("id", "index", "customer_id", "cliente_id", "order_id", "id_orden", "transaccion_id", "transaction_id", "code", "codigo", "key", "id_registro") or rk_norm.endswith("_id") or rk_norm.startswith("id_"):
                        actual_pk = rk
                        break

            if not actual_pk:
                bus_cols = [k for k in first_rec if not k.startswith("_")]
                actual_pk = bus_cols[0] if bus_cols else "_raw_id"

            resolved_dedup_cols = [actual_pk]
        else:
            resolved_dedup_cols = [pk_cols[0]]

        deduplicated_records, duplicates_dropped = deduplicate_records_deterministic(
            records=valid_candidate_records,
            key_fields=resolved_dedup_cols,
            timestamp_field=ts_dedup,
        )

        valid_count = len(deduplicated_records)
        quarantined_count = len(quarantined_records)
        elapsed_ms = round((time.perf_counter() - start_time) * 1000, 2)

        silver_path: Optional[str] = None
        quarantine_path: Optional[str] = None

        # 2.1. Escudo PII en caliente (HU-GOV-02). El despacho a Atlas es
        # asíncrono y cualquier fallo de gobernanza se registra sin interrumpir
        # el lote: la transformación nunca depende del catálogo.
        pii_report: Optional[Dict[str, Any]] = None
        if self.pii_shield is not None:
            try:
                shield_result = self.pii_shield.scan_batch(
                    deduplicated_records,
                    source_name=source_name,
                    batch_id=effective_batch_id,
                )
                pii_report = shield_result.to_dict()
            except Exception as exc:  # noqa: BLE001 - la gobernanza nunca tumba el pipeline
                logger.warning(f"Escudo PII no aplicado al lote {effective_batch_id}: {exc}")

        # 3. Persistencia en MinIO S3 (si aplica)
        if persist_to_storage and self.minio_client is not None:
            # Persistir registros limpios en midas-silver
            if valid_count > 0:
                silver_key = f"clean/{source_name}/{effective_batch_id}.json"
                silver_data = json.dumps(deduplicated_records, default=str).encode("utf-8")
                try:
                    self.minio_client.put_object(
                        bucket="midas-silver",
                        object_name=silver_key,
                        data=silver_data,
                        content_type="application/json",
                    )
                    silver_path = f"s3://midas-silver/{silver_key}"

                    # Persistencia dual en Parquet para motores analíticos y Iceberg
                    try:
                        import io
                        import pandas as pd
                        df_clean = pd.DataFrame(deduplicated_records)
                        buf = io.BytesIO()
                        df_clean.to_parquet(buf, index=False, engine="pyarrow")
                        parquet_key = f"clean/{source_name}/{effective_batch_id}.parquet"
                        self.minio_client.put_object(
                            bucket="midas-silver",
                            object_name=parquet_key,
                            data=buf.getvalue(),
                            content_type="application/octet-stream",
                        )
                    except Exception as p_err:
                        logger.debug("Omitida escritura parquet en midas-silver: %s", p_err)

                except Exception as exc:
                    logger.warning(f"No se pudo persistir en midas-silver: {exc}")

            # Persistir registros corruptos en midas-quarantine
            if quarantined_count > 0:
                quarantine_key = f"silver_quarantine/{source_name}/{effective_batch_id}.json"
                quarantine_data = json.dumps([q.to_dict() for q in quarantined_records], default=str).encode("utf-8")
                try:
                    self.minio_client.put_object(
                        bucket="midas-quarantine",
                        object_name=quarantine_key,
                        data=quarantine_data,
                        content_type="application/json",
                    )
                    quarantine_path = f"s3://midas-quarantine/{quarantine_key}"
                except Exception as exc:
                    logger.warning(f"No se pudo persistir en midas-quarantine: {exc}")

        # 4. Emisión canónica de telemetría hacia Midas Guardian
        telemetry_event_dict = self._emit_telemetry(
            batch_id=effective_batch_id,
            source_name=source_name,
            total_read=total_read,
            valid_count=valid_count,
            quarantined_count=quarantined_count,
            duplicates_dropped=duplicates_dropped,
            latency_ms=elapsed_ms,
        )

        return BatchTransformResult(
            batch_id=effective_batch_id,
            source_name=source_name,
            total_read=total_read,
            valid_count=valid_count,
            quarantined_count=quarantined_count,
            duplicates_dropped=duplicates_dropped,
            processing_ms=elapsed_ms,
            valid_records=deduplicated_records,
            quarantined_records=quarantined_records,
            silver_path=silver_path,
            quarantine_path=quarantine_path,
            telemetry_event=telemetry_event_dict,
            pii_report=pii_report,
        )

    def _emit_telemetry(
        self,
        batch_id: str,
        source_name: str,
        total_read: int,
        valid_count: int,
        quarantined_count: int,
        duplicates_dropped: int,
        latency_ms: float,
    ) -> Optional[Dict[str, Any]]:
        """Construye y emite el evento canónico de telemetría hacia el TelemetryHub."""
        # Determinar estado operativo del nodo
        if quarantined_count > 0:
            status = NodeStatus.AUTO_HEALING
            anomaly_type = AnomalyType.F3_NEGATIVE_AMOUNT
            playbook_id = "QUARANTINE_INVALID_ROWS_V1"
            action_taken = f"Diverted {quarantined_count} corrupt records to s3://midas-quarantine/"
        else:
            status = NodeStatus.HEALTHY
            anomaly_type = None
            playbook_id = None
            action_taken = "Clean batch promoted without incident"

        details_payload: Dict[str, Any] = {
            "batch_id": batch_id,
            "source_name": source_name,
            "quarantined_records": quarantined_count,
            "duplicates_dropped": duplicates_dropped,
            "action_taken": action_taken,
        }
        if anomaly_type:
            details_payload["anomaly_type"] = anomaly_type.value
        if playbook_id:
            details_payload["playbook_id"] = playbook_id

        event = TelemetryEvent(
            pipeline_id=self.pipeline_id,
            node_id=self.node_id,
            status=status,
            records_in=total_read,
            records_out=valid_count,
            latency_ms=latency_ms,
            details=details_payload,
        )

        event_dict = event.to_dict()

        if self.telemetry_publisher is not None:
            try:
                self.telemetry_publisher(event_dict)
            except Exception as exc:
                logger.error(f"Error publicando evento de telemetría: {exc}")

        return event_dict


# ==============================================================================
# Helper para Soporte PySpark DataFrame en Contenedores Spark
# ==============================================================================

def transform_pyspark_bronze_dataframe(
    spark_df: Any,
    source_name: str,
    key_col: str = "id_orden",
    timestamp_col: str = "fecha_transaccion",
    amount_col: str = "monto",
) -> Tuple[Any, Any]:
    """
    Función puente para ejecución nativa en clúster PySpark (Apache Spark 3.5).
    Aplica filtros de Quality Gate y deduplicación por Window Partition.
    
    :param spark_df: DataFrame nativo de PySpark.
    :param source_name: Nombre de la fuente.
    :param key_col: Columna clave de negocio.
    :param timestamp_col: Columna temporal para desempate.
    :param amount_col: Columna monetaria a evaluar.
    :return: Tupla (valid_spark_df, quarantine_spark_df).
    """
    try:
        from pyspark.sql import functions as F
        from pyspark.sql.window import Window
    except ImportError:
        raise RuntimeError("PySpark no está disponible en este entorno de ejecución.")

    # 1. Separar registros corruptos (monto negativo o PK nula)
    quarantine_cond = (
        F.col(key_col).isNull()
        | (F.trim(F.col(key_col)) == "")
        | (F.col(amount_col) < 0)
    )

    quarantine_df = spark_df.filter(quarantine_cond).withColumn(
        "failure_reason",
        F.when(F.col(amount_col) < 0, F.lit("NEGATIVE_AMOUNT"))
        .otherwise(F.lit("NULL_PRIMARY_KEY")),
    ).withColumn("quarantined_at", F.current_timestamp())

    candidates_df = spark_df.filter(~quarantine_cond)

    # 2. Deduplicación determinística por ventana
    window_spec = Window.partitionBy(key_col).orderBy(F.col(timestamp_col).desc())
    valid_df = (
        candidates_df.withColumn("_row_num", F.row_number().over(window_spec))
        .filter(F.col("_row_num") == 1)
        .drop("_row_num")
    )

    return valid_df, quarantine_df
