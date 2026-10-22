"""Tests for the agent's narrative and chart synthesis."""

import re

import pytest

from src.agent.storytelling.echarts_synthesizer import build_echarts_option
from src.agent.storytelling.narrative_generator import (
    _validate_source_numbers,
    build_narrative,
)
from src.agent.storytelling import synthesize_storytelling


def test_temporal_rows_use_line_chart_with_area():
    option = build_echarts_option([
        {"fecha": "2026-01-01", "ingresos": 120},
        {"fecha": "2026-02-01", "ingresos": 150},
    ])

    assert option["series"][0]["type"] == "line"
    assert option["series"][0]["areaStyle"]["opacity"] > 0


def test_category_rows_use_horizontal_bars():
    option = build_echarts_option([
        {"region": "Norte", "ingresos": 120},
        {"region": "Sur", "ingresos": 90},
    ])

    assert option["series"][0]["type"] == "bar"
    assert option["yAxis"]["type"] == "category"
    assert option["yAxis"]["inverse"] is True


def test_grouped_gold_region_rows_use_bar_chart():
    option = build_echarts_option([
        {"region_id": "REG-NORTE", "venta_neta": 4200000.0},
        {"region_id": "REG-SUR", "venta_neta": 3100000.0},
        {"region_id": "REG-CENTRO", "venta_neta": 2800000.0},
    ])

    assert option["series"][0]["type"] == "bar"
    assert option["yAxis"]["type"] == "category"
    assert len(option["series"][0]["data"]) == 3


def test_grouped_gold_month_rows_use_line_chart():
    option = build_echarts_option([
        {"mes": 1, "venta_neta": 120000.0},
        {"mes": 2, "venta_neta": 150000.0},
        {"mes": 3, "venta_neta": 110000.0},
    ])

    assert option["series"][0]["type"] == "line"
    assert option["xAxis"]["type"] == "category"
    assert len(option["series"][0]["data"]) == 3


def test_two_numeric_columns_use_scatter_chart():
    option = build_echarts_option([
        {"gasto": 10, "ingresos": 20},
        {"gasto": 15, "ingresos": 30},
    ])

    assert option["series"][0]["type"] == "scatter"


def test_insufficient_data_returns_explanatory_empty_chart():
    option = build_echarts_option([{"region": "Norte"}])

    assert option["series"] == []
    assert "No hay datos suficientes" in option["graphic"]["style"]["text"]


def test_narrative_uses_only_values_from_trino_rows():
    narrative = build_narrative([{"ingresos": 120}])

    assert "120" in narrative
    assert re.findall(r"\d+", narrative) == ["120"]


def test_hallucinated_number_raises_value_error():
    with pytest.raises(ValueError, match="no proviene de Trino"):
        _validate_source_numbers("Los ingresos llegaron a 999.", {"120"})


def test_storytelling_result_keeps_chart_and_lineage_structured():
    result = synthesize_storytelling([{"region": "Norte", "ingresos": 120}])

    assert result["narrative"].startswith("## Hallazgo principal")
    assert result["echarts_option"]["series"][0]["type"] == "bar"
    assert result["metrics_summary"][0]["value"] == 120
