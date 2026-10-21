"""Check registration, activation failures, and connection isolation."""

import pytest
import yaml

from src.lakehouse.ingestion.connection_registry import SourceConnectionRegistry
from src.lakehouse.models.connection import SourceConnectionCreate


class Storage:
    def __init__(self):
        self.objects = {}

    def put_object(self, bucket, key, payload, **kwargs):
        self.objects[key] = yaml.safe_load(payload)


def test_complete_source_publishes_its_isolated_contract():
    storage = Storage()
    registry = SourceConnectionRegistry(storage=storage)
    source = registry.register_connection(SourceConnectionCreate(
        name="Warehouse source", source_type="POSTGRES", config_payload={"table": "pedidos"},
    ))
    contract = storage.objects[f"source-contracts/{source.connection_id}.yaml"]
    assert contract["silver"]["table"] == f"silver.{source.connection_id}"
    assert source.connection_id in contract["bronze"]["path"]
    assert source.status == "ACTIVE"


def test_incomplete_source_is_not_reported_active():
    result = SourceConnectionRegistry().register_connection(SourceConnectionCreate(
        name="Incomplete postgres", source_type="POSTGRES", config_payload={},
    ))
    assert result.status == "INACTIVE"


def test_registration_does_not_hide_failed_contract_publication():
    class Offline(Storage):
        def put_object(self, *args, **kwargs):
            raise ConnectionError("offline")

    registry = SourceConnectionRegistry(storage=Offline())
    with pytest.raises(RuntimeError, match="publish"):
        registry.register_connection(SourceConnectionCreate(
            name="Offline source", source_type="POSTGRES", config_payload={"table": "pedidos"},
        ))
    assert all(item.name != "Offline source" for item in registry.list_connections())


@pytest.mark.parametrize("config", [{"password": "secret"}, {"source": {"headers": {"Authorization": "secret"}}}])
def test_inline_credentials_are_rejected(config):
    with pytest.raises(ValueError, match="environment reference"):
        SourceConnectionRegistry().register_connection(SourceConnectionCreate(
            name="Secret source", source_type="REST", config_payload=config,
        ))
