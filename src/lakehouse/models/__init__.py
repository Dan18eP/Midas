"""
Midas Lakehouse Models Package
Data Modeling for Bronze, Silver and Gold Layers
Squad 1: Backend & Data Lakehouse Core
"""

from src.lakehouse.models.gold_marts import (
    FctVentasDiariasRecord,
    DimTiendasRegionesRecord,
    GoldMartsResult,
    get_fct_ventas_iceberg_schema,
    get_dim_tiendas_iceberg_schema,
    generate_openmetadata_table_spec,
)

__all__ = [
    "FctVentasDiariasRecord",
    "DimTiendasRegionesRecord",
    "GoldMartsResult",
    "get_fct_ventas_iceberg_schema",
    "get_dim_tiendas_iceberg_schema",
    "generate_openmetadata_table_spec",
]
