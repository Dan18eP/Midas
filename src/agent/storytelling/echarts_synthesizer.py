"""Infiere una visualización ECharts desde las filas de Trino."""

import math
import re
from datetime import date, datetime
from decimal import Decimal


MIDAS_PALETTE = ["#0F766E", "#14B8A6", "#F59E0B", "#1E293B"]
_TIME_NAME = re.compile(r"date|time|fecha|hora|month|mes|year|año|ano", re.IGNORECASE)


def build_echarts_option(rows: list[dict[str, object]]) -> dict[str, object]:
    """Devuelve una opción ECharts compatible con el tipo de datos observado."""
    columns = list(dict.fromkeys(column for row in rows for column in row))
    temporal = next((column for column in columns if _is_temporal_column(column, rows)), None)
    numeric = [column for column in columns if _has_numeric_values(column, rows)]
    category = next(
        (column for column in columns if column != temporal and column not in numeric and _has_values(column, rows)),
        None,
    )

    option: dict[str, object] = {
        "title": {"text": "Análisis de resultados", "left": "center"},
        "tooltip": {"trigger": "axis"},
        "legend": {"top": "bottom"},
        "color": MIDAS_PALETTE,
        "series": [],
    }

    if temporal and numeric:
        value_column = next((column for column in numeric if column != temporal), None)
        if value_column is None:
            return _empty_option(option)
        column = value_column
        option.update(
            {
                "xAxis": {"type": "category", "name": temporal, "data": [_chart_value(row.get(temporal)) for row in rows]},
                "yAxis": {"type": "value", "name": column},
                "series": [{"name": column, "type": "line", "smooth": True, "areaStyle": {"opacity": 0.2}, "data": [_chart_value(row.get(column)) for row in rows]}],
            }
        )
    elif len(numeric) >= 2:
        x_column, y_column = numeric[:2]
        option.update(
            {
                "tooltip": {"trigger": "item"},
                "xAxis": {"type": "value", "name": x_column},
                "yAxis": {"type": "value", "name": y_column},
                "series": [{"name": f"{x_column} vs. {y_column}", "type": "scatter", "data": [[_chart_value(row.get(x_column)), _chart_value(row.get(y_column))] for row in rows]}],
            }
        )
    elif category and numeric:
        column = numeric[0]
        option.update(
            {
                "tooltip": {"trigger": "axis", "axisPointer": {"type": "shadow"}},
                "xAxis": {"type": "value", "name": column},
                "yAxis": {"type": "category", "name": category, "inverse": True, "data": [_chart_value(row.get(category)) for row in rows]},
                "series": [{"name": column, "type": "bar", "data": [_chart_value(row.get(column)) for row in rows]}],
            }
        )
    else:
        return _empty_option(option)

    return option


def _empty_option(option: dict[str, object]) -> dict[str, object]:
    option["graphic"] = {"type": "text", "left": "center", "top": "middle", "style": {"text": "No hay datos suficientes para elegir un gráfico."}}
    return option


def _is_temporal_column(column: str, rows: list[dict[str, object]]) -> bool:
    values = [row.get(column) for row in rows if row.get(column) is not None]
    if not values:
        return False
    if _TIME_NAME.search(column):
        return True
    return all(isinstance(value, (date, datetime)) or _parse_date(value) for value in values)


def _parse_date(value: object) -> bool:
    if not isinstance(value, str):
        return False
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        try:
            date.fromisoformat(value + "-01" if re.fullmatch(r"\d{4}-\d{2}", value) else value)
            return True
        except ValueError:
            return False


def _has_numeric_values(column: str, rows: list[dict[str, object]]) -> bool:
    return any(_is_number(row.get(column)) for row in rows)


def _has_values(column: str, rows: list[dict[str, object]]) -> bool:
    return any(row.get(column) is not None for row in rows)


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _chart_value(value: object) -> object:
    if isinstance(value, (date, datetime)):
        return value.isoformat()
    if isinstance(value, Decimal):
        return float(value) if value.is_finite() else None
    if isinstance(value, float) and not math.isfinite(value):
        return None
    if isinstance(value, (str, int, float)) or value is None or isinstance(value, bool):
        return value
    return str(value)
