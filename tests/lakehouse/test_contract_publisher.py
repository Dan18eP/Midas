"""Midas Lakehouse - Pruebas Automatizadas del Publicador de Contratos Declarativos.

Historia de Usuario: HU-LAKE-05 & HU-BACK-03
Autor: Daniel Echeverría (Backend & API Architect)
"""

import pytest

from src.lakehouse.ingestion.contract_publisher import (
    build_canonical_contract,
    publish_connection_contract,
)
from src.orchestration.dag_factory import _validate_spec


class MockMinioClient:
    """Mock ligero de MinIO para pruebas unitarias sin red."""

    def __init__(self):
        self.objects = {}
        self.buckets = set(["midas-governance"])

    def check_health(self):
        return True

    def bucket_exists(self, name):
        return name in self.buckets

    def make_bucket(self, name):
        self.buckets.add(name)

    @property
    def client(self):
        return self

    def put_object(self, bucket_name, object_name, data, length, content_type):
        self.objects[f"{bucket_name}/{object_name}"] = {
            "data": data.read(),
            "content_type": content_type,
        }


def test_build_canonical_contract_postgres():
    """Valida la generación de contratos para fuentes PostgreSQL."""
    payload = {"schema": "public", "table": "crm_pedidos", "url_env": "POSTGRES_OPERATIONAL_URL"}
    contract = build_canonical_contract("conn_pg_crm", "POSTGRES", payload)

    assert contract["kind"] == "connection"
    assert contract["conn_id"] == "conn_pg_crm"
    assert contract["source"]["type"] == "postgres"
    assert contract["source"]["table"] == "crm_pedidos"
    assert contract["silver"]["table"].startswith("silver.")

    # Debe pasar la validación estricta de Airflow dag_factory
    _validate_spec(contract)


def test_build_canonical_contract_excel():
    """Valida la generación de contratos para fuentes Excel con ruta S3."""
    payload = {"filename": "presupuesto_2026.xlsx", "detected_columns": ["id", "departamento", "monto_total", "fecha"]}
    contract = build_canonical_contract("conn_excel_q4", "EXCEL", payload, storage_uri="s3://midas-bronze/sources/conn_excel_q4/raw/presupuesto.xlsx")

    assert contract["kind"] == "connection"
    assert contract["conn_id"] == "conn_excel_q4"
    assert contract["source"]["type"] == "excel"
    assert "presupuesto.xlsx" in contract["source"]["path"]
    assert "monto_total" in contract["silver"]["amount_fields"]

    # Debe pasar la validación estricta de Airflow dag_factory
    _validate_spec(contract)


def test_build_canonical_contract_csv():
    """Valida la generación de contratos para fuentes CSV."""
    payload = {"filename": "ventas.csv", "detected_columns": ["pedido_id", "cliente_id", "precio", "fecha_hora"]}
    contract = build_canonical_contract("conn_csv_ventas", "CSV", payload)

    assert contract["kind"] == "connection"
    assert contract["source"]["type"] == "csv"

    # Debe pasar la validación estricta de Airflow dag_factory
    _validate_spec(contract)


def test_publish_connection_contract_mock():
    """Valida la persistencia en el bucket de gobernanza de MinIO."""
    mock_minio = MockMinioClient()
    uri = publish_connection_contract(
        connection_id="conn_csv_test",
        source_type="CSV",
        config_payload={"path": "s3://midas-bronze/data.csv"},
        minio_client=mock_minio,
    )

    assert uri == "s3://midas-governance/source-contracts/conn_csv_test.yaml"
    assert "midas-governance/source-contracts/conn_csv_test.yaml" in mock_minio.objects
    saved_bytes = mock_minio.objects["midas-governance/source-contracts/conn_csv_test.yaml"]["data"]
    assert b"kind: connection" in saved_bytes
    assert b"conn_id: conn_csv_test" in saved_bytes
