# Entrega: Aislamiento Estricto de Catálogo por Sesión, Resiliencia Trino y Estabilización de Analítica

> **Entrega:** FIX-SESSION-ISOLATION-08  
> **Fecha:** Domingo, 25 de Octubre de 2026  
> **Autores:** Daniel Echeverría & Antigravity  
> **Área:** Agent, Query Engine, Lakehouse & Frontend Analytics  

---

## 1. Problemas Abordados y Soluciones Técnicas

### 1.1 Aislamiento Estricto del Catálogo en el Copiloto
- **Problema:** Al consultar al Copiloto con preguntas generales como *"explorar el dataset"* dentro de una sesión de clientes CSV (`customers-100000`), el agente respondía analizando hechos de ventas (`gold.fct_ventas_diarias`) y tiendas físicas.
- **Causa Raíz:** En `dialogic.py` y `agent.py`, todas las tablas Gold del Lakehouse y tablas demo de ventas se inyectaban incondicionalmente en el catálogo del agente, ignorando la conexión de la sesión.
- **Solución:** Se limitó el catálogo estrictamente a las tablas de la conexión activa (`active_cid`). Las tablas Gold solo se incluyen si pertenecen a esa misma conexión. Se eliminó el retorno forzado de esquemas demo de ventas.

### 1.2 Resiliencia ante Inicialización de Trino (Cero Errores 500)
- **Problema:** En el inicio de Trino, el frontend recibía ráfagas de errores HTTP 500 en `/api/v1/query/execute`.
- **Causa Raíz:** Trino respondía con `Trino server is still initializing`, lo cual no activaba el motor determinista local y lanzaba un `RuntimeError` no capturado.
- **Solución:** Se añadió detección explícita de `"initializing"`, `"still initializing"`, `"server is starting"` y `"unavailable"` en `trino_client.py` y `query.py`, activando de inmediato el motor local Parquet/SQLite y retornando HTTP 200 con datos reales.

### 1.3 Estabilización del Centro de Analítica (`SessionAnalyticsView.tsx`)
- **Problema:** La barra superior mostraba tablas de todas las conexiones corporativas (`pg_crm_default`, `excel_budget_default`) y el contador fluctuaba erráticamente entre 0 y 100.000 filas.
- **Causa Raíz:** `SessionAnalyticsView.tsx` iteraba sobre todas las conexiones del sistema, añadía `silver.crm_transacciones` por defecto y reseteaba `realTotalCount` a `null` ante fallos o cambios de pestaña.
- **Solución:** Se eliminó la inyección de conexiones ajenas y el fallback a `crm_transacciones`. Si no hay conexión activa, la lista queda vacía. Se desacopló la consulta de Trino del cambio de pestañas (`activeTab`) y se preservan los registros ya cargados en memoria.

### 1.4 Habilitación del Modo Local con Qwen 2.5: 3B en Ollama
- **Problema:** Al activar el modo Local Zero-Trust en el Copiloto, fallaba indicando que no era posible conectar con el modelo.
- **Causa Raíz:** El modelo `qwen2.5:3b` no estaba descargado en el entorno de Ollama local.
- **Solución:** Se descargó y verificó `qwen2.5:3b` (1.9 GB) en el servidor de Ollama local (`127.0.0.1:11434`), quedando 100% operativo para inferencia local confidencial.

### 1.5 Corrección de Hydration y Re-subida de Archivos
- **Problema:** Error 400 Bad Request al subir el mismo archivo dos veces y warnings de React en consola (`data-message-id did not match` y missing unique keys).
- **Causa Raíz:** `createId` generaba timestamps divergentes entre SSR y cliente; la subida rechazaba nombres existentes con `ValueError`.
- **Solución:** Se fijó un ID estático determinista para el mensaje de bienvenida, se garantizaron keys compuestas únicas (`${message.id}-${index}`) y se implementó reutilización resiliente de conexiones en `/upload`.

---

## 2. Verificación de Calidad
- **Frontend (Vitest):** 147/147 pruebas aprobadas al 100%.
- **Frontend (TypeScript):** 0 errores (`tsc --noEmit`).
- **Backend (Pytest):** 299/299 pruebas aprobadas al 100%.
