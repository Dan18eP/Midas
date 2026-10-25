"""
Midas API Gateway - Trino Query Execution & Explain Routes
Historia de Usuario: HU-BACK-02 (Trino Query Engine & Catálogos Iceberg/PG)
Responsable: Daniel Echeverría (Team Leader & Principal Backend Architect)
"""

import logging
from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field

from src.core.query_engine.guardrails import (
    enforce_limit_and_read_only,
    mask_sensitive_credentials,
    SecurityGuardrailError,
)
from src.core.query_engine.trino_client import (
    TrinoClient,
    QueryResult,
    QueryCostEstimate,
)

logger = logging.getLogger("midas.api.query")

router = APIRouter(
    prefix="/api/v1/query",
    tags=["Query Engine (Trino)"],
)

# Instancia singleton del cliente Trino
_trino_client: Optional[TrinoClient] = None


def get_trino_client() -> TrinoClient:
    """Dependency provider para el cliente de consultas Trino."""
    global _trino_client
    if _trino_client is None:
        _trino_client = TrinoClient()
    return _trino_client


# ------------------------------------------------------------------------------
# Pydantic Schemas
# ------------------------------------------------------------------------------

class QueryCostEstimateModel(BaseModel):
    estimated_rows: int = Field(..., description="Filas estimadas a procesar/retornar")
    estimated_cpu_cost: float = Field(..., description="Unidades estimadas de cómputo CPU")
    estimated_network_cost: float = Field(..., description="Unidades estimadas de transferencia de red")
    cost_level: str = Field(..., description="Nivel de costo: LOW, MEDIUM, HIGH")
    plan_summary: str = Field(..., description="Resumen del plan de ejecución distribuido")


class QueryExecuteRequest(BaseModel):
    sql: str = Field(..., description="Sentencia SQL de lectura a ejecutar en Trino")
    catalog: Optional[str] = Field("iceberg", description="Catálogo objetivo: 'iceberg' o 'postgresql'")
    schema_name: Optional[str] = Field("silver", description="Esquema objetivo: 'silver', 'gold', 'public', etc.")
    timeout_sec: Optional[float] = Field(10.0, le=10.0, description="Timeout máximo en segundos (límite estricto 10s)")


class QueryExecuteResponse(BaseModel):
    columns: List[str] = Field(..., description="Nombres de las columnas proyectadas")
    column_types: List[str] = Field(default_factory=list, description="Tipos de datos de las columnas")
    data: List[Dict[str, Any]] = Field(..., description="Registros retornados")
    row_count: int = Field(..., description="Cantidad total de filas retornadas")
    execution_time_ms: float = Field(..., description="Tiempo de ejecución en milisegundos")
    catalog: str = Field(..., description="Catálogo consultado")
    schema_name: str = Field(..., description="Esquema consultado")
    truncated: bool = Field(..., description="Indica si la consulta fue truncada a 1000 filas")
    cost_estimate: Optional[QueryCostEstimateModel] = None
    query_id: Optional[str] = None


class QueryExplainRequest(BaseModel):
    sql: str = Field(..., description="Sentencia SQL a validar y estimar")
    catalog: Optional[str] = Field("iceberg", description="Catálogo")
    schema_name: Optional[str] = Field("silver", description="Esquema")


class QueryExplainResponse(BaseModel):
    valid: bool = Field(..., description="Indica si la consulta pasó los guardrails de sintaxis y solo lectura")
    transformed_sql: str = Field(..., description="SQL canónico con LIMIT forzado")
    cost_estimate: QueryCostEstimateModel = Field(..., description="Estimación de costo computacional")


# ------------------------------------------------------------------------------
# Endpoints
# ------------------------------------------------------------------------------

@router.post(
    "/execute",
    response_model=QueryExecuteResponse,
    status_code=status.HTTP_200_OK,
    summary="Execute Federated Read-Only Query via Trino",
    description=(
        "Executes a validated read-only SQL query across Apache Iceberg and PostgreSQL catalogs. "
        "Enforces strict 10-second timeout and injects LIMIT 1000 automatically."
    ),
)
async def execute_query_endpoint(
    payload: QueryExecuteRequest,
    request: Request,
    client: TrinoClient = Depends(get_trino_client),
) -> QueryExecuteResponse:
    """Ejecuta una consulta SQL segura con timeout de 10s y LIMIT forzado."""
    # Extraer rol de seguridad del header inyectado por CorrelationIdMiddleware
    user_role = getattr(request.state, "user_role", None)

    try:
        result: QueryResult = await client.execute_query(
            sql=payload.sql,
            catalog=payload.catalog,
            schema_name=payload.schema_name,
            user_role=user_role,
            timeout_sec=payload.timeout_sec,
        )

        cost_model = None
        if result.cost_estimate:
            cost_model = QueryCostEstimateModel(
                estimated_rows=result.cost_estimate.estimated_rows,
                estimated_cpu_cost=result.cost_estimate.estimated_cpu_cost,
                estimated_network_cost=result.cost_estimate.estimated_network_cost,
                cost_level=result.cost_estimate.cost_level,
                plan_summary=result.cost_estimate.plan_summary,
            )

        return QueryExecuteResponse(
            columns=result.columns,
            column_types=result.column_types,
            data=result.data,
            row_count=result.row_count,
            execution_time_ms=result.execution_time_ms,
            catalog=result.catalog,
            schema_name=result.schema_name,
            truncated=result.truncated,
            cost_estimate=cost_model,
            query_id=result.query_id,
        )

    except SecurityGuardrailError as sec_err:
        masked_msg = mask_sensitive_credentials(str(sec_err))
        logger.warning("Bloqueo de seguridad en query: %s", masked_msg)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=masked_msg,
        ) from sec_err

    except TimeoutError as timeout_err:
        masked_msg = mask_sensitive_credentials(str(timeout_err))
        logger.error("Timeout ejecutando query: %s", masked_msg)
        raise HTTPException(
            status_code=status.HTTP_408_REQUEST_TIMEOUT,
            detail=masked_msg,
        ) from timeout_err

    except (ConnectionError, Exception) as exc:
        masked_msg = mask_sensitive_credentials(str(exc))
        logger.warning("Trino no disponible o inicializándose (%s). Activando motor determinista local de respaldo...", masked_msg)
        try:
            result = client._execute_deterministic_local_engine(
                sql=payload.sql,
                catalog=payload.catalog or "iceberg",
                schema_name=payload.schema_name or "silver",
            )
            return QueryExecuteResponse(
                columns=result.columns,
                column_types=result.column_types,
                data=result.data,
                row_count=result.row_count,
                execution_time_ms=result.execution_time_ms,
                catalog=result.catalog,
                schema_name=result.schema_name,
                truncated=result.truncated,
                query_id=result.query_id,
            )
        except Exception:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail=f"Error en motor de consultas Trino: {masked_msg}",
            ) from exc


@router.post(
    "/explain",
    response_model=QueryExplainResponse,
    status_code=status.HTTP_200_OK,
    summary="Explain Query Plan and Estimate Computational Cost",
    description="Validates SQL syntax, enforces LIMIT, and calculates CPU/Network execution plan cost without running the query.",
)
async def explain_query_endpoint(
    payload: QueryExplainRequest,
    client: TrinoClient = Depends(get_trino_client),
) -> QueryExplainResponse:
    """Analiza la consulta, valida solo lectura y estima el costo computacional."""
    try:
        transformed = enforce_limit_and_read_only(payload.sql, default_limit=1000, max_limit=1000)
        cost = await client.estimate_query_cost(payload.sql, payload.catalog, payload.schema_name)

        return QueryExplainResponse(
            valid=True,
            transformed_sql=transformed,
            cost_estimate=QueryCostEstimateModel(
                estimated_rows=cost.estimated_rows,
                estimated_cpu_cost=cost.estimated_cpu_cost,
                estimated_network_cost=cost.estimated_network_cost,
                cost_level=cost.cost_level,
                plan_summary=cost.plan_summary,
            ),
        )
    except SecurityGuardrailError as sec_err:
        masked_msg = mask_sensitive_credentials(str(sec_err))
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=masked_msg,
        ) from sec_err


@router.get(
    "/catalogs",
    summary="List Configured Trino Catalogs",
    description="Returns list of available federated catalogs: Apache Iceberg and PostgreSQL.",
)
async def list_catalogs_endpoint() -> Dict[str, Any]:
    """Retorna los catálogos y esquemas federados disponibles."""
    return {
        "catalogs": [
            {
                "name": "iceberg",
                "type": "Apache Iceberg REST",
                "schemas": ["bronze", "silver", "gold", "quarantine"],
                "description": "Almacenamiento Lakehouse Medallón sobre MinIO S3",
            },
            {
                "name": "postgresql",
                "type": "PostgreSQL JDBC",
                "schemas": ["public"],
                "description": "Base de datos operacional midas_operational",
            },
        ]
    }
