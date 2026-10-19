"""
Midas Lakehouse - ACID Storage Manager & Iceberg v2 Engine
Historia de Usuario: HU-LAKE-01
Responsable: Edgar Corzo (Data Engineering Lead)

Soporta:
1. Snapshot Isolation (transacciones atómicas con nuevos snapshot IDs)
2. Time-Travel Queries (FOR SYSTEM_TIME AS OF / snapshot_id)
3. Schema Evolution (adición dinámica de columnas sin reescritura física)
"""

import logging
from typing import List, Dict, Optional, Any
from datetime import datetime

try:
    import pyarrow as pa
except ImportError:
    pa = None

try:
    from pyiceberg.schema import Schema
    from pyiceberg.types import (
        NestedField,
        StringType,
        IntegerType,
        LongType,
        DoubleType,
        TimestampType,
        BooleanType,
    )
    from pyiceberg.table import Table
    from pyiceberg.catalog import Catalog
except ImportError:
    Schema = None
    NestedField = None
    StringType = None
    IntegerType = None
    LongType = None
    DoubleType = None
    TimestampType = None
    BooleanType = None
    Table = None
    Catalog = None

from src.lakehouse.storage.iceberg_catalog_client import MidasIcebergCatalogClient

logger = logging.getLogger("midas.lakehouse.storage.acid")


class MidasAcidStorageManager:
    """Administrador de operaciones transaccionales ACID y Time-Travel para Apache Iceberg v2."""

    def __init__(
        self,
        catalog_client: Optional[MidasIcebergCatalogClient] = None,
        custom_catalog: Optional[Any] = None,
    ):
        self.catalog_client = catalog_client or MidasIcebergCatalogClient()
        self._custom_catalog = custom_catalog

    @property
    def catalog(self) -> Catalog:
        if self._custom_catalog is not None:
            return self._custom_catalog
        return self.catalog_client.catalog

    def create_table_v2(
        self,
        identifier: str,
        schema: Schema,
        location: Optional[str] = None,
        properties: Optional[Dict[str, str]] = None,
    ) -> Table:
        """
        Crea una tabla en formato Apache Iceberg v2 con soporte ACID estricto.
        """
        table_properties = {
            "format-version": "2",
            "write.parquet.compression-codec": "zstd",
            "write.object-storage.enabled": "true",
        }
        if properties:
            table_properties.update(properties)

        table = self.catalog.create_table(
            identifier=identifier,
            schema=schema,
            location=location,
            properties=table_properties,
        )
        logger.info(f"Tabla Iceberg v2 '{identifier}' creada exitosamente en location: {table.location()}")
        return table

    def append_data(self, identifier: str, data: Any) -> int:
        """
        Inserta datos atómicamente en la tabla generando un nuevo Snapshot (Snapshot Isolation).
        Retorna el snapshot_id resultante de la transacción.
        """
        table = self.catalog.load_table(identifier)
        
        # Aceptar pyarrow.Table o lista de diccionarios
        arrow_table = data
        if pa is not None and not isinstance(data, pa.Table):
            if isinstance(data, list):
                arrow_table = pa.Table.from_pylist(data)
            elif hasattr(data, "to_arrow"):
                arrow_table = data.to_arrow()

        table.append(arrow_table)
        table.refresh()

        current_snapshot = table.current_snapshot()
        snapshot_id = current_snapshot.snapshot_id if current_snapshot else -1
        logger.info(f"Datos insertados en '{identifier}'. Nuevo Snapshot ID: {snapshot_id}")
        return snapshot_id

    def evolve_schema_add_column(
        self,
        identifier: str,
        column_name: str,
        column_type: Any,
        doc: Optional[str] = None,
        required: bool = False,
    ) -> Schema:
        """
        Evoluciona el esquema de la tabla añadiendo una nueva columna sin reescribir datos existentes.
        Garantiza compatibilidad retroactiva (Schema Evolution).
        """
        table = self.catalog.load_table(identifier)
        with table.update_schema() as update:
            update.add_column(
                path=column_name,
                field_type=column_type,
                doc=doc or f"Columna evolucionada {column_name}",
                required=required,
            )
        table.refresh()
        logger.info(f"Esquema de '{identifier}' evolucionado con éxito. Columna agregada: {column_name}")
        return table.schema()

    def get_snapshot_history(self, identifier: str) -> List[Dict[str, Any]]:
        """
        Retorna el historial completo de transacciones/snapshots de la tabla.
        """
        table = self.catalog.load_table(identifier)
        snapshots = []
        for s in table.snapshots():
            summary_dict = {}
            if s.summary:
                summary_dict["operation"] = str(s.summary.operation)
                if hasattr(s.summary, "additional_properties") and s.summary.additional_properties:
                    summary_dict.update(s.summary.additional_properties)

            snapshots.append({
                "snapshot_id": s.snapshot_id,
                "parent_snapshot_id": s.parent_snapshot_id,
                "timestamp_ms": s.timestamp_ms,
                "timestamp_iso": datetime.fromtimestamp(s.timestamp_ms / 1000.0).isoformat(),
                "manifest_list": s.manifest_list,
                "summary": summary_dict,
            })
        return snapshots

    def read_time_travel_by_snapshot(self, identifier: str, snapshot_id: int) -> Any:
        """
        Ejecuta una consulta Time-Travel sobre un Snapshot ID específico (Snapshot Isolation).
        """
        table = self.catalog.load_table(identifier)
        scan = table.scan(snapshot_id=snapshot_id)
        return scan.to_arrow()

    def read_time_travel_as_of_timestamp(self, identifier: str, timestamp_ms: int) -> Any:
        """
        Ejecuta una consulta Time-Travel en un punto exacto en el tiempo (FOR SYSTEM_TIME AS OF).
        """
        table = self.catalog.load_table(identifier)
        # Encontrar el snapshot más reciente que sea <= timestamp_ms
        matching_snapshot = None
        for s in table.snapshots():
            if s.timestamp_ms <= timestamp_ms:
                if matching_snapshot is None or s.timestamp_ms > matching_snapshot.timestamp_ms:
                    matching_snapshot = s

        if matching_snapshot is None:
            raise ValueError(f"No existe ningún snapshot previo o igual al timestamp {timestamp_ms}")

        scan = table.scan(snapshot_id=matching_snapshot.snapshot_id)
        return scan.to_arrow()

    def read_current(self, identifier: str) -> Any:
        """Lee el estado actual de la tabla."""
        table = self.catalog.load_table(identifier)
        return table.scan().to_arrow()
