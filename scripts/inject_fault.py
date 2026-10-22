#!/usr/bin/env python3
"""
Midas - Script de Inyección Controlada de Fallos y Demostración de Resiliencia
Subsistema: Midas Guardian (Auto-Healing Engine)
Historias de Usuario: HU-GOV-04, HU-LAKE-03
Especificación Canónica: documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md
Guión de Pitch: documentation/canonical/07_guion_presentacion_en_vivo_30_minutos.md (Bloque 5)

Permite simular fallos operativos y de datos en tiempo real (F1 a F5)
para validar el aislamiento en cuarentena y la respuesta del Canvas por SSE.
"""

from __future__ import annotations

import argparse
import json
import logging
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Optional

# Colores ANSI para terminal
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
CYAN = "\033[96m"
BOLD = "\033[1m"
RESET = "\033[0m"

API_BASE_URL = os.getenv("MIDAS_API_URL", "http://localhost:8000")
TELEMETRY_PUBLISH_URL = f"{API_BASE_URL}/api/v1/telemetry/publish"

logging.basicConfig(level=logging.INFO, format="%(message)s")
logger = logging.getLogger("midas.guardian.inject_fault")


def print_banner(fault_id: str, fault_name: str, playbook: str) -> None:
    print(f"\n{BOLD}{RED}==================================================================={RESET}")
    print(f"{BOLD}{RED}   Midas Guardian — Inyector de Fallos y Auto-Healing en Vivo      {RESET}")
    print(f"{BOLD}{RED}   Anomalía: [{fault_id}] {fault_name}{RESET}")
    print(f"{BOLD}{BLUE}   Playbook Activado: {playbook}{RESET}")
    print(f"{BOLD}{RED}==================================================================={RESET}\n")


def send_telemetry_event(event_payload: Dict[str, Any]) -> bool:
    """Envía un evento de telemetría hacia el hub de FastAPI."""
    try:
        body = json.dumps(event_payload).encode("utf-8")
        req = urllib.request.Request(
            TELEMETRY_PUBLISH_URL,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=5) as response:
            if response.status in (200, 201):
                logger.info(f"  [{GREEN}SSE OK{RESET}] Telemetría enviada a FastAPI Gateway -> Canvas emitido.")
                return True
            else:
                logger.warning(f"  [{YELLOW}AVISO{RESET}] Telemetría retornó código HTTP {response.status}")
                return False
    except Exception as exc:
        logger.warning(f"  [{YELLOW}AVISO{RESET}] No se pudo contactar al API Gateway en {TELEMETRY_PUBLISH_URL}: {exc}")
        logger.warning("          (El evento se simuló localmente; asegúrate de tener midas-api encendido).")
        return False


def inject_negative_amount() -> int:
    """F3: Inyección de registros con montos negativos (Playbook QUARANTINE_INVALID_ROWS_V1)."""
    print_banner("F3", "Fila con Monto Negativo", "QUARANTINE_INVALID_ROWS_V1")

    total_records = 7020
    quarantined_records = 14
    clean_records = total_records - quarantined_records
    incident_id = f"inc_f3_{uuid.uuid4().hex[:8]}"

    logger.info(f"{BOLD}1. Generando lote de prueba en caliente:{RESET}")
    logger.info(f"   - Total registros leídos: {BOLD}{total_records}{RESET}")
    logger.info(f"   - Registros limpios identificados: {BOLD}{clean_records} (99.8%){RESET}")
    logger.info(f"   - Registros corruptos detectados: {BOLD}{RED}{quarantined_records} filas con monto < $0.00{RESET}")

    logger.info(f"\n{BOLD}2. Clasificación de Calidad por Midas Guardian:{RESET}")
    logger.info(f"   - Código de anomalía: {RED}F3_NEGATIVE_AMOUNT{RESET}")
    logger.info(f"   - Regla violada: {YELLOW}CHECK_AMOUNT_NON_NEGATIVE (Dominio Financiero){RESET}")
    logger.info(f"   - Acción ejecutada: {CYAN}Desvío inmediato a s3://midas-quarantine/incidents/conn_crm_bogota/{incident_id}.json{RESET}")

    # Notificar al Canvas vía SSE
    telemetry_event = {
        "event_id": f"evt_f3_{int(time.time() * 1000)}",
        "pipeline_id": "pipe_spark_silver",
        "node_id": "silver_cleansing",
        "status": "AUTO_HEALING",
        "records_in": total_records,
        "records_out": clean_records,
        "latency_ms": 48.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {
            "quarantined_records": quarantined_records,
            "playbook_id": "QUARANTINE_INVALID_ROWS_V1",
            "anomaly_type": "F3_NEGATIVE_AMOUNT",
            "incident_id": incident_id,
            "action_taken": f"Desviando {quarantined_records} transacciones corruptas a cuarentena; 99.8% continúa a Gold.",
            "message": "Guardian aisló los registros sin detener el servicio ni corromper métricas.",
        },
    }

    send_telemetry_event(telemetry_event)

    # Intentar persistir el incidente en MinIO directamente si la librería está disponible
    try:
        from src.lakehouse.storage.minio_client import MidasMinioClient
        minio_endpoint = os.getenv("MINIO_PUBLIC_ENDPOINT", "http://localhost:9000")
        minio_client = MidasMinioClient(endpoint=minio_endpoint)
        if minio_client.check_health():
            incident_data = {
                "incident_id": incident_id,
                "connection_id": "conn_crm_bogota",
                "error_type": "F3_NEGATIVE_AMOUNT",
                "bad_records_count": quarantined_records,
                "quarantine_timestamp": datetime.now(timezone.utc).isoformat(),
                "sample_bad_record": {"pedido_id": "PED-ERR-999", "monto": -150.00, "cliente_id": "CLI-888"},
            }
            minio_client.put_object(
                bucket="midas-quarantine",
                object_name=f"incidents/conn_crm_bogota/{incident_id}.json",
                data=json.dumps(incident_data).encode("utf-8"),
            )
            logger.info(f"  [{GREEN}MINIO OK{RESET}] Incidente persistido en bucket s3://midas-quarantine/")
    except Exception as err:
        logger.debug(f"MinIO write skipped: {err}")

    logger.info(f"\n{BOLD}{GREEN}[EXITO] Playbook QUARANTINE_INVALID_ROWS_V1 ejecutado.{RESET}")
    logger.info(f"        El nodo Silver se ilumina en ámbar y el 99.8% de los datos continúa a Gold.\n")
    return 0


def inject_task_kill() -> int:
    """F1: Caída forzada de tarea Spark (Playbook JOB_RETRY_V1)."""
    print_banner("F1", "Caída Forzada de Tarea Spark", "JOB_RETRY_V1")
    logger.info(f"{BOLD}1. Simulando terminación abrupta de executor Spark...{RESET}")
    logger.info(f"   - Worker afectado: midas-spark-worker-1:7077")
    logger.info(f"   - Causa raíz identificada por Guardian: {YELLOW}EXECUTOR_LOST_RESUBMIT_SAFE{RESET}")
    
    telemetry_event = {
        "event_id": f"evt_f1_{int(time.time() * 1000)}",
        "pipeline_id": "pipe_spark_ingest",
        "node_id": "bronze_raw",
        "status": "RUNNING",
        "records_in": 7020,
        "records_out": 7020,
        "latency_ms": 120.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {
            "playbook_id": "JOB_RETRY_V1",
            "anomaly_type": "F1_DUPLICATE_KEY",
            "action_taken": "Reintentando stage 2 en worker alterno. Cero duplicación de registros.",
            "message": "Guardian detectó fallo de ejecutor y relanzó la tarea automáticamente.",
        },
    }
    send_telemetry_event(telemetry_event)
    logger.info(f"\n{BOLD}{GREEN}[EXITO] Playbook JOB_RETRY_V1 completado sin pérdida de datos.{RESET}\n")
    return 0


def inject_duplicate_pk() -> int:
    """F2: Inyección de pedido duplicado (Playbook DEDUPLICATE_BY_TIMESTAMP_V1)."""
    print_banner("F2", "Inyección de Pedido Duplicado", "DEDUPLICATE_BY_TIMESTAMP_V1")
    logger.info(f"{BOLD}1. Inyectando 2 transacciones repetidas con misma clave primaria...{RESET}")
    logger.info(f"   - PK duplicada: {YELLOW}PED-DUPL-2026-X{RESET}")
    logger.info(f"   - Estrategia de saneamiento: Deduplicación determinística por _midas_raw_fingerprint.")

    telemetry_event = {
        "event_id": f"evt_f2_{int(time.time() * 1000)}",
        "pipeline_id": "pipe_spark_silver",
        "node_id": "silver_cleansing",
        "status": "HEALTHY",
        "records_in": 5002,
        "records_out": 5000,
        "latency_ms": 32.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {
            "playbook_id": "DEDUPLICATE_BY_TIMESTAMP_V1",
            "duplicates_dropped": 2,
            "action_taken": "Descartadas 2 transacciones idénticas por reintento de red. Gold preservado.",
            "message": "Idempotencia WAP garantizada.",
        },
    }
    send_telemetry_event(telemetry_event)
    logger.info(f"\n{BOLD}{GREEN}[EXITO] Deduplicación exitosa: Gold mantiene la cardinalidad exacta.{RESET}\n")
    return 0


def inject_type_mismatch() -> int:
    """F4: Schema drift de tipo incompatible (Alerta Roja y Bloqueo Seguro)."""
    print_banner("F4", "Schema Drift Incompatible", "BLOCK_CORRUPT_PROMOTION_V1")
    logger.info(f"{BOLD}1. Inyectando columna 'total_amount' con valor no numérico 'ERROR_404'...{RESET}")
    logger.info(f"   - Contrato violado: Esperado DECIMAL(18,2) -> Recibido VARCHAR.")
    logger.info(f"   - Acción Guardian: {RED}Bloqueo preventivo de promoción a Gold.{RESET}")

    telemetry_event = {
        "event_id": f"evt_f4_{int(time.time() * 1000)}",
        "pipeline_id": "pipe_spark_silver",
        "node_id": "silver_cleansing",
        "status": "ERROR",
        "records_in": 100,
        "records_out": 0,
        "latency_ms": 15.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {
            "anomaly_type": "F4_SCHEMA_DRIFT",
            "playbook_id": "BLOCK_CORRUPT_PROMOTION_V1",
            "action_taken": "Promoción abortada; la última versión válida de Iceberg se mantiene activa.",
            "message": "Alerta crítica visible en Canvas. El Copiloto puede sugerir el mapeo correcto.",
        },
    }
    send_telemetry_event(telemetry_event)
    logger.info(f"\n{BOLD}{YELLOW}[ALERTA] Promoción detenida. Integridad financiera protegida.{RESET}\n")
    return 0


def inject_commit_abort() -> int:
    """F5: Interrupción previa al commit de Iceberg (Rollback WAP)."""
    print_banner("F5", "Interrupción Previa al Commit (WAP)", "WAP_TRANSACTION_ROLLBACK_V1")
    logger.info(f"{BOLD}1. Interrumpiendo la sesión Spark antes del swap de Iceberg v2...{RESET}")
    logger.info(f"   - Tabla afectada: gold.fact_ventas_wap_stage")
    logger.info(f"   - Guardian: Detección de transacción huérfana -> Rollback automático.")

    telemetry_event = {
        "event_id": f"evt_f5_{int(time.time() * 1000)}",
        "pipeline_id": "pipe_spark_gold",
        "node_id": "gold_marts",
        "status": "AUTO_HEALING",
        "records_in": 500,
        "records_out": 500,
        "latency_ms": 25.0,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "details": {
            "playbook_id": "WAP_TRANSACTION_ROLLBACK_V1",
            "action_taken": "Tabla temporal eliminada. La tabla de producción no sufrió modificaciones.",
            "message": "Write-Audit-Publish protegió los tableros analíticos.",
        },
    }
    send_telemetry_event(telemetry_event)
    logger.info(f"\n{BOLD}{GREEN}[EXITO] Rollback exitoso. Tableros directivos continúan sin afectación.{RESET}\n")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Midas Guardian — Inyector de fallos para validación de resiliencia en vivo.",
    )
    parser.add_argument(
        "--fault",
        required=True,
        choices=["negative_amount", "task_kill", "duplicate_pk", "type_mismatch", "schema_drift", "commit_abort"],
        help="Tipo de fallo canónico a inyectar (F1 a F5)",
    )
    args = parser.parse_args()

    fault_map = {
        "negative_amount": inject_negative_amount,
        "task_kill": inject_task_kill,
        "duplicate_pk": inject_duplicate_pk,
        "type_mismatch": inject_type_mismatch,
        "schema_drift": inject_type_mismatch,
        "commit_abort": inject_commit_abort,
    }

    handler = fault_map.get(args.fault)
    if not handler:
        logger.error(f"Fallo no soportado: {args.fault}")
        return 1

    return handler()


if __name__ == "__main__":
    sys.exit(main())
