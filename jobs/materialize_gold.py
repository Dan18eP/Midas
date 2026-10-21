"""Audit a Gold result in a staging table before publishing it to Iceberg."""

import argparse
import json
import os
import urllib.request
import uuid

import sqlglot
from runtime import publish_event, prepare_namespaces
from pyspark.sql import SparkSession


def publish(spec: dict, status: str, count: int = 0, detail: str = "") -> None:
    publish_event(spec["pipeline_id"], spec["output_table"], status, count, detail, details={"event_type": "NEW_GOLD_NODE_AVAILABLE" if status == "HEALTHY" else "GOLD_MATERIALIZATION",
        "upstream_nodes": [f"silver_{table.name}" for table in sqlglot.parse_one(spec["transform_sql"], read="trino").find_all(sqlglot.exp.Table) if table.db == "silver"]})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-json")
    parser.add_argument("--sql")
    parser.add_argument("--output-table")
    parser.add_argument("--quality-policies", default="row_count_gt_zero")
    args = parser.parse_args()
    if args.spec_json:
        spec = json.loads(args.spec_json)
    elif args.sql and args.output_table:
        spec = {"pipeline_id": "gold_manual", "transform_sql": args.sql,
                "output_table": args.output_table, "quality_policies": args.quality_policies.split(",")}
    else:
        parser.error("--spec-json or both --sql and --output-table are required")

    output_table = spec["output_table"]
    pipeline_id = spec["pipeline_id"]
    policies = set(spec["quality_policies"])
    if not policies or policies - {"row_count_gt_zero"}:
        raise ValueError("Unsupported Gold quality policy")
    spark = SparkSession.builder.appName(f"midas-{output_table}").getOrCreate()
    spec["pipeline_id"] = pipeline_id
    stage_table = f"{output_table}_wap_{uuid.uuid4().hex[:8]}"
    count = 0
    publish(spec, "RUNNING", detail="gold materialization started")
    try:
        prepare_namespaces(spark)
        sql = sqlglot.transpile(spec["transform_sql"], read="trino", write="spark")[0]
        result = spark.sql(sql)
        result.writeTo(stage_table).using("iceberg").tableProperty("format-version", "2").createOrReplace()
        staged = spark.table(stage_table)
        count = staged.count()
        if "row_count_gt_zero" in policies and count == 0:
            raise ValueError("Gold output failed row_count_gt_zero")
        staged.writeTo(output_table).using("iceberg").tableProperty("format-version", "2").createOrReplace()
        publish(spec, "HEALTHY", count, f"WAP audit passed and {output_table} was published")
    except Exception as exc:
        publish(spec, "ERROR", count, str(exc)[:500])
        raise
    finally:
        spark.sql(f"DROP TABLE IF EXISTS {stage_table}")
        spark.stop()


if __name__ == "__main__":
    main()
