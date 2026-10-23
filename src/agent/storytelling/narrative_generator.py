"""Genera narrativa ejecutiva sin crear cifras nuevas."""

import re
from datetime import date, datetime
from decimal import Decimal


_NUMBER = re.compile(r"(?<![\w])[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?")
_DIMENSION_NAME = re.compile(
    r"(^|_)(fecha|date|time|hora|mes|month|anio|año|ano|year|dia|day|"
    r"region|tienda|cliente|canal)(_|$)|_id$",
    re.IGNORECASE,
)


def dimension_columns(rows: list[dict[str, object]]) -> list[str]:
    """Devuelve las columnas que contextualizan la métrica (región, canal...)."""
    columns = list(dict.fromkeys(column for row in rows for column in row))
    dimensions: list[str] = []
    for column in columns:
        values = [row.get(column) for row in rows if row.get(column) is not None]
        if not values:
            continue
        if not all(_is_number(value) for value in values):
            dimensions.append(column)
        elif _DIMENSION_NAME.search(column):
            dimensions.append(column)
    return dimensions


def metric_columns(rows: list[dict[str, object]]) -> list[str]:
    """Devuelve las columnas numéricas que son métricas, no dimensiones."""
    dimensions = set(dimension_columns(rows))
    columns = list(dict.fromkeys(column for row in rows for column in row))
    return [
        column
        for column in columns
        if column not in dimensions and any(_is_number(row.get(column)) for row in rows)
    ]


def dimension_context(row: dict[str, object], dimensions: list[str]) -> str:
    """Formatea las dimensiones presentes en una fila."""
    parts: list[str] = []
    for dimension in dimensions:
        value = row.get(dimension)
        if value is None:
            continue
        parts.append(f"{dimension}={_text_value(value)}")
    return ", ".join(parts)


def metric_label(
    row: dict[str, object],
    column: str,
    dimensions: list[str],
) -> str:
    """Etiqueta la métrica con la dimensión que la hace interpretable."""
    context = dimension_context(row, dimensions)
    clean_column = _label_without_numbers(column)
    if context:
        return f"{context} · {clean_column}"
    return clean_column


def build_narrative(rows: list[dict[str, object]]) -> str:
    """Redacta hallazgos desde valores numéricos originales de Trino."""
    findings: list[str] = []
    source_numbers: set[str] = set()
    dimensions = dimension_columns(rows)
    metrics = metric_columns(rows)

    # Las etiquetas de dimensión (REG-01, TND-001, fechas) pueden contener
    # dígitos que no son cifras de negocio; se permiten porque vienen de Trino.
    for row in rows:
        for dimension in dimensions:
            value = row.get(dimension)
            if value is not None:
                source_numbers.update(_NUMBER.findall(_text_value(value)))

    for row in rows:
        for column in metrics:
            value = row.get(column)
            if not _is_number(value):
                continue
            original = _number_text(value)
            source_numbers.add(original)
            label = metric_label(row, column, dimensions)
            findings.append(f"- `{label}`: `{original}` (valor retornado por Trino).")
            if len(findings) == 5:
                break
        if len(findings) == 5:
            break

    if not findings:
        findings.append("- El resultado no contiene cifras numéricas para resumir.")

    narrative = "\n".join(
        [
            "## Hallazgo principal",
            *findings,
            "",
            "## Recomendación de negocio",
            "Usar estos resultados como base para revisar el comportamiento observado y definir la acción adecuada con el equipo responsable.",
        ]
    )
    _validate_source_numbers(narrative, source_numbers)
    return narrative


def _validate_source_numbers(narrative: str, source_numbers: set[str]) -> None:
    """Reject any figure that is not present in the Trino values."""
    if any(token not in source_numbers for token in _NUMBER.findall(narrative)):
        raise ValueError("La narrativa contiene una cifra que no proviene de Trino.")


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _number_text(value: int | float | Decimal) -> str:
    return str(value)


def _label_without_numbers(label: str) -> str:
    cleaned = re.sub(r"\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?", "", label).strip(" -_·")
    return cleaned or "métrica"


def _text_value(value: object) -> str:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    return str(value)
