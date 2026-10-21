"""Create and publish approved Gold pipeline specifications."""

from __future__ import annotations

from dataclasses import asdict, dataclass
import re
from typing import Mapping, Sequence

import yaml

from src.agent.guardrails.query_guardrail import validate_query
from src.core.cron import is_valid_cron_schedule
from src.core.telemetry.events import NodeStatus, TelemetryEvent
from src.core.telemetry.hub import get_telemetry_hub
from src.lakehouse.storage.minio_client import MidasMinioClient


_SAFE_NAME = re.compile(r"[^a-z0-9_]+")
_ALLOWED_QUALITY_POLICIES = {"row_count_gt_zero"}


@dataclass(frozen=True)
class PipelineSpec:
    """The small contract consumed by the Airflow DAG factory."""

    pipeline_id: str
    cron_schedule: str
    transform_sql: str
    output_table: str
    quality_policies: list[str]


def build_pipeline_spec(
    report_name: str,
    sql: str,
    catalog: Sequence[Mapping[str, object]],
    *,
    cron_schedule: str = "0 0 * * *",
    quality_policies: Sequence[str] = ("row_count_gt_zero",),
) -> PipelineSpec:
    """Validate the SQL and build a safe Gold table contract."""
    slug = _slug(report_name)
    if not is_valid_cron_schedule(cron_schedule):
        raise ValueError("cron_schedule must be a valid five-field cron schedule")
    policies = list(dict.fromkeys(quality_policies))
    if not policies or any(policy not in _ALLOWED_QUALITY_POLICIES for policy in policies):
        raise ValueError("Unsupported or empty quality_policies")

    return PipelineSpec(
        pipeline_id=f"gold_{slug}",
        cron_schedule=cron_schedule,
        transform_sql=validate_query(sql, catalog, add_limit=False),
        output_table=f"gold.{slug}",
        quality_policies=policies,
    )


def publish_pipeline_spec(
    spec: PipelineSpec,
    *,
    confirmed: bool,
    storage: MidasMinioClient | None = None,
) -> str:
    """Publish a confirmed YAML contract and announce its Gold node."""
    if not confirmed:
        raise ValueError("User confirmation is required before publishing a pipeline")

    object_name = f"airflow-specs/dag_{spec.pipeline_id}.yaml"
    payload = yaml.safe_dump(asdict(spec), sort_keys=False, allow_unicode=True).encode("utf-8")
    (storage or MidasMinioClient()).put_object(
        "midas-governance",
        object_name,
        payload,
        content_type="application/yaml",
    )

    event = TelemetryEvent(
        pipeline_id=spec.pipeline_id,
        node_id=spec.output_table,
        status=NodeStatus.IN_PROGRESS,
        details={"event_type": "NEW_GOLD_NODE_AVAILABLE", "output_table": spec.output_table},
    )
    get_telemetry_hub().publish_sync(event)
    return f"s3://midas-governance/{object_name}"


def _slug(value: str) -> str:
    slug = _SAFE_NAME.sub("_", value.strip().casefold()).strip("_")
    if not slug:
        raise ValueError("report_name must include letters or numbers")
    return slug[:80].rstrip("_")
