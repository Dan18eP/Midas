# Bitácora de Cambios Diaria — 25-10-2026
> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Fecha:** Domingo, 25 de Octubre de 2026  

---

### Registro de Actividades

- `[Domingo]-[25/10/2026]-[16:15] - [Daniel Echeverría & Antigravity] : [FIX / REMEDIATION: Aislamiento estricto de catálogo por sesión, erradicación de errores 500 por inicialización en Trino, estabilización de métricas en Centro de Analítica y habilitación de Qwen 2.5: 3B local en Ollama. En dialogic.py y agent.py se eliminó el fallback a crm_transacciones y tablas gold globales, restringiendo los esquemas del Copiloto exclusivamente a la conexión activa (1 Sesión = 1 Conexión). En trino_client.py y query.py se capturan los estados 'still initializing' y errores transitorios de Trino para activar de inmediato el motor local Parquet/SQLite sin arrojar HTTP 500. En SessionAnalyticsView.tsx se eliminó la inyección global de todas las tablas de conexiones corporativas y el fallback forzado a crm_transacciones, estabilizando el estado para erradicar el parpadeo de 0 a 100.000 filas. En connections.py se manejaron duplicados de subida con reutilización resiliente de conexiones (cero 400 Bad Request). En useCopilotChat.ts y ChatConversation.tsx se fijó ID estático determinista para SSR y keys únicas, erradicando advertencias de hidratación en Next.js. Descarga y puesta en marcha de qwen2.5:3b en Ollama local (puerto 11434). 299/299 pruebas Pytest y 147/147 pruebas Vitest aprobadas al 100%, 0 errores de compilación TypeScript.]`
