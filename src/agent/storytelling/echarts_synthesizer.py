"""Infiere una visualización ECharts desde las filas de Trino."""

import math
import re
from datetime import date, datetime
from decimal import Decimal


MIDAS_PALETTE = ["#0F766E", "#14B8A6", "#F59E0B", "#1E293B"]
_TIME_NAME = re.compile(r"date|time|fecha|hora|month|mes|year|año|ano", re.IGNORECASE)


def build_echarts_option(rows: list[dict[str, object]], user_prompt: str | None = None) -> dict[str, object]:
    """Devuelve una opción ECharts adaptativa basada en los datos reales y la intención del usuario."""
    columns = list(dict.fromkeys(column for row in rows for column in row))
    temporal = next((column for column in columns if _is_temporal_column(column, rows)), None)
    numeric = [column for column in columns if _has_numeric_values(column, rows)]
    category = next(
        (column for column in columns if column != temporal and column not in numeric and _has_values(column, rows)),
        None,
    )

    prompt_lower = (user_prompt or "").lower()
    wants_pie = any(k in prompt_lower for k in ("pie", "pastel", "torta", "distribuci", "porcentaj", "participaci", "proporcion"))
    wants_line = any(k in prompt_lower for k in ("linea", "tendencia", "tiempo", "evolucion", "mes", "historico", "mensual", "diario", "anual"))
    wants_bar = any(k in prompt_lower for k in ("barra", "columnas", "ranking", "top", "comparativa"))

    title_text = "Análisis de resultados"
    if user_prompt and len(user_prompt.strip()) > 3:
        clean_prompt = user_prompt.strip().rstrip("?.! ")
        title_text = clean_prompt[:45].capitalize()

    option: dict[str, object] = {
        "title": {"text": title_text, "left": "center", "textStyle": {"fontSize": 13, "fontWeight": 600, "color": "#1C1E21"}},
        "tooltip": {"trigger": "axis"},
        "legend": {"top": "bottom"},
        "color": MIDAS_PALETTE,
        "series": [],
    }

    # 1. Gráfica de pastel / dona cuando el usuario lo solicita explícitamente o pide distribución
    if wants_pie and (category or columns) and numeric:
        cat_col = category or [c for c in columns if c not in numeric][0] if any(c not in numeric for c in columns) else columns[0]
        val_col = numeric[0]
        pie_data = [
            {"name": str(row.get(cat_col)), "value": _chart_value(row.get(val_col))}
            for row in rows
            if row.get(cat_col) is not None
        ]
        option.update(
            {
                "tooltip": {"trigger": "item", "formatter": "{b}: {c} ({d}%)"},
                "legend": {"orient": "horizontal", "bottom": 5},
                "series": [
                    {
                        "name": val_col,
                        "type": "pie",
                        "radius": ["35%", "65%"],
                        "avoidLabelOverlap": True,
                        "itemStyle": {"borderRadius": 5, "borderColor": "#fff", "borderWidth": 2},
                        "data": pie_data,
                    }
                ],
            }
        )
        return option

    # 2. Gráfica de línea cuando el usuario solicita tendencia o hay eje temporal
    if (wants_line or temporal) and numeric:
        x_col = temporal or category or (columns[0] if columns else "eje_x")
        val_col = numeric[0] if numeric[0] != x_col else (numeric[1] if len(numeric) > 1 else numeric[0])
        option.update(
            {
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "name": str(x_col), "data": [_chart_value(row.get(x_col)) for row in rows]},
                "yAxis": {"type": "value", "name": str(val_col)},
                "series": [
                    {
                        "name": str(val_col),
                        "type": "line",
                        "smooth": True,
                        "areaStyle": {"opacity": 0.2},
                        "data": [_chart_value(row.get(val_col)) for row in rows],
                    }
                ],
            }
        )
        return option

    # 3. Dispersión cuando hay 2 numéricos y no se pidieron barras
    if len(numeric) >= 2 and not wants_bar:
        x_column, y_column = numeric[:2]
        option.update(
            {
                "tooltip": {"trigger": "item"},
                "xAxis": {"type": "value", "name": x_column},
                "yAxis": {"type": "value", "name": y_column},
                "series": [{"name": f"{x_column} vs. {y_column}", "type": "scatter", "data": [[_chart_value(row.get(x_column)), _chart_value(row.get(y_column))] for row in rows]}],
            }
        )
        return option

    # 4. Barras categóricas estándar (verticales u horizontales)
    if category and numeric:
        column = numeric[0]
        option.update(
            {
                "tooltip": {"trigger": "axis", "axisPointer": {"type": "shadow"}},
                "xAxis": {"type": "value", "name": column},
                "yAxis": {"type": "category", "name": category, "inverse": True, "data": [_chart_value(row.get(category)) for row in rows]},
                "series": [
                    {
                        "name": column,
                        "type": "bar",
                        "data": [_chart_value(row.get(column)) for row in rows],
                        "itemStyle": {"borderRadius": [0, 4, 4, 0]},
                    }
                ],
            }
        )
        return option

    # 5. Agrupaciones KPI y métricas agregadas
    if numeric and rows:
        col_labels = [str(c).replace("_col0", "Métrica Total").replace("_", " ").title() for c in numeric]
        option.update(
            {
                "tooltip": {"trigger": "axis"},
                "xAxis": {"type": "category", "data": col_labels},
                "yAxis": {"type": "value"},
                "series": [
                    {
                        "name": "Valor Registrado",
                        "type": "bar",
                        "barWidth": "45%",
                        "data": [_chart_value(rows[0].get(c)) for c in numeric],
                        "itemStyle": {"color": "#B8860B", "borderRadius": [4, 4, 0, 0]},
                    }
                ],
            }
        )
        return option

    return _empty_option(option)


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
