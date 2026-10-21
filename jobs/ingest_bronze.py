"""Extract a governed source and append its audit envelope to Bronze Parquet."""

import argparse
import hashlib
import json
import os
import re
import urllib.request
import io
from datetime import datetime, timezone

from pyspark.sql import SparkSession, functions as F
from runtime import batch_key, bronze_root, read_manifest, commit_manifest, storage, object_location, publish_event


def publish(spec: dict, status: str, count: int = 0, detail: str = "") -> None:
    publish_event(f"dag_ingest_{spec['conn_id']}", f"bronze_{spec['conn_id']}", status, count, detail)


def extract(spark: SparkSession, source: dict):
    kind = source["type"]
    if kind == "postgres":
        url = os.getenv(source.get("url_env", "POSTGRES_OPERATIONAL_URL"))
        if not url:
            raise ValueError("PostgreSQL connection URL environment variable is not set")
        props = {"url": url, "dbtable": f"{source.get('schema', 'public')}.{source['table']}",
                 "user": os.environ[source.get("user_env", "POSTGRES_USER")],
                 "password": os.environ[source.get("password_env", "POSTGRES_PASSWORD")],
                 "driver": "org.postgresql.Driver"}
        if source.get("driver"):
            props["driver"] = source["driver"]
        return spark.read.format("jdbc").options(**props).load()
    if kind == "csv":
        return spark.read.option("header", True).option("delimiter", source.get("delimiter", ",")).option("inferSchema", True).csv(source["path"])
    if kind == "excel":
        import openpyxl

        bucket, key = object_location(source["path"])
        response = storage().get_object(bucket, key)
        try:
            workbook = openpyxl.load_workbook(io.BytesIO(response.read()), read_only=True, data_only=True)
        finally:
            response.close()
            response.release_conn()
        frames = []
        try:
            for sheet in source.get("sheets") or workbook.sheetnames:
                values = workbook[sheet].iter_rows(values_only=True)
                headers = [str(value) for value in next(values)]
                records = [tuple(None if value is None else str(value) for value in row)
                           for row in values if any(value is not None for value in row)]
                if records:
                    from pyspark.sql.types import StructType, StructField, StringType
                    schema = StructType([StructField(name, StringType(), True) for name in headers])
                    frames.append(spark.createDataFrame(records, schema).withColumn("_sheet_name", F.lit(sheet)))
            if not frames:
                raise ValueError("Excel source contains no data rows")
            result = frames[0]
            for frame in frames[1:]:
                result = result.unionByName(frame, allowMissingColumns=True)
            return result
        finally:
            workbook.close()
    if kind == "rest_api":
        from urllib.parse import urlencode, urlsplit, urlunsplit, parse_qsl

        headers = json.loads(os.environ[source["headers_env"]]) if source.get("headers_env") else {}
        url, rows, seen = source["url"], [], set()
        pagination = source.get("pagination", {})
        for _ in range(int(source.get("max_pages", 100))):
            request = urllib.request.Request(url, headers=headers)
            with urllib.request.urlopen(request, timeout=int(source.get("timeout_seconds", 30))) as response:
                payload = json.loads(response.read())
            page = payload.get(source.get("data_key", "data"), payload) if isinstance(payload, dict) else payload
            if not isinstance(page, list):
                raise ValueError("REST response must contain a list of records")
            rows.extend(page)
            cursor = payload.get(pagination.get("next_cursor_key", "next_cursor")) if isinstance(payload, dict) else None
            if not cursor:
                return spark.createDataFrame(rows)
            if str(cursor) in seen:
                raise ValueError("REST pagination repeated a cursor")
            seen.add(str(cursor))
            parts = urlsplit(source["url"])
            params = dict(parse_qsl(parts.query))
            params[pagination.get("cursor_param", "cursor")] = cursor
            url = urlunsplit(parts._replace(query=urlencode(params)))
        raise ValueError("REST source exceeded the pagination limit")
    raise ValueError(f"Unsupported source type: {kind}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-json", required=True)
    parser.add_argument("--batch-id", required=True)
    args = parser.parse_args()
    spec = json.loads(args.spec_json)
    source = spec["source"]
    batch_id = args.batch_id
    if read_manifest(spec, batch_id):
        publish(spec, "HEALTHY", detail="batch already committed")
        return
    output = f"{bronze_root(spec)}/batches/{batch_key(batch_id)}.parquet"
    spark = SparkSession.builder.appName(f"midas-ingest-{spec['conn_id']}").getOrCreate()
    count = 0
    publish(spec, "RUNNING", detail="ingestion started")
    try:
        rows = extract(spark, source)
        columns = rows.columns
        count = rows.count()
        payload = F.to_json(F.struct(*[F.col(name) for name in columns]))
        enriched = (rows.withColumn("_raw_id", F.sha2(F.concat(F.lit(batch_id), payload), 256))
                    .withColumn("_source_type", F.lit({"postgres": "JDBC_POSTGRES", "csv": "CSV_STORAGE", "rest_api": "REST_API_CRM", "excel": "EXCEL_SPREADSHEET"}[source["type"]]))
                    .withColumn("_source_origin", F.lit(source.get("table", source.get("path", source.get("url", spec['conn_id'])))))
                    .withColumn("_ingested_at", F.current_timestamp())
                    .withColumn("_batch_id", F.lit(batch_id))
                    .withColumn("_schema_fingerprint", F.lit(hashlib.sha256(rows.schema.json().encode()).hexdigest()))
                    .withColumn("_raw_payload", payload)
                    .withColumn("_raw_payload_hash", F.sha2(payload, 256)))
        enriched.write.mode("overwrite").parquet(output)
        commit_manifest(spec, batch_id, output)
        publish(spec, "HEALTHY", count, f"Bronze parquet written to {output}")
    except Exception as exc:
        publish(spec, "ERROR", count, str(exc)[:500])
        raise
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
