"""
Midas Lakehouse Ingestion - Schema Fingerprinting and Bronze Enveloping
Historia de Usuario: HU-LAKE-02 (Universal Ingestion Multi-Fuente)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
"""

import datetime
import hashlib
import json
import uuid
from typing import Any, Dict, Iterable, List, Optional, Union


def compute_schema_fingerprint(columns: Union[Iterable[str], Dict[str, Any]]) -> str:
    """
    Computes a deterministic SHA-256 hash representing a table or dataset schema.
    
    If columns is a dict (mapping column_name -> data_type), both column name and type
    are normalized and included.
    If columns is an iterable of names, names are lowercased, stripped, and sorted.
    """
    if isinstance(columns, dict):
        normalized = [
            f"{str(col).strip().lower()}:{str(dtype).strip().lower()}"
            for col, dtype in sorted(columns.items(), key=lambda item: str(item[0]).strip().lower())
        ]
    else:
        normalized = sorted({str(c).strip().lower() for c in columns if c is not None})
    
    canonical_repr = "|".join(normalized)
    return hashlib.sha256(canonical_repr.encode("utf-8")).hexdigest()


def compute_payload_hash(payload: Any) -> str:
    """
    Computes a deterministic SHA-256 hash of a raw record payload for integrity and deduplication.
    Handles datetime, date, UUID, and custom objects gracefully.
    """
    def _json_serial(obj):
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        if isinstance(obj, uuid.UUID):
            return str(obj)
        return str(obj)

    if isinstance(payload, str):
        raw_str = payload
    else:
        raw_str = json.dumps(payload, sort_keys=True, default=_json_serial, ensure_ascii=False)
        
    return hashlib.sha256(raw_str.encode("utf-8")).hexdigest()


def create_bronze_envelope(
    record: Dict[str, Any],
    source_type: str,
    source_origin: str,
    batch_id: str,
    schema_fingerprint: Optional[str] = None,
    ingested_at: Optional[datetime.datetime] = None,
    raw_id: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Wraps any raw record into the canonical Midas Bronze Audit Envelope:
    
    - _raw_id: Unique UUID string for the ingestion record.
    - _source_type: Canonical source identifier (e.g., 'JDBC_POSTGRES', 'EXCEL_SPREADSHEET', 'REST_API_CRM').
    - _source_origin: Target table, worksheet, or endpoint URL.
    - _ingested_at: ISO 8601 UTC timestamp.
    - _batch_id: Unique batch / pipeline execution ID.
    - _schema_fingerprint: SHA-256 hash of the columns.
    - _raw_payload_hash: SHA-256 hash of the raw JSON content.
    - _raw_payload: Original record serialized as JSON string.
    """
    def _json_serial(obj):
        if isinstance(obj, (datetime.datetime, datetime.date)):
            return obj.isoformat()
        if isinstance(obj, uuid.UUID):
            return str(obj)
        return str(obj)

    timestamp = ingested_at or datetime.datetime.now(datetime.timezone.utc)
    ingested_iso = timestamp.isoformat()
    raw_id_str = raw_id or str(uuid.uuid4())

    # Calculate fingerprint if not provided
    if schema_fingerprint is None:
        schema_fingerprint = compute_schema_fingerprint(list(record.keys()))

    payload_json = json.dumps(record, sort_keys=True, default=_json_serial, ensure_ascii=False)
    payload_hash = compute_payload_hash(payload_json)

    return {
        "_raw_id": raw_id_str,
        "_source_type": source_type,
        "_source_origin": source_origin,
        "_ingested_at": ingested_iso,
        "_batch_id": batch_id,
        "_schema_fingerprint": schema_fingerprint,
        "_raw_payload_hash": payload_hash,
        "_raw_payload": payload_json,
    }


def detect_schema_drift(baseline_fingerprint: str, current_fingerprint: str) -> bool:
    """
    Compares baseline and current fingerprints. Returns True if schema drift is detected.
    """
    if not baseline_fingerprint or not current_fingerprint:
        return False
    return baseline_fingerprint.strip().lower() != current_fingerprint.strip().lower()
