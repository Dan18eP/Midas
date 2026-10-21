"""Focused checks for confirmed Gold pipeline contracts."""

import yaml
import pytest

from src.agent.tools.dag_generator import build_pipeline_spec, publish_pipeline_spec
from src.core.telemetry.hub import reset_telemetry_hub, get_telemetry_hub
from src.orchestration.dag_factory import _validate_spec


CATALOG = [{"table": "silver.orders", "columns": ["order_id", "amount"]}]


class FakeStorage:
    def __init__(self):
        self.saved = None

    def put_object(self, bucket, name, data, content_type):
        self.saved = (bucket, name, yaml.safe_load(data), content_type)
        return "etag"


def test_build_pipeline_spec_validates_sql_and_keeps_unlimited_select():
    spec = build_pipeline_spec(
        "Daily Orders!",
        "SELECT order_id, amount FROM silver.orders",
        CATALOG,
    )

    assert spec.pipeline_id == "gold_daily_orders"
    assert spec.output_table == "gold.daily_orders"
    assert spec.cron_schedule == "0 0 * * *"
    assert "LIMIT" not in spec.transform_sql.upper()
    assert spec.quality_policies == ["row_count_gt_zero"]


def test_build_pipeline_spec_rejects_unapproved_sql_and_invalid_cron():
    with pytest.raises(ValueError):
        build_pipeline_spec("Orders", "DELETE FROM silver.orders", CATALOG)
    with pytest.raises(ValueError):
        build_pipeline_spec("Orders", "SELECT amount FROM silver.orders", CATALOG, cron_schedule="daily")
    with pytest.raises(ValueError):
        build_pipeline_spec("Orders", "SELECT order_id FROM silver.orders", CATALOG, cron_schedule="99 0 * * *")


def test_publish_requires_confirmation_before_writing():
    storage = FakeStorage()
    spec = build_pipeline_spec("Orders", "SELECT order_id FROM silver.orders", CATALOG)

    with pytest.raises(ValueError, match="confirmation"):
        publish_pipeline_spec(spec, confirmed=False, storage=storage)

    assert storage.saved is None


def test_publish_writes_yaml_and_broadcasts_new_node():
    reset_telemetry_hub()
    storage = FakeStorage()
    spec = build_pipeline_spec("Orders", "SELECT order_id FROM silver.orders", CATALOG)

    uri = publish_pipeline_spec(spec, confirmed=True, storage=storage)

    assert uri == "s3://midas-governance/airflow-specs/dag_gold_orders.yaml"
    assert storage.saved[0:2] == ("midas-governance", "airflow-specs/dag_gold_orders.yaml")
    assert storage.saved[2]["output_table"] == "gold.orders"
    assert storage.saved[3] == "application/yaml"
    event = get_telemetry_hub().get_buffered_events()[-1]
    assert event.node_id == "gold.orders"
    assert event.details["event_type"] == "NEW_GOLD_NODE_AVAILABLE"
    reset_telemetry_hub()


def test_dag_factory_rejects_unapproved_contract_fields():
    spec = build_pipeline_spec("Orders", "SELECT order_id FROM silver.orders", CATALOG)
    _validate_spec(spec.__dict__)

    invalid = {**spec.__dict__, "output_table": "silver.orders"}
    with pytest.raises(ValueError, match="Gold schema"):
        _validate_spec(invalid)
