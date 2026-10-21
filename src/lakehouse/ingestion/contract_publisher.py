"""Midas Lakehouse - Publicador de Contratos Declarativos para Orquestación en Airflow.

Historia de Usuario: HU-LAKE-05 & HU-BACK-03
Autor: Daniel Echeverría (Backend & API Architect)
Genera especificaciones canónicas YAML y las persiste en s3://midas-governance/source-contracts/
para que el DAG Factory de Airflow materialice pipelines automáticos en caliente.
"""

from __future__ import annotations

import io
import logging
import re
from typing import Any, Dict, Optional

import yaml

from src.lakehouse.storage.minio_client import MidasMinioClient

logger = logging.getLogger("midas.lakehouse.contract_publisher")

GOVERNANCE_BUCKET = "midas-governance"
CONTRACT_PREFIX = "source-contracts"


def build_canonical_contract(
    connection_id: str,
    source_type: str,
    config_payload: Dict[str, Any],
    storage_uri: Optional[str] = None,
    cron_schedule: str = "0 0 * * *",
) -> Dict[str, Any]:
    """Construye un diccionario de contrato de conexión conforme a las reglas de dag_factory."""
    clean_conn_id = re.sub(r"[^a-z0-9_]", "_", connection_id.lower()).strip("_")
    stype_lower = source_type.lower()

    # Mapeo a tipos soportados por dag_factory
    if "postgres" in stype_lower:
        normalized_type = "postgres"
    elif "excel" in stype_lower:
        normalized_type = "excel"
    elif "csv" in stype_lower:
        normalized_type = "csv"
    elif "rest" in stype_lower:
        normalized_type = "rest_api"
    else:
        normalized_type = "csv"

    # Construcción de la sección source
    source_section: Dict[str, Any] = {"type": normalized_type}
    if normalized_type == "postgres":
        source_section["schema"] = config_payload.get("schema", "public")
        source_section["table"] = config_payload.get("table", "crm_transacciones")
        source_section["url_env"] = config_payload.get("url_env", "POSTGRES_OPERATIONAL_URL")
    elif normalized_type in ("csv", "excel"):
        raw_path = storage_uri or config_payload.get("storage_path") or config_payload.get("path")
        if not raw_path:
            filename = config_payload.get("filename", f"{clean_conn_id}.{normalized_type}")
            raw_path = f"s3://midas-bronze/sources/{clean_conn_id}/raw/{filename}"
        source_section["path"] = raw_path
    elif normalized_type == "rest_api":
        source_section["url"] = config_payload.get("url", "https://api.midas.local/v1/data")
        if "headers_env" in config_payload:
            source_section["headers_env"] = config_payload["headers_env"]

    # Deducción del nombre de tabla en capa Silver
    clean_suffix = clean_conn_id.replace("conn_", "")
    silver_table_name = f"silver.clean_{clean_suffix}"

    # Detección de columnas de negocio desde metadatos
    detected_cols = config_payload.get("detected_columns") or []
    amount_fields = [c for c in detected_cols if any(k in c.lower() for k in ("monto", "precio", "valor", "total", "amount", "price"))] or ["monto_bruto"]
    date_fields = [c for c in detected_cols if any(k in c.lower() for k in ("fecha", "date", "time", "created"))] or ["fecha"]
    pk_fields = [c for c in detected_cols if any(k in c.lower() for k in ("id", "codigo", "key"))] or ["id"]

    return {
        "kind": "connection",
        "conn_id": clean_conn_id,
        "cron_schedule": cron_schedule,
        "source": source_section,
        "silver": {
            "table": silver_table_name,
            "primary_key_fields": pk_fields[:3],
            "amount_fields": amount_fields[:4],
            "date_fields": date_fields[:3],
        },
    }


def publish_connection_contract(
    connection_id: str,
    source_type: str,
    config_payload: Dict[str, Any],
    storage_uri: Optional[str] = None,
    minio_client: Optional[MidasMinioClient] = None,
) -> Optional[str]:
    """Serializa y publica el contrato YAML en s3://midas-governance/source-contracts/{conn_id}.yaml."""
    contract_dict = build_canonical_contract(
        connection_id=connection_id,
        source_type=source_type,
        config_payload=config_payload,
        storage_uri=storage_uri,
    )

    yaml_content = yaml.dump(contract_dict, sort_keys=False, default_flow_style=False)
    raw_bytes = yaml_content.encode("utf-8")
    object_name = f"{CONTRACT_PREFIX}/{contract_dict['conn_id']}.yaml"
    target_uri = f"s3://{GOVERNANCE_BUCKET}/{object_name}"

    client = minio_client or MidasMinioClient()

    try:
        if not client.check_health():
            logger.debug("MinIO S3 no disponible para publicar contrato de conexion: %s", target_uri)
            return target_uri

        # Asegurar existencia del bucket de gobernanza
        if not client.bucket_exists(GOVERNANCE_BUCKET):
            client.client.make_bucket(GOVERNANCE_BUCKET)

        client.client.put_object(
            bucket_name=GOVERNANCE_BUCKET,
            object_name=object_name,
            data=io.BytesIO(raw_bytes),
            length=len(raw_bytes),
            content_type="application/x-yaml",
        )
        logger.info("Contrato de conexion publicado exitosamente en MinIO: %s", target_uri)
        return target_uri
    except Exception as exc:
        logger.warning("Fallo no bloqueante al publicar contrato en MinIO S3: %s", exc)
        return target_uri
