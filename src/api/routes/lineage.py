"""Midas - Endpoint de Gateway de Linaje de Datos Activo.

Historia de Usuario: HU-BACK-03
Autor: Daniel Echeverría (Backend Lead)
Satisface el contrato de consulta para ExplainNumberDrawer y la arquitectura
de certificación en OpenMetadata/Atlas.
"""

from typing import Any, Dict, List, Optional
from fastapi import APIRouter, HTTPException, Path, status
from pydantic import BaseModel, Field

from src.core.lineage.canonical_lineage import get_table_lineage

router = APIRouter(prefix="/api/v1/lineage", tags=["Data Lineage & Certification Gateway"])


class LineageStageModel(BaseModel):
    layer: str = Field(..., description="Capa de Lakehouse: source, bronze, silver, gold")
    table: str = Field(..., description="Nombre calificado de la tabla o entidad")
    location: str = Field(..., description="Ubicación física o URI de almacenamiento")
    description: str = Field(..., description="Descripción técnica de la etapa")


class LineageFormulaModel(BaseModel):
    latex: str = Field(..., description="Fórmula matemática en formato KaTeX")
    description: str = Field(..., description="Explicación semántica inmutable")
    key: str = Field(..., description="Identificador canónico de la métrica")


class LineageCertificationModel(BaseModel):
    quality_percent: float = Field(100.0, description="Porcentaje de calidad certificado")
    quality_summary: str = Field(..., description="Resumen de validación de contratos")
    last_sync: str = Field(..., description="Timestamp ISO de última sincronización")
    audit_hash: str = Field(..., description="Hash SHA-256 criptográfico de certificación")


class LineagePayloadResponse(BaseModel):
    table: str = Field(..., description="Tabla consultada")
    stages: List[LineageStageModel] = Field(..., description="Etapas del linaje Medallion de 4 capas")
    transformation: str = Field(..., description="Resumen de la transformación PySpark aplicada")
    certification: LineageCertificationModel = Field(..., description="Metadatos de certificación y auditoría")
    formula: Optional[LineageFormulaModel] = Field(None, description="Fórmula KaTeX si corresponde a una métrica")


@router.get(
    "/table/{table:path}",
    response_model=LineagePayloadResponse,
    status_code=status.HTTP_200_OK,
    summary="Consultar Linaje Activo de Tabla",
    description=(
        "Retorna el árbol de linaje Medallion de 4 capas (Fuente -> Bronze -> Silver -> Gold), "
        "la fórmula matemática canónica en KaTeX y el hash criptográfico SHA-256 de certificación."
    ),
)
async def get_table_lineage_endpoint(
    table: str = Path(..., description="Nombre de la tabla a inspeccionar (ej: gold.fact_ventas)"),
) -> LineagePayloadResponse:
    """Resuelve el linaje canónico para la tabla solicitada."""
    clean_table = table.strip()
    if not clean_table:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El nombre de la tabla no puede estar vacío.",
        )

    try:
        payload = get_table_lineage(clean_table)
        return LineagePayloadResponse(**payload)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error resolviendo el linaje para '{clean_table}': {exc}",
        ) from exc
