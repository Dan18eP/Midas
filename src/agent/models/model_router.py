"""Enruta SQL entre Ollama local y plantillas SQLGlot sin servicios cloud."""

from __future__ import annotations

import json
import os
import re
from collections.abc import Mapping, Sequence
from http.client import HTTPException
from urllib.request import Request, urlopen

import sqlglot
from sqlglot import exp
from src.agent.guardrails.query_guardrail import validate_query


_ALLOWED_ENDPOINTS = {
    "http://midas-ollama:11434",
    "http://host.docker.internal:11434",
    "http://localhost:11434",
    "http://127.0.0.1:11434",
}
_DEFAULT_ENDPOINT = "http://midas-ollama:11434"
_MODEL = "qwen2.5:3b"
_SUPPORTED_NUMERIC_COLUMNS = {
    "monto",
    "monto_neto",
    "meta_ingreso_presupuestada",
    "costo_operativo_fijo",
    "gasto_marketing",
    "tiempo_respuesta_minutos",
    "calificacion_satisfaccion",
}


class ModelRouter:
    """Usa Ollama en local y cae a consultas analíticas precertificadas."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        timeout: float = 8.0,
    ) -> None:
        env_endpoint = os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_HOST")
        endpoint = (base_url or env_endpoint or _DEFAULT_ENDPOINT).rstrip("/")
        if endpoint not in _ALLOWED_ENDPOINTS:
            raise ValueError("Ollama debe usar uno de los endpoints locales aprobados.")
        self._base_url = endpoint
        self._timeout = timeout

    def __call__(self, system_prompt: str, question: str) -> str:
        """Mantiene compatibilidad con el generador inyectable existente."""
        return self._call_ollama(system_prompt, question)

    def generate_sql(
        self,
        question: str,
        catalog: Sequence[Mapping[str, object]],
        system_prompt: str,
    ) -> str:
        """Usa el modelo local o genera un SELECT determinístico de respaldo."""
        try:
            candidate = self._call_ollama(system_prompt, question)
            return validate_query(candidate, catalog)
        except (OSError, TimeoutError, ValueError, KeyError, HTTPException):
            return deterministic_sql(question, catalog)

    def _call_ollama(self, system_prompt: str, question: str) -> str:
        body = json.dumps(
            {
                "model": _MODEL,
                "system": system_prompt,
                "prompt": question,
                "stream": False,
                "options": {"temperature": 0, "num_predict": 256},
            }
        ).encode("utf-8")
        request = Request(
            f"{self._base_url}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        with urlopen(request, timeout=self._timeout) as response:
            payload = json.loads(response.read().decode("utf-8"))
        result = payload.get("response")
        if not isinstance(result, str) or not result.strip():
            raise ValueError("Ollama devolvió una respuesta vacía.")
        return result.strip()


def deterministic_sql(
    question: str,
    catalog: Sequence[Mapping[str, object]],
) -> str:
    """Resuelve conteo, suma o promedio con una plantilla SQLGlot fija."""
    normalized_question = question.casefold()
    unsupported_detail = (
        "compara", "comparar", "versus", " contra ", "cruza", "tendencia", "trend",
        " por ",
        " en enero", " en febrero", " en marzo", " en abril", " en mayo", " en junio",
        " en julio", " en agosto", " en septiembre", " en octubre", " en noviembre", " en diciembre",
    )
    if any(word in f" {normalized_question} " for word in unsupported_detail) or re.search(
        r"\b(?:19|20)\d{2}\b", normalized_question
    ):
        # Multi-table and grouped requests need a model or a dedicated template.
        raise ValueError("La intención requiere una plantilla que aún no está aprobada.")
    tables = _allowed_tables(catalog)
    table = next(
        (entry for entry in tables if entry[0].casefold() in normalized_question),
        None,
    )
    if table is None:
        hints = {
            "transaccion": ("transaccion", "venta", "ingreso"),
            "presupuesto": ("presupuesto", "meta"),
            "costos": ("costo", "gasto"),
            "tickets": ("ticket", "soporte", "satisfaccion", "satisfacción"),
        }
        for marker, words in hints.items():
            if any(word in normalized_question for word in words):
                table = next((entry for entry in tables if marker in entry[0].casefold()), None)
                if table:
                    break
    if table is None:
        raise ValueError("El fallback no encontró una tabla silver/gold permitida.")

    table_name, columns = table
    if any(word in normalized_question for word in ("promedio", "average", "avg")):
        operation = "AVG"
    elif any(word in normalized_question for word in ("cuánt", "cuant", "cuenta", "count", "registros", "number of")):
        operation = "COUNT"
    elif any(word in normalized_question for word in ("suma", "total", "sum", "ventas", "ingresos")):
        operation = "SUM"
    else:
        raise ValueError("La intención no coincide con una plantilla analítica aprobada.")

    if operation == "COUNT":
        expression = "COUNT(*) AS total_registros"
    else:
        column = _numeric_column(normalized_question, columns)
        expression = f"{operation}({column}) AS {operation.casefold()}_{column}"
    query = sqlglot.parse_one(f"SELECT {expression} FROM {table_name}", read="trino")
    filter_term = _category_filter(normalized_question, columns)
    if filter_term:
        column, value = filter_term
        query = query.where(
            exp.EQ(this=exp.column(column), expression=exp.Literal.string(value))
        )
    return validate_query(query.sql(dialect="trino"), catalog)


def _allowed_tables(
    catalog: Sequence[Mapping[str, object]],
) -> list[tuple[str, set[str]]]:
    tables = []
    for entry in catalog:
        name, columns = entry.get("table"), entry.get("columns")
        if not isinstance(name, str) or not isinstance(columns, (list, tuple, set)):
            continue
        if name.casefold().startswith(("silver.", "gold.")) and columns:
            tables.append((name, {str(column).casefold() for column in columns}))
    return tables


def _numeric_column(question: str, columns: set[str]) -> str:
    synonyms = {
        "venta": "monto",
        "ingreso": "monto",
        "revenue": "monto",
        "costos": "costo_operativo_fijo",
        "gastos": "gasto_marketing",
        "satisfaccion": "calificacion_satisfaccion",
        "satisfacción": "calificacion_satisfaccion",
    }
    for word, column in synonyms.items():
        if word in question and column in columns:
            return column
    for column in sorted(_SUPPORTED_NUMERIC_COLUMNS, key=len, reverse=True):
        if column in columns and re.search(rf"\b{re.escape(column)}\b", question):
            return column
    candidates = columns & _SUPPORTED_NUMERIC_COLUMNS
    if len(candidates) == 1:
        return candidates.pop()
    raise ValueError("La columna métrica no está indicada de forma inequívoca.")


def _category_filter(question: str, columns: set[str]) -> tuple[str, str] | None:
    """Aplica solo filtros de categoría con valores precertificados."""
    options = {
        "region": {"norte": "NORTE", "sur": "SUR", "centro": "CENTRO"},
        "canal_venta": {"online": "ONLINE", "tienda": "TIENDA", "partner": "PARTNER"},
        "estado": {"cerrado": "CERRADO", "abierto": "ABIERTO"},
    }
    matches = [
        (column, values[value])
        for column, values in options.items()
        if column in columns
        for value in values
        if re.search(rf"\b{value}\b", question)
    ]
    if len(matches) > 1:
        raise ValueError("El fallback no admite varios filtros en una consulta.")
    if not matches and any(
        re.search(rf"\b{term}\b", question)
        for term in (*options, "norte", "sur", "centro", "online", "tienda", "partner", "cerrado", "abierto")
    ):
        raise ValueError("El filtro solicitado no está disponible en el catálogo activo.")
    return matches[0] if matches else None
