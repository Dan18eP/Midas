"""
Midas API Gateway - Dynamic Source Connections Router
Historia de Usuario: HU-LAKE-05 (Registro Dinámico de Conexiones Multi-Fuente)
Responsable: Edgar Corzo (Data Engineering Lead)
"""

import logging
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from src.lakehouse.models.connection import (
    SourceType,
    ConnectionStatus,
    SourceConnectionCreate,
    SourceConnectionResponse,
)
from src.lakehouse.ingestion.connection_registry import (
    SourceConnectionRegistry,
    get_connection_registry,
)

logger = logging.getLogger("midas.api.routes.connections")

router = APIRouter(
    prefix="/api/v1/connections",
    tags=["Source Connections"],
)


@router.post(
    "/register",
    response_model=SourceConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar una nueva conexión multi-fuente",
    description="Valida y almacena una nueva conexión en el catálogo operacional (PostgreSQL).",
)
async def register_connection(
    payload: SourceConnectionCreate,
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
):
    """Registra una nueva conexión de datos en caliente."""
    try:
        registered = registry.register_connection(payload)
        return registered
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        logger.error("Error registrando conexión: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno registrando la conexión multi-fuente.",
        )


@router.get(
    "",
    response_model=List[SourceConnectionResponse],
    summary="Listar todas las fuentes conectadas",
    description="Retorna el listado de conexiones activas con filtros opcionales por tipo de fuente y estado.",
)
async def list_connections(
    source_type: Optional[SourceType] = Query(None, description="Filtrar por tipo de fuente: POSTGRES, EXCEL, CSV, REST"),
    status_filter: Optional[ConnectionStatus] = Query(None, alias="status", description="Filtrar por estado"),
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
):
    """Lista las conexiones registradas."""
    return registry.list_connections(source_type=source_type, status=status_filter)


@router.get(
    "/{connection_id}",
    response_model=SourceConnectionResponse,
    summary="Obtener detalle de una conexión",
    description="Retorna la configuración y estado de una conexión específica por su ID.",
)
async def get_connection_detail(
    connection_id: str,
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
):
    """Obtiene los detalles de una conexión."""
    conn = registry.get_connection(connection_id)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conexión con ID '{connection_id}' no encontrada.",
        )
    return conn
