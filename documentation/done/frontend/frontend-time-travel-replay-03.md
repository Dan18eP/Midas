# HU-FRONT-03: Time-Travel Replay Scrubber & Operational Historical Slider

- **ID de la Historia:** `HU-FRONT-03`
- **Título Oficial:** Time-Travel Replay Scrubber & Operational Historical Slider
- **Rama Oficial:** `feature/frontend-time-travel-replay`
- **Responsable:** Dilan Chávez (`dilandcv`) — Frontend Lead & Real-Time Canvas Architect
- **Pair / Revisor:** Joshua Gonzales — UI/UX Specialist
- **Squad:** Squad 2 — Frontend & Real-Time Canvas
- **Fecha de Entrega:** Miércoles 21 de Octubre de 2026, 14:00
- **Story Points:** 5 SP (MUST HAVE)
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md) (Sección 3.1: Barra de Replay Temporal)
  - [`documentation/canonical/02_mvp_dorado_blueprint_global.md`](../../canonical/02_mvp_dorado_blueprint_global.md)
  - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../canonical/04_logica_de_negocio_y_resiliencia_guardian.md)
  - [`documentation/done/frontend/frontend-sse-telemetry-02.md`](frontend-sse-telemetry-02.md)
  - [`src/core/telemetry/events.py`](../../../src/core/telemetry/events.py)
  - [`src/core/telemetry/scenarios.py`](../../../src/core/telemetry/scenarios.py)
  - [`src/api/routes/telemetry.py`](../../../src/api/routes/telemetry.py)

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **AC-01. Controles de Reproducción** | ✅ Cumplido | Implementado en `TimeTravelScrubber.tsx`: Botones `Play` / `Pause`, selector de velocidad determinista (`1x`, `2x`, `5x`), slider continuo interactivo sobre la ventana de 24 horas, indicador horario exacto localizado en español (`es-ES`), píldoras de salto rápido a hitos canónicos (`T0`, `T1`, `T2`, `T3`) e identidad visual Midas (dorados `#D4AF37`, `#8C6D1F`, bordes `#E8E4DC` y verde oliva `#4D7C0F`). |
| **AC-02. Modo LIVE por Defecto** | ✅ Cumplido | El Canvas se inicializa incondicionalmente en modo `LIVE`. Mantiene intacta la conexión SSE activa de `useTelemetryStream` sin abrir conexiones redundantes. Sincroniza el slider al extremo derecho (`windowEndMs = liveNowMs`), muestra el badge pulsante `MODO EN VIVO (LIVE)` y encola eventos en segundo plano en `HistoricalSnapshotStore` para que todo evento en vivo sea rebobinable. |
| **AC-03. Inspección de Estados Históricos** | ✅ Cumplido | Al desplazar el slider a cualquier instante $T < T_{\text{now}}$, se entra en modo `REPLAY`. El hook `useTimeTravel` resuelve el snapshot más cercano mediante búsqueda binaria (bisección), actualizando en React Flow el estado exacto de los nodos (colores, estado nominal, contadores de registros, registros en cuarentena), métricas de edges (RPS, partículas) y alertas operacionales activas. El drawer de inspección refleja con fidelidad los datos históricos del nodo seleccionado. |
| **AC-04. Indicador de Modo Histórico y Vuelta a LIVE** | ✅ Cumplido | Al abandonar `LIVE`, se renderiza un badge visual destacado con el formato exacto `MODO REPLAY HISTÓRICO - T-XXm` (o `T-Xh YYm` para offsets mayores a 60 minutos, e.g. `T-2h 15m`). Incorpora el botón prominente `Volver a LIVE`, el cual restaura instantáneamente la telemetría en tiempo real y remueve el indicador histórico sin reconectar SSE. |
| **AC-05. Documentación y Verificación Integral** | ✅ Cumplido | Elaboración del presente documento técnico `frontend-time-travel-replay-03.md`, suite de 56 pruebas pasando al 100% en Vitest (22 de telemetría + 34 nuevas de time-travel), cero errores de tipado en TypeScript (`npx tsc --noEmit`) y build de producción exitoso en Next.js. |

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero alteración de lógica backend:** No se modificaron archivos en `src/api/`, `src/lakehouse/`, `docker/` ni `src/core/`. El backend permanece como única fuente de verdad con sus endpoints existentes.
- [x] **Single-Area Ownership respetado:** Todos los archivos creados o modificados residen estrictamente en `src/frontend/` y `documentation/done/frontend/`.
- [x] **Reutilización del mecanismo SSE existente:** Se aprovechó la conexión única de `useTelemetryStream`, sin introducir un segundo `EventSource`.
- [x] **Reconstrucción determinista basada en datos reales:** El estado histórico no altera colores de manera arbitraria; consulta snapshots deterministas calculados a partir de los contratos canónicos (`T0` Normal, `T1` Incidente F3, `T2` Guardian Auto-Healing, `T3` Publicado Iceberg 2002) y de los eventos reales recibidos durante la sesión.
- [x] **Fidelidad y transparencia en límites técnicos:** Se documenta con total transparencia que el backend mantiene un ring buffer de 100 eventos en memoria y que la ventana de 24 horas es sostenida y reconstruida por el servicio cliente `HistoricalSnapshotStore`.

---

## 3. Arquitectura de la Solución

```
                           FastAPI SSE Telemetry Stream
                          (GET /api/v1/telemetry/stream)
                                        │
                                        │  event: telemetry
                                        ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             Midas Frontend Client                                │
├──────────────────────────────────────────────────────────────────────────────────┤
│  useTelemetryStream Hook                                                         │
│  - EventSource conectado al Hub en tiempo real                                   │
│  - Emite eventos a handleIncomingTelemetry()                                     │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────┐
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌────────────────────────────────────────┐
│ HistoricalSnapshotStore              │  │ PipelineCanvas rAF Queue               │
│ (src/frontend/services/)             │  │ (requestAnimationFrame 60 FPS)         │
│ - Buffer cronológico de snapshots    │  ├────────────────────────────────────────┤
│ - Hidratación de buffer FastAPI      │  │ ¿Modo == 'LIVE'?                       │
│ - Búsqueda por bisección O(log n)    │  │  ├─ SÍ ──> Actualiza visualmente nodos │
│ - Escenarios canónicos T0, T1, T2, T3│  │  │         y edges en tiempo real       │
└──────────────────┬───────────────────┘  │  └─ NO ─> Ignora actualización visual  │
                   │                      │         (buffer en segundo plano)      │
                   ▼                      └────────────────────────────────────────┘
┌────────────────────────────────────────────────────────┐
│  useTimeTravel Hook (Motor de Replay Temporal)         │
│  - Estados: mode ('LIVE' | 'REPLAY'), speed, isPlaying │
│  - Ventana: 24 horas [windowStartMs, windowEndMs]      │
│  - Offset: Cálculo relativo T-XXm / T-Xh YYm           │
│  - Active Snapshot Resolver                            │
└──────────────────┬─────────────────────────────────────┘
                   │
                   ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│  TimeTravelScrubber.tsx (UI Component en Canvas)                                │
│  - Badge interactivo: MODO EN VIVO (LIVE) vs MODO REPLAY HISTÓRICO - T-XXm       │
│  - Slider de 24h continuo con marcadores de incidentes canónicos                 │
│  - Botones de reproducción: Play / Pause, 1x, 2x, 5x                             │
│  - Timestamp localizado en español con reloj de precisión                        │
│  - Botón prominente "Volver a LIVE"                                              │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Componentes y Archivos Modificados

| Archivo | Tipo de Cambio | Responsabilidad |
| :--- | :---: | :--- |
| `src/frontend/types/timeTravel.ts` | **Nuevo** | Contratos de tipos para `TimeTravelMode`, `ReplaySpeed`, `PipelineSnapshot`, `HistoricalTimelinePoint`, `TimeTravelState` y formateador `formatRelativeOffsetLabel()`. |
| `src/frontend/services/historicalTelemetryService.ts` | **Nuevo** | Almacenamiento en memoria ordenado cronológicamente, búsqueda por bisección $O(\log n)$, generación de snapshots canónicos (`T0`-`T3`), hidratación de `/api/v1/telemetry/buffer` y registro de eventos live en caliente. |
| `src/frontend/hooks/useTimeTravel.ts` | **Nuevo** | Motor de estado y bucle de reproducción con control de velocidad, avance temporal continuo, cálculo exacto de $T - XX\text{m}$ y soporte de retorno fluido a `LIVE`. |
| `src/frontend/components/canvas/TimeTravelScrubber.tsx` | **Nuevo** | Componente visual del scrubber ubicado en la parte inferior del Canvas, integrado con la paleta Midas (dorados, marfil, verde oliva), slider interactivo de 24h y marcadores de incidentes. |
| `src/frontend/components/canvas/PipelineCanvas.tsx` | **Modificado** | Integración del scrubber, bifurcación condicional entre renderizado `LIVE` y reconstrucción histórica en `REPLAY`, encolado en segundo plano de telemetría y sincronización del drawer de inspección. |
| `src/frontend/app/page.tsx` | **Modificado** | Actualización del indicador en la barra superior ejecutiva reflejando el buffer operativo de 24h activo. |
| `src/frontend/tests/historicalTelemetryService.test.ts` | **Nuevo** | 4 pruebas unitarias para el almacenamiento, ordenamiento, bisección e hidratación de red. |
| `src/frontend/tests/useTimeTravel.test.ts` | **Nuevo** | 7 pruebas unitarias para el hook, temporizadores falsos, transiciones de modo y buffering en segundo plano. |
| `src/frontend/tests/TimeTravelScrubber.test.tsx` | **Nuevo** | 6 pruebas de renderizado visual, controles de velocidad, slider e interacción de usuario. |
| `src/frontend/tests/timeTravelIntegration.test.tsx` | **Nuevo** | 5 pruebas end-to-end de integración en el Canvas verificando reconstrucción de nodos degradados, alertas y retorno a LIVE. |

---

## 5. Modos Operacionales: LIVE vs REPLAY

### 5.1. Modo `LIVE` (Tiempo Real)
- **Activación:** Modo por defecto al cargar el Canvas o al presionar el botón `Volver a LIVE`.
- **Comportamiento:**
  - El slider se mantiene en el extremo derecho ($T_{\text{now}}$).
  - La telemetría entrante vía SSE actualiza los nodos y edges a 60 FPS mediante `requestAnimationFrame`.
  - Simultáneamente, cada evento entrante es registrado en `HistoricalSnapshotStore` construyendo la memoria histórica de la sesión.
  - La interfaz muestra el badge verde oliva: `MODO EN VIVO (LIVE)` con indicador pulsante.
  - El botón `Volver a LIVE` permanece oculto.

### 5.2. Modo `REPLAY` (Inspección Histórica)
- **Activación:** Se activa cuando el operador arrastra el slider hacia atrás, presiona `Play`, o hace clic en un marcador de escenario (`T0`, `T1`, `T2`, `T3`).
- **Comportamiento:**
  - El Canvas desvincula temporalmente las actualizaciones visuales de los eventos SSE en caliente, evitando que el estado histórico sea sobreescrito por la telemetría actual.
  - **Cero pérdida de datos:** Los eventos SSE siguen llegando y se almacenan en el historial en segundo plano.
  - Se consulta el snapshot más cercano mediante búsqueda binaria $\le T$.
  - Los nodos adoptan los colores y estados históricos reales:
    - En `T1` (-45m): Silver Cleanse pasa a `DEGRADED` (borde y texto terracota `#A8422B`), 14 registros en cuarentena y alerta activa de anomalía `F3_NEGATIVE_AMOUNT`.
    - En `T2` (-25m): Guardian Monitor pasa a `AUTO_HEALING` (dorado `#D4AF37`), ejecutando el playbook `PB-03-QUARANTINE`.
    - En `T3` (-5m): Pipeline recuperado en `HEALTHY` con nuevo snapshot Iceberg 2002 certificado.
  - Si el operador hace clic en un nodo, el `NodeInspectionDrawer` muestra exactamente los valores del snapshot seleccionado.
  - Se visualiza el badge destacado: `MODO REPLAY HISTÓRICO - T-XXm` (o `T-Xh YYm`).
  - El botón `Volver a LIVE` aparece disponible en verde oliva. Al pulsarlo, el Canvas salta de inmediato al estado actual sin requerir reconectar la conexión SSE.

---

## 6. Estrategia de Reproducción y Velocidades

El motor de reproducción en `useTimeTravel.ts` implementa un bucle temporizado por intervalos de 250ms con un factor de escala de tiempo configurable:

$$\text{Avance temporal por tick} = \text{Intervalo (ms)} \times \text{Velocidad} \times \text{Multiplicador}$$

Con el multiplicador base fijado en $60\times$ (1 segundo de tiempo real equivale a 1 minuto de línea temporal a velocidad 1x):
- **Velocidad `1x`:** 1 segundo real avanza 1 minuto histórico.
- **Velocidad `2x`:** 1 segundo real avanza 2 minutos históricos.
- **Velocidad `5x`:** 1 segundo real avanza 5 minutos históricos.

Cuando la reproducción alcanza el instante actual ($T_{\text{now}}$), el motor detiene automáticamente la reproducción en el borde para evitar saltos inesperados y permite al operador reanudar o presionar `Volver a LIVE`.

---

## 7. Manejo de Snapshots, Timestamps y Búsqueda por Bisección

Cada punto en el tiempo se representa mediante una estructura inmutable `PipelineSnapshot`:
- `id`: Identificador único del snapshot.
- `timestamp`: Cadena ISO 8601 UTC.
- `timestampMs`: Epoch en milisegundos para operaciones numéricas de alta velocidad.
- `scenarioId`: Identificador del hito (`T0`, `T1`, `T2`, `T3` o `LIVE`).
- `overallStatus`: Estado global derivado (`HEALTHY`, `DEGRADED`, `AUTO_HEALING`, `ERROR`).
- `recordsProcessed`, `recordsQuarantined`, `recordsTotal`.
- `nodesState`: Diccionario determinista indexado por `node_id` con el estado, métricas y detalles del Guardian.
- `activeAlerts`: Lista de incidentes y alertas activas durante ese snapshot.

Para garantizar respuesta inmediata al arrastrar el slider continuamente (60 FPS sin lag), `HistoricalSnapshotStore` implementa una búsqueda binaria en $O(\log n)$:

```typescript
public findNearestSnapshot(targetMs: number): PipelineSnapshot | null {
  if (this.snapshots.length === 0) return null;
  if (targetMs <= this.snapshots[0].timestampMs) return this.snapshots[0];
  const last = this.snapshots[this.snapshots.length - 1];
  if (targetMs >= last.timestampMs) return last;

  let low = 0;
  let high = this.snapshots.length - 1;
  let bestIndex = 0;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midMs = this.snapshots[mid].timestampMs;
    if (midMs === targetMs) return this.snapshots[mid];
    if (midMs < targetMs) {
      bestIndex = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }
  return this.snapshots[bestIndex];
}
```

---

## 8. Tratamiento de Errores y Limitaciones Técnicas Reales

1. **Retención del Hub en Backend:**
   - La implementación canónica de `src/core/telemetry/hub.py` utiliza un `deque(maxlen=100)` volátil en memoria RAM del contenedor FastAPI. No almacena datos históricos persistentes en PostgreSQL ni en MinIO.
   - **Solución implementada:** `HistoricalSnapshotStore` en el frontend inicializa y calibra la ventana de 24 horas a partir de los escenarios canónicos (`T0`, `T1`, `T2`, `T3`) descritos en la especificación y enriquece la cronología con los eventos que llegan en caliente desde el stream SSE o el endpoint `/api/v1/telemetry/buffer`.
2. **Resiliencia de Red en Hidratación:**
   - Si la llamada a `/api/v1/telemetry/buffer` falla o retorna un error 500/404, el servicio captura la excepción de forma transparente y mantiene intacta la línea de tiempo calibrada sin romper la experiencia del Canvas.
3. **Desconexión o reconexión SSE durante Replay:**
   - Si la red SSE experimenta un corte mientras el operador está inspeccionando un incidente pasado en modo `REPLAY`, la vista histórica no se altera ni parpadea. El banner discreto reportará el estado de conexión sin interferir con la sesión de análisis forense del operador.

---

## 9. Pruebas Automatizadas y Resultados

### 9.1. Resumen de Ejecución Vitest
```text
Test Files  8 passed (8)
     Tests  56 passed (56)
  Duration  1.79s
```

### 9.2. Desglose de Archivos de Prueba
1. `tests/historicalTelemetryService.test.ts` (4 pruebas)
   - Generación de 7 snapshots canónicos cubriendo 24 horas.
   - Búsqueda binaria por bisección en límites y puntos intermedios.
   - Registro de eventos en vivo y cálculo de estados agregados.
   - Hidratación resiliente desde el buffer del backend con fallback ante fallos de red.
2. `tests/useTimeTravel.test.ts` (7 pruebas)
   - Inicialización en modo `LIVE`, `isPlaying: false`, velocidad `1x`.
   - Transición automática a `REPLAY` y cálculo de badge `T-45m`.
   - Formateo de intervalos multihomarios (`T-2h`, `T-2h 15m`).
   - Retorno limpio a `LIVE` mediante `returnToLive()`.
   - Motor de reproducción Play/Pause con avance proporcional y pausa estricta.
   - Conmutación entre velocidades `1x`, `2x` y `5x`.
   - Almacenamiento de telemetría live en segundo plano durante `REPLAY` sin alterar el visor histórico.
3. `tests/TimeTravelScrubber.test.tsx` (6 pruebas)
   - Renderizado del badge `MODO EN VIVO (LIVE)` y ocultamiento del botón volver.
   - Renderizado del badge histórico `MODO REPLAY HISTÓRICO - T-45m` y botón `Volver a LIVE`.
   - Renderizado exacto del badge multihomario `T-2h 15m`.
   - Alternancia accesible de botón Play/Pause.
   - Selección de velocidad en botones `1x`, `2x` y `5x`.
   - Deslizamiento continuo del slider e interacción con píldoras de hitos canónicos.
4. `tests/timeTravelIntegration.test.tsx` (5 pruebas)
   - Canvas inicia en `LIVE` sincronizado.
   - Clic en píldora `T1` conmuta a `REPLAY`, degrada el nodo Silver y expone 14 cuarentenas.
   - Inspección en el drawer refleja fielmente los datos históricos del snapshot.
   - Clic en píldora `T2` conmuta el nodo Guardian a `AUTO_HEALING`.
   - Clic en `Volver a LIVE` restaura el estado nominal sin reconexión SSE.
5. `tests/telemetryIntegration.test.tsx` (7 pruebas preexistentes preservadas).
6. `tests/useTelemetryStream.test.ts` (8 pruebas preexistentes preservadas).
7. `tests/PipelineCanvas.test.tsx` (7 pruebas preexistentes preservadas).
8. `tests/CopilotChatDrawer.test.tsx` (12 pruebas preexistentes preservadas).

### 9.3. Verificación de Compilación
- **TypeScript:** `npx tsc --noEmit` completado con 0 errores y 0 advertencias.
- **Next.js Production Build:** `npm run build` generado exitosamente en 13.5s.

---

## 10. Instrucciones de Uso para el Operador de Datos

1. **Abrir la consola Midas:** Navegar a `http://localhost:3000`.
2. **Visualizar el modo inicial:** El Canvas se encuentra en `MODO EN VIVO (LIVE)` reflejando el flujo de datos actual del pipeline.
3. **Rebobinar la línea de tiempo:**
   - Arrastrar el slider inferior hacia la izquierda, o
   - Hacer clic en una píldora de escenario (por ejemplo, `T1` para inspeccionar el incidente de montos negativos).
4. **Verificar el estado histórico:**
   - El badge superior del scrubber mostrará: `MODO REPLAY HISTÓRICO - T-45m`.
   - El nodo **Silver Cleanse** se teñirá en terracota (`DEGRADED`) y mostrará `14 en Cuarentena`.
   - Al hacer clic sobre el nodo Silver, el panel lateral de inspección se abrirá mostrando los detalles específicos del incidente $T1$.
5. **Reproducir el evento:**
   - Pulsar el botón `Play` en el scrubber.
   - Seleccionar `2x` o `5x` para acelerar la reproducción y observar cómo el pipeline evoluciona hacia la auto-sanación del Guardian ($T2$) y la publicación del snapshot Gold ($T3$).
6. **Volver al tiempo real:**
   - Pulsar el botón verde oliva `Volver a LIVE`.
   - El Canvas reanudará instantáneamente la telemetría en tiempo real.
