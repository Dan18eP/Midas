"""Midas - Controlador de Ejecución y Orquestación de Pipelines Lakehouse.

Historia de Usuario: HU-BACK-03 & HU-LAKE-05
Autor: Daniel Echeverría (Backend & API Architect)
Permite al frontend disparar la ejecución en caliente de un pipeline (Bronze -> Silver -> Gold),
emitiendo telemetría en tiempo real por Server-Sent Events (SSE) y aislando anomalías en cuarentena.
"""

from __future__ import annotations

import logging
import time
import uuid
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from src.core.telemetry.events import NodeStatus, TelemetryEvent
from src.core.telemetry.hub import TelemetryHub, get_telemetry_hub
from src.lakehouse.ingestion.connection_registry import (
    SourceConnectionRegistry,
    get_connection_registry,
)
from src.lakehouse.ingestion.universal_engine import UniversalIngestionEngine
from src.lakehouse.transforms.bronze_to_silver import BronzeToSilverTransformer
from src.lakehouse.transforms.silver_to_gold import SilverToGoldTransformer

logger = logging.getLogger("midas.api.routes.pipelines")

router = APIRouter(
    prefix="/api/v1/pipelines",
    tags=["Lakehouse Pipelines"],
)


class PipelineTriggerResponse(BaseModel):
    """Resumen de ejecución del pipeline disparado en caliente."""

    run_id: str = Field(..., description="Identificador único de la corrida")
    connection_id: str = Field(..., description="Identificador de la fuente procesada")
    status: str = Field(..., description="Estado final de la ejecución: HEALTHY, DEGRADED o FAILED")
    records_ingested: int = Field(0, description="Total de registros extraídos en Bronze")
    records_cleaned: int = Field(0, description="Total de registros válidos promovidos a Silver")
    records_quarantined: int = Field(0, description="Registros anómalos desviados a Cuarentena")
    gold_records_generated: int = Field(0, description="Registros analíticos agregados en Gold")
    output_tables: List[str] = Field(default_factory=list, description="Tablas generadas en el Lakehouse")
    duration_ms: float = Field(..., description="Duración total del proceso en milisegundos")
    detail: str = Field(..., description="Mensaje explicativo del resultado")


class PipelineStatusResponse(BaseModel):
    """Consulta del estado más reciente del pipeline para una conexión."""

    connection_id: str = Field(..., description="Identificador de la fuente")
    active_status: str = Field(..., description="Estado operativo del nodo (HEALTHY, RUNNING, DEGRADED)")
    last_run_id: Optional[str] = Field(None, description="Identificador de la última corrida")
    alerts_count: int = Field(0, description="Alertas activas asociadas a la fuente")
    last_updated: str = Field(..., description="Marca temporal ISO-8601 de la última telemetría")


@router.post(
    "/{connection_id}/trigger",
    response_model=PipelineTriggerResponse,
    status_code=status.HTTP_200_OK,
    summary="Disparar ejecución de pipeline Lakehouse en caliente",
    description="Inicia la extracción hacia Bronze, limpieza en Silver (con cuarentena) y agregación Gold, emitiendo telemetría SSE.",
)
async def trigger_pipeline(
    connection_id: str,
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
    telemetry_hub: TelemetryHub = Depends(get_telemetry_hub),
) -> PipelineTriggerResponse:
    """Ejecuta el pipeline completo y emite telemetría viva al Canvas."""
    conn = registry.get_connection(connection_id)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"La conexión '{connection_id}' no existe en el catálogo.",
        )

    start_time = time.perf_counter()
    run_id = f"run_{connection_id}_{uuid.uuid4().hex[:6]}"
    node_source_id = f"source_{connection_id}"
    pipe_name = f"dag_pipeline_{connection_id}"

    # 1. Notificar inicio de ejecución a través del Hub de Telemetría (SSE)
    telemetry_hub.publish_sync(
        TelemetryEvent(
            event_id=f"evt_start_{run_id}",
            pipeline_id=pipe_name,
            node_id=node_source_id,
            status=NodeStatus.HEALTHY,
            records_in=0,
            records_out=0,
            latency_ms=12.0,
            details={"message": f"Iniciando pipeline para {conn.name}", "phase": "INGESTION"},
        )
    )

    try:
        # 2. Extracción / Ingesta Universal a Bronze
        ingestion_engine = UniversalIngestionEngine()
        ingest_result = ingestion_engine.ingest_source(
            source_type=conn.source_type.value,
            source_config=conn.config_payload,
            dataset_name=f"dataset_{connection_id}",
            connection_id=connection_id,
        )

        records_bronze = ingest_result.raw_records or []
        records_ingested_count = len(records_bronze)

        # 3. Limpieza Silver con Quality Gate y Cuarentena
        transformer = BronzeToSilverTransformer()
        transform_result = transformer.process_batch(
            records=records_bronze,
            source_name=conn.name,
            batch_id=f"batch_{run_id}",
            primary_key_fields=["id", "pedido_id"],
            amount_fields=["monto", "precio", "monto_bruto"],
            date_fields=["fecha", "timestamp", "created_at"],
        )

        records_cleaned_count = transform_result.valid_count
        records_quarantined_count = transform_result.quarantined_count

        # Persistir incidentes de cuarentena en S3 si hubo anomalías
        if transform_result.quarantined_records:
            for incident in transform_result.quarantined_records:
                ingestion_engine.persist_to_quarantine(
                    connection_id=connection_id,
                    incident_data=incident.to_dict(),
                    incident_id=incident.quarantine_id,
                )

        # 4. Agregación a Capa Gold
        silver_data = transform_result.valid_records
        gold_transformer = SilverToGoldTransformer()
        gold_result = gold_transformer.transform_and_aggregate_sales(
            silver_records=silver_data,
        )
        gold_count = gold_result.fct_ventas_count

        elapsed_ms = (time.perf_counter() - start_time) * 1000
        final_status = "DEGRADED" if records_quarantined_count > 0 else "HEALTHY"

        # 5. Emitir telemetría final al Canvas
        telemetry_hub.publish_sync(
            TelemetryEvent(
                event_id=f"evt_done_{run_id}",
                pipeline_id=pipe_name,
                node_id="gold_fact_ventas",
                status=NodeStatus.DEGRADED if records_quarantined_count > 0 else NodeStatus.HEALTHY,
                records_in=records_ingested_count,
                records_out=gold_count,
                latency_ms=round(elapsed_ms, 2),
                details={
                    "message": "Pipeline completado exitosamente",
                    "quarantined": records_quarantined_count,
                    "cleaned": records_cleaned_count,
                },
            )
        )

        return PipelineTriggerResponse(
            run_id=run_id,
            connection_id=connection_id,
            status=final_status,
            records_ingested=records_ingested_count,
            records_cleaned=records_cleaned_count,
            records_quarantined=records_quarantined_count,
            gold_records_generated=gold_count,
            output_tables=[
                f"bronze.raw_{connection_id}",
                f"silver.clean_{connection_id}",
                "gold.fact_ventas",
                "gold.dim_tiendas_regiones",
            ],
            duration_ms=round(elapsed_ms, 2),
            detail="Pipeline procesado de extremo a extremo (Bronze -> Silver -> Gold).",
        )

    except Exception as exc:
        logger.error("Fallo ejecutando pipeline '%s': %s", connection_id, exc, exc_info=True)
        elapsed_ms = (time.perf_counter() - start_time) * 1000

        telemetry_hub.publish_sync(
            TelemetryEvent(
                event_id=f"evt_err_{run_id}",
                pipeline_id=pipe_name,
                node_id=node_source_id,
                status=NodeStatus.ERROR,
                records_in=0,
                records_out=0,
                latency_ms=round(elapsed_ms, 2),
                details={"error": str(exc), "stage": "FAILED"},
            )
        )

        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Fallo en la ejecución del pipeline: {exc}",
        )


@router.get(
    "/{connection_id}/status",
    response_model=PipelineStatusResponse,
    summary="Obtener estado operativo del pipeline para una conexión",
)
async def get_pipeline_status(
    connection_id: str,
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
    telemetry_hub: TelemetryHub = Depends(get_telemetry_hub),
) -> PipelineStatusResponse:
    """Consulta el estado del nodo y alertas para la conexión."""
    conn = registry.get_connection(connection_id)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"La conexión '{connection_id}' no existe.",
        )

    snapshot = telemetry_hub.get_snapshot()
    node_id = f"source_{connection_id}"
    node_state = snapshot.get(node_id) or snapshot.get("gold_fact_ventas")

    status_str = node_state.status.value if node_state else "HEALTHY"
    alerts = 1 if status_str in ("DEGRADED", "ERROR") else 0

    last_time_str = (
        telemetry_hub.last_event_time.isoformat()
        if telemetry_hub.last_event_time
        else "2026-10-21T12:00:00Z"
    )

    return PipelineStatusResponse(
        connection_id=connection_id,
        active_status=status_str,
        last_run_id=None,
        alerts_count=alerts,
        last_updated=last_time_str,
    )
