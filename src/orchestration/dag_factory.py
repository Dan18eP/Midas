"""Load approved MinIO contracts as dynamic Airflow DAGs."""

from __future__ import annotations

import json
import importlib.util
import logging
import os
import re
from typing import Any
from urllib.request import Request, urlopen

import yaml
import sqlglot
from sqlglot import exp

from src.lakehouse.storage.minio_client import MidasMinioClient
from src.core.cron import is_valid_cron_schedule


logger = logging.getLogger(__name__)
SPEC_BUCKET = "midas-governance"
SPEC_PREFIX = "airflow-specs/"


def load_pipeline_specs(storage: MidasMinioClient | None = None) -> list[dict[str, Any]]:
    """Read and validate the YAML contracts currently approved in MinIO."""
    client = storage or MidasMinioClient()
    specs = []
    for object_name in client.list_objects(SPEC_BUCKET, prefix=SPEC_PREFIX):
        if not object_name.endswith(".yaml"):
            continue
        try:
            spec = yaml.safe_load(client.get_object(SPEC_BUCKET, object_name))
            _validate_spec(spec)
            specs.append(spec)
        except (ValueError, yaml.YAMLError):
            logger.exception("Skipping invalid pipeline spec %s", object_name)
    return specs


def build_dynamic_dags(specs: list[dict[str, Any]]) -> dict[str, Any]:
    """Build one Spark-backed Airflow DAG per valid spec."""
    try:
        from airflow import DAG
        from airflow.providers.apache.spark.operators.spark_submit import SparkSubmitOperator
        from airflow.operators.python import PythonOperator
    except ImportError:
        return {}

    spark_job = os.getenv("MIDAS_GOLD_SPARK_JOB")
    if not spark_job:
        logger.warning("MIDAS_GOLD_SPARK_JOB is unset; no Gold DAGs were registered")
        return {}

    dags = {}
    for spec in specs:
        pipeline_id = spec["pipeline_id"]
        dag = DAG(
            dag_id=pipeline_id,
            schedule=spec["cron_schedule"],
            catchup=False,
            tags=["midas", "gold", "dynamic"],
        )
        with dag:
            materialize = SparkSubmitOperator(
                task_id="spark_execute_gold",
                application=spark_job,
                conn_id=os.getenv("AIRFLOW_SPARK_CONN_ID", "spark_default"),
                application_args=[
                    "--sql", spec["transform_sql"],
                    "--output-table", spec["output_table"],
                    "--quality-policies", ",".join(spec["quality_policies"]),
                ],
            )
            notify = PythonOperator(
                task_id="sse_notify_canvas",
                python_callable=_notify_canvas,
                op_kwargs={"pipeline_id": pipeline_id, "output_table": spec["output_table"]},
            )
            materialize >> notify
        dags[pipeline_id] = dag
    return dags


def _notify_canvas(pipeline_id: str, output_table: str) -> None:
    """Send the new Gold node through the canonical telemetry endpoint."""
    endpoint = os.getenv("MIDAS_TELEMETRY_PUBLISH_URL", "http://midas-api:8000/api/v1/telemetry/publish")
    event = {
        "pipeline_id": pipeline_id,
        "node_id": output_table,
        "status": "IN_PROGRESS",
        "details": {"event_type": "NEW_GOLD_NODE_AVAILABLE", "output_table": output_table},
    }
    request = Request(
        endpoint,
        data=json.dumps(event).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(request, timeout=10) as response:
        if response.status >= 300:
            raise RuntimeError(f"Telemetry publish failed with status {response.status}")


def _validate_spec(spec: Any) -> None:
    """Reject incomplete contracts before exposing them to Airflow."""
    required = {"pipeline_id", "cron_schedule", "transform_sql", "output_table", "quality_policies"}
    if not isinstance(spec, dict) or not required.issubset(spec):
        raise ValueError("Pipeline spec is missing required fields")
    if not all(isinstance(spec[key], str) and spec[key] for key in required - {"quality_policies"}):
        raise ValueError("Pipeline spec contains empty fields")
    if not isinstance(spec["quality_policies"], list) or not spec["quality_policies"]:
        raise ValueError("Pipeline spec needs quality policies")
    if any(policy != "row_count_gt_zero" for policy in spec["quality_policies"]):
        raise ValueError("Pipeline spec contains an unsupported quality policy")
    if not is_valid_cron_schedule(spec["cron_schedule"]):
        raise ValueError("Pipeline schedule is invalid")
    if not re.fullmatch(r"gold_[a-z0-9_]+", spec["pipeline_id"]):
        raise ValueError("Pipeline id is invalid")
    if not re.fullmatch(r"gold\.[a-z0-9_]+", spec["output_table"]):
        raise ValueError("Output table must be in the Gold schema")
    try:
        statements = sqlglot.parse(spec["transform_sql"], read="trino")
    except sqlglot.errors.ParseError as exc:
        raise ValueError("Transform SQL is invalid") from exc
    if len(statements) != 1 or not isinstance(statements[0], exp.Select):
        raise ValueError("Transform SQL must contain one SELECT")


# Airflow reparses this module periodically, so new MinIO specs become DAGs without a restart.
if importlib.util.find_spec("airflow") is not None:
    try:
        globals().update(build_dynamic_dags(load_pipeline_specs()))
    except Exception:
        logger.exception("Could not load dynamic Midas DAGs")
