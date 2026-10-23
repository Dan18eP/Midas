"""
Midas Lakehouse Models - Source Connection Registry
Historia de Usuario: HU-LAKE-05 (Registro Dinámico de Conexiones Multi-Fuente)
Responsable: Edgar Corzo (Data Engineering Lead)
"""

from datetime import datetime, timezone
from enum import Enum
from typing import Any, Dict, Optional
import uuid

from pydantic import BaseModel, Field, field_validator


class SourceType(str, Enum):
    """Tipos de fuentes de datos soportadas por Universal Ingestion Engine."""
    POSTGRES = "POSTGRES"
    EXCEL = "EXCEL"
    CSV = "CSV"
    REST = "REST"


class ConnectionStatus(str, Enum):
    """Estado operativo de la conexión multi-fuente."""
    ACTIVE = "ACTIVE"
    INACTIVE = "INACTIVE"
    TESTING = "TESTING"
    FAILED = "FAILED"


class SourceConnectionCreate(BaseModel):
    """Payload de entrada para registrar una nueva conexión."""
    name: str = Field(..., min_length=3, max_length=150, description="Nombre único descriptivo de la conexión")
    source_type: SourceType = Field(..., description="Tipo de fuente: POSTGRES, EXCEL, CSV, REST")
    config_payload: Dict[str, Any] = Field(default_factory=dict, description="Parámetros de conexión específicos")

    @field_validator("source_type", mode="before")
    @classmethod
    def normalize_source_type(cls, v: Any) -> Any:
        if isinstance(v, str):
            v_upper = v.upper().strip()
            if v_upper in ("API", "REST_API", "WEBHOOK"):
                return SourceType.REST
            if v_upper in ("POSTGRESQL", "PG", "POSTGRES"):
                return SourceType.POSTGRES
            if v_upper in ("XLSX", "XLS"):
                return SourceType.EXCEL
        return v

    @field_validator("name")
    @classmethod
    def validate_name_not_blank(cls, v: str) -> str:
        clean = v.strip()
        if not clean:
            raise ValueError("El nombre de la conexión no puede estar vacío.")
        return clean


class SourceConnectionResponse(BaseModel):
    """Representación completa de una conexión registrada."""
    connection_id: str = Field(..., description="Identificador único inmutable de la conexión")
    name: str
    source_type: SourceType
    config_payload: Dict[str, Any]
    status: ConnectionStatus = ConnectionStatus.ACTIVE
    created_at: str

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> "SourceConnectionResponse":
        created = data.get("created_at")
        if isinstance(created, datetime):
            created_str = created.isoformat()
        elif isinstance(created, str):
            created_str = created
        else:
            created_str = datetime.now(timezone.utc).isoformat()

        return cls(
            connection_id=str(data["connection_id"]),
            name=str(data["name"]),
            source_type=SourceType(str(data["source_type"]).upper()),
            config_payload=data.get("config_payload", {}),
            status=ConnectionStatus(str(data.get("status", "ACTIVE")).upper()),
            created_at=created_str,
        )
