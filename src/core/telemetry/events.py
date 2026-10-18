"""Telemetry event data models adhering to Midas canonical contracts."""

from datetime import datetime, timezone
from enum import Enum
import json
import time
from typing import Any, Dict, Optional
import uuid
from pydantic import BaseModel, Field


class NodeStatus(str, Enum):
    """Canonical node execution statuses."""
    HEALTHY = "HEALTHY"
    RUNNING = "RUNNING"
    DEGRADED = "DEGRADED"
    ERROR = "ERROR"
    IN_PROGRESS = "IN_PROGRESS"
    AUTO_HEALING = "AUTO_HEALING"


class AnomalyType(str, Enum):
    """Canonical Midas Guardian anomaly types (F1-F5) per specification 04."""
    F1_DUPLICATE_KEY = "F1_DUPLICATE_KEY"
    F2_VOLUME_SPIKE = "F2_VOLUME_SPIKE"
    F3_NEGATIVE_AMOUNT = "F3_NEGATIVE_AMOUNT"
    F4_SCHEMA_DRIFT = "F4_SCHEMA_DRIFT"
    F5_ORPHAN_FOREIGN_KEY = "F5_ORPHAN_FOREIGN_KEY"


class GuardianDetails(BaseModel):
    """Structured operational details for Midas Guardian auto-healing events."""
    anomaly_type: Optional[AnomalyType] = Field(None, description="Identified anomaly pattern.")
    playbook_id: Optional[str] = Field(None, description="Identifier of the executing playbook (e.g. PB-03-QUARANTINE).")
    action_taken: Optional[str] = Field(None, description="Automated remediation action performed.")
    quarantined_records: int = Field(0, ge=0, description="Count of diverted quarantined records.")
    message: Optional[str] = Field(None, description="Diagnostic human-readable message.")



class TelemetryEvent(BaseModel):
    """Canonical telemetry event emitted by Lakehouse and pipeline nodes."""

    event_id: str = Field(
        default_factory=lambda: f"evt_{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}",
        description="Unique chronological identifier for the event, used in Last-Event-ID.",
    )
    pipeline_id: str = Field(..., description="Identifier of the executing pipeline or DAG.")
    node_id: str = Field(
        ...,
        description="Identifier of the Lakehouse node (e.g. source_postgres, bronze_raw, silver_cleansing, gold_marts).",
    )
    status: NodeStatus = Field(..., description="Operational status of the node.")
    records_in: int = Field(default=0, ge=0, description="Count of input records consumed by the node.")
    records_out: int = Field(default=0, ge=0, description="Count of valid output records produced.")
    latency_ms: float = Field(default=0.0, ge=0.0, description="Execution or processing latency in milliseconds.")
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc),
        description="UTC timestamp when the event was generated.",
    )
    details: Optional[Dict[str, Any]] = Field(
        default_factory=dict,
        description="Supplemental operational details (e.g. quarantined rows, error descriptions).",
    )

    def to_dict(self) -> Dict[str, Any]:
        """Convert to JSON-serializable dictionary."""
        data = self.model_dump()
        data["timestamp"] = self.timestamp.isoformat()
        data["status"] = self.status.value if isinstance(self.status, Enum) else self.status
        return data

    def to_sse_format(self, event_type: str = "telemetry") -> str:
        """Format the event as a W3C Server-Sent Events (SSE) packet.

        Format:
            id: <event_id>
            event: <event_type>
            data: <json_string>
            \n
        """
        payload = json.dumps(self.to_dict())
        return f"id: {self.event_id}\nevent: {event_type}\ndata: {payload}\n\n"
