"""
Midas Lakehouse - Unit and Integration Tests for Silver to Gold Marts & KPI Aggregations
Historia de Usuario: HU-LAKE-04
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
Documentos Canónicos:
  - documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md
  - documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md
"""

from decimal import Decimal
import os
import pytest
import tempfile
import time
from typing import Any, Dict, List

import pyarrow as pa
from pyiceberg.catalog import load_catalog

from src.core.telemetry.events import NodeStatus
from src.lakehouse.models.gold_marts import (
    FctVentasDiariasRecord,
    DimTiendasRegionesRecord,
    GoldMartsResult,
    get_fct_ventas_arrow_schema,
    get_dim_tiendas_arrow_schema,
    get_fct_ventas_iceberg_schema,
    get_dim_tiendas_iceberg_schema,
    get_fct_ventas_openmetadata_spec,
    get_dim_tiendas_openmetadata_spec,
)
from src.lakehouse.transforms.silver_to_gold import (
    SilverToGoldTransformer,
    round_decimal,
)
from src.lakehouse.storage.acid_manager import MidasAcidStorageManager


# ==============================================================================
# 1. Tests de Fórmulas Canónicas Inmutables (ST-LAKE-04.3)
# ==============================================================================

def test_canonical_kpi_formulas_calculation():
    """
    Valida las fórmulas canónicas de negocio oficiales:
    Venta Bruta = sum(cantidad * precio_unitario)
    Venta Neta = sum(monto_bruto - descuento - devoluciones)
    Pedidos Válidos = count(distinct pedido_id)
    Ticket Promedio = Venta Neta / Pedidos Válidos
    """
    transformer = SilverToGoldTransformer()

    # Lote de prueba con 3 pedidos válidos y 1 cancelado
    silver_data = [
        # Pedido 1: 2 items, bruto 200, descuento 20, sin devolucion -> Neto 180
        {
            "pedido_id": "PED-001",
            "cantidad": 2,
            "precio_unitario": 100.0,
            "descuento": 20.0,
            "devolucion": 0.0,
            "estado": "ENTREGADO",
            "fecha": "2026-10-20T10:00:00Z",
        },
        # Pedido 2: 1 item, bruto 150, descuento 0, devolucion 30 -> Neto 120
        {
            "pedido_id": "PED-002",
            "cantidad": 1,
            "precio_unitario": 150.0,
            "descuento": 0.0,
            "devolucion": 30.0,
            "estado": "ENTREGADO",
            "fecha": "2026-10-20T11:00:00Z",
        },
        # Pedido 3: 3 items, bruto 300, descuento porcentaje 10% (30), devolucion 0 -> Neto 270
        {
            "pedido_id": "PED-003",
            "cantidad": 3,
            "precio_unitario": 100.0,
            "descuento": 0.10,  # 10% de 300 = 30
            "devolucion": 0.0,
            "estado": "ENTREGADO",
            "fecha": "2026-10-20T12:00:00Z",
        },
        # Pedido 4: CANCELADO -> No debe computar en ventas netas ni pedidos válidos
        {
            "pedido_id": "PED-004",
            "cantidad": 5,
            "precio_unitario": 200.0,
            "descuento": 0.0,
            "devolucion": 0.0,
            "estado": "CANCELADO",
            "fecha": "2026-10-20T13:00:00Z",
        },
    ]

    kpis = transformer.calculate_canonical_kpis(silver_data)

    # Venta Bruta: 200 + 150 + 300 = 650.00
    assert kpis["venta_bruta"] == 650.00

    # Total Descuentos: 20 + 0 + 30 = 50.00
    assert kpis["total_descuento"] == 50.00

    # Total Devoluciones: 0 + 30 + 0 = 30.00
    assert kpis["total_devoluciones"] == 30.00

    # Venta Neta: 650 - 50 - 30 = 570.00
    assert kpis["venta_neta"] == 570.00

    # Pedidos Válidos: PED-001, PED-002, PED-003 = 3 (PED-004 excluido por CANCELADO)
    assert kpis["pedidos_validos"] == 3

    # Ticket Promedio: 570.00 / 3 = 190.00
    assert kpis["ticket_promedio"] == 190.00

    # Tasa Devolución: 0 pedidos en estado DEVUELTO de 3 entregados
    assert kpis["tasa_devolucion"] == 0.00


def test_canonical_kpis_zero_division_guard():
    """Valida que un lote sin pedidos válidos retorne Ticket Promedio 0.00 sin excepción."""
    transformer = SilverToGoldTransformer()

    # Solo cancelados o lista vacía
    cancelled_only = [
        {"pedido_id": "PED-X", "monto": 500.0, "estado": "CANCELADO"},
        {"pedido_id": "PED-Y", "monto": 300.0, "estado": "CANCELADO"},
    ]
    kpis = transformer.calculate_canonical_kpis(cancelled_only)

    assert kpis["pedidos_validos"] == 0
    assert kpis["venta_neta"] == 0.00
    assert kpis["ticket_promedio"] == 0.00
    assert kpis["tasa_devolucion"] == 0.00


def test_tasa_devolucion_calculation():
    """Valida el cálculo porcentual exacto de la tasa de devolución."""
    transformer = SilverToGoldTransformer()

    batch = [
        {"pedido_id": "P-1", "monto": 100.0, "estado": "ENTREGADO"},
        {"pedido_id": "P-2", "monto": 100.0, "estado": "ENTREGADO"},
        {"pedido_id": "P-3", "monto": 100.0, "estado": "ENTREGADO"},
        {"pedido_id": "P-4", "monto": 100.0, "estado": "DEVUELTO"},
    ]
    kpis = transformer.calculate_canonical_kpis(batch)

    assert kpis["pedidos_validos"] == 4
    assert kpis["pedidos_devueltos"] == 1
    # 1 devuelto de 4 entregados/devueltos = 25.00%
    assert kpis["tasa_devolucion"] == 25.00


# ==============================================================================
# 2. Tests de Dimensión gold.dim_tiendas_regiones (ST-LAKE-04.2)
# ==============================================================================

def test_dim_tiendas_regiones_construction():
    """Valida la construcción de la dimensión de tiendas y regiones comerciales."""
    transformer = SilverToGoldTransformer()
    dim_records = transformer.build_dim_tiendas()

    assert len(dim_records) >= 4
    region_ids = [d.region_id for d in dim_records]
    assert "REG-CENTRO" in region_ids
    assert "REG-NORTE" in region_ids
    assert "REG-SUR" in region_ids

    # Verificar serialización a diccionario
    first_dict = dim_records[0].to_dict()
    assert "tienda_id" in first_dict
    assert "nombre_tienda" in first_dict
    assert "region_geografica" in first_dict
    assert "gerente_regional" in first_dict
    assert first_dict["activa"] is True


def test_dim_tiendas_custom_catalog():
    """Valida la inyección de un catálogo personalizado de sucursales."""
    transformer = SilverToGoldTransformer()
    custom = [
        {
            "tienda_id": "TND-BARQ",
            "nombre_tienda": "Sucursal Barranquilla Caribe",
            "region_id": "REG-CARIBE",
            "region_geografica": "NORTE",
            "ciudad": "Barranquilla",
            "canal_predominante": "TIENDA",
            "gerente_regional": "Carlos Vives",
            "activa": True,
        }
    ]
    dim_records = transformer.build_dim_tiendas(custom_stores=custom)
    assert len(dim_records) == 1
    assert dim_records[0].tienda_id == "TND-BARQ"
    assert dim_records[0].ciudad == "Barranquilla"


# ==============================================================================
# 3. Tests de Particionado (anio, mes) y Z-Ordering (ST-LAKE-04.1 & ST-LAKE-04.4)
# ==============================================================================

def test_partitioning_components_extraction():
    """Valida la descomposición temporal estricta de fechas en (fecha, anio, mes, dia)."""
    transformer = SilverToGoldTransformer()

    fecha, anio, mes, dia = transformer.parse_date_components("2026-10-20T15:30:00Z")
    assert fecha == "2026-10-20"
    assert anio == 2026
    assert mes == 10
    assert dia == 20

    fecha2, anio2, mes2, dia2 = transformer.parse_date_components("2025-12-31")
    assert fecha2 == "2025-12-31"
    assert anio2 == 2025
    assert mes2 == 12
    assert dia2 == 31


def test_transform_and_aggregate_sales_daily_grain_and_z_ordering():
    """
    Valida la materialización de hechos en grano diario agregados y el ordenamiento multidimensional
    (Z-Ordering) por (region_id, cliente_id).
    """
    transformer = SilverToGoldTransformer()

    silver_batch = [
        # Transacción 1: Cliente A en REG-NORTE
        {
            "transaccion_id": "TX-1",
            "pedido_id": "PED-1",
            "cliente_id": "CLI-B",
            "tienda_id": "TND-002",
            "canal_venta": "TIENDA",
            "monto": 200.0,
            "descuento": 0.0,
            "fecha_transaccion": "2026-10-20T10:00:00Z",
            "estado": "ENTREGADO",
        },
        # Transacción 2: Mismo grupo (mismo cliente, fecha, tienda) -> debe agregarse
        {
            "transaccion_id": "TX-2",
            "pedido_id": "PED-2",
            "cliente_id": "CLI-B",
            "tienda_id": "TND-002",
            "canal_venta": "TIENDA",
            "monto": 300.0,
            "descuento": 50.0,
            "fecha_transaccion": "2026-10-20T11:00:00Z",
            "estado": "ENTREGADO",
        },
        # Transacción 3: Cliente A en REG-CENTRO
        {
            "transaccion_id": "TX-3",
            "pedido_id": "PED-3",
            "cliente_id": "CLI-A",
            "tienda_id": "TND-001",
            "canal_venta": "TIENDA",
            "monto": 150.0,
            "descuento": 10.0,
            "fecha_transaccion": "2026-10-20T12:00:00Z",
            "estado": "ENTREGADO",
        },
    ]

    result: GoldMartsResult = transformer.transform_and_aggregate_sales(silver_batch)

    assert result.total_silver_in == 3
    # Debe haber 2 registros agregados en el grano diario
    assert result.fct_ventas_count == 2
    assert result.dim_tiendas_count >= 4

    # Verificar métricas globales del lote
    # Bruto: 200 + 300 + 150 = 650.00
    assert result.total_venta_bruta == 650.00
    # Descuentos: 0 + 50 + 10 = 60.00 -> Neto: 590.00
    assert result.total_venta_neta == 590.00
    assert result.total_pedidos_validos == 3
    # Ticket Promedio Global: 590.00 / 3 = 196.67
    assert result.ticket_promedio_global == 196.67

    # Verificar ordenamiento / Z-Ordering: REG-CENTRO antes que REG-NORTE
    fct_records = result.fct_ventas_records
    assert fct_records[0]["region_id"] == "REG-CENTRO"
    assert fct_records[0]["cliente_id"] == "CLI-A"
    assert fct_records[0]["anio"] == 2026
    assert fct_records[0]["mes"] == 10

    assert fct_records[1]["region_id"] == "REG-NORTE"
    assert fct_records[1]["cliente_id"] == "CLI-B"
    # Grupo CLI-B acumuló 2 pedidos y venta_neta = 200 + (300-50) = 450.00
    assert fct_records[1]["pedidos_validos"] == 2
    assert fct_records[1]["venta_neta"] == 450.00
    assert fct_records[1]["ticket_promedio"] == 225.00


# ==============================================================================
# 4. Tests de Firmas para OpenMetadata (ST-LAKE-04.4)
# ==============================================================================

def test_openmetadata_signatures_structure():
    """Valida la generación de firmas de metadatos para OpenMetadata."""
    fct_spec = get_fct_ventas_openmetadata_spec()
    assert fct_spec["name"] == "fct_ventas_diarias"
    assert fct_spec["databaseSchema"] == "gold"
    assert fct_spec["fullyQualifiedName"] == "midas_lakehouse.gold.fct_ventas_diarias"
    assert "GOLD_CERTIFIED" in [t["tagFQN"] for t in fct_spec["tags"]]
    assert "FINANCIAL_KPI" in [t["tagFQN"] for t in fct_spec["tags"]]
    assert fct_spec["partitionConfig"]["partitionColumns"] == ["anio", "mes"]
    assert fct_spec["optimization"]["zOrderingKeys"] == ["region_id", "cliente_id"]

    # Validar presencia de columnas críticas
    col_names = [c["name"] for c in fct_spec["columns"]]
    assert "venta_neta" in col_names
    assert "ticket_promedio" in col_names
    assert "pedidos_validos" in col_names

    dim_spec = get_dim_tiendas_openmetadata_spec()
    assert dim_spec["name"] == "dim_tiendas_regiones"
    assert "DIMENSION" in [t["tagFQN"] for t in dim_spec["tags"]]


# ==============================================================================
# 5. Tests de Telemetría hacia Canvas
# ==============================================================================

def test_telemetry_emission_gold_marts():
    """Valida la emisión de eventos de telemetría hacia el nodo 'gold_marts'."""
    events_received = []

    def mock_publisher(evt):
        events_received.append(evt)

    transformer = SilverToGoldTransformer(telemetry_publisher=mock_publisher)
    silver_data = [
        {"transaccion_id": "T-1", "monto": 100.0, "fecha": "2026-10-20"},
        {"transaccion_id": "T-2", "monto": 250.0, "fecha": "2026-10-20"},
    ]
    result = transformer.transform_and_aggregate_sales(silver_data)

    assert len(events_received) == 1
    event = events_received[0]
    assert event["node_id"] == "gold_marts"
    assert event["status"] == NodeStatus.HEALTHY
    assert event["records_in"] == 2
    assert event["records_out"] == result.fct_ventas_count
    assert event["details"]["stage"] == "GOLD_PUBLISH"
    assert event["details"]["venta_neta"] == 350.00
    assert event["details"]["target_tables"] == ["gold.fct_ventas_diarias", "gold.dim_tiendas_regiones"]


# ==============================================================================
# 6. Tests de Integración End-to-End con Iceberg v2 y PyArrow
# ==============================================================================

def test_end_to_end_iceberg_v2_gold_marts_persistence(tmp_path):
    """
    Valida la materialización y persistencia ACID real en tablas Iceberg v2
    para gold.fct_ventas_diarias y gold.dim_tiendas_regiones.
    """
    db_file = tmp_path / "iceberg_catalog_gold.db"
    warehouse_dir = tmp_path / "warehouse_gold"
    warehouse_dir.mkdir(parents=True, exist_ok=True)

    db_path = str(db_file).replace("\\", "/")
    wh_path = str(warehouse_dir).replace("\\", "/")

    catalog = load_catalog(
        "gold_test_catalog",
        **{
            "type": "sql",
            "uri": f"sqlite:///{db_path}",
            "warehouse": f"file:///{wh_path}",
            "py-io-impl": "pyiceberg.io.fsspec.FsspecFileIO",
        },
    )

    catalog.create_namespace("gold")
    acid_mgr = MidasAcidStorageManager(custom_catalog=catalog)

    # 1. Crear las dos tablas Iceberg v2 en el namespace gold
    fct_schema = get_fct_ventas_iceberg_schema()
    dim_schema = get_dim_tiendas_iceberg_schema()

    fct_table = acid_mgr.create_table_v2("gold.fct_ventas_diarias", fct_schema)
    dim_table = acid_mgr.create_table_v2("gold.dim_tiendas_regiones", dim_schema)

    assert fct_table.format_version == 2
    assert dim_table.format_version == 2

    # 2. Ejecutar transformación con persist_iceberg=True
    transformer = SilverToGoldTransformer(acid_manager=acid_mgr)

    silver_records = [
        {
            "transaccion_id": "TX-E2E-1",
            "pedido_id": "PED-E2E-1",
            "cliente_id": "CLI-100",
            "tienda_id": "TND-001",
            "canal_venta": "TIENDA",
            "monto": 500.0,
            "descuento": 50.0,
            "fecha": "2026-10-20T12:00:00Z",
            "estado": "ENTREGADO",
        },
        {
            "transaccion_id": "TX-E2E-2",
            "pedido_id": "PED-E2E-2",
            "cliente_id": "CLI-200",
            "tienda_id": "TND-002",
            "canal_venta": "TIENDA",
            "monto": 800.0,
            "descuento": 80.0,
            "fecha": "2026-10-20T14:00:00Z",
            "estado": "ENTREGADO",
        },
    ]

    result = transformer.transform_and_aggregate_sales(silver_records, persist_iceberg=True)

    assert result.fct_ventas_count == 2
    assert result.fct_ventas_path is not None
    assert result.dim_tiendas_path is not None

    # 3. Leer directamente desde el catálogo Iceberg para verificar consistencia ACID
    arrow_fct = acid_mgr.read_current("gold.fct_ventas_diarias")
    assert len(arrow_fct) == 2
    assert "venta_neta" in arrow_fct.column_names
    assert "ticket_promedio" in arrow_fct.column_names

    arrow_dim = acid_mgr.read_current("gold.dim_tiendas_regiones")
    assert len(arrow_dim) >= 4
    assert "nombre_tienda" in arrow_dim.column_names

    # 4. Validar que la tabla tiene un Snapshot válido
    snapshots = acid_mgr.get_snapshot_history("gold.fct_ventas_diarias")
    assert len(snapshots) >= 1
    assert snapshots[0]["snapshot_id"] != -1
