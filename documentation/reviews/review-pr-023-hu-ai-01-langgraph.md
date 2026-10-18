# Dictamen de Revisión Técnica y Observaciones de Arquitectura — PR #23

> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Pull Request:** [#23 — `feat(agent): HU-AI-01 LangGraph state machine`](https://github.com/Dan18eP/Midas/pull/23)  
> **Historia de Usuario:** HU-AI-01 / Issue #14  
> **Autor:** Elian David Rivera Guaca (@aZian10)  
> **Revisor / Líder Técnico:** Daniel Echeverría  
> **Fecha:** Domingo, 18 de Octubre de 2026  
> **Estado:** Aprobado para integración con observaciones técnicas de evolución  

---

## 1. Resumen de la Auditoría

El Pull Request #23 implementa la máquina de estados conversacional con LangGraph para el agente de IA, dando cumplimiento satisfactorio a los cuatro criterios de aceptación definidos para la **HU-AI-01**:

1. **Grafo estructurado de 7 nodos:** Implementación secuencial y condicional correcta de `route_intent` -> `introspect_schema` -> `proactive_suggest` -> `generate_sql` -> `validate_guardrails` -> `execute_query` -> `synthesize_storytelling`.
2. **Modo Dialógico Proactivo:** Respuesta proactiva ante saludos y solicitudes de descubrimiento, enumerando las fuentes configuradas (`crm_operaciones`, `Presupuesto_Corporativo_2026.xlsx`, `helpdesk_tickets_live`) y presentando tres análisis de alto impacto, permitiendo la inyección dinámica de proveedores de metadatos.
3. **Memoria por sesión:** Integración con checkpointer de LangGraph (`PostgresSaver` / `InMemorySaver`), aislando el estado conversacional mediante `thread_id`.
4. **Manejo de ambigüedades:** Detección de consultas analíticas de ventas sin año, generando repregunta inmediata (2024, 2025 o 2026) y deteniendo la ruta antes de la generación SQL.

Adicionalmente, se constató cumplimiento estricto del protocolo *Document-First* (commit `6417a20` en documentación canónica previo a la codificación `414473d`), respeto al aislamiento de área (*Single-Area Ownership* bajo `src/agent/` y `tests/agent/`), y paso exitoso del 100% de la suite de pruebas unitarias (`6 passed in 3.68s`).

---

## 2. Observaciones Técnicas y Recomendaciones de Evolución (HU-AI-02 / HU-AI-03)

Las siguientes observaciones no bloquean la aprobación de la HU-AI-01, pero deben ser consideradas y abordadas formalmente en el desarrollo de las siguientes historias del agente (`HU-AI-02: Generación SQL con Semántica de Catálogo` y `HU-AI-03: Storytelling y Visualización ECharts`):

### 2.1. Tipado del Checkpointer en `src/agent/graph/builder.py`
- **Diagnóstico actual:** La función `build_graph` tipa su primer parámetro como `checkpointer: PostgresSaver`. Sin embargo, en la suite de pruebas (`tests/agent/test_langgraph_flow.py`) se inyecta `InMemorySaver()`. Ambas clases derivan de `BaseCheckpointSaver`.
- **Impacto:** Herramientas de análisis estático estricto (como `mypy` o `pyright`) reportan incompatibilidad de tipos al pasar instancias de `InMemorySaver`.
- **Recomendación para HU-AI-02:** Actualizar la firma importando `from langgraph.checkpoint.base import BaseCheckpointSaver` y tipar como `checkpointer: BaseCheckpointSaver`.

### 2.2. Registro de Respuestas del Asistente en el Historial (`AIMessage`)
- **Diagnóstico actual:** En `invoke_turn`, se añade `HumanMessage(content=user_message)` a la lista `state["messages"]`. Los nodos del diálogo (`proactive_suggest` y `synthesize`) retornan un campo `response: str` en el estado, pero no anexan el mensaje de respuesta como objeto `AIMessage` a `state["messages"]`.
- **Impacto:** El reductor de mensajes solo contiene las intervenciones del usuario humano. Para turnos subsecuentes donde el modelo LLM requiera inspeccionar el diálogo completo (mensajes de usuario y respuestas previas del asistente), el contexto conversacional estará incompleto.
- **Recomendación para HU-AI-02:** En `synthesize` y `proactive_suggest`, retornar además un `AIMessage` dentro de la clave `messages` para que el reductor conserve la transcripción completa de la conversación.

### 2.3. Preservación y Fusión de Contexto en Clarificaciones Multi-Turno
- **Diagnóstico actual:** Cuando un usuario escribe *"Quiero ver las ventas"*, el agente detecta la falta de año y solicita clarificación. Si en el turno siguiente el usuario responde únicamente *"2026"*, el enrutador procesa este mensaje de forma aislada.
- **Impacto:** Al no haber mención explícita de "ventas" en el segundo mensaje, la intención original se pierde a menos que se mantenga en una clave persistente de estado (slot filling).
- **Recomendación para HU-AI-02:** Diseñar un mecanismo de memoria contextual en el estado que retenga la intención analítica pendiente (`pending_intent` / `pending_query`) para que al resolver la clarificación, la entrada que llegue a `generate_sql` sea la consulta consolidada (*"Quiero ver las ventas de 2026"*).

### 2.4. Evolución de Guardrails SQL: De Expresiones Regulares a Parser AST
- **Diagnóstico actual:** El nodo `validate` en `pipeline.py` implementa un filtro de seguridad por expresiones regulares que bloquea palabras clave (`insert|update|delete|drop|alter|create|truncate|grant|revoke`) y cadenas con punto y coma (`;`), forzando `LIMIT 1000`.
- **Impacto:** Si bien este mecanismo es efectivo como barrera inicial (*fail-closed*), genera falsos positivos si una consulta analítica legítima busca valores literales dentro de un filtro (por ejemplo: `WHERE action = 'create'` o `WHERE estado_transaccion = 'updated'`).
- **Recomendación para HU-AI-02:** Integrar un parser formal de AST SQL (como `sqlglot`) para inspeccionar la semántica del árbol de consulta, validando con precisión si el nodo es de mutación DDL/DML versus una constante en una cláusula `WHERE`.

---

## 3. Conclusión

El trabajo desarrollado por Elian Rivera proporciona una base modular, desacoplada y robusta para la máquina conversacional de Midas. Se autoriza la integración a `develop`.
