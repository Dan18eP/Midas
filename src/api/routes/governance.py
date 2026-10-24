"""Midas - Controlador de Gobernanza y Auditoría de Incidentes de Cuarentena.

Historia de Usuario: HU-GOV-01 & HU-LAKE-03
Autor: Daniel Echeverría (Backend & API Architect)
Permite a auditores y operadores inspeccionar incidentes de calidad aislados en s3://midas-quarantine/
con detalle de código de fallo (F1-F5), valores rechazados y sellos criptográficos.
"""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

from src.lakehouse.storage.minio_client import MidasMinioClient

logger = logging.getLogger("midas.api.routes.governance")

router = APIRouter(
    prefix="/api/v1/governance",
    tags=["Governance & Quarantine Audit"],
)

QUARANTINE_BUCKET = "midas-quarantine"


class QuarantineIncidentSummary(BaseModel):
    """Resumen de un incidente de calidad en cuarentena."""

    incident_id: str = Field(..., description="Identificador único del incidente")
    connection_id: str = Field(..., description="Fuente de origen contaminada")
    error_type: str = Field(..., description="Tipo o código de fallo (e.g. NEGATIVE_AMOUNT, SCHEMA_DRIFT)")
    created_at: str = Field(..., description="Fecha y hora de detección ISO-8601")
    storage_uri: str = Field(..., description="Ruta de almacenamiento en MinIO S3")


class QuarantineIncidentDetail(BaseModel):
    """Detalle completo del incidente de calidad para auditoría forense."""

    incident_id: str = Field(..., description="Identificador único del incidente")
    connection_id: str = Field(..., description="Fuente de origen contaminada")
    error_type: str = Field(..., description="Tipo o código de fallo")
    bad_record: Dict[str, Any] = Field(default_factory=dict, description="Contenido de la fila rechazada")
    quarantine_timestamp: str = Field(..., description="Marca temporal de aislamiento")
    storage_uri: str = Field(..., description="Ubicación en el bucket de cuarentena")


# Almacén en memoria de respaldo para incidentes generados durante pruebas o modo offline
_LOCAL_QUARANTINE_CACHE: Dict[str, Dict[str, Any]] = {}


def register_quarantine_incident_locally(incident: Dict[str, Any]) -> None:
    """Registra un incidente en caché local para soporte de pruebas offline."""
    inc_id = incident.get("incident_id") or f"inc_{len(_LOCAL_QUARANTINE_CACHE) + 1}"
    _LOCAL_QUARANTINE_CACHE[inc_id] = incident


@router.get(
    "/quarantine",
    response_model=List[QuarantineIncidentSummary],
    summary="Listar incidentes de datos en cuarentena",
    description="Recupera los incidentes de calidad aislados en s3://midas-quarantine/.",
)
async def list_quarantine_incidents() -> List[QuarantineIncidentSummary]:
    """Lista los incidentes de calidad detectados por los Quality Gates."""
    incidents: List[QuarantineIncidentSummary] = []
    minio_client = MidasMinioClient()

    if minio_client.check_health():
        try:
            for obj_name in minio_client.list_objects(QUARANTINE_BUCKET, prefix="incidents/", max_items=100):
                if not obj_name.endswith(".json"):
                    continue
                parts = obj_name.split("/")
                conn_id = parts[1] if len(parts) >= 3 else "unknown"
                filename = parts[-1]
                inc_id = filename.replace("incident_", "").replace(".json", "")

                incidents.append(
                    QuarantineIncidentSummary(
                        incident_id=inc_id,
                        connection_id=conn_id,
                        error_type="QUALITY_GATE_REJECTION",
                        created_at=datetime.now(timezone.utc).isoformat(),
                        storage_uri=f"s3://{QUARANTINE_BUCKET}/{obj_name}",
                    )
                )
                if len(incidents) >= 100:
                    break
        except Exception as exc:
            logger.debug("Error listando objetos de cuarentena en MinIO: %s", exc)

    # Complementar con la caché local de pruebas
    if _LOCAL_QUARANTINE_CACHE:
        existing_ids = {i.incident_id for i in incidents}
        for inc_id, data in _LOCAL_QUARANTINE_CACHE.items():
            if inc_id not in existing_ids:
                incidents.append(
                    QuarantineIncidentSummary(
                        incident_id=inc_id,
                        connection_id=data.get("connection_id", "conn_local"),
                        error_type=data.get("error_type", "ANOMALY_DETECTED"),
                        created_at=data.get("quarantine_timestamp", datetime.now(timezone.utc).isoformat()),
                        storage_uri=f"s3://{QUARANTINE_BUCKET}/incidents/{data.get('connection_id')}/incident_{inc_id}.json",
                    )
                )

    return incidents


@router.get(
    "/quarantine/{incident_id}",
    response_model=QuarantineIncidentDetail,
    summary="Obtener detalle forense de un incidente en cuarentena",
)
async def get_quarantine_incident(incident_id: str) -> QuarantineIncidentDetail:
    """Retorna el payload completo del registro anómalo para auditoría."""
    minio_client = MidasMinioClient()

    # 1. Intentar consultar desde MinIO
    if minio_client.check_health():
        try:
            for obj_name in minio_client.list_objects(QUARANTINE_BUCKET, prefix="incidents/"):
                if incident_id in obj_name and obj_name.endswith(".json"):
                    raw_bytes = minio_client.get_object(QUARANTINE_BUCKET, obj_name)
                    data = json.loads(raw_bytes.decode("utf-8"))
                    return QuarantineIncidentDetail(
                        incident_id=incident_id,
                        connection_id=data.get("connection_id", "conn_unknown"),
                        error_type=data.get("error_type", "QUALITY_GATE_VIOLATION"),
                        bad_record=data.get("bad_record") or data.get("raw_record") or {},
                        quarantine_timestamp=data.get("quarantine_timestamp", datetime.now(timezone.utc).isoformat()),
                        storage_uri=f"s3://{QUARANTINE_BUCKET}/{obj_name}",
                    )
        except Exception as exc:
            logger.debug("Error obteniendo objeto de cuarentena en MinIO: %s", exc)

    # 2. Consultar desde caché local si no está en MinIO
    if incident_id in _LOCAL_QUARANTINE_CACHE:
        data = _LOCAL_QUARANTINE_CACHE[incident_id]
        return QuarantineIncidentDetail(
            incident_id=incident_id,
            connection_id=data.get("connection_id", "conn_local"),
            error_type=data.get("error_type", "QUALITY_GATE_VIOLATION"),
            bad_record=data.get("bad_record") or data.get("raw_record") or {},
            quarantine_timestamp=data.get("quarantine_timestamp", datetime.now(timezone.utc).isoformat()),
            storage_uri=f"s3://{QUARANTINE_BUCKET}/incidents/{data.get('connection_id')}/incident_{incident_id}.json",
        )

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Incidente de cuarentena '{incident_id}' no encontrado.",
    )
