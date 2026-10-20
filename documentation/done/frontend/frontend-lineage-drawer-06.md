# HU-FRONT-06: Data Lineage & "Explain This Number" Drawer

- **ID de la Historia:** `HU-FRONT-06`
- **Título Oficial:** Drawer Linaje "Explícame esta cifra"
- **Rama Oficial:** `feature/frontend-lineage-drawer`
- **Responsable:** Joshua Gonzales — UI/UX Specialist & Frontend Partner
- **Pair / Revisor:** Dilan Chávez — Frontend Lead & Real-Time Canvas Architect
- **Squad:** Squad 2 — Frontend & Real-Time Canvas
- **Ventana de Ejecución:** Día 4 — Miércoles 21 de Octubre (14:00 - 18:00)
- **Story Points:** 3 SP (MUST HAVE)
- **Módulo de Código:** `src/frontend/components/lineage/ExplainNumberDrawer.tsx`
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md) — §4.1 "Explícame esta cifra" (explicabilidad interactiva) y §4.2 Sello de Certificación Ejecutiva.
  - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../canonical/04_logica_de_negocio_y_resiliencia_guardian.md) — §1 Diccionario Semántico Inmutable (fórmulas contables canónicas; la UI nunca recalcula).
  - [`documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md`](../../canonical/03_especificacion_base_de_datos_y_lakehouse.md) — buckets Medallón (`midas-bronze/silver/gold`) y fuentes oficiales de la demo.
  - [`documentation/done/frontend/frontend-copilot-chat-echarts-04.md`](frontend-copilot-chat-echarts-04.md) — contrato de `metrics_summary` y punto de enganche de esta HU en `ChatMessage.tsx`.
  - [`documentation/04_product_backlog.md`](../../04_product_backlog.md) / [`documentation/05_sprint_backlog_detallado.md`](../../05_sprint_backlog_detallado.md) — criterios y subtasks `ST-FRONT-06.1` a `ST-FRONT-06.4`.

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| # | Criterio de Aceptación | Estado | Evidencia de Implementación |
| :-: | :--- | :---: | :--- |
| 1 | Toda cifra destacada en los mensajes del Copiloto es *clickable* con efecto *hover* sutil. | ✅ Cumplido | `MetricFigure.tsx` renderiza cada cifra detectada de la narrativa como `<button>` con `cursor-help`, subrayado punteado ámbar y `hover:bg-amber-500/10 hover:text-amber-200` (efecto sutil, sin alterar el texto original). Los chips de `metrics_summary` de `ChatMessage.tsx` también son botones con el mismo patrón de *hover*. Detección por patrón canónico de cifras (moneda, millares es-CO, decimales, `%`, sufijos `K/M/B`) en `parseFigure.ts`; los años y enteros "pelados" no se marcan para evitar ruido. |
| 2 | Drawer lateral deslizante con fórmula canónica en LaTeX, árbol de linaje `Fuente → Bronze → Silver → Gold` y metadatos de frescura/certificación (calidad 100%, hash de auditoría). | ✅ Cumplido | `ExplainNumberDrawer.tsx` (drawer `role="dialog"` deslizante `translate-x-full → translate-x-0`, capa `z-[70]`). **Fórmula:** `LatexFormula.tsx` renderiza con **KaTeX** la fórmula del Diccionario Semántico Inmutable (doc 04 §1) — p. ej. Venta Neta: $\sum(\text{monto\_bruto} - \text{descuento} - \text{devoluciones})$. **Linaje:** `LineageMiniGraph.tsx` dibuja el árbol vertical certificado `Fuente Original (public.pedidos_crm) → Bronze Parquet (bronze.pedidos_raw) → Silver Cleanse (silver.pedidos) → Gold Mart (gold.fact_ventas)` con rutas S3 canónicas. **Certificación:** calidad `100% · 100% Contratos de Datos Certificados (OpenMetadata)`, última sincronización con fecha locale `es-CO` + frescura relativa ("Actualizado hace X min") y **hash de auditoría** de 16 hex (firmado por el gateway o derivado localmente con FNV-1a determinístico, etiquetado explícitamente). |
| 3 | Cierre accesible con tecla `Escape` o clic fuera del panel. | ✅ Cumplido | Listener global de `keydown Escape` mientras está abierto (`ExplainNumberDrawer.tsx`), *backdrop* `bg-slate-950/70` con `onClick={close}`, botón `X` con `aria-label`, `aria-modal="true"`, foco movido al panel al abrir (`tabIndex={-1}`) y **restaurado al elemento de origen** al cerrar. |
| 4 | Entrega documental en `documentation/done/frontend/frontend-lineage-drawer-06.md`. | ✅ Cumplido | Este archivo. |

### 1.1. Subtasks Técnicas del Sprint Backlog

- [x] `ST-FRONT-06.1`: Detección interactiva de métricas en los mensajes del chat: cifras monetarias y porcentajes se renderizan como botones interactivos clickeables (`parseFigure.ts` + `MetricFigure.tsx` inyectado en `renderInline` de `ChatMessage.tsx` y en los chips de `metrics_summary`).
- [x] `ST-FRONT-06.2`: Componente `ExplainNumberDrawer` con fórmula KaTeX, árbol de linaje Medallión y métricas de certificación (calidad 100%, frescura y hash del lote).
- [x] `ST-FRONT-06.3`: Conexión hacia el endpoint de linaje de OpenMetadata `GET /api/v1/lineage/table/{table}` (`lineageApi.ts`, timeout 2.5 s con `AbortController`). **Nota de honestidad:** el endpoint será expuesto por `HU-GOV-01` (`ST-GOV-01.4`); mientras no exista, el drawer resuelve con el diccionario canónico local y lo etiqueta en la UI (`Resolución local con el diccionario canónico: el gateway de linaje de HU-GOV-01 aún no está desplegado`). **No se inventa linaje ni se fabrican certificaciones.**
- [x] `ST-FRONT-06.4`: Accesibilidad y atajos de teclado: cierre con `Escape`, foco de teclado gestionado (movimiento y restauración) y `aria-label`/`aria-modal`/`aria-labelledby` en el diálogo.

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero alucinación de fórmulas:** las fórmulas LaTeX provienen exclusivamente del Diccionario Semántico Inmutable (doc canónico 04 §1). Cifras sin registro canónico (p. ej. un porcentaje de variación) muestran un estado honesto: *"Esta cifra no está registrada en el Diccionario Semántico Inmutable…"* y sin ruta Medallón inventada (`explain-uncertified-note`).
- [x] **Cero cálculo de negocio en la UI:** el drawer solo *presenta*; no suma, resta ni aproxima métricas. El formateo numérico usa `Intl.NumberFormat('es-CO')` sin alterar el valor.
- [x] **Contratos exactos:** no se crearon endpoints nuevos ni campos no documentados. El cliente de linaje consume el trazado canónico `GET /api/v1/lineage/table/{table}` previsto para `HU-GOV-01` y degrada de forma controlada.
- [x] **Certificación etiquetada:** el hash de auditoría y la fecha de sincronización llevan procedencia visible (`Firmado por el gateway de linaje` vs `Derivado localmente (traza reproducible)`; frescura local marcada como `referencia: respuesta del agente`).
- [x] **Single-Area Ownership:** archivos de producción confinados en `src/frontend/components/lineage/`, `src/frontend/tests/`, más la integración mínima esperada en `src/frontend/components/copilot/ChatMessage.tsx` (punto de enganche designado por `HU-FRONT-04`), `src/frontend/app/page.tsx` y `src/frontend/package.json`. Cero modificaciones en `src/agent/`, `src/api/`, `src/lakehouse/`, `docker/` o áreas de otros squads.
- [x] **Sin colisiones de capas:** el drawer usa capa `z-[70]`, por encima del drawer del copiloto (`z-[60]`) y del `NodeInspectionDrawer` del canvas (`z-40`), sin alterar React Flow.

---

## 3. Detalle de la Implementación Técnica

### 3.1. Archivos creados (`src/frontend/components/lineage/`)

| Archivo | Responsabilidad |
| :--- | :--- |
| `types.ts` | Contratos TypeScript del módulo (`ExplainTarget`, `NumberLineage`, `LineageStageNode`, `LineageCertification`, `LineageGatewayPayload`). |
| `canonicalMetrics.ts` | Espejo frontend del Diccionario Semántico Inmutable (doc 04 §1): `venta_bruta`, `venta_neta`, `pedidos_validos`, `ticket_promedio`, `tasa_devolucion`, `cumplimiento_presupuesto`, con su LaTeX canónico, reglas de reconocimiento y ruta Medallión por métrica. |
| `parseFigure.ts` | `FIGURE_TOKEN_PATTERN`, `extractFigureTokens`, `parseFigureValue` (locale es-CO: `1.490` = 1490, `12.4%`, `$1.2M`, `850K`) y `valuesLooselyEqual`. |
| `lineageApi.ts` | Cliente `GET /api/v1/lineage/table/{table}` con `NEXT_PUBLIC_API_URL` (mismo origen que `copilotApi.ts`), timeout 2.5 s y `LineageGatewayError`. |
| `resolveLineage.ts` | Orquestador: coincide la cifra con una métrica canónica → intenta el gateway (solo si hay métrica certificada o hint de tabla del agente) → *fallback* al diccionario local. Incluye `mapGatewayLineage`, `buildFallbackLineage`, `deriveAuditHash` (FNV-1a 64-bit) y `formatRelativeFreshness`. |
| `ExplainNumberContext.tsx` | `ExplainNumberProvider` + `useExplainNumberContext` + **`useOptionalExplainNumber`** (tolerante para no romper las pruebas aisladas de `HU-FRONT-04`) + `buildExplainTarget` (asocia la cifra clickeada con la métrica del agente **por coincidencia de valor**). |
| `MetricFigure.tsx` | Cifra narrativa como botón interactivo con *hover* sutil. |
| `LatexFormula.tsx` | Renderizado KaTeX (`throwOnError: false`, con *fallback* a código plano). |
| `LineageMiniGraph.tsx` | Árbol visual `Fuente Original → Bronze Parquet → Silver Cleanse → Gold Mart` con iconos por capa y flechas. |
| `ExplainNumberDrawer.tsx` | Drawer lateral con fórmula, linaje, certificación, estado de carga y estado honesto de cifra no certificada. |
| `index.ts` | Barrel de exportaciones del módulo. |

### 3.2. Integración mínima en el Copiloto (`ChatMessage.tsx`) y consola (`page.tsx`)

- `renderInline` de `ChatMessage.tsx` ahora reconoce cifras con `FIGURE_TOKEN_PATTERN` y las envuelve en `MetricFigure` (solo en mensajes del asistente; el texto del usuario permanece intacto). El patrón respeta el orden de tokens existente: `**negrita**` > `` `code` `` > cifra.
- Los chips de `metrics_summary` (`data-testid="metrics-chip"`) abren el drawer vía `buildExplainTarget`, que hace *match* por etiqueta canónica ("Ingresos netos" → `venta_neta`).
- `page.tsx` envuelve la consola en `ExplainNumberProvider` y monta `<ExplainNumberDrawer />` al lado de `CopilotChatDrawer`.
- Flujo de resolución: clic → `ExplainTarget` (mensaje + valor) → `resolveNumberLineage` → gateway o diccionario canónico → estado `NumberLineage` → drawer.

### 3.3. Dependencias añadidas (`src/frontend/package.json`)

- `katex` `^0.16.11` (dependencia de producción) y `@types/katex` (desarrollo), exigidas por `ST-FRONT-06.2` ("Fórmula matemática canónica aplicada con KaTeX").
- Impacto de tamaño: la ruta `/` pasa de **327 kB** a **411 kB** de First Load JS (KaTeX incluido); compilación estática sin incidencias.

---

## 4. Verificación y Pruebas Automatizadas

### 4.1. Suite de Pruebas Unitarias (`src/frontend/tests/ExplainNumberDrawer.test.tsx`)

```bash
npm run test -- src/frontend/tests/ExplainNumberDrawer.test.tsx
```

**Resultado:**
```text
 ✓ src/frontend/tests/ExplainNumberDrawer.test.tsx (10 tests)
   ✓ Cifras clicables en los mensajes del Copiloto (ST-FRONT-06.1) (2)
     ✓ 1. Renderiza las cifras de la narrativa como botones interactivos con hover sutil
     ✓ 2. Los chips de metrics_summary abren el drawer "Explícame esta cifra"
   ✓ ExplainNumberDrawer · Fórmula LaTeX, árbol de linaje y certificación (ST-FRONT-06.2) (3)
     ✓ 3. Muestra la fórmula canónica en LaTeX, el árbol Fuente→Bronze→Silver→Gold y la certificación
     ✓ 4. Asocia una cifra de la narrativa con la métrica certificada del agente por valor
     ✓ 5. Muestra estado honesto para cifras sin registro en el diccionario canónico
   ✓ Gateway de linaje y cierre accesible (ST-FRONT-06.3 / ST-FRONT-06.4) (3)
     ✓ 6. Consulta /api/v1/lineage/table y prioriza el payload del gateway de OpenMetadata
     ✓ 7. Resuelve con el diccionario canónico cuando el gateway de linaje falla
     ✓ 8. Cierra con Escape y con clic fuera del panel, y gestiona el foco
   ✓ parseFigure · detección y formato de cifras (2)
     ✓ 9. Interpreta cifras en formato es-CO, con sufijos y porcentajes
     ✓ 10. Deriva hashes de auditoría determinísticos y frescura relativa legible

 Test Files  1 passed (1)
      Tests  10 passed (10)
```

La suite completa del frontend (`npm test`) queda en **29/29 pruebas aprobadas** (10 de `HU-FRONT-06` + 12 de `HU-FRONT-04` + 7 de `HU-FRONT-01`).

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
┌ ○ /                                    411 kB          498 kB
└ ○ /_not-found                          873 B          88.2 kB

✓ Compiled successfully
✓ Generating static pages (4/4)
```

---

## 5. Coordinación y Preparación para Futuras Historias

- **Para `HU-GOV-01` (OpenMetadata Ingestion & Linaje — Sebastian Castiblanco):**
  - Al desplegar `GET /api/v1/lineage/table/{table_name}` (`ST-GOV-01.4`), el drawer lo consumirá automáticamente sin cambios de UI: la procedencia pasará de `canonical-fallback` a `gateway` y el hash de auditoría será el firmado por OpenMetadata. El contrato tolerante esperado está tipado en `LineageGatewayPayload` (`stages[]` con `layer/table/location/description` y `certification` con `quality_percent/last_sync/audit_hash`).
- **Para `HU-FRONT-05` (Lente Zero-Trust):** el drawer vive en una capa de `z-index` propia (`z-[70]`) y no compite con el selector de roles de cabecera.
- **Para `HU-AI-03` (Storytelling):** el `metrics_summary` emitido por el agente sigue siendo la fuente de verdad de las cifras; la asociación cifra→métrica se hace por coincidencia de valor, por lo que cualquier métrica nueva que envíe el agente será *clickeable* sin tocar este módulo.

---

## 6. Impacto y Reversión

- **Archivos modificados:** `src/frontend/components/copilot/ChatMessage.tsx` (cifras y chips clicables, punto de enganche designado por HU-FRONT-04), `src/frontend/app/page.tsx` (provider + montaje del drawer), `src/frontend/package.json` y `package-lock.json` (KaTeX).
- **Archivos creados:** módulo `src/frontend/components/lineage/` (11 archivos) y `src/frontend/tests/ExplainNumberDrawer.test.tsx`.
- **Fuera de alcance:** no se modificaron fórmulas contables, esquemas, contratos del agente, el Canvas React Flow ni módulos de `src/agent/`, `src/api/`, `src/lakehouse/` o `docker/`.
- **Reversión:** revertir el commit de `HU-FRONT-06` elimina el módulo `lineage/`, restaura los chips como `<span>` y las cifras como texto plano en `ChatMessage.tsx`, desmonta el provider en `page.tsx` y remueve KaTeX, sin efectos colaterales sobre el Copiloto (`HU-FRONT-04`) ni el Canvas (`HU-FRONT-01`).
