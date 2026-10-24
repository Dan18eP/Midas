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


def test_intent_based_pie_chart_synthesis():
    rows = [
        {"canal": "Online", "ventas": 500},
        {"canal": "Fisico", "ventas": 300},
    ]
    option = build_echarts_option(rows, user_prompt="Quiero ver un gráfico de pastel de la distribución por canal")
    assert option["series"][0]["type"] == "pie"
    assert len(option["series"][0]["data"]) == 2
    assert option["series"][0]["data"][0]["name"] == "Online"
    assert option["series"][0]["data"][0]["value"] == 500


def test_intent_based_line_chart_synthesis():
    rows = [
        {"periodo": "Q1", "margen": 25},
        {"periodo": "Q2", "margen": 30},
    ]
    option = build_echarts_option(rows, user_prompt="Muestra la tendencia y evolución temporal")
    assert option["series"][0]["type"] == "line"


def test_storytelling_with_llm_model_router():
    class FakeModelRouter:
        def generate_storytelling(self, question, sql, rows, inference_mode="cloud"):
            return {
                "narrative": "## Hallazgo principal\nEl canal online domina con 500 unidades.\n\n## Recomendación de negocio\nInvertir en marketing digital.",
                "echarts_option": {
                    "title": {"text": "Ventas por Canal"},
                    "series": [{"type": "pie", "data": [{"name": "Online", "value": 500}]}],
                },
            }

    rows = [{"canal": "Online", "ventas": 500}]
    result = synthesize_storytelling(
        rows,
        user_prompt="haz un gráfico de pastel",
        sql="SELECT canal, ventas FROM silver.crm",
        model_router=FakeModelRouter(),
    )

    assert "canal online domina" in result["narrative"]
    assert result["echarts_option"]["series"][0]["type"] == "pie"
    assert result["metrics_summary"][0]["value"] == 500
