"""Enruta SQL a Gemini Cloud API (u Ollama local) con fallback deterministico SQLGlot."""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import Mapping, Sequence
from urllib.request import Request, urlopen

import sqlglot
from sqlglot import exp
from src.agent.guardrails.query_guardrail import validate_query

logger = logging.getLogger("midas.agent.models.model_router")


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
    "monto_bruto",
    "venta_neta",
    "venta_bruta",
    "total_neto",
    "total_bruto",
    "total_descuento",
    "total_devoluciones",
    "pedidos_validos",
    "total_pedidos",
    "pedidos_devueltos",
    "ticket_promedio",
    "tasa_devolucion",
    "meta_ingreso_presupuestada",
    "costo_operativo_fijo",
    "gasto_marketing",
    "tiempo_respuesta_minutos",
    "calificacion_satisfaccion",
    "importe",
    "valor",
    "precio",
}

_SALES_RE = re.compile(
    r"\b(vend\w*|ventas?|ingresos?|facturaci[oó]n|revenue)\b", re.IGNORECASE
)
_COUNT_ROW_TERMS = (
    "cuantos registros",
    "cuántos registros",
    "cuantas filas",
    "cuántas filas",
    "numero de registros",
    "número de registros",
    "conteo",
    "count",
)
_DIMENSION_SYNONYMS: tuple[tuple[tuple[str, ...], tuple[str, ...]], ...] = (
    (("region", "región", "regiones", "regiónes"), ("region_id", "region")),
    (("mes", "meses", "mensual", "mensuales"), ("mes",)),
    (("año", "ano", "anio", "años", "anos"), ("anio", "año")),
    (("tienda", "tiendas", "sucursal", "sucursales"), ("tienda_id", "tienda")),
    (("canal", "canales"), ("canal_venta", "canal")),
    (("cliente", "clientes"), ("cliente_id", "cliente")),
    (("dia", "día", "dias", "días"), ("dia", "fecha")),
    (("estado", "estados"), ("estado",)),
)

# Palabras que piden una agrupación/orden aunque no usen la forma "por <dimensión>".
_RANKING_RE = re.compile(
    r"\b(ranking|r[aá]nking|top|mejor|mejores|peor|peores|mayor|mayores|menor|menores|"
    r"principal|principales|con\s+m[aá]s|con\s+mayor|con\s+menor)\b",
    re.IGNORECASE,
)

# Preguntas como "¿qué región vendió más?" o "¿cuál tienda vende menos?" no
# usan la forma "por <dimensión>" pero sí piden un ranking.
_SUPERLATIVE_QUERY_RE = re.compile(
    r"\b(?:qu[eé]|cu[aá]l(?:es)?|qui[eé]n)\b[\s\S]*\b(?:m[aá]s|menos|mayor|menor|mejor|peor)\b",
    re.IGNORECASE,
)

# La pregunta pide explícitamente una agrupación. Si no se reconoce una
# dimensión certificada, es preferible delegar al LLM antes que devolver un total.
_GROUPING_INTENT_RE = re.compile(
    r"(?:\bpor\s+(?!qu[eé]\b|que\b|favor\b|ciento\b)|\bseg[uú]n\b|"
    r"\bdesglos\w*|\bdistribu\w*|\bdesempe[nñ]o\b|\bevoluci[oó]n\b|"
    r"\bcada\b|\ba\s+nivel\s+de\b|\ben\s+funci[oó]n\s+de\b)",
    re.IGNORECASE,
)

# Métricas de negocio que no están cubiertas por las plantillas certificadas.
_UNSUPPORTED_METRIC_TERMS = (
    "margen",
    "utilidad",
    "ganancia",
    "rentabilidad",
    "conversion",
    "conversión",
    "clientes nuevos",
    "crecimiento",
    "variacion",
    "variación",
    "porcentaje",
    "ratio",
    "únicos",
    "unicos",
    "únicas",
    "unicas",
    "distintos",
    "distintas",
    "distinct",
)

_UNSUPPORTED_TIME_TERMS = (
    "año pasado",
    "ano pasado",
    "último año",
    "ultimo ano",
    "mes pasado",
    "mes anterior",
    "semana pasada",
    "trimestre pasado",
    "ayer",
    "hoy",
)

# Métricas explícitas: deben resolver antes que la detección genérica de "ventas".
_METRIC_SYNONYMS: tuple[tuple[str, tuple[str, ...]], ...] = (
    ("venta neta", ("venta_neta", "total_neto", "monto_neto")),
    ("ventas netas", ("venta_neta", "total_neto", "monto_neto")),
    ("venta bruta", ("venta_bruta", "monto_bruto", "total_bruto")),
    ("ventas brutas", ("venta_bruta", "monto_bruto", "total_bruto")),
    ("devoluciones", ("total_devoluciones", "devolucion", "devoluciones")),
    ("devolucion", ("total_devoluciones", "devolucion", "devoluciones")),
    ("devolución", ("total_devoluciones", "devolucion", "devoluciones")),
    ("descuentos", ("total_descuento", "descuento", "descuentos")),
    ("descuento", ("total_descuento", "descuento", "descuentos")),
    ("ticket promedio", ("ticket_promedio",)),
    ("ticket", ("ticket_promedio",)),
    ("pedidos validos", ("pedidos_validos", "total_pedidos")),
    ("pedidos válidos", ("pedidos_validos", "total_pedidos")),
    ("pedidos", ("pedidos_validos", "total_pedidos", "pedidos")),
    ("tasa de devolucion", ("tasa_devolucion",)),
    ("tasa de devolución", ("tasa_devolucion",)),
    ("costos", ("costo_operativo_fijo", "costo")),
    ("costo", ("costo_operativo_fijo", "costo")),
    ("gastos", ("gasto_marketing", "gasto")),
    ("satisfaccion", ("calificacion_satisfaccion",)),
    ("satisfacción", ("calificacion_satisfaccion",)),
)


class ModelRouter:
    """Enruta SQL a Gemini Cloud API (u Ollama local) con fallback deterministico SQLGlot."""

    def __init__(
        self,
        *,
        base_url: str | None = None,
        timeout: float = 8.0,
        api_key: str | None = None,
        model: str | None = None,
    ) -> None:
        self._api_key = api_key or os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
        self._gemini_model = model or os.getenv("GEMINI_MODEL") or "gemini-3.8-flash"
        env_endpoint = os.getenv("OLLAMA_BASE_URL") or os.getenv("OLLAMA_HOST")
        endpoint = (base_url or env_endpoint or _DEFAULT_ENDPOINT).rstrip("/")
        if endpoint not in _ALLOWED_ENDPOINTS and not self._api_key:
            raise ValueError("Ollama debe usar uno de los endpoints locales aprobados.")
        self._base_url = endpoint
        self._timeout = timeout

    def __call__(self, system_prompt: str, question: str) -> str:
        """Mantiene compatibilidad con el generador inyectable existente."""
        if self._api_key:
            try:
                return self._call_gemini(system_prompt, question)
            except Exception as exc:
                logger.debug("Gemini llamada directa fallo, cayendo a Ollama/deterministico: %s", exc)
        return self._call_ollama(system_prompt, question)

    def generate_sql(
        self,
        question: str,
        catalog: Sequence[Mapping[str, object]],
        system_prompt: str,
    ) -> str:
        """Prioriza la plantilla determinística certificada y usa el LLM para el resto."""
        try:
            return deterministic_sql(question, catalog)
        except ValueError:
            logger.debug(
                "La intención no coincide con el contrato determinístico; "
                "se consultará al modelo."
            )

        if self._api_key:
            feedback = ""
            for _ in range(2):
                try:
                    candidate = self._call_gemini(
                        f"{system_prompt}{feedback}", question
                    )
                    return _validated_model_sql(candidate, question, catalog)
                except Exception as exc:
                    feedback = f"\n\nCorrección obligatoria: {exc}"
                    logger.debug("Gemini devolvió un SQL no alineado: %s", exc)
            logger.warning(
                "Fallo al generar SQL con Gemini tras reintento. Intentando respaldo..."
            )

        feedback = ""
        for _ in range(2):
            try:
                candidate = self._call_ollama(
                    f"{system_prompt}{feedback}", question
                )
                return _validated_model_sql(candidate, question, catalog)
            except Exception as exc:
                feedback = f"\n\nCorrección obligatoria: {exc}"
        return deterministic_sql(question, catalog)

    def _call_gemini(self, system_prompt: str, question: str) -> str:
        import time
        from google import genai
        client = genai.Client(api_key=self._api_key)
        prompt = (
            f"{system_prompt}\n\n"
            f"Pregunta del usuario: {question}\n\n"
            f"Responde EXCLUSIVAMENTE con la sentencia SQL ejecutable en Trino (sin explicaciones ni bloques markdown adicionales):"
        )
        candidates = [
            self._gemini_model,
            "gemini-3.8-flash",
            "gemini-3.8-flash-lite",
            "gemini-3.7-flash",
            "gemini-3.1-flash-lite",
            "gemini-3.1-flash-lite-preview",
            "gemini-3.5-flash-lite",
            "gemini-flash-lite-latest",
            "gemini-2.5-flash-lite",
            "gemini-flash-latest",
        ]
        seen: set[str] = set()
        unique_candidates = [c for c in candidates if c and not (c in seen or seen.add(c))]
        last_err: Exception | None = None
        for mod in unique_candidates:
            for attempt in range(2):
                try:
                    resp = client.models.generate_content(
                        model=mod,
                        contents=prompt,
                    )
                    if resp.text and resp.text.strip():
                        return resp.text.strip()
                except Exception as exc:
                    last_err = exc
                    if "503" in str(exc) or "UNAVAILABLE" in str(exc):
                        time.sleep(0.8)
                        continue
                    break
        if last_err is not None:
            raise last_err
        raise ValueError("Gemini devolvió una respuesta vacía.")

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


def _clean_sql_output(candidate: str) -> str:
    """Extrae el SQL puro de posibles bloques markdown o texto explicativo."""
    cleaned = candidate.strip()
    code_match = re.search(r"```(?:sql)?\s*([\s\S]*?)\s*```", cleaned, re.IGNORECASE)
    if code_match:
        cleaned = code_match.group(1).strip()
    else:
        select_match = re.search(r"(?:WITH|SELECT)\b[\s\S]+", cleaned, re.IGNORECASE)
        if select_match:
            cleaned = select_match.group(0).strip()
    if ";" in cleaned:
        cleaned = cleaned.split(";", 1)[0].strip()
    return cleaned


def validate_sql_alignment(question: str, sql: str) -> str | None:
    """Comprueba que el SQL conserve las dimensiones y el ranking pedidos.

    Devuelve un mensaje de corrección o ``None`` si la consulta es coherente.
    Es la red de seguridad tanto para el router determinístico como para el LLM:
    una pregunta de desglose nunca debe terminar en un total global.
    """
    normalized = question.casefold()
    try:
        query = sqlglot.parse_one(sql, read="trino")
    except sqlglot.errors.ParseError:
        return "La consulta SQL no es válida para Trino."

    grouped = _group_by_columns(query)
    requested = _requested_dimensions_for_validation(normalized)
    needs_grouping = bool(requested) or bool(_GROUPING_INTENT_RE.search(normalized))

    if needs_grouping and not grouped:
        return (
            "La pregunta pide un desglose por dimensión, pero la consulta no "
            "tiene GROUP BY."
        )
    if requested and grouped:
        for candidates in requested:
            if not any(candidate in grouped for candidate in candidates):
                return (
                    f"La consulta debe agrupar por {candidates[0]} porque la "
                    "pregunta lo solicita."
                )

    if " por " in normalized:
        tail = normalized.split(" por ", 1)[1]
        segments = [
            segment for segment in re.split(r"\b(?:y|e)\b|,", tail) if segment.strip()
        ]
        if len(segments) > 1 and len(grouped) < len(segments):
            return (
                "La pregunta pide más dimensiones de agrupación de las que "
                "incluye el GROUP BY."
            )

    columns = {column.name.casefold() for column in query.find_all(exp.Column)}
    if "ticket" in normalized and not (
        "ticket_promedio" in columns
        or (
            columns & {"venta_neta", "total_neto", "monto_neto"}
            and columns & {"pedidos_validos", "total_pedidos"}
        )
    ):
        return "La pregunta pide ticket promedio y la consulta no usa esa métrica."

    if (
        _RANKING_RE.search(normalized) or _SUPERLATIVE_QUERY_RE.search(normalized)
    ) and query.args.get("order") is None:
        return "La pregunta pide un ranking y la consulta no tiene ORDER BY."

    return None


def _validated_model_sql(
    candidate: str,
    question: str,
    catalog: Sequence[Mapping[str, object]],
) -> str:
    cleaned = _clean_sql_output(candidate)
    validated = validate_query(cleaned, catalog)
    alignment_error = validate_sql_alignment(question, validated)
    if alignment_error:
        raise ValueError(alignment_error)
    return validated


def _group_by_columns(query: exp.Select) -> set[str]:
    group = query.args.get("group")
    if not isinstance(group, exp.Group):
        return set()
    columns: set[str] = set()
    for expression in group.expressions:
        if isinstance(expression, exp.Literal):
            # GROUP BY 1: no podemos inferir esa dimensión desde el AST, pero
            # otras columnas del mismo GROUP BY siguen siendo verificables.
            continue
        for column in expression.find_all(exp.Column):
            columns.add(column.name.casefold())
        if isinstance(expression, exp.Column):
            columns.add(expression.name.casefold())
    return columns


def _requested_dimensions_for_validation(
    question: str,
) -> list[tuple[str, ...]]:
    """Detecta todas las dimensiones mencionadas en preguntas de desglose."""
    if not (
        _GROUPING_INTENT_RE.search(question)
        or _RANKING_RE.search(question)
        or _SUPERLATIVE_QUERY_RE.search(question)
    ):
        return []
    found: list[tuple[str, ...]] = []
    for keywords, candidates in _DIMENSION_SYNONYMS:
        if any(
            re.search(rf"\b{re.escape(keyword)}\b", question)
            for keyword in keywords
        ):
            found.append(candidates)
    return found


def deterministic_sql(
    question: str,
    catalog: Sequence[Mapping[str, object]],
) -> str:
    """Resuelve conteos, sumas, promedios y agrupaciones simples con SQLGlot."""
    normalized_question = question.casefold()
    unsupported_detail = (
        "compara",
        "comparar",
        "versus",
        " vs ",
        " contra ",
        "diferencia",
        "cruza",
        "tendencia",
        "trend",
        " en enero",
        " en febrero",
        " en marzo",
        " en abril",
        " en mayo",
        " en junio",
        " en julio",
        " en agosto",
        " en septiembre",
        " en octubre",
        " en noviembre",
        " en diciembre",
        *_UNSUPPORTED_TIME_TERMS,
    )
    if any(word in f" {normalized_question} " for word in unsupported_detail):
        raise ValueError("La intención requiere una plantilla que aún no está aprobada.")

    year_match = re.search(r"\b((?:19|20)\d{2})\b", normalized_question)
    year_val = year_match.group(1) if year_match else None
    tables = _allowed_tables(catalog)
    table = _select_table(normalized_question, tables)
    table_name, columns = table

    dimension = _dimension_requested(normalized_question)
    dimension_column = None
    if dimension:
        dimension_column = next((column for column in dimension if column in columns), None)
        if dimension_column is None:
            raise ValueError("La dimensión solicitada no está disponible en la tabla activa.")

    # No devolver un total silencioso cuando la pregunta pide un desglose o un
    # ranking sobre una dimensión que la plantilla no reconoce.
    if dimension_column is None and (
        _GROUPING_INTENT_RE.search(normalized_question)
        or _RANKING_RE.search(normalized_question)
        or _SUPERLATIVE_QUERY_RE.search(normalized_question)
    ):
        raise ValueError(
            "La pregunta pide una agrupación, pero la dimensión no está "
            "certificada en la plantilla determinística."
        )

    if (
        any(term in normalized_question for term in _UNSUPPORTED_METRIC_TERMS)
        and _explicit_metric(normalized_question, columns) is None
    ):
        raise ValueError(
            "La métrica solicitada no está cubierta por la plantilla determinística."
        )

    operation, metric = _resolve_operation(normalized_question, columns)
    top_n = _requested_top_n(normalized_question) if dimension_column else None
    descending = not re.search(
        r"\b(?:peor(?:es)?|menor(?:es)?|menos)\b", normalized_question
    )

    if operation == "COUNT":
        metric_alias = "total_registros"
        expression = f"COUNT(*) AS {metric_alias}"
    else:
        metric_alias = (
            metric if dimension_column else f"{operation.casefold()}_{metric}"
        )
        expression = f"{operation}({metric}) AS {metric_alias}"

    projection = expression
    if dimension_column:
        projection = f"{dimension_column} AS {dimension_column}, {expression}"

    query = sqlglot.parse_one(f"SELECT {projection} FROM {table_name}", read="trino")
    filter_term = _category_filter(normalized_question, columns)
    if filter_term:
        column, value = filter_term
        query = query.where(
            exp.EQ(this=exp.column(column), expression=exp.Literal.string(value))
        )
    if year_val:
        if "anio" in columns:
            query = query.where(
                exp.EQ(this=exp.column("anio"), expression=exp.Literal.number(int(year_val)))
            )
        elif "año" in columns:
            query = query.where(
                exp.EQ(this=exp.column("año"), expression=exp.Literal.number(int(year_val)))
            )
        elif "fecha" in columns:
            query = query.where(
                exp.Like(this=exp.column("fecha"), expression=exp.Literal.string(f"{year_val}%"))
            )
    if dimension_column:
        query = query.group_by(exp.column(dimension_column))
        if top_n:
            query = query.order_by(exp.Ordered(this=exp.column(metric_alias), desc=descending))
            query = query.limit(top_n)
        elif dimension_column in ("mes", "anio", "año", "dia", "fecha"):
            # Las series temporales deben conservar el orden cronológico.
            query = query.order_by(exp.Ordered(this=exp.column(dimension_column), desc=False))
        else:
            query = query.order_by(exp.Ordered(this=exp.column(metric_alias), desc=descending))
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


def _select_table(
    question: str,
    tables: list[tuple[str, set[str]]],
) -> tuple[str, set[str]]:
    """Prioriza tablas Gold certificadas y resuelve la tabla de la intención."""
    explicit = next(
        (entry for entry in tables if entry[0].casefold() in question),
        None,
    )
    if explicit:
        return explicit

    if _SALES_RE.search(question):
        for preferred in ("gold.fact_ventas", "gold.fct_ventas_diarias"):
            table = next(
                (entry for entry in tables if entry[0].casefold() == preferred),
                None,
            )
            if table:
                return table
        table = next(
            (
                entry
                for entry in tables
                if entry[0].casefold().startswith("gold.")
                and _sales_metric(entry[1]) is not None
            ),
            None,
        )
        if table:
            return table
        table = next(
            (entry for entry in tables if "transaccion" in entry[0].casefold()),
            None,
        )
        if table:
            return table

    hints = (
        (("cliente", "clientes"), ("cliente",)),
        (("soporte", "satisfaccion", "satisfacción"), ("ticket", "soporte", "helpdesk")),
        (("presupuesto", "meta"), ("presupuesto", "meta")),
        (("costo", "gasto"), ("costo", "gasto")),
        (("transaccion", "transacción"), ("transaccion", "transacción")),
    )
    for words, markers in hints:
        if any(word in question for word in words):
            table = next(
                (
                    entry
                    for entry in tables
                    if any(marker in entry[0].casefold() for marker in markers)
                ),
                None,
            )
            if table:
                return table

    # Si la pregunta nombra una métrica explícita, elegir la tabla que la expone
    # (p. ej. "ticket promedio" debe ir a gold.fact_ventas, no a una tabla de soporte).
    for phrase, candidates in _METRIC_SYNONYMS:
        if phrase not in question:
            continue
        table = next(
            (
                entry
                for entry in tables
                if any(candidate in entry[1] for candidate in candidates)
            ),
            None,
        )
        if table:
            return table

    numeric_tables = [entry for entry in tables if entry[1] & _SUPPORTED_NUMERIC_COLUMNS]
    if len(numeric_tables) == 1:
        return numeric_tables[0]
    if len(tables) == 1:
        return tables[0]
    raise ValueError("El fallback no encontró una tabla silver/gold permitida.")


def _sales_metric(columns: set[str]) -> str | None:
    for column in ("venta_neta", "total_neto", "monto_neto", "monto", "importe", "valor"):
        if column in columns:
            return column
    return None


def _explicit_metric(question: str, columns: set[str]) -> str | None:
    """Devuelve la métrica nombrada explícitamente, si existe en la tabla."""
    for phrase, candidates in _METRIC_SYNONYMS:
        if phrase in question:
            for candidate in candidates:
                if candidate in columns:
                    return candidate
    return None


def _resolve_operation(
    question: str,
    columns: set[str],
) -> tuple[str, str | None]:
    if any(term in question for term in _COUNT_ROW_TERMS):
        return "COUNT", None

    # La métrica explícita manda sobre la detección genérica de "venta(s)".
    # Ej.: "canal de venta con mejor ticket promedio" debe usar ticket_promedio,
    # no venta_neta.
    explicit_metric = _explicit_metric(question, columns)
    if explicit_metric is not None:
        uses_average = any(
            word in question for word in ("promedio", "average", "avg", "media")
        )
        if uses_average or explicit_metric in (
            "ticket_promedio",
            "tasa_devolucion",
            "calificacion_satisfaccion",
        ):
            return "AVG", explicit_metric
        return "SUM", explicit_metric

    if "pedido" in question:
        if "pedidos_validos" in columns:
            return "SUM", "pedidos_validos"
        if "total_pedidos" in columns:
            return "SUM", "total_pedidos"
    if _SALES_RE.search(question):
        metric = _sales_metric(columns)
        if metric is None:
            raise ValueError("La tabla activa no expone una métrica de ventas canónica.")
        if any(word in question for word in ("promedio", "average", "avg", "media")):
            return "AVG", metric
        return "SUM", metric
    if re.search(r"\bcu[aá]nt[oa]s?\b", question):
        return "COUNT", None
    if any(word in question for word in ("promedio", "average", "avg", "media")):
        return "AVG", _numeric_column(question, columns)
    if any(
        word in question
        for word in ("suma", "sum", "total", "sumatoria", "agregado")
    ):
        return "SUM", _numeric_column(question, columns)
    raise ValueError("La intención no coincide con una plantilla analítica aprobada.")


def _numeric_column(question: str, columns: set[str]) -> str:
    explicit = _explicit_metric(question, columns)
    if explicit is not None:
        return explicit

    if _SALES_RE.search(question):
        metric = _sales_metric(columns)
        if metric:
            return metric

    for column in sorted(_SUPPORTED_NUMERIC_COLUMNS, key=len, reverse=True):
        if column in columns and re.search(rf"\b{re.escape(column)}\b", question):
            return column

    candidates = columns & _SUPPORTED_NUMERIC_COLUMNS
    if len(candidates) == 1:
        return next(iter(candidates))
    raise ValueError("La columna métrica no está indicada de forma inequívoca.")


def _dimension_requested(question: str) -> tuple[str, ...] | None:
    found: list[tuple[str, ...]] = []
    if " por " in question:
        tail = question.split(" por ", 1)[1]
        segments = [segment for segment in re.split(r"\b(?:y|e)\b|,", tail) if segment.strip()]
        unrecognized: list[str] = []
        for segment in segments:
            segment_found = False
            for keywords, candidates in _DIMENSION_SYNONYMS:
                if any(
                    re.search(rf"\b{re.escape(keyword)}\b", segment)
                    for keyword in keywords
                ):
                    found.append(candidates)
                    segment_found = True
                    break
            if not segment_found:
                unrecognized.append(segment.strip())
        if len(segments) > 1 and unrecognized:
            raise ValueError(
                "Hay una dimensión de agrupación que no está certificada: "
                f"{unrecognized[0]}."
            )

    if not found and (
        _RANKING_RE.search(question)
        or _SUPERLATIVE_QUERY_RE.search(question)
        or _GROUPING_INTENT_RE.search(question)
    ):
        for keywords, candidates in _DIMENSION_SYNONYMS:
            if any(re.search(rf"\b{re.escape(keyword)}\b", question) for keyword in keywords):
                found.append(candidates)
                break

    unique: list[tuple[str, ...]] = []
    for candidates in found:
        if candidates not in unique:
            unique.append(candidates)
    if len(unique) > 1:
        raise ValueError("El fallback solo admite una dimensión de agrupación por consulta.")
    return unique[0] if unique else None


def _requested_top_n(question: str) -> int | None:
    match = re.search(r"\b(?:top|primeros?|primeras?)\s+(\d+)\b", question)
    if match is None:
        match = re.search(r"\b(\d+)\s+(?:mejores|mayores|principales)\b", question)
    if match is None:
        match = re.search(
            r"\b(\d+)\s+\w+\s+con\s+(?:mayor|menor|mejor|peor)\b", question
        )
    if match is None:
        # Preguntas del tipo "¿qué región vendió más?", "¿cuál es el canal con
        # mejor...?" o "¿qué tienda vende menos?" esperan un único ganador.
        if _SUPERLATIVE_QUERY_RE.search(question) or re.search(
            r"\b(?:mejor|peor|mayor|menor|menos)\b", question
        ):
            return 1
        return None
    return min(max(int(match.group(1)), 1), 100)


def _category_filter(question: str, columns: set[str]) -> tuple[str, str] | None:
    """Aplica solo filtros de categoría con valores precertificados."""
    options: list[tuple[str, dict[str, str]]] = []
    if "region_id" in columns:
        options.append(
            ("region_id", {"norte": "REG-NORTE", "sur": "REG-SUR", "centro": "REG-CENTRO"})
        )
    elif "region" in columns:
        options.append(("region", {"norte": "NORTE", "sur": "SUR", "centro": "CENTRO"}))
    if "canal_venta" in columns:
        canal_values = {"online": "ONLINE", "partner": "PARTNER"}
        if re.search(r"\bcanal\s+tienda\b", question):
            canal_values["canal tienda"] = "TIENDA"
        options.append(("canal_venta", canal_values))
    if "estado" in columns:
        options.append(("estado", {"cerrado": "CERRADO", "abierto": "ABIERTO"}))

    matches = [
        (column, values[value])
        for column, values in options
        for value in values
        if re.search(rf"\b{re.escape(value)}\b", question)
    ]
    if len(matches) > 1:
        raise ValueError("El fallback no admite varios filtros en una consulta.")
    return matches[0] if matches else None

