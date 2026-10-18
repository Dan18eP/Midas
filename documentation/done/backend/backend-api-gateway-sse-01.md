# HU-BACK-01: FastAPI Gateway Core & Telemetry Server-Sent Events (SSE) Hub

- **ID de la Historia:** `HU-BACK-01`
- **Título Oficial:** FastAPI Gateway Core & Telemetry Server-Sent Events (SSE) Hub
- **Rama Oficial:** `feature/backend-api-gateway-sse`
- **Responsable:** Daniel Echeverría (Backend Lead & Líder de Proyecto)
- **Fecha de Entrega:** 18 de Octubre de 2026
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/02_mvp_dorado_blueprint_global.md`](../../canonical/02_mvp_dorado_blueprint_global.md)
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md)

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **1. Endpoint `/api/v1/telemetry/stream` emitiendo SSE estructurados** | ✅ Cumplido | `src/api/routes/telemetry.py` emite eventos en formato W3C SSE (`id: ...\nevent: telemetry\ndata: {...}\n\n`) con estructura canónica: `pipeline_id`, `node_id`, `status`, `records_in`, `records_out`, `latency_ms`, `timestamp` y `details`. |
| **2. Reconexión transparente con `Last-Event-ID` y buffer de 100 eventos** | ✅ Cumplido | `TelemetryHub` en `src/core/telemetry/hub.py` implementa un buffer circular en memoria de tamaño 100 con soporte para `Last-Event-ID` en cabecera HTTP y query param, retransmitiendo eventos no leídos de forma determinística. |
| **3. Middleware de trazabilidad con `X-Correlation-ID` propagado** | ✅ Cumplido | `CorrelationIdMiddleware` en `src/api/middleware.py` implementado como middleware ASGI puro que genera UUID4 si falta la cabecera o propaga la existente en peticiones y respuestas HTTP. |
| **4. Documentación interactiva Swagger/OpenAPI en `/docs`** | ✅ Cumplido | FastAPI genera automáticamente el esquema OpenAPI 3.1 tipado con Pydantic v2 disponible en `/docs`, `/redoc` y `/openapi.json`. |

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero desvío de fórmulas de negocio:** No se modificaron métricas contables ni algoritmos financieros de `documentation/canonical/04_logica_de_negocio_...md`.
- [x] **Compatibilidad con contratos de Canvas:** Los nombres de los nodos (`silver_cleansing`, `bronze_raw`, `guardian_monitor`, `gold_marts`) y estados (`HEALTHY`, `RUNNING`, `DEGRADED`, `ERROR`, `IN_PROGRESS`, `AUTO_HEALING`) coinciden con la especificación de `documentation/canonical/05_arquitectura_frontend_...md`.
- [x] **Aislamiento de Módulo (Single-Area Ownership):** Todo el código se encuentra bajo `src/api/`, `src/core/telemetry/`, `docker/api/` y `tests/api/`. Cero colisiones con `src/agent/` (Elian Rivera) o `src/frontend/` (Dilan Chávez).

---

## 3. Detalle de la Implementación Técnica

### 3.1. Núcleo de Telemetría (`src/core/telemetry/`)
- `events.py`: Modelos fuertemente tipados con Pydantic v2:
  - `NodeStatus(str, Enum)`: Estados de ejecución de los nodos.
  - `AnomalyType(str, Enum)`: Anomalías canónicas F1-F5 de Midas Guardian.
  - `GuardianDetails(BaseModel)`: Estructura de auto-sanación con `anomaly_type`, `playbook_id`, `action_taken` y `quarantined_records`.
  - `TelemetryEvent(BaseModel)`: Estructura del evento con generador de IDs cronológicos `evt_<timestamp>_<uuid>` y método `to_sse_format()`.
- `hub.py`: Clase `TelemetryHub` con:
  - Buffer circular `collections.deque(maxlen=100)`.
  - Multidifusión asíncrona hacia suscriptores concurrentes vía `asyncio.Queue`.
  - Replay automático al reconectar mediante `get_events_after(last_event_id)`.
  - Heartbeat periódico `: ping\n\n` para evitar desconexiones por timeout de proxies.
  - Soporte de parámetro opcional `max_events` para consumo acotado y pruebas controladas.
- `scenarios.py`: Módulo con snapshots predefinidos de los 4 estados de Time-Travel Replay:
  - `T0`: Operación Normal (todos los nodos saludables).
  - `T1`: Incidente Inyectado (anomalía F3 en Silver con registros en cuarentena).
  - `T2`: Midas Guardian en Acción (nodo flotante en auto-sanación con playbook PB-03).
  - `T3`: Recuperado y Publicado (nuevo snapshot Iceberg en Gold certificado).

### 3.2. API Gateway FastAPI (`src/api/`)
- `middleware.py`: Middleware puro ASGI para inyección y propagación de `X-Correlation-ID` y `X-User-Role` (por defecto `director_general`) sin bloquear streams.
- `routes/health.py`: Endpoints `/health` y `/api/v1/health` exponiendo uptime, suscriptores SSE activos y estado operacional.
- `routes/auth.py`: Endpoint `GET /api/v1/auth/roles` exponiendo las 3 identidades canónicas de prueba del Lente Zero-Trust (`director_general`, `gerente_norte`, `analista_externo`) con sus filtros y máscaras de Ranger.
- `routes/telemetry.py`:
  - `GET /api/v1/telemetry/stream`: Streaming SSE continuo con cabeceras `Cache-Control: no-cache` y `X-Accel-Buffering: no`.
  - `POST /api/v1/telemetry/publish`: Ingesta de eventos generados por pipelines de PySpark, Airflow o Guardian.
  - `GET /api/v1/telemetry/buffer`: Inspección de eventos en el buffer para diagnósticos.
  - `POST /api/v1/telemetry/reset`: Vaciado de buffer para control de tests.
  - `GET /api/v1/telemetry/scenarios`: Catálogo de escenarios Time-Travel.
  - `GET /api/v1/telemetry/scenarios/{id}`: Snapshot de eventos del escenario.
  - `POST /api/v1/telemetry/scenarios/inject/{id}`: Inyección en vivo de eventos del escenario hacia los clientes SSE conectados.
- `main.py`: Configuración de FastAPI, CORS permisivo con cabeceras expuestas (`X-Correlation-ID`, `X-User-Role`, `Last-Event-ID`), ciclo de vida `lifespan` y montaje de routers.
- `requirements.txt`: Dependencias `fastapi`, `uvicorn`, `pydantic`, `httpx`.

### 3.3. Contenedorización (`docker/api/`)
- `Dockerfile`: Imagen basada en `python:3.11-slim` con instalación unificada de dependencias para API Gateway (`src/api/requirements.txt`) y Copiloto LangGraph (`src/agent/requirements.txt`), garantizando portabilidad total en Docker Compose.

---

## 4. Pruebas Automatizadas y Verificación

### Comando de Ejecución de Pruebas:
```powershell
python -m pytest tests/api/ -v
```

### Resultados de Ejecución:
```
============================= test session starts =============================
platform win32 -- Python 3.14.6, pytest-9.1.1, pluggy-1.6.0
rootdir: C:\Users\LENOVO\Documents\DANI DOCS\PROYECTO-JUEVES-22
plugins: anyio-4.14.1, asyncio-1.4.0
collected 16 items

tests/api/test_api_endpoints.py::test_health_endpoints PASSED            [  6%]
tests/api/test_api_endpoints.py::test_swagger_and_openapi_docs PASSED    [ 12%]
tests/api/test_api_endpoints.py::test_telemetry_publish_and_buffer_inspection PASSED [ 18%]
tests/api/test_api_endpoints.py::test_telemetry_stream_reconnection_with_last_event_id PASSED [ 25%]
tests/api/test_api_endpoints.py::test_auth_roles_endpoint PASSED         [ 31%]
tests/api/test_api_endpoints.py::test_telemetry_scenarios_endpoints PASSED [ 37%]
tests/api/test_api_endpoints.py::test_telemetry_scenario_injection PASSED [ 43%]
tests/api/test_correlation_id.py::test_correlation_id_generated_automatically_when_absent PASSED [ 50%]
tests/api/test_correlation_id.py::test_correlation_id_propagated_when_provided_by_client PASSED [ 56%]
tests/api/test_correlation_id.py::test_user_role_defaults_to_director_general PASSED [ 62%]
tests/api/test_correlation_id.py::test_user_role_propagates_custom_identity PASSED [ 68%]
tests/api/test_telemetry_hub.py::test_telemetry_event_creation_and_canonical_contract PASSED [ 75%]
tests/api/test_telemetry_hub.py::test_telemetry_event_sse_formatting PASSED [ 81%]
tests/api/test_telemetry_hub.py::test_hub_ring_buffer_capacity_limit_100 PASSED [ 87%]
tests/api/test_telemetry_hub.py::test_hub_last_event_id_replay PASSED    [ 93%]
tests/api/test_telemetry_hub.py::test_hub_concurrent_subscribers_broadcast PASSED [100%]

======================== 16 passed, 1 warning in 0.99s ========================
```

### Pruebas de No-Regresión en Infraestructura:
```powershell
python -m pytest tests/infra/ -v
```
**Resultado:** 4 de 4 pruebas pasando al 100%.

---

## 5. Coordinación con el Equipo

- **Para Dilan Chávez (Frontend Lead - `HU-FRONT-01` / `HU-FRONT-02` / `HU-FRONT-03` / `HU-FRONT-05`):**  
  - Telemetría en vivo: `GET http://localhost:8000/api/v1/telemetry/stream` con EventSource.
  - Simulador de Replay: `GET /api/v1/telemetry/scenarios/{T0|T1|T2|T3}` e inyección con `POST /inject/{T0-T3}` para alimentar el scrubber de Time-Travel sin depender de jobs reales.
  - Lente Zero-Trust: `GET /api/v1/auth/roles` para alimentar el dropdown de selección de roles en la barra superior.
- **Para Sebastian Castiblanco (Governance Lead - `HU-GOV-03` / `HU-GOV-04`):**  
  - Midas Guardian puede emitir eventos de auto-sanación con `details` estructurado (`anomaly_type`, `playbook_id`, `action_taken`) a `POST /api/v1/telemetry/publish`.
- **Para Edgar Corzo (Data Engineer Lead - `HU-LAKE-01` / `HU-LAKE-02`):**  
  - Los jobs de Spark pueden emitir métricas de ingesta mediante `POST http://localhost:8000/api/v1/telemetry/publish`.
- **Para Elian Rivera (AI Lead - `HU-AI-01` / `HU-AI-02`):**  
  - Hoja de ruta para exponer el endpoint `POST /api/v1/agent/chat` documentada en `documentation/reviews/review-pr-023-hu-ai-01-langgraph.md` para abordarla colaborativamente durante `HU-AI-02`.

