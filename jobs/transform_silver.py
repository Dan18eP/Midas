"""Normalize Bronze rows, quarantine invalid records, and publish Silver Iceberg using pure PySpark."""

import argparse
import json
import os
import urllib.request
import uuid
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

from pyspark.sql import SparkSession, functions as F, types as T


def normalize_amount(value):
    if value is None:
        return None
    try:
        text = str(value).strip().replace(",", "")
        parenthesized = text.startswith("(") and text.endswith(")")
        cleaned = "".join(c for c in text if c.isdigit() or c in ".-")
        if parenthesized and not cleaned.startswith("-"):
            cleaned = f"-{cleaned}"
        return Decimal(cleaned).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError):
        return None


def normalize_date(value):
    if value is None:
        return None
    text = str(value).strip().replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except ValueError:
        for pattern in ("%Y/%m/%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(text, pattern).replace(tzinfo=timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
            except ValueError:
                continue
        return None


def publish(spec: dict, status: str, count: int = 0, detail: str = "", records_out: int | None = None) -> None:
    event = {
        "pipeline_id": f"dag_clean_{spec['conn_id']}",
        "node_id": f"silver_{spec['conn_id']}",
        "status": status,
        "records_in": count,
        "records_out": count if records_out is None else records_out,
        "details": {"event_type": "SILVER_QUALITY_GATE", "message": detail},
    }
    request = urllib.request.Request(
        os.getenv("MIDAS_TELEMETRY_PUBLISH_URL", "http://midas-api:8000/api/v1/telemetry/publish"),
        data=json.dumps(event).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=10):
            pass
    except Exception:
        pass


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-json", required=True)
    spec = json.loads(parser.parse_args().spec_json)
    silver = spec["silver"]
    bronze_path = spec.get("bronze", {}).get("path", f"s3a://midas-bronze/sources/{spec['conn_id']}/")
    quarantine_path = silver.get("quarantine_path", f"s3a://midas-quarantine/incidents/{spec['conn_id']}/")

    spark = (
        SparkSession.builder.appName(f"midas-clean-{spec['conn_id']}")
        .config("spark.sql.extensions", "org.apache.iceberg.spark.extensions.IcebergSparkSessionExtensions")
        .config("spark.sql.catalog.iceberg", "org.apache.iceberg.spark.SparkCatalog")
        .config("spark.sql.catalog.iceberg.type", "hadoop")
        .config("spark.sql.catalog.iceberg.warehouse", os.getenv("ICEBERG_WAREHOUSE", "s3a://midas-lakehouse/iceberg"))
        .config("spark.hadoop.fs.s3a.endpoint", os.getenv("MINIO_ENDPOINT", "http://minio:9000"))
        .config("spark.hadoop.fs.s3a.access.key", os.getenv("MINIO_ROOT_USER", "midas_admin"))
        .config("spark.hadoop.fs.s3a.secret.key", os.getenv("MINIO_ROOT_PASSWORD", "midas_storage_2026"))
        .config("spark.hadoop.fs.s3a.path.style.access", "true")
        .config("spark.hadoop.fs.s3a.impl", "org.apache.hadoop.fs.s3a.S3AFileSystem")
        .config("spark.sql.shuffle.partitions", "4")
        .getOrCreate()
    )

    count = 0
    publish(spec, "RUNNING", detail="silver quality gate started")
    try:
        source = spark.read.parquet(bronze_path)
        count = source.count()
        transformed = source

        # Deteccion dinamica de campos agnosticos si no vienen especificados
        cols = source.columns
        amount_fields = silver.get(
            "amount_fields",
            [c for c in cols if any(term in c.lower() for term in ["monto", "amount", "total", "precio", "saldo", "valor", "costo", "ingreso"]) and not c.startswith("_")],
        ) or ["monto", "total_amount", "monto_bruto"]
        
        date_fields = silver.get(
            "date_fields",
            [c for c in cols if any(term in c.lower() for term in ["fecha", "date", "timestamp", "created_at", "time"])],
        ) or ["fecha_transaccion", "fecha_pedido", "_ingested_at"]
        
        keys = silver.get(
            "primary_key_fields",
            [c for c in cols if c.lower() in ("id", "codigo", "key") or c.lower().endswith("_id")],
        ) or ["transaccion_id", "pedido_id", "_raw_id"]

        for field in amount_fields:
            if field in transformed.columns:
                value_fn = F.udf(normalize_amount, T.DecimalType(18, 2))
                transformed = transformed.withColumn(field, value_fn(F.col(field)))
        for field in date_fields:
            if field in transformed.columns:
                date_fn = F.udf(normalize_date, T.StringType())
                transformed = transformed.withColumn(field, date_fn(F.col(field)))

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

        reason = (
            F.when(negative_amount, "NEGATIVE_AMOUNT")
            .when(key_invalid, "NULL_PRIMARY_KEY")
            .when(amount_invalid, "INVALID_AMOUNT")
            .when(date_invalid, "INVALID_DATE")
            .otherwise("QUALITY_GATE_FAILURE")
        )
        raw_columns = [F.col(name) for name in source.columns]
        invalid_rows = (
            transformed.filter(invalid)
            .withColumn("failure_reason", reason)
            .withColumn("source_name", F.lit(spec["conn_id"]))
            .withColumn("raw_data", F.to_json(F.struct(*raw_columns)))
            .withColumn("quarantine_id", F.expr("uuid()"))
            .withColumn("quarantined_at", F.current_timestamp())
        )
        valid_rows = transformed.filter(~invalid)
        invalid_count = invalid_rows.count()
        if invalid_count:
            invalid_rows.write.mode("append").parquet(quarantine_path)
        valid_rows.writeTo(silver["table"]).using("iceberg").createOrReplace()
        publish(
            spec,
            "AUTO_HEALING" if invalid_count else "HEALTHY",
            count,
            f"{invalid_count} records quarantined at {quarantine_path}",
            count - invalid_count,
        )
    except Exception as exc:
        publish(spec, "ERROR", count, str(exc)[:500])
        raise
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
