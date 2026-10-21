"""Tests for the dynamic Bronze, Silver, and Gold DAG factory."""

import sys
import types

import pytest

from src.orchestration.dag_factory import _validate_spec, build_dynamic_dags


class FakeDag:
    def __init__(self, **kwargs):
        self.__dict__.update(kwargs)

    def __enter__(self):
        return self

    def __exit__(self, *_args):
        return False


class FakeSparkOperator:
    def __init__(self, **kwargs):
        self.kwargs = kwargs

    def __rshift__(self, other):
        self.downstream = other


class FakeSchedule:
    def __init__(self, *args, **kwargs):
        self.args, self.kwargs = args, kwargs


@pytest.fixture
def fake_airflow(monkeypatch):
    modules = {
        "airflow": types.ModuleType("airflow"),
        "airflow.providers": types.ModuleType("airflow.providers"),
        "airflow.providers.apache": types.ModuleType("airflow.providers.apache"),
        "airflow.providers.apache.spark": types.ModuleType("airflow.providers.apache.spark"),
        "airflow.providers.apache.spark.operators": types.ModuleType("airflow.providers.apache.spark.operators"),
        "airflow.providers.apache.spark.operators.spark_submit": types.ModuleType("airflow.providers.apache.spark.operators.spark_submit"),
        "airflow.operators": types.ModuleType("airflow.operators"),
        "airflow.operators.trigger_dagrun": types.ModuleType("airflow.operators.trigger_dagrun"),
        "airflow.timetables": types.ModuleType("airflow.timetables"),
        "airflow.timetables.datasets": types.ModuleType("airflow.timetables.datasets"),
        "airflow.timetables.trigger": types.ModuleType("airflow.timetables.trigger"),
    }
    modules["airflow"].DAG = FakeDag
    modules["airflow"].Dataset = FakeSchedule
    modules["airflow.operators.trigger_dagrun"].TriggerDagRunOperator = FakeSparkOperator
    modules["airflow.timetables.datasets"].DatasetOrTimeSchedule = FakeSchedule
    modules["airflow.timetables.trigger"].CronTriggerTimetable = FakeSchedule
    modules["airflow.providers.apache.spark.operators.spark_submit"].SparkSubmitOperator = FakeSparkOperator
    for name, module in modules.items():
        monkeypatch.setitem(sys.modules, name, module)


def test_factory_builds_all_three_medallion_dags_with_valid_cron(fake_airflow):
    connection = {
        "kind": "connection",
        "conn_id": "crm",
        "cron_schedule": "0 */6 * * *",
        "source": {"type": "postgres", "table": "orders"},
        "silver": {"table": "silver.orders"},
    }
    gold = {
        "pipeline_id": "gold_daily_orders",
        "cron_schedule": "15 2 * * *",
        "transform_sql": "SELECT * FROM silver.orders",
        "output_table": "gold.daily_orders",
        "quality_policies": ["row_count_gt_zero"],
    }

    dags = build_dynamic_dags([connection, gold])

    assert set(dags) == {
        "dag_ingest_crm",
        "dag_clean_crm",
        "dag_gold_gold_daily_orders",
    }
    assert dags["dag_ingest_crm"].schedule == connection["cron_schedule"]
    assert dags["dag_clean_crm"].schedule is None
    assert isinstance(dags["dag_gold_gold_daily_orders"].schedule, FakeSchedule)
    assert all(dag.max_active_runs == 1 and dag.default_args["retries"] == 2 for dag in dags.values())
    assert all(dag.start_date.tzinfo is not None for dag in dags.values())


def test_factory_rejects_invalid_cron_schedule():
    spec = {
        "kind": "connection",
        "conn_id": "crm",
        "cron_schedule": "every day",
        "source": {"type": "postgres", "table": "orders"},
        "silver": {"table": "silver.orders"},
    }

    with pytest.raises(ValueError, match="schedule"):
        _validate_spec(spec)


def test_gold_pipeline_cannot_replace_another_pipeline_table():
    spec = {"pipeline_id": "gold_daily_orders", "cron_schedule": "0 0 * * *",
            "transform_sql": "SELECT * FROM silver.orders", "output_table": "gold.unrelated",
            "quality_policies": ["row_count_gt_zero"]}
    with pytest.raises(ValueError, match="own its output"):
        _validate_spec(spec)
