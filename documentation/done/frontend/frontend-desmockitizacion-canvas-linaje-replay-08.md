# HU-FRONT-08: Desmockitización Total del Canvas, Linaje y Time-Travel Replay

- **ID de la Historia:** `HU-FRONT-08`
- **Título Oficial:** Desmockitización Total del Canvas, Linaje y Time-Travel Replay
- **Rama Oficial:** `feature/frontend-desmockitizacion-canvas-linaje-replay`
- **Responsable:** Joshua Gonzales (`Jgonzalez-2005`) — Frontend & Real-Time Canvas
- **Autoridad Técnica del Contrato:** Daniel Echeverría (Backend Lead & Arquitecto)
- **Squad:** Squad 2 — Frontend & Real-Time Canvas
- **Fecha de Entrega:** Miércoles 21 de Octubre de 2026
- **Story Points:** 4 SP (P1)
- **Issue Oficial:** [#45](https://github.com/Dan18eP/Midas/issues/45)
- **Documentos Canónicos de Referencia:**
  - [`documentation/adr/ADR-010-workspace-conversacional-multi-sesion-frontend.md`](../../adr/ADR-010-workspace-conversacional-multi-sesion-frontend.md)
  - [`documentation/06_nuevo_backlog_mvp_dorado.md`](../../06_nuevo_backlog_mvp_dorado.md) (§5.7)
  - [`documentation/reviews/auditoria_integral_arquitectura_y_mvp_dorado.md`](../../reviews/auditoria_integral_arquitectura_y_mvp_dorado.md) (§5)
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md) (§2.3, §3.1, §3.2, §4.1 — **enmendado en esta entrega**)
  - [`documentation/adr/ADR-003-transporte-telemetria-sse-vs-kafka-websockets.md`](../../adr/ADR-003-transporte-telemetria-sse-vs-kafka-websockets.md)
  - [`documentation/adr/ADR-006-gobernanza-activa-escudo-pii-y-lente-zero-trust.md`](../../adr/ADR-006-gobernanza-activa-escudo-pii-y-lente-zero-trust.md)
  - [`src/core/telemetry/events.py`](../../../src/core/telemetry/events.py) · [`src/api/routes/telemetry.py`](../../../src/api/routes/telemetry.py) · [`src/api/routes/lineage.py`](../../../src/api/routes/lineage.py) · [`src/api/routes/auth.py`](../../../src/api/routes/auth.py) · [`src/agent/tools/dag_generator.py`](../../../src/agent/tools/dag_generator.py)

---

## 0. Nota de Auditoría Previa (Fase A)

La auditoría architectural del 20-Oct-2026 (`auditoria_integral_arquitectura_y_mvp_dorado.md` §5) declaró que el Canvas, el linaje, el Time-Travel y la Lente Zero-Trust dependían de mocks porque **los endpoints backend no existían**. Esa fotografía quedó desactualizada: `HU-BACK-03` (Daniel Echeverría) y `HU-GOV-01` (Sebastian Castiblanco) ya estaban mergeados en `develop` al iniciar esta entrega.

Verificación previa en el código real del backend:

| Contrato exigido por la HU | Estado real al iniciar | Evidencia |
| :--- | :---: | :--- |
| `GET /api/v1/telemetry/history` | **Existía** | `src/api/routes/telemetry.py:121-169` (`TelemetryHistoryResponse`) |
| `GET /api/v1/lineage/table/{table}` | **Existía** | `src/api/routes/lineage.py:50-91` (`LineagePayloadResponse`) |
| `GET /api/v1/auth/roles` | **Existía** | `src/api/routes/auth.py:74-82` (`CANONICAL_ROLES`) |
| Evento SSE `NEW_GOLD_NODE_AVAILABLE` | **Existía** | `src/agent/tools/dag_generator.py:77-83` (`details.event_type`) |
| Evento SSE de **conexiones/aristas** | **No existía** | Ningún campo `source`/`target` en `TelemetryEvent` |

**Conclusión de auditoría:** el trabajo NO consistía en construir infraestructura de backend, sino en **eliminar los mocks de runtime del frontend y cablear los contratos reales ya disponibles**. Esa distinción definió todo el alcance.

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **Nuevos nodos creados en caliente se renderizan en el Canvas sin recargar** | ✅ Cumplido | `PipelineCanvas.tsx` incorpora al estado del grafo todo `node_id` desconocido cuyo evento cumple el contrato `TelemetryEvent`. La capa se deduce de `details.event_type === 'NEW_GOLD_NODE_AVAILABLE'` y de `details.output_table`; el nodo se representa como `stage`/`gold` reutilizando `StageNode` (sin tocar los nodos personalizados). El `append` preserva nodos, aristas, posiciones, selección y viewport. Pruebas: `telemetryIntegration.test.tsx` casos **8, 9, 11, 12, 13**. |
| **Scrubber de Time-Travel consume eventos reales de FastAPI** | ✅ Cumplido | `historicalTelemetryService.ts` deja de fabricar: el store arranca **vacío** y se hidrata con `GET /api/v1/telemetry/history` (`hydrateFromHistory`). Los estados `loading` / `ready` / `empty` / `error` son de primera clase y se comunican en el scrubber. Pruebas: `historicalTelemetryService.test.ts` casos **4, 5, 6, 7**; `contractClients.test.ts` casos **1–8**. |
| **Drawer "Explícame esta cifra" muestra el linaje certificado retornado por el backend** | ✅ Cumplido | `resolveLineage.ts` elimina `LAYER_FALLBACK`. Sin respuesta del gateway, el resultado se marca `provenance: 'uncertified'`, con `qualityPercent: null` y sin el resumen "100% Contratos de Datos Certificados (OpenMetadata)". Pruebas: `ExplainNumberDrawer.test.tsx` casos **6, 7, 7b, 11, 12, 13**. |
| **Enmascaramiento real de Trino vía roles** | ✅ Cumplido (con limitación documentada) | `ZeroTrustLens.tsx` elimina `pepe@riwi.io`, `u****@riwi.io`, `$85.000` y las visibilidades inventadas `64%`/`82%`. Las identidades, los nodos permitidos/bloqueados y la política declarada provienen de `GET /api/v1/auth/roles`. Pruebas: `ZeroTrustLens.test.tsx` casos **4, 5, 6, 6b, 11, 12**; `contractClients.test.ts` casos **9–12**. |
| **Aislamiento Estricto y No-Interferencia** | ✅ Cumplido | Diff confinado a `src/frontend/**` + `documentation/**`. **Cero** archivos backend modificados. Suite completa: **109/109** en verde. Ver §6 y §7. |

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero alteración de lógica de negocio, fórmulas o contratos backend.** No se modificó ningún archivo bajo `src/api/`, `src/core/`, `src/agent/`, `src/lakehouse/`, `src/orchestration/`, `src/security_governance/` ni `docker/`. Los tres endpoints se **consumieron** tal como estaban.
- [x] **Document First, Code Second (`rules/01` §2).** `documentation/canonical/05` fue enmendado **antes** de escribir código, con tres reglas nuevas: §2.3 (Nodos Dinámicos Debutados por SSE), §3.1 (Regla de fuente de verdad del Replay), §3.2 (Regla de evidencia Zero-Trust) y §4.1 (Regla de certificación del linaje).
- [x] **Fórmulas canónicas intocables.** `canonicalMetrics.ts` (espejo del doc canónico 04) se **reutilizó**, no se alteró. Ninguna fórmula fue recalculada ni reinterpretada.
- [x] **Sin "Hidden Features".** No se inventaron endpoints, campos JSON, estados de certificación ni eventos SSE. Cada payload consumido está verificado contra el código del backend.
- [x] **Single-Area Ownership respetado al 100%.** Todos los cambios residen en `src/frontend/` (área `frontend`, propiedad compartida Dilan Chávez / Joshua Gonzales según la skill) y en `documentation/`.
- [x] **Sin merge directo a `develop`.** La entrega vive en la rama `feature/frontend-desmockitizacion-canvas-linaje-replay`. **No se realizó commit ni push**: quedan pendientes de autorización explícita del responsable.
- [x] **Registro de entrega.** El presente documento en `documentation/done/frontend/` y la entrada de bitácora en `documentation/changelog/21-10-2026-changelog.md`.

---

## 3. Mocks y Fallbacks Eliminados del Flujo Productivo

| Símbolo | Ubicación | Categoría | Destino |
| :--- | :--- | :---: | :--- |
| `LAYER_FALLBACK` | `components/lineage/resolveLineage.ts` | Fallback de producción | **Eliminado**. Los títulos por capa se derivan de la tabla canónica `LAYER_TITLES`; `table`/`location` son obligatorios y una etapa incompleta se descarta. |
| `CANONICAL_QUALITY_PERCENT` / `CANONICAL_QUALITY_SUMMARY` | `components/lineage/resolveLineage.ts` | Fallback de producción | **Eliminados**. Sustituidos por `UNCERTIFIED_QUALITY_SUMMARY` y `UNREPORTED_QUALITY_SUMMARY`. |
| `buildFallbackLineage()` | `components/lineage/resolveLineage.ts` | Fallback de producción | **Renombrada** a `buildUncertifiedLineage()`: sin calidad `100%`, sin resumen OpenMetadata, `provenance: 'uncertified'`. |
| `resolveGoldTable()` → `'gold.fact_ventas'` por defecto | `components/lineage/resolveLineage.ts` | Fallback silencioso | **Eliminado**. Sin `goldTableHint` ni métrica canónica **no se consulta ningún endpoint**. |
| `createCanonicalSnapshots()` en el flujo productivo | `services/historicalTelemetryService.ts` | Mock de runtime | **Dejado de invocarse en producción**. Conservado **exclusivamente** como fixture de pruebas (`seedCanonicalScenarios()`). |
| `HistoricalSnapshotStore.initialize()` | `services/historicalTelemetryService.ts` | Mock de runtime | **Renombrada** a `seedCanonicalScenarios()` y **eliminada del constructor**: el store (incluido el singleton) arranca vacío. |
| `hydrateFromBuffer()` (`/api/v1/telemetry/buffer`) | `services/historicalTelemetryService.ts` | API muerta / endpoint equivocado | **Eliminada**. Toda la hidratación se concentra en `/api/v1/telemetry/history`. |
| `createBaseNodesState()` como base productiva | `services/historicalTelemetryService.ts` | Fallback de producción | **Dejado de usarse** en producción; se conserva como fixture de pruebas. |
| `pepe@riwi.io`, `u****@riwi.io`, `$85.000`, `****` | `components/security/ZeroTrustLens.tsx` | Mock de runtime (PII ficticia) | **Eliminados**. La tarjeta muestra la política declarada y califica la evidencia. |
| `visibility: '64%' / '82%'` | `components/security/ZeroTrustLens.tsx` | Mock de runtime (dato inventado) | **Eliminados**. Sustituidos por el conteo real de nodos (`N/M nodos`) derivado del backend. |
| `isNodeMasked()` con IDs hardcodeados | `components/canvas/PipelineCanvas.tsx` | Fallback de producción contradictorio | **Reemplazado** por `allowed_nodes`/`locked_nodes` del backend. El hardcode queda como **respaldo declarado** y único. |
| Banner "· Políticas Ranger activas" | `components/canvas/PipelineCanvas.tsx` | Afirmación de seguridad sin evidencia | **Reemplazado** por "Política declarada por el catálogo de identidades" / "Sin catálogo de identidades: política local de respaldo". |

### Mocks legítimamente conservados

- `createCanonicalSnapshots()` y `createBaseNodesState()` como **fixtures de pruebas** (no invocados en producción).
- `src/frontend/app/api/v1/telemetry/stream/route.ts` — mock SSE local de respaldo; `.env` ya apunta al backend real (`NEXT_PUBLIC_SSE_URL`).
- `src/core/telemetry/scenarios.py` — escenarios canónicos del backend (área backend, no modificada).
- Todos los fixtures de test: `vi.mock('@xyflow/react')`, `MockEventSourceIntegration`, `fetchMock`, `GATEWAY_LINEAGE_PAYLOAD`, `MockResizeObserver`.

---

## 4. Contratos Integrados

### 4.1 SSE → grafo dinámico

```
FastAPI  GET /api/v1/telemetry/stream
         event: telemetry | data: {TelemetryEvent} | id: {event_id}
           │  details.event_type = "NEW_GOLD_NODE_AVAILABLE"
           │  details.output_table = "gold.<slug>"   node_id = "gold.<slug>"
           ▼
useTelemetryStream  → isValidTelemetryEvent()  ✔ el evento pasa el contrato mínimo
           ▼
handleIncomingTelemetry  → DEDUP por event_id (Set, poda a 1000)
           ▼
flushBatchUpdates (requestAnimationFrame, 60 FPS)
    ├─ setNodes: .map(actualizar) + .concat(debutados)      ← append, nunca replace
    └─ setEdges: .map(actualizar canónicas) + .concat(derivadas)
```

### 4.2 Historial real → scrubber

```
GET /api/v1/telemetry/history?window=24h&limit=200
→ { window, total_events, events[], nodes_summary{}, active_alerts_count, retrieved_at }
GET /api/v1/telemetry/scenarios/{id}   → { scenario_id, event_count, events[] }
```

Ambos clients siguen el patrón canónico del repositorio (`lineageApi.ts` / `copilotApi.ts`): base `NEXT_PUBLIC_API_URL`, `AbortController` + timeout, error tipado con `status`, `Accept: application/json` y `fetchImpl` inyectable.

### 4.3 Linaje certificado

```
GET /api/v1/lineage/table/{table}
→ { table, stages[{layer,table,location,description}], transformation,
    certification{quality_percent, quality_summary, last_sync, audit_hash},
    formula?{latex,description,key} }
```

### 4.4 Identidades Zero-Trust

```
GET /api/v1/auth/roles
→ [ { role_id, title, description, canvas_effect,
      ranger_row_filter, ranger_column_mask, allowed_nodes[], locked_nodes[] } ]

Cabecera de propagación: X-User-Role  (src/api/middleware.py:9)
   frontend admin→director_general · rbac→gerente_norte · compliance→analista_externo
Impersonación Trino: X-Trino-Role: system=ROLE{rol}  (src/core/query_engine/trino_client.py:223)
```

---

## 5. Discrepancias Registradas (sin corregir por ser área backend)

| # | Discrepancia | Resolución aplicada |
| :--- | :--- | :--- |
| D1 | Hash de auditoría: backend SHA-256 (64 hex) vs frontend FNV-1a (16 hex) | Se conservan ambos, etiquetados (`gateway` / `derived-local`). El hash local ya no sustituye a la certificación. |
| D2 | El gateway no devuelve `title` por etapa | Se deriva de la tabla canónica de capas (`LAYER_TITLES`), no de literales inventados en runtime. |
| D3 | `quality_percent` del backend es `100.0` incluso en la ruta canónica no verificada por OpenMetadata | El frontend propaga el `quality_summary` real del backend y nunca inventa un 100% propio. |
| D4 | La auditoría integral pedía la cabecera `X-Midas-Role`; el middleware implementa `X-User-Role` | Se usa **`X-User-Role`** (el código es la implementación vigente). **Requiere corrección documental del backend.** |
| D5 | `ADR-003` describe persistencia PostgreSQL de eventos; la implementación usa un ring buffer en memoria de 100 eventos | El frontend **no afirma "persistido"**: rotula el historial como "Historial del Gateway de Telemetría". |
| D6 | IDs de rol: backend `director_general\|gerente_norte\|analista_externo` vs frontend `admin\|rbac\|compliance` | Se **mapea** en `page.tsx` sin cambiar el union type público del frontend. |
| D7 | El backend nombra `source_csv` a la fuente tabular; el frontend `source_excel` | Alias canónico único documentado (`NODE_ID_ALIASES`). |
| D8 | `QueryExecuteResponse` no expone metadatos de masking aplicado | La Lente **no afirma** aplicación: declara "Sin evidencia verificable" y sólo muestra la política declarada. **Requiere campo `masked_columns` en backend (nuevo contrato / ADR).** |
| D9 | `UniversalIngestionEngine._publish_telemetry` emite un dict con forma distinta a `TelemetryEvent` (`stage`, `event_type`, `records_count`, `status: "SUCCESS"`) | Esos eventos **no** pasan el validador `isValidTelemetryEvent` del frontend. No se corrigió (área backend). Documentado. |
| D10 | `GET /api/v1/telemetry/history` cae a escenarios sintéticos T0 cuando el ring buffer está vacío, **sin señalizarlo** en la respuesta | El frontend no puede distinguir ambos casos. Se rotula el contenido como escenario del backend y se documenta. **Requiere un flag `source` en el backend.** |

---

## 6. Verificación y Pruebas Automatizadas

### Comandos ejecutados y resultados reales

```bash
# Suite completa de frontend
cd src/frontend && npx vitest run --reporter=verbose
#   Test Files  11 passed (11)
#   Tests       109 passed (109)

# Tipado estricto
npx tsc --noEmit -p src/frontend/tsconfig.json
#   (sin salida) — 0 errores

# Build de producción
npm run build
#   ✓ Compiled successfully
#   ✓ Generating static pages (4/4)
#   Route (app)  Size  First Load JS
#   ┌ ○ /         355 kB  443 kB
```

### Evolución de la suite

| Momento | Tests | Resultado |
| :--- | :---: | :--- |
| Línea base (antes de la HU) | 78 | 78/78 ✅ |
| Línea base tras restaurar `katex@0.16.47` (dependencia declarada y ausente en `node_modules`) | 78 | 78/78 ✅ |
| Tras la implementación de HU-FRONT-08 | **109** | **109/109 ✅** |

**Incremento neto: +31 pruebas** (31 nuevas, 0 eliminadas; 4 adaptadas por cambio de comportamiento legítimo impuesto por la HU).

### Cobertura nueva por criterio

| Fichero | Pruebas nuevas | Cubre |
| :--- | :---: | :--- |
| `tests/telemetryIntegration.test.tsx` | 6 (casos 8–13) | Nodo dinámico por SSE, arista derivada, deduplicación por `event_id`, conservación de la topología canónica, preservación de posición, reset de layout que no borra lo dinámico. |
| `tests/historicalTelemetryService.test.ts` | 7 (casos 4–10) | Store sin fabricación, hidratación desde `/history`, estado `empty`, estado `error`, anclaje de hitos T0–T3, tolerancia a escenarios no disponibles. |
| `tests/contractClients.test.ts` | 12 (nuevo) | Endurecimiento y estrechado de los payloads de `/telemetry/history`, `/telemetry/scenarios/{id}` y `/auth/roles`; traducción de errores HTTP y de red. |
| `tests/ExplainNumberDrawer.test.tsx` | 6 (casos 7, 7b, 11–13) | Linaje no certificado, etapas incompletas no rellenadas, ausencia de consulta sin tabla Gold, `mapGatewayStage` estricto. |
| `tests/ZeroTrustLens.test.tsx` | 4 (casos 6b, 11, 12) | Ausencia de PII/porcentajes ficticios, masking desde el catálogo de identidades, banner sin afirmación de Ranger. |

---

## 7. Archivos Involucrados

### Creados

- `src/frontend/services/telemetryHistoryApi.ts` — cliente HTTP de `/api/v1/telemetry/history` y `/api/v1/telemetry/scenarios/{id}`.
- `src/frontend/services/securityRolesApi.ts` — cliente HTTP de `/api/v1/auth/roles`.
- `src/frontend/hooks/useTelemetryHistory.ts` — hook de hidratación del historial real.
- `src/frontend/tests/contractClients.test.ts` — 12 pruebas de contrato.

### Modificados (producción)

- `src/frontend/components/canvas/PipelineCanvas.tsx` — nodos/aristas dinámicos, dedup, aristas parametrizadas, masking real, reset no destructivo, banner honesto.
- `src/frontend/services/historicalTelemetryService.ts` — sin fabricación en producción; hidratación, estados y suscripción.
- `src/frontend/components/lineage/resolveLineage.ts` — `LAYER_FALLBACK` eliminado; certificación honesta.
- `src/frontend/components/lineage/types.ts` — `LineageProvenance` y `LineageCertification.qualityPercent: number | null`.
- `src/frontend/components/lineage/ExplainNumberDrawer.tsx` — estado "no certificado" explícito.
- `src/frontend/components/lineage/index.ts` — superficie pública actualizada.
- `src/frontend/components/security/ZeroTrustLens.tsx` — roles reales, sin PII ficticia, evidencia calificada.
- `src/frontend/components/canvas/TimeTravelScrubber.tsx` — estados `loading`/`empty`/`error` del historial.
- `src/frontend/hooks/useTimeTravel.ts` — suscripción al store y exposición de `historyStatus`/`historyError`.
- `src/frontend/app/page.tsx` — catálogo de identidades del backend, política de nodos, mapeo de rol.
- `src/frontend/types/canvas.ts` — subtipo `'generic'` (aditivo).
- `src/frontend/types/telemetry.ts` — `details.event_type` y `details.output_table` tipados.

### Modificados (documentación)

- `documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md` — §2.3, §3.1, §3.2, §4.1.
- `documentation/done/frontend/frontend-desmockitizacion-canvas-linaje-replay-08.md` — este documento.
- `documentation/changelog/21-10-2026-changelog.md` — bitácora.

### Modificados (pruebas)

- `tests/historicalTelemetryService.test.ts`, `tests/telemetryIntegration.test.tsx`, `tests/ExplainNumberDrawer.test.tsx`, `tests/ZeroTrustLens.test.tsx` (adaptadas + ampliadas).
- `tests/useTimeTravel.test.ts`, `tests/timeTravelIntegration.test.tsx` (renombrado mecánico `initialize()` → `seedCanonicalScenarios()`).

### Explícitamente NO modificados

`src/api/**` · `src/core/**` · `src/agent/**` · `src/lakehouse/**` · `src/orchestration/**` · `src/security_governance/**` · `docker/**` · `docker-compose.yml` · `.env` · `.env.example` · `package.json` · `package-lock.json` · `src/frontend/components/copilot/**` · `src/frontend/components/canvas/nodes/**` · `src/frontend/components/canvas/edges/**` · `src/frontend/components/canvas/topology/initialTopology.ts` · `src/frontend/components/lineage/canonicalMetrics.ts` · `src/frontend/components/lineage/parseFigure.ts` · `tests/**` (backend Python).

---

## 8. Limitaciones y Dependencias Pendientes (backend)

1. **Evidencia de enmascaramiento.** `POST /api/v1/query/execute` no expone qué columnas fueron enmascaradas. La Lente muestra la **política declarada** y declara *"Sin evidencia verificable"*; no afirma aplicación. Para cerrar el criterio de "enmascaramiento real" hace falta un campo `masked_columns` en `QueryExecuteResponse` (nuevo contrato → ADR, área Daniel Echeverría / Sebastian Castiblanco).
2. **Persistencia del historial.** `GET /api/v1/telemetry/history` sirve el ring buffer en memoria (máx. 100 eventos) y cae a escenarios sintéticos T0 cuando está vacío, sin señalizarlo. Implementar la proyección PostgreSQL de `ADR-003` y/o un flag `source` en la respuesta.
3. **Cabecera de rol.** `X-Midas-Role` vs `X-User-Role`: unificar en la documentación del backend.
4. **Forma de los eventos de ingesta.** `UniversalIngestionEngine._publish_telemetry` no emite `TelemetryEvent` canónicos; sus eventos son descartados por el validador del frontend.
5. **Conexiones nuevas.** `POST /api/v1/connections/register` no emite evento de telemetría; una nueva fuente no aparece en el Canvas por SSE hasta que el backend publique el anuncio.

---

## 9. Impacto y Coordinación con el Equipo

- **Cero impacto negativo** en Copiloto, sesiones, workspace, telemetría en vivo, permisos y lineage: la suite completa pasa de 78 a **109/109** en verde, sin modificar un solo test para forzar el resultado (4 tests se adaptaron porque **afirmaban datos ficticios** que la HU elimina por definición).
- **Compatibilidad con HU-FRONT-07** (`SessionHistorySidebar`, `WelcomeHero`, sesiones): no se tocó `initialTopology.ts` ni el bootstrap del Canvas; los nodos dinámicos conviven con el futuro grafo por sesión y se conservan al reiniciar el layout.
- **Convención de commits/PR:** la entrega queda en la rama `feature/frontend-desmockitizacion-canvas-linaje-replay`. **No se ha hecho commit, push ni apertura de PR**; quedan a la espera de autorización explícita del responsable y del PR formal hacia `develop` (merge directo prohibido por `rules/01` §5).
