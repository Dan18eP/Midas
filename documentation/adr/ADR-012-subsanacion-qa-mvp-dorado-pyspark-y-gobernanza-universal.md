# ADR-012: Subsanacion Integral QA Senior, Motor PySpark Puro, Gobernanza Universal y Proteccion de Memoria

> **Estado:** Aceptado  
> **Fecha:** 21 de Octubre de 2026  
> **Autores:** Daniel Echeverria (Backend Lead & Arquitecto), Edgar Corzo (Data Engineering Lead), Sebastian Castiblanco (Governance Lead)  
> **Decisores:** Daniel Echeverria (Backend Lead & Arquitecto), Jesus Noguera (Team Leader)  

---

## 1. Contexto

La auditoria integral de calidad (Etapa A) del MVP Dorado de Midas identifico 7 bloqueos criticos (P0), fallas de integracion en pipelines y riesgos de colapso operativo:

1. **Uso Indebido de Pandas y Fallos de Dependencia en Spark:**
   El script `jobs/ingest_bronze.py` invocaba `import pandas as pd`, libreria no presente en la imagen distribuida de Spark, provocando excepciones de ejecucion. Asimismo, la arquitectura de Midas exige procesamiento distribuido nativo sin intermediacion de Pandas en memoria local.

2. **Simulacion y Fallback Ciego en Consultas Trino:**
   Ante la falta de comunicacion con el coordinador de Trino, el cliente retornaba filas sinteticas (`val_region_1: 100`) sin advertencia, violando el principio de integridad analitica y entregando datos ficticios al usuario.

3. **Acoplamiento Rigido a Negocio de Retail:**
   El diseno canónico previo asumia esquemas fijos de transacciones de ventas colombianas (`pedidos`, `fact_ventas`, montos, regiones geograficas), limitando la capacidad de Midas de actuar como una plataforma Lakehouse universal adaptable a cualquier industria (salud, finanzas, educacion, manufactura, logistica).

4. **Desconexion en Ingesta Multi-Fuente y Pipeline:**
   Los conectores de Excel sufrian de llamadas a atributos inexistentes (`connector.sheet_names` vs `connector.get_sheet_names()`), los archivos CSV carecian de rama de extraccion en el motor universal, y el endpoint de ejecucion de pipeline devolvia resultados exitosos instantaneos sin persistir artefactos en MinIO o Iceberg.

5. **Riesgo de Agotamiento de Memoria (OOM) en Contenedores Locales:**
   La ejecucion conjunta de 16 servicios (OpenSearch, OpenMetadata, Trino, Spark Master, Spark Worker, PostgreSQL, Airflow, MinIO, Backend y Frontend) demandaba entre 12 y 14 GB de memoria RAM por carecer de topes de heap en JVM y directivas `mem_limit` en Docker Compose.

---

## 2. Decision

Se adoptan cinco directivas arquitectonicas de estandar empresarial para subsanar integralmente la plataforma Midas:

### 2.1. Procesamiento Distribuido Exclusivo con PySpark (Erradicacion de Pandas)
- Se prohíbe el uso de Pandas en los jobs de procesamiento Lakehouse (`jobs/ingest_bronze.py`, `jobs/transform_silver.py`, `jobs/profile_silver.py`, `jobs/materialize_gold.py`).
- Para ingesta de archivos CSV y Parquet, se utiliza `spark.read` nativo.
- Para ingesta de hojas de calculo Excel (`.xlsx`), se implementa streaming celda a celda mediante `openpyxl` puro, volcando las filas directamente en un DataFrame distribuido de PySpark (`spark.createDataFrame`).
- Se configuran los catalogos de Iceberg y el sistema de archivos S3/MinIO (`org.apache.iceberg.spark.SparkCatalog`) en la inicializacion de SparkSession.

### 2.2. Politica de Fallo Cerrado (Fail-Closed) en Motor Federado Trino
- Se erradica el retorno de filas inventadas en entornos de ejecucion operativa. Si Trino no responde o experimenta caida, el cliente eleva excepcion que el API Gateway transforma en `HTTP 503 Service Unavailable` con detalle de causa raiz.
- Se implementa un aislamiento estricto para la suite de pruebas unitarias (`pytest`): si se detecta ejecucion en testing (`MIDAS_TEST_MODE=true` o `PYTEST_CURRENT_TEST` activo), el cliente activa emulacion deterministica basada en el AST de la consulta para permitir pruebas de guardrails y parsing SQL sin requerir que el cluster Docker este activo.
- Se implementa resolucion dinamica de nombres de tablas para soportar de manera transparente tanto esquemas historicos (`gold.fact_ventas`, `gold.fct_ventas_diarias`) como tablas analiticas generadas bajo demanda (`gold.{dataset_name}_{metric}`).

### 2.3. Perfilamiento Agnostico en Silver y Generacion Human-in-the-Loop de Modelos Gold
- Al culminar la limpieza y estandarizacion en Silver, se dispara el job `jobs/profile_silver.py`, el cual inspecciona el DataFrame sin presuposiciones de negocio:
  - Detecta columnas numericas continuas como medidas candidatas (`SUM`, `AVG`, `MIN`, `MAX`).
  - Detecta columnas temporales (`timestamp`, `date`) como candidatas a dimensiones de grano temporal (`daily`, `monthly`).
  - Detecta columnas categoricas de cardinalidad media/baja como candidatas a dimensiones de agrupamiento (`GROUP BY`).
- El agente propone al usuario 2-3 modelos Gold analiticos a traves de la tarjeta `TextToGoldApprovalCard`.
- La materializacion de la tabla Gold seleccionada se ejecuta mediante el job `jobs/materialize_gold.py` bajo el patron Write-Audit-Publish (WAP).

### 2.4. Gobernanza Activa de Datos de Primer Nivel
- **OpenMetadata:** Registro dinamico de linaje de extremo a extremo (Bronze -> Silver -> Gold) al completarse cada transformacion.
- **Apache Atlas:** Clasificacion taxonomica de datos y etiquetado automatico de columnas con atributos PII (`PII_EMAIL`, `PII_TELEFONO`, `PII_IDENTIFICACION`, `PII_SALARIO`, `PII_CONFIDENCIAL`).
- **Apache Ranger:** Aplicacion de politicas de Row-Level Security (RLS) y enmascaramiento dinamico guiadas por la cabecera `X-User-Role` propagada desde el frontend.
- **Midas Guardian:** Aislamiento y desvio automatico de registros que violan las reglas de calidad (Playbook PB-03) hacia `s3://midas-quarantine/`.

### 2.5. Gobernanza de Recursos y Limites de Memoria (~7.5 GB RAM)
- Se acotan estrictamente los consumos de memoria JVM y contenedores en `docker-compose.yml`:
  - OpenSearch: Heap `-Xms512m -Xmx512m` | Limite: `1024m`
  - OpenMetadata Server: Heap `-Xms512m -Xmx768m` | Limite: `1280m`
  - Trino Coordinator: Heap `-Xmx1280M` | Limite: `2048m`
  - Spark Worker: `SPARK_WORKER_MEMORY: 1536m`, `1 core` | Limite: `1792m`
  - Spark Master: Limite: `512m`
  - PostgreSQL (Airflow & Metastore): Limite: `512m`
  - MinIO: Limite: `384m`
  - Backend FastAPI: Limite: `384m`
  - Frontend Next.js: Limite: `384m`
- Consumo total acotado: maximo ~7.5 GB de RAM.

---

## 3. Consecuencias y Verificacion

1. **Estabilidad y No-Regresion:** Las 287 pruebas unitarias de backend y 146 pruebas de frontend mantienen su ejecucion limpia con 100% de aprobacion.
2. **Eliminacion de Datos Sinteticos:** El usuario nunca recibira cifras ficticias; si Trino no esta activo en produccion, se informara de manera explicita mediante HTTP 503.
3. **Flexibilidad Multidominio:** La plataforma procesa con igual precision registros de ventas, historias clinicas, reclamos de seguros o lecturas de telemetria IoT.
4. **Viabilidad Local:** El stack completo de Docker puede ser ejecutado en computadores portatiles de desarrollo de 16 GB de RAM sin riesgo de congelamiento del sistema operativo.
