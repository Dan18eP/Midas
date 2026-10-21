"""
Midas Lakehouse - Automated Tests for Storage MinIO & Iceberg v2
Historia de Usuario: HU-LAKE-01
Responsable: Edgar Corzo (Data Engineering Lead)
"""

import os
import time
import pytest
import pyarrow as pa
from pyiceberg.catalog import load_catalog
from pyiceberg.schema import Schema
from pyiceberg.types import (
    NestedField,
    StringType,
    LongType,
    DoubleType,
)

from src.lakehouse.storage.minio_client import MidasMinioClient, CANONICAL_BUCKETS
from src.lakehouse.storage.iceberg_catalog_client import MidasIcebergCatalogClient, CANONICAL_NAMESPACES
from src.lakehouse.storage.acid_manager import MidasAcidStorageManager


def test_canonical_buckets_definition():
    """Valida que los 5 buckets requeridos por la especificación 03 estén definidos."""
    expected = [
        "midas-bronze",
        "midas-silver",
        "midas-gold",
        "midas-quarantine",
        "midas-governance",
    ]
    assert CANONICAL_BUCKETS == expected
    assert len(CANONICAL_BUCKETS) == 5


def test_canonical_namespaces_definition():
    """Valida los namespaces del catálogo Iceberg para la arquitectura Medallón."""
    expected = ["bronze", "silver", "gold", "quarantine"]
    assert CANONICAL_NAMESPACES == expected


def test_minio_client_initialization():
    """Valida la instanciación y parseo de endpoint del cliente MinIO."""
    client = MidasMinioClient(
        endpoint="http://localhost:9000",
        access_key="test_user",
        secret_key="test_pass",
    )
    assert client.endpoint_host == "localhost:9000"
    assert client.access_key == "test_user"
    assert client.secure is False


def test_iceberg_catalog_client_properties():
    """Valida la configuración de propiedades del catálogo Iceberg REST."""
    client = MidasIcebergCatalogClient(
        catalog_uri="http://localhost:8181",
        warehouse="s3://midas-bronze/",
        s3_endpoint="http://localhost:9000",
    )
    props = client.get_catalog_properties()
    assert props["type"] == "rest"
    assert props["uri"] == "http://localhost:8181"
    assert props["warehouse"] == "s3://midas-bronze/"
    assert props["s3.endpoint"] == "http://localhost:9000"
    assert props["s3.path-style-access"] == "true"


def test_acid_lifecycle_snapshots_time_travel_and_schema_evolution(tmp_path):
    """
    Valida el ciclo de vida completo ACID:
    1. Creación de tabla Iceberg v2
    2. Snapshot Isolation (inserciones secuenciales con nuevos Snapshot IDs)
    3. Time-Travel Query (lectura histórica consistente en snapshot previo)
    4. Schema Evolution (adición dinámica de columna sin reescritura)
    """
    # Usar catálogo SQL SQLite y FsspecFileIO para compatibilidad multiplataforma
    db_file = tmp_path / "iceberg_catalog.db"
    warehouse_dir = tmp_path / "warehouse"
    warehouse_dir.mkdir(parents=True, exist_ok=True)

    db_path = str(db_file).replace("\\", "/")
    wh_path = str(warehouse_dir).replace("\\", "/")

    catalog = load_catalog(
        "test_sql_catalog",
        **{
            "type": "sql",
            "uri": f"sqlite:///{db_path}",
            "warehouse": f"file:///{wh_path}",
            "py-io-impl": "pyiceberg.io.fsspec.FsspecFileIO",
        },
    )

    catalog.create_namespace("bronze")
    acid_mgr = MidasAcidStorageManager(custom_catalog=catalog)

    # 1. Definir esquema base Iceberg v2
    schema = Schema(
        NestedField(field_id=1, name="transaccion_id", field_type=StringType(), required=False),
        NestedField(field_id=2, name="cliente_id", field_type=LongType(), required=False),
        NestedField(field_id=3, name="monto", field_type=DoubleType(), required=False),
    )

    table_id = "bronze.crm_transacciones_test"
    table = acid_mgr.create_table_v2(identifier=table_id, schema=schema)
    assert table is not None
    assert table.format_version == 2

    # 2. Inserción Lote 1 -> Snapshot 1
    pa_schema1 = pa.schema([
        pa.field("transaccion_id", pa.string(), nullable=True),
        pa.field("cliente_id", pa.int64(), nullable=True),
        pa.field("monto", pa.float64(), nullable=True),
    ])
    df1 = pa.Table.from_pydict({
        "transaccion_id": ["TX-001", "TX-002"],
        "cliente_id": [101, 102],
        "monto": [150.0, 250.0],
    }, schema=pa_schema1)
    snap_1_id = acid_mgr.append_data(table_id, df1)
    assert snap_1_id != -1

    # Inserción Lote 2 -> Snapshot 2
    time.sleep(0.02)
    df2 = pa.Table.from_pydict({
        "transaccion_id": ["TX-003"],
        "cliente_id": [103],
        "monto": [350.0],
    }, schema=pa_schema1)
    snap_2_id = acid_mgr.append_data(table_id, df2)
    assert snap_2_id != snap_1_id

    # Validar Historial de Snapshots
    history = acid_mgr.get_snapshot_history(table_id)
    assert len(history) == 2
    assert history[0]["snapshot_id"] == snap_1_id
    assert history[1]["snapshot_id"] == snap_2_id
    assert history[1]["parent_snapshot_id"] == snap_1_id

    # 3. Validación de Time-Travel (Lectura en Snapshot 1 vs Estado Actual)
    arrow_snap1 = acid_mgr.read_time_travel_by_snapshot(table_id, snapshot_id=snap_1_id)
    assert len(arrow_snap1) == 2  # Solo los primeros 2 registros

    arrow_current = acid_mgr.read_current(table_id)
    assert len(arrow_current) == 3  # Los 3 registros totales

    # 4. Schema Evolution: Agregar columna "canal_venta" sin reescritura física
    evolved_schema = acid_mgr.evolve_schema_add_column(
        identifier=table_id,
        column_name="canal_venta",
        column_type=StringType(),
        doc="Canal de venta operacional",
        required=False,
    )
    assert "canal_venta" in [f.name for f in evolved_schema.fields]

    # Inserción Lote 3 con la columna nueva
    pa_schema2 = pa.schema([
        pa.field("transaccion_id", pa.string(), nullable=True),
        pa.field("cliente_id", pa.int64(), nullable=True),
        pa.field("monto", pa.float64(), nullable=True),
        pa.field("canal_venta", pa.string(), nullable=True),
    ])
    df3 = pa.Table.from_pydict({
        "transaccion_id": ["TX-004"],
        "cliente_id": [104],
        "monto": [450.0],
        "canal_venta": ["ONLINE"],
    }, schema=pa_schema2)
    snap_3_id = acid_mgr.append_data(table_id, df3)
    assert snap_3_id != snap_2_id

    # Verificar que el estado actual tiene la columna nueva y 4 registros
    arrow_after_evolution = acid_mgr.read_current(table_id)
    assert len(arrow_after_evolution) == 4
    assert "canal_venta" in arrow_after_evolution.column_names

    # Time-Travel retrospectivo a Snapshot 1 sigue devolviendo exactamente los 2 registros originales
    arrow_time_travel_past = acid_mgr.read_time_travel_by_snapshot(table_id, snapshot_id=snap_1_id)
    assert len(arrow_time_travel_past) == 2
