# HU-FRONT-04: Conversational Copilot Chat Interface & Rich ECharts Component

- **ID de la Historia:** `HU-FRONT-04`
- **Título Oficial:** Chat Copiloto Flotante & Componente ECharts
- **Rama Oficial:** `feature/frontend-copilot-chat-echarts`
- **Responsable:** Joshua Gonzales — UI/UX Specialist & Frontend Partner
- **Pair / Revisor:** Dilan Chávez — Frontend Lead & Real-Time Canvas Architect
- **Squad:** Squad 2 — Frontend & Real-Time Canvas
- **Ventana de Ejecución:** Día 3 — Martes 20 de Octubre (09:00 - 18:00)
- **Story Points:** 5 SP (MUST HAVE)
- **Módulo de Código:** `src/frontend/components/copilot/`
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md) — Distribución de la consola, §4 Experiencia del Copiloto, §4.2 Sello de Certificación, §4.3 Modal de Aprobación Text-to-Gold.
  - [`documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`](../../canonical/06_arquitectura_agente_ia_y_capa_semantica.md) — §3.1 fuentes activas y sugerencias, §3.5 Storytelling + ECharts, §3.6 Text-to-Gold, §4 ejemplos de diálogo.
  - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../canonical/04_logica_de_negocio_y_resiliencia_guardian.md) — fórmulas contables canónicas (la UI no recalcula ni aproxima métricas).
  - [`documentation/reviews/review-pr-023-hu-ai-01-langgraph.md`](../../reviews/review-pr-023-hu-ai-01-langgraph.md) — §2.5 contrato HTTP del Copiloto para `HU-FRONT-04`.
  - [`documentation/04_product_backlog.md`](../../04_product_backlog.md) / [`documentation/05_sprint_backlog_detallado.md`](../../05_sprint_backlog_detallado.md) — criterios y subtasks `ST-FRONT-04.1` a `ST-FRONT-04.4`.

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| # | Criterio de Aceptación | Estado | Evidencia de Implementación |
| :-: | :--- | :---: | :--- |
| 1 | Widget flotante y drawer expandible con historial de mensajes, estado de escritura (*thinking / querying*) y sugerencias rápidas ("Pills"). | ✅ Cumplido | `CopilotChatWidget.tsx` (botón flotante `fixed bottom-6 right-6` con badge de no leídos y anillo de actividad) y `CopilotChatDrawer.tsx` (drawer lateral `role="dialog"` con modo compacto `460px`/`520px` y modo expandido `780px`/`920px`). El historial se conserva en `useCopilotChat` (`thread_id` estable de sesión) y se presenta en `ChatConversation` con `ChatMessage`. Los estados `thinking / querying / visualizing` se renderizan en `ChatStatusIndicator.tsx` con las etiquetas canónicas *"Consultando esquema..."*, *"Validando seguridad Zero-Trust..."*, *"Generando visualización..."* (doc 05 §4 y sprint `ST-FRONT-04.2`). Las pills provienen de `suggestions` del agente con fallback a las tres acciones canónicas de doc 06 §3.1. |
| 2 | Componente de visualización con Apache ECharts adaptable: barras, líneas temporales y mapas de calor a partir del JSON devuelto por el agente. | ✅ Cumplido | `EChartsRenderer.tsx` consume el `echarts_option` del agente (`POST /api/v1/agent/chat`) y lo normaliza en `chartOptions.ts`. Registro modular de ECharts (`echarts/core`) con `BarChart`, `LineChart`, `ScatterChart` y `HeatmapChart`, coherente con doc 06 §3.5 y HU-AI-03 §2 (temporal → línea/área, categorías → barras, correlación → dispersión). Para mapas de calor se inyecta automáticamente `visualMap` con `inRange` de la paleta corporativa cuando el agente no lo declara. Si la opción no trae series con datos, se muestra un *fallback* seguro sin romper la conversación. |
| 3 | Tooltips enriquecidos, exportación de gráfico en PNG y alternador a vista de tabla de datos crudos. | ✅ Cumplido | `normalizeEChartsOption` enriquece `tooltip` (`trigger: axis\|item`, `confine`, `renderMode: 'html'`, `extraCssText`, `valueFormatter` con `Intl.NumberFormat('es-CO')` y `axisPointer` por tipo de serie) y aplica el tema oscuro Midas. Botón `PNG` en `EChartsRenderer` que exporta vía `getEchartsInstance().getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#0B0F17' })` y descarga el archivo. Alternador segmentado `Gráfico / Tabla` que reconstruye los datos crudos desde `xAxis/yAxis` de categoría, series de barras/líneas, pares de dispersión y tripletas de `heatmap` mediante `optionToTable`. |
| 4 | Botón de acción `[Aprobar y Crear Pipeline en Airflow]` cuando el agente proponga una vista Text-to-Gold. | ✅ Cumplido | `TextToGoldApprovalCard.tsx` renderiza la tarjeta *Propuesta Text-to-Gold* con vista previa (primeras 5 filas reconstruidas del gráfico propuesto) y el botón oficial `Aprobar y Crear Pipeline en Airflow` (doc 05 §4.3 y guion 07 §Bloque 6). La detección de la propuesta vive en `textToGold.ts` (intención `text_to_gold`/`pipeline_as_a_prompt`, marcadores `metrics_summary` o frases canónicas de doc 06 §4.2). La aprobación se confirma por el canal conversacional ya documentado enviando el prompt canónico de materialización de `HU-AI-04` (*"Materializa este reporte como tabla Gold diaria"*), con estados `submitting → approved/failed`. |

### 1.1. Subtasks Técnicas del Sprint Backlog

- [x] `ST-FRONT-04.1`: Chat conversacional con widget flotante expandible a drawer lateral, input con autosuggest y pills de preguntas frecuentes (`PromptComposer`, `QuickPromptPills`, `CopilotChatWidget`, `CopilotChatDrawer`).
- [x] `ST-FRONT-04.2`: Indicador visual de estados del agente (`ChatStatusIndicator`).
- [x] `ST-FRONT-04.3`: `EChartsRenderer` con renderizado automático de la opción JSON del backend (barras, líneas temporales, dispersión y mapas de calor).
- [x] `ST-FRONT-04.4`: Botón embebido `[Aprobar y Crear Pipeline en Airflow]` para activar la materialización Gold.

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero desvío de fórmulas de negocio:** La UI no calcula métricas; solo presenta el `echarts_option`, la narrativa y el `metrics_summary` emitidos por el agente. Los valores numéricos se formatean (locale `es-CO`) sin alterar la cifra.
- [x] **Cero alucinación en la interfaz:** El mensaje de bienvenida enumera únicamente las tres fuentes canónicas de doc 06 §3.1 (`crm_operaciones`, `Presupuesto_Corporativo_2026.xlsx`, `helpdesk_tickets_live`) y no introduce cifras de negocio ni métricas de demostración.
- [x] **Contratos exactos:** El cliente consume exclusivamente `POST /api/v1/agent/chat` con `{ thread_id, message }` y la respuesta documentada (`thread_id`, `intent`, `response`, `suggestions`, `needs_clarification`, `echarts_option`/`echarts_spec`, `metrics_summary`). No se inventaron endpoints ni campos.
- [x] **Sin endpoints nuevos para Text-to-Gold:** La aprobación reutiliza el canal conversacional existente con el prompt de confirmación canónicamente definido en `HU-AI-04`; no se crea un endpoint de aprobación no documentado.
- [x] **Single-Area Ownership:** Todos los archivos de producción se confinaron en `src/frontend/components/copilot/`, `src/frontend/app/page.tsx`, `src/frontend/tests/` y `src/frontend/package.json`. Cero modificaciones en `src/agent/`, `src/api/`, `src/lakehouse/`, `docker/` o áreas de otros squads.
- [x] **Sin colisiones de estilo:** El panel derecho de 420px reservado por `HU-FRONT-01` aloja el copiloto; el drawer/widget flotante vive en una capa `z-index` independiente y no altera el Canvas React Flow.

---

## 3. Detalle de la Implementación Técnica

### 3.1. Archivos creados (`src/frontend/components/copilot/`)

| Archivo | Responsabilidad |
| :--- | :--- |
| `types.ts` | Contratos TypeScript del Copiloto (`CopilotMessage`, `CopilotAgentStatus`, `CopilotChatResponse`, `EChartsOption`, `CopilotChartTable`, `CopilotApprovalState`). |
| `copilotApi.ts` | Cliente HTTP de `POST /api/v1/agent/chat` (`NEXT_PUBLIC_API_URL`, doc `.env.example`), `CopilotApiError` y normalización tolerante de la respuesta (soporta `response` como JSON serializado con `narrative` y las claves `echarts_option`/`echarts_spec`). |
| `chartOptions.ts` | `parseChartOption`, `normalizeEChartsOption` (tooltips enriquecidos, grid, tema oscuro, `visualMap` para heatmaps) y `optionToTable` (tabla de datos crudos). |
| `textToGold.ts` | Detección de propuestas Text-to-Gold y prompt canónico de confirmación (`TEXT_TO_GOLD_CONFIRMATION`). |
| `useCopilotChat.ts` | Hook de estado: historial, `thread_id` de sesión, progresión de estados del agente, sugerencias, error y aprobación. |
| `CopilotChatContext.tsx` | `CopilotChatProvider` + `useCopilotChatContext` para compartir la sesión entre panel, drawer y widget. |
| `QuickPromptPills.tsx` | Pills de sugerencias rápidas ("Pills"). |
| `ChatStatusIndicator.tsx` | Estados de escritura con animación y etiquetas canónicas. |
| `ChatMessage.tsx` | Render de mensajes: narrativa markdown (encabezados, viñetas, numeración, tablas, negritas y `code`), chips de `metrics_summary`, tarjeta ECharts, tarjeta Text-to-Gold y pills por mensaje. |
| `EChartsRenderer.tsx` | Tarjeta de visualización Apache ECharts con toolbar `Gráfico/Tabla`, exportación PNG y *fallback* sin datos. |
| `TextToGoldApprovalCard.tsx` | Tarjeta de propuesta con vista previa y botón `[Aprobar y Crear Pipeline en Airflow]`. |
| `PromptComposer.tsx` | Composer con autosuggest de sugerencias, `Enter`/`Shift+Enter` y bloqueo durante la consulta. |
| `ChatConversation.tsx` | Cuerpo de conversación reutilizado por el panel inline y el drawer. |
| `CopilotChatDrawer.tsx` | Drawer expandible con cierre por `Escape`, backdrop, `aria-modal` y nueva conversación. |
| `CopilotChatWidget.tsx` | Widget flotante con badge de no leídos y pulso de actividad. |
| `CopilotChatPanel.tsx` | Panel inline de 420px integrado en la consola maestro. |
| `ChatParticleBackground.tsx` | Fondo animado interactivo Aether Flow adaptado a modo claro (partículas doradas #D4AF37/#B8860B en canvas transparente). |
| `index.ts` | Barrel de exportaciones del módulo. |

### 3.2. Integración en la Consola Maestro (`src/frontend/app/page.tsx`)

- Se envolvió la consola en `CopilotChatProvider` para compartir la sesión conversacional.
- El panel derecho de 420px (`hidden xl:flex`) ahora renderiza `CopilotChatPanel` en lugar del placeholder de `HU-FRONT-04`.
- Se añadieron `CopilotChatWidget` (botón flotante global, útil cuando el panel inline está oculto en viewports < `xl`) y `CopilotChatDrawer` (drawer expandible solapado).

### 3.3. Progresión de estados del agente

El backend expone un único POST por turno; mientras la promesa está pendiente, `useCopilotChat` progresa honestamente las fases de escritura (`thinking` a los 0 ms, `querying` a los 900 ms, `visualizing` a los 2400 ms) usando exactamente los textos canónicos del sprint y de doc 06 §3. Cuando `HU-AI-01`/`HU-AI-02` expongan streaming SSE por etapa, la progresión local se reemplaza por eventos reales sin cambiar los componentes de presentación.

### 3.4. Dependencias añadidas (`src/frontend/package.json`)

- `echarts` `^6.1.0` y `echarts-for-react` `^3.0.6` (ambas con peer range compatible).
- Se usa `echarts-for-react/lib/core` con `echarts/core` y registro modular de `BarChart`, `LineChart`, `ScatterChart`, `HeatmapChart`, `Grid`, `Tooltip`, `Title`, `Legend`, `VisualMap`, `DataZoom`, `MarkLine`, `Dataset`, `Transform` y `CanvasRenderer`. Esto reduce el *First Load JS* de la ruta `/` de 455 kB (import completo) a **327 kB**.

### 3.5. Fondo Ambiental Aether Flow en Modo Claro (`ChatParticleBackground.tsx`)

- Integrado como capa de fondo en `ChatConversation.tsx` con posicionamiento absoluto `z-0` y `pointer-events: none`.
- Renderiza sobre HTML5 Canvas transparente con partículas en la gama cromática dorada Midas (`#D4AF37` y `#B8860B`, alpha 0.30 a 0.42) y líneas de interconexión proporcionales a la distancia.
- Física reactiva al cursor con fuerza elástica de repulsión suave.
- Acelerado por GPU con control estricto de recursos: densidad adaptativa (18 a 45 partículas), pausa automática cuando la pestaña está oculta (`document.hidden`), y detección nativa de `prefers-reduced-motion` para personas con sensibilidad al movimiento.

---

## 4. Verificación y Pruebas Automatizadas

### 4.1. Suite de Pruebas Unitarias (`src/frontend/tests/CopilotChatDrawer.test.tsx`)

```bash
npm run test -- src/frontend/tests/CopilotChatDrawer.test.tsx
```

**Resultado:**
```text
 ✓ src/frontend/tests/CopilotChatDrawer.test.tsx (12 tests)
   ✓ CopilotChatDrawer · Widget flotante, historial y estados (5)
     ✓ 1. Renderiza el widget flotante y abre el drawer con historial, pills y composer
     ✓ 2. Expande y contrae el drawer, y lo cierra con Escape o clic en el backdrop
     ✓ 3. Envía un prompt desde una pill y renderiza la respuesta del agente
     ✓ 4. Expone los estados de escritura thinking → querying → visualizing
     ✓ 5. Muestra error amigable cuando el gateway no responde
   ✓ EChartsRenderer · Visualización dinámica, tabla de datos y exportación (4)
     ✓ 6. Renderiza la opción ECharts del agente con tooltips enriquecidos y chips de métricas
     ✓ 7. Alterna a la vista de tabla de datos crudos construida desde la opción del agente
     ✓ 8. Exporta la visualización en PNG a través de la instancia ECharts
     ✓ 9. Soporta mapas de calor inyectando visualMap y su tabla de valores
   ✓ Text-to-Gold · Botón de aprobación de pipeline en Airflow (2)
     ✓ 10. Muestra el botón de aprobación y confirma la materialización vía el agente
     ✓ 11. No muestra la tarjeta de aprobación en respuestas analíticas normales
   ✓ PromptComposer · Autosuggest de preguntas frecuentes (1)
     ✓ 12. Sugiere coincidencias mientras se escribe y las aplica al hacer clic

 Test Files  1 passed (1)
      Tests  12 passed (12)
   Duration  1.28s
```

La suite completa del frontend (`npm test`) queda en **19/19 pruebas aprobadas** (12 de `HU-FRONT-04` + 7 de `HU-FRONT-01`).

### 4.2. Verificación de Tipos TypeScript

```bash
npm run lint
```

**Resultado:** `tsc --noEmit` completado con exit code 0 y cero errores de tipo.

### 4.3. Verificación de Compilación de Producción

```bash
npm run build
```

**Resultado:**
```text
Route (app)                              Size     First Load JS
┌ ○ /                                    327 kB          414 kB
└ ○ /_not-found                          873 B          88.2 kB

✓ Compiled successfully
✓ Generating static pages (4/4)
```

---

## 5. Coordinación y Preparación para Futuras Historias

- **Para `HU-FRONT-06` (Drawer "Explícame esta cifra" — Joshua Gonzales / Dilan Chávez):**
  - Los chips de `metrics_summary` en `ChatMessage.tsx` ya exponen `data-testid="metrics-summary-chips"` y son el punto natural para enganchar el `onClick` que abrirá el drawer de linaje, reutilizando `metrics_summary` sin nuevos campos.
- **Para `HU-FRONT-05` (Lente Zero-Trust — Joshua Gonzales):**
  - `copilotApi.ts` concentra el `fetch` del Copiloto; el header `X-User-Role` puede inyectarse allí de forma centralizada cuando `SecurityContext` propague el rol simulado.
- **Para `HU-AI-04` (Pipeline-as-a-Prompt — Elian Rivera):**
  - El botón `[Aprobar y Crear Pipeline en Airflow]` envía el prompt canónico de materialización por el mismo `thread_id`, por lo que la confirmación queda en la memoria conversacional del grafo sin necesidad de un endpoint adicional.
- **Para `HU-BACK-01`/integración del gateway:**
  - El endpoint `POST /api/v1/agent/chat` ya está contemplado como contrato de consumo (`review-pr-023` §2.5, `src/api/routes/agent.py` en su rama de integración). Ante indisponibilidad del gateway, el chat muestra un error amigable y permite reintentar sin romper la UI.

---

## 6. Impacto y Reversión

- **Archivos modificados:** `src/frontend/app/page.tsx` (integración del panel/widget/drawer), `src/frontend/package.json` y `package-lock.json` (dependencias ECharts).
- **Archivos creados:** módulo `src/frontend/components/copilot/` (16 archivos) y `src/frontend/tests/CopilotChatDrawer.test.tsx`.
- **Fuera de alcance:** no se modificaron fórmulas contables, esquemas de datos, contratos SSE, ni módulos de `src/agent/`, `src/api/`, `src/lakehouse/` o `docker/`.
- **Reversión:** revertir el commit de `HU-FRONT-04` elimina el módulo de copiloto, restaura el placeholder del panel derecho y remueve las dependencias ECharts, sin efectos colaterales sobre el Canvas React Flow.
