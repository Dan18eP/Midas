"""
Midas Lakehouse Quality Rules & Quality Gate Engine
Historia de Usuario: HU-LAKE-03 (Bronze -> Silver Cleansing & Quality Gate)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
Documentos Canónicos:
  - documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md
  - documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md
"""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
import json
import re
from typing import Any, Dict, List, Optional, Tuple, Union
import uuid


@dataclass
class QuarantineRecord:
    """
    Registro canónico de cuarentena conforme a la Especificación 03 (silver.quarantine_records).
    """
    quarantine_id: str
    _raw_id: str
    source_name: str
    failure_reason: str
    raw_data: str
    quarantined_at: str

    def to_dict(self) -> Dict[str, Any]:
        return {
            "quarantine_id": self.quarantine_id,
            "_raw_id": self._raw_id,
            "source_name": self.source_name,
            "failure_reason": self.failure_reason,
            "raw_data": self.raw_data,
            "quarantined_at": self.quarantined_at,
        }


@dataclass
class QualityGateResult:
    """Resultado estructurado de la evaluación del Quality Gate sobre un registro."""
    is_valid: bool
    cleaned_record: Optional[Dict[str, Any]] = None
    quarantine_record: Optional[QuarantineRecord] = None
    failure_reason: Optional[str] = None


# Expresiones regulares para limpieza y tipado
CURRENCY_CLEANUP_REGEX = re.compile(r"[^\d.-]")
YEAR_REGEX = re.compile(r"^\d{4}")


def normalize_currency(val: Any) -> Decimal:
    """
    Normaliza montos monetarios eliminando símbolos de divisa ($), comas y espacios,
    convirtiéndolo a DECIMAL(18, 2) con redondeo HALF_UP.
    
    :param val: Valor numérico o string (ej. "$1,250.50", "-50.00", 1250.5, Decimal("10.00"))
    :return: Decimal quantizado a 2 decimales.
    :raises ValueError: Si el valor no puede convertirse a un número decimal válido.
    """
    if val is None:
        raise ValueError("El monto monetario no puede ser None")

    if isinstance(val, (int, float, Decimal)):
        try:
            d = Decimal(str(val))
            return d.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        except InvalidOperation as exc:
            raise ValueError(f"Valor numérico no convertible a Decimal: {val}") from exc

    raw_str = str(val).strip()
    if not raw_str:
        raise ValueError("Cadena monetaria vacía")

    # Detectar si es negativo antes de limpiar otros caracteres
    is_negative = False
    if "-" in raw_str or "(" in raw_str:
        # Casos como -$50, ($50), - 50.00
        is_negative = True

    # Quitar cualquier carácter que no sea dígito o punto
    cleaned = CURRENCY_CLEANUP_REGEX.sub("", raw_str)
    if not cleaned or cleaned == "-" or cleaned == ".":
        raise ValueError(f"Formato monetario inválido o no convertible: {val}")

    try:
        dec = Decimal(cleaned)
        if is_negative:
            dec = -abs(dec)
        return dec.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
    except InvalidOperation as exc:
        raise ValueError(f"No se pudo convertir a Decimal(18,2): {val}") from exc


def normalize_timestamp_utc(val: Any) -> str:
    """
    Normaliza fechas y marcas de tiempo a formato estricto ISO 8601 UTC (YYYY-MM-DDTHH:MM:SSZ).
    
    :param val: datetime, int/float (epoch s o ms), o string en formatos comunes ISO/SQL.
    :return: Cadena ISO 8601 en UTC con sufijo 'Z'.
    :raises ValueError: Si la fecha es inválida, malformada o tiene un año absurdo (<1900 o >2100).
    """
    if val is None:
        raise ValueError("La fecha no puede ser None")

    dt: Optional[datetime] = None

    if isinstance(val, datetime):
        if val.tzinfo is None:
            dt = val.replace(tzinfo=timezone.utc)
        else:
            dt = val.astimezone(timezone.utc)
    elif isinstance(val, (int, float)):
        # Si es un año simple (1900-2100)
        val_int = int(val)
        if 1900 <= val_int <= 2100:
            dt = datetime(val_int, 1, 1, tzinfo=timezone.utc)
        else:
            # Distinguir segundos de milisegundos (epochs modernos > 1e11 son en ms)
            epoch_val = float(val)
            if epoch_val > 1e11:
                epoch_val = epoch_val / 1000.0
            try:
                dt = datetime.fromtimestamp(epoch_val, tz=timezone.utc)
            except (ValueError, OverflowError, OSError) as exc:
                raise ValueError(f"Timestamp epoch inválido: {val}") from exc
    elif isinstance(val, str):
        val_clean = val.strip()
        if not val_clean:
            raise ValueError("Cadena de fecha vacía")

        # Comprobar si es un año de 4 dígitos (ej: "2026")
        if val_clean.isdigit() and len(val_clean) == 4:
            year_int = int(val_clean)
            if 1900 <= year_int <= 2100:
                dt = datetime(year_int, 1, 1, tzinfo=timezone.utc)

        if dt is None:
            # Intentar parseo directo ISO 8601
            iso_candidate = val_clean.replace("Z", "+00:00")
            try:
                parsed = datetime.fromisoformat(iso_candidate)
                if parsed.tzinfo is None:
                    dt = parsed.replace(tzinfo=timezone.utc)
                else:
                    dt = parsed.astimezone(timezone.utc)
            except ValueError:
                # Probar formatos comunes alternativos
                common_formats = [
                    "%Y-%m-%d %H:%M:%S",
                    "%Y/%m/%d %H:%M:%S",
                    "%Y-%m-%d",
                    "%d/%m/%Y %H:%M:%S",
                    "%d-%m-%Y %H:%M:%S",
                    "%d/%m/%Y",
                    "%d-%m-%Y",
                    "%m/%d/%Y",
                    "%Y-%m",
                    "%Y/%m",
                    "%Y",
                ]
                for fmt in common_formats:
                    try:
                        parsed = datetime.strptime(val_clean, fmt)
                        dt = parsed.replace(tzinfo=timezone.utc)
                        break
                    except ValueError:
                        continue

    if dt is None:
        raise ValueError(f"Formato de fecha no reconocido o no parseable: {val}")

    # Validar coherencia temporal razonable (1900 <= año <= 2100)
    if dt.year < 1900 or dt.year > 2100:
        raise ValueError(f"Año fuera de rango razonable (1900-2100): {dt.year}")

    # Retornar formato estricto ISO 8601 UTC con 'Z'
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def is_valid_primary_key(val: Any) -> bool:
    """
    Verifica que la clave de negocio primaria no sea nula, vacía o un placeholder inválido.
    """
    if val is None:
        return False
    s = str(val).strip()
    if not s:
        return False
    if s.lower() in ("null", "none", "nan", "nil", "undefined", "00000000-0000-0000-0000-000000000000"):
        return False
    return True


def evaluate_quality_gate(
    record: Dict[str, Any],
    source_name: str = "default_source",
    primary_key_fields: Optional[List[str]] = None,
    amount_fields: Optional[List[str]] = None,
    date_fields: Optional[List[str]] = None,
) -> QualityGateResult:
    """
    Evalúa un registro individual contra el Quality Gate Canónico de Bronze -> Silver.
    
    Reglas:
    1. Primary Key no nula/vacía. Si falla -> 'NULL_PRIMARY_KEY'.
    2. Monto no negativo. Si falla -> 'NEGATIVE_AMOUNT' (Anomalía Guardian F3).
    3. Fechas parseables a UTC ISO 8601. Si falla -> 'INVALID_DATE'.
    
    :return: QualityGateResult con cleaned_record si es válido, o quarantine_record si es inválido.
    """
    pk_cols = primary_key_fields or ["transaccion_id", "id_orden", "id_registro", "pedido_id", "cliente_id", "_raw_id"]
    amt_cols = amount_fields or ["monto", "precio_unitario", "total_neto", "total_amount", "monto_bruto", "valor"]
    dt_cols = date_fields or ["fecha_transaccion", "fecha_pedido", "fecha_creacion", "fecha_actualizacion", "_ingested_at"]

    raw_id = str(record.get("_raw_id") or uuid.uuid4())
    cleaned = dict(record)

    # 1. Validar Primary Key de negocio
    found_pk_col = None
    for pk_col in pk_cols:
        if pk_col in record:
            found_pk_col = pk_col
            break
        c_norm = pk_col.strip().lower().replace(" ", "_").replace("-", "_")
        for rk in record:
            if rk.strip().lower().replace(" ", "_").replace("-", "_") == c_norm:
                found_pk_col = rk
                break
        if found_pk_col:
            break

    if not found_pk_col:
        for rk in record:
            rk_norm = rk.strip().lower().replace(" ", "_").replace("-", "_")
            if rk_norm in ("id", "index", "customer_id", "cliente_id", "order_id", "id_orden", "transaccion_id", "transaction_id", "code", "codigo", "key", "id_registro", "_raw_id") or rk_norm.endswith("_id") or rk_norm.startswith("id_"):
                found_pk_col = rk
                break

    if not found_pk_col:
        if "_raw_id" in record:
            found_pk_col = "_raw_id"
        else:
            bus_cols = [k for k in record if not k.startswith("_")]
            if bus_cols:
                found_pk_col = bus_cols[0]

    if found_pk_col and found_pk_col in record:
        if not is_valid_primary_key(record[found_pk_col]):
            return _build_quarantine_result(raw_id, source_name, "NULL_PRIMARY_KEY", record)
        cleaned[found_pk_col] = str(record[found_pk_col]).strip()
    else:
        return _build_quarantine_result(raw_id, source_name, "NULL_PRIMARY_KEY", record)

    # 2. Validar y normalizar montos monetarios
    for amt_col in amt_cols:
        if amt_col in record and record[amt_col] is not None:
            try:
                norm_amt = normalize_currency(record[amt_col])
                if norm_amt < Decimal("0.00"):
                    return _build_quarantine_result(raw_id, source_name, "NEGATIVE_AMOUNT", record)
                cleaned[amt_col] = float(norm_amt)  # O Decimal en PySpark/PyArrow
                cleaned[f"{amt_col}_decimal"] = str(norm_amt)
            except ValueError:
                return _build_quarantine_result(raw_id, source_name, "INVALID_AMOUNT_FORMAT", record)

    # 3. Validar y normalizar fechas
    for dt_col in dt_cols:
        if dt_col in record and record[dt_col] is not None:
            try:
                norm_dt = normalize_timestamp_utc(record[dt_col])
                cleaned[dt_col] = norm_dt
            except ValueError:
                return _build_quarantine_result(raw_id, source_name, "INVALID_DATE", record)

    return QualityGateResult(
        is_valid=True,
        cleaned_record=cleaned,
        quarantine_record=None,
        failure_reason=None,
    )


def _build_quarantine_result(
    raw_id: str,
    source_name: str,
    failure_reason: str,
    raw_record: Dict[str, Any],
) -> QualityGateResult:
    """Helper para construir un registro de cuarentena canónico."""
    quarantine_entry = QuarantineRecord(
        quarantine_id=str(uuid.uuid4()),
        _raw_id=raw_id,
        source_name=source_name,
        failure_reason=failure_reason,
        raw_data=json.dumps(raw_record, default=str),
        quarantined_at=datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    )
    return QualityGateResult(
        is_valid=False,
        cleaned_record=None,
        quarantine_record=quarantine_entry,
        failure_reason=failure_reason,
    )


def deduplicate_records_deterministic(
    records: List[Dict[str, Any]],
    key_fields: List[str],
    timestamp_field: str = "_ingested_at",
) -> Tuple[List[Dict[str, Any]], int]:
    """
    Deduplicación determinística basada en una o más claves de negocio y marca de tiempo más reciente.
    
    Criterio de desempate:
    Si dos registros poseen la misma clave y el mismo timestamp exacto, se ordenan determinísticamente
    por su representación canónica en JSON para asegurar reproducibilidad 100% matemática.
    
    :param records: Lista de registros limpios.
    :param key_fields: Lista de columnas clave (ej. ['id_orden'] o ['transaccion_id']).
    :param timestamp_field: Campo de timestamp para seleccionar la versión más reciente.
    :return: Tupla con (registros_deduplicados, total_duplicados_eliminados).
    """
    if not records:
        return [], 0

    groups: Dict[Tuple[Any, ...], List[Dict[str, Any]]] = {}

    for rec in records:
        group_key = tuple(str(rec.get(k, "")).strip() for k in key_fields)
        if group_key not in groups:
            groups[group_key] = []
        groups[group_key].append(rec)

    deduplicated: List[Dict[str, Any]] = []
    dropped_count = 0

    for group_key, items in groups.items():
        if len(items) == 1:
            deduplicated.append(items[0])
            continue

        # Ordenar: primero por timestamp (más reciente primero), luego por json determinístico
        def sort_key(item: Dict[str, Any]):
            ts_val = str(item.get(timestamp_field, ""))
            json_repr = json.dumps(item, sort_keys=True, default=str)
            return (ts_val, json_repr)

        sorted_items = sorted(items, key=sort_key, reverse=True)
        deduplicated.append(sorted_items[0])
        dropped_count += (len(items) - 1)

    return deduplicated, dropped_count
