# Midas — Auditoría e Integración Quirúrgica de Integridad de Datos y Eliminación Total de Mocks del Frontend

**ID Tarea**: FRONT-INTEGRITY-ZERO-MOCKS-12  
**Fecha**: 2026-10-23  
**Área**: Frontend & Data Synchronization  
**Rama**: `feature/lakehouse-resilient-connections-catalog`  
**Estado**: COMPLETADO (151/151 pruebas unitarias pasando, build producción Next.js 14 exitoso)

---

## 1. Diagnóstico del Problema Raíz

Durante la auditoría exhaustiva de la interfaz se detectaron las siguientes fuentes de datos sintéticos y desincronización:
1. **Discrepancia Fuente vs Bronze**:
   - `initialTopology.ts` contenía cifras fijas históricas heredadas de un demo sintético (`recordsIn: 6690`, `recordsOut: 6676`, `quarantinedRecords: 14`) para los nodos `bronze_raw`, `silver_cleansing`, `guardian_monitor` y `gold_marts`.
   - Al registrar una nueva fuente (ej. subida de CSV o PostgreSQL personalizado), el nodo origen se instanciaba en estado inicial con `recordsOut: 0` y `status: 'HEALTHY'`, mientras las etapas Medallion mostraban los `6,690` registros ficticios precargados en el estado local.
2. **Fallbacks silenciosos en QuickConnectionModal y NodeInspectionDrawer**:
   - Si una conexión no tenía un `connection_id` resuelto, se asignaba automáticamente a conexiones mock predeterminadas (`conn_pg_crm_default`, etc.), provocando que la ejecución disparase pipelines sobre datos del CRM demo en vez de los datos ingresados por el usuario.
3. **Animación engañosa de partículas**:
   - Los edges de ReactFlow mantenían partículas fluyendo sin que se hubiese ejecutado una ingesta real para la sesión activa.
4. **Desconexión entre ejecución y persistencia de sesión**:
   - Al ejecutar el pipeline desde `NodeInspectionDrawer`, el resultado de la ejecución no actualizaba sincrónicamente los nodos Medallion en el canvas ni persistía la topología ejecutada en la sesión (`/api/v1/sessions/{id}/canvas`).

---

## 2. Modificaciones Quirúrgicas Realizadas

### A. Tipado y Registro de Estados (`src/frontend/types/canvas.ts`)
- Se incorporó formalmente el estado `'STANDBY'` a `NodeStatus` y al `NODE_STATUS_REGISTRY`.
- Configuración visual estricta y sobria: fondo `#F7F7F5`, borde `#E8E4DC`, texto `#787164`, badge `'En Espera'`.

### B. Desacoplamiento de Topología Inicial (`src/frontend/components/canvas/topology/initialTopology.ts`)
- `CANONICAL_STAGE_NODES` y `CANONICAL_STAGE_EDGES` inicializan en `status: 'STANDBY'`.
- `recordsIn` y `recordsOut` se inicializan en `undefined` (no en valores numéricos falsos).
- `quarantinedRecords: 0`, playbook en espera `'PB-03-STANDBY'`.
- Todos los edges canónicos inicializan con `animated: false`, `volume: 0`, `recordsPerSecond: 0`.

### C. Conexión de Fuentes Honesta (`src/frontend/components/workspace/QuickConnectionModal.tsx`)
- Los nuevos nodos de fuente inician en `status: 'STANDBY'`, `recordsIn: undefined, recordsOut: undefined`.
- Eliminación de fallbacks a IDs demo (`conn_pg_crm_default`).
- El edge que une la nueva fuente con `bronze_raw` nace en `STANDBY` sin partículas animadas ficticias.

### D. Renderizado de Nodos y Edges (`StageNode.tsx`, `GuardianNode.tsx`, `SourceNode.tsx`, `DataFlowEdge.tsx`)
- **StageNode / SourceNode**: Renderizan la etiqueta `"Pendiente"` si están en `'STANDBY'` y sus registros son indefinidos, evitando el engañoso `"0 filas emitidas"` o `"6990"`. El color del badge es reactivo al estado real (`statusConfig`).
- **GuardianNode**: Badge dinámico, estado `'En Espera'` con `0` anomalías mientras no se haya ejecutado ingesta con registros en cuarentena.
- **DataFlowEdge**: Supresión rigurosa del flujo de partículas SVG si `status === 'STANDBY'` o `volume === 0 && recordsPerSecond === 0`.

### E. Transmisión Real y Persistencia Multisesión (`NodeInspectionDrawer.tsx`, `PipelineCanvas.tsx`)
- Se implementó el callback `onPipelineExecuted` en `NodeInspectionDrawer`, pasando el `PipelineTriggerResultDTO` completo recibido de `POST /api/v1/pipelines/trigger`.
- En `PipelineCanvas.tsx`, al recibir `onPipelineExecuted`, se actualizan sincrónicamente:
  - Nodo fuente: `recordsOut = ingested`, `status = 'HEALTHY'`.
  - `bronze_raw`: `recordsIn = ingested`, `recordsOut = ingested`, `status = 'HEALTHY'`.
  - `silver_cleansing`: `recordsIn = ingested`, `recordsOut = cleaned`, `quarantinedRecords = quarantined`.
  - `guardian_monitor`: `recordsIn = quarantined`, `recordsOut = quarantined`, `status = quarantined > 0 ? 'AUTO_HEALING' : 'HEALTHY'`.
  - `gold_marts`: `recordsIn = cleaned`, `recordsOut = gold_records_generated`.
  - Edges: se activan (`animated: true`) reflejando el volumen real de la ejecución.
  - La topología resultante se persiste de inmediato en PostgreSQL vía `onTopologyChange(nextNodes, nextEdges)`.
- Se agregó persistencia debounced (1500 ms) en el procesamiento de eventos SSE por rAF para asegurar que la telemetría en vivo permanezca guardada en la sesión.

### F. Copiloto Agéntico (`useCopilotChat.ts` y tests)
- Se eliminó del mensaje de bienvenida la lista fija de fuentes que afirmaba que `crm_operaciones`, `Presupuesto_Corporativo_2026.xlsx` y `helpdesk_tickets_live` estaban activas en la sesión del usuario.

---

## 3. Verificación y Resultados

1. **Vitest Unit Tests**:
   - `151 passed (151)` en 14 suites (`tests/PipelineCanvas.test.tsx`, `tests/CopilotChatDrawer.test.tsx`, `tests/telemetryIntegration.test.tsx`, etc.).
2. **Next.js Production Build**:
   - `npm run build` completado exitosamente (código 0).
   - Generación de rutas estáticas `4/4` sin advertencias de tipos TypeScript.
3. **Docker Compose & Contenedores**:
   - Contenedor `midas-frontend` actualizado y corriendo en `http://localhost:3000`.
   - Contenedor `midas-api` healthy en `http://localhost:8000`.
   - API de sesiones y pipeline respondiendo con normalidad.
