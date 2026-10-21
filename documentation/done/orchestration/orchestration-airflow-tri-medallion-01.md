# HU-ORCH-01: Airflow Tri-Medallion Orchestration

This delivery adds connection-based Bronze and Silver DAGs, governed Gold DAGs, and Spark jobs for each medallion transition.

## Delivery details

| Item | Value |
|---|---|
| Story | HU-ORCH-01 |
| Branch | `feature/orchestration-airflow-dag-factory` |
| Owner | Elian Rivera (`aZian10`) |
| Reference | [ADR-009](../../adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md) |
| Backlog issue | [#42](https://github.com/Dan18eP/Midas/issues/42) |

## Implementation

- `src/orchestration/dag_factory.py` loads connection contracts from `source-contracts/` and Gold contracts from `airflow-specs/` in the `midas-governance` bucket. It creates `dag_ingest_<conn_id>`, `dag_clean_<conn_id>`, and `dag_gold_<pipeline_id>` with validated cron schedules.
- `jobs/ingest_bronze.py` extracts governed PostgreSQL, CSV, or REST sources and writes audited Parquet to Bronze.
- `jobs/transform_silver.py` normalizes dates and `DECIMAL(18,2)` amounts, applies key and quality checks, and sends invalid rows to quarantine before writing Silver Iceberg.
- `jobs/materialize_gold.py` writes to a temporary Iceberg table, checks the result, then publishes it to Gold.
- Each job publishes start and completion or failure events to `POST /api/v1/telemetry/publish`.
- ADR-009 now documents the connection and Gold YAML contract fields.

## Acceptance and verification

- [x] Airflow factory creates all three DAG types with scheduled cron expressions.
- [x] Tests confirm the generated DAG IDs, schedules, fixed UTC start date, and disabled catchup.
- [x] Gold contract validation remains covered by the existing agent DAG generator tests.
- [x] Existing canonical business formulas were not changed.
- [x] Telemetry uses the existing `TelemetryEvent` API contract; source credentials are read from environment variables.

Commands and results:

```text
python -m compileall -q jobs src/orchestration tests/orchestration
Passed

python -m pytest tests/orchestration/test_tri_medallion_factory.py tests/agent/test_dag_generator.py -q
7 passed

git diff --check
Passed
```

Airflow parsing and Spark, MinIO, Iceberg, and telemetry integration were not run against live services. Those runtime checks still require the configured Docker services and governed source credentials.

## Rollback boundary

Revert the HU-ORCH-01 commit to remove the three DAG registrations, their Spark jobs, the new factory tests, and the corresponding ADR and delivery notes. No database migration or canonical business formula change is included.
