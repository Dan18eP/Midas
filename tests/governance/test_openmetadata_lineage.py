"""Pruebas del catálogo central y el extractor de linaje (HU-GOV-01).

Responsable: Sebastian Castiblanco (Governance Lead)

Las pruebas son offline: el cliente de OpenMetadata se sustituye por dobles,
de modo que la suite valide la topología declarada, el contrato del drawer y
la degradación elegante sin depender de que el servidor esté levantado.
"""

from datetime import datetime, timezone

import pytest

from src.security_governance.openmetadata import config as om_config
from src.security_governance.openmetadata.lineage_extractor import (
    build_declared_chain,
    build_fqn,
    build_lineage_payload,
    build_service_payload,
    iter_declared_edges,
    register_catalog_services,
    register_pipeline_lineage,
    resolve_layer,
    resolve_lineage_payload,
    resolve_location,
)


class FakeClient:
    """Doble del cliente REST con respuestas programables."""

    def __init__(self, *, tables=None, lineage=None, service_ok=True, edge_ok=True):
        self.tables = tables or {}
        self.lineage = lineage or {}
        self.service_ok = service_ok
        self.edge_ok = edge_ok
        self.services_sent = []
        self.edges_sent = []

    def get_table_by_fqn(self, fqn):
        return self.tables.get(fqn)

    def get_table_lineage(self, fqn, **_kwargs):
        return self.lineage.get(fqn)

    def upsert_database_service(self, payload):
        self.services_sent.append(payload)
        return {"id": "svc-1"} if self.service_ok else None

    def upsert_lineage_edge(self, payload):
        self.edges_sent.append(payload)
        return self.edge_ok


@pytest.fixture(autouse=True)
def _clear_config_cache():
    """Evita que el caché del YAML filtre entre pruebas."""
    om_config.load_connector_config.cache_clear()
    yield
    om_config.load_connector_config.cache_clear()


# ---------------------------------------------------------------------------
# ST-GOV-01.2 — Conectores declarados
# ---------------------------------------------------------------------------
def test_connector_config_declara_iceberg_y_postgres():
    nombres = {connector["name"] for connector in om_config.get_connectors()}
    assert nombres == {"midas_lakehouse_iceberg", "midas_operational_postgres"}


def test_conector_iceberg_cubre_las_tres_capas_medallon():
    iceberg = next(
        c for c in om_config.get_connectors() if c["name"] == "midas_lakehouse_iceberg"
    )
    capas = {schema["layer"] for schema in iceberg["schemas"]}
    assert capas == {"bronze", "silver", "gold"}


def test_payload_de_servicio_incluye_conexion_y_tipo():
    postgres = next(
        c for c in om_config.get_connectors() if c["name"] == "midas_operational_postgres"
    )
    payload = build_service_payload(postgres)

    assert payload["name"] == "midas_operational_postgres"
    assert payload["serviceType"] == "Postgres"
    assert payload["connection"]["config"]["hostPort"] == "midas-postgres:5432"
    assert payload["connection"]["config"]["database"] == "midas_operational"


def test_nombre_de_servicio_se_puede_sobreescribir_por_entorno(monkeypatch):
    monkeypatch.setenv("OPENMETADATA_SERVICE_ICEBERG", "catalogo_demo")
    assert build_fqn("midas_lakehouse_iceberg", "gold.fact_ventas_diarias").startswith(
        "catalogo_demo."
    )


def test_registro_de_servicios_reporta_exitos_y_fallos():
    ok = register_catalog_services(FakeClient(service_ok=True))
    assert ok["failed"] == []
    assert len(ok["registered"]) == 2

    caido = register_catalog_services(FakeClient(service_ok=False))
    assert caido["registered"] == []
    assert len(caido["failed"]) == 2


# ---------------------------------------------------------------------------
# ST-GOV-01.3 — Linaje entre fuentes, PySpark y Gold
# ---------------------------------------------------------------------------
def test_topologia_declara_la_cadena_completa_hasta_gold():
    destinos = {edge.to_table for edge in iter_declared_edges()}
    assert "bronze.pedidos" in destinos
    assert "silver.pedidos" in destinos
    assert "gold.fact_ventas_diarias" in destinos


def test_cadena_ascendente_de_un_mart_gold_recorre_las_cuatro_capas():
    cadena = build_declared_chain("gold.fact_ventas_diarias")
    capas = [resolve_layer(edge.from_service, edge.from_table) for edge in cadena]

    assert "source" in capas
    assert "bronze" in capas
    assert "silver" in capas
    assert cadena[-1].to_table == "gold.fact_ventas_diarias"


def test_cadena_de_un_mart_toma_la_rama_primaria_declarada():
    cadena = build_declared_chain("gold.fact_ventas_diarias")
    tablas = [edge.from_table for edge in cadena]

    # La primera arista declarada hacia el mart parte de pedidos, no de
    # ordenes_detalle: es la rama que sustenta la fórmula de venta neta.
    assert tablas == ["public.pedidos", "bronze.pedidos", "silver.pedidos"]


def test_payload_de_mart_expone_una_etapa_por_capa():
    payload = build_lineage_payload("gold.fact_ventas_diarias", catalog_verified=True)
    capas = [stage["layer"] for stage in payload["stages"]]
    assert capas == ["source", "bronze", "silver", "gold"]


def test_cadena_de_tabla_no_declarada_queda_vacia():
    assert build_declared_chain("gold.inexistente") == []


def test_registro_de_linaje_envia_aristas_resueltas():
    pedidos_source = build_fqn("midas_operational_postgres", "public.pedidos")
    pedidos_bronze = build_fqn("midas_lakehouse_iceberg", "bronze.pedidos")
    client = FakeClient(tables={pedidos_source: {"id": "a"}, pedidos_bronze: {"id": "b"}})

    reporte = register_pipeline_lineage(client)

    assert f"{pedidos_source} -> {pedidos_bronze}" in reporte["created"]
    assert reporte["skipped"], "las tablas no catalogadas deben reportarse como omitidas"
    enviado = client.edges_sent[0]["edge"]
    assert enviado["fromEntity"] == {"id": "a", "type": "table"}
    assert enviado["toEntity"] == {"id": "b", "type": "table"}


def test_registro_de_linaje_omite_entidades_sin_catalogar():
    reporte = register_pipeline_lineage(FakeClient(tables={}))
    assert reporte["created"] == []
    assert len(reporte["skipped"]) == len(list(iter_declared_edges()))


# ---------------------------------------------------------------------------
# ST-GOV-01.4 — Contrato del drawer "Explícame esta cifra"
# ---------------------------------------------------------------------------
def test_payload_respeta_el_contrato_del_drawer():
    payload = build_lineage_payload(
        "gold.fact_ventas_diarias",
        catalog_verified=True,
        observed_at=datetime(2026, 10, 20, 12, 0, tzinfo=timezone.utc),
    )

    assert set(payload) >= {"table", "stages", "transformation", "certification"}
    assert payload["certification"]["last_sync"] is None
    assert payload["certification"]["quality_percent"] is None
    assert len(payload["certification"]["audit_hash"]) == 64

    capas = [stage["layer"] for stage in payload["stages"]]
    assert capas == sorted(capas, key=["source", "bronze", "silver", "gold"].index)
    for stage in payload["stages"]:
        assert stage["table"] and stage["location"] and stage["description"]


def test_payload_de_mart_de_ventas_incluye_formula_canonica():
    payload = build_lineage_payload("gold.fact_ventas_diarias", catalog_verified=True)
    assert payload["formula"]["key"] == "venta_neta"
    assert "\\sum" in payload["formula"]["latex"]


def test_ubicaciones_fisicas_por_capa():
    assert resolve_location("midas_lakehouse_iceberg", "bronze.pedidos") == "s3://midas-bronze/pedidos/"
    assert resolve_location("midas_lakehouse_iceberg", "gold.dim_clientes") == "s3://midas-gold/dim_clientes/"
    assert resolve_location("midas_operational_postgres", "public.pedidos").startswith("postgresql://")


def test_certificacion_distingue_catalogo_verificado():
    verificado = build_lineage_payload("gold.dim_clientes", catalog_verified=True)
    declarado = build_lineage_payload("gold.dim_clientes", catalog_verified=False)

    assert "caliente" in verificado["certification"]["quality_summary"]
    assert "declarada" in declarado["certification"]["quality_summary"]
    # El hash de auditoría solo depende de la topología, no del estado del catálogo.
    assert verificado["certification"]["audit_hash"] == declarado["certification"]["audit_hash"]


# ---------------------------------------------------------------------------
# Degradación elegante
# ---------------------------------------------------------------------------
def test_resolucion_devuelve_none_si_la_tabla_no_esta_catalogada():
    assert resolve_lineage_payload("gold.fact_ventas_diarias", FakeClient(tables={})) is None


def test_resolucion_devuelve_none_para_tabla_no_declarada():
    assert resolve_lineage_payload("gold.inexistente", FakeClient()) is None


def test_resolucion_devuelve_none_con_nombre_vacio():
    assert resolve_lineage_payload("   ", FakeClient()) is None


def test_resolucion_marca_verificado_cuando_el_catalogo_tiene_aristas():
    fqn = build_fqn("midas_lakehouse_iceberg", "gold.fact_ventas_diarias")
    client = FakeClient(
        tables={fqn: {"id": "gold-1"}},
        lineage={fqn: {"upstreamEdges": [{"fromEntity": "x", "toEntity": "gold-1"}]}},
    )

    payload = resolve_lineage_payload("gold.fact_ventas_diarias", client)

    assert payload is not None
    assert "caliente" in payload["certification"]["quality_summary"]


def test_resolucion_degrada_a_topologia_declarada_sin_aristas_en_catalogo():
    fqn = build_fqn("midas_lakehouse_iceberg", "gold.fact_ventas_diarias")
    client = FakeClient(tables={fqn: {"id": "gold-1"}}, lineage={})

    payload = resolve_lineage_payload("gold.fact_ventas_diarias", client)

    assert payload is not None
    assert "declarada" in payload["certification"]["quality_summary"]
