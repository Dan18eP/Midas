# Midas — Sprint Backlog Detallado & Plan de Ejecución Técnica
## Desglose Operativo de Subtasks, Story Points, Responsables y Checkpoints

> **Líder de Proyecto & Backend Lead:** Daniel Echeverría  
> **Co-Líder, Scrum Master & Governance Lead:** Sebastian Castiblanco  
> **Data Engineering Lead & Backend Partner:** Edgar Corzo  
> **Frontend Lead & Canvas Architect:** Dilan Chávez  
> **UI/UX Specialist & Frontend Partner:** Joshua Gonzales  
> **AI & Intelligent Systems Lead:** Elian Rivera  
> **Ventana del Sprint:** Domingo 18 de Octubre (08:00) al Miércoles 21 de Octubre de 2026 (23:59)  
> **Demostración Técnica en Vivo (Pitch 30 min):** Jueves 22 de Octubre de 2026  
> **Contrato Base:** [`documentation/04_product_backlog.md`](04_product_backlog.md)  
> **Política Vinculante:** [`rules/01_anti_code_drift_policy.md`](../rules/01_anti_code_drift_policy.md) (*Document First, Code Second*)

---

## 1. Reglas de Oro de la Ejecución Técnica

1. **Aislamiento por Módulos (`Single-Area Ownership`):**  
   Ningún desarrollador puede comitear archivos fuera de la carpeta asignada a su área:
   - `src/lakehouse/`: Edgar Corzo & Daniel Echeverría.
   - `src/api/` y `src/core/`: Daniel Echeverría & Edgar Corzo.
   - `src/frontend/`: Dilan Chávez & Joshua Gonzales.
   - `src/agent/`: Elian Rivera & Daniel Echeverría.
   - `src/security_governance/` y `rules/`: Sebastian Castiblanco.
2. **Estrategia "Contratos Primero" (Día 1 - Primeras 4 Horas):**  
   Antes de procesar datos reales pesados, cada squad publicará interfaces y mocks para desbloquear inmediatamente el trabajo en paralelo de sus compañeros (ej. mock SSE para Frontend, esquemas Iceberg para Gobernanza).
3. **Entrega Obligatoria de Evidencia en `documentation/done/`:**  
   Ninguna tarea se considera completa sin su reporte en:  
   `documentation/done/[area]/[area]-[nombre_epica]-[nombre_hu]-[numero].md`  
   con el comando de test ejecutado y su salida exitosa.

---

## 2. Tablero de Distribución de Carga del Sprint (100 Story Points)

| ID HU | Historia de Usuario | Squad | Responsable | Revisor / Pair | SP | Prioridad | Fecha Límite |
| :--- | :--- | :---: | :--- | :--- | :---: | :---: | :---: |
| **HU-LAKE-01** | MinIO S3 Storage & Catálogo Iceberg REST | S1 | Edgar Corzo | Daniel Echeverría | **3** | MUST HAVE | Dom 18 - 20:00 |
| **HU-BACK-01** | FastAPI Gateway Core & Telemetría SSE Hub | S1 | Daniel Echeverría | Edgar Corzo | **5** | MUST HAVE | Dom 18 - 22:00 |
| **HU-FRONT-01**| React Flow Canvas Base & Nodos Topológicos | S2 | Dilan Chávez | Joshua Gonzales | **5** | MUST HAVE | Dom 18 - 23:00 |
| **HU-AI-01**   | LangGraph State Machine & Modo Dialógico | S3 | Elian Rivera | Daniel Echeverría | **5** | MUST HAVE | Dom 18 - 23:00 |
| **HU-LAKE-02** | Universal Ingestion Multi-Fuente (PG, XLS, API) | S1 | Edgar Corzo | Daniel Echeverría | **5** | MUST HAVE | Lun 19 - 14:00 |
| **HU-FRONT-02**| Consumo SSE en Canvas & Flujo Partículas | S2 | Dilan Chávez | Joshua Gonzales | **3** | MUST HAVE | Lun 19 - 18:00 |
| **HU-GOV-01**  | OpenMetadata Ingesta & Linaje Automatizado | S4 | Sebastian Castiblanco| Equipo Midas | **3** | SHOULD HAVE| Lun 19 - 20:00 |
| **HU-LAKE-03** | PySpark Bronze $\rightarrow$ Silver & Quality Gate | S1 | Edgar Corzo | Daniel Echeverría | **5** | MUST HAVE | Lun 19 - 22:00 |
| **HU-GOV-02**  | Escudo PII en Caliente & Tags Atlas API | S4 | Sebastian Castiblanco| Edgar Corzo | **3** | MUST HAVE | Lun 19 - 23:00 |
| **HU-BACK-02** | Trino Query Engine & Catálogos Iceberg/PG | S1 | Daniel Echeverría | Edgar Corzo | **4** | MUST HAVE | Mar 20 - 14:00 |
| **HU-AI-02**   | Text-to-Gold Query Generator & OWASP Top 10 | S3 | Elian Rivera | Daniel Echeverría | **5** | MUST HAVE | Mar 20 - 15:00 |
| **HU-LAKE-04** | PySpark Silver $\rightarrow$ Gold Marts Canónicos | S1 | Edgar Corzo | Daniel Echeverría | **5** | MUST HAVE | Mar 20 - 16:00 |
| **HU-FRONT-04**| Chat Copiloto Flotante & Componente ECharts | S2 | Joshua Gonzales | Dilan Chávez | **5** | MUST HAVE | Mar 20 - 18:00 |
| **HU-GOV-03**  | Ranger Dynamic Masking & Row-Level Filters | S4 | Sebastian Castiblanco| Daniel Echeverría | **3** | MUST HAVE | Mar 20 - 19:00 |
| **HU-AI-03**   | Data Storytelling Engine & Opciones ECharts | S3 | Elian Rivera | Joshua Gonzales | **5** | MUST HAVE | Mar 20 - 20:00 |
| **HU-FRONT-05**| Lente Zero-Trust & Selector Dinámico Roles | S2 | Joshua Gonzales | Sebastian Castiblanco| **3** | MUST HAVE | Mar 20 - 22:00 |
| **HU-GOV-04**  | Midas Guardian Inyector F1-F5 & Auto-Healing | S4 | Sebastian Castiblanco| Daniel Echeverría | **5** | MUST HAVE | Mar 20 - 23:00 |
| **HU-FRONT-03**| Time-Travel Replay Scrubber & Barra Histórica| S2 | Dilan Chávez | Joshua Gonzales | **5** | MUST HAVE | Mié 21 - 14:00 |
| **HU-AI-04**   | Airflow DAG Generator (Pipeline-as-a-Prompt) | S3 | Elian Rivera | Daniel Echeverría | **3** | MUST HAVE | Mié 21 - 16:00 |
| **HU-FRONT-06**| Drawer Linaje "Explícame esta cifra" | S2 | Joshua Gonzales | Dilan Chávez | **3** | MUST HAVE | Mié 21 - 18:00 |
| **HU-GOV-05**  | Auditoría Ágil, Anti-Drift & Release v1.0.0 | S4 | Sebastian Castiblanco| Daniel Echeverría | **2** | MUST HAVE | Mié 21 - 20:00 |
| **TOTAL**      | **21 Historias de Usuario Operativas** | | | | **92 SP** | | **Congelación 23:59** |

---

## 3. Desglose Exhaustivo de Subtasks por Historia de Usuario

---

### 🛡️ SQUAD 1: Backend & Data Lakehouse Core
**Responsables:** Daniel Echeverría (Backend Lead) & Edgar Corzo (Data Eng Lead)

#### [HU-LAKE-01] Storage MinIO S3 & Catálogo Iceberg REST
- **Responsable:** Edgar Corzo | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 3 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/lakehouse-storage-minio-iceberg`
- **Ventana de Ejecución:** Día 1 (Dom 18 Oct: 09:00 - 20:00)
- **Subtasks Técnicas:**
  - [ ] `ST-LAKE-01.1`: Configurar servicio `minio` en `docker/compose.yml` con credenciales seguras y volumen persistente.
  - [ ] `ST-LAKE-01.2`: Script de inicialización de buckets en MinIO: `midas-bronze`, `midas-silver`, `midas-gold`, `midas-quarantine`, `midas-governance`.
  - [ ] `ST-LAKE-01.3`: Configurar contenedor `iceberg-rest` conectado a PostgreSQL (`jdbc:postgresql://db:5432/iceberg_catalog`).
  - [ ] `ST-LAKE-01.4`: Script Python de verificación de operaciones ACID y creación de tabla de prueba con evolución de columnas.
- **Archivos a Crear:**
  - `docker/minio/init_buckets.sh`
  - `src/lakehouse/storage/iceberg_catalog_client.py`
  - `tests/lakehouse/test_storage_iceberg.py`
- **Comando de Verificación:**
  `pytest tests/lakehouse/test_storage_iceberg.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/lakehouse/lakehouse-storage-minio-iceberg-01.md`

---

#### [HU-LAKE-02] Universal Ingestion Multi-Fuente (Postgres, Excel, REST API)
- **Responsable:** Edgar Corzo | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/lakehouse-universal-ingestion`
- **Ventana de Ejecución:** Día 2 (Lun 19 Oct: 08:00 - 14:00)
- **Subtasks Técnicas:**
  - [ ] `ST-LAKE-02.1`: Implementar conector JDBC PostgreSQL (`PostgresSourceConnector`) con extracción por lotes e incremental.
  - [ ] `ST-LAKE-02.2`: Implementar parser robusto de Excel (`ExcelSourceConnector` con `openpyxl`) con auto-detección de cabeceras en fila 3-5 y soporte multi-hoja.
  - [ ] `ST-LAKE-02.3`: Implementar extractor de API REST (`RestApiSourceConnector`) con soporte para paginación por cursor y manejo de rate limits.
  - [ ] `ST-LAKE-02.4`: Envoltura canónica Bronze con inyección de metadatos: `_ingested_at`, `_source_type`, `_raw_payload_hash` y `_schema_fingerprint (SHA-256)`.
- **Archivos a Crear:**
  - `src/lakehouse/ingestion/postgres_connector.py`
  - `src/lakehouse/ingestion/excel_connector.py`
  - `src/lakehouse/ingestion/rest_connector.py`
  - `src/lakehouse/ingestion/universal_engine.py`
  - `tests/lakehouse/test_universal_ingestion.py`
- **Comando de Verificación:**
  `pytest tests/lakehouse/test_universal_ingestion.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/lakehouse/lakehouse-universal-ingestion-02.md`

---

#### [HU-LAKE-03] PySpark Bronze $\rightarrow$ Silver & Quality Gate
- **Responsable:** Edgar Corzo | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/lakehouse-spark-bronze-silver`
- **Ventana de Ejecución:** Día 2 (Lun 19 Oct: 14:00 - 22:00)
- **Subtasks Técnicas:**
  - [ ] `ST-LAKE-03.1`: Job PySpark para tipado estricto de fechas (UTC ISO 8601) y normalización monetaria (`DECIMAL(18,2)` eliminando símbolos `$`).
  - [ ] `ST-LAKE-03.2`: Lógica de deduplicación determinística basada en clave de negocio primaria + timestamp de actualización.
  - [ ] `ST-LAKE-03.3`: Quality Gate: desvío automático de registros con montos negativos o campos obligatorios nulos hacia `s3://midas-quarantine/`.
  - [ ] `ST-LAKE-03.4`: Emisión de métricas de procesamiento de lote (`records_in`, `records_valid`, `records_quarantined`) vía webhook/evento hacia Core API.
- **Archivos a Crear:**
  - `src/lakehouse/transforms/bronze_to_silver.py`
  - `src/lakehouse/quality/quality_rules.py`
  - `tests/lakehouse/test_bronze_to_silver.py`
- **Comando de Verificación:**
  `pytest tests/lakehouse/test_bronze_to_silver.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/lakehouse/lakehouse-spark-bronze-silver-03.md`

---

#### [HU-LAKE-04] PySpark Silver $\rightarrow$ Gold Marts Canónicos
- **Responsable:** Edgar Corzo | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/lakehouse-spark-silver-gold`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 09:00 - 16:00)
- **Subtasks Técnicas:**
  - [ ] `ST-LAKE-04.1`: Modelado dimensional de la tabla de hechos `gold.fct_ventas_diarias` con particionado por `(anio, mes)`.
  - [ ] `ST-LAKE-04.2`: Construcción de tabla de dimensiones `gold.dim_tiendas_regiones` con atributos enriquecidos de negocio.
  - [ ] `ST-LAKE-04.3`: Implementación matemática exacta de las fórmulas oficiales de `04_logica_de_negocio_...md` (Venta Neta y Ticket Promedio).
  - [ ] `ST-LAKE-04.4`: Escritura optimizada en formato Iceberg v2 con z-ordering en identificadores de región y cliente.
- **Archivos a Crear:**
  - `src/lakehouse/transforms/silver_to_gold.py`
  - `src/lakehouse/models/gold_marts.py`
  - `tests/lakehouse/test_silver_to_gold.py`
- **Comando de Verificación:**
  `pytest tests/lakehouse/test_silver_to_gold.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/lakehouse/lakehouse-spark-silver-gold-04.md`

---

#### [HU-BACK-01] FastAPI Gateway Core & Telemetría SSE Hub
- **Responsable:** Daniel Echeverría | **Pair/Revisor:** Edgar Corzo
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/backend-api-gateway-sse`
- **Ventana de Ejecución:** Día 1 (Dom 18 Oct: 10:00 - 22:00)
- **Subtasks Técnicas:**
  - [ ] `ST-BACK-01.1`: Inicializar proyecto FastAPI con estructura modular, CORS corporativo, gestión de excepciones RFC 7807 y middleware de correlación (`X-Correlation-ID`).
  - [ ] `ST-BACK-01.2`: Diseñar e implementar el hub de Server-Sent Events en `/api/v1/telemetry/stream` emitiendo eventos de latencia, estados de nodo y contadores de registros.
  - [ ] `ST-BACK-01.3`: Soporte de reconexión con cabecera `Last-Event-ID` y buffer circular de últimos 100 eventos para clientes reconectados.
  - [ ] `ST-BACK-01.4`: Endpoint `/api/v1/telemetry/mock-feed` (activable por flag) para suministrar eventos de prueba continuos a Frontend mientras corre la ingesta real.
- **Archivos a Crear:**
  - `src/api/main.py`
  - `src/api/routers/telemetry.py`
  - `src/core/telemetry/event_hub.py`
  - `src/core/config.py`
  - `tests/backend/test_telemetry_sse.py`
- **Comando de Verificación:**
  `pytest tests/backend/test_telemetry_sse.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/backend/backend-api-gateway-sse-01.md`

---

#### [HU-BACK-02] Trino Query Engine & Catálogos Iceberg/PG
- **Responsable:** Daniel Echeverría | **Pair/Revisor:** Edgar Corzo
- **Story Points:** 4 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/backend-trino-query-engine`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 08:00 - 14:00)
- **Subtasks Técnicas:**
  - [ ] `ST-BACK-02.1`: Configurar contenedor `trino` en Docker con conectores `iceberg.properties` (hacia MinIO/Iceberg REST) y `postgresql.properties`.
  - [ ] `ST-BACK-02.2`: Implementar cliente asíncrono Python (`TrinoClient`) con pooling de conexiones y timeout de 10 segundos.
  - [ ] `ST-BACK-02.3`: Inyección automática de `LIMIT 1000` si la consulta carece de cláusula limitativa.
  - [ ] `ST-BACK-02.4`: Endpoint de ejecución segura `/api/v1/query/execute` con sanitización de tokens y estimación de costo.
- **Archivos a Crear:**
  - `docker/trino/etc/catalog/iceberg.properties`
  - `docker/trino/etc/catalog/postgresql.properties`
  - `src/core/query_engine/trino_client.py`
  - `src/api/routers/query.py`
  - `tests/backend/test_trino_query_engine.py`
- **Comando de Verificación:**
  `pytest tests/backend/test_trino_query_engine.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/backend/backend-trino-query-engine-02.md`

---

### 🎨 SQUAD 2: Frontend & Real-Time Canvas
**Responsables:** Dilan Chávez (Frontend Lead) & Joshua Gonzales (UI/UX Specialist)

#### [HU-FRONT-01] React Flow Canvas Base & Nodos Topológicos
- **Responsable:** Dilan Chávez | **Pair/Revisor:** Joshua Gonzales
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/frontend-reactflow-canvas`
- **Ventana de Ejecución:** Día 1 (Dom 18 Oct: 10:00 - 23:00)
- **Subtasks Técnicas:**
  - [ ] `ST-FRONT-01.1`: Configuración del workspace Next.js / React 18 con TailwindCSS y dependencias de React Flow (`@xyflow/react`).
  - [ ] `ST-FRONT-01.2`: Crear componentes de nodo personalizados para cada etapa: `SourceNode` (Postgres, Excel, API), `BronzeNode`, `SilverNode`, `GoldNode`, `GuardianNode`.
  - [ ] `ST-FRONT-01.3`: Configurar estilos visuales empresariales: badges de estado (verde, ámbar, rojo), contador de registros procesados y mini-gráfico de rendimiento.
  - [ ] `ST-FRONT-01.4`: Controles de Canvas: Zoom, Pan, FitView, Minimap y panel lateral colapsable al hacer clic en un nodo.
- **Archivos a Crear:**
  - `src/frontend/components/canvas/PipelineCanvas.tsx`
  - `src/frontend/components/canvas/nodes/SourceNode.tsx`
  - `src/frontend/components/canvas/nodes/StageNode.tsx`
  - `src/frontend/components/canvas/nodes/GuardianNode.tsx`
  - `src/frontend/types/canvas.ts`
- **Comando de Verificación:**
  `npm run test -- src/frontend/tests/PipelineCanvas.test.tsx`
- **Entrega Documental Requerida:**
  `documentation/done/frontend/frontend-reactflow-canvas-01.md`

---

#### [HU-FRONT-02] Consumo SSE en Canvas & Flujo Partículas
- **Responsable:** Dilan Chávez | **Pair/Revisor:** Joshua Gonzales
- **Story Points:** 3 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/frontend-sse-telemetry`
- **Ventana de Ejecución:** Día 2 (Lun 19 Oct: 10:00 - 18:00)
- **Subtasks Técnicas:**
  - [ ] `ST-FRONT-02.1`: Implementar hook `useTelemetryStream` con `EventSource` conectando a `/api/v1/telemetry/stream` con backoff exponencial en desconexión.
  - [ ] `ST-FRONT-02.2`: Actualización reactiva de métricas de nodos (tasa registros/seg, latencia en ms, total procesado) sin re-renderizar todo el canvas.
  - [ ] `ST-FRONT-02.3`: Animación de partículas sobre las aristas (edges) de React Flow: velocidad y densidad de partículas proporcional al volumen de datos reportado.
  - [ ] `ST-FRONT-02.4`: Banner de estado de conectividad en vivo (`ONLINE / RECONNECTING / OFFLINE`) en la esquina superior del Canvas.
- **Archivos a Crear:**
  - `src/frontend/hooks/useTelemetryStream.ts`
  - `src/frontend/components/canvas/edges/ParticleEdge.tsx`
  - `src/frontend/components/canvas/ConnectionStatusBadge.tsx`
- **Comando de Verificación:**
  `npm run test -- src/frontend/tests/useTelemetryStream.test.ts`
- **Entrega Documental Requerida:**
  `documentation/done/frontend/frontend-sse-telemetry-02.md`

---

#### [HU-FRONT-03] Time-Travel Replay Scrubber & Barra Histórica
- **Responsable:** Dilan Chávez | **Pair/Revisor:** Joshua Gonzales
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/frontend-time-travel-replay`
- **Ventana de Ejecución:** Día 4 (Mié 21 Oct: 08:00 - 14:00)
- **Subtasks Técnicas:**
  - [ ] `ST-FRONT-03.1`: Componente de barra de tiempo horizontal (`TimeTravelScrubber`) con selector de rango de 24 horas y slider continuo de minutos.
  - [ ] `ST-FRONT-03.2`: Botones de reproducción: `Play`, `Pause`, `Speed (1x, 2x, 5x)` y botón `LIVE` para regresar a la transmisión en caliente.
  - [ ] `ST-FRONT-03.3`: Integración de estado: al pausar y mover el slider a las `T - 30m`, solicitar snapshot histórico de métricas al backend y renderizar el estado exacto del Canvas en ese momento.
  - [ ] `ST-FRONT-03.4`: Indicador visual inequívoco: cabecera del Canvas cambia a tono ámbar con badge `[MODO REPLAY HISTÓRICO - 02:15 AM]`.
- **Archivos a Crear:**
  - `src/frontend/components/canvas/TimeTravelScrubber.tsx`
  - `src/frontend/hooks/useTimeTravel.ts`
  - `src/frontend/services/historicalTelemetryService.ts`
- **Comando de Verificación:**
  `npm run test -- src/frontend/tests/TimeTravelScrubber.test.tsx`
- **Entrega Documental Requerida:**
  `documentation/done/frontend/frontend-time-travel-replay-03.md`

---

#### [HU-FRONT-04] Chat Copiloto Flotante & Componente ECharts
- **Responsable:** Joshua Gonzales | **Pair/Revisor:** Dilan Chávez
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/frontend-copilot-chat-echarts`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 09:00 - 18:00)
- **Subtasks Técnicas:**
  - [ ] `ST-FRONT-04.1`: Interfaz de chat conversacional moderna con widget flotante expandible a drawer lateral, input con autosuggest y pills de preguntas frecuentes.
  - [ ] `ST-FRONT-04.2`: Indicador visual de estados del agente: *"Consultando esquema..."*, *"Validando seguridad Zero-Trust..."*, *"Generando visualización..."*.
  - [ ] `ST-FRONT-04.3`: Componente `EChartsRenderer` con `echarts-for-react`: renderizado automático de opciones JSON devueltas por el backend (barras, series temporales, dispersión).
  - [ ] `ST-FRONT-04.4`: Botón de acción embebido en las tarjetas de respuesta: `[Aprobar y Crear Pipeline en Airflow]` para activar la materialización Gold.
- **Archivos a Crear:**
  - `src/frontend/components/copilot/CopilotChatDrawer.tsx`
  - `src/frontend/components/copilot/ChatMessage.tsx`
  - `src/frontend/components/copilot/EChartsRenderer.tsx`
  - `src/frontend/components/copilot/QuickPromptPills.tsx`
- **Comando de Verificación:**
  `npm run test -- src/frontend/tests/CopilotChatDrawer.test.tsx`
- **Entrega Documental Requerida:**
  `documentation/done/frontend/frontend-copilot-chat-echarts-04.md`

---

#### [HU-FRONT-05] Lente Zero-Trust & Selector Dinámico Roles
- **Responsable:** Joshua Gonzales | **Pair/Revisor:** Sebastian Castiblanco
- **Story Points:** 3 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/frontend-zero-trust-lens`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 18:00 - 22:00)
- **Subtasks Técnicas:**
  - [ ] `ST-FRONT-05.1`: Selector de roles en la barra superior: `Director General (Admin)`, `Gerente Regional Norte (RBAC)`, `Auditor de Cumplimiento (Compliance)`.
  - [ ] `ST-FRONT-05.2`: Contexto global React `SecurityContext` que propaga el rol activo a todas las peticiones del backend (`X-Simulated-Role`).
  - [ ] `ST-FRONT-05.3`: Efecto visual de atenuación en Canvas: Nodos no permitidos para el rol se atenúan al 30% de opacidad y muestran un candado de seguridad.
  - [ ] `ST-FRONT-05.4`: Enmascaramiento reactivo en tablas y tooltips: emails y documentos sensibles aparecen con máscara `u****@riwi.io` de forma inmediata.
- **Archivos a Crear:**
  - `src/frontend/components/security/RoleSelector.tsx`
  - `src/frontend/context/SecurityContext.tsx`
  - `src/frontend/hooks/useDataMasking.ts`
- **Comando de Verificación:**
  `npm run test -- src/frontend/tests/SecurityLens.test.tsx`
- **Entrega Documental Requerida:**
  `documentation/done/frontend/frontend-zero-trust-lens-05.md`

---

#### [HU-FRONT-06] Drawer Linaje "Explícame esta cifra"
- **Responsable:** Joshua Gonzales | **Pair/Revisor:** Dilan Chávez
- **Story Points:** 3 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/frontend-lineage-drawer`
- **Ventana de Ejecución:** Día 4 (Mié 21 Oct: 14:00 - 18:00)
- **Subtasks Técnicas:**
  - [ ] `ST-FRONT-06.1`: Detección interactiva de métricas en los mensajes del chat: cifras monetarias y porcentajes se renderizan como botones interactivos clickeables.
  - [ ] `ST-FRONT-06.2`: Componente `ExplainNumberDrawer` que muestra:
        - **Fórmula matemática canónica aplicada** con KaTeX.
        - **Árbol de linaje de tablas:** `Fuente` $\rightarrow$ `Bronze` $\rightarrow$ `Silver` $\rightarrow$ `Gold`.
        - **Métricas de certificación:** Calidad 100%, frescura de datos y hash del lote.
  - [ ] `ST-FRONT-06.3`: Conexión hacia el endpoint de linaje de OpenMetadata `/api/v1/lineage/table/...`.
  - [ ] `ST-FRONT-06.4`: Accesibilidad y atajos de teclado: cierre con tecla `Escape` y foco de teclado adecuado.
- **Archivos a Crear:**
  - `src/frontend/components/lineage/ExplainNumberDrawer.tsx`
  - `src/frontend/components/lineage/LineageMiniGraph.tsx`
- **Comando de Verificación:**
  `npm run test -- src/frontend/tests/ExplainNumberDrawer.test.tsx`
- **Entrega Documental Requerida:**
  `documentation/done/frontend/frontend-lineage-drawer-06.md`

---

### 🤖 SQUAD 3: Agentic AI & Semantic Intelligence
**Responsables:** Elian Rivera (AI Lead) & Daniel Echeverría (Backend Support)

#### [HU-AI-01] LangGraph State Machine & Modo Dialógico
- **Responsable:** Elian Rivera | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/agent-langgraph-state-machine`
- **Ventana de Ejecución:** Día 1 (Dom 18 Oct: 10:00 - 23:00)
- **Subtasks Técnicas:**
  - [ ] `ST-AI-01.1`: Definir grafo de estados en LangGraph: `IntentRouter`, `SchemaIntrospector`, `DialogicSuggest`, `QueryGenerator`, `GuardrailValidator`, `StorySynthesizer`.
  - [ ] `ST-AI-01.2`: Implementar **Modo Dialógico Proactivo**: Cuando el usuario saluda o pregunta *"¿Qué datos tenemos?"*, el agente inspecciona las fuentes activas y responde proponiendo 3 análisis concretos de negocio.
  - [ ] `ST-AI-01.3`: Memoria conversacional con persistencia por `thread_id` en PostgreSQL/Redis para recordar el contexto de preguntas anteriores.
  - [ ] `ST-AI-01.4`: Manejo de ambigüedad: si el usuario pide una métrica sin período o dimensión, el agente repregunta amablemente con opciones estructuradas.
- **Archivos a Crear:**
  - `src/agent/graph/builder.py`
  - `src/agent/graph/nodes/router.py`
  - `src/agent/graph/nodes/dialogic.py`
  - `src/agent/state.py`
  - `tests/agent/test_langgraph_flow.py`
- **Comando de Verificación:**
  `pytest tests/agent/test_langgraph_flow.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/agent/agent-langgraph-state-machine-01.md`

---

#### [HU-AI-02] Text-to-Gold Query Generator & OWASP Top 10
- **Responsable:** Elian Rivera | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/agent-text-to-gold-guardrails`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 08:00 - 15:00)
- **Subtasks Técnicas:**
  - [ ] `ST-AI-02.1`: Generador de consultas SQL compatible con Trino / Iceberg optimizado mediante system prompt con esquema canónico inyectado.
  - [ ] `ST-AI-02.2`: Guardrails de seguridad OWASP para LLMs:
        - Bloqueo categórico de palabras reservadas destructivas (`DROP`, `DELETE`, `TRUNCATE`, `ALTER`, `GRANT`, `INSERT`).
        - Detección de Prompt Injections y evasión de políticas de seguridad.
        - Inyección mandatoria de `LIMIT 1000`.
  - [ ] `ST-AI-02.3`: Zero-Hallucination Schema Validator: Validación AST de la query contra las tablas y columnas reales del catálogo antes de enviar a Trino.
  - [ ] `ST-AI-02.4`: Suite de pruebas automatizadas con 20 ataques sintéticos y consultas maliciosas (deben ser bloqueadas al 100%).
- **Archivos a Crear:**
  - `src/agent/tools/text_to_sql.py`
  - `src/agent/guardrails/query_guardrail.py`
  - `src/agent/guardrails/prompt_injection_shield.py`
  - `tests/agent/test_query_guardrails.py`
- **Comando de Verificación:**
  `pytest tests/agent/test_query_guardrails.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/agent/agent-text-to-gold-guardrails-02.md`

---

#### [HU-AI-03] Data Storytelling Engine & Opciones ECharts
- **Responsable:** Elian Rivera | **Pair/Revisor:** Joshua Gonzales
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/agent-storytelling-echarts`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 15:00 - 20:00)
- **Subtasks Técnicas:**
  - [ ] `ST-AI-03.1`: Motor de síntesis narrativa ejecutiva: genera texto en markdown con conclusiones de negocio, riesgos y recomendaciones operativas basadas en datos reales.
  - [ ] `ST-AI-03.2`: Inferencia automática del tipo de gráfico ECharts:
        - Series temporales $\rightarrow$ Gráfico de línea con gradiente de área.
        - Comparaciones discretas $\rightarrow$ Gráfico de barras horizontales/verticales.
        - Distribuciones $\rightarrow$ Gráfico de dispersión o boxplot.
  - [ ] `ST-AI-03.3`: Validación de consistencia matemática: verificar que ninguna cifra mencionada en la narrativa difiera del dataset retornado por Trino.
  - [ ] `ST-AI-03.4`: Generación de payload estructurado listo para consumir por el componente `EChartsRenderer` de Frontend.
- **Archivos a Crear:**
  - `src/agent/storytelling/narrative_generator.py`
  - `src/agent/storytelling/echarts_synthesizer.py`
  - `tests/agent/test_storytelling_engine.py`
- **Comando de Verificación:**
  `pytest tests/agent/test_storytelling_engine.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/agent/agent-storytelling-echarts-03.md`

---

#### [HU-AI-04] Airflow DAG Generator (Pipeline-as-a-Prompt)
- **Responsable:** Elian Rivera | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 3 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/agent-pipeline-as-a-prompt`
- **Ventana de Ejecución:** Día 4 (Mié 21 Oct: 09:00 - 16:00)
- **Subtasks Técnicas:**
  - [ ] `ST-AI-04.1`: Generador declarativo de especificaciones YAML (`airflow-specs`): nombre del pipeline, schedule cron, query SQL validada y tabla Gold de destino.
  - [ ] `ST-AI-04.2`: Publicación de la especificación YAML en el bucket `s3://midas-governance/airflow-specs/` vía MinIO SDK.
  - [ ] `ST-AI-04.3`: Script maestro de DAG Factory en Airflow que vigila MinIO y despliega el nuevo DAG sin necesidad de reiniciar el scheduler.
  - [ ] `ST-AI-04.4`: Emisión de evento SSE al Canvas anunciando el nuevo nodo de datos materializado.
- **Archivos a Crear:**
  - `src/agent/tools/dag_generator.py`
  - `src/orchestration/dag_factory.py`
  - `tests/agent/test_dag_generator.py`
- **Comando de Verificación:**
  `pytest tests/agent/test_dag_generator.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/agent/agent-pipeline-as-a-prompt-04.md`

---

### 🏛️ SQUAD 4: Governance, Midas Guardian & Agile Management
**Responsables:** Sebastian Castiblanco (Co-Líder, Scrum Master & Governance Lead) & Daniel Echeverría

#### [HU-GOV-01] OpenMetadata Ingesta & Linaje Automatizado
- **Responsable:** Sebastian Castiblanco | **Pair/Revisor:** Equipo Midas
- **Story Points:** 3 SP | **Prioridad:** SHOULD HAVE
- **Rama Oficial:** `feature/governance-openmetadata-catalog`
- **Ventana de Ejecución:** Día 2 (Lun 19 Oct: 10:00 - 20:00)
- **Subtasks Técnicas:**
  - [ ] `ST-GOV-01.1`: Configurar servicios de `openmetadata-server` y `opensearch` en el stack Docker.
  - [ ] `ST-GOV-01.2`: Configurar conector de metadatos para las tablas Iceberg (`bronze`, `silver`, `gold`) y PostgreSQL operacional.
  - [ ] `ST-GOV-01.3`: Extracción automatizada de linaje entre fuentes crudas, transformaciones PySpark y tablas de consumo Gold.
  - [ ] `ST-GOV-01.4`: Exponer endpoint REST proxy en FastAPI `/api/v1/lineage/table/{table_name}` para consumo del Drawer de Frontend.
- **Archivos a Crear:**
  - `src/security_governance/openmetadata/connector_config.yaml`
  - `src/security_governance/openmetadata/lineage_extractor.py`
  - `tests/governance/test_openmetadata_lineage.py`
- **Comando de Verificación:**
  `pytest tests/governance/test_openmetadata_lineage.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/security/governance-openmetadata-catalog-01.md`

---

#### [HU-GOV-02] Escudo PII en Caliente & Tags Atlas API
- **Responsable:** Sebastian Castiblanco | **Pair/Revisor:** Edgar Corzo
- **Story Points:** 3 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/governance-atlas-pii-shield`
- **Ventana de Ejecución:** Día 2 (Lun 19 Oct: 14:00 - 23:00)
- **Subtasks Técnicas:**
  - [ ] `ST-GOV-02.1`: Implementar clasificador de datos sensibles (PII) basado en regex y taxonomía empresarial (emails, identificaciones, salarios, tarjetas).
  - [ ] `ST-GOV-02.2`: Integración de PySpark con la API de Apache Atlas para registrar la clasificación `PII_CONFIDENCIAL` sobre la columna detectada durante la ingesta a Silver.
  - [ ] `ST-GOV-02.3`: Sincronización automática de clasificaciones hacia Apache Ranger vía TagSync en menos de 5 segundos.
  - [ ] `ST-GOV-02.4`: Bitácora inmutable de auditoría con fecha, lote y columnas clasificadas.
- **Archivos a Crear:**
  - `src/security_governance/atlas/pii_classifier.py`
  - `src/security_governance/atlas/atlas_client.py`
  - `tests/governance/test_pii_shield.py`
- **Comando de Verificación:**
  `pytest tests/governance/test_pii_shield.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/security/governance-atlas-pii-shield-02.md`

---

#### [HU-GOV-03] Ranger Dynamic Masking & Row-Level Filters
- **Responsable:** Sebastian Castiblanco | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 3 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/governance-ranger-security-policies`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 10:00 - 19:00)
- **Subtasks Técnicas:**
  - [ ] `ST-GOV-03.1`: Configuración de políticas de enmascaramiento dinámico en Ranger:
        - Rol `Analista`: Enmascaramiento parcial con asteriscos (`u****@riwi.io`).
        - Rol `Auditor` / `Admin`: Texto plano con registro de auditoría.
  - [ ] `ST-GOV-03.2`: Configuración de política de filtrado por filas (Row-Level Security):
        - Rol `Gerente Regional Norte`: Trino añade automáticamente `WHERE region = 'NORTE'`.
  - [ ] `ST-GOV-03.3`: Validación de políticas mediante consultas Trino concurrentes con distintos usuarios (`user_analyst`, `user_manager`, `user_admin`).
  - [ ] `ST-GOV-03.4`: Comprobación de overhead de latencia menor a 15 ms por consulta.
- **Archivos a Crear:**
  - `src/security_governance/ranger/policies/masking_policy.json`
  - `src/security_governance/ranger/policies/row_filter_policy.json`
  - `tests/governance/test_ranger_security.py`
- **Comando de Verificación:**
  `pytest tests/governance/test_ranger_security.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/security/governance-ranger-security-policies-03.md`

---

#### [HU-GOV-04] Midas Guardian Inyector F1-F5 & Auto-Healing
- **Responsable:** Sebastian Castiblanco | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 5 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/governance-guardian-auto-healing`
- **Ventana de Ejecución:** Día 3 (Mar 20 Oct: 14:00 - 23:00)
- **Subtasks Técnicas:**
  - [ ] `ST-GOV-04.1`: Implementar script CLI de inyección de fallos controlados `scripts/inject_fault.py --fault [F1|F2|F3|F4|F5]`:
        - `F1`: Montos negativos y registros corruptos.
        - `F2`: Deriva de esquemas (*schema drift* con columnas faltantes).
        - `F3`: Duplicados masivos en tablas dimensionales.
        - `F4`: Caída simulada de contenedor de ingesta.
        - `F5`: Corrupción simulada de archivo Parquet en MinIO.
  - [ ] `ST-GOV-04.2`: Máquina de estados de Midas Guardian con auto-detección y clasificación de anomalías en menos de 2 segundos.
  - [ ] `ST-GOV-04.3`: Implementar ejecución demostrable del playbook `QUARANTINE_INVALID_ROWS_V1`: desvío de registros corruptos a cuarentena y continuación del 99.8% limpio hacia Gold.
  - [ ] `ST-GOV-04.4`: Emisión de eventos SSE hacia el Canvas en vivo (nodo Guardian pasa de verde a ámbar y se auto-resuelve a verde).
- **Archivos a Crear:**
  - `scripts/inject_fault.py`
  - `src/security_governance/guardian/engine.py`
  - `src/security_governance/guardian/playbooks.py`
  - `tests/governance/test_guardian_auto_healing.py`
- **Comando de Verificación:**
  `pytest tests/governance/test_guardian_auto_healing.py -v`
- **Entrega Documental Requerida:**
  `documentation/done/security/governance-guardian-auto-healing-04.md`

---

#### [HU-GOV-05] Auditoría Ágil, Anti-Drift & Release v1.0.0
- **Responsable:** Sebastian Castiblanco (Scrum Master) | **Pair/Revisor:** Daniel Echeverría
- **Story Points:** 2 SP | **Prioridad:** MUST HAVE
- **Rama Oficial:** `feature/governance-scrum-anti-drift-audit`
- **Ventana de Ejecución:** Día 4 (Mié 21 Oct: 14:00 - 20:00)
- **Subtasks Técnicas:**
  - [ ] `ST-GOV-05.1`: Auditoría de completitud del 100% de los reportes de entrega bajo `documentation/done/[area]/`.
  - [ ] `ST-GOV-05.2`: Verificación estricta de Cero Code Drift: comprobar que ninguna fórmula contable ni esquema implementado en `src/` difiera de las especificaciones canónicas.
  - [ ] `ST-GOV-05.3`: Ensayos generales de la demostración de 30 minutos (los 6 oradores con minutero en mano).
  - [ ] `ST-GOV-05.4`: Integración final a `main`, etiquetado de release `v1.0.0` y congelación total de código a las 23:59.
- **Archivos a Crear:**
  - `scripts/audit_anti_drift.py`
  - `documentation/done/other/governance-scrum-anti-drift-audit-05.md`
- **Comando de Verificación:**
  `python scripts/audit_anti_drift.py`
- **Entrega Documental Requerida:**
  `documentation/done/other/governance-scrum-anti-drift-audit-05.md`

---

## 4. Cronograma de Checkpoints y Cadencia Ágil Diaria

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                       CADENCIA DIARIA DE COORDINACIÓN (DAILY STANDUP)                   │
├───────┬──────────────┬──────────────────────────────────────────────────────────────────┤
│ Hora  │ Actividad    │ Dinámica & Liderazgo (Sebastian Castiblanco / Daniel Echeverría) │
├───────┼──────────────┼──────────────────────────────────────────────────────────────────┤
│ 08:30 │ Morning Sync │ 15 min: ¿Qué cerré ayer? ¿Qué entrego hoy? ¿Qué me bloquea?      │
│ 13:30 │ Midday Check │ Revisión de contratos y handoffs entre squads en Slack/Discord   │
│ 19:30 │ Evening Sync │ Verificación de PRs, tests en verde y registro en documentation/done/│
└───────┴──────────────┴──────────────────────────────────────────────────────────────────┘
```

---

## 5. Protocolo de Aprobación y Fusión (Gatekeeper Final)

1. **Revisión de Pares:** Cada PR debe tener al menos una aprobación del revisor técnico asignado en este backlog.
2. **Aprobación de Arquitectura:** Aprobación obligatoria de **Daniel Echeverría** para cambios que toquen APIs, modelos o pipelines.
3. **Auditoría de Gobernanza:** Aprobación de **Sebastian Castiblanco** validando que el archivo de entrega en `documentation/done/` esté completo y conforme con `team-concurrency-guard`.
