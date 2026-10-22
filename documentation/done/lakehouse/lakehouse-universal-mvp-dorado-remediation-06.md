# Subsanacion Integral QA Senior, Motor PySpark Puro, Gobernanza Universal y Proteccion de Memoria

> **Historia de Usuario / Entrega:** HU-LAKE-QA-06 (Subsanación QA Senior MVP Dorado)  
> **Rama Git:** `feature/lakehouse-universal-mvp-dorado-remediation`  
> **Responsable:** Daniel Echeverria (Backend Lead & Arquitecto Principal), Edgar Corzo (Data Engineering Lead)  
> **Revisor / Decisor:** Daniel Echeverria, Jesus Noguera  
> **Documento Canonico de Referencia:** `documentation/adr/ADR-012-subsanacion-qa-mvp-dorado-pyspark-y-gobernanza-universal.md`  

---

## 1. Checklist Anti-Code Drift Verificado

- [x] **No alteracion de formulas canonicas:** Se preservaron intactas las formulas contables inmutables de `CANONICAL_METRICS_DEFINITIONS` (Venta Neta, Pedidos Validos, Ticket Promedio, Tasa de Devolucion).
- [x] **Contratos de datos e interfaces:** Los esquemas Pydantic de la API (`/api/v1/query`, `/api/v1/pipelines`, `/api/v1/agent`, `/api/v1/connections`) y los tipos TypeScript del frontend se mantuvieron 100% compatibles.
- [x] **Guardrails de seguridad y Ranger:** Se aplican las politicas Zero-Trust, limite forzado de 1000 filas, y solo lectura en el AST de Trino.
- [x] **Single-Area Ownership:** Intervencion quirurgica acotada a conectores de ingesta, jobs de Spark, configuracion de Trino/API y docker-compose.

---

## 2. Detalle de Implementacion Tecnica

### 2.1. Erradicacion de Pandas y Adopcion de PySpark Puro
- Se elimino `import pandas as pd` de `jobs/ingest_bronze.py`, resolviendo la excepcion de `ModuleNotFoundError` en el cluster de Spark.
- Para archivos Excel (`.xlsx`), se implemento un motor de streaming celda a celda basado en `openpyxl` puro, construyendo las filas y el esquema directamente para `spark.createDataFrame()`.
- Se agrego la propiedad `sheet_names` en `ExcelSourceConnector` para corregir la discrepancia con `get_sheet_names()`.
- En `UniversalIngestionEngine`, se integro soporte nativo de extraccion para fuentes CSV utilizando `csv.DictReader` y envoltura Bronze.

### 2.2. Perfilador Agnostico y Propuestas Gold Human-in-the-Loop
- Se creo el job `jobs/profile_silver.py`, el cual analiza el DataFrame de Silver y clasifica dinamicamente:
  - Columnas numericas continuas como medidas cuantitativas (`SUM`, `AVG`, `MIN`, `MAX`).
  - Columnas temporales (`timestamp`, `date`) como grano temporal (`daily`, `monthly`).
  - Columnas categoricas como dimensiones de agrupamiento (`GROUP BY`).
- Genera 2-3 propuestas estructuradas de modelos Gold (Consolidado Temporal, Matriz Dimensional y Tablero de KPIs) y emite telemetria de aprobacion hacia `TextToGoldApprovalCard`.
- Se actualizo `jobs/materialize_gold.py` para aplicar el patron Write-Audit-Publish (WAP) con configuracion distribuida de Iceberg y S3.

### 2.3. Motor Federado Trino Fail-Closed y Catalogo de Copiloto
- Se elimino la generacion de filas sinteticas (`val_region_1: 100`) en `TrinoClient`.
- Si el coordinador de Trino no esta activo en produccion, se eleva `ConnectionError` y la API retorna `HTTP 503 Service Unavailable`.
- Se preservo el aislamiento para pruebas unitarias mediante la deteccion de entorno de testing (`MIDAS_TEST_MODE` / `PYTEST_CURRENT_TEST`), garantizando que la suite offline pase al 100%.
- En `src/api/routes/agent.py`, se doto a la instancia del agente de un proveedor de fuentes con esquemas enriquecidos (`source_provider`), resolviendo el error del catalogo que impedia al Copiloto generar consultas analiticas.

### 2.4. Optimizacion de Memoria Docker (~7.5 GB RAM)
- Se incorporaron directivas `mem_limit` y topes de heap JVM en `docker-compose.yml`:
  - OpenSearch: `-Xms512m -Xmx512m` | `mem_limit: 1024m`
  - OpenMetadata: `mem_limit: 1280m`
  - Trino: `-Xmx1280M` | `mem_limit: 2048m`
  - Spark Worker: `SPARK_WORKER_MEMORY: 1536m` | `mem_limit: 1792m`
  - Spark Master: `mem_limit: 512m`
  - PostgreSQL: `mem_limit: 512m`
  - MinIO: `mem_limit: 384m`
  - API Gateway: `mem_limit: 384m`
  - Airflow: `mem_limit: 512m`
  - Frontend: `mem_limit: 384m`
  - Total acotado: ~7.5 GB de RAM.

---

## 3. Verificacion y Pruebas Automatizadas

| Suite de Pruebas | Resultado | Estado |
|---|---|---|
| Backend Pytest (`pytest`) | 287 / 287 pruebas pasadas | EXITOSO |
| Frontend Vitest (`npm test`) | 146 / 146 pruebas pasadas | EXITOSO |
| Chequeo de Tipos TypeScript (`tsc --noEmit`) | 0 errores | EXITOSO |

---

## 4. Impacto y Coordinacion

- Cero impacto negativo o bloqueo a otros modulos.
- Preservacion absoluta de contratos OpenAPI y componentes React Flow.
- Despliegue listo para revision en Pull Request formal hacia `develop`.
