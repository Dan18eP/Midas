"""Persist canonical event payloads in the existing PostgreSQL projection."""

import json
from datetime import datetime, timedelta, timezone

from sqlalchemy import create_engine, text

from src.core.telemetry.events import TelemetryEvent


class TelemetryEventStore:
    def __init__(self, db_url):
        self.engine = create_engine(db_url, pool_pre_ping=True, connect_args={"connect_timeout": 3})

    def append(self, event):
        payload = event.to_dict()
        with self.engine.begin() as connection:
            connection.execute(text("""
                INSERT INTO pipeline_events (stage, node_id, event_type, status, records_count, payload, created_at)
                VALUES (:stage, :node, :kind, :status, :count, CAST(:payload AS JSONB), :timestamp)
                ON CONFLICT ((payload->>'event_id')) DO NOTHING
            """), {"stage": "PIPELINE", "node": event.node_id,
                   "kind": str((event.details or {}).get("event_type", "TELEMETRY")),
                   "status": event.status.value, "count": event.records_out,
                   "payload": json.dumps(payload), "timestamp": event.timestamp})

    def history(self, hours=None, limit=1000, node_id=None, after=None):
        conditions, params = [], {"limit": limit}
        if hours is not None:
            conditions.append("created_at >= :since")
            params["since"] = datetime.now(timezone.utc) - timedelta(hours=hours)
        if node_id:
            conditions.append("node_id = :node")
            params["node"] = node_id
        if after:
            conditions.append("event_id > COALESCE((SELECT event_id FROM pipeline_events WHERE payload->>'event_id' = :after), 0)")
            params["after"] = after
        where = " WHERE " + " AND ".join(conditions) if conditions else ""
        with self.engine.connect() as connection:
            rows = connection.execute(text(f"SELECT payload FROM pipeline_events{where} ORDER BY event_id DESC LIMIT :limit"), params).scalars().all()
        return [TelemetryEvent.model_validate(row) for row in reversed(rows)]
