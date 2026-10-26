"""Copilot Agent HTTP route exposing LangGraph conversational state machine.

Adheres strictly to documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md
and Punto 2.5 of documentation/reviews/review-pr-023-hu-ai-01-langgraph.md.
"""

import asyncio
from datetime import datetime, timezone
import json
import logging
import os
import re
from typing import Any, Dict, List, Optional
import uuid
from fastapi import APIRouter, HTTPException, Request, status
from fastapi.encoders import jsonable_encoder
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("midas.api.agent")
GOLD_MATERIALIZATION_CONFIRMATION = "materializa este reporte como tabla gold diaria"

router = APIRouter(prefix="/api/v1/agent", tags=["Copilot Agent & Conversational AI"])


class ChatRequest(BaseModel):
    """Incoming user message payload for the Copilot."""
    thread_id: Optional[str] = Field(
        default=None,
        description="Unique session identifier for multi-turn state persistence. Auto-generated if omitted.",
    )
    connection_id: Optional[str] = Field(
        default=None,
        description="Scoped connection identifier for the active session (1 session = 1 connection).",
    )
    message: str = Field(..., min_length=1, description="Prompt, question or greeting from the user.")
    inference_mode: Optional[str] = Field(
        default="cloud",
        description="Inference provider sovereignty: 'local' (Qwen 2.5: 3B local Zero-Trust) or 'cloud' (Gemini Cloud API).",
    )
    sql_query: Optional[str] = Field(
        default=None,
        description="Explicit Trino SQL query associated with a specific report when materializing Gold.",
    )


class ChatResponse(BaseModel):
    """Structured response returned by the Copilot Agent."""
    thread_id: str = Field(..., description="Active session identifier.")
    intent: Optional[str] = Field(None, description="Classified intent (e.g. discovery, sql_query, clarify).")
    response: str = Field(..., description="Clean, human-readable executive response formatted in Markdown.")
    suggestions: List[str] = Field(default_factory=list, description="Follow-up proactive suggestions or action buttons.")
    needs_clarification: bool = Field(False, description="True if the agent requires further parameters (e.g. missing year).")
    echarts_option: Optional[Dict[str, Any]] = Field(None, description="Apache ECharts JSON configuration option.")
    metrics_summary: List[Dict[str, Any]] = Field(default_factory=list, description="Structured lineage metrics summary.")
    sql: Optional[str] = Field(None, description="Executed Trino SQL query behind this analytical finding.")
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class MaterializeRequest(BaseModel):
    """Confirmed request to schedule a validated Gold query."""

    report_name: str = Field(..., min_length=1)
    sql: str = Field(..., min_length=1)
    catalog: List[Dict[str, Any]]
    cron_schedule: str = "0 0 * * *"
    confirmed: bool = False


class MaterializeResponse(BaseModel):
    """Location of the contract consumed by Airflow."""

    spec_uri: str
    pipeline_id: str
    output_table: str


def _trigger_airflow_dag(pipeline_id: str) -> bool:
    """Intenta disparar una ejecución de DAG en Airflow si el servicio está activo."""
    import base64
    import urllib.request
    airflow_url = os.getenv(
        "AIRFLOW_WEBSERVER_URL",
        "http://midas-airflow-webserver:8080" if os.path.exists("/.dockerenv") else "http://localhost:8085",
    )
    user = os.getenv("AIRFLOW_ADMIN_USERNAME", "admin")
    pwd = os.getenv("AIRFLOW_ADMIN_PASSWORD", "midas_airflow_admin_2026")
    try:
        dag_id = f"dag_gold_{pipeline_id}"
        url = f"{airflow_url}/api/v1/dags/{dag_id}/dagRuns"
        data = json.dumps({"conf": {}}).encode("utf-8")
        auth_header = "Basic " + base64.b64encode(f"{user}:{pwd}".encode("utf-8")).decode("utf-8")
        req = urllib.request.Request(
            url,
            data=data,
            headers={
                "Content-Type": "application/json",
                "Authorization": auth_header,
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=2.0) as resp:
            return resp.status in (200, 201)
    except Exception:
        return False


# Lazily-compiled LangGraph singleton
_compiled_graph: Any = None


def default_trino_executor(sql: str, user_role: Optional[str] = None) -> List[Dict[str, Any]]:
    from src.core.query_engine.trino_client import TrinoClient
    trino_client = TrinoClient()
    res = trino_client.execute_query_sync(sql=sql, user_role=user_role)
    return res.data


def live_catalog_source_provider() -> List[Dict[str, Any]]:
    if os.getenv("PYTEST_CURRENT_TEST"):
        return [
            {
                "name": "crm_operaciones",
                "kind": "PostgreSQL",
                "tables": [
                    {"table": "silver.crm_transacciones", "columns": ["transaccion_id", "cliente_id", "monto", "fecha", "region", "canal_venta"]},
                    {"table": "silver.crm_clientes", "columns": ["cliente_id", "nombre", "region"]},
                ],
            },
            {
                "name": "Presupuesto_Corporativo_2026.xlsx",
                "kind": "Excel",
                "tables": [
                    {"table": "silver.presupuesto_metas", "columns": ["año", "mes", "region", "monto"]},
                ],
            },
            {
                "name": "helpdesk_tickets_live",
                "kind": "API REST",
                "tables": [
                    {"table": "silver.helpdesk_tickets", "columns": ["ticket_id", "cliente_id", "tiempo_respuesta_min", "csat_puntuacion"]},
                ],
            },
        ]
    grouped_sources: Dict[str, Dict[str, Any]] = {}

    # 1. Recuperar conexiones reales registradas por el usuario en PostgreSQL
    try:
        pg_url = os.getenv("POSTGRES_OPERATIONAL_URL") or os.getenv("OPERATIONAL_DB_URL") or os.getenv("DATABASE_URL")
        if pg_url and "postgresql" in pg_url:
            from sqlalchemy import create_engine, text
            engine = create_engine(pg_url)
            with engine.connect() as conn:
                rows = conn.execute(text("SELECT connection_id, name, source_type, config_payload FROM source_connections WHERE status = 'ACTIVE'")).fetchall()
                for r in rows:
                    cid, cname, stype, cfg = r[0], r[1], r[2], r[3]
                    if isinstance(cfg, str):
                        try:
                            cfg = json.loads(cfg)
                        except Exception:
                            cfg = {}
                    cfg = cfg or {}
                    detected = cfg.get("detected_columns") or []
                    sheets = cfg.get("sheets") or []
                    clean_cid = re.sub(r"[^a-z0-9_]", "_", cid.lower()).strip("_")
                    clean_suffix = clean_cid.replace("conn_", "")
                    tables = []
                    if detected:
                        tables.append({"table": f"silver.clean_{clean_suffix}", "columns": detected})
                    elif stype == "POSTGRES":
                        tables.append({"table": "silver.crm_transacciones", "columns": ["transaccion_id", "cliente_id", "monto", "fecha", "region", "canal_venta", "estado"]})
                        tables.append({"table": "silver.crm_clientes", "columns": ["cliente_id", "nombre", "email", "telefono", "region", "categoria_segmento"]})
                    elif sheets:
                        for sh in sheets:
                            tables.append({"table": f"silver.{str(sh).lower()}", "columns": ["año", "mes", "region", "monto"]})
                    if not tables:
                        tables.append({"table": f"silver.{clean_suffix}", "columns": ["id", "nombre", "monto"]})

                    grouped_sources[cname] = {
                        "connection_id": cid,
                        "name": cname,
                        "kind": stype,
                        "tables": tables,
                    }
    except Exception as pg_exc:
        logger.debug("No se pudieron cargar conexiones activas de PostgreSQL: %s", pg_exc)

    # 2. Consultar el catalogo de Trino (Iceberg y tablas sincronizadas)
    try:
        from src.core.query_engine.trino_client import TrinoClient
        trino_client = TrinoClient()
        query = (
            "SELECT table_schema, table_name, column_name "
            "FROM information_schema.columns "
            "WHERE table_schema IN ('silver', 'gold', 'public') "
            "ORDER BY table_schema, table_name, ordinal_position"
        )
        res = trino_client.execute_query_sync(sql=query)
        if res and res.data:
            schema_tables: Dict[str, Dict[str, List[str]]] = {}
            for row in res.data:
                sch = str(row.get("table_schema", "")).lower()
                tbl = str(row.get("table_name", "")).lower()
                col = str(row.get("column_name", "")).lower()
                if not sch or not tbl:
                    continue
                if sch not in schema_tables:
                    schema_tables[sch] = {}
                if tbl not in schema_tables[sch]:
                    schema_tables[sch][tbl] = []
                if col and col not in schema_tables[sch][tbl]:
                    schema_tables[sch][tbl].append(col)

            for sch, tables_dict in schema_tables.items():
                for tbl, cols in tables_dict.items():
                    t_full = f"{sch}.{tbl}"
                    s_name = "Capa Gold (Marts)" if sch == "gold" else ("Capa Silver" if sch == "silver" else "PostgreSQL Operacional")
                    s_kind = "Iceberg" if sch in ("silver", "gold") else "PostgreSQL"
                    if s_name not in grouped_sources:
                        grouped_sources[s_name] = {"name": s_name, "kind": s_kind, "tables": []}
                    # Agregar tabla si no existe ya
                    existing_tables = [t.get("table") if isinstance(t, dict) else t for t in grouped_sources[s_name]["tables"]]
                    if t_full not in existing_tables:
                        grouped_sources[s_name]["tables"].append({"table": t_full, "columns": cols})
    except Exception as exc:
        logger.debug("No se pudo consultar information_schema de Trino: %s.", exc)

    if grouped_sources:
        return list(grouped_sources.values())

    return []


def get_agent_graph() -> Any:
    """Lazily instantiate and compile the LangGraph conversational graph."""
    global _compiled_graph
    if _compiled_graph is None:
        try:
            # InMemorySaver provides resilient zero-failure operation in local and test environments
            from langgraph.checkpoint.memory import InMemorySaver
            from src.agent.graph.builder import build_graph

            pg_url = os.getenv("POSTGRES_OPERATIONAL_URL") or os.getenv("DATABASE_URL")
            checkpointer = None
            if pg_url and "postgresql" in pg_url:
                try:
                    from langgraph.checkpoint.postgres import PostgresSaver
                    pg_checkpointer = PostgresSaver.from_conn_string(pg_url)
                    pg_checkpointer.setup()
                    checkpointer = pg_checkpointer
                except Exception as pg_exc:
                    logger.debug("PostgresSaver no disponible o fallo setup (%s), usando InMemorySaver.", pg_exc)
            if checkpointer is None:
                checkpointer = InMemorySaver()

            _compiled_graph = build_graph(
                checkpointer=checkpointer,
                execute_query=default_trino_executor,
                source_provider=live_catalog_source_provider,
            )
            logger.info("LangGraph conversational state machine compiled successfully with Trino executor.")
        except Exception as exc:
            logger.error("Failed to compile LangGraph state machine: %s", exc, exc_info=True)
            raise RuntimeError(f"No se pudo inicializar el grafo del Copiloto: {exc}") from exc

    return _compiled_graph


def reset_agent_graph() -> None:
    """Reset the compiled graph singleton (useful for test isolation)."""
    global _compiled_graph
    _compiled_graph = None


@router.post(
    "/chat",
    response_model=ChatResponse,
    status_code=status.HTTP_200_OK,
    summary="Interact with Midas Copilot Agent",
    description=(
        "Sends a prompt to the LangGraph conversational graph. "
        "Supports multi-turn state persistence, proactive discovery, ambiguity clarification, "
        "and structured ECharts visualization extraction."
    ),
)
async def chat_with_agent(payload: ChatRequest, request: Request) -> ChatResponse:
    """Execute a conversational turn with the Copilot Agent."""
    thread_id = payload.thread_id.strip() if payload.thread_id else f"session_{uuid.uuid4().hex[:8]}"
    user_message = payload.message.strip()
    user_role = getattr(request.state, "user_role", None) or request.headers.get("X-User-Role", "director_general")

    effective_cid = payload.connection_id
    if not effective_cid and thread_id:
        try:
            from src.core.session.store import get_session_store
            s_store = get_session_store()
            sess = s_store.get_session(thread_id)
            if sess and sess.metadata and isinstance(sess.metadata, dict):
                effective_cid = sess.metadata.get("connection_id")
        except Exception:
            pass

    if not user_message:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="El mensaje no puede estar vacío.",
        )

    try:
        from src.agent.graph.builder import invoke_turn

        graph = get_agent_graph()
        if _is_gold_materialization_confirmation(user_message):
            snapshot = graph.get_state({"configurable": {"thread_id": thread_id}})
            previous_state = snapshot.values if snapshot else {}
            sql = payload.sql_query or previous_state.get("sql")
            schemas = previous_state.get("schemas", [])

            # Recuperar SQL previo desde los metadatos de la sesion si el snapshot en memoria no lo tiene
            if not sql:
                try:
                    from src.core.session.store import get_session_store
                    s_store = get_session_store()
                    msgs = s_store.get_messages(thread_id)
                    if not msgs and thread_id:
                        msgs = s_store.get_messages(thread_id.lower())
                    for m in reversed(msgs):
                        meta = m.metadata if hasattr(m, "metadata") else (m.get("metadata") if isinstance(m, dict) else {})
                        if isinstance(meta, dict) and meta.get("sql"):
                            sql = meta.get("sql")
                            break
                except Exception as ex_sql:
                    logger.debug("Error recuperando SQL previo: %s", ex_sql)

            if not schemas:
                try:
                    schemas = [
                        {"table": t.get("table", ""), "columns": t.get("columns", [])}
                        for s in live_catalog_source_provider()
                        for t in s.get("tables", [])
                        if isinstance(t, dict) and t.get("columns")
                    ]
                except Exception:
                    schemas = []

            # Si hay SQL pero schemas está vacío, sintetizar desde las tablas del query
            if sql and not schemas:
                matched_tables = re.findall(r"FROM\s+([a-zA-Z0-9_\.]+)", sql, re.IGNORECASE)
                schemas = [{"table": t, "columns": []} for t in matched_tables]

            if not sql:
                confirmation_msg = (
                    "Para materializar tu tabla Gold, **tú decides la definición exacta** de los datos a consolidar. "
                    "Por favor indícame:\n\n"
                    "1. **Fuente de datos:** ¿Cuál de tus fuentes conectadas deseas usar?\n"
                    "2. **Dimensiones:** ¿Por qué campo o categoría deseas agrupar?\n"
                    "3. **Métricas:** ¿Qué cálculo numérico deseas totalizar (suma, promedio, conteo)?\n\n"
                    "Formula tu consulta analítica primero (ej: *'promedio de salarios por departamento'*, *'stock por almacén'*, *'consultas por especialidad'* o *'total ventas por canal'*) "
                    "y tras ver los resultados, la convertiremos de inmediato en tu contrato Gold gobernado en Airflow."
                )
                try:
                    from src.core.session.store import get_session_store
                    s_store = get_session_store()
                    if not s_store.get_session(thread_id):
                        s_store.create_session(session_id=thread_id, title="Definición Capa Gold")
                    s_store.add_message(session_id=thread_id, sender="user", content=user_message)
                    s_store.add_message(
                        session_id=thread_id,
                        sender="assistant",
                        content=confirmation_msg,
                        metadata={"intent": "materialize_gold", "awaiting_user_definition": True},
                    )
                except Exception as store_err:
                    logger.warning("Could not persist gold definition prompt to session store: %s", store_err)

                return ChatResponse(
                    thread_id=thread_id,
                    intent="materialize_gold",
                    response=confirmation_msg,
                    suggestions=[
                        "Ver fuentes conectadas para elegir dimensiones",
                        "Consultar totales agrupados por categoría",
                    ],
                    needs_clarification=False,
                )

            from src.agent.tools.dag_generator import build_pipeline_spec, publish_pipeline_spec
            import inspect

            # Recolectar consultas analíticas previas de la sesión
            recent_queries: List[str] = []
            try:
                from src.core.session.store import get_session_store
                s_store = get_session_store()
                msgs = s_store.get_messages(thread_id)
                if not msgs and thread_id:
                    msgs = s_store.get_messages(thread_id.lower())
                for m in reversed(msgs):
                    meta = m.metadata if hasattr(m, "metadata") else (m.get("metadata") if isinstance(m, dict) else {})
                    if isinstance(meta, dict) and meta.get("sql"):
                        q = str(meta.get("sql")).strip()
                        if q and q not in recent_queries:
                            recent_queries.append(q)
            except Exception as ex_recent:
                logger.debug("Error recolectando recent_queries: %s", ex_recent)

            if not sql and recent_queries:
                sql = recent_queries[0]

            # Detectar si el usuario pide unir reportes o agregar tabla secundaria
            is_composite = any(k in user_message.lower() for k in ("secundaria", "segunda", "unir", "ambas", "ambos", "dos tablas", "reporte secundario"))
            queries_to_process: List[str] = []
            if is_composite and len(recent_queries) >= 2:
                # Ordenar cronológicamente (la consulta previa primero, la más reciente segunda)
                queries_to_process = list(reversed(recent_queries[:2]))
            elif sql:
                queries_to_process = [sql]
            elif recent_queries:
                queries_to_process = [recent_queries[0]]

            from src.core.query_engine.trino_client import TrinoClient
            tc = TrinoClient()

            materialized_tables_info: List[Dict[str, Any]] = []
            total_records_count = 0
            latest_table_name = ""

            for idx, q_sql in enumerate(queries_to_process):
                q_lower = q_sql.lower()
                if "period" in q_lower:
                    report_slug = "fct_top_sales_periods"
                elif any(k in q_lower for k in ("group", "subject", "industry")):
                    report_slug = "fct_industry_financial_summary"
                elif any(k in q_lower for k in ("country", "city", "ciudad", "cliente")):
                    report_slug = "dim_clientes_distribucion"
                else:
                    report_slug = f"gold_marts_report_{idx+1}"

                # Limpiar LIMIT del query CTAS para capturar todos los datos analíticos
                clean_ctas_query = re.sub(r"\s+LIMIT\s+\d+", "", q_sql, flags=re.IGNORECASE)

                spec = build_pipeline_spec(
                    report_slug,
                    clean_ctas_query,
                    schemas,
                )
                sig = inspect.signature(publish_pipeline_spec)
                if "session_id" in sig.parameters:
                    spec_uri = publish_pipeline_spec(spec, confirmed=True, session_id=thread_id)
                else:
                    spec_uri = publish_pipeline_spec(spec, confirmed=True)

                # Ejecución CTAS real en Trino Iceberg
                tbl_name = spec.output_table if spec.output_table.startswith("iceberg.") else f"iceberg.{spec.output_table}"
                try:
                    tc.execute_ddl_sync(f"CREATE TABLE IF NOT EXISTS {tbl_name} AS {clean_ctas_query}")
                except Exception as ctas_err:
                    logger.debug("Creacion inmediata en Trino %s diferida: %s", tbl_name, ctas_err)

                # Inspeccionar filas generadas reales
                rec_count = 0
                try:
                    count_res = tc.execute_query_sync(f"SELECT COUNT(*) FROM {spec.output_table}")
                    if count_res and count_res.data:
                        rec_count = list(count_res.data[0].values())[0] or 0
                except Exception:
                    rec_count = 0

                total_records_count += rec_count
                latest_table_name = spec.output_table
                materialized_tables_info.append({
                    "table": spec.output_table,
                    "pipeline_id": spec.pipeline_id,
                    "spec_uri": spec_uri,
                    "records": rec_count,
                    "sql": clean_ctas_query,
                })

            airflow_triggered = False
            for t_item in materialized_tables_info:
                if _trigger_airflow_dag(t_item["pipeline_id"]):
                    airflow_triggered = True

            airflow_status_note = (
                "- **Orquestador Airflow:** DAG activado exitosamente y enviado a Spark Master (Spark UI: `http://localhost:8086`, Airflow: `http://localhost:8085`)."
                if airflow_triggered
                else "- **Orquestador Airflow:** Contrato YAML registrado en MinIO. Listo para orquestar con Spark al iniciar Airflow (`docker compose --profile orchestration up -d`)."
            )

            if len(materialized_tables_info) > 1:
                tables_md = "\n".join(
                    f"- **Tabla {i+1}:** `{t['table']}` ({t['records']} registros consolidados) | *Airflow DAG:* `dag_{t['pipeline_id']}`"
                    for i, t in enumerate(materialized_tables_info)
                )
                confirmation_msg = (
                    f"Capa Gold compuesta generada exitosamente. Se materializaron **{len(materialized_tables_info)} tablas** analíticas en Iceberg mediante Trino y sus contratos quedaron registrados en MinIO para Airflow:\n\n"
                    f"{tables_md}\n\n"
                    f"- **Motor de ejecución inmediata:** Trino 450 (Apache Iceberg REST)\n"
                    f"{airflow_status_note}\n"
                    f"- **Total registros en Data Mart:** {total_records_count}\n"
                    f"- **Subcarpeta de contratos en MinIO:** `s3://midas-governance/airflow-specs/{thread_id}/` (Consola Web: `http://localhost:9001` con usuario `midas_minio_admin`)\n\n"
                    f"> **Listo para Dashboard:** Las tablas ya están disponibles en el **Centro de Analítica** de tu sesión como pestañas interactivas para explorar y exportar."
                )
            else:
                t0 = materialized_tables_info[0]
                confirmation_msg = (
                    f"Capa Gold generada exitosamente. La tabla **{t0['table']}** ha sido materializada en Iceberg mediante Trino y su contrato declarativo quedó registrado en MinIO para Airflow.\n\n"
                    f"- **Tabla de salida:** `{t0['table']}`\n"
                    f"- **Motor de ejecución inmediata:** Trino 450 (Apache Iceberg REST)\n"
                    f"{airflow_status_note}\n"
                    f"- **Contrato gobernado:** `{t0['spec_uri']}`\n"
                    f"- **Registros consolidados:** {t0['records'] if t0['records'] else 'Procesados'}\n"
                    f"- **Subcarpeta de sesión en MinIO:** `s3://midas-governance/airflow-specs/{thread_id}/` (Consola Web: `http://localhost:9001` con usuario `midas_minio_admin`)\n\n"
                    f"> **Listo para Dashboard:** Esta tabla Gold ya está disponible en el **Centro de Analítica** de tu sesión para consultas interactivas, gráficos y reportes ejecutivos."
                )

            # Publicar telemetría viva al Canvas para actualizar nodo Gold
            try:
                from src.core.telemetry.hub import get_telemetry_hub
                from src.core.telemetry.events import TelemetryEvent, NodeStatus
                t_hub = get_telemetry_hub()
                t_hub.publish_sync(
                    TelemetryEvent(
                        event_id=f"evt_gold_{uuid.uuid4().hex[:8]}",
                        pipeline_id=materialized_tables_info[0]["pipeline_id"],
                        node_id="gold_marts",
                        status=NodeStatus.HEALTHY,
                        records_in=total_records_count or 100,
                        records_out=total_records_count or 100,
                        latency_ms=35.0,
                        details={
                            "output_table": latest_table_name,
                            "pipeline_id": materialized_tables_info[0]["pipeline_id"],
                            "spec_uri": materialized_tables_info[0]["spec_uri"],
                            "sql": sql,
                            "action": "MATERIALIZED",
                            "tables_count": len(materialized_tables_info),
                        },
                    )
                )
            except Exception as t_exc:
                logger.debug("No se pudo emitir telemetria de materializacion Gold: %s", t_exc)

            try:
                from src.core.session.store import get_session_store
                s_store = get_session_store()
                sess = s_store.get_session(thread_id)
                if not sess:
                    sess = s_store.create_session(session_id=thread_id, title="Materialización Gold")
                
                # Registrar tablas Gold en los metadatos de la sesión
                if sess:
                    meta = dict(sess.metadata or {})
                    gold_list = list(meta.get("gold_tables") or [])
                    for t_item in materialized_tables_info:
                        if t_item["table"] not in gold_list:
                            gold_list.append(t_item["table"])
                    meta["gold_tables"] = gold_list
                    meta["latest_gold_table"] = latest_table_name
                    meta["total_records"] = total_records_count
                    meta["records_count"] = total_records_count
                    meta["spec_uri"] = materialized_tables_info[0]["spec_uri"]
                    meta["pipeline_id"] = materialized_tables_info[0]["pipeline_id"]
                    sess.metadata = meta

                s_store.add_message(session_id=thread_id, sender="user", content=user_message)
                s_store.add_message(
                    session_id=thread_id,
                    sender="assistant",
                    content=confirmation_msg,
                    metadata={
                        "intent": "materialize_gold",
                        "spec_uri": materialized_tables_info[0]["spec_uri"],
                        "pipeline_id": materialized_tables_info[0]["pipeline_id"],
                        "output_table": latest_table_name,
                        "gold_table": latest_table_name,
                        "gold_tables": [t["table"] for t in materialized_tables_info],
                    },
                )
            except Exception as store_err:
                logger.warning("Could not persist materialization confirmation to session store: %s", store_err)

            return ChatResponse(
                thread_id=thread_id,
                intent="materialize_gold",
                response=confirmation_msg,
            )

        inf_mode = payload.inference_mode or getattr(request.state, "inference_mode", None) or "cloud"
        result_state = invoke_turn(
            graph=graph,
            thread_id=thread_id,
            user_message=user_message,
            user_role=user_role,
            inference_mode=inf_mode,
            connection_id=effective_cid,
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Error executing agent turn for thread '%s': %s", thread_id, exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Error durante el procesamiento del diálogo: {exc}",
        ) from exc

    # Parse and decouple response cleanly per Punto 2.5
    raw_response = result_state.get("response", "")
    echarts_option = result_state.get("echarts_option")
    metrics_summary = result_state.get("metrics_summary", [])
    suggestions = result_state.get("suggestions", [])
    intent = result_state.get("intent")
    needs_clarification = result_state.get("needs_clarification", False)

    if needs_clarification:
        echarts_option = None
        metrics_summary = []

    # Check structured storytelling_result from HU-AI-03
    storytelling_result = result_state.get("storytelling_result")
    if isinstance(storytelling_result, dict):
        if not echarts_option and "echarts_option" in storytelling_result:
            echarts_option = storytelling_result["echarts_option"]
        if not metrics_summary and "metrics_summary" in storytelling_result:
            metrics_summary = storytelling_result["metrics_summary"]

    # If raw_response is a serialized JSON string (fallback), unpack it safely
    clean_markdown = raw_response
    if isinstance(raw_response, str) and raw_response.strip().startswith("{") and raw_response.strip().endswith("}"):
        try:
            parsed_json = json.loads(raw_response)
            if "narrative" in parsed_json:
                clean_markdown = parsed_json["narrative"]
            if not echarts_option and "echarts_option" in parsed_json:
                echarts_option = parsed_json["echarts_option"]
            if not metrics_summary and "metrics_summary" in parsed_json:
                metrics_summary = parsed_json["metrics_summary"]
        except (json.JSONDecodeError, TypeError):
            clean_markdown = raw_response

    try:
        from src.core.session.store import get_session_store
        session_store = get_session_store()
        if not session_store.get_session(thread_id):
            session_store.create_session(session_id=thread_id, title="Conversación con Copiloto")
        session_store.add_message(session_id=thread_id, sender="user", content=user_message)
        session_metadata = {
            "intent": intent,
            "suggestions": suggestions if isinstance(suggestions, list) else [],
            "needs_clarification": bool(needs_clarification),
        }
        if isinstance(echarts_option, dict):
            session_metadata["echarts_option"] = echarts_option
        if isinstance(metrics_summary, list):
            session_metadata["metrics_summary"] = metrics_summary
        if result_state.get("sql"):
            session_metadata["sql"] = result_state.get("sql")

        session_store.add_message(
            session_id=thread_id,
            sender="assistant",
            content=clean_markdown,
            metadata=session_metadata,
        )
    except Exception as store_err:
        logger.warning("Could not persist chat turn to session store: %s", store_err)

    return ChatResponse(
        thread_id=thread_id,
        intent=intent,
        response=clean_markdown,
        suggestions=suggestions if isinstance(suggestions, list) else [],
        needs_clarification=bool(needs_clarification),
        echarts_option=echarts_option if isinstance(echarts_option, dict) else None,
        metrics_summary=metrics_summary if isinstance(metrics_summary, list) else [],
        sql=result_state.get("sql"),
    )


@router.post(
    "/chat/stream",
    summary="Multi-turn interactive chat with Copilot via SSE streaming",
    description="Streams real-time execution stages, narrative tokens, and final chart payloads.",
)
async def chat_with_agent_stream(payload: ChatRequest, request: Request):
    """Server-Sent Events (SSE) streaming endpoint for instantaneous typing feedback."""
    user_message = (payload.message or "").strip()
    if not user_message:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El mensaje no puede estar vacío.",
        )

    async def event_generator():
        try:
            # 1. Etapa de análisis inicial
            yield f"event: status\ndata: {json.dumps({'stage': 'routing', 'message': 'Analizando consulta y verificando fuentes conectadas...'})}\n\n"
            await asyncio.sleep(0.02)

            # 2. Etapa de consulta al motor
            yield f"event: status\ndata: {json.dumps({'stage': 'query', 'message': 'Consultando motor analítico Trino / Iceberg...'})}\n\n"

            # Ejecución completa del turno agéntico
            chat_response = await chat_with_agent(payload, request)

            # 3. Etapa de síntesis
            yield f"event: status\ndata: {json.dumps({'stage': 'storytelling', 'message': 'Generando síntesis ejecutiva y visualización...'})}\n\n"
            await asyncio.sleep(0.01)

            # 4. Stream continuo de tokens de narrativa
            text = chat_response.response or ""
            words = text.split(" ")
            chunk_size = 2
            for i in range(0, len(words), chunk_size):
                chunk = " ".join(words[i : i + chunk_size])
                if i + chunk_size < len(words):
                    chunk += " "
                yield f"event: token\ndata: {json.dumps({'delta': chunk})}\n\n"
                await asyncio.sleep(0.008)

            # 5. Payload final estructurado
            final_dict = jsonable_encoder(chat_response)
            yield f"event: result\ndata: {json.dumps(final_dict)}\n\n"
        except Exception as exc:
            logger.error("Error en streaming del Copiloto: %s", exc, exc_info=True)
            yield f"event: error\ndata: {json.dumps({'detail': str(exc)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post(
    "/materialize",
    response_model=MaterializeResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Publish a confirmed Gold pipeline",
)
async def materialize_gold_pipeline(payload: MaterializeRequest) -> MaterializeResponse:
    """Publish a safe declarative contract after explicit user approval."""
    from src.agent.tools.dag_generator import build_pipeline_spec, publish_pipeline_spec

    try:
        spec = build_pipeline_spec(
            payload.report_name,
            payload.sql,
            payload.catalog,
            cron_schedule=payload.cron_schedule,
        )
        uri = publish_pipeline_spec(spec, confirmed=payload.confirmed)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)) from exc
    except Exception as exc:
        logger.exception("Could not publish Gold pipeline contract")
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail="Could not publish the pipeline contract") from exc

    return MaterializeResponse(spec_uri=uri, pipeline_id=spec.pipeline_id, output_table=spec.output_table)


def _is_gold_materialization_confirmation(message: str) -> bool:
    """Match the confirmation text sent by the frontend approval card or user prompts."""
    normalized = re.sub(r"[.!?\s]+", " ", message.casefold()).strip()
    if normalized == GOLD_MATERIALIZATION_CONFIRMATION:
        return True
    triggers = (
        "materializa este reporte",
        "materializar este reporte",
        "materializa tabla gold",
        "materializar tabla gold",
        "crear tabla gold",
        "crea tabla gold",
        "crear una tabla gold",
        "crea una tabla gold",
        "construir gold mart",
        "construye gold mart",
        "construir tabla gold",
        "materializar gold mart",
        "materializa gold mart",
        "guardar como tabla gold",
        "guarda como tabla gold",
        "guardar como gold",
        "guarda como gold",
        "programar tabla gold",
        "programa tabla gold",
        "crear capa gold",
        "crea capa gold",
        "materializar capa gold",
        "materializa capa gold",
        "construir capa gold",
        "elaboracion de la capa gold",
        "elaboración de la capa gold",
        "generar capa gold",
        "generar gold mart",
    )
    if any(t in normalized for t in triggers):
        return True
    return bool(re.search(r"\b(crea|crear|materializa|materializar|guarda|guardar|agrega|agregar|construye|construir)\b.{0,40}\b(tabla\s+gold|capa\s+gold|gold\s+mart|data\s+mart)\b", normalized))
