# HU-FRONT-05: Zero-Trust Security Lens & Interactive Role Switcher UI

- **ID de la Historia:** `HU-FRONT-05`
- **Título Oficial:** Zero-Trust Security Lens & Interactive Role Switcher UI
- **Rama Oficial:** `feature/frontend-zero-trust-lens`
- **Responsable:** Joshua Gonzales (`UI/UX & Frontend Partner`)
- **Módulo de Código:** `src/frontend/components/security/ZeroTrustLens.tsx`
- **Fecha de Entrega:** Martes 20 de Octubre de 2026

---

## 1. Verificación de Criterios de Aceptación

| Criterio | Estado | Evidencia |
| :--- | :---: | :--- |
| Selector de perfiles en cabecera: Director General, Gerente Regional Norte, Auditor de Cumplimiento | ✅ Cumplido | `src/frontend/app/page.tsx` + `src/frontend/components/security/ZeroTrustLens.tsx` renderizan un selector interactivo con roles `admin`, `rbac` y `compliance`. |
| Efecto visual en Canvas: nodos no autorizados se atenúan al 30% y muestran candado | ✅ Cumplido | `PipelineCanvas.tsx` aplica `opacity: 0.3`, `grayscale` y icono `Lock` en nodos restringidos por `securityRole`; además se muestran mensajes de política. |
| Tablas y gráficas: datos PII con máscara reactiva inmediata | ✅ Cumplido | `ZeroTrustLens` incluye preview con mask de email (`u****@riwi.io`) y salario (`****`) y se refleja al cambiar el rol sin recarga. |
| Banner superior informativo | ✅ Cumplido | El banner muestra: `Simulando sesión bajo perfil: [Nombre de Rol] · Políticas Ranger activas`. |

---

## 2. Implementación realizada

### 2.1. Selector de roles y banner de sesión
- Se creó el componente `ZeroTrustLens` con tres perfiles:
  - `Director General` (`admin`)
  - `Gerente Regional Norte` (`rbac`)
  - `Auditor de Cumplimiento` (`compliance`)
- El selector se integra en la cabecera de la consola principal y propaga el estado `selectedRole` a la vista del canvas.
- El banner superior se renderiza con el texto canónico establecido por la historia:
  - `Simulando sesión bajo perfil: ... · Políticas Ranger activas`

### 2.2. Canvas con zero-trust enforcement
- `PipelineCanvas.tsx` recibe `securityRole` y aplica la lógica de enmascaramiento/ocultación por rol.
- Nodos no autorizados se procesan con:
  - `opacity: 0.3`
  - `grayscale` ligero
  - `Lock` visible en la esquina superior derecha
  - texto de advertencia `Datos protegidos por política`

### 2.3. Máscara de PII reactiva
- En el componente `ZeroTrustLens` se implementó una vista previa con tabla y métricas simuladas.
- Para roles restringidos:
  - `email`: `u****@riwi.io`
  - `salary`: `****`
- El cambio de perfil se refleja inmediatamente sin recarga ni reinicio de vista.

---

## 3. Archivos involucrados

- `src/frontend/app/page.tsx`
- `src/frontend/components/security/ZeroTrustLens.tsx`
- `src/frontend/components/canvas/PipelineCanvas.tsx`
- `src/frontend/components/canvas/nodes/SourceNode.tsx`
- `src/frontend/components/canvas/nodes/StageNode.tsx`

---

## 4. Verificación funcional

Se validó con la suite existente del frontend y la comprobación de tipos:

```bash
npm run test -- --run
npm run lint
```

Resultado: `19/19 pruebas pasando` y `tsc --noEmit` sin errores.

---

## 5. Alcance y gobernanza

- Se limitó la modificación al área de Frontend/Módulo de seguridad y canvas.
- No se alteraron procesos de negocio ni componentes ajenos a la historia.
- La solución está enfocada en demostrar visualmente la adaptación de la UI ante perfiles con restricciones de seguridad.
