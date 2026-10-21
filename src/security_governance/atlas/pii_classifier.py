"""Midas - Clasificador de Datos Sensibles (PII) por Taxonomía Empresarial.

Historia de Usuario: HU-GOV-02 (`ST-GOV-02.1`)
Responsable: Sebastian Castiblanco (Governance Lead)
Documentos Canónicos:
  - documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md (4.1)
  - documentation/adr/ADR-006-gobernanza-activa-escudo-pii-y-lente-zero-trust.md

Detecta columnas sensibles combinando dos señales independientes:

1. **Nombre de la columna** contra la taxonomía empresarial declarada.
2. **Valores de muestra** contra expresiones regulares, con validaciones
   adicionales donde el patrón por sí solo produce falsos positivos
   (algoritmo de Luhn en tarjetas de crédito).

El clasificador es puro y determinista: no hace red ni E/S. Eso permite
ejecutarlo dentro de un job PySpark sin penalizar el lote.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
import re
from typing import Any, Dict, Iterable, List, Optional, Pattern, Sequence

# Etiqueta vinculante que se registra en Apache Atlas sobre la columna detectada.
PII_CLASSIFICATION = "PII_CONFIDENCIAL"

# Número de valores inspeccionados por columna. Acotado para que el escaneo sea
# proporcional al número de columnas y no al tamaño del lote.
DEFAULT_SAMPLE_SIZE = 50

# Proporción mínima de valores no vacíos que deben coincidir con el patrón para
# clasificar por contenido. Evita que un único valor anómalo etiquete la columna.
DEFAULT_VALUE_MATCH_RATIO = 0.6


class PIICategory(str, Enum):
    """Taxonomía empresarial de datos sensibles."""

    EMAIL = "EMAIL"
    IDENTIFICACION = "IDENTIFICACION"
    TARJETA_CREDITO = "TARJETA_CREDITO"
    SALARIO = "SALARIO"
    TELEFONO = "TELEFONO"


class DetectionSignal(str, Enum):
    """Señal que disparó la clasificación."""

    COLUMN_NAME = "column_name"
    VALUE_PATTERN = "value_pattern"
    BOTH = "both"


@dataclass(frozen=True)
class CategoryRule:
    """Regla declarativa de una categoría de la taxonomía."""

    category: PIICategory
    column_keywords: Sequence[str]
    value_pattern: Optional[Pattern[str]]
    masking_hint: str
    requires_luhn: bool = False


@dataclass(frozen=True)
class ColumnClassification:
    """Resultado de clasificar una columna."""

    column: str
    category: PIICategory
    signal: DetectionSignal
    confidence: float
    masking_hint: str
    sample_matches: int = 0
    sampled_values: int = 0

    @property
    def classification(self) -> str:
        return PII_CLASSIFICATION

    def to_dict(self) -> Dict[str, Any]:
        return {
            "column": self.column,
            "category": self.category.value,
            "classification": self.classification,
            "signal": self.signal.value,
            "confidence": round(self.confidence, 4),
            "masking_hint": self.masking_hint,
            "sample_matches": self.sample_matches,
            "sampled_values": self.sampled_values,
        }


@dataclass
class BatchClassificationResult:
    """Resultado del escaneo de un lote completo."""

    source_name: str
    batch_id: str
    columns_scanned: int
    classifications: List[ColumnClassification] = field(default_factory=list)

    @property
    def sensitive_columns(self) -> List[str]:
        return [item.column for item in self.classifications]

    @property
    def has_pii(self) -> bool:
        return bool(self.classifications)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "source_name": self.source_name,
            "batch_id": self.batch_id,
            "columns_scanned": self.columns_scanned,
            "sensitive_columns": self.sensitive_columns,
            "classifications": [item.to_dict() for item in self.classifications],
        }


# ---------------------------------------------------------------------------
# Taxonomía empresarial declarada
# ---------------------------------------------------------------------------
# El orden importa: la primera categoría que coincide es la que clasifica la
# columna, de modo que los patrones más específicos van primero.
TAXONOMY: Sequence[CategoryRule] = (
    CategoryRule(
        category=PIICategory.TARJETA_CREDITO,
        column_keywords=("tarjeta", "card", "credit_card", "pan", "numero_tarjeta"),
        value_pattern=re.compile(r"^(?:\d[ -]?){13,19}$"),
        masking_hint="**** **** **** 4210",
        requires_luhn=True,
    ),
    CategoryRule(
        category=PIICategory.EMAIL,
        column_keywords=("email", "correo", "mail", "e_mail"),
        value_pattern=re.compile(r"^[^@\s]+@[^@\s]+\.[A-Za-z]{2,}$"),
        masking_hint="c****@empresa.com",
    ),
    CategoryRule(
        category=PIICategory.IDENTIFICACION,
        column_keywords=(
            "cedula", "documento", "identificacion", "nit", "dni",
            "num_doc", "numero_documento", "ssn", "passport", "pasaporte",
        ),
        # Documentos de 6 a 12 dígitos, con separadores de miles opcionales.
        value_pattern=re.compile(r"^\d{1,3}(?:[.\- ]?\d{3}){1,3}(?:-?\d)?$"),
        masking_hint="****2104",
    ),
    CategoryRule(
        category=PIICategory.TELEFONO,
        column_keywords=("telefono", "phone", "celular", "movil", "contacto_tel"),
        value_pattern=re.compile(r"^\+?\d[\d\s\-()]{6,18}\d$"),
        masking_hint="+57 *** *** 4210",
    ),
    CategoryRule(
        category=PIICategory.SALARIO,
        column_keywords=(
            "salario", "sueldo", "remuneracion", "ingreso_mensual",
            "compensacion", "bonificacion", "nomina",
        ),
        # Los montos no tienen una forma distintiva: se detectan por nombre.
        value_pattern=None,
        masking_hint="***",
    ),
)

# Columnas de control del lakehouse que nunca deben clasificarse.
RESERVED_PREFIXES = ("_",)


def _normalize_column_name(column: str) -> str:
    return re.sub(r"[^a-z0-9]+", "_", column.strip().lower())


def _matches_column_name(rule: CategoryRule, column: str) -> bool:
    normalized = _normalize_column_name(column)
    return any(keyword in normalized for keyword in rule.column_keywords)


def passes_luhn(value: str) -> bool:
    """Validación de Luhn: descarta secuencias numéricas que no son tarjetas."""
    digits = [int(char) for char in re.sub(r"\D", "", value)]
    if len(digits) < 13:
        return False

    checksum = 0
    for index, digit in enumerate(reversed(digits)):
        if index % 2 == 1:
            digit *= 2
            if digit > 9:
                digit -= 9
        checksum += digit
    return checksum % 10 == 0


def _matches_values(
    rule: CategoryRule,
    values: Sequence[Any],
    match_ratio: float,
) -> tuple[bool, int, int]:
    """Evalúa el patrón de la regla contra los valores de muestra."""
    if rule.value_pattern is None:
        return False, 0, 0

    candidates = [str(value).strip() for value in values if value not in (None, "")]
    if not candidates:
        return False, 0, 0

    matches = 0
    for candidate in candidates:
        if not rule.value_pattern.match(candidate):
            continue
        if rule.requires_luhn and not passes_luhn(candidate):
            continue
        matches += 1

    return (matches / len(candidates)) >= match_ratio, matches, len(candidates)


def classify_column(
    column: str,
    values: Optional[Sequence[Any]] = None,
    *,
    match_ratio: float = DEFAULT_VALUE_MATCH_RATIO,
) -> Optional[ColumnClassification]:
    """Clasifica una columna. Devuelve `None` si no es sensible.

    La confianza refleja cuántas señales independientes coincidieron: 1.0 si el
    nombre y los valores concuerdan, 0.8 si solo el nombre y 0.75 si solo los
    valores (el contenido sin respaldo del nombre es la señal más débil).
    """
    if column.startswith(RESERVED_PREFIXES):
        return None

    sample = list(values or [])

    def build(rule: CategoryRule, signal: DetectionSignal, confidence: float,
              matches: int, sampled: int) -> ColumnClassification:
        return ColumnClassification(
            column=column,
            category=rule.category,
            signal=signal,
            confidence=confidence,
            masking_hint=rule.masking_hint,
            sample_matches=matches,
            sampled_values=sampled,
        )

    # Primera pasada: el nombre de la columna es la señal más fuerte y decide
    # la categoría. Sin esta precedencia, un salario de siete dígitos encajaría
    # en el patrón de documento y quedaría clasificado como IDENTIFICACION.
    for rule in TAXONOMY:
        if not _matches_column_name(rule, column):
            continue
        value_hit, matches, sampled = _matches_values(rule, sample, match_ratio)
        if value_hit:
            return build(rule, DetectionSignal.BOTH, 1.0, matches, sampled)
        return build(rule, DetectionSignal.COLUMN_NAME, 0.8, matches, sampled)

    # Segunda pasada: ningún nombre coincide, así que decide el contenido.
    for rule in TAXONOMY:
        value_hit, matches, sampled = _matches_values(rule, sample, match_ratio)
        if value_hit:
            return build(rule, DetectionSignal.VALUE_PATTERN, 0.75, matches, sampled)

    return None


def classify_records(
    records: Iterable[Dict[str, Any]],
    *,
    source_name: str,
    batch_id: str,
    sample_size: int = DEFAULT_SAMPLE_SIZE,
    match_ratio: float = DEFAULT_VALUE_MATCH_RATIO,
) -> BatchClassificationResult:
    """Escanea un lote de registros y clasifica sus columnas sensibles.

    Solo se inspeccionan los primeros `sample_size` registros: el costo del
    escaneo depende del número de columnas, no del tamaño del lote.
    """
    samples: Dict[str, List[Any]] = {}
    seen_columns: List[str] = []

    for index, record in enumerate(records):
        if index >= sample_size:
            break
        if not isinstance(record, dict):
            continue
        for column, value in record.items():
            if column not in samples:
                samples[column] = []
                seen_columns.append(column)
            samples[column].append(value)

    classifications = []
    for column in seen_columns:
        result = classify_column(column, samples[column], match_ratio=match_ratio)
        if result is not None:
            classifications.append(result)

    return BatchClassificationResult(
        source_name=source_name,
        batch_id=batch_id,
        columns_scanned=len(seen_columns),
        classifications=classifications,
    )
