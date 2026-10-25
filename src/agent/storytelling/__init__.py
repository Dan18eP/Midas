"""Síntesis ejecutiva y opciones de visualización para el agente."""

import logging
from decimal import Decimal

from src.agent.storytelling.echarts_synthesizer import build_echarts_option
from src.agent.storytelling.narrative_generator import build_narrative

logger = logging.getLogger("midas.agent.storytelling")


def synthesize_storytelling(
    rows: list[dict[str, object]],
    user_prompt: str = "",
    sql: str = "",
    model_router: object | None = None,
    inference_mode: str = "cloud",
) -> dict[str, object]:
    """Construye la salida estructurada usando resultados de Trino y síntesis inteligente adaptativa."""
    if len(rows) <= 3:
        metrics_summary = [
            {
                "label": column,
                "value": _json_value(value),
                "source_column": column,
                "row_index": row_index,
            }
            for row_index, row in enumerate(rows)
            for column, value in row.items()
            if _is_number(value)
        ][:4]
    else:
        # En consultas tabulares o rankings extensos (>3 filas), resumir en KPIs ejecutivos agregados
        metrics_summary = []
        numeric_cols = [c for c, v in rows[0].items() if _is_number(v)]
        if numeric_cols:
            primary_num_col = numeric_cols[0]
            vals = [float(r[primary_num_col]) for r in rows if r.get(primary_num_col) is not None and _is_number(r[primary_num_col])]
            if vals:
                total_val = sum(vals)
                avg_val = round(total_val / len(vals), 2)
                max_val = max(vals)
                metrics_summary.append({
                    "label": f"Total {primary_num_col}",
                    "value": round(total_val, 2) if total_val != int(total_val) else int(total_val),
                    "source_column": primary_num_col,
                    "row_index": 0,
                })
                metrics_summary.append({
                    "label": f"Promedio {primary_num_col}",
                    "value": avg_val,
                    "source_column": primary_num_col,
                    "row_index": 1,
                })
                metrics_summary.append({
                    "label": f"Máx {primary_num_col}",
                    "value": round(max_val, 2) if max_val != int(max_val) else int(max_val),
                    "source_column": primary_num_col,
                    "row_index": 2,
                })
        metrics_summary.append({
            "label": "Total Registros",
            "value": len(rows),
            "source_column": "count",
            "row_index": len(metrics_summary),
        })
        metrics_summary = metrics_summary[:4]

    llm_result = None
    if model_router is not None and hasattr(model_router, "generate_storytelling"):
        try:
            llm_result = model_router.generate_storytelling(
                question=user_prompt,
                sql=sql,
                rows=rows,
                inference_mode=inference_mode,
            )
        except Exception as exc:
            logger.debug("Error invocando LLM para storytelling: %s", exc)

    if (
        isinstance(llm_result, dict)
        and isinstance(llm_result.get("narrative"), str)
        and llm_result["narrative"].strip()
        and isinstance(llm_result.get("echarts_option"), dict)
        and llm_result["echarts_option"]
    ):
        return {
            "narrative": llm_result["narrative"].strip(),
            "echarts_option": llm_result["echarts_option"],
            "metrics_summary": metrics_summary,
        }

    return {
        "narrative": build_narrative(rows, user_prompt=user_prompt, sql=sql),
        "echarts_option": build_echarts_option(rows, user_prompt=user_prompt),
        "metrics_summary": metrics_summary,
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
