# HU-FRONT-05: Zero-Trust Security Lens & Interactive Role Switcher UI

- **ID de la Historia:** `HU-FRONT-05`
- **Título Oficial:** Zero-Trust Security Lens & Interactive Role Switcher UI
- **Rama Oficial:** `feature/frontend-zero-trust-lens`
- **Responsable:** Joshua Gonzales (`UI/UX & Frontend Partner`)
- **Co-autoría & Saneamiento Asistido:** Daniel Echeverría & Milton
- **Módulo de Código:** `src/frontend/components/security/ZeroTrustLens.tsx`
- **Fecha de Entrega:** Martes 20 de Octubre de 2026

---

## 1. Verificación de Criterios de Aceptación

| Criterio | Estado | Evidencia |
| :--- | :---: | :--- |
| Selector de perfiles en cabecera: Director General, Gerente Regional Norte, Auditor de Cumplimiento | Cumplido | `src/frontend/app/page.tsx` + `src/frontend/components/security/ZeroTrustLens.tsx` renderizan un selector interactivo con roles `admin`, `rbac` y `compliance` con accesibilidad WAI-ARIA (`aria-pressed`). |
| Efecto visual en Canvas: nodos no autorizados se atenúan al 30% y muestran candado | Cumplido | `PipelineCanvas.tsx` aplica `opacity: 0.3`, `grayscale` e icono `Lock` en nodos restringidos por `securityRole`; además se muestran mensajes de política `Datos protegidos por política`. |
| Tablas y gráficas: datos PII con máscara reactiva inmediata | Cumplido | `ZeroTrustLens` incluye tarjeta preview con enmascaramiento reactivo de email (`u****@riwi.io`) y salario (`****`) reflejado al cambiar de rol en tiempo real sin recarga de página. |
| Banner superior informativo | Cumplido | El banner muestra en la cabecera del Canvas: `Simulando sesión bajo perfil: [Nombre de Rol] · Políticas Ranger activas` adoptando la paleta Grecia clásica. |

---

## 2. Implementación Realizada y Conciliación Arquitectónica

### 2.1. Selector de Roles y Banner de Sesión
- Se implementó el componente `ZeroTrustLens` con tres perfiles:
  - `Director General` (`admin`): visibilidad 100%, PII sin enmascarar.
  - `Gerente Regional Norte` (`rbac`): visibilidad 64%, RLS activo, PII enmascarada.
  - `Auditor de Cumplimiento` (`compliance`): visibilidad 82%, auditoría habilitada, PII enmascarada.
- El selector se integra en la cabecera ejecutiva corporativa de `src/frontend/app/page.tsx` en sustitución del placeholder estático.
- Banner superior de simulación activa integrado en `PipelineCanvas.tsx` con estética Grecia clásica (#FFFFFF/90, borde dorado sutil).

### 2.2. Canvas con Enmascaramiento Dinámico Zero-Trust
- `PipelineCanvas.tsx` recibe `securityRole` y calcula `enhancedNodes` mediante `useMemo` sin interferir con el streaming SSE en vivo (`useTelemetryStream`) ni con el scrubber de reproducción histórica de 24 horas (`TimeTravelScrubber`).
- Los nodos no autorizados se procesan con:
  - `opacity: 0.3`
  - `grayscale(0.25)`
  - Icono `Lock` dorado sobre fondo marfil en la esquina superior derecha (`SourceNode.tsx` y `StageNode.tsx`).
  - Badge de advertencia `Datos protegidos por política`.

### 2.3. Previsualización PII Reactiva Flotante
- Tarjeta flotante `ZeroTrustLens (preview = true)` anclada en la esquina inferior izquierda (`bottom-20 left-4 z-20`) sin obstruir los controles de navegación de React Flow.
- Muestra el estado de acceso por perfil, métricas de visibilidad y enmascaramiento en vivo de emails y salarios.

---

## 3. Archivos Involucrados

- `src/frontend/app/page.tsx`
- `src/frontend/components/security/ZeroTrustLens.tsx`
- `src/frontend/components/canvas/PipelineCanvas.tsx`
- `src/frontend/components/canvas/nodes/SourceNode.tsx`
- `src/frontend/components/canvas/nodes/StageNode.tsx`
- `src/frontend/types/canvas.ts`
- `src/frontend/tests/ZeroTrustLens.test.tsx`
- `documentation/reviews/review-pr-036-hu-front-05-zero-trust-lens.md`

---

## 4. Verificación Funcional y Automatizada

Se ejecutó la suite completa de pruebas unitarias, verificación estática y compilación de producción:

```bash
npm test
npx tsc --noEmit -p src/frontend/tsconfig.json
npm run build
```

Resultados certificados:
- **Pruebas Unitarias (Vitest):** 10/10 suites aprobadas (78/78 pruebas pasando al 100%), incluyendo 10 pruebas especializadas en `ZeroTrustLens.test.tsx`.
- **Tipado Estático (TypeScript):** `tsc --noEmit` completado con 0 errores.
- **Compilación de Producción (Next.js 14):** `next build` exitoso, generando bundle optimizado sin advertencias de hidratación ni dependencias circulares.

---

## 5. Alcance y Gobernanza

- Se limitó la intervención a los componentes de interfaz de seguridad, nodos y canvas topológico.
- Se preservaron íntegras las entregas de HU-FRONT-01, HU-FRONT-02 (SSE), HU-FRONT-03 (Time Travel), HU-FRONT-04 (Copiloto) y HU-FRONT-06 (Linaje de datos).
- La solución cumple estrictamente con el sistema cromático unificado Grecia clásica (#FFFFFF, #B8860B, #FAFAFA, #E8E4DC).
