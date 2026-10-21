"""Shared storage and telemetry helpers for the submitted Spark jobs."""

import hashlib
import io
import json
import logging
import os
import re
import urllib.request
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from urllib.parse import urlparse


def normalize_amount(value):
    if value is None or isinstance(value, bool):
        return None
    text = str(value).strip()
    text = re.sub(r"^(USD|COP|EUR)\s*", "", text)
    text = re.sub(r"[$€£\s]", "", text)
    if text.startswith("(") and text.endswith(")"):
        text = "-" + text[1:-1]
    if not re.fullmatch(r"-?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?", text):
        return None
    try:
        amount = Decimal(text.replace(",", "")).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        return amount if amount.is_finite() and abs(amount) < Decimal("1e16") else None
    except InvalidOperation:
        return None


def normalize_date(value):
    if value is None:
        return None
    try:
        if isinstance(value, (int, float)):
            parsed = datetime.fromtimestamp(value / 1000 if value > 1e11 else value, tz=timezone.utc)
        else:
            text = str(value).strip().replace("Z", "+00:00")
            parsed = None
            try:
                parsed = datetime.fromisoformat(text)
            except ValueError:
                for pattern in ("%Y/%m/%d %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d-%m-%Y %H:%M:%S", "%d/%m/%Y", "%d-%m-%Y"):
                    try:
                        parsed = datetime.strptime(text, pattern)
                        break
                    except ValueError:
                        continue
            if parsed is None:
                return None
        if not 1900 <= parsed.year <= 2100:
            return None
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).astimezone(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    except (ValueError, OverflowError, OSError):
        return None


def storage():
    from minio import Minio

    endpoint = urlparse(os.environ.get("MINIO_ENDPOINT", "http://midas-minio:9000"))
    return Minio(endpoint.netloc, access_key=os.environ["AWS_ACCESS_KEY_ID"],
                 secret_key=os.environ["AWS_SECRET_ACCESS_KEY"], secure=endpoint.scheme == "https")


def batch_key(batch_id):
    return hashlib.sha256(batch_id.encode()).hexdigest()


def bronze_root(spec):
    return spec.get("bronze", {}).get("path", f"s3a://midas-bronze/sources/{spec['conn_id']}/").rstrip("/")


def object_location(uri):
    parsed = urlparse(uri)
    return parsed.netloc, parsed.path.lstrip("/")


def read_manifest(spec, batch_id):
    bucket, prefix = object_location(bronze_root(spec))
    client = storage()
    try:
        response = client.get_object(bucket, f"{prefix}/_committed/{batch_key(batch_id)}.json")
    except Exception as exc:
        if getattr(exc, "code", None) in {"NoSuchKey", "NoSuchObject"}:
            return None
        raise
    try:
        return json.loads(response.read())
    finally:
        response.close()
        response.release_conn()


def commit_manifest(spec, batch_id, path):
    bucket, prefix = object_location(bronze_root(spec))
    payload = json.dumps({"batch_id": batch_id, "path": path}).encode()
    storage().put_object(bucket, f"{prefix}/_committed/{batch_key(batch_id)}.json",
                         io.BytesIO(payload), len(payload), content_type="application/json")


def completed_paths(spec):
    bucket, prefix = object_location(bronze_root(spec))
    client = storage()
    paths = []
    for item in client.list_objects(bucket, prefix=f"{prefix}/_committed/", recursive=True):
        response = client.get_object(bucket, item.object_name)
        try:
            paths.append(json.loads(response.read())["path"])
        finally:
            response.close()
            response.release_conn()
    return sorted(paths)


def publish_event(pipeline_id, node_id, status, count=0, detail="", records_out=None, details=None):
    event = {"pipeline_id": pipeline_id, "node_id": node_id, "status": status,
             "records_in": count, "records_out": count if records_out is None else records_out,
             "details": {"message": detail, **(details or {})}}
    request = urllib.request.Request(
        os.getenv("MIDAS_TELEMETRY_PUBLISH_URL", "http://midas-api:8000/api/v1/telemetry/publish"),
        data=json.dumps(event).encode(), headers={"Content-Type": "application/json",
        "Authorization": f"Bearer {os.getenv('MIDAS_TELEMETRY_TOKEN', '')}"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=3):
            pass
    except Exception:
        # A monitoring outage must not repeat a committed data write.
        logging.warning("Telemetry delivery failed for %s", pipeline_id)


def prepare_namespaces(spark):
    for layer, location in (("silver", "tables"), ("gold", "marts")):
        spark.sql(f"CREATE NAMESPACE IF NOT EXISTS {layer} LOCATION 's3://midas-{layer}/{location}/'")
