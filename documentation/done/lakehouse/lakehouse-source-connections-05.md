# HU-LAKE-05: Registro Dinámico de Conexiones Multi-Fuente y Aislamiento en MinIO S3

- **ID de la Historia:** `HU-LAKE-05`
- **Título Oficial:** Registro Dinámico de Conexiones Multi-Fuente y Aislamiento en MinIO S3
- **Rama Oficial:** `feature/lakehouse-source-connections-minio-isolation`
- **Responsable Único:** Edgar Corzo (@EdgarCorzo777 - Data Engineering Lead)
- **Revisor Oficial:** Daniel Echeverría (@DanielEcheverria - Backend Lead & Líder de Proyecto)
- **Story Points:** 5 SP
- **Prioridad:** P0 (Bloqueante MVP Dorado)
- **Fecha de Entrega:** 20 de Octubre de 2026
- **Documentos de Referencia:**
  - [`documentation/06_nuevo_backlog_mvp_dorado.md`](../../06_nuevo_backlog_mvp_dorado.md)
  - [`documentation/adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md`](../../adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md)
  - [`documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md`](../../canonical/03_especificacion_base_de_datos_y_lakehouse.md)

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **1. Tabla operacional `midas_operational.source_connections` (PostgreSQL)** | ✅ Cumplido | Definida en [`docker/postgres/01-init-operational-seed.sql`](../../../docker/postgres/01-init-operational-seed.sql) con columnas: `connection_id`, `name`, `source_type` (`POSTGRES`, `EXCEL`, `CSV`, `REST`), `config_payload`, `status`, `created_at`, con llaves foráneas e índices por tipo y estado. |
| **2. Endpoints REST en FastAPI (`/api/v1/connections`)** | ✅ Cumplido | Implementados en [`src/api/routes/connections.py`](../../../src/api/routes/connections.py) y registrados en [`src/api/main.py`](../../../src/api/main.py):<br>- `POST /api/v1/connections/register`: valida esquemas y registra la fuente.<br>- `GET /api/v1/connections`: lista y filtra fuentes por `source_type` y `status`.<br>- `GET /api/v1/connections/{connection_id}`: consulta puntual por identificador. |
| **3. Refactorización de UniversalIngestionEngine a Parquet Snappy** | ✅ Cumplido | Implementado en [`src/lakehouse/ingestion/universal_engine.py`](../../../src/lakehouse/ingestion/universal_engine.py): Escritura inmutable de `pa.Table` con compresión `snappy` (`compression='snappy'`) vía PyArrow en MinIO S3. |
| **4. Aislamiento estricto de rutas MinIO Bronze y Cuarentena** | ✅ Cumplido | Generación determinística sin colisiones:<br>- Bronze: `s3://midas-bronze/sources/<connection_id>/<dataset>/year=%Y/month=%m/day=%d/<batch_id>.parquet`<br>- Cuarentena: `s3://midas-quarantine/incidents/<connection_id>/<date>/incident_<id>.json`. |
| **5. No-colisión y Pruebas Unitarias Herméticas** | ✅ Cumplido | 12 pruebas unitarias en [`tests/lakehouse/test_source_connections.py`](../../../tests/lakehouse/test_source_connections.py) verificando registro, validaciones, formato Parquet Snappy, rutas aisladas y no-colisión de múltiples fuentes concurrentes. Salida con código 0. |

---

## 2. Checklist Anti-Code Drift y Concurrencia

- [x] **Aislamiento Estricto de Módulo (`Single-Area Ownership`):** Trabajo contenido en `src/lakehouse/`, `src/api/routes/connections.py`, `docker/postgres/` y `tests/lakehouse/`. Cero modificaciones a módulos de frontend, agentes o gobernanza.
- [x] **Compatibilidad Hacia Atrás:** `UniversalIngestionEngine` mantiene soporte con valor por defecto `default` para firmas previas sin romper orquestaciones existentes.
- [x] **Gobernanza y Persistencia Dual:** Soporte directo a PostgreSQL operacional con fallback hermético en memoria para pruebas desacopladas y entornos de CI/CD.

---

## 3. Detalle de la Implementación Técnica

### 3.1. Esquema SQL Operacional (`docker/postgres/01-init-operational-seed.sql`)
```sql
CREATE TABLE IF NOT EXISTS midas_operational.source_connections (
    connection_id VARCHAR(64) PRIMARY KEY,
    name VARCHAR(128) NOT NULL UNIQUE,
    source_type VARCHAR(32) NOT NULL CHECK (source_type IN ('POSTGRES', 'EXCEL', 'CSV', 'REST')),
    config_payload JSONB NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ERROR')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2. Modelos Pydantic (`src/lakehouse/models/connection.py`)
- `SourceType`: Enum (`POSTGRES`, `EXCEL`, `CSV`, `REST`).
- `ConnectionStatus`: Enum (`ACTIVE`, `INACTIVE`, `ERROR`).
- `SourceConnectionCreate`: Validador de entrada con discriminación de prefijos canónicos (`conn_pg_*`, `conn_excel_*`, etc.).
- `SourceConnectionResponse`: Modelo serializable enriquecido con `created_at`.

### 3.3. Repositorio de Conexiones (`src/lakehouse/ingestion/connection_registry.py`)
- `SourceConnectionRegistry`: Singleton con almacenamiento sincronizado (in-memory + PostgreSQL async/sync pool), detección de duplicados de nombre y seeding automático de fuentes canónicas del MVP Dorado.

### 3.4. Motor de Ingestión Parquet Snappy y Rutas Aisladas (`src/lakehouse/ingestion/universal_engine.py`)
- `_persist_to_bronze_storage()`: Convierte los payloads de registros crudos en buffers Apache Arrow Parquet comprimidos con Snappy, inyectando metadatos de auditoría y `connection_id`.
- `build_bronze_storage_path()`: Estructuración canónica `sources/{connection_id}/{dataset}/year={YYYY}/month={MM}/day={DD}/{batch_id}.parquet`.
- `build_quarantine_storage_path()`: Estructuración canónica `incidents/{connection_id}/{YYYY-MM-DD}/incident_{incident_id}.json`.
- `persist_to_quarantine()`: Persistencia estructurada de incidentes de calidad y anomalías de esquema con aislamiento total por conexión.

---

## 4. Pruebas y Evidencias de Ejecución

### 4.1. Pruebas de HU-LAKE-05
```powershell
python -m pytest tests/lakehouse/test_source_connections.py -v
```
**Resultado:**
```text
tests/lakehouse/test_source_connections.py::test_connection_registry_seed_defaults PASSED [  8%]
tests/lakehouse/test_source_connections.py::test_connection_registration_all_types PASSED [ 16%]
tests/lakehouse/test_source_connections.py::test_connection_registration_duplicate_name_rejection PASSED [ 25%]
tests/lakehouse/test_source_connections.py::test_connection_filtering_by_type_and_status PASSED [ 33%]
tests/lakehouse/test_source_connections.py::test_api_register_connection_success PASSED [ 41%]
tests/lakehouse/test_source_connections.py::test_api_register_connection_duplicate_conflict PASSED [ 50%]
tests/lakehouse/test_source_connections.py::test_api_register_connection_invalid_source_type PASSED [ 58%]
tests/lakehouse/test_source_connections.py::test_api_list_connections_and_filter PASSED [ 66%]
tests/lakehouse/test_source_connections.py::test_api_get_connection_by_id PASSED [ 75%]
tests/lakehouse/test_source_connections.py::test_parquet_snappy_persistence_in_bronze PASSED [ 83%]
tests/lakehouse/test_source_connections.py::test_multi_source_non_collision_partitioning PASSED [ 91%]
tests/lakehouse/test_source_connections.py::test_quarantine_isolated_paths PASSED [100%]

======================== 12 passed, 1 warning in 4.76s ========================
```

### 4.2. Suite Completa del Lakehouse (Regresión Cero)
```powershell
python -m pytest tests/lakehouse/ -v
```
**Resultado:**
```text
======================== 51 passed, 1 warning in 6.10s ========================
```

---

## 5. Impacto y Coordinación con el Equipo

- **Squad 1 (Backend & Orquestación - Daniel Echeverría):**
  - Los DAGs de Airflow (`ADR-009`) ahora pueden iterar sobre `GET /api/v1/connections` para orquestar la ingesta dinámica tri-medallón sin rutas estáticas hardcodeadas.
- **Squad 2 (Frontend - Juan Esteban):**
  - El modal/formulario de creación de Data Source en React/Next.js puede consumir directamente `POST /api/v1/connections/register` con retroalimentación instantánea.
- **Squad 4 (Gobernanza - Sebastian Castiblanco):**
  - Cada prefijo en MinIO Bronze cuenta con aislamiento por fuente (`sources/<connection_id>/`), garantizando linaje auditable e inspección de incidentes en cuarentena.
