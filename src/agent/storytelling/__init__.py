"""Síntesis ejecutiva y opciones de visualización para el agente."""

from decimal import Decimal

from src.agent.storytelling.echarts_synthesizer import build_echarts_option
from src.agent.storytelling.narrative_generator import build_narrative


def synthesize_storytelling(rows: list[dict[str, object]]) -> dict[str, object]:
    """Construye la salida estructurada usando solo resultados de Trino."""
    return {
        "narrative": build_narrative(rows),
        "echarts_option": build_echarts_option(rows),
        "metrics_summary": [
            {
                "label": column,
                "value": _json_value(value),
                "source_column": column,
                "row_index": row_index,
            }
            for row_index, row in enumerate(rows)
            for column, value in row.items()
            if _is_number(value)
        ],
    }


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _json_value(value: object) -> object:
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, float) and (value != value or value in (float("inf"), float("-inf"))):
        return None
    return value


__all__ = ["synthesize_storytelling"]
