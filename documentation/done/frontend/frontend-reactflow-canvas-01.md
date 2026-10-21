# HU-FRONT-01: React Flow Interactive Pipeline Canvas & Live Node Topologies

- **ID de la Historia:** `HU-FRONT-01`
- **Título Oficial:** React Flow Canvas Base & Nodos Topológicos
- **Rama Oficial:** `feature/frontend-reactflow-canvas`
- **Responsable:** Dilan Chávez (`dilandcv`) — Frontend Lead & Real-Time Canvas Architect
- **Pair / Revisor:** Joshua Gonzales — UI/UX Specialist
- **Squad:** Squad 2 — Frontend & Real-Time Canvas
- **Fecha de Entrega:** 18 de Octubre de 2026
- **Story Points:** 5 SP (MUST HAVE)
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md)
  - [`documentation/canonical/02_mvp_dorado_blueprint_global.md`](../../canonical/02_mvp_dorado_blueprint_global.md)
  - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../canonical/04_logica_de_negocio_y_resiliencia_guardian.md)
  - [`documentation/adr/ADR-003-transporte-telemetria-sse-vs-kafka-websockets.md`](../../adr/ADR-003-transporte-telemetria-sse-vs-kafka-websockets.md)
  - [`src/core/telemetry/events.py`](../../../src/core/telemetry/events.py)

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **1. Workspace Next.js 14 / React 18 / TypeScript / Tailwind** | ✅ Cumplido | Inicializado en `src/frontend/` con dependencias optimizadas (`@xyflow/react`, `lucide-react`, `tailwindcss`, `vitest`). Compilación de producción con `next build` exitosa (Ruta `/` 67.6 kB). |
| **2. Canvas React Flow interactivo con controles y minimap** | ✅ Cumplido | `PipelineCanvas.tsx` envuelto en `ReactFlowProvider` con `Background` tipo dots, `Controls` interactivos (Zoom/FitView) y `MiniMap` temático oscuro con codificación de color por tipo de nodo. |
| **3. Topología de nodos heterogéneos y capas Medallón** | ✅ Cumplido | Topología determinista en `initialTopology.ts`: 3 Fuentes (`source_postgres`, `source_excel`, `source_api`), 3 Capas Medallón (`bronze_raw`, `silver_cleansing`, `gold_marts`) y 1 Nodo de Resiliencia (`guardian_monitor`). |
| **4. Componentes de nodo personalizados accesibles** | ✅ Cumplido | `SourceNode.tsx`, `StageNode.tsx` y `GuardianNode.tsx` con badges de estado canónicos, métricas en vivo, sub-etiquetas, soporte ARIA y anillos de selección. |
| **5. Cobertura de los 5 estados canónicos + UNKNOWN** | ✅ Cumplido | Registro centralizado `NODE_STATUS_REGISTRY` en `src/frontend/types/canvas.ts` con estilos, textos accesibles y animaciones para `HEALTHY`, `RUNNING`, `IN_PROGRESS`, `DEGRADED`, `AUTO_HEALING`, `ERROR` y `UNKNOWN`. |
| **6. Edges personalizados con flujo visual y bifurcación** | ✅ Cumplido | `DataFlowEdge.tsx` renderizando etiquetas de tráfico y partículas SVG ilustrativas; soporta conexión normal verde (`#10B981`) y bifurcación discontinua de cuarentena hacia Guardian (`#F59E0B`). |
| **7. Drawer colapsable de inspección (`NodeInspectionDrawer`)** | ✅ Cumplido | Panel lateral deslizable que presenta identificadores, contratos de catálogo/S3, métricas, diagnósticos de Guardian (Playbook, anomalía) y parámetros de configuración con botón de cierre y atajo accesible. |
| **8. Suite de pruebas automatizadas pasando al 100%** | ✅ Cumplido | 7 pruebas unitarias en `src/frontend/tests/PipelineCanvas.test.tsx` verificando renderizado, selección, apertura de drawer, nodos personalizados, alertas de cuarentena y fallbacks seguros. |

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero desvío de fórmulas de negocio:** La interfaz no altera ni aproxima métricas; se respetan las definiciones canónicas de `documentation/canonical/04_logica_de_negocio_...md`.
- [x] **Compatibilidad exacta de contratos:** Los IDs de nodos (`source_postgres`, `bronze_raw`, `silver_cleansing`, `guardian_monitor`, `gold_marts`) y tipos de datos coinciden carácter por carácter con `src/core/telemetry/events.py` y `documentation/canonical/05_...md`.
- [x] **Single-Area Ownership:** Se mantuvo el 100% del código confinado en `src/frontend/` (y `package.json` de orquestación local). Cero modificaciones en `src/agent/`, `src/lakehouse/`, `docker/` ni en áreas de otros squads.
- [x] **Sin colisiones ni code drift:** Ninguna dependencia de UI o CSS global afecta a módulos externos.

---

## 3. Detalle de la Implementación Técnica

### 3.1. Tipos Canónicos (`src/frontend/types/canvas.ts`)
- `NodeStatus`: Union type exacto de `NodeStatus` de FastAPI (`HEALTHY`, `RUNNING`, `DEGRADED`, `ERROR`, `IN_PROGRESS`, `AUTO_HEALING`, `UNKNOWN`).
- `AnomalyType`: Códigos de anomalía de Midas Guardian (`F1_DUPLICATE_KEY` a `F5_ORPHAN_FOREIGN_KEY`).
- `GuardianDetails`: Información estructurada del playbook (`PB-01` a `PB-05`), filas en cuarentena y mensaje diagnóstico.
- `MidasNodeData`: Interfaz completa que parametriza los datos consumidos por los nodos de React Flow.
- `NODE_STATUS_REGISTRY`: Diccionario inmutable con clases Tailwind, etiquetas en español y descripciones accesibles.

### 3.2. Topología Determinista (`src/frontend/components/canvas/topology/initialTopology.ts`)
- Posicionamiento espacial equilibrado de izquierda a derecha (Sources $x=40$, Bronze $x=400$, Silver $x=760$, Gold $x=1120$, Guardian flotante inferior $x=760, y=460$).
- 7 conexiones de datos (`INITIAL_CANVAS_EDGES`):
  - Ingesta multi-fuente hacia `bronze_raw`.
  - Transformación PySpark hacia `silver_cleansing`.
  - Promoción certificada WAP hacia `gold_marts`.
  - Desvío de incidentes hacia `guardian_monitor`.
  - Verificación WAP Gatekeeper desde `guardian_monitor` a `gold_marts`.

### 3.3. Componentes Visuales del Canvas (`src/frontend/components/canvas/`)
- `PipelineCanvas.tsx`: Orquestador principal con `ReactFlowProvider`, manejo de selección de nodos, deselección en pane click y contadores en tiempo real.
- `CanvasControls.tsx`: Barra superior interna que muestra la proporción de nodos activos (`7/7 Activos`), botón `Centrar` (`fitView`), `Restablecer` y badge `WAP Protected`.
- `nodes/SourceNode.tsx`: Nodos con iconografía Lucide (`Database`, `FileSpreadsheet`, `Globe`), latencia y filas emitidas.
- `nodes/StageNode.tsx`: Nodos Medallón con identificador de catálogo Iceberg (`catalogTable`), paths S3, badges de capa y alerta visual de cuarentena.
- `nodes/GuardianNode.tsx`: Nodo de auto-sanación con indicador de Playbook activo (`PB-03-QUARANTINE`), animación de pulso y conteo de filas aisladas.
- `edges/DataFlowEdge.tsx`: Conector curvo con animación de partículas SVG y badge flotante de volumen.
- `NodeInspectionDrawer.tsx`: Drawer lateral derecho con métricas, contratos de almacenamiento y diagnósticos de resiliencia.

### 3.4. Consola Maestro (`src/frontend/app/page.tsx`)
- Estructura dividida de dos paneles según `05_arquitectura_frontend_y_experiencia_canvas.md`:
  - Panel izquierdo (65%): Canvas topológico interactivo en vivo.
  - Panel derecho (35%): Espacio reservado y preparado para el Copiloto Agéntico (Joshua Gonzales en `HU-FRONT-04` y Elian Rivera en `HU-AI-01`).
  - Cabecera: Marca Midas, placeholders de la barra Replay (para `HU-FRONT-03`) y Lente Zero-Trust (para `HU-FRONT-05`).

---

## 4. Verificación y Pruebas Automatizadas

### 4.1. Suite de Pruebas Unitarias
Ejecutada con Vitest y Testing Library sobre JSDOM:

```bash
npm run test -- src/frontend/tests/PipelineCanvas.test.tsx
```

**Resultado:**
```text
 ✓ src/frontend/tests/PipelineCanvas.test.tsx (7 tests)
   ✓ PipelineCanvas Core Component & Node Topologies (3)
     ✓ 1. Renderiza el contenedor principal y los controles de topología
     ✓ 2. Renderiza todos los 7 nodos deterministas canónicos de la arquitectura
     ✓ 3. Abre el NodeInspectionDrawer al hacer clic en un nodo y permite cerrarlo
   ✓ Custom Node Components Unit Verification (4)
     ✓ 4. SourceNode renderiza metadatos y estado HEALTHY correctamente
     ✓ 5. StageNode muestra alerta de cuarentena en Silver cuando quarantinedRecords > 0
     ✓ 6. GuardianNode muestra Playbook activo y estado AUTO_HEALING
     ✓ 7. NodeInspectionDrawer gestiona datos vacíos o ausentes de forma elegante (Fallback seguro)

 Test Files  1 passed (1)
      Tests  7 passed (7)
   Duration  7.35s
```

### 4.2. Verificación de Tipos TypeScript
```bash
npm run lint
```
**Resultado:** `tsc --noEmit` completado con exit code 0 y cero errores de tipo.

### 4.3. Verificación de Compilación de Producción
```bash
npm run build
```
**Resultado:** Next.js 14 compiló exitosamente todas las rutas estáticas (`/` y `/_not-found`) sin advertencias bloqueantes.

---

## 5. Coordinación y Preparación para Futuras Historias

- **Para `HU-FRONT-02` (Consumo SSE & Flujo Partículas - Dilan Chávez):**
  - La estructura de nodos `Node<MidasNodeData>` está lista para recibir mutaciones desde el hook `useTelemetryStream` conectando a `GET /api/v1/telemetry/stream`.
  - `DataFlowEdge` admite modificar props `animated` y `data.volume` de forma reactiva sin re-renderizar la topología.
- **Para `HU-FRONT-03` (Time-Travel Replay Scrubber - Dilan Chávez):**
  - La topología es determinista y desacoplada de variables globales; permite reemplazar el set de nodos con instantáneas de escenarios `T0`, `T1`, `T2`, `T3` generadas por `src/core/telemetry/scenarios.py`.
- **Para `HU-FRONT-04` y `HU-FRONT-06` (Copiloto Agéntico & Drawer Linaje - Joshua Gonzales):**
  - El layout maestro en `src/frontend/app/page.tsx` deja la columna lateral de 420px lista para alojar el chat conversacional y el componente ECharts sin colisiones de estilo.
