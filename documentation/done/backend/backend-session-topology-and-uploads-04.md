# HU-BACK-03: Gap Resolution - Dynamic Session Topology, PostgreSQL Persistence, Binary File Uploads and AI Executive Titling

- **ID de la Historia:** HU-BACK-03 (Gap Resolution)
- **Título Oficial:** Resolución de Brechas Backend para Acoplamiento Completo con Frontend
- **Rama Oficial:** `feature/backend-session-topology-and-file-uploads`
- **Responsable:** Daniel Echeverría (Team Leader & Principal Backend Architect)
- **Pair/Revisor:** Dilan Chávez (Frontend Multi-Sesión Lead) / Joshua Gonzales (Frontend Time-Travel & Lineage Lead)
- **Fecha de Entrega:** Miércoles 21 de Octubre de 2026
- **Story Points:** 3 SP
- **Prioridad:** MUST HAVE (P0)
- **Documentos Canónicos de Referencia:**
  - [ADR-008: Adopción Qwen 2.5 3B Zero-Trust](../../adr/ADR-008-adopcion-modelo-local-qwen-2-5-3b-zero-trust.md)
  - [ADR-009: Orquestación Tri-Medallón Airflow y Aislamiento MinIO](../../adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md)
  - [ADR-010: Workspace Conversacional Multi-Sesión Frontend](../../adr/ADR-010-workspace-conversacional-multi-sesion-frontend.md)
  - [06_nuevo_backlog_mvp_dorado.md](../../06_nuevo_backlog_mvp_dorado.md)
  - [auditoria_integral_arquitectura_y_mvp_dorado.md](../../reviews/auditoria_integral_arquitectura_y_mvp_dorado.md)
- **Issue en GitHub:** [#43](https://github.com/Dan18eP/Midas/issues/43)

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **1. Topología Dinámica por Sesión (`topology_state`)** | Cumplido | Implementado en `src/core/session/models.py`, `src/core/session/store.py` y `src/api/routes/sessions.py`. Soporte nativo de `topology_state: Dict[str, Any]` (nodos y aristas de React Flow) en `ChatSession`, `SessionDetailResponse`, `CreateSessionRequest` y nuevo endpoint `PUT /api/v1/sessions/{session_id}/topology`. Column `topology_state JSONB` agregada al DDL de PostgreSQL `02-init-sessions-schema.sql`. |
| **2. Persistencia en Base de Datos de `SessionStore`** | Cumplido | Implementado en `src/core/session/store.py`. Persistencia relacional bidireccional contra `midas_operational.chat_sessions` y `midas_operational.session_messages` usando SQLAlchemy Core y pool con timeout estricto de 1 segundo. Si la base de datos está offline (modo local o pruebas unitarias), degrada de manera transparente a RAM sin latencia ni bloqueos de TCP. |
| **3. Endpoint de Subida de Archivos Binarios (`POST /api/v1/connections/upload`)** | Cumplido | Implementado en `src/api/routes/connections.py`. Endpoint `multipart/form-data` con `UploadFile` que valida extensiones `.xlsx`, `.xls` y `.csv`. Inspecciona libros y hojas con `openpyxl`, deduce delimitadores y encabezados con `csv.Sniffer`, almacena el binario crudo en MinIO Bronze (`s3://midas-bronze/sources/{cid}/raw/{filename}`) y registra la conexión en `SourceConnectionRegistry`. |
| **4. Titulación Ejecutiva Inteligente con Qwen 2.5 Local** | Cumplido | Implementado en `src/core/session/title_generator.py` e integrado en `SessionStore.add_message()`. Genera títulos ejecutivos de 3 a 5 palabras analíticas al recibir el primer mensaje del usuario invocando Qwen 2.5 local vía `ModelRouter` (timeout de 1.5s), con fallback heurístico determinístico y limpieza de muletillas conversacionales. |
| **5. Suite de Pruebas Automatizadas pasando 100%** | Cumplido | 11/11 pruebas en `tests/api/test_lineage_and_sessions.py`. 15/15 pruebas en `tests/lakehouse/test_source_connections.py`. 209/209 pruebas backend completas pasando al 100%. 78/78 pruebas frontend pasando sin regresiones. |

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Single-Area Ownership y Prevención de Colisión:** Todos los cambios pertenecen exclusivamente a Backend, Lakehouse Storage y API Gateway:
  - `src/core/session/models.py`
  - `src/core/session/store.py`
  - `src/core/session/title_generator.py`
  - `src/core/session/__init__.py`
  - `src/api/routes/sessions.py`
  - `src/api/routes/connections.py`
  - `docker/postgres/02-init-sessions-schema.sql`
  - `tests/api/test_lineage_and_sessions.py`
  - `tests/lakehouse/test_source_connections.py`
- [x] **Alineación con el Sprint de Frontend:** El frontend ahora dispone de:
  - Topología persistente por sesión para que el canvas de React Flow restaure nodos y aristas al alternar sesiones.
  - Endpoint `POST /api/v1/connections/upload` para que los botones de Excel y CSV del Welcome Hub carguen archivos reales y previsualicen esquemas.
  - Títulos descriptivos generados por IA para la barra lateral de historial estilo ChatGPT.
- [x] **Cero Dependencias Cloud:** Todos los modelos e inferencias operan bajo el router local Ollama Qwen 2.5 3B (`http://localhost:11434` o `http://midas-ollama:11434`).

---

## 3. Arquitectura Técnica de la Solución

```mermaid
flowchart TD
    subgraph Frontend ["Capa de Presentación Frontend"]
        CANVAS["PipelineCanvas.tsx\n(React Flow State)"]
        HUB["WelcomeHub.tsx\n(Excel / CSV Uploaders)"]
        SIDEBAR["SessionHistorySidebar.tsx\n(3-5 Word Titles)"]
    end

    subgraph API ["FastAPI Gateway Routes"]
        RSES["/api/v1/sessions\n(GET, POST, PUT topology)"]
        RUPL["/api/v1/connections/upload\n(multipart/form-data)"]
    end

    subgraph Core ["Capa Core & Servicios"]
        SSTORE["SessionStore\n(PostgreSQL + Memory Fallback)"]
        TGEN["title_generator.py\n(Qwen 2.5 local + Heuristic)"]
        REG["SourceConnectionRegistry\n(Active Catalog)"]
    end

    subgraph Storage ["Almacenamiento Persistente"]
        PG[("PostgreSQL\nchat_sessions / session_messages")]
        MINIO[("MinIO S3\ns3://midas-bronze/sources/...")]
    end

    CANVAS -->|PUT /sessions/{id}/topology| RSES
    HUB -->|POST /connections/upload| RUPL
    SIDEBAR -->|GET /sessions| RSES

    RSES --> SSTORE
    SSTORE --> TGEN
    SSTORE -->|SQLAlchemy Core| PG
    RUPL --> REG
    RUPL -->|put_object| MINIO
```

---

## 4. Métricas de Pruebas y Cobertura

- **Backend Total Tests:** 209 pruebas automatizadas pasando al 100% (duración 34.74s).
- **Frontend Total Tests:** 78 pruebas Vitest pasando al 100% (duración 10.13s).
- **Nuevas Pruebas Agregadas:**
  - `test_session_topology_update_and_retrieval`: PUT y GET de topología de React Flow en la sesión.
  - `test_session_intelligent_title_generation`: Titulación ejecutiva de 3 a 5 palabras.
  - `test_session_store_postgres_resilience`: Degradación elegante a memoria en caso de desconexión de PostgreSQL.
  - `test_upload_file_csv_success`: Carga multipart de CSV con delimitador y columnas detectadas.
  - `test_upload_file_excel_success`: Carga multipart de Excel con hojas de trabajo y columnas.
  - `test_upload_file_unsupported_format_rejected`: Rechazo seguro con HTTP 400 ante extensiones no válidas.
