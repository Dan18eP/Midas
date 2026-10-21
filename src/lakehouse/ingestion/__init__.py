"""
Midas Lakehouse Ingestion Package
Historia de Usuario: HU-LAKE-02 & HU-LAKE-05
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
"""

from src.lakehouse.ingestion.fingerprint import (
    compute_schema_fingerprint,
    compute_payload_hash,
    create_bronze_envelope,
    detect_schema_drift,
)
from src.lakehouse.ingestion.postgres_connector import PostgresSourceConnector
from src.lakehouse.ingestion.excel_connector import ExcelSourceConnector
from src.lakehouse.ingestion.rest_connector import RestApiSourceConnector
from src.lakehouse.ingestion.universal_engine import (
    UniversalIngestionEngine,
    IngestionResult,
)
from src.lakehouse.ingestion.connection_registry import (
    SourceConnectionRegistry,
    get_connection_registry,
    reset_connection_registry,
)

__all__ = [
    "compute_schema_fingerprint",
    "compute_payload_hash",
    "create_bronze_envelope",
    "detect_schema_drift",
    "PostgresSourceConnector",
    "ExcelSourceConnector",
    "RestApiSourceConnector",
    "UniversalIngestionEngine",
    "IngestionResult",
    "SourceConnectionRegistry",
    "get_connection_registry",
    "reset_connection_registry",
]
