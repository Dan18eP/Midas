"""
Midas Lakehouse Models - Gold Layer Dimensional Marts & Metadata Signatures
Historia de Usuario: HU-LAKE-04 (PySpark Silver -> Gold Business Marts & KPI Aggregations)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
Documentos Canónicos:
  - documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md
  - documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md
"""

from dataclasses import dataclass, field, asdict
from decimal import Decimal
from typing import Any, Dict, List, Optional
import pyarrow as pa

try:
    from pyiceberg.schema import Schema
    from pyiceberg.types import (
        NestedField,
        StringType,
        IntegerType,
        LongType,
        DoubleType,
        DateType,
        BooleanType,
    )
except ImportError:
    Schema = None
    NestedField = None
    StringType = None
    IntegerType = None
    LongType = None
    DoubleType = None
    DateType = None
    BooleanType = None


@dataclass
class FctVentasDiariasRecord:
    """Registro atómico de la tabla de hechos dimensional gold.fct_ventas_diarias."""
    fecha: str  # YYYY-MM-DD
    anio: int
    mes: int
    dia: int
    region_id: str
    tienda_id: str
    cliente_id: str
    canal_venta: str  # 'ONLINE', 'TIENDA', 'PARTNER'
    venta_bruta: float
    total_descuento: float
    total_devoluciones: float
    venta_neta: float
    pedidos_validos: int
    ticket_promedio: float
    pedidos_devueltos: int = 0
    tasa_devolucion: float = 0.0

    def to_dict(self) -> Dict[str, Any]:
        """Convierte el registro a diccionario serializable."""
        return asdict(self)


@dataclass
class DimTiendasRegionesRecord:
    """Registro de dimensión enriquecida gold.dim_tiendas_regiones."""
    tienda_id: str
    nombre_tienda: str
    region_id: str
    region_geografica: str  # 'NORTE', 'SUR', 'CENTRO', 'ORIENTE', 'OCCIDENTE'
    ciudad: str
    canal_predominante: str  # 'ONLINE', 'TIENDA', 'PARTNER'
    gerente_regional: str
    activa: bool = True

    def to_dict(self) -> Dict[str, Any]:
        """Convierte el registro a diccionario serializable."""
        return asdict(self)


@dataclass
class GoldMartsResult:
    """Resultado del pipeline de procesamiento de Silver a Gold."""
    batch_id: str
    total_silver_in: int
    fct_ventas_count: int
    dim_tiendas_count: int
    processing_ms: float
    total_venta_bruta: float
    total_venta_neta: float
    total_pedidos_validos: int
    ticket_promedio_global: float
    fct_ventas_records: List[Dict[str, Any]] = field(default_factory=list)
    dim_tiendas_records: List[Dict[str, Any]] = field(default_factory=list)
    fct_ventas_path: Optional[str] = None
    dim_tiendas_path: Optional[str] = None
    openmetadata_specs: Dict[str, Dict[str, Any]] = field(default_factory=dict)
    telemetry_event: Optional[Dict[str, Any]] = None

    def to_summary_dict(self) -> Dict[str, Any]:
        """Resumen estadístico del lote para logs y telemetría."""
        return {
            "batch_id": self.batch_id,
            "total_silver_in": self.total_silver_in,
            "fct_ventas_count": self.fct_ventas_count,
            "dim_tiendas_count": self.dim_tiendas_count,
            "processing_ms": self.processing_ms,
            "total_venta_bruta": self.total_venta_bruta,
            "total_venta_neta": self.total_venta_neta,
            "total_pedidos_validos": self.total_pedidos_validos,
            "ticket_promedio_global": self.ticket_promedio_global,
            "fct_ventas_path": self.fct_ventas_path,
            "dim_tiendas_path": self.dim_tiendas_path,
        }


# ==============================================================================
# Esquemas PyIceberg Oficiales (Formato Abierto v2)
# ==============================================================================

def get_fct_ventas_iceberg_schema() -> Optional[Any]:
    """Retorna el esquema PyIceberg oficial para gold.fct_ventas_diarias."""
    if Schema is None:
        return None
    return Schema(
        NestedField(field_id=1, name="fecha", field_type=StringType(), required=True),
        NestedField(field_id=2, name="anio", field_type=IntegerType(), required=True),
        NestedField(field_id=3, name="mes", field_type=IntegerType(), required=True),
        NestedField(field_id=4, name="dia", field_type=IntegerType(), required=True),
        NestedField(field_id=5, name="region_id", field_type=StringType(), required=True),
        NestedField(field_id=6, name="tienda_id", field_type=StringType(), required=True),
        NestedField(field_id=7, name="cliente_id", field_type=StringType(), required=True),
        NestedField(field_id=8, name="canal_venta", field_type=StringType(), required=True),
        NestedField(field_id=9, name="venta_bruta", field_type=DoubleType(), required=True),
        NestedField(field_id=10, name="total_descuento", field_type=DoubleType(), required=True),
        NestedField(field_id=11, name="total_devoluciones", field_type=DoubleType(), required=True),
        NestedField(field_id=12, name="venta_neta", field_type=DoubleType(), required=True),
        NestedField(field_id=13, name="pedidos_validos", field_type=LongType(), required=True),
        NestedField(field_id=14, name="ticket_promedio", field_type=DoubleType(), required=True),
        NestedField(field_id=15, name="pedidos_devueltos", field_type=LongType(), required=False),
        NestedField(field_id=16, name="tasa_devolucion", field_type=DoubleType(), required=False),
    )


def get_dim_tiendas_iceberg_schema() -> Optional[Any]:
    """Retorna el esquema PyIceberg oficial para gold.dim_tiendas_regiones."""
    if Schema is None:
        return None
    return Schema(
        NestedField(field_id=1, name="tienda_id", field_type=StringType(), required=True),
        NestedField(field_id=2, name="nombre_tienda", field_type=StringType(), required=True),
        NestedField(field_id=3, name="region_id", field_type=StringType(), required=True),
        NestedField(field_id=4, name="region_geografica", field_type=StringType(), required=True),
        NestedField(field_id=5, name="ciudad", field_type=StringType(), required=True),
        NestedField(field_id=6, name="canal_predominante", field_type=StringType(), required=True),
        NestedField(field_id=7, name="gerente_regional", field_type=StringType(), required=True),
        NestedField(field_id=8, name="activa", field_type=BooleanType(), required=False),
    )


# ==============================================================================
# Esquemas PyArrow Oficiales (Intercambio en Memoria y Parquet)
# ==============================================================================

def get_fct_ventas_arrow_schema() -> pa.Schema:
    """Retorna el esquema PyArrow para gold.fct_ventas_diarias."""
    return pa.schema([
        pa.field("fecha", pa.string(), nullable=False),
        pa.field("anio", pa.int32(), nullable=False),
        pa.field("mes", pa.int32(), nullable=False),
        pa.field("dia", pa.int32(), nullable=False),
        pa.field("region_id", pa.string(), nullable=False),
        pa.field("tienda_id", pa.string(), nullable=False),
        pa.field("cliente_id", pa.string(), nullable=False),
        pa.field("canal_venta", pa.string(), nullable=False),
        pa.field("venta_bruta", pa.float64(), nullable=False),
        pa.field("total_descuento", pa.float64(), nullable=False),
        pa.field("total_devoluciones", pa.float64(), nullable=False),
        pa.field("venta_neta", pa.float64(), nullable=False),
        pa.field("pedidos_validos", pa.int64(), nullable=False),
        pa.field("ticket_promedio", pa.float64(), nullable=False),
        pa.field("pedidos_devueltos", pa.int64(), nullable=True),
        pa.field("tasa_devolucion", pa.float64(), nullable=True),
    ])


def get_dim_tiendas_arrow_schema() -> pa.Schema:
    """Retorna el esquema PyArrow para gold.dim_tiendas_regiones."""
    return pa.schema([
        pa.field("tienda_id", pa.string(), nullable=False),
        pa.field("nombre_tienda", pa.string(), nullable=False),
        pa.field("region_id", pa.string(), nullable=False),
        pa.field("region_geografica", pa.string(), nullable=False),
        pa.field("ciudad", pa.string(), nullable=False),
        pa.field("canal_predominante", pa.string(), nullable=False),
        pa.field("gerente_regional", pa.string(), nullable=False),
        pa.field("activa", pa.bool_(), nullable=True),
    ])


# ==============================================================================
# Generador de Firmas de Metadatos para OpenMetadata
# ==============================================================================

def generate_openmetadata_table_spec(
    table_name: str,
    columns: List[Dict[str, Any]],
    description: str,
    upstream_lineage: List[str],
    tags: List[str],
    database: str = "midas_lakehouse",
    schema_name: str = "gold",
    partition_keys: Optional[List[str]] = None,
    sort_keys: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """
    Genera la firma declarativa en formato OpenMetadata Table Entity (v1.x).
    Permite catalogación y extracción de linaje automatizado.
    """
    fqn = f"{database}.{schema_name}.{table_name}"
    return {
        "name": table_name,
        "displayName": f"Gold Mart: {table_name}",
        "fullyQualifiedName": fqn,
        "description": description,
        "database": database,
        "databaseSchema": schema_name,
        "tableType": "Regular",
        "columns": columns,
        "tableConstraints": [],
        "tags": [{"tagFQN": tag, "source": "Classification"} for tag in tags],
        "lineage": {
            "upstreamEdges": [
                {"fromEntity": upstream, "toEntity": fqn}
                for upstream in upstream_lineage
            ]
        },
        "partitionConfig": {
            "partitionColumns": partition_keys or []
        },
        "optimization": {
            "zOrderingKeys": sort_keys or []
        },
        "customProperties": {
            "certifiedBy": "Midas Data Engineering",
            "tier": "Tier1",
            "formatVersion": "Iceberg v2",
        }
    }


def get_fct_ventas_openmetadata_spec() -> Dict[str, Any]:
    """Retorna la firma OpenMetadata completa para gold.fct_ventas_diarias."""
    columns = [
        {"name": "fecha", "dataType": "DATE", "description": "Fecha contable de la transacción"},
        {"name": "anio", "dataType": "INT", "description": "Año de particionado"},
        {"name": "mes", "dataType": "INT", "description": "Mes de particionado (1-12)"},
        {"name": "dia", "dataType": "INT", "description": "Día del mes (1-31)"},
        {"name": "region_id", "dataType": "VARCHAR", "description": "ID de región comercial (Z-Order Key)"},
        {"name": "tienda_id", "dataType": "VARCHAR", "description": "ID de tienda asociada"},
        {"name": "cliente_id", "dataType": "VARCHAR", "description": "ID del cliente (Z-Order Key)"},
        {"name": "canal_venta", "dataType": "VARCHAR", "description": "Canal comercial: ONLINE, TIENDA, PARTNER"},
        {"name": "venta_bruta", "dataType": "DECIMAL", "description": "Monto bruto sin descuentos ni deducciones"},
        {"name": "total_descuento", "dataType": "DECIMAL", "description": "Total de deducciones por descuento aplicadas"},
        {"name": "total_devoluciones", "dataType": "DECIMAL", "description": "Total de devoluciones monetarias"},
        {"name": "venta_neta", "dataType": "DECIMAL", "description": "Métrica oficial canónica: venta_bruta - descuento - devoluciones"},
        {"name": "pedidos_validos", "dataType": "BIGINT", "description": "Conteo de pedidos únicos excluyendo cancelaciones"},
        {"name": "ticket_promedio", "dataType": "DECIMAL", "description": "Métrica oficial: venta_neta / pedidos_validos"},
        {"name": "pedidos_devueltos", "dataType": "BIGINT", "description": "Conteo de pedidos en estado DEVUELTO"},
        {"name": "tasa_devolucion", "dataType": "DECIMAL", "description": "Porcentaje de devolución sobre pedidos entregados"},
    ]
    return generate_openmetadata_table_spec(
        table_name="fct_ventas_diarias",
        columns=columns,
        description="Tabla de hechos diaria con KPIs financieros y comerciales canónicos de Midas.",
        upstream_lineage=["midas_lakehouse.silver.crm_transacciones", "midas_lakehouse.silver.pedidos"],
        tags=["GOLD_CERTIFIED", "FINANCIAL_KPI", "EXECUTIVE_CONSUMPTION"],
        partition_keys=["anio", "mes"],
        sort_keys=["region_id", "cliente_id"],
    )


def get_dim_tiendas_openmetadata_spec() -> Dict[str, Any]:
    """Retorna la firma OpenMetadata completa para gold.dim_tiendas_regiones."""
    columns = [
        {"name": "tienda_id", "dataType": "VARCHAR", "description": "Identificador único de la tienda"},
        {"name": "nombre_tienda", "dataType": "VARCHAR", "description": "Nombre comercial de la sucursal"},
        {"name": "region_id", "dataType": "VARCHAR", "description": "Identificador de la región asociada"},
        {"name": "region_geografica", "dataType": "VARCHAR", "description": "Región geográfica: NORTE, SUR, CENTRO, etc."},
        {"name": "ciudad", "dataType": "VARCHAR", "description": "Ciudad de localización física"},
        {"name": "canal_predominante", "dataType": "VARCHAR", "description": "Canal comercial principal"},
        {"name": "gerente_regional", "dataType": "VARCHAR", "description": "Nombre del responsable de zona"},
        {"name": "activa", "dataType": "BOOLEAN", "description": "Estado operacional de la sucursal"},
    ]
    return generate_openmetadata_table_spec(
        table_name="dim_tiendas_regiones",
        columns=columns,
        description="Dimensión enriquecida de tiendas y regiones comerciales de Midas.",
        upstream_lineage=["midas_lakehouse.silver.crm_tiendas"],
        tags=["GOLD_CERTIFIED", "DIMENSION", "GEOGRAPHIC_MODEL"],
        partition_keys=[],
        sort_keys=["region_id"],
    )
