"""Check persistence only in the disposable audit database at localhost:15432.

Run from the repository root with python -m scripts.verify_audit_database.
The audit Compose project must use the default development database credentials.
"""

from unittest.mock import Mock, patch
from uuid import uuid4

from src.core.session.store import SessionStore
from src.core.telemetry.events import TelemetryEvent, NodeStatus
from src.core.telemetry.store import TelemetryEventStore
from src.lakehouse.ingestion.connection_registry import SourceConnectionRegistry
from src.lakehouse.models.connection import SourceConnectionCreate, SourceType


def main():
    # The fixed port keeps this check away from the team's normal database.
    url = "postgresql://midas_admin:midas_secret_password_2026@127.0.0.1:15432/midas_operational"
    session_id = "audit_" + uuid4().hex[:16]
    sessions = SessionStore(url)
    with patch("src.core.session.store.generate_session_title", return_value="Audit dataset"):
        sessions.add_message(session_id, "user", "Audit dataset")
    sessions.update_topology(session_id, {"nodes": [{"id": "audit"}], "edges": []})
    reloaded = SessionStore(url)
    assert reloaded.get_messages(session_id)[0].content == "Audit dataset"
    assert reloaded.get_session(session_id).topology_state["nodes"][0]["id"] == "audit"
    print("POSTGRES: session creation, message FK, topology and fresh-store hydration passed")

    events = TelemetryEventStore(url)
    event = TelemetryEvent(pipeline_id="audit", node_id=session_id, status=NodeStatus.HEALTHY, records_out=2)
    events.append(event)
    events.append(event)
    assert len(TelemetryEventStore(url).history(hours=1, node_id=session_id)) == 1
    print("POSTGRES: telemetry durability, duplicate event retry and history filtering passed")

    # This checks real SQL persistence; contract storage is a test double.
    storage = Mock()
    registry = SourceConnectionRegistry(url, storage=storage)
    connection = registry.register_connection(SourceConnectionCreate(
        name=session_id, source_type=SourceType.POSTGRES,
        config_payload={"source": {"table": "pedidos"}},
    ))
    assert connection.status.value == "ACTIVE"
    assert storage.put_object.call_count == 1
    assert SourceConnectionRegistry(url).get_connection(connection.connection_id) is not None
    print("POSTGRES: source registration and reload passed; storage was mocked")


if __name__ == "__main__":
    main()
