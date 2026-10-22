# HU-FRONT-09: Plan de Remediación Integral del Frontend — Core Audit & Sincronización Topológica/Telemetría

- **ID de la Entrega:** `HU-FRONT-09` / `AUDIT-REMEDIATION-CORE`
- **Título Oficial:** Subsanación Integral de Auditoría Frontend, Sincronización Topológica, SSE Canónico y Armonización Corporativa
- **Rama Oficial:** `feature/frontend-audit-remediation-core`
- **Responsables:** Dilan Chávez (`@dilandcv`) & Joshua Gonzales
- **Revisor / Líder de Proyecto:** Daniel Echeverría
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../canonical/05_arquitectura_frontend_y_experiencia_canvas.md)
  - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../canonical/04_logica_de_negocio_y_resiliencia_guardian.md)
  - [`documentation/adr/ADR-010-workspace-conversacional-multi-sesion-frontend.md`](../../adr/ADR-010-workspace-conversacional-multi-sesion-frontend.md)
  - [`documentation/adr/ADR-006-gobernanza-activa-escudo-pii-y-lente-zero-trust.md`](../../adr/ADR-006-gobernanza-activa-escudo-pii-y-lente-zero-trust.md)
- **Fecha de Entrega:** Miércoles 21 de Octubre de 2026

---

## 1. Checklist Anti-Code Drift Verificado

- [x] **Fórmulas Canónicas Inmutables:** No se alteró ninguna regla contable ni de negocio (`Venta Neta = Subtotal - Descuento + Impuestos`).
- [x] **Contratos de Datos y Esquemas Canónicos:** Se alinearon los identificadores de conexión del Canvas con el catálogo de ingesta del backend (`conn_pg_crm_default`, `conn_excel_budget_default`, `conn_rest_crm_default`).
- [x] **Contratos SSE de Telemetría:** El hook `useTelemetryStream` delega por defecto al stream SSE real de FastAPI (`http://localhost:8000/api/v1/telemetry/stream`), y la ruta proxy interna condiciona el mock a `NEXT_PUBLIC_MOCK_SSE=true`.
- [x] **Seguridad y Zero-Trust:** Se implementó la propagación transversal de la cabecera `X-User-Role` en todos los clientes HTTP de servicios frontend (`sessionService`, `copilotApi`, `lineageApi`, `telemetryHistoryApi`).
- [x] **Single-Area Ownership Respetado al 100%:** Cambios confinados a `src/frontend/`, configuración de build `docker/frontend/Dockerfile`, `docker-compose.yml` (sección frontend) y documentación técnica.

---

## 2. Detalle de Implementación Técnica por Dimensión (Plan de Remediación)

### 2.1. Resolución del Disparador de Pipeline y Mapeo Canónico de Conexiones (`FINDING-01`)
- **Problema Detectado:** En `NodeInspectionDrawer.tsx`, se transformaban identificadores como `source_postgres` a `"postgres"`, el cual no existía en el `SourceConnectionRegistry` del backend, provocando respuestas HTTP 404/400 al presionar "Ejecutar Pipeline".
- **Solución Aplicada:**
  - En `src/frontend/types/canvas.ts`, se incorporó `connectionId?: string` en el contrato canónico `MidasNodeData`.
  - En `src/frontend/components/canvas/topology/initialTopology.ts`, se asignaron los connection IDs canónicos:
    - PostgreSQL CRM $\rightarrow$ `conn_pg_crm_default`
    - Excel Presupuesto $\rightarrow$ `conn_excel_budget_default`
    - API REST $\rightarrow$ `conn_rest_crm_default`
  - En `src/frontend/components/workspace/QuickConnectionModal.tsx`, se capturan los `connection_id` generados dinámicamente por `/api/v1/connections/upload` y `/api/v1/connections/register` y se preservan dentro del nodo del Canvas.
  - En `src/frontend/components/canvas/NodeInspectionDrawer.tsx`, se implementó una resolución en cascada que extrae `selectedNode.details?.connectionId || selectedNode.connectionId`, resolviendo identificadores exactos y evitando desalineaciones con el orquestador.

### 2.2. Persistencia Reactiva de Topología React Flow (`FINDING-02`)
- **Problema Detectado:** La función `saveTopology` existía en `SessionContext.tsx`, pero `PipelineCanvas.tsx` no la recibía ni ejecutaba al arrastrar nodos o reestructurar el pipeline.
- **Solución Aplicada:**
  - Se extendió `PipelineCanvasProps` con `onTopologyChange?: (nodes: Node<MidasNodeData>[], edges: Edge[]) => void`.
  - En `PipelineCanvas.tsx`, se enlazó el evento `onNodeDragStop` de React Flow y el manejador `handleResetLayout` para notificar el nuevo estado de los nodos.
  - En `src/frontend/app/page.tsx`, se extrajo `saveTopology` de `useSession()` y se conectó al canvas (`onTopologyChange={activeSessionId ? saveTopology : undefined}`).

### 2.3. Desacoplamiento de Simulación SSE y Proxy Transparente (`FINDING-03`)
- **Problema Detectado:** `useTelemetryStream.ts` usaba como fallback relativo `/api/v1/telemetry/stream`, el cual interceptaba la telemetría en Next.js con un generador mock local en lugar de conectarse al Hub SSE de FastAPI.
- **Solución Aplicada:**
  - En `src/frontend/hooks/useTelemetryStream.ts`, se configuró la URL por defecto hacia `${NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/v1/telemetry/stream`, salvo que `NEXT_PUBLIC_MOCK_SSE === 'true'`.
  - En `src/frontend/app/api/v1/telemetry/stream/route.ts`, la ruta local verifica `NEXT_PUBLIC_MOCK_SSE`. Si no está activa la simulación, hace streaming proxy directo hacia el Gateway backend preservando `last-event-id` y `x-user-role`.

### 2.4. Inyección de Build-Args en Entorno Dockerizado (`FINDING-04`)
- **Problema Detectado:** En `docker/frontend/Dockerfile`, las variables públicas de Next.js (`NEXT_PUBLIC_*`) no se declaraban como `ARG` en la etapa `builder`, impidiendo que `next build` las horneara en los bundles estáticos.
- **Solución Aplicada:**
  - Se añadieron `ARG NEXT_PUBLIC_API_URL`, `ARG NEXT_PUBLIC_SSE_URL` y `ARG NEXT_PUBLIC_MOCK_SSE` en `docker/frontend/Dockerfile`.
  - Se actualizaron las secciones `build.args` y `environment` del servicio `midas-frontend` en `docker-compose.yml`.

### 2.5. Propagación Universal de Rol Zero-Trust `X-User-Role` (`FINDING-05`)
- **Problema Detectado:** Aunque `ZeroTrustLens` permitía alternar entre identidades y existía la constante `USER_ROLE_HEADER`, las llamadas HTTP salientes no propagaban el rol activo hacia el middleware de FastAPI.
- **Solución Aplicada:**
  - En `src/frontend/services/securityRolesApi.ts`, se añadieron las funciones `setActiveUserRole(role: string)` y `getActiveUserRole(): string`.
  - En `src/frontend/app/page.tsx`, un efecto reactivo sincroniza `selectedRole` (`ZERO_TRUST_ROLE_IDS[selectedRole]`) con `setActiveUserRole`.
  - Los clientes de servicio `sessionService.ts`, `copilotApi.ts`, `lineageApi.ts` y `telemetryHistoryApi.ts` inyectan automáticamente la cabecera `X-User-Role`.

### 2.6. Armonización Corporativa de Estilo Oro/Marfil (`FINDING-06` y `FINDING-07`)
- **Problema Detectado:** `ExplainNumberDrawer.tsx` y las opciones de `EChartsRenderer.tsx` utilizaban estilos oscuros residuales (`#0B0F17`, `border-slate-800`), desalineados con el sistema de diseño oficial de Midas (blanco `#FFFFFF`, marfil `#FAFAFA`, bordes cálidos `#E8E4DC` y acentos oro `#B8860B`).
- **Solución Aplicada:**
  - En `ExplainNumberDrawer.tsx` y `LineageMiniGraph.tsx`, se migraron todos los fondos, bordes, contenedores KaTeX, badges y textos a la paleta corporativa clara.
  - En `chartOptions.ts`, se actualizaron los tokens de texto (`#1C1E21`), etiquetas de ejes (`#6B6557`), líneas divisorias (`#E8E4DC`) y tooltips con tarjetas limpias en blanco y sombra difuminada.
  - En `EChartsRenderer.tsx`, el fondo de exportación PNG se estableció en `#FFFFFF`.

### 2.7. Optimización de Reflow en Animaciones de Cursor (`FINDING-08`)
- **Problema Detectado:** `ChatParticleBackground.tsx` ejecutaba `container.getBoundingClientRect()` en cada evento `mousemove` a nivel de ventana, forzando recálculos síncronos de layout (reflow).
- **Solución Aplicada:**
  - Se memorizan las coordenadas `cachedLeft` y `cachedTop` en `updateDimensions` y al entrar el cursor (`mouseenter`).
  - El manejador `handleMouseMove` calcula las posiciones relativas mediante aritmética pura sin forzar lecturas del DOM.

### 2.8. Sincronización Automática de Sesiones en el Copiloto (`FINDING-09`)
- **Problema Detectado:** Al crear una conversación nueva en el Drawer del Copiloto, la lista de sesiones en la barra lateral no se refrescaba de inmediato hasta recargar la página.
- **Solución Aplicada:**
  - En `useCopilotChat.ts`, se expuso la función `setOnTurnComplete` y se dispara al finalizar satisfactoriamente cada turno conversacional.
  - En `src/frontend/app/page.tsx`, se enlaza este evento para invocar `fetchSessions()`, actualizando el historial en tiempo real.

### 2.9. Eliminación de Duplicación de Código (`FINDING-11`)
- **Problema Detectado:** Lógica de cálculo de throughput duplicada entre `useTelemetryStream.ts` y `PipelineCanvas.tsx`, y parser JSON de opciones ECharts duplicado en `copilotApi.ts` y `chartOptions.ts`.
- **Solución Aplicada:**
  - Se unificó `extractTelemetryRate` en `src/frontend/types/telemetry.ts`, consumiéndose en ambos módulos.
  - Se unificó el parseo de configuraciones ECharts reutilizando `parseChartOption` de `chartOptions.ts` en `copilotApi.ts`.

---

## 3. Verificación y Pruebas Automatizadas

Se realizaron verificaciones exhaustivas en el entorno local antes de la entrega:

1. **Chequeo de Tipos TypeScript (`npm run lint` / `tsc --noEmit`):**
   ```bash
   npm run lint
   # Salida: tsc --noEmit -> Código de salida 0 (0 errores, 0 advertencias)
   ```

2. **Suite de Pruebas Unitarias e Integración (`npm test` / Vitest):**
   ```bash
   npm test
   # Salida:
   # Test Files  14 passed (14)
   #      Tests  145 passed (145)
   #   Duration  67.45s
   ```

3. **Compilación de Producción Next.js (`npm run build`):**
   ```bash
   npm run build
   # Salida:
   # ✓ Compiled successfully
   # ✓ Generating static pages (4/4)
   # ✓ Finalizing page optimization
   # Route (app)               Size     First Load JS
   # ┌ ○ /                     400 kB          488 kB
   # ├ ○ /_not-found           873 B          88.7 kB
   # └ ƒ /api/v1/telemetry/stream 0 B            0 B
   ```

---

## 4. Impacto y Coordinación con el Equipo

- **Lakehouse & Ingesta (Edgar Corzo):** Compatibilidad garantizada al 100% con los IDs de conexión registrados en `connection_registry.py` (`conn_pg_crm_default`, `conn_excel_budget_default`, `conn_rest_crm_default`).
- **Backend & Gateway (Daniel Echeverría):** Compatibilidad total con el middleware ASGI de propagación de identidades Zero-Trust (`X-User-Role`) y el Hub de telemetría SSE en vivo.
- **Agente & Copiloto (Elian Rivera):** Los gráficos de ECharts y el linaje de números certificados operan con el contrato canónico sin degradación visual ni funcional.
- **Riesgo de Colisión:** Nulo. Se respetó el protocolo estricto de Single-Area Ownership.
