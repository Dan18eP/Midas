"""Síntesis ejecutiva y opciones de visualización para el agente."""

from datetime import date, datetime
from decimal import Decimal

from src.agent.storytelling.echarts_synthesizer import build_echarts_option
from src.agent.storytelling.narrative_generator import (
    build_narrative,
    dimension_columns,
    metric_columns,
    metric_label,
)


def synthesize_storytelling(rows: list[dict[str, object]]) -> dict[str, object]:
    """Construye la salida estructurada usando solo resultados de Trino."""
    dimensions = dimension_columns(rows)
    metrics = metric_columns(rows)
    metrics_summary: list[dict[str, object]] = []

    for row_index, row in enumerate(rows):
        dimension_values = {
            dimension: _json_value(row.get(dimension))
            for dimension in dimensions
            if row.get(dimension) is not None
        }
        for column in metrics:
            value = row.get(column)
            if not _is_number(value):
                continue
            item: dict[str, object] = {
                "label": metric_label(row, column, dimensions),
                "value": _json_value(value),
                "source_column": column,
                "row_index": row_index,
            }
            if dimension_values:
                item["dimensions"] = dimension_values
            metrics_summary.append(item)

    return {
        "narrative": build_narrative(rows),
        "echarts_option": build_echarts_option(rows),
        "metrics_summary": metrics_summary,
    }


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _json_value(value: object) -> object:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        return None
    return value


__all__ = ["synthesize_storytelling"]
