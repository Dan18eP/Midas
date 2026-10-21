# ADR-009: Orquestación Integral Tri-Medallón en Apache Airflow y Aislamiento Multi-Fuente en MinIO S3

> **Estado:** Aceptado  
> **Fecha:** 20 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Edgar Corzo, Elian Rivera  
> **Decisores:** Jesús Noguera (Team Leader), Daniel Echeverría (Backend Lead & Arquitecto)  

---

## 1. Contexto

La arquitectura canónica de Midas ([02_mvp_dorado_blueprint_global.md](../canonical/02_mvp_dorado_blueprint_global.md)) establece un flujo continuo y auditable que viaja desde las fuentes operacionales hasta los marts dimensionales de la capa Gold.

No obstante, la auditoría del estado actual del repositorio reveló dos desviaciones fundamentales:
1. **Inversión y Omisión de Capas en Airflow:** La fábrica de DAGs ([dag_factory.py](../../src/orchestration/dag_factory.py)) solo orquestaba procesos para la capa Gold. La ingesta Bronze ([universal_engine.py](../../src/lakehouse/ingestion/universal_engine.py)) y la limpieza Silver ([bronze_to_silver.py](../../src/lakehouse/transforms/bronze_to_silver.py)) se estaban ejecutando directamente mediante scripts de Python en memoria, omitiendo la orquestación distribuida.
2. **Falta de Trazabilidad y Aislamiento Multi-Fuente:** Al no pasar por Airflow, las etapas tempranas no dejaban evidencia auditable de tareas (`TaskInstances`), reintentos ni logs operacionales. Adicionalmente, el almacenamiento en MinIO depositaba los datos en rutas planas sin un esquema estricto de aislamiento por conexión (`connection_id`).

Bajo el **Mandato de Jesús Noguera (Team Leader)**, se dictaminó que la plataforma debe automatizar los procesos pero ejecutarlos internamente con el mismo rigor y auditabilidad que si un ingeniero de datos experto los realizara manualmente paso a paso.

---

## 2. Decisión

Se decide **orquestar de extremo a extremo todas las transiciones del Lakehouse (Bronze $\rightarrow$ Silver $\rightarrow$ Gold) mediante Apache Airflow y Apache Spark 3.5**, implementando una arquitectura de particionamiento desacoplada en MinIO S3:

1. **Patrón Tri-Medallón Orquestado en Airflow:**  
   Se reemplaza la ejecución aislada en Python por tres categorías de DAGs dinámicos gestionados por la fábrica de Airflow:
   - **`dag_ingest_<conn_id>` (Source $\rightarrow$ Bronze):** Tarea programada que ejecuta el conector correspondiente (PostgreSQL, Excel, API REST), extrae los registros, aplica el sobre de auditoría universal de 8 columnas y deposita el lote en Bronze S3 en formato Parquet inmutable.
   - **`dag_clean_<conn_id>` (Bronze $\rightarrow$ Silver):** Tarea PySpark enviada a `midas-spark-master` mediante `SparkSubmitOperator`. Lee de Bronze, ejecuta las reglas de calidad estandarizadas ([quality_rules.py](../../src/lakehouse/quality/quality_rules.py)), desvía anomalías (F3 monto negativo, IDs nulos) a `midas-quarantine` y escribe tablas Iceberg v2 limpias en `midas-silver`.
   - **`dag_gold_<pipeline_id>` (Silver $\rightarrow$ Gold):** Tarea PySpark que materializa los Data Marts aprobados con patrón Write-Audit-Publish (WAP) y emite notificaciones de nuevo nodo hacia el hub de telemetría SSE.

2. **Inclusión de Clúster Spark 3.5 en Monodocker:**  
   Se integran formalmente los servicios `midas-spark-master` y `midas-spark-worker` en `docker-compose.yml`, equipando a los ejecutores y al contenedor de Airflow con los conectores requeridos (`iceberg-spark-runtime-3.5` y `hadoop-aws`).

3. **Jerarquía Canónica de Aislamiento en MinIO S3:**  
   Para asegurar que nuevas conexiones de datos (un CRM hoy, una API REST de logística mañana o un Excel de presupuesto regional) operen con total independencia:
   - **Bronze:** `s3://midas-bronze/sources/<connection_id>/<dataset>/year=%Y/month=%m/day=%d/<batch_id>.parquet`
   - **Silver:** `s3://midas-silver/tables/<domain>/<dataset>/` (Tablas Iceberg v2 gestionadas por catálogo REST)
   - **Cuarentena:** `s3://midas-quarantine/incidents/<connection_id>/<date>/incident_<id>.json`
   - **Gold:** `s3://midas-gold/marts/<mart_name>/` (Tablas Iceberg v2 analíticas)

4. **Registro Central de Conexiones (`SourceConnectionRegistry`):**  
   Cada conexión se registra en la base de datos operacional (`midas_operational.source_connections`) mediante FastAPI. El registro dispara la creación del contrato declarativo correspondiente en `midas-governance/source-contracts/<connection_id>.yaml`, activando automáticamente sus DAGs en Airflow.

5. **Contratos YAML gobernados:**
   - Cada contrato de conexión se guarda en `source-contracts/<conn_id>.yaml` dentro del bucket `midas-governance`. Contiene `kind: connection`, `conn_id`, `cron_schedule`, `source`, `bronze` y `silver`.
   - `source.type` admite `postgres`, `csv` y `rest_api`. PostgreSQL usa `source.table` y `source.schema` de forma opcional; la URL se obtiene de la variable de entorno indicada por `source.url_env` (por defecto: `POSTGRES_OPERATIONAL_URL`). CSV usa `source.path`. REST usa `source.url`, opcionalmente `source.data_key` para la lista de respuesta y `source.headers_env` para cargar encabezados JSON desde una variable de entorno.
   - `bronze.path` es opcional. De forma predeterminada, los archivos Parquet con el sobre de auditoría se escriben en `s3a://midas-bronze/sources/<conn_id>/<dataset>/year=YYYY/month=MM/day=DD/<batch_id>.parquet`.
   - `silver.table` es obligatorio y debe usar el espacio de nombres `silver`. Los campos opcionales `primary_key_fields`, `amount_fields` y `date_fields` configuran la puerta de calidad. `quarantine_path` es opcional; su valor predeterminado es `s3a://midas-quarantine/incidents/<conn_id>/`.
   - Cada contrato Gold se guarda en `airflow-specs/dag_gold_<pipeline_id>.yaml` y declara `pipeline_id`, `cron_schedule`, `transform_sql`, `output_table` y `quality_policies`. Solo se admite una instrucción `SELECT`. El resultado se audita en una tabla WAP temporal antes de reemplazar el destino Gold.
   - Las credenciales no se incluyen en YAML. Los jobs leen secretos desde variables de entorno y publican eventos de inicio y resultado en `POST /api/v1/telemetry/publish`.

Ejemplo mínimo de contrato de conexión:

```yaml
kind: connection
conn_id: crm
cron_schedule: "0 */6 * * *"
source:
  type: postgres
  schema: public
  table: orders
  url_env: POSTGRES_OPERATIONAL_URL
bronze:
  path: s3a://midas-bronze/sources/crm/
silver:
  table: silver.orders
  primary_key_fields: [transaccion_id]
  amount_fields: [monto]
  date_fields: [fecha_transaccion]
```

---

## 3. Consecuencias

### Audit repair details

Airflow explicitly loads `/opt/midas/spark-conf/spark-defaults.conf` and runs
Python drivers in the scheduler container. Executors connect to that scheduler
on the private Docker network. Spark 3.5.1 uses the Scala 2.12 Iceberg 1.5.0
runtime and AWS bundle, Hadoop S3A 3.3.4, and PostgreSQL JDBC 42.7.3 through
Spark's package resolver. The first job needs access to Maven Central.
The Spark connection uses JSON with the full `spark://host:port` as its host;
a plain `spark://host:port` connection URI loses the protocol during parsing.

Only ingestion is scheduled for a connection. Successful ingestion triggers its
cleaning DAG with the same batch identifier; Gold waits for the Silver datasets
it reads. Each destination has a single active writer and bounded retries.
Bronze batches have stable paths and a completion manifest written after the
Parquet commit. Cleaning reads completed batches only and deduplicates explicit
business keys before replacing the connection-owned Silver table. Telemetry
failure must not repeat a committed data write.

Registration stores complete runtime configuration in PostgreSQL and publishes
its YAML contract to MinIO. Incomplete registrations remain inactive. A storage
or database failure is reported instead of silently accepting an active source.
Credentials are environment references, never inline passwords or tokens.


### Positivas:
- **Auditabilidad Humana Completa:** Cualquier usuario o auditor puede abrir la interfaz web de Airflow (puerto 8085) y verificar el estado, historial, tiempos de ejecución y logs de cada fase desde la ingesta cruda hasta el reporte final.
- **Tolerancia a Fallos e Independencia de Fuentes:** Si una fuente externa sufre una interrupción o envía datos corruptos, solo su DAG particular (`dag_ingest_<conn_id>`) y su ruta de cuarentena se ven afectados; las demás fuentes y marts continúan operando normalmente.
- **Rendimiento Distribuido:** Las transformaciones de datos y deduplicaciones se delegan a Apache Spark, liberando al servidor web FastAPI de tareas de cómputo intensivo.

### Mitigaciones y Límites:
- **Consumo de Recursos en Desarrollo:** Mantener los contenedores de Spark Master, Worker y Airflow activos requiere ~3 GB de memoria adicionales en el entorno Docker, mitigado mediante perfiles (`lakehouse`, `orchestration`, `full`).
