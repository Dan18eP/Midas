"""
Midas Lakehouse Transforms - Silver to Gold Business Marts & KPI Aggregations
Historia de Usuario: HU-LAKE-04 (PySpark Silver -> Gold Business Marts & KPI Aggregations)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
Documentos Canónicos:
  - documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md
  - documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md
"""

from collections import defaultdict
from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal, ROUND_HALF_UP
import json
import logging
import time
from typing import Any, Callable, Dict, List, Optional, Set, Tuple, Union
import uuid

import pyarrow as pa

from src.core.telemetry.events import (
    NodeStatus,
    TelemetryEvent,
)
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

logger = logging.getLogger("midas.lakehouse.transforms.silver_to_gold")


# Regiones y tiendas canónicas de referencia
DEFAULT_TIENDAS_CATALOG: List[Dict[str, Any]] = [
    {
        "tienda_id": "TND-001",
        "nombre_tienda": "Sucursal Bogotá Centro",
        "region_id": "REG-CENTRO",
        "region_geografica": "CENTRO",
        "ciudad": "Bogotá",
        "canal_predominante": "TIENDA",
        "gerente_regional": "Carolina Gómez",
        "activa": True,
    },
    {
        "tienda_id": "TND-002",
        "nombre_tienda": "Sucursal Medellín Norte",
        "region_id": "REG-NORTE",
        "region_geografica": "NORTE",
        "ciudad": "Medellín",
        "canal_predominante": "TIENDA",
        "gerente_regional": "Andrés Morales",
        "activa": True,
    },
    {
        "tienda_id": "TND-003",
        "nombre_tienda": "Sucursal Cali Sur",
        "region_id": "REG-SUR",
        "region_geografica": "SUR",
        "ciudad": "Cali",
        "canal_predominante": "TIENDA",
        "gerente_regional": "Laura Restrepo",
        "activa": True,
    },
    {
        "tienda_id": "TND-DIGITAL",
        "nombre_tienda": "Midas Flagship Digital E-Commerce",
        "region_id": "REG-CENTRO",
        "region_geografica": "CENTRO",
        "ciudad": "Virtual",
        "canal_predominante": "ONLINE",
        "gerente_regional": "Felipe Rojas",
        "activa": True,
    },
]


def round_decimal(val: Union[Decimal, float, int], places: int = 2) -> Decimal:
    """Aplica redondeo contable estricto ROUND_HALF_UP."""
    if not isinstance(val, Decimal):
        val = Decimal(str(val))
    quantizer = Decimal("1." + "0" * places) if places > 0 else Decimal("1")
    return val.quantize(quantizer, rounding=ROUND_HALF_UP)


class SilverToGoldTransformer:
    """
    Transformador dimensional y motor de cálculo de KPIs para la capa Gold de Midas.

    Responsabilidades:
    1. Agregación analítica de hechos en grano diario (gold.fct_ventas_diarias).
    2. Construcción y enriquecimiento de dimensiones (gold.dim_tiendas_regiones).
    3. Aplicación estricta de las fórmulas canónicas de negocio:
       - Venta Bruta: sum(cantidad * precio_unitario)
       - Venta Neta: sum(monto_bruto - descuento - devoluciones)
       - Pedidos Válidos: count(distinct pedido_id) [excluye cancelados]
       - Ticket Promedio: Venta Neta / Pedidos Válidos (0.00 si pedidos == 0)
       - Tasa de Devolución: (Pedidos Devueltos / Total Pedidos Entregados) * 100
    4. Particionado por (anio, mes) y Z-Ordering / ordenamiento por (region_id, cliente_id).
    5. Generación de especificaciones de metadatos para OpenMetadata.
    6. Emisión de telemetría en tiempo real hacia el Canvas (node_id='gold_marts').
    """

    def __init__(
        self,
        acid_manager: Optional[Any] = None,
        minio_client: Optional[Any] = None,
        telemetry_publisher: Optional[Callable[[Dict[str, Any]], None]] = None,
        pipeline_id: str = "pipeline_silver_to_gold",
        node_id: str = "gold_marts",
    ):
        self.acid_manager = acid_manager
        self.minio_client = minio_client
        self.telemetry_publisher = telemetry_publisher
        self.pipeline_id = pipeline_id
        self.node_id = node_id

    def generate_batch_id(self, prefix: str = "gold_batch") -> str:
        """Genera un identificador único para el lote Gold."""
        ts = int(time.time())
        token = uuid.uuid4().hex[:6]
        return f"{prefix}_{ts}_{token}"

    def parse_date_components(self, date_val: Any) -> Tuple[str, int, int, int]:
        """
        Extrae fecha canónica (YYYY-MM-DD), anio, mes, dia de diversos formatos temporales.
        """
        if isinstance(date_val, datetime):
            dt = date_val
        elif isinstance(date_val, str):
            clean_str = date_val.strip().replace("Z", "+00:00")
            if "T" in clean_str:
                dt = datetime.fromisoformat(clean_str)
            else:
                # Asumir YYYY-MM-DD
                dt = datetime.strptime(clean_str[:10], "%Y-%m-%d")
        else:
            # Fallback a fecha actual
            dt = datetime.utcnow()

        fecha_str = dt.strftime("%Y-%m-%d")
        return fecha_str, dt.year, dt.month, dt.day

    def calculate_canonical_kpis(
        self,
        records: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Calcula las fórmulas oficiales canónicas sobre un grupo de transacciones.
        """
        venta_bruta = Decimal("0.00")
        total_descuento = Decimal("0.00")
        total_devoluciones = Decimal("0.00")
        venta_neta = Decimal("0.00")

        pedidos_validos_set: Set[str] = set()
        pedidos_devueltos_set: Set[str] = set()
        pedidos_entregados_set: Set[str] = set()

        for r in records:
            estado = str(r.get("estado", "ENTREGADO")).upper().strip()

            # Excluir cancelaciones previas al despacho de los pedidos válidos
            if estado == "CANCELADO":
                continue

            pedido_id = str(r.get("pedido_id") or r.get("transaccion_id") or r.get("_raw_id") or uuid.uuid4())

            # Calcular Monto Bruto
            if "cantidad" in r and "precio_unitario" in r:
                cant = Decimal(str(r["cantidad"]))
                precio = Decimal(str(r["precio_unitario"]))
                bruto_item = cant * precio
            else:
                bruto_item = Decimal(str(r.get("monto", 0.0)))

            # Calcular Descuento
            desc_val = r.get("descuento", 0.0)
            if isinstance(desc_val, (float, int, str, Decimal)):
                desc_num = Decimal(str(desc_val))
                # Si el descuento es porcentaje (ej. 0.10)
                if Decimal("0.0") < desc_num <= Decimal("1.0"):
                    descuento_item = bruto_item * desc_num
                else:
                    descuento_item = desc_num
            else:
                descuento_item = Decimal("0.00")

            # Calcular Devoluciones
            devolucion_val = r.get("devolucion") or r.get("monto_devolucion") or 0.0
            devolucion_item = Decimal(str(devolucion_val))
            if estado == "DEVUELTO" and devolucion_item == Decimal("0.0"):
                # Si está marcado como devuelto sin monto explícito, se asume el total neto
                devolucion_item = bruto_item - descuento_item

            # Acumuladores
            venta_bruta += bruto_item
            total_descuento += descuento_item
            total_devoluciones += devolucion_item

            # Fórmula oficial: Venta Neta = sum(monto_bruto - descuento - devoluciones)
            neto_item = bruto_item - descuento_item - devolucion_item
            venta_neta += neto_item

            # Conteo de pedidos válidos
            pedidos_validos_set.add(pedido_id)

            if estado in ("ENTREGADO", "DEVUELTO"):
                pedidos_entregados_set.add(pedido_id)
            if estado == "DEVUELTO":
                pedidos_devueltos_set.add(pedido_id)

        # Ticket Promedio = Venta Neta / Pedidos Válidos (0.00 si denominador es 0)
        num_pedidos_validos = len(pedidos_validos_set)
        if num_pedidos_validos > 0:
            ticket_promedio = round_decimal(venta_neta / Decimal(num_pedidos_validos), 2)
        else:
            ticket_promedio = Decimal("0.00")

        # Tasa de Devolución = (Pedidos Devueltos / Total Pedidos Entregados) * 100
        num_entregados = len(pedidos_entregados_set)
        num_devueltos = len(pedidos_devueltos_set)
        if num_entregados > 0:
            tasa_devolucion = round_decimal((Decimal(num_devueltos) / Decimal(num_entregados)) * Decimal("100.0"), 2)
        else:
            tasa_devolucion = Decimal("0.00")

        return {
            "venta_bruta": float(round_decimal(venta_bruta, 2)),
            "total_descuento": float(round_decimal(total_descuento, 2)),
            "total_devoluciones": float(round_decimal(total_devoluciones, 2)),
            "venta_neta": float(round_decimal(venta_neta, 2)),
            "pedidos_validos": num_pedidos_validos,
            "ticket_promedio": float(ticket_promedio),
            "pedidos_devueltos": num_devueltos,
            "tasa_devolucion": float(tasa_devolucion),
        }

    def build_dim_tiendas(
        self,
        custom_stores: Optional[List[Dict[str, Any]]] = None,
    ) -> List[DimTiendasRegionesRecord]:
        """
        Construye la tabla dimensional gold.dim_tiendas_regiones enriquecida.
        """
        source_list = custom_stores or DEFAULT_TIENDAS_CATALOG
        dim_records = []
        for s in source_list:
            dim_records.append(
                DimTiendasRegionesRecord(
                    tienda_id=str(s.get("tienda_id", "TND-UNKNOWN")),
                    nombre_tienda=str(s.get("nombre_tienda", "Sucursal Desconocida")),
                    region_id=str(s.get("region_id", "REG-CENTRO")),
                    region_geografica=str(s.get("region_geografica", "CENTRO")).upper(),
                    ciudad=str(s.get("ciudad", "Bogotá")),
                    canal_predominante=str(s.get("canal_predominante", "TIENDA")).upper(),
                    gerente_regional=str(s.get("gerente_regional", "Sin Asignar")),
                    activa=bool(s.get("activa", True)),
                )
            )
        return dim_records

    def transform_and_aggregate_sales(
        self,
        silver_records: List[Dict[str, Any]],
        dim_stores: Optional[List[Dict[str, Any]]] = None,
        persist_iceberg: bool = False,
    ) -> GoldMartsResult:
        """
        Procesa el lote Silver agregando las métricas en grano diario (gold.fct_ventas_diarias)
        y materializando la dimensión (gold.dim_tiendas_regiones).
        """
        start_time = time.perf_counter()
        batch_id = self.generate_batch_id()

        # 1. Construir la dimensión de tiendas
        dim_records = self.build_dim_tiendas(dim_stores)
        dim_map = {d.tienda_id: d for d in dim_records}

        # 2. Agrupar transacciones en grano diario por claves dimensionales
        # Grano: (fecha, anio, mes, dia, region_id, tienda_id, cliente_id, canal_venta)
        grouped_transactions: Dict[Tuple[str, int, int, int, str, str, str, str], List[Dict[str, Any]]] = defaultdict(list)

        for rec in silver_records:
            date_field = rec.get("fecha_transaccion") or rec.get("fecha_pedido") or rec.get("fecha")
            fecha_str, anio, mes, dia = self.parse_date_components(date_field)

            tienda_id = str(rec.get("tienda_id", "TND-DIGITAL"))
            if tienda_id in dim_map:
                region_id = dim_map[tienda_id].region_id
            else:
                region_id = str(rec.get("region_id") or rec.get("region") or "REG-CENTRO")

            cliente_id = str(rec.get("cliente_id", "CLI-ANONYMOUS"))
            canal_venta = str(rec.get("canal_venta", "ONLINE")).upper()

            group_key = (fecha_str, anio, mes, dia, region_id, tienda_id, cliente_id, canal_venta)
            grouped_transactions[group_key].append(rec)

        # 3. Calcular métricas agregadas por cada grupo
        fct_records: List[FctVentasDiariasRecord] = []
        for group_key, txs in grouped_transactions.items():
            fecha_str, anio, mes, dia, region_id, tienda_id, cliente_id, canal_venta = group_key
            kpis = self.calculate_canonical_kpis(txs)

            fct_records.append(
                FctVentasDiariasRecord(
                    fecha=fecha_str,
                    anio=anio,
                    mes=mes,
                    dia=dia,
                    region_id=region_id,
                    tienda_id=tienda_id,
                    cliente_id=cliente_id,
                    canal_venta=canal_venta,
                    venta_bruta=kpis["venta_bruta"],
                    total_descuento=kpis["total_descuento"],
                    total_devoluciones=kpis["total_devoluciones"],
                    venta_neta=kpis["venta_neta"],
                    pedidos_validos=kpis["pedidos_validos"],
                    ticket_promedio=kpis["ticket_promedio"],
                    pedidos_devueltos=kpis["pedidos_devueltos"],
                    tasa_devolucion=kpis["tasa_devolucion"],
                )
            )

        # 4. Aplicar Z-Ordering / Ordenamiento Multidimensional por (region_id, cliente_id)
        # En memoria esto asegura intercalado óptimo antes de escribir microparticiones
        fct_records.sort(key=lambda r: (r.anio, r.mes, r.region_id, r.cliente_id, r.dia))

        # 5. Cálculos globales de resumen del lote
        global_kpis = self.calculate_canonical_kpis(silver_records)
        elapsed_ms = round((time.perf_counter() - start_time) * 1000.0, 2)

        # 6. Generación de firmas OpenMetadata
        openmetadata_specs = {
            "gold.fct_ventas_diarias": get_fct_ventas_openmetadata_spec(),
            "gold.dim_tiendas_regiones": get_dim_tiendas_openmetadata_spec(),
        }

        # 7. Persistencia opcional en Apache Iceberg v2
        fct_path = None
        dim_path = None
        if persist_iceberg and self.acid_manager is not None:
            try:
                # Materializar Dimensión
                dim_dicts = [d.to_dict() for d in dim_records]
                dim_arrow = pa.Table.from_pylist(dim_dicts, schema=get_dim_tiendas_arrow_schema())
                self.acid_manager.append_data("gold.dim_tiendas_regiones", dim_arrow)
                dim_path = "s3://midas-gold/gold.db/dim_tiendas_regiones"

                # Materializar Hechos
                fct_dicts = [f.to_dict() for f in fct_records]
                fct_arrow = pa.Table.from_pylist(fct_dicts, schema=get_fct_ventas_arrow_schema())
                self.acid_manager.append_data("gold.fct_ventas_diarias", fct_arrow)
                fct_path = "s3://midas-gold/gold.db/fct_ventas_diarias"
            except Exception as e:
                logger.error(f"Error persistiendo en Iceberg v2: {e}")

        # 8. Emisión de Telemetría hacia Canvas (node_id='gold_marts')
        telemetry_event = self._emit_telemetry(
            batch_id=batch_id,
            records_in=len(silver_records),
            records_out=len(fct_records),
            latency_ms=elapsed_ms,
            global_kpis=global_kpis,
        )

        return GoldMartsResult(
            batch_id=batch_id,
            total_silver_in=len(silver_records),
            fct_ventas_count=len(fct_records),
            dim_tiendas_count=len(dim_records),
            processing_ms=elapsed_ms,
            total_venta_bruta=global_kpis["venta_bruta"],
            total_venta_neta=global_kpis["venta_neta"],
            total_pedidos_validos=global_kpis["pedidos_validos"],
            ticket_promedio_global=global_kpis["ticket_promedio"],
            fct_ventas_records=[f.to_dict() for f in fct_records],
            dim_tiendas_records=[d.to_dict() for d in dim_records],
            fct_ventas_path=fct_path,
            dim_tiendas_path=dim_path,
            openmetadata_specs=openmetadata_specs,
            telemetry_event=telemetry_event,
        )

    def _emit_telemetry(
        self,
        batch_id: str,
        records_in: int,
        records_out: int,
        latency_ms: float,
        global_kpis: Dict[str, Any],
    ) -> Optional[Dict[str, Any]]:
        """Construye y emite el evento canónico de telemetría hacia el TelemetryHub."""
        event_payload = {
            "pipeline_id": self.pipeline_id,
            "node_id": self.node_id,
            "status": NodeStatus.HEALTHY,
            "records_in": records_in,
            "records_out": records_out,
            "latency_ms": latency_ms,
            "details": {
                "batch_id": batch_id,
                "stage": "GOLD_PUBLISH",
                "venta_bruta": global_kpis["venta_bruta"],
                "venta_neta": global_kpis["venta_neta"],
                "pedidos_validos": global_kpis["pedidos_validos"],
                "ticket_promedio": global_kpis["ticket_promedio"],
                "target_tables": ["gold.fct_ventas_diarias", "gold.dim_tiendas_regiones"],
                "partition_spec": ["anio", "mes"],
                "z_ordering": ["region_id", "cliente_id"],
            },
        }

        if self.telemetry_publisher:
            try:
                self.telemetry_publisher(event_payload)
            except Exception as e:
                logger.warning(f"Error publicando telemetría de Gold Marts: {e}")

        return event_payload
