"""Load governed source and Gold contracts as dynamic Airflow DAGs."""

from __future__ import annotations

import importlib.util
import json
import logging
import os
import re
from datetime import datetime, timedelta, timezone
from typing import Any

import yaml
import sqlglot
from sqlglot import exp
from src.core.cron import is_valid_cron_schedule
from src.lakehouse.storage.minio_client import MidasMinioClient

logger = logging.getLogger(__name__)
SPEC_BUCKET = "midas-governance"
SOURCE_PREFIX = "source-contracts/"
GOLD_PREFIX = "airflow-specs/"
START_DATE = datetime(2026, 1, 1, tzinfo=timezone.utc)


def load_pipeline_specs(storage: MidasMinioClient | None = None) -> list[dict[str, Any]]:
    """Read YAML source and Gold contracts from the governance bucket."""
    client = storage or MidasMinioClient()
    specs: list[dict[str, Any]] = []
    for prefix in (SOURCE_PREFIX, GOLD_PREFIX):
        for object_name in client.list_objects(SPEC_BUCKET, prefix=prefix):
            if not object_name.endswith((".yaml", ".yml")):
                continue
            try:
                spec = yaml.safe_load(client.get_object(SPEC_BUCKET, object_name))
                _validate_spec(spec)
                specs.append(spec)
            except (ValueError, yaml.YAMLError):
                logger.exception("Skipping invalid pipeline spec %s", object_name)
    return specs


def build_dynamic_dags(specs: list[dict[str, Any]]) -> dict[str, Any]:
    """Build ingestion, cleansing, and Gold DAGs from validated contracts."""
    try:
        from airflow import DAG
        from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator
        from airflow.operators.trigger_dagrun import TriggerDagRunOperator
        from airflow import Dataset
        from airflow.timetables.datasets import DatasetOrTimeSchedule
        from airflow.timetables.trigger import CronTriggerTimetable
    except ImportError:
        return {}

    jobs_dir = os.getenv("MIDAS_JOBS_DIR", "/opt/midas/jobs")
    dags: dict[str, Any] = {}
    for spec in specs:
        _validate_spec(spec)
        if spec.get("kind") == "connection":
            conn_id = spec["conn_id"]
            for stage, job_file, tags in (
                ("ingest", "ingest_bronze.py", ["midas", "bronze", "connection", conn_id]),
                ("clean", "transform_silver.py", ["midas", "silver", "connection", conn_id]),
            ):
                dag_id = f"dag_{stage}_{conn_id}"
                # A fixed UTC start date lets Airflow register each scheduled DAG.
                dag = DAG(dag_id=dag_id, schedule=spec["cron_schedule"] if stage == "ingest" else None,
                          start_date=START_DATE, max_active_runs=1,
                          default_args={"retries": 2, "retry_delay": timedelta(seconds=2),
                                        "retry_exponential_backoff": True}, catchup=False, tags=tags)
                with dag:
                    task = SparkSubmitOperator(
                        task_id=f"spark_{stage}_{conn_id}",
                        application=os.path.join(jobs_dir, job_file),
                        conn_id=os.getenv("AIRFLOW_SPARK_CONN_ID", "spark_default"),
                        properties_file="/opt/midas/spark-conf/spark-defaults.conf",
                        py_files=os.path.join(jobs_dir, "runtime.py"),
                        conf={"spark.driver.host": "midas-airflow-scheduler", "spark.driver.bindAddress": "0.0.0.0"},
                        application_args=["--spec-json", json.dumps(spec), "--batch-id",
                                          "{{ dag_run.conf.get('batch_id', run_id) }}"],
                        outlets=[Dataset(spec["silver"]["table"])] if stage == "clean" else [],
                    )
                    if stage == "ingest":
                        trigger = TriggerDagRunOperator(
                            task_id="start_silver", trigger_dag_id=f"dag_clean_{conn_id}",
                            trigger_run_id="{{ run_id }}", reset_dag_run=True,
                            conf={"batch_id": "{{ dag_run.conf.get('batch_id', run_id) }}"},
                        )
                        task >> trigger
                dags[dag_id] = dag
            continue

        pipeline_id = spec["pipeline_id"]
        dag_id = f"dag_gold_{pipeline_id}"
        # A fixed UTC start date lets Airflow register each scheduled DAG.
        tables = sorted({f"{table.db}.{table.name}" for table in
                         sqlglot.parse_one(spec["transform_sql"], read="trino").find_all(exp.Table)
                         if table.db == "silver"})
        dag = DAG(dag_id=dag_id, schedule=DatasetOrTimeSchedule(
                      timetable=CronTriggerTimetable(spec["cron_schedule"], timezone="UTC"),
                      datasets=[Dataset(table) for table in tables],
                  ) if tables else spec["cron_schedule"],
                  start_date=START_DATE, max_active_runs=1,
                  default_args={"retries": 2, "retry_delay": timedelta(seconds=2),
                                "retry_exponential_backoff": True},
                  catchup=False, tags=["midas", "gold", "dynamic"])
        with dag:
            SparkSubmitOperator(
                task_id="spark_materialize_gold",
                application=os.getenv("MIDAS_GOLD_SPARK_JOB", os.path.join(jobs_dir, "materialize_gold.py")),
                conn_id=os.getenv("AIRFLOW_SPARK_CONN_ID", "spark_default"),
                properties_file="/opt/midas/spark-conf/spark-defaults.conf",
                py_files=os.path.join(jobs_dir, "runtime.py"),
                conf={"spark.driver.host": "midas-airflow-scheduler", "spark.driver.bindAddress": "0.0.0.0"},
                application_args=["--spec-json", json.dumps(spec)],
            )
        dags[dag_id] = dag
    return dags


def _validate_spec(spec: Any) -> None:
    """Reject incomplete contracts and unsafe identifiers before DAG creation."""
    if not isinstance(spec, dict) or not is_valid_cron_schedule(spec.get("cron_schedule", "")):
        raise ValueError("Pipeline schedule is invalid")

    if spec.get("kind") == "connection":
        if not re.fullmatch(r"[a-z0-9_]+", str(spec.get("conn_id", ""))):
            raise ValueError("Connection id is invalid")
        source = spec.get("source")
        clean = spec.get("silver")
        if not isinstance(source, dict) or not isinstance(clean, dict):
            raise ValueError("Connection contract needs source and silver sections")
        if source.get("type") not in {"postgres", "csv", "excel", "rest_api"}:
            raise ValueError("Unsupported governed source type")
        if not source.get("table") and source.get("type") == "postgres":
            raise ValueError("PostgreSQL source needs a table")
        if source.get("type") == "postgres":
            for name in (source.get("schema", "public"), source["table"]):
                if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", str(name)):
                    raise ValueError("PostgreSQL table and schema must be simple identifiers")
        if not source.get("path") and source.get("type") in {"csv", "excel"}:
            raise ValueError("File source needs a path")
        if not source.get("url") and source.get("type") == "rest_api":
            raise ValueError("REST source needs a URL")
        if not re.fullmatch(r"silver\.[a-z0-9_]+", str(clean.get("table", ""))):
            raise ValueError("Silver output must use the silver namespace")
        for field in ("primary_key_fields", "amount_fields", "date_fields"):
            if field in clean and (not isinstance(clean[field], list) or not all(
                isinstance(v, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", v) for v in clean[field]
            )):
                raise ValueError(f"Silver {field} must be a list of column names")
        return

    required = {"pipeline_id", "cron_schedule", "transform_sql", "output_table", "quality_policies"}
    if not required.issubset(spec):
        raise ValueError("Gold pipeline spec is missing required fields")
    if not all(isinstance(spec[key], str) and spec[key] for key in required - {"quality_policies"}):
        raise ValueError("Gold pipeline spec contains empty fields")
    if not isinstance(spec["quality_policies"], list) or not spec["quality_policies"]:
        raise ValueError("Gold pipeline needs quality policies")
    if any(policy != "row_count_gt_zero" for policy in spec["quality_policies"]):
        raise ValueError("Gold pipeline contains an unsupported quality policy")
    if not re.fullmatch(r"gold_[a-z0-9_]+", spec["pipeline_id"]):
        raise ValueError("Gold pipeline id is invalid")
    if not re.fullmatch(r"gold\.[a-z0-9_]+", spec["output_table"]):
        raise ValueError("Output table must be in the Gold schema")
    if spec["output_table"] != "gold." + spec["pipeline_id"].removeprefix("gold_"):
        raise ValueError("Each Gold pipeline must own its output table")
    try:
        statements = sqlglot.parse(spec["transform_sql"], read="trino")
    except sqlglot.errors.ParseError as exc:
        raise ValueError("Transform SQL is invalid") from exc
    if len(statements) != 1 or not isinstance(statements[0], exp.Select):
        raise ValueError("Transform SQL must contain one SELECT")


if importlib.util.find_spec("airflow") is not None:
    try:
        globals().update(build_dynamic_dags(load_pipeline_specs()))
    except Exception:
        logger.exception("Could not load dynamic Midas DAGs")
