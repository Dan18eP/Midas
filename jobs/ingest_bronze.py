"""Extract a governed source and append its audit envelope to Bronze Parquet."""

import argparse
import hashlib
import json
import os
import re
import urllib.request
import uuid
from datetime import datetime, timezone

from pyspark.sql import SparkSession, functions as F


def publish(spec: dict, status: str, count: int = 0, detail: str = "") -> None:
    event = {"pipeline_id": f"dag_ingest_{spec['conn_id']}", "node_id": f"bronze_{spec['conn_id']}",
             "status": status, "records_in": count, "records_out": count,
             "details": {"event_type": "INGESTION", "message": detail}}
    request = urllib.request.Request(os.getenv("MIDAS_TELEMETRY_PUBLISH_URL", "http://midas-api:8000/api/v1/telemetry/publish"),
                                     data=json.dumps(event).encode(), headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(request, timeout=10):
        pass


def extract(spark: SparkSession, source: dict):
    kind = source["type"]
    if kind == "postgres":
        url = os.getenv(source.get("url_env", "POSTGRES_OPERATIONAL_URL"))
        if not url:
            raise ValueError("PostgreSQL connection URL environment variable is not set")
        props = {"url": url, "dbtable": f"{source.get('schema', 'public')}.{source['table']}"}
        if source.get("driver"):
            props["driver"] = source["driver"]
        return spark.read.format("jdbc").options(**props).load()
    if kind == "csv":
        return spark.read.option("header", True).option("inferSchema", True).csv(source["path"])
    if kind == "excel":
        import pandas as pd
        pdf = pd.read_excel(source["path"])
        return spark.createDataFrame(pdf)
    if kind == "rest_api":
        headers = json.loads(os.environ[source["headers_env"]]) if source.get("headers_env") else {}
        request = urllib.request.Request(source["url"], headers=headers)
        with urllib.request.urlopen(request, timeout=int(source.get("timeout_seconds", 30))) as response:
            payload = json.loads(response.read())
        rows = payload.get(source.get("data_key", "data"), payload) if isinstance(payload, dict) else payload
        if not isinstance(rows, list):
            raise ValueError("REST response must contain a list of records")
        return spark.createDataFrame(rows)
    raise ValueError(f"Unsupported source type: {kind}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--spec-json", required=True)
    spec = json.loads(parser.parse_args().spec_json)
    source = spec["source"]
    source_name = source.get("table") or source.get("path") or source.get("url") or spec["conn_id"]
    dataset = re.sub(r"[^A-Za-z0-9_-]", "_", str(source_name).rstrip("/").split("/")[-1])
    batch_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    output = spec.get("bronze", {}).get("path") or (
        f"s3a://midas-bronze/sources/{spec['conn_id']}/{dataset}/year={now:%Y}/"
        f"month={now:%m}/day={now:%d}/{batch_id}.parquet"
    )
    spark = SparkSession.builder.appName(f"midas-ingest-{spec['conn_id']}").getOrCreate()
    count = 0
    publish(spec, "RUNNING", detail="ingestion started")
    try:
        rows = extract(spark, source)
        columns = rows.columns
        count = rows.count()
        payload = F.to_json(F.struct(*[F.col(name) for name in columns]))
        enriched = (rows.withColumn("_raw_id", F.expr("uuid()"))
                    .withColumn("_source_type", F.lit({"postgres": "JDBC_POSTGRES", "csv": "CSV_STORAGE", "rest_api": "REST_API"}[source["type"]]))
                    .withColumn("_source_origin", F.lit(source.get("table", source.get("path", source.get("url", spec['conn_id'])))))
                    .withColumn("_ingested_at", F.current_timestamp())
                    .withColumn("_batch_id", F.lit(batch_id))
                    .withColumn("_schema_fingerprint", F.lit(hashlib.sha256("|".join(sorted(columns)).encode()).hexdigest()))
                    .withColumn("_raw_payload", payload)
                    .withColumn("_raw_payload_hash", F.sha2(payload, 256)))
        enriched.write.mode("append").parquet(output)
        publish(spec, "HEALTHY", count, f"Bronze parquet written to {output}")
    except Exception as exc:
        publish(spec, "ERROR", count, str(exc)[:500])
        raise
    finally:
        spark.stop()


if __name__ == "__main__":
    main()
