"""Translate a registered connection into the contract Airflow consumes."""

import re
from urllib.parse import urlparse

from src.core.cron import is_valid_cron_schedule


def build_source_contract(record):
    config = record["config_payload"]
    reject_inline_secrets(config)
    kind = {"POSTGRES": "postgres", "CSV": "csv", "EXCEL": "excel", "REST": "rest_api"}[record["source_type"]]
    source = dict(config.get("source", {}))
    source["type"] = kind
    if kind == "postgres":
        source.setdefault("table", config.get("table"))
        source.setdefault("schema", config.get("schema", "public"))
        if not source["table"]:
            return None
        for identifier in (source["schema"], source["table"]):
            if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", identifier):
                raise ValueError("Table and schema must be simple identifiers")
    elif kind in {"csv", "excel"}:
        source.setdefault("path", config.get("storage_uri") or config.get("file_path"))
        if not source["path"]:
            return None
        if urlparse(source["path"]).scheme not in {"s3", "s3a"}:
            raise ValueError("Uploaded files must use shared S3 storage")
        if kind == "excel":
            source.setdefault("sheets", config.get("sheets", []))
        else:
            source.setdefault("delimiter", config.get("delimiter") or ",")
    else:
        source.setdefault("url", config.get("endpoint_url") or config.get("url"))
        if not source["url"]:
            return None
        if urlparse(source["url"]).scheme not in {"http", "https"}:
            raise ValueError("REST sources require an HTTP URL")
    schedule = config.get("cron_schedule", "0 */6 * * *")
    if not is_valid_cron_schedule(schedule):
        raise ValueError("Invalid connection schedule")
    connection_id = record["connection_id"]
    silver = dict(config.get("silver", {}))
    silver.setdefault("table", f"silver.{connection_id}")
    if silver["table"] != f"silver.{connection_id}":
        raise ValueError("Each managed connection must own its Silver table")
    for field in ("primary_key_fields", "amount_fields", "date_fields"):
        values = silver.get(field, [])
        if not isinstance(values, list) or not all(isinstance(value, str) and re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value) for value in values):
            raise ValueError(f"Invalid Silver {field}")
    silver.pop("quarantine_path", None)
    return {"kind": "connection", "conn_id": connection_id, "cron_schedule": schedule,
            "source": source, "silver": silver,
            "bronze": {"path": f"s3a://midas-bronze/sources/{connection_id}/"}}


def reject_inline_secrets(config):
    for key, value in config.items():
        if key.lower() in {"password", "secret", "token", "api_key", "headers", "authorization"}:
            raise ValueError("Use an environment reference for credentials")
        if isinstance(value, dict):
            reject_inline_secrets(value)
        elif isinstance(value, str) and "://" in value and urlparse(value).password:
            raise ValueError("Connection URLs must not contain passwords")
