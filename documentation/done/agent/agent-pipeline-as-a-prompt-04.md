# HU-AI-04: Activador de materialización de DAGs en Airflow

- **ID:** HU-AI-04
- **Rama oficial:** `feature/agent-pipeline-as-a-prompt`
- **Contrato oficial:** `documentation/adr/ADR-005-orquestacion-y-dag-factory-en-airflow.md`
- **Contrato del agente:** `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`

## Comportamiento entregado

- La tarjeta de aprobación Text-to-Gold del PR #30 envía la confirmación a `/api/v1/agent/chat`. El backend reutiliza el SQL y el catálogo validados en ese hilo. Los clientes directos también pueden usar `POST /api/v1/agent/materialize` con `confirmed: true`.
- El agente valida una única consulta Trino de solo lectura, comprueba la frecuencia cron y las políticas de calidad, y crea un contrato YAML en `midas-governance/airflow-specs/`.
- Después de guardar el contrato, el publicador emite `NEW_GOLD_NODE_AVAILABLE` mediante el hub de telemetría existente.
- La fábrica de Airflow vuelve a cargar los contratos mientras el scheduler analiza el directorio montado de DAGs. Cada contrato válido crea una tarea Spark y una tarea de notificación para Canvas.
- `jobs/materialize_gold.py` escribe el resultado de la consulta en la tabla Iceberg Gold solicitada y valida la política configurada de cantidad de filas.
- Docker Compose ofrece un perfil `orchestration` con los servicios webserver y scheduler de Airflow.

## Controles contra desviaciones

- [x] No se modificaron las fórmulas de métricas ni los esquemas de tablas existentes.
- [x] El SQL se valida con el catálogo de Trino antes de publicar.
- [x] Los contratos contienen SQL y parámetros declarativos; no incluyen código Python generado por el modelo.
- [x] El destino permanece en el esquema canónico `gold`.

## Verificación

- `python -m pytest tests/agent/test_dag_generator.py -v` — 5 pruebas aprobadas.
- `python -m pytest tests/api/test_agent_materialization.py -v` — 3 pruebas aprobadas.
- `python -m compileall -q src/agent/tools/dag_generator.py src/agent/guardrails/query_guardrail.py src/api/routes/agent.py src/orchestration/dag_factory.py jobs/materialize_gold.py` — aprobado.
- `docker compose config --quiet` — aprobado.
- Prueba de ejecución: no realizada. El repositorio no define un servicio Spark; antes de ejecutar un DAG generado, configura un clúster Spark accesible y su catálogo Iceberg. Este cambio no incluyó una prueba de inicio de Airflow ni de consulta a MinIO.

## Seguimiento en GitHub

- La incidencia [#17](https://github.com/Dan18eP/Midas/issues/17) está asignada a Daniel Echeverría y Elian Rivera.
- Estado en el proyecto Midas: **En progreso**.
