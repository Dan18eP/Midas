# HU-AI-01: LangGraph Conversational State Machine & Proactive Dialogic Mode

- **ID:** HU-AI-01
- **Rama:** `feature/agent-langgraph-state-machine`
- **Responsable:** Elian Rivera (AI Lead)
- **Referencia canónica:** `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Fecha:** 17 de octubre de 2026

## Verificación Anti-Code Drift

- [x] Se revisaron las fórmulas canónicas; esta entrega no las modifica.
- [x] Se revisaron los esquemas canónicos; esta entrega no cambia tablas ni columnas.
- [x] La ejecución analítica queda detrás de un validador de solo lectura y del servicio Trino inyectado.
- [x] La persistencia usa la base operacional PostgreSQL ya definida por la arquitectura.

## Implementación

- `src/agent/state.py` define el estado y conserva mensajes con el reductor de LangGraph.
- `src/agent/graph/nodes/router.py` detecta saludos, consultas y ventas sin año.
- `src/agent/graph/nodes/dialogic.py` enumera fuentes disponibles, su esquema y tres sugerencias; ante ventas sin año ofrece 2024, 2025 y 2026.
- `src/agent/graph/nodes/pipeline.py` define los pasos de generación, guardrails, ejecución y síntesis. Los servicios de generación SQL, fuentes activas y Trino se inyectan al grafo.
- `src/agent/graph/builder.py` arma la secuencia de siete nodos y configura persistencia por `thread_id` con `PostgresSaver`.
- `src/agent/requirements.txt` declara versiones compatibles de LangGraph y el guardado PostgreSQL.

El catálogo incluido es el catálogo de demostración de la arquitectura. Para consultar conectores activos y ejecutar consultas reales, la aplicación debe inyectar el proveedor de fuentes, el generador SQL y el ejecutor Trino. Sin esos servicios, el agente informa que no están configurados y no inventa resultados. El generador SQL real y la integración Trino pertenecen a las historias de consulta del backlog.

## Verificación

- **Pruebas:** `pytest tests/agent/test_langgraph_flow.py -v`
- **Resultado:** 6 pruebas aprobadas con Python 3.13.2 y pytest 9.1.1.
- Las pruebas cubren saludo y tres sugerencias, pregunta por año, fuentes activas, bloqueo de cambios SQL, límite 1000 y aislamiento de memoria entre sesiones.
- La prueba de memoria usa `InMemorySaver`; la conexión real a PostgreSQL requiere que el servicio esté disponible y se configura al iniciar la aplicación.
- Para instalar dependencias: `python -m pip install -r src/agent/requirements.txt pytest`.
- **Escenario de ejecución real:** N/A; este checkout aún no tiene servidor API para iniciar. El grafo se ejercitó directamente en las pruebas.

## Impacto y coordinación

- Cambios limitados al módulo `src/agent/`, su prueba de aceptación y los documentos del agente.
- No se modificaron endpoints compartidos, fórmulas contables ni tablas de negocio.
- El PostgreSQL operativo existente almacena los checkpoints; no requiere modificar Docker.
- **Reversión:** revertir el commit HU-AI-01 elimina el grafo, sus pruebas, dependencias y esta especificación de entrega.
