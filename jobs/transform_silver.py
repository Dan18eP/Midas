"""Normalize Bronze rows, quarantine invalid records, and publish Silver Iceberg."""

import argparse
import json
import os
import urllib.request
import re
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from pyspark.sql import SparkSession, functions as F, types as T
from pyspark.sql.window import Window
from runtime import completed_paths, read_manifest, publish_event, prepare_namespaces, normalize_amount, normalize_date


def publish(spec: dict, status: str, count: int = 0, detail: str = "", records_out: int | None = None, quarantined: int = 0) -> None:
    publish_event(f"dag_clean_{spec['conn_id']}", f"silver_{spec['conn_id']}", status, count, detail, records_out, {"quarantined_records": quarantined, "event_type": "SILVER_QUALITY_GATE"})


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-json", required=True)
    parser.add_argument("--batch-id", required=True)
    args = parser.parse_args()
    spec = json.loads(args.spec_json)
    silver = spec["silver"]
    bronze_path = spec.get("bronze", {}).get("path", f"s3a://midas-bronze/sources/{spec['conn_id']}/")
    quarantine_path = silver.get("quarantine_path", f"s3a://midas-quarantine/incidents/{spec['conn_id']}/")
    spark = SparkSession.builder.appName(f"midas-clean-{spec['conn_id']}").getOrCreate()
    count = 0
    publish(spec, "RUNNING", detail="silver quality gate started")
    try:
        if not read_manifest(spec, args.batch_id):
            raise ValueError("The upstream Bronze batch has not committed")
        prepare_namespaces(spark)
        source = spark.read.option("mergeSchema", True).parquet(*completed_paths(spec))
        count = source.count()
        transformed = source
        amount_fields = silver.get("amount_fields", [])
        date_fields = silver.get("date_fields", [])
        keys = silver.get("primary_key_fields", ["_raw_payload_hash"])
        missing = set(keys + amount_fields + date_fields) - set(source.columns)
        if missing:
            raise ValueError(f"Required columns are missing: {sorted(missing)}")
        for field in amount_fields:
            if field in transformed.columns:
                value_fn = F.udf(normalize_amount, T.DecimalType(18, 2))
                transformed = transformed.withColumn(field, value_fn(F.col(field)).cast("decimal(18,2)"))
        for field in date_fields:
            if field in transformed.columns:
                date_fn = F.udf(normalize_date, T.StringType())
                transformed = transformed.withColumn(field, date_fn(F.col(field)).cast("timestamp"))

        invalid = F.lit(False)
        key_invalid = F.lit(False)
        negative_amount = F.lit(False)
        amount_invalid = F.lit(False)
        date_invalid = F.lit(False)
        for field in keys:
            if field in transformed.columns:
                key_invalid = key_invalid | F.col(field).isNull() | (F.trim(F.col(field).cast("string")) == "")
        for field in amount_fields:
            if field in transformed.columns:
                negative_amount = negative_amount | (F.col(field) < 0)
                amount_invalid = amount_invalid | F.col(field).isNull()
        for field in date_fields:
            if field in transformed.columns:
                date_invalid = date_invalid | F.col(field).isNull()
        invalid = key_invalid | negative_amount | amount_invalid | date_invalid

        reason = (F.when(negative_amount, "NEGATIVE_AMOUNT")
                  .when(key_invalid, "NULL_PRIMARY_KEY")
                  .when(amount_invalid, "INVALID_AMOUNT")
                  .when(date_invalid, "INVALID_DATE")
                  .otherwise("QUALITY_GATE_FAILURE"))
        raw_columns = [F.col(name) for name in source.columns]
        invalid_rows = (transformed.filter(invalid)
                        .withColumn("failure_reason", reason)
                        .withColumn("source_name", F.lit(spec["conn_id"]))
                        .withColumn("raw_data", F.col("_raw_payload"))
                        .withColumn("quarantine_id", F.expr("uuid()"))
                        .withColumn("quarantined_at", F.current_timestamp()))
        # The same business key always chooses the newest row, including on retry.
        window = Window.partitionBy(*keys).orderBy(F.col("_ingested_at").desc(), F.col("_raw_payload_hash").desc())
        valid_rows = (transformed.filter(~invalid).withColumn("_rank", F.row_number().over(window))
                      .filter(F.col("_rank") == 1).drop("_rank"))
        invalid_count = invalid_rows.count()
        invalid_rows.write.mode("overwrite").parquet(quarantine_path)
        if transformed.filter(amount_invalid).limit(1).count():
            raise ValueError("SCHEMA_DRIFT: invalid monetary types; Silver publication blocked")
        valid_rows.writeTo(silver["table"]).using("iceberg").tableProperty("format-version", "2").createOrReplace()
        publish(spec, "AUTO_HEALING" if invalid_count else "HEALTHY", count,
                f"{invalid_count} records quarantined at {quarantine_path}", valid_rows.count(), invalid_count)
    except Exception as exc:
        publish(spec, "ERROR", count, str(exc)[:500])
        raise
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
