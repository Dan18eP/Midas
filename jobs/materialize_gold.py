"""Audit a Gold result in a staging table before publishing it to Iceberg."""

import argparse
import json
import os
import urllib.request
import uuid

from pyspark.sql import SparkSession


def publish(spec: dict, status: str, count: int = 0, detail: str = "") -> None:
    event = {"pipeline_id": spec["pipeline_id"], "node_id": spec["output_table"],
             "status": status, "records_in": count, "records_out": count,
             "details": {"event_type": "NEW_GOLD_NODE_AVAILABLE" if status == "HEALTHY" else "GOLD_MATERIALIZATION",
                         "message": detail}}
    request = urllib.request.Request(os.getenv("MIDAS_TELEMETRY_PUBLISH_URL", "http://midas-api:8000/api/v1/telemetry/publish"),
                                     data=json.dumps(event).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=10):
        pass


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
        result = spark.sql(spec["transform_sql"])
        result.writeTo(stage_table).using("iceberg").createOrReplace()
        staged = spark.table(stage_table)
        count = staged.count()
        if "row_count_gt_zero" in policies and count == 0:
            raise ValueError("Gold output failed row_count_gt_zero")
        staged.writeTo(output_table).using("iceberg").createOrReplace()
        publish(spec, "HEALTHY", count, f"WAP audit passed and {output_table} was published")
    except Exception as exc:
        publish(spec, "ERROR", count, str(exc)[:500])
        raise
    finally:
        spark.sql(f"DROP TABLE IF EXISTS {stage_table}")
        spark.stop()


if __name__ == "__main__":
    main()
