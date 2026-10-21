# HU-FRONT-02: Real-Time SSE Telemetry Consumer & Smooth Particle Flow Animations

- **ID de la Historia:** `HU-FRONT-02`
- **Título Oficial:** Real-Time SSE Telemetry Consumer & Smooth Particle Flow Animations
- **Rama Oficial:** `feature/frontend-sse-telemetry`
- **Responsable:** Dilan Chávez (`dilandcv`) — Frontend Lead & Real-Time Canvas Architect
- **Pair / Revisor:** Joshua Gonzales — UI/UX Specialist
- **Squad:** Squad 2 — Frontend & Real-Time Canvas
- **Fecha de Entrega:** Lunes 19 de Octubre de 2026, 18:00
- **Story Points:** 5 SP (MUST HAVE)
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md)
  - [`documentation/canonical/02_mvp_dorado_blueprint_global.md`](../../canonical/02_mvp_dorado_blueprint_global.md)
  - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../canonical/04_logica_de_negocio_y_resiliencia_guardian.md)
  - [`documentation/done/backend/backend-api-gateway-sse-01.md`](../backend/backend-api-gateway-sse-01.md)
  - [`documentation/done/frontend/frontend-reactflow-canvas-01.md`](frontend-reactflow-canvas-01.md)
  - [`src/core/telemetry/events.py`](../../../src/core/telemetry/events.py)
  - [`src/api/routes/telemetry.py`](../../../src/api/routes/telemetry.py)

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **1. Hook `useTelemetryStream.ts` tipado y resiliente** | ✅ Cumplido | Implementado en `src/frontend/hooks/useTelemetryStream.ts` usando `EventSource` nativo, listeners para `event: telemetry` y `message`, prevención de conexiones duplicadas para React 18 Strict Mode y limpieza rigurosa al desmontar. |
| **2. Actualización de métricas de nodos en caliente a 60 FPS** | ✅ Cumplido | `PipelineCanvas.tsx` encola eventos y aplica mutaciones atómicas agrupadas por `requestAnimationFrame` (máximo 1 frame de React por refresco visual), sincronizando contadores de registros (`recordsIn`, `recordsOut`), latencia, estado de nodo y registros en cuarentena. |
| **3. Modulación determinista de la velocidad de partículas** | ✅ Cumplido | `DataFlowEdge.tsx` implementa `calculateParticleDuration()` modulando la duración de `<animateMotion>` entre 0.60s y 4.50s proporcionalmente a los registros por segundo (RPS) reportados por Spark y Airflow. |
| **4. Indicador visual discreto de estado de conexión** | ✅ Cumplido | `TelemetryConnectionBanner.tsx` integrado en la UI del Canvas con los 4 estados canónicos (`CONNECTING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`), accesible (`role="status"`, `aria-live="polite"`), sin bloquear interacción y preservando la última telemetría válida. |
| **5. Reconexión con backoff exponencial y `Last-Event-ID`** | ✅ Cumplido | Backoff exponencial determinista (`initialBackoffMs: 1000ms`, multiplicador 1.5x, tope 15000ms) retransmitiendo `last_event_id` en query param hacia el ring buffer del backend FastAPI. |
| **6. Suite de pruebas automatizadas pasando al 100%** | ✅ Cumplido | 22 de 22 pruebas unitarias y de integración pasando al 100% en Vitest (`useTelemetryStream.test.ts`, `telemetryIntegration.test.tsx`, `PipelineCanvas.test.tsx`). Cero errores de TypeScript en `tsc --noEmit`. Compilación de producción `next build` exitosa. |

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero desvío de fórmulas de negocio:** Las métricas mostradas en los nodos respetan las definiciones contables y canónicas de `documentation/canonical/04_logica_de_negocio_...md`.
- [x] **Compatibilidad exacta de contratos SSE:** El payload consumido coincide carácter por carácter con `TelemetryEvent` de `src/core/telemetry/events.py` (`event_id`, `pipeline_id`, `node_id`, `status`, `records_in`, `records_out`, `latency_ms`, `timestamp`, `details`).
- [x] **Single-Area Ownership respetado al 100%:** Todas las modificaciones y adiciones están confinadas en `src/frontend/` (`hooks/`, `types/`, `components/`, `tests/`) y documentación en `documentation/done/frontend/`. Cero alteraciones en `src/api/`, `src/lakehouse/`, `docker/` o módulos ajenos.
- [x] **Sin colisiones de rama ni destrucción de cambios:** Se preservaron intactos los cambios locales de estilo y branding preexistentes del equipo.
- [x] **`git diff --check` limpio:** Cero trailing whitespaces o conflictos de merge.

---

## 3. Arquitectura de la Integración

```
FastAPI Gateway SSE Hub
(GET /api/v1/telemetry/stream)
            │
            │  W3C SSE Stream (id, event: telemetry, data) + Heartbeat (: ping)
            ▼
┌────────────────────────────────────────────────────────┐
│              Browser Client (EventSource)               │
├────────────────────────────────────────────────────────┤
│  useTelemetryStream.ts Hook                            │
│  - EventSource Lifecycle & StrictMode Teardown Guard   │
│  - Exponential Backoff & Last-Event-ID Ring Replay     │
│  - JSON Parsing & TelemetryEventPayload Validation     │
│  - Node Aggregations & Spark/Airflow RPS Deductions    │
└────────────────────────────────────────────────────────┘
            │
            │  Event Queue (batched per frame)
            ▼
┌────────────────────────────────────────────────────────┐
│  PipelineCanvas.tsx (requestAnimationFrame 60 FPS)     │
│  - Single-Pass Node State Update (setNodes)            │
│  - Live Inspection Drawer Synchronization               │
│  - Discrete TelemetryConnectionBanner State Sync       │
└────────────────────────────────────────────────────────┘
            │
            ├──────────────────────────┐
            ▼                          ▼
┌──────────────────────┐   ┌────────────────────────────────────────┐
│ Nodos Medallón       │   │ DataFlowEdge.tsx (Particle Flow)       │
│ - SourceNode         │   │ - Modulated <animateMotion dur={dur}/> │
│ - StageNode          │   │ - Formula: (rps / 1000)^0.35           │
│ - GuardianNode       │   │ - Safe Bounds: [0.60s, 4.50s]          │
└──────────────────────┘   └────────────────────────────────────────┘
```

---

## 4. Endpoint SSE y Formato Real de Eventos

### 4.1. Endpoint Utilizado
- **Ruta Oficial:** `GET /api/v1/telemetry/stream`
- **URL Base:** `process.env.NEXT_PUBLIC_SSE_URL || 'http://localhost:8000/api/v1/telemetry/stream'`
- **Parámetros Soportados:** `?last_event_id=<id>` (retransmite eventos perdidos desde el buffer circular de 100 eventos del backend).

### 4.2. Formato Real de Eventos W3C SSE Emitidos por el Hub
```http
id: evt_1729340000000_3a8b1c4e
event: telemetry
data: {"event_id": "evt_1729340000000_3a8b1c4e", "pipeline_id": "pipe_medallion_e2e", "node_id": "silver_cleansing", "status": "HEALTHY", "records_in": 5000, "records_out": 4986, "latency_ms": 45.0, "timestamp": "2026-10-19T10:00:00Z", "details": {"quarantined_records": 14, "throughput_rps": 1250}}

: ping

```

---

## 5. Tipos de Telemetría (`src/frontend/types/telemetry.ts`)

```typescript
export type ConnectionStatus =
  | 'CONNECTING'
  | 'CONNECTED'
  | 'RECONNECTING'
  | 'DISCONNECTED';

export interface TelemetryEventPayload {
  event_id: string;
  pipeline_id: string;
  node_id: string;
  status: NodeStatus;
  records_in: number;
  records_out: number;
  latency_ms: number;
  timestamp: string;
  details?: {
    quarantined_records?: number;
    anomaly_type?: string;
    playbook_id?: string;
    action_taken?: string;
    throughput_rps?: number;
    records_per_second?: number;
    spark_rps?: number;
    airflow_rps?: number;
    [key: string]: unknown;
  };
}
```

---

## 6. Funcionamiento del Hook `useTelemetryStream.ts`

- **Instanciación:** Se ejecuta en el cliente (`'use client'`). Utiliza `EventSource` nativo (o factory inyectada en pruebas).
- **Listeners:**
  - `es.addEventListener('telemetry', ...)`: Captura los eventos estructurados con nombre canónico `event: telemetry`.
  - `es.onmessage = ...`: Captura eventos fallback estándar.
  - `es.onopen = ...`: Marca `connectionStatus = 'CONNECTED'`, reinicia contador de intentos a 0 y cancela temporizadores.
  - `es.onerror = ...`: Cierra la conexión fallida, pasa a `RECONNECTING` (o `DISCONNECTED` si superó reintentos máximos) y programa el reintento con backoff exponencial.
- **Prevención de Conexiones Duplicadas y Strict Mode:** Se controlan referencias mutables con `eventSourceRef`, `reconnectTimeoutRef` e `isUnmountedRef`. Al desmontar el componente en el ciclo de limpieza de `useEffect`, se cierra la conexión activa y se cancelan todos los temporizadores en vuelo.
- **Validación de Datos:** Toda trama entrante es validada con `isValidTelemetryEvent()`. Mensajes no-JSON o comentarios de keepalive `: ping` son descartados silenciosamente sin interrumpir el runtime de la aplicación.
- **Retorno Tipado:**
  - `connectionStatus`: Estado actual (`CONNECTING`, `CONNECTED`, `RECONNECTING`, `DISCONNECTED`).
  - `lastEvent`: Último evento válido recibido.
  - `metricsByNode`: Mapa indexado por `node_id` con el último evento recibido de cada nodo.
  - `sparkRps`: Tasa actual en registros por segundo para procesos Spark.
  - `airflowRps`: Tasa actual en registros por segundo para procesos Airflow.
  - `lastEventId`: Último ID recibido para reconexión transparente.
  - `connect()` y `disconnect()`: Métodos manuales de control.

---

## 7. Estrategia de Reconexión y Backoff Exponencial

Para evitar tormentas de reconexión (*thundering herd*) y proteger la API:
1. **Retardo Inicial:** `initialBackoffMs = 1000ms`.
2. **Multiplicador Exponencial:** `backoffMultiplier = 1.5x`.
3. **Límite Máximo de Retardo:** `maxBackoffMs = 15000ms`.
4. **Fórmula:**
   $$\text{Delay} = \min\left(\text{maxBackoffMs}, \text{initialBackoffMs} \times 1.5^{(\text{attempts} - 1)}\right)$$
5. **Límite de Intentos:** Máximo 10 intentos consecutivos antes de transicionar al estado estable `DISCONNECTED`.
6. **Reanudación Transparente:** La URL de reconexión añade `?last_event_id=${lastEventId}` para recuperar eventos no leídos desde el buffer circular del backend.

---

## 8. Actualización de Contadores y Suavizado Visual a 60 FPS

- **Desacoplamiento de Recepción vs Render:** Los eventos SSE pueden llegar en ráfagas o en intervalos variables. En lugar de ejecutar un re-render de React por cada evento entrante, `PipelineCanvas` almacena los eventos en `pendingEventsRef.current`.
- **Límite a 60 FPS:** Se solicita un único `requestAnimationFrame(flushBatchUpdates)`.
- **Consolidación en Lote:** En el callback del frame:
  1. Se consolida el último evento para cada nodo.
  2. Se ejecuta un único `setNodes()` atómico.
  3. Se actualizan los datos del Drawer lateral si el nodo inspeccionado recibió telemetría.
  4. Se ejecuta un único `setEdges()` actualizando duraciones y etiquetas.
- **Cancelación Segura:** Si el componente se desmonta mientras hay un frame programado, `cancelAnimationFrame` limpia la referencia.

---

## 9. Modulación Determinista de Partículas en Edges

### 9.1. Fórmula Matemática
En `src/frontend/components/canvas/edges/DataFlowEdge.tsx`, la duración de la animación SVG `<animateMotion>` se calcula mediante:

$$\text{Multiplicador de Velocidad } M = \left(\frac{\max(\text{RPS}, 20)}{\text{RPS}_{\text{nominal}}}\right)^{0.35}$$

$$\text{Duración Animación} = \text{clamp}\left(\frac{\text{Duración Nominal}}{M}, \text{Duración Mínima}, \text{Duración Máxima}\right)$$

Donde:
- $\text{Duración Nominal} = 2.50\text{ s}$ para $\text{RPS}_{\text{nominal}} = 1000\text{ RPS}$.
- $\text{Duración Mínima} = 0.60\text{ s}$ (tope de alta velocidad para flujos extremos $\ge 50,000\text{ RPS}$).
- $\text{Duración Máxima} = 4.50\text{ s}$ (tope de baja velocidad para flujos lentos $\le 100\text{ RPS}$).

### 9.2. Mapeo de Sistemas a Conexiones (Edges)
- **Airflow:** Orquesta la ingesta hacia Bronze:
  - `edge_postgres_bronze` $\rightarrow$ Tasa de `source_postgres`.
  - `edge_excel_bronze` $\rightarrow$ Tasa de `source_excel`.
  - `edge_api_bronze` $\rightarrow$ Tasa de `source_api`.
- **Apache Spark (PySpark):** Ejecuta la computación Medallón distribuida:
  - `edge_bronze_silver` $\rightarrow$ Tasa de `silver_cleansing` / `bronze_raw` (PySpark Cleanse).
  - `edge_silver_gold` $\rightarrow$ Tasa de `gold_marts` (PySpark WAP Promotion).
- **Midas Guardian:** Monitorea y aísla incidentes:
  - `edge_silver_guardian` $\rightarrow$ Activación cuando `quarantined_records > 0`, color ámbar `#F59E0B`, línea discontinua y conteo de filas desviadas.
  - `edge_guardian_gold` $\rightarrow$ Gatekeeper WAP (inactivo por defecto sin alteración de topología).

---

## 10. Indicador Visual de Conexión (`TelemetryConnectionBanner.tsx`)

Ubicado discretamente en la esquina superior derecha del Canvas (`top-4 right-4 z-20`):
- **`CONNECTED`:** Badge verde esmeralda con punto pulsante, texto "Telemetría SSE en Vivo" y hora del último evento.
- **`RECONNECTING`:** Badge ámbar con icono giratorio, texto "Reconectando (Intento N)..." y aclaración explícita de "Métricas en caché (posiblemente desactualizadas)".
- **`CONNECTING`:** Badge azul celeste con icono de antena y texto "Conectando con Hub...".
- **`DISCONNECTED`:** Badge carmín con icono de desconexión, preservación de datos en pantalla y botón interactivo "Reconectar" para reanudar el stream manualmente.

---

## 11. Evidencia de Pruebas Automatizadas

### 11.1. Ejecución de la Suite de Pruebas (Vitest)
```bash
npm test
```

**Resultado:**
```text
 ✓ src/frontend/tests/PipelineCanvas.test.tsx (7)
   ✓ 1. Renderiza el contenedor principal y los controles de topología
   ✓ 2. Renderiza todos los 7 nodos deterministas canónicos de la arquitectura
   ✓ 3. Abre el NodeInspectionDrawer al hacer clic en un nodo y permite cerrarlo
   ✓ 4. SourceNode renderiza metadatos y estado HEALTHY correctamente
   ✓ 5. StageNode muestra alerta de cuarentena en Silver cuando quarantinedRecords > 0
   ✓ 6. GuardianNode muestra Playbook activo y estado AUTO_HEALING
   ✓ 7. NodeInspectionDrawer gestiona datos vacíos o ausentes de forma elegante (Fallback seguro)

 ✓ src/frontend/tests/useTelemetryStream.test.ts (8)
   ✓ 1. Abre la conexión EventSource al montar con la URL configurada
   ✓ 2. Procesa un evento "telemetry" válido y actualiza métricas por nodo
   ✓ 3. Maneja JSON inválido o malformado sin hacer caer el hook
   ✓ 4. Descarta eventos incompletos que no cumplen el contrato mínimo
   ✓ 5. Maneja desconexión con backoff exponencial y reintenta la conexión
   ✓ 6. Propaga Last-Event-ID en la URL durante la reconexión para replay del ring buffer
   ✓ 7. Limpia recursos, cierra EventSource y cancela temporizadores al desmontar
   ✓ 8. Permite desconexión y reconexión manual vía connect() y disconnect()

 ✓ src/frontend/tests/telemetryIntegration.test.tsx (7)
   ✓ 1. Renderiza estado CONNECTED con badge y estilo accesible
   ✓ 2. Renderiza estado RECONNECTING con conteo de intentos y aviso de datos en caché
   ✓ 3. Renderiza estado DISCONNECTED con botón para reconexión manual
   ✓ 4. calculateParticleDuration calcula duraciones proporcionales y acotadas
   ✓ 5. DataFlowEdge aplica particleDuration en animateMotion SVG
   ✓ 6. Conecta el Canvas al stream SSE y actualiza en caliente los nodos mediante rAF
   ✓ 7. Modula el edge de cuarentena y actualiza el nodo Guardian cuando hay desvío

Test Files  3 passed (3)
     Tests  22 passed (22)
  Duration  1.15s
```

### 11.2. Comprobación de Tipos TypeScript
```bash
npm run lint
```
**Resultado:** `tsc --noEmit` completado con exit code 0 y 0 errores.

### 11.3. Compilación de Producción Next.js
```bash
npm run build
```
**Resultado:** Compilación exitosa de Next.js 14.2.35 sin errores ni advertencias de dependencias.

### 11.4. Verificación de Diff Limpio
```bash
git diff --check
```
**Resultado:** Exit code 0, sin trailing whitespaces ni conflictos.

---

## 12. Archivos Creados y Modificados

### Archivos Creados:
1. `src/frontend/types/telemetry.ts` — Contratos de eventos SSE, estado de conexión y opciones del hook.
2. `src/frontend/hooks/useTelemetryStream.ts` — Hook cliente de SSE con reconexión, backoff y filtros.
3. `src/frontend/components/canvas/TelemetryConnectionBanner.tsx` — Banner discreto accesible de salud de conexión.
4. `src/frontend/tests/useTelemetryStream.test.ts` — Pruebas unitarias de resiliencia y reconexión de SSE.
5. `src/frontend/tests/telemetryIntegration.test.tsx` — Pruebas de integración del Canvas, rAF y modulación SVG.
6. `documentation/done/frontend/frontend-sse-telemetry-02.md` — Documentación exhaustiva de entrega.
7. `src/frontend/app/api/v1/telemetry/stream/route.ts` — Route Handler SSE nativo en Next.js para emulación local fiel del flujo en streaming.

### Archivos Modificados:
1. `src/frontend/components/canvas/edges/DataFlowEdge.tsx` — Función determinista `calculateParticleDuration` y duración dinámica en `<animateMotion>`, con estilización cromática canónica Midas.
2. `src/frontend/components/canvas/PipelineCanvas.tsx` — Integración reactiva del stream SSE con suavizado visual rAF a 60 FPS, banner de telemetría y grilla de mármol griego (`#FBF9F5` / `#D5CBBA`).
3. `src/frontend/tailwind.config.ts` y `src/frontend/app/globals.css` — Configuración de tokens de color corporativos (`surface` y `midas` gold, bronze, slate, silver).
4. `src/frontend/components/canvas/nodes/` (`StageNode.tsx`, `SourceNode.tsx`, `GuardianNode.tsx`, `CanvasControls.tsx`, `NodeInspectionDrawer.tsx`) — Adaptación cromática estricta 1:1 a la paleta oficial Midas preservando intacta la estructura y funcionalidad.
5. `src/frontend/types/canvas.ts` — Armonización de `NODE_STATUS_REGISTRY` con los códigos hex de estado nominal (`#4D7C0F`), advertencia y cuarentena.

---

## 13. Conclusión y Estado de la Historia

La historia de usuario **`HU-FRONT-02`** (junto con la armonización cromática de **`HU-FRONT-01`**) queda implementada de forma completa, verificada con 22/22 pruebas unitarias e integradas, compilación `next build` exitosa y documentada al 100%. No quedan criterios pendientes ni bloqueantes.
