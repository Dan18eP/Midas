# HU-AI-02: Generación Text-to-Gold y guardas OWASP

- **ID:** HU-AI-02
- **Rama:** `feature/agent-text-to-gold-guardrails`
- **Responsables:** Elian Rivera (AI Lead) / Daniel Echeverría
- **Referencias canónicas:** `documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md` y `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Fecha:** 18 de octubre de 2026

## Revisión anti-deriva

- [x] Se revisaron las fórmulas canónicas de negocio y no se modificaron.
- [x] Los nombres de tablas y columnas se aceptan solo desde el catálogo introspeccionado de Trino; no se agregaron tablas ni columnas al esquema de negocio.
- [x] El ejecutor SQL recibe únicamente una consulta de lectura validada.
- [x] La implementación se limita a `src/agent/`, `tests/agent/` y la documentación del agente.

## Implementación

- `src/agent/tools/text_to_sql.py` construye el prompt de generación SQL para Trino con las tablas y columnas recibidas del catálogo activo y llama al proveedor de modelo inyectado.
- `src/agent/guardrails/prompt_injection_shield.py` rechaza intentos de alterar las instrucciones o revelar información secreta antes de llamar al proveedor del modelo.
- `src/agent/guardrails/query_guardrail.py` analiza SQL con `sqlglot` en dialecto Trino. Acepta una sola sentencia `SELECT`, valida tablas y columnas, rechaza referencias desconocidas y `CROSS JOIN`, y agrega `LIMIT 1000` cuando falta.
- `src/agent/graph/nodes/pipeline.py` detiene el flujo si falta el catálogo, bloquea consultas inválidas antes de ejecutarlas en Trino y no expone errores internos en el chat.
- `src/agent/requirements.txt` incluye el parser SQLGlot.

## Correcciones de revisión para HU-AI-01

Se atendieron las observaciones de Daniel en el PR #23:

- `build_graph` ahora acepta `BaseCheckpointSaver`, compatible con los guardados PostgreSQL y en memoria.
- Las respuestas proactivas, aclaraciones, resultados y errores se agregan al historial como objetos `AIMessage`.
- El enrutador conserva la pregunta de ventas pendiente y la combina con el año recibido en el siguiente turno.
- Los filtros SQL basados en expresiones regulares se reemplazaron por análisis AST de Trino, evitando falsos positivos cuando palabras de modificación aparecen dentro de valores literales.

## Verificación

- **Comando:** `python -m pytest tests/agent/test_query_guardrails.py tests/agent/test_langgraph_flow.py -q`
- **Resultado:** 58 pruebas aprobadas en 3,14 s.
- **Verificación adicional:** `python -m compileall -q src/agent tests/agent` finalizó correctamente.
- La suite bloquea los 20 ejemplos de prompt injection y las 20 consultas SQL maliciosas. También valida el catálogo, la inserción del límite, valores literales seguros, historial de mensajes, contexto de aclaraciones y detención cuando no hay catálogo.
- **Prueba con Trino y modelo en vivo:** No ejecutada. Ambas integraciones se reciben como servicios inyectados y este entorno no tiene un modelo ni una conexión Trino configurados.

## Impacto y reversión

- No se modificaron fórmulas canónicas, esquemas de tablas ni endpoints compartidos.
- Revertir el commit de HU-AI-02 elimina el generador, las guardas, la conexión con el flujo y este informe. Las correcciones de revisión de HU-AI-01 están incluidas en ese mismo commit.
