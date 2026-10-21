# HU-ORCH-01: Orquestación tri-medallón en Airflow

Esta entrega agrega DAGs Bronze y Silver organizados por conexión, DAGs Gold gobernados y jobs de Spark para cada transición entre medallones.

## Detalles de la entrega

| Elemento | Valor |
|---|---|
| Historia | HU-ORCH-01 |
| Rama | `feature/orchestration-airflow-dag-factory` |
| Responsable | Elian Rivera (`aZian10`) |
| Referencia | [ADR-009](../../adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md) |
| Incidente del backlog | [#42](https://github.com/Dan18eP/Midas/issues/42) |

## Implementación

- `src/orchestration/dag_factory.py` carga contratos de conexión desde `source-contracts/` y contratos Gold desde `airflow-specs/` en el bucket `midas-governance`. Crea `dag_ingest_<conn_id>`, `dag_clean_<conn_id>` y `dag_gold_<pipeline_id>` con cronogramas cron validados.
- `jobs/ingest_bronze.py` extrae datos gobernados de PostgreSQL, CSV o REST y escribe Parquet con auditoría en Bronze.
- `jobs/transform_silver.py` normaliza fechas e importes `DECIMAL(18,2)`, aplica validaciones de claves y calidad, y envía las filas inválidas a cuarentena antes de escribir Iceberg Silver.
- `jobs/materialize_gold.py` escribe en una tabla Iceberg temporal, valida el resultado y luego lo publica en Gold.
- Cada job publica eventos de inicio y de finalización o error en `POST /api/v1/telemetry/publish`.
- ADR-009 ahora documenta los campos de los contratos YAML de conexión y Gold.

## Aceptación y verificación

- [x] La fábrica de Airflow crea los tres tipos de DAG con expresiones cron programadas.
- [x] Las pruebas confirman los IDs y cronogramas de los DAGs generados, la fecha de inicio UTC fija y la recuperación desactivada.
- [x] Las pruebas existentes del generador de DAGs del agente siguen cubriendo la validación de contratos Gold.
- [x] No se modificaron las fórmulas de negocio canónicas existentes.
- [x] La telemetría usa el contrato API existente `TelemetryEvent`; las credenciales de origen se leen desde variables de entorno.

Comandos y resultados:

```text
python -m compileall -q jobs src/orchestration tests/orchestration
Correcto

python -m pytest tests/orchestration/test_tri_medallion_factory.py tests/agent/test_dag_generator.py -q
7 pruebas correctas

git diff --check
Correcto
```

El análisis de DAGs de Airflow y la integración de Spark, MinIO, Iceberg y telemetría no se ejecutaron contra servicios activos. Esas verificaciones requieren los servicios Docker configurados y las credenciales gobernadas de las fuentes.

## Alcance de reversión

Revertir el commit de HU-ORCH-01 elimina los tres registros de DAG, sus jobs de Spark, las nuevas pruebas de la fábrica y el ADR y las notas de entrega correspondientes. No se incluyen migraciones de base de datos ni cambios en fórmulas de negocio canónicas.
