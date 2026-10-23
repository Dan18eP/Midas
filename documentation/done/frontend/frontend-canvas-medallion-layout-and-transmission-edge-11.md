# Alineación Canónica en Columnas Medallion, Transmisión Bronze y Resiliencia con Midas Guardian

> **Entrega:** HU-FRONT-08 / HU-LAKE-06 (Topología de Canvas, Animación de Streaming de Fuentes y Resiliencia Guardian)  
> **Rama Git:** `feature/lakehouse-resilient-connections-catalog`  
> **Fecha:** 23-10-2026

---

## 1. Problemas Detectados

1. **Desconexión y Falta de Animación:** Al agregar una nueva fuente de datos (Excel, CSV, REST API o Base de Datos), el nodo se creaba sin su arista (`edge`) hacia la capa `bronze_raw`. Como resultado, la fuente flotaba aislada sin partículas de transmisión activa (`DataFlowEdge` con `animated: true`), dando la falsa impresión de estar desconectada del Lakehouse.
2. **Posición Arbitraria y Superposición:** Nuevas fuentes se posicionaban en `{ x: 80, y: 150 }`, colisionando con fuentes de demostración existentes y rompiendo la cuadrícula vertical de la columna de Fuentes (`x: 40`).
3. **Desplazamiento a Banda Inferior (`y: 620`):** Al ejecutar el pipeline o crearse etapas dinámicas, `dynamicNodePosition` las ordenaba en filas de 3 en una franja inferior rígida a partir de `y: 620`, desconociendo las columnas Medallion (`Source`, `Bronze`, `Silver`, `Gold`).
4. **Estado Estático en `SourceNode`:** La píldora de estado de `SourceNode` tenía estilos CSS estáticos (`#4D7C0F`) en lugar de responder a `statusConfig` dinámico (`RUNNING`, `HEALTHY`, `DEGRADED`), no reflejando el pulso en vivo durante la ejecución del pipeline.
5. **Omisión de Midas Guardian en Lotes Íntegros:** El backend emitía telemetría para `guardian_monitor` únicamente si `records_quarantined_count > 0`. Si el dataset estaba 100% sano, no se emitía evento para Guardian y el modal `QuickConnectionModal` no preservaba el esqueleto canónico, dejando fuera el nodo centinela de resiliencia y WAP Gatekeeper.
6. **Contaminación de Fuentes Demo en Nuevas Sesiones:** Al crear una nueva sesión desde el modal o al ingresar un archivo, `QuickConnectionModal` arrastraba las tres fuentes de demostración (`source_postgres`, `source_excel`, `source_api`) desde `INITIAL_CANVAS_NODES`, impidiendo que cada sesión tuviera un pipeline exclusivo y limpio para el dataset ingresado por el usuario.

---

## 2. Soluciones Implementadas

### 2.1 Aislamiento Estricto de Fuentes por Sesión (`QuickConnectionModal.tsx` & `initialTopology.ts`)
- Se definieron y exportaron `CANONICAL_STAGE_NODES` (`bronze_raw`, `silver_cleansing`, `guardian_monitor`, `gold_marts`) y `CANONICAL_STAGE_EDGES` de forma independiente a las fuentes demo.
- Al iniciar una **nueva sesión** (`!activeSessionId`), el pipeline se construye **única y exclusivamente con la fuente ingresada por el usuario**, posicionada horizontalmente alineada a la capa Bronze en `{ x: 40, y: 240 }`, conectada a `bronze_raw` con arista animada de datos en tránsito.
- Se eliminan por completo las fuentes demo (`source_postgres`, `source_excel`, `source_api`) y sus aristas asociadas de toda nueva sesión.
- En `SessionContext.tsx`, `startNewSession()` limpia `lastTopologyRef.current` para garantizar que no se hereden topologías residuales de sesiones anteriores.

### 2.2 Colocación Ordenada y Conexión Automática a Bronze Raw (`QuickConnectionModal.tsx`)
- Se calcula la coordenada vertical `y: maxY + 180` dinámicamente en la columna de fuentes `x: 40` para fuentes adicionales dentro de la misma sesión.
- Se genera y persiste automáticamente la arista `edge_${nodeId}_bronze` conectada a `bronze_raw` con `type: 'dataflow'`, `animated: true`, flecha indicadora y métrica inicial en cero (`Conexión activa`) hasta que se active la ejecución real.

### 2.3 Distribución Canónica de Columnas Medallion (`PipelineCanvas.tsx`)
- Se implementó `getColumnNodePosition(subType, currentNodes)` para sustituir la rejilla de banda inferior. Mapea limpiamente las columnas:
  - `source`: `x: 40`
  - `bronze`: `x: 400`
  - `silver` / `guardian`: `x: 760`
  - `gold`: `x: 1120`
- Se derivan dinámicamente aristas de conexión entre etapas según su jerarquía Medallion (`LAYER_PARENT_BY_SUBTYPE`), incluyendo `guardian: 'silver_cleansing'` con trazado discontinuo de cuarentena (`#C86A43`).

### 2.4 Animación de Partículas SVG con Borde de Alto Contraste (`DataFlowEdge.tsx`)
- Se activó `animated: true` en todas las aristas del Lakehouse (incluyendo Gatekeeper y Cuarentena).
- En `DataFlowEdge.tsx`, las partículas SVG se renderizan con radio `3.5px`, color contextual y borde blanco (`stroke="#FFFFFF" strokeWidth="0.75"`), otorgando un trazado visual fluido y claramente visible sobre el canvas.

### 2.5 Telemetría SSE en Backend y WAP Gatekeeper (`src/api/routes/pipelines.py`)
- El endpoint `POST /api/v1/pipelines/{connection_id}/trigger`:
  - Emite el primer evento SSE con `status=NodeStatus.RUNNING` para feedback instantáneo en UI.
  - Emite telemetría permanente para `guardian_monitor`:
    - En caso de anomalías (`records_quarantined > 0`): `NodeStatus.AUTO_HEALING` con playbook `PB-03-QUARANTINE`.
    - En caso de lote íntegro (`records_quarantined == 0`): `NodeStatus.HEALTHY` con playbook `PB-03-STANDBY` y confirmación de contrato WAP intacto.
  - Emite `NodeStatus.HEALTHY` final en la fuente con los registros consolidados.

---

## 3. Verificación de Calidad

| Prueba | Comando / Herramienta | Resultado |
|---|---|---|
| Tests Frontend | `npm test` en `src/frontend` | 14/14 suites, 150/150 tests aprobados |
| Compilación Frontend | `npm run build` en `src/frontend` | Compilado exitosamente sin errores |
| Tests Backend | `pytest` en `midas-api` | 179/179 tests aprobados |
| Healthcheck Containers | `curl /health` (API) & HTTP 200 (Frontend) | Ambos servicios saludables |
| Aislamiento de Sesión | Creación de nueva sesión | Solo contiene la fuente del usuario + etapas Medallion |
