"""
Midas Lakehouse - Unit and Integration Tests for Bronze to Silver Cleansing & Quality Gate
Historia de Usuario: HU-LAKE-03
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
"""

from decimal import Decimal
import json
import pytest
import time
from typing import Any, Dict, List

from src.core.telemetry.events import NodeStatus, AnomalyType
from src.lakehouse.quality.quality_rules import (
    normalize_currency,
    normalize_timestamp_utc,
    is_valid_primary_key,
    evaluate_quality_gate,
    deduplicate_records_deterministic,
    QualityGateResult,
    QuarantineRecord,
)
from src.lakehouse.transforms.bronze_to_silver import (
    BronzeToSilverTransformer,
    BatchTransformResult,
)


# ==============================================================================
# 1. Tests de Normalización Monetaria (ST-LAKE-03.1)
# ==============================================================================

def test_currency_normalization_variants():
    """Valida la conversión y limpieza de montos a DECIMAL(18,2) exacto."""
    assert normalize_currency("$1,250.50") == Decimal("1250.50")
    assert normalize_currency("1250.5") == Decimal("1250.50")
    assert normalize_currency(" $ 2,450.75 ") == Decimal("2450.75")
    assert normalize_currency("USD 300.00") == Decimal("300.00")
    assert normalize_currency(450) == Decimal("450.00")
    assert normalize_currency(99.99) == Decimal("99.99")
    assert normalize_currency("0") == Decimal("0.00")
    assert normalize_currency("$0.00") == Decimal("0.00")


def test_currency_normalization_negative_amounts():
    """Valida la detección correcta de números negativos con símbolos."""
    assert normalize_currency("-$50.00") == Decimal("-50.00")
    assert normalize_currency("-120.75") == Decimal("-120.75")
    assert normalize_currency("($25.50)") == Decimal("-25.50")


def test_currency_normalization_invalid_values():
    """Valida que valores no numéricos arrojen ValueError."""
    with pytest.raises(ValueError):
        normalize_currency(None)
    with pytest.raises(ValueError):
        normalize_currency("")
    with pytest.raises(ValueError):
        normalize_currency("   ")
    with pytest.raises(ValueError):
        normalize_currency("INVALID_AMOUNT")


# ==============================================================================
# 2. Tests de Tipado Estricto de Fechas UTC ISO 8601 (ST-LAKE-03.1)
# ==============================================================================

def test_date_normalization_to_utc_iso():
    """Valida la conversión estricta a formato ISO 8601 UTC con sufijo 'Z'."""
    assert normalize_timestamp_utc("2026-10-19T14:30:00Z") == "2026-10-19T14:30:00Z"
    assert normalize_timestamp_utc("2026-10-19 14:30:00") == "2026-10-19T14:30:00Z"
    assert normalize_timestamp_utc("2026-10-19") == "2026-10-19T00:00:00Z"

    # Fecha con offset (-05:00 Colombia -> UTC debe sumar 5 horas)
    norm = normalize_timestamp_utc("2026-10-19T09:30:00-05:00")
    assert norm == "2026-10-19T14:30:00Z"


def test_date_normalization_from_epoch():
    """Valida conversión desde timestamps numéricos."""
    # 1729346400 -> 2024-10-19T14:00:00Z
    norm_sec = normalize_timestamp_utc(1729346400)
    assert norm_sec == "2024-10-19T14:00:00Z"

    norm_ms = normalize_timestamp_utc(1729346400000)
    assert norm_ms == "2024-10-19T14:00:00Z"


def test_date_normalization_invalid_and_out_of_range():
    """Valida rechazo de fechas absurdas o corruptas."""
    with pytest.raises(ValueError):
        normalize_timestamp_utc(None)
    with pytest.raises(ValueError):
        normalize_timestamp_utc("2500-01-01")  # Año fuera de rango
    with pytest.raises(ValueError):
        normalize_timestamp_utc("FECHA_CORRUPTA")


# ==============================================================================
# 3. Tests de Deduplicación Determinística (ST-LAKE-03.2)
# ==============================================================================

def test_deterministic_deduplication():
    """Valida que ante registros duplicados se conserve la versión más reciente determinísticamente."""
    records = [
        {
            "id_orden": "ORD-101",
            "monto": 100.0,
            "fecha_transaccion": "2026-10-19T10:00:00Z",
            "canal": "TIENDA",
        },
        {
            "id_orden": "ORD-101",
            "monto": 120.0,  # Versión actualizada posterior
            "fecha_transaccion": "2026-10-19T12:00:00Z",
            "canal": "ONLINE",
        },
        {
            "id_orden": "ORD-102",
            "monto": 250.0,
            "fecha_transaccion": "2026-10-19T11:00:00Z",
            "canal": "PARTNER",
        },
    ]

    deduped, dropped = deduplicate_records_deterministic(
        records=records,
        key_fields=["id_orden"],
        timestamp_field="fecha_transaccion",
    )

    assert len(deduped) == 2
    assert dropped == 1

    # Verificar que para ORD-101 quedó la versión de las 12:00 (ONLINE, monto 120.0)
    ord_101 = next(r for r in deduped if r["id_orden"] == "ORD-101")
    assert ord_101["monto"] == 120.0
    assert ord_101["canal"] == "ONLINE"


def test_deduplication_tie_breaker_determinism():
    """Valida que ante timestamps idénticos el resultado sea 100% reproducible."""
    rec_a = {"id_orden": "ORD-999", "fecha_transaccion": "2026-10-19T10:00:00Z", "payload": "A"}
    rec_b = {"id_orden": "ORD-999", "fecha_transaccion": "2026-10-19T10:00:00Z", "payload": "B"}

    res1, _ = deduplicate_records_deterministic([rec_a, rec_b], key_fields=["id_orden"], timestamp_field="fecha_transaccion")
    res2, _ = deduplicate_records_deterministic([rec_b, rec_a], key_fields=["id_orden"], timestamp_field="fecha_transaccion")

    assert res1[0]["payload"] == res2[0]["payload"]


# ==============================================================================
# 4. Tests de Quality Gate & Desvío a Cuarentena (ST-LAKE-03.3)
# ==============================================================================

def test_quality_gate_quarantine_negative_amount():
    """Valida que registros con monto negativo sean desviados a cuarentena con código NEGATIVE_AMOUNT."""
    corrupt_record = {
        "_raw_id": "raw-uuid-001",
        "transaccion_id": "TX-NEG-01",
        "monto": "-$50.00",  # Anomalía F3
        "fecha_transaccion": "2026-10-19 14:00:00",
    }

    result = evaluate_quality_gate(corrupt_record, source_name="crm_transacciones")

    assert not result.is_valid
    assert result.failure_reason == "NEGATIVE_AMOUNT"
    assert result.quarantine_record is not None
    assert result.quarantine_record._raw_id == "raw-uuid-001"
    assert result.quarantine_record.failure_reason == "NEGATIVE_AMOUNT"
    assert "TX-NEG-01" in result.quarantine_record.raw_data


def test_quality_gate_quarantine_null_primary_key():
    """Valida desvío a cuarentena ante claves primarias nulas o inválidas."""
    invalid_records = [
        {"transaccion_id": None, "monto": 100.0, "fecha_transaccion": "2026-10-19 14:00:00"},
        {"transaccion_id": "   ", "monto": 100.0, "fecha_transaccion": "2026-10-19 14:00:00"},
        {"transaccion_id": "NULL", "monto": 100.0, "fecha_transaccion": "2026-10-19 14:00:00"},
    ]

    for rec in invalid_records:
        result = evaluate_quality_gate(rec, source_name="crm_transacciones")
        assert not result.is_valid
        assert result.failure_reason == "NULL_PRIMARY_KEY"
        assert result.quarantine_record is not None


# ==============================================================================
# 5. Tests de Métricas de Lote y Telemetría Midas Guardian (ST-LAKE-03.4)
# ==============================================================================

def test_batch_statistics_accounting_exactness():
    """
    Valida la ecuación contable matemática:
    total_read == valid_count + quarantined_count + duplicates_dropped
    """
    batch_input = [
        # 3 registros válidos únicos
        {"id_orden": "O-1", "monto": "$100.00", "fecha_transaccion": "2026-10-19 10:00:00"},
        {"id_orden": "O-2", "monto": "$200.00", "fecha_transaccion": "2026-10-19 10:00:00"},
        {"id_orden": "O-3", "monto": "$300.00", "fecha_transaccion": "2026-10-19 10:00:00"},
        # 1 duplicado de O-1 con fecha anterior
        {"id_orden": "O-1", "monto": "$90.00", "fecha_transaccion": "2026-10-19 09:00:00"},
        # 2 registros corruptos (uno negativo y uno con id nulo)
        {"id_orden": "O-CORRUPT", "monto": "-$25.00", "fecha_transaccion": "2026-10-19 10:00:00"},
        {"id_orden": None, "monto": "$50.00", "fecha_transaccion": "2026-10-19 10:00:00"},
    ]

    transformer = BronzeToSilverTransformer()
    res: BatchTransformResult = transformer.process_batch(
        records=batch_input,
        source_name="crm_pedidos",
        primary_key_fields=["id_orden"],
        amount_fields=["monto"],
        date_fields=["fecha_transaccion"],
        persist_to_storage=False,
    )

    assert res.total_read == 6
    assert res.valid_count == 3
    assert res.quarantined_count == 2
    assert res.duplicates_dropped == 1
    assert res.total_read == (res.valid_count + res.quarantined_count + res.duplicates_dropped)
    assert res.processing_ms >= 0.0


def test_guardian_telemetry_emission_on_auto_healing():
    """Valida que ante registros en cuarentena se emita AUTO_HEALING y Anomaly F3."""
    events_captured = []

    def mock_telemetry_pub(event: Dict[str, Any]):
        events_captured.append(event)

    transformer = BronzeToSilverTransformer(
        telemetry_publisher=mock_telemetry_pub,
        pipeline_id="dag_crm_sync",
        node_id="silver_cleansing",
    )

    records = [
        {"id_orden": "O-VALID", "monto": "$50.00", "fecha_transaccion": "2026-10-19 10:00:00"},
        {"id_orden": "O-FAIL", "monto": "-$99.00", "fecha_transaccion": "2026-10-19 10:00:00"},
    ]

    res = transformer.process_batch(
        records=records,
        source_name="crm_test",
        primary_key_fields=["id_orden"],
        persist_to_storage=False,
    )

    assert len(events_captured) == 1
    evt = events_captured[0]
    assert evt["node_id"] == "silver_cleansing"
    assert evt["status"] == NodeStatus.AUTO_HEALING.value
    assert evt["records_in"] == 2
    assert evt["records_out"] == 1
    assert evt["details"]["anomaly_type"] == AnomalyType.F3_NEGATIVE_AMOUNT.value
    assert evt["details"]["playbook_id"] == "QUARANTINE_INVALID_ROWS_V1"
    assert evt["details"]["quarantined_records"] == 1


def test_guardian_telemetry_emission_healthy_batch():
    """Valida que un lote sin fallos emita estado HEALTHY."""
    events_captured = []

    transformer = BronzeToSilverTransformer(
        telemetry_publisher=lambda e: events_captured.append(e),
    )

    records = [
        {"id_orden": "O-1", "monto": "$50.00", "fecha_transaccion": "2026-10-19 10:00:00"},
        {"id_orden": "O-2", "monto": "$100.00", "fecha_transaccion": "2026-10-19 10:00:00"},
    ]

    res = transformer.process_batch(
        records=records,
        source_name="crm_test",
        primary_key_fields=["id_orden"],
        persist_to_storage=False,
    )

    assert len(events_captured) == 1
    assert events_captured[0]["status"] == NodeStatus.HEALTHY.value
    assert events_captured[0]["records_in"] == 2
    assert events_captured[0]["records_out"] == 2


# ==============================================================================
# 6. Test de Integración con MinIO S3 Mock
# ==============================================================================

class MockMinioClient:
    """Mock in-memory de MidasMinioClient para pruebas de persistencia."""
    def __init__(self):
        self.storage: Dict[str, Dict[str, bytes]] = {
            "midas-silver": {},
            "midas-quarantine": {},
        }

    def put_object(self, bucket: str, object_name: str, data: bytes, content_type: str = "application/json") -> str:
        if bucket not in self.storage:
            self.storage[bucket] = {}
        self.storage[bucket][object_name] = data
        return "etag-mock-12345"


def test_end_to_end_bronze_to_silver_with_storage_persistence():
    """Valida el ciclo completo end-to-end con persistencia en buckets Silver y Quarantine."""
    mock_minio = MockMinioClient()

    transformer = BronzeToSilverTransformer(
        minio_client=mock_minio,
        pipeline_id="test_pipeline",
    )

    records = [
        {"transaccion_id": "TX-01", "monto": "$150.50", "fecha_transaccion": "2026-10-19 12:00:00"},
        {"transaccion_id": "TX-02", "monto": "-$10.00", "fecha_transaccion": "2026-10-19 12:00:00"},
    ]

    res = transformer.process_batch(
        records=records,
        source_name="crm_transacciones",
        primary_key_fields=["transaccion_id"],
        amount_fields=["monto"],
        date_fields=["fecha_transaccion"],
        persist_to_storage=True,
    )

    assert res.valid_count == 1
    assert res.quarantined_count == 1
    assert res.silver_path.startswith("s3://midas-silver/clean/crm_transacciones/")
    assert res.quarantine_path.startswith("s3://midas-quarantine/silver_quarantine/crm_transacciones/")

    # Verificar que el objeto guardado en Silver tiene el formato normalizado
    silver_obj_name = res.silver_path.replace("s3://midas-silver/", "")
    stored_silver_json = json.loads(mock_minio.storage["midas-silver"][silver_obj_name].decode("utf-8"))
    assert len(stored_silver_json) == 1
    assert stored_silver_json[0]["transaccion_id"] == "TX-01"
    assert stored_silver_json[0]["monto"] == 150.50
    assert stored_silver_json[0]["fecha_transaccion"] == "2026-10-19T12:00:00Z"

    # Verificar que el objeto guardado en Quarantine tiene la estructura canónica de silver.quarantine_records
    quarantine_obj_name = res.quarantine_path.replace("s3://midas-quarantine/", "")
    stored_quarantine_json = json.loads(mock_minio.storage["midas-quarantine"][quarantine_obj_name].decode("utf-8"))
    assert len(stored_quarantine_json) == 1
    assert stored_quarantine_json[0]["failure_reason"] == "NEGATIVE_AMOUNT"
    assert stored_quarantine_json[0]["source_name"] == "crm_transacciones"


def test_bronze_envelope_unwrapping():
    """Valida que los registros que provienen envueltos con el envelope de Bronze sean procesados transparentemente."""
    raw_payload_dict = {
        "transaccion_id": "TX-ENVELOPE-01",
        "monto": "$500.00",
        "fecha_transaccion": "2026-10-19 15:00:00",
    }
    bronze_enveloped_record = {
        "_raw_id": "uuid-envelope-123",
        "_source_type": "JDBC_POSTGRES",
        "_source_origin": "crm_operaciones",
        "_ingested_at": "2026-10-19T15:01:00Z",
        "_batch_id": "batch_bronze_01",
        "_schema_fingerprint": "a" * 64,
        "_raw_payload": json.dumps(raw_payload_dict),
    }

    transformer = BronzeToSilverTransformer()
    res = transformer.process_batch(
        records=[bronze_enveloped_record],
        source_name="crm_operaciones",
        primary_key_fields=["transaccion_id"],
        amount_fields=["monto"],
        date_fields=["fecha_transaccion"],
        persist_to_storage=False,
    )

    assert res.valid_count == 1
    assert res.quarantined_count == 0
    clean_rec = res.valid_records[0]
    assert clean_rec["transaccion_id"] == "TX-ENVELOPE-01"
    assert clean_rec["monto"] == 500.00
    assert clean_rec["fecha_transaccion"] == "2026-10-19T15:00:00Z"
    # Preserva metadatos de auditoría de Bronze
    assert clean_rec["_raw_id"] == "uuid-envelope-123"
