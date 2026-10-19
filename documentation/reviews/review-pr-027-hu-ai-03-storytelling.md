# Dictamen de Revisión Técnica — Pull Request #27

> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Pull Request:** [#27 — `feat(agent): HU-AI-03 narrativa ejecutiva y síntesis ECharts`](https://github.com/Dan18eP/Midas/pull/27)  
> **Historia de Usuario:** `HU-AI-03` / Issue #16  
> **Autor:** Elian David Rivera Guaca (@aZian10)  
> **Revisor / Líder Técnico:** Daniel Echeverría  
> **Fecha:** Lunes, 19 de Octubre de 2026 (07:17 AM)  
> **Estado:** **REQUIERE CORRECCIONES (CHANGES REQUESTED)**  

---

## 1. Resumen de la Auditoría

Se valora positivamente la implementación de la lógica de **cero alucinación de cifras** en `narrative_generator.py`, la adopción rigurosa de la paleta corporativa Midas (`#0F766E`, `#14B8A6`, `#F59E0B`, `#1E293B`) y las reglas de deducción de gráficos (series temporales con área, dispersión y barras horizontales) en `echarts_synthesizer.py`.

No obstante, el Pull Request **no puede ser integrado a `develop` en su estado actual** debido a los siguientes tres motivos técnicos que deben ser subsanados:

---

## 2. Puntos Críticos a Corregir

### 2.1. Regresión en la Suite de Pruebas Existente
- **Diagnóstico:** Al ejecutar la suite de pruebas del agente sobre la rama, se produce un fallo directo:
  ```
  FAILED tests/agent/test_langgraph_flow.py::test_analytic_request_runs_sql_guardrails_and_query
  AssertionError: assert '1 filas' in result['response']
  ```
- **Causa Raíz:** En `src/agent/graph/nodes/pipeline.py`, el nodo `synthesize` serializó todo el diccionario de storytelling como string JSON crudo (`response = json.dumps(result)`), rompiendo el contrato previo sin actualizar la aserción correspondiente.

### 2.2. Ausencia Total de Pruebas Unitarias para Storytelling
- **Diagnóstico:** Se incorporaron más de 200 líneas de lógica nueva en `src/agent/storytelling/`, pero no se incluyó ningún archivo de prueba unitaria (como fue admitido en la descripción del PR: *"Pruebas automatizadas e integración con Trino/ECharts — no ejecutadas"*).
- **Acción Requerida:** Añadir `tests/agent/test_storytelling.py` que valide al 100%:
  1. Inferencia de líneas y áreas ante datos temporales.
  2. Inferencia de barras horizontales ante categorías discretas.
  3. Inferencia de dispersión ante pares numéricos.
  4. Fallback a opción vacía explicativa cuando los datos son insuficientes.
  5. Disparo de excepción `ValueError` ante intentos de alucinar cifras no presentes en las filas de Trino.

### 2.3. Desacople del Contrato de Respuesta para la Capa de API y Frontend
- **Diagnóstico:** Serializar el JSON completo dentro de `state['response']` provocará que el usuario visualice una cadena JSON cruda en la interfaz de chat en lugar de texto legible en Markdown.
- **Alineación con la Hoja de Ruta (Punto 2.5):**
  - `state['response']` DEBE contener **únicamente la narrativa ejecutiva en Markdown limpio**.
  - El objeto de configuración de gráficos (`echarts_option`) y las métricas de linaje (`metrics_summary`) deben residir en claves estructuradas dedicadas en `AgentState` (o dentro de `state['storytelling_result']`) para permitir su exposición independiente en el endpoint HTTP de FastAPI (`POST /api/v1/agent/chat`).

---

## 3. Resolución del Puente HTTP en Backend

Para desbloquear inmediatamente al Frontend (`HU-FRONT-04`) y proporcionar a Elian la referencia exacta del contrato esperado, el Backend Gateway implementa en `src/api/routes/agent.py` el endpoint `POST /api/v1/agent/chat`, el cual soporta de forma tolerante y retrocompatible:
- Si el agente retorna narrativa limpia en `response`, se envía directamente al chat.
- Si retorna `echarts_option` o `metrics_summary` estructurados, se exponen en campos independientes del JSON de respuesta.
- Si en `response` viene un JSON serializado (estado actual de PR #27), el Gateway lo desanida automáticamente para que el frontend nunca reciba JSON crudo en el texto de chat.
