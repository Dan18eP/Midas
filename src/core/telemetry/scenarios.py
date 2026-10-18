"""Predefined Time-Travel Replay telemetry scenarios (T0, T1, T2, T3).

Adheres strictly to documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md
Section 3.1: Barra de Replay Temporal (Time-Travel Playback).
"""

from typing import Dict, List
from src.core.telemetry.events import AnomalyType, NodeStatus, TelemetryEvent


def get_scenario_events(scenario_id: str) -> List[TelemetryEvent]:
    """Retrieve canonical telemetry event snapshots for a specific Time-Travel phase."""
    scenario_key = scenario_id.upper().strip()

    if scenario_key == "T0":
        # T0 (Normal): Todos los nodos en verde; flujo fluido de transacciones
        return [
            TelemetryEvent(
                event_id="evt_t0_src_01",
                pipeline_id="pipe_medallion_e2e",
                node_id="source_postgres",
                status=NodeStatus.HEALTHY,
                records_in=5000,
                records_out=5000,
                latency_ms=15.0,
                details={"throughput_rps": 350},
            ),
            TelemetryEvent(
                event_id="evt_t0_brz_02",
                pipeline_id="pipe_medallion_e2e",
                node_id="bronze_raw",
                status=NodeStatus.HEALTHY,
                records_in=5000,
                records_out=5000,
                latency_ms=25.0,
                details={"iceberg_snapshot": 1001},
            ),
            TelemetryEvent(
                event_id="evt_t0_slv_03",
                pipeline_id="pipe_medallion_e2e",
                node_id="silver_cleansing",
                status=NodeStatus.HEALTHY,
                records_in=5000,
                records_out=5000,
                latency_ms=45.0,
                details={"quarantined_records": 0},
            ),
            TelemetryEvent(
                event_id="evt_t0_gld_04",
                pipeline_id="pipe_medallion_e2e",
                node_id="gold_marts",
                status=NodeStatus.HEALTHY,
                records_in=5000,
                records_out=5000,
                latency_ms=30.0,
                details={"iceberg_snapshot": 2001, "quality_score": 1.0},
            ),
        ]

    elif scenario_key == "T1":
        # T1 (Incidente Inyectado): Nodo Silver pasa a ámbar/rojo con anomalía F3 detectada
        return [
            TelemetryEvent(
                event_id="evt_t1_brz_01",
                pipeline_id="pipe_medallion_e2e",
                node_id="bronze_raw",
                status=NodeStatus.HEALTHY,
                records_in=1200,
                records_out=1200,
                latency_ms=20.0,
            ),
            TelemetryEvent(
                event_id="evt_t1_slv_02",
                pipeline_id="pipe_medallion_e2e",
                node_id="silver_cleansing",
                status=NodeStatus.DEGRADED,
                records_in=1200,
                records_out=1186,
                latency_ms=95.0,
                details={
                    "anomaly_type": AnomalyType.F3_NEGATIVE_AMOUNT.value,
                    "quarantined_records": 14,
                    "alert": "14 registros con montos negativos detectados en lote",
                },
            ),
        ]

    elif scenario_key == "T2":
        # T2 (Guardian en Acción): Nodo Guardian flotante se ilumina y ejecuta playbook de cuarentena
        return [
            TelemetryEvent(
                event_id="evt_t2_grd_01",
                pipeline_id="pipe_medallion_e2e",
                node_id="guardian_monitor",
                status=NodeStatus.AUTO_HEALING,
                records_in=14,
                records_out=14,
                latency_ms=18.0,
                details={
                    "anomaly_type": AnomalyType.F3_NEGATIVE_AMOUNT.value,
                    "playbook_id": "PB-03-QUARANTINE",
                    "action_taken": "quarantine_isolate_and_protect_gold",
                    "quarantined_records": 14,
                    "message": "Playbook PB-03 aislando registros corruptos; capa Gold intacta",
                },
            ),
            TelemetryEvent(
                event_id="evt_t2_slv_02",
                pipeline_id="pipe_medallion_e2e",
                node_id="silver_quarantine",
                status=NodeStatus.HEALTHY,
                records_in=14,
                records_out=14,
                latency_ms=10.0,
                details={"target_table": "silver.pedidos_quarantine"},
            ),
        ]

    elif scenario_key == "T3":
        # T3 (Recuperado y Publicado): Pipeline vuelve a verde con nuevo snapshot Gold publicado
        return [
            TelemetryEvent(
                event_id="evt_t3_slv_01",
                pipeline_id="pipe_medallion_e2e",
                node_id="silver_cleansing",
                status=NodeStatus.HEALTHY,
                records_in=1186,
                records_out=1186,
                latency_ms=35.0,
                details={"clean_records": 1186, "quarantine_isolated": True},
            ),
            TelemetryEvent(
                event_id="evt_t3_gld_02",
                pipeline_id="pipe_medallion_e2e",
                node_id="gold_marts",
                status=NodeStatus.HEALTHY,
                records_in=1186,
                records_out=1186,
                latency_ms=28.0,
                details={
                    "iceberg_snapshot": 2002,
                    "quality_score": 1.0,
                    "certified": True,
                    "message": "Nuevo snapshot Gold 2002 publicado exitosamente",
                },
            ),
            TelemetryEvent(
                event_id="evt_t3_grd_03",
                pipeline_id="pipe_medallion_e2e",
                node_id="guardian_monitor",
                status=NodeStatus.HEALTHY,
                records_in=0,
                records_out=0,
                latency_ms=5.0,
                details={"status": "STANDBY", "active_incidents": 0},
            ),
        ]

    else:
        raise ValueError(f"Escenario '{scenario_id}' no reconocido. Opciones válidas: T0, T1, T2, T3.")


def list_available_scenarios() -> Dict[str, str]:
    """Return dictionary of scenario IDs with descriptive summaries."""
    return {
        "T0": "Operación Normal: Todos los nodos en verde; flujo fluido de transacciones.",
        "T1": "Incidente Inyectado: Nodo Silver pasa a ámbar con detección de anomalía F3.",
        "T2": "Guardian en Acción: Nodo flotante se ilumina en ámbar ejecutando playbook PB-03.",
        "T3": "Recuperado y Publicado: Pipeline en verde con nuevo snapshot Iceberg publicado.",
    }
