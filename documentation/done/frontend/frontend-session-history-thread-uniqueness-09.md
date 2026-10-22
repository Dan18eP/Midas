# HU-FRONT-07: Unicidad del Hilo Conversacional en el Historial de Sesiones

- **ID de la Historia:** `HU-FRONT-07`
- **Título Oficial:** Corrección de sesiones duplicadas en el "Historial de Sesiones"
- **Rama:** `feature/agent-deterministic-gold-queries`
- **Responsable:** Edgar Corzo
- **Módulos de Código:**
  - `src/frontend/components/copilot/useCopilotChat.ts`
  - `src/frontend/components/copilot/CopilotChatDrawer.tsx`
  - `src/frontend/app/page.tsx`
  - `src/frontend/tests/CopilotChatDrawer.test.tsx`
  - `tests/conftest.py`
  - `tests/api/test_lineage_and_sessions.py`
- **Fecha de Entrega:** Jueves 22 de Octubre de 2026

---

## 1. Problema Reportado

El panel "Historial de Sesiones" mostraba una entrada adicional por cada conversación
iniciada desde el Welcome Hub. En lugar de una sola sesión con todos los turnos,
aparecían dos entradas:

- La sesión creada explícitamente (`POST /api/v1/sessions`) con el título del prompt, pero con 0 turnos.
- Una sesión implícita titulada **"Conversación con Copiloto"** que contenía el primer turno.

Adicionalmente, el historial aparecía contaminado con sesiones de ejemplo como
**"Sesión Canvas Dinámico"**, **"Sesión Copiloto Test"** y **"Por favor muéstrame las ventas"**.

---

## 2. Causa Raíz

### 2.1. Cierre obsoleto del `thread_id` (frontend)

`handleWelcomeSendPrompt` ejecutaba:

```ts
copilotChat.setThreadId(currentSessionId);
await copilotChat.send(promptText);
```

En React, `setThreadId` agenda una actualización de estado; la función `send` de ese
mismo render conservaba el `threadId` anterior (un identificador aleatorio generado
al montar el hook). El primer turno viajaba con un hilo distinto al de la sesión
recién creada, por lo que el backend registraba una segunda sesión.

### 2.2. Contaminación del PostgreSQL operativo por pruebas

`tests/api/test_lineage_and_sessions.py` usa `TestClient`, que comparte el singleton
`SessionStore`. Al ejecutarse dentro de `midas-api` (donde `OPERATIONAL_DB_URL`
resuelve a `midas-postgres`), cada corrida escribía sesiones de ejemplo en
`midas_operational`. Al reiniciar la API, esas filas se hidrataban y aparecían en el
historial del usuario.

---

## 3. Corrección Implementada

### 3.1. Hilo conversacional con fuente de verdad síncrona

- `useCopilotChat` ahora mantiene `threadIdRef` además del estado de React.
- `setThreadId` actualiza el ref y el estado de forma atómica.
- `send(text, threadIdOverride?)` acepta un hilo explícito y usa
  `threadIdOverride ?? threadIdRef.current`, eliminando el cierre obsoleto.
- Tras cada respuesta, el hook adopta `payload.thread_id` devuelto por el backend.
- `handleWelcomeSendPrompt` envía el primer turno con `send(promptText, currentSessionId)`.
- Se marca la sesión recién creada como cargada para que el efecto de restauración no
  reinicie el chat mientras el primer turno está en vuelo.

### 3.2. "Nueva conversación" coherente con el workspace

`CopilotChatDrawer` ahora invoca también `startNewSession()` del `SessionContext` al
pulsar el botón de nueva conversación, evitando que el siguiente mensaje cree una
sesión huérfana mientras el sidebar mantiene otra sesión activa.

### 3.3. Aislamiento de pruebas

`tests/conftest.py` fuerza el `SessionStore` a operar solo en memoria durante toda la
suite (sin engine ni persistencia PostgreSQL), de modo que las pruebas no vuelven a
escribir en la base operativa.

---

## 4. Verificación

| Verificación | Resultado |
| :--- | :--- |
| Frontend Vitest | **148/148 pruebas** pasando |
| TypeScript | `tsc --noEmit` sin errores |
| Backend Pytest (agente, api, backend, core) | **153/153 pruebas** pasando |
| Persistencia de pruebas en PostgreSQL | **0 filas nuevas** tras ejecutar la suite |
| Prueba E2E en navegador | Primera conversación: **1 sola sesión** con 2 turnos; segundo mensaje eleva a **4 turnos** sin crear otra entrada |
| Historial tras limpieza | Queda únicamente la sesión real de ingesta, sin duplicados de prueba |

---

## 5. Criterios de Aceptación

| Criterio | Estado |
| :--- | :---: |
| Una conversación genera una única entrada en el historial | Cumplido |
| El primer turno se persiste en la sesión creada, no en una sesión implícita | Cumplido |
| Los turnos sucesivos conservan el mismo `thread_id` | Cumplido |
| El botón "Nueva conversación" reinicia chat y sesión activa | Cumplido |
| Las pruebas automatizadas no contaminan la base operativa | Cumplido |
