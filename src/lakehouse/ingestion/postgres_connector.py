"""
Midas Lakehouse Ingestion - PostgreSQL JDBC Connector
Historia de Usuario: HU-LAKE-02 (Universal Ingestion Multi-Fuente)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
"""

import logging
import os
from typing import Any, Callable, Dict, Generator, List, Optional, Union

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:
    psycopg = None
    dict_row = None

from src.lakehouse.ingestion.fingerprint import (
    compute_schema_fingerprint,
    create_bronze_envelope,
)

logger = logging.getLogger("midas.lakehouse.ingestion.postgres")


class PostgresSourceConnector:
    """
    Extractor de ingesta para fuentes relacionales PostgreSQL (JDBC / psycopg3).
    Soporta extracción por lotes paginados, extracción incremental por marca de agua (watermark),
    y envoltura canónica automática en la capa Bronze.
    """

    def __init__(
        self,
        connection_url: Optional[str] = None,
        query_executor: Optional[Callable[[str, tuple], List[Dict[str, Any]]]] = None,
    ):
        """
        Inicializa el conector.
        :param connection_url: URI de conexión postgresql://user:pass@host:port/dbname.
        :param query_executor: Opcional. Callback para ejecutar queries (útil para inyección de mocks y testing).
        """
        self.connection_url = connection_url or os.getenv(
            "POSTGRES_OPERATIONAL_URL",
            os.getenv("DATABASE_URL", "postgresql://midas_user:midas_secret_2026@localhost:5432/midas_operational"),
        )
        self._query_executor = query_executor

    def _execute_query(self, query: str, params: tuple = ()) -> List[Dict[str, Any]]:
        """Ejecuta una consulta SQL y retorna los registros como lista de diccionarios."""
        if self._query_executor is not None:
            return self._query_executor(query, params)

        if psycopg is None:
            raise RuntimeError("La librería 'psycopg' no está instalada en el entorno.")

        try:
            with psycopg.connect(self.connection_url, row_factory=dict_row) as conn:
                with conn.cursor() as cur:
                    cur.execute(query, params)
                    results = cur.fetchall()
                    return [dict(row) for row in results]
        except Exception as exc:
            logger.error("Error ejecutando consulta en PostgreSQL: %s | Query: %s", exc, query)
            raise

    def get_table_schema(self, table_name: str, schema_name: str = "public") -> Dict[str, str]:
        """
        Obtiene los nombres y tipos de columnas para la tabla indicada desde information_schema.
        """
        query = """
            SELECT column_name, data_type
            FROM information_schema.columns
            WHERE table_schema = %s AND table_name = %s
            ORDER BY ordinal_position;
        """
        rows = self._execute_query(query, (schema_name, table_name))
        return {r["column_name"]: r["data_type"] for r in rows}

    def extract_batch(
        self,
        table_name: str,
        batch_id: str,
        batch_size: int = 1000,
        offset: int = 0,
        columns: Optional[List[str]] = None,
        order_by: Optional[str] = None,
        schema_name: str = "public",
    ) -> List[Dict[str, Any]]:
        """
        Extrae un lote acotado de registros y los envuelve en el contrato canónico Bronze.
        """
        cols_clause = ", ".join(columns) if columns else "*"
        order_clause = f"ORDER BY {order_by}" if order_by else ""
        query = f"SELECT {cols_clause} FROM {schema_name}.{table_name} {order_clause} LIMIT %s OFFSET %s"

        raw_rows = self._execute_query(query, (batch_size, offset))
        if not raw_rows:
            return []

        # Obtener fingerprint del esquema del lote
        sample_keys = list(raw_rows[0].keys())
        fingerprint = compute_schema_fingerprint(sample_keys)

        enveloped_records = [
            create_bronze_envelope(
                record=row,
                source_type="JDBC_POSTGRES",
                source_origin=f"{schema_name}.{table_name}",
                batch_id=batch_id,
                schema_fingerprint=fingerprint,
            )
            for row in raw_rows
        ]
        logger.info(
            "Extraído lote de %d registros desde %s.%s (offset=%d, batch_id=%s)",
            len(enveloped_records),
            schema_name,
            table_name,
            offset,
            batch_id,
        )
        return enveloped_records

    def extract_incremental(
        self,
        table_name: str,
        batch_id: str,
        watermark_column: str,
        watermark_value: Any,
        batch_size: int = 1000,
        columns: Optional[List[str]] = None,
        schema_name: str = "public",
    ) -> List[Dict[str, Any]]:
        """
        Extrae registros de manera incremental filtrando por columna de auditoría/marca de agua.
        Ejemplo: updated_at > watermark_value
        """
        cols_clause = ", ".join(columns) if columns else "*"
        query = f"""
            SELECT {cols_clause} FROM {schema_name}.{table_name}
            WHERE {watermark_column} > %s
            ORDER BY {watermark_column} ASC
            LIMIT %s
        """
        raw_rows = self._execute_query(query, (watermark_value, batch_size))
        if not raw_rows:
            return []

        sample_keys = list(raw_rows[0].keys())
        fingerprint = compute_schema_fingerprint(sample_keys)

        enveloped_records = [
            create_bronze_envelope(
                record=row,
                source_type="JDBC_POSTGRES",
                source_origin=f"{schema_name}.{table_name}",
                batch_id=batch_id,
                schema_fingerprint=fingerprint,
            )
            for row in raw_rows
        ]
        logger.info(
            "Extraído lote incremental de %d registros desde %s.%s (watermark %s > %s)",
            len(enveloped_records),
            schema_name,
            table_name,
            watermark_column,
            watermark_value,
        )
        return enveloped_records

    def iterate_all(
        self,
        table_name: str,
        batch_id: str,
        batch_size: int = 1000,
        order_by: Optional[str] = None,
        schema_name: str = "public",
    ) -> Generator[List[Dict[str, Any]], None, None]:
        """
        Generador que itera sobre la tabla completa en lotes de tamaño batch_size.
        """
        offset = 0
        while True:
            batch = self.extract_batch(
                table_name=table_name,
                batch_id=batch_id,
                batch_size=batch_size,
                offset=offset,
                order_by=order_by,
                schema_name=schema_name,
            )
            if not batch:
                break
            yield batch
            if len(batch) < batch_size:
                break
            offset += batch_size
