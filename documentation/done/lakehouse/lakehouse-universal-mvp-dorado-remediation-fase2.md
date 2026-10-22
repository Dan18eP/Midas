# Documento de Cierre — Subsanacion Integral QA Senior Fase 2 (Certificacion GO Total)

> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Historia / Tarea:** Remediation Fase 2 — Cierre de Bloqueadores P0 (AUD-001 a AUD-013)  
> **Responsables:** Daniel Echeverria (Tech Lead & Backend Architect) & Edgar Corzo (Data Engineering Lead)  
> **Fecha:** 21 de Octubre de 2026  
> **Rama:** `feature/lakehouse-universal-mvp-dorado-remediation`  
> **PR Asociado:** #73 (`Dan18eP/Midas/pull/73` -> `develop`)  
> **Politica de Estilo:** Cero Emojis, Document-First, Cobertura 100% de Pruebas.

---

## 1. Resumen de la Intervencion Quirurgica

Esta entrega subsana la totalidad de las observaciones y bloqueadores detectados durante la auditoria formal de QA Senior sobre el MVP Dorado de Midas:

1. **AUD-001 (Motor Trino Sincronico & Fail-Closed en Produccion):**
   - En `src/core/query_engine/trino_client.py`: `execute_query_sync` ahora implementa el bucle completo de sondeo sincronico sobre `nextUri` con extraccion tipada de proyecciones, tipos y filas reales devueltas por el coordinador de Trino.
   - En produccion (`not fallback_for_testing`): Si Trino esta inaccesible o rechaza la consulta, el sistema falla cerrado levantando `ConnectionError` (retornando `HTTP 503 Service Unavailable` en el gateway), erradicando el retorno de filas sinteticas inventadas.
   - Retencion del motor determinista local exclusivamente cuando `fallback_for_testing=True` (pruebas hermeticas bajo `pytest`).
   - Pruebas unitarias anadidas en `tests/backend/test_trino_query_engine.py` validando fail-closed y fallback determinista.

2. **AUD-002 (Introspeccion Dinamica de Catalogo para Copiloto):**
   - En `src/api/routes/agent.py`: `live_catalog_source_provider()` ahora ejecuta una consulta analitica real contra `information_schema.columns` en Trino (`silver`, `gold`, `public`), agrupando dinamicamente las columnas por tabla y asociandolas a sus fuentes canónicas correspondientes (`crm_operaciones`, `Presupuesto_Corporativo_2026.xlsx`, `helpdesk_tickets_live`, `gold_marts`).
   - En caso de arranque en frio o pruebas offline, degrada limpiamente al catalogo canonico referencial sin romper el compilador de estados de LangGraph.
   - Soporte para `PostgresSaver` condicional si `POSTGRES_OPERATIONAL_URL` esta presente en el entorno.

3. **AUD-003 & AUD-004 (Persistencia Real en MinIO y Usabilidad de Archivos Subidos):**
   - En `src/api/routes/connections.py`: Los archivos subidos via `POST /api/v1/connections/upload` ahora se guardan de forma persistente en `data/uploads/{clean_filename}` y se transfieren a MinIO en `s3://midas-bronze/sources/{connection_id}/raw/{clean_filename}`.
   - El DTO de conexion inyecta `"file_path"` y `"storage_uri"` dentro de `config_payload`.
   - En `src/api/routes/pipelines.py`: El trigger del pipeline instanciar `UniversalIngestionEngine(minio_client=minio_cli)` con `persist=True`, leyendo el archivo real y persistiendo artefactos Parquet inmutables en Bronze, Silver y Gold.
   - Inyeccion activa del Escudo PII (`PIIShield`) en `BronzeToSilverTransformer` durante la transicion hacia Silver.

4. **AUD-005 (Paquetes Iceberg para Spark 3.5 & Alineacion de Warehouse):**
   - En `docker/spark/conf/spark-defaults.conf`: Agregada la directiva `spark.jars.packages` con los artefactos Maven `org.apache.iceberg:iceberg-spark-runtime-3.5_2.12:1.5.0`, `org.apache.hadoop:hadoop-aws:3.3.4` y `com.amazonaws:aws-java-sdk-bundle:1.12.367`.
   - Corregido el URI del warehouse a `s3://midas-bronze/` para coincidir exactamente con el provisionamiento de `midas-iceberg-catalog`.
   - Creados scripts utilitarios de descarga offline `docker/spark/download_jars.sh` y `docker/spark/download_jars.ps1`.

5. **AUD-006 (Persistencia e Hidratacion de Sesiones y Conexiones en PostgreSQL):**
   - En `docker-compose.yml`: Montado `./docker/postgres/02-init-sessions-schema.sql` en `/docker-entrypoint-initdb.d/` para garantizar la creacion de las tablas `chat_sessions` y `session_messages` en `midas_operational`.
   - En `src/api/requirements.txt`: Anadidas las dependencias relacionales `sqlalchemy>=2.0.0` y `psycopg2-binary>=2.9.9`.
   - En `src/lakehouse/ingestion/connection_registry.py`: Implementado el metodo `_hydrate_from_postgres()` en la inicializacion de `SourceConnectionRegistry`, cargando conexiones preexistentes desde la tabla `source_connections`.

6. **AUD-007, AUD-010, AUD-013 (Orquestacion Airflow & Docker Build Args):**
   - En `docker-compose.yml`: Inyectada la variable `POSTGRES_OPERATIONAL_URL` en `airflow-environment`, montado el volumen `- ./data:/opt/midas/data:ro` en `airflow-volumes`, y agregado `NEXT_PUBLIC_SSE_URL` a los build args y entorno del servicio `midas-frontend`.
   - En `docker/frontend/Dockerfile`: Incorporados los argumentos `ARG NEXT_PUBLIC_SSE_URL` y `ENV NEXT_PUBLIC_SSE_URL`.
   - En `src/orchestration/dag_factory.py`: En la etapa de limpieza Silver se encadena el operador de perfilamiento agnostico `profile_silver.py` (`task_clean >> profile_task`).

7. **AUD-011 & AUD-012 (KPIs Canonicos, Tablas Gold & Gobernanza):**
   - En `src/lakehouse/transforms/silver_to_gold.py`: Sustituido `uuid.uuid4()` por un hash SHA-256 determinista basado en el contenido del registro, garantizando idempotencia estricta en el calculo de pedidos.
   - En `calculate_canonical_kpis`: Excluidos del conjunto `pedidos_validos` los registros en estado `CANCELADO` y `DEVUELTO`.
   - Compatibilidad y resolucion transparente para ambos nombres de tabla analitica (`gold.fact_ventas` y `gold.fct_ventas_diarias`).
   - Al finalizar el pipeline en `pipelines.py`, se invoca `LineageExtractor().register_lineage(...)` para registrar el linaje activo entre capas en OpenMetadata.

8. **Observabilidad Honesta y Chequeos de Subestaciones:**
   - En `src/api/routes/telemetry.py`: Inyectado el campo `is_simulated: bool` en `TelemetryHistoryResponse` para indicar de manera transparente si el buffer contiene eventos reales o el escenario de referencia T0.
   - En `src/api/routes/health.py`: Incorporado el diccionario `subsystems` reportando el estado operativo de los componentes auxiliares (`telemetry_hub`, `postgres`, `minio`).

---

## 2. Resultados de Verificacion

| Suite de Pruebas | Pruebas Ejecutadas | Resultado | Observaciones |
|---|---|---|---|
| Backend Pytest (`tests/`) | 289 | 289 Pasadas (100%) | Cero fallos. 2 nuevas pruebas para fail-closed y fallback determinista. |
| Frontend Vitest (`src/frontend/`) | 146 | 146 Pasadas (100%) | Cero fallos en todos los componentes React y hooks. |
| Compilacion TypeScript (`tsc --noEmit`) | Completa | 0 Errores | Tipado estricto verificado sin discrepancias. |
