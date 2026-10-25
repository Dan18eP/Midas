"""Enruta SQL a Gemini Cloud API (u Ollama local) con fallback deterministico SQLGlot."""

from __future__ import annotations

import json
import logging
import os
import re
from collections.abc import Mapping, Sequence
from http.client import HTTPException
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
    "meta_ingreso_presupuestada",
    "costo_operativo_fijo",
    "gasto_marketing",
    "tiempo_respuesta_minutos",
    "calificacion_satisfaccion",
    "salario",
    "sueldo",
    "edad",
    "horas",
    "horas_trabajadas",
    "stock",
    "cantidad",
    "precio",
    "costo",
    "valor",
    "total",
    "subtotal",
    "importe",
    "rating",
    "puntuacion",
    "csat",
    "temperatura",
    "peso",
    "duracion",
    "unidades",
    "data_value",
    "magnitude",
    "period",
}


def _sanitize_echarts_option(
    option: dict[str, object] | None,
    rows: list[dict[str, object]],
) -> dict[str, object] | None:
    """Valida y sanea la configuración de ECharts para evitar anomalías visuales:
    1. Si todas las barras tienen valor unitario 1 (listado no agregado), anula el gráfico para usar vista tabla.
    2. Evita solapamiento de etiquetas en el tope de las barras reemplazando '{b}' por '{c}'.
    3. Asegura containLabel y padding inferior en el grid.
    """
    if not option or not isinstance(option, dict):
        return None

    series_list = option.get("series")
    if not isinstance(series_list, list) or not series_list:
        return option

    for s in series_list:
        if not isinstance(s, dict):
            continue

        # Validar si las barras no tienen variación métrica y son meros placeholders
        data = s.get("data")
        if isinstance(data, list) and len(data) > 1:
            raw_vals = [d.get("value") if isinstance(d, dict) else d for d in data]
            if all(v in (1, 1.0, "1", 0, 0.0, "0") for v in raw_vals):
                return None

        # Corregir solapamiento de nombres en la parte superior de las barras
        label = s.get("label")
        if isinstance(label, dict):
            fmt = str(label.get("formatter", ""))
            if "{b}" in fmt:
                label["formatter"] = "{c}"
            label["distance"] = 5

    # Asegurar márgenes y no recorte de etiquetas en el eje X
    if "grid" not in option or not isinstance(option.get("grid"), dict):
        option["grid"] = {"left": "4%", "right": "4%", "bottom": "25%", "containLabel": True}
    else:
        option["grid"]["containLabel"] = True

    return option


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
        if api_key is not None:
            self._api_key = api_key
        elif os.getenv("PYTEST_CURRENT_TEST") and not os.getenv("TEST_WITH_GEMINI"):
            # En suites de pruebas unitarias aisladas sin mock de genai, no contaminar con GEMINI_API_KEY ambiental
            self._api_key = None
        else:
            self._api_key = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
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
        inference_mode: str | None = None,
    ) -> str:
        """Usa el proveedor de inferencia según la soberanía de datos del usuario:
        - 'local': Strictly Qwen 2.5: 3B local en Ollama (Zero-Trust, confidencialidad total).
        - 'cloud': Gemini Cloud API Key (alto rendimiento).
        - 'auto' / None: Gemini si hay API key, con fallback local.
        """
        mode = (inference_mode or "auto").lower()

        # Si el usuario eligió modo local estricto Zero-Trust (confidencial)
        if mode in ("local", "zero-trust", "confidential"):
            try:
                candidate = self._call_ollama(system_prompt, question)
                candidate = _clean_sql_output(candidate)
                return validate_query(candidate, catalog)
            except Exception as exc:
                logger.warning("Fallo en Ollama local Qwen: %s. Empleando fallback determinístico de catálogo...", exc)
                return deterministic_sql(question, catalog)

        # Modo Cloud o Auto con API Key
        if mode in ("cloud", "gemini") or (mode == "auto" and self._api_key):
            if self._api_key:
                try:
                    candidate = self._call_gemini(system_prompt, question)
                    candidate = _clean_sql_output(candidate)
                    return validate_query(candidate, catalog)
                except Exception as exc:
                    logger.warning("Fallo al generar SQL con Gemini Cloud: %s. Intentando respaldo local...", exc)

        # Fallback a Ollama y determinístico
        try:
            candidate = self._call_ollama(system_prompt, question)
            candidate = _clean_sql_output(candidate)
            return validate_query(candidate, catalog)
        except Exception:
            return deterministic_sql(question, catalog)

    def generate_storytelling(
        self,
        question: str,
        sql: str,
        rows: Sequence[Mapping[str, object]],
        inference_mode: str | None = None,
    ) -> dict[str, object]:
        """Genera narrativa ejecutiva y configuración ECharts adaptada a la intención del usuario y datos reales."""
        system_prompt = (
            "Eres el copiloto analítico y director de BI de Midas Lakehouse para cualquier materia o dominio de datos (recursos humanos, salud, logística, operaciones, finanzas, inventarios, ventas, educación, etc.). "
            "Tu objetivo es sintetizar los resultados reales devueltos por Trino respondiendo con precisión a la pregunta del usuario. "
            "Genera un objeto JSON estricto con dos claves:\n"
            "1. 'narrative': Markdown profesional con encabezados ('## Hallazgo principal', '## Análisis de Tendencia', '## Recomendación estratégica') explicando los datos reales sin inventar cifras.\n"
            "2. 'echarts_option': Configuración completa y válida de Apache ECharts adaptada a la intención (ej: 'pie'/'donut' si pidió pastel/distribución, 'line'/'area' si es temporal/tendencia, 'bar' si es comparativo/ranking, o 'scatter'). Usa datos reales de las filas.\n"
            "REGLAS ESTRICTAS DE VISUALIZACIÓN:\n"
            "- Si el conjunto de datos no tiene métricas numéricas agregadas (solo lista nombres, entidades, o cada fila representa una unidad aislada con valor 1), NO generes un gráfico de barras idénticas donde todas las barras miden 1. En ese caso devuelve 'echarts_option': null para que la interfaz presente los datos en formato de Tabla interactiva estructurada.\n"
            "- En gráficos de barras ('bar'), las barras DEBEN representar un valor métrico real cuantificable. En 'series[].label', NUNCA uses 'formatter': '{b}' porque el nombre de la categoría ya está en el eje X y provoca colisiones ilegibles en la parte superior. Si usas label superior, usa únicamente 'formatter': '{c}' (el valor numérico) con position: 'top'.\n"
            "- En el eje X (xAxis), rota las etiquetas entre 30 y 45 grados y configura grid: { bottom: '25%', containLabel: true } para evitar solapamientos.\n"
            "Responde ÚNICAMENTE el objeto JSON sin texto antes ni después."
        )
        sample_rows = list(rows)[:25]
        prompt = (
            f"Pregunta del usuario: {question}\n"
            f"SQL ejecutado en Trino: {sql}\n"
            f"Datos retornados (muestra de hasta 25 filas): {json.dumps(sample_rows, ensure_ascii=False, default=str)}\n"
        )
        mode = (inference_mode or "auto").lower()

        # Try Cloud (Gemini) if configured
        if (mode in ("cloud", "gemini") or mode == "auto") and self._api_key:
            try:
                raw = self._call_gemini_raw(f"{system_prompt}\n\n{prompt}")
                parsed = self._extract_json(raw)
                if parsed and isinstance(parsed.get("narrative"), str):
                    if isinstance(parsed.get("echarts_option"), dict):
                        parsed["echarts_option"] = _sanitize_echarts_option(parsed["echarts_option"], sample_rows)
                    return parsed
            except Exception as exc:
                logger.warning("Fallo en generación de storytelling con Gemini: %s", exc)

        # Try Local (Ollama)
        try:
            raw = self._call_ollama(system_prompt, prompt)
            parsed = self._extract_json(raw)
            if parsed and isinstance(parsed.get("narrative"), str):
                if isinstance(parsed.get("echarts_option"), dict):
                    parsed["echarts_option"] = _sanitize_echarts_option(parsed["echarts_option"], sample_rows)
                return parsed
        except Exception as exc:
            logger.debug("Ollama storytelling no disponible: %s", exc)

        return {}

    def _extract_json(self, raw: str) -> dict[str, object] | None:
        """Extrae y parsea JSON de respuestas con bloques de código markdown o texto."""
        text = raw.strip()
        match = re.search(r"```(?:json)?\s*(\{[\s\S]*?\})\s*```", text)
        if match:
            text = match.group(1).strip()
        else:
            first_brace = text.find("{")
            last_brace = text.rfind("}")
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                text = text[first_brace : last_brace + 1].strip()
        try:
            data = json.loads(text)
            if isinstance(data, dict):
                return data
        except Exception:
            pass
        return None

    def _call_gemini(self, system_prompt: str, question: str) -> str:
        prompt = (
            f"{system_prompt}\n\n"
            f"Pregunta del usuario: {question}\n\n"
            f"Regla de análisis de rankings: Si el usuario solicita un 'top 10', 'top 5', 'mejores' o ranking sobre una tabla que no tiene columna monetaria o de ventas (por ejemplo una tabla de clientes o productos), agrupa por la dimensión categórica más representativa (como country, city, company, category) y totaliza con COUNT(*) ordenado descendente con LIMIT 10 (ej: SELECT country, count(*) AS total_clientes FROM table GROUP BY country ORDER BY total_clientes DESC LIMIT 10).\n\n"
            f"Responde EXCLUSIVAMENTE con la sentencia SQL ejecutable en Trino (sin explicaciones ni bloques markdown adicionales):"
        )
        return self._call_gemini_raw(prompt)

    def _call_gemini_raw(self, prompt: str) -> str:
        import time
        from google import genai
        client = genai.Client(api_key=self._api_key)
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
            "gemini-2.5-flash",
            "gemini-2.0-flash",
            "gemini-1.5-flash",
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


def deterministic_sql(
    question: str,
    catalog: Sequence[Mapping[str, object]],
) -> str:
    """Genera SQL determinístico adaptativo para Trino sobre cualquier esquema de datos."""
    normalized_question = question.casefold()

    if any(word in normalized_question for word in ("compara", "comparar", "versus", " contra ", "cruza", "tendencia", "trend", "explora")):
        raise ValueError("La intención requiere una plantilla que aún no está aprobada.")

    tables = _allowed_tables(catalog)
    if not tables:
        raise ValueError("El catálogo no contiene tablas permitidas.")

    # 1. Identificar la tabla objetivo (por mención en la pregunta o la primera disponible)
    table = next(
        (entry for entry in tables if entry[0].casefold() in normalized_question),
        None,
    )
    if table is None:
        hints = {
            "transaccion": ("transaccion", "venta", "ingreso", "pedido"),
            "presupuesto": ("presupuesto", "meta"),
            "costos": ("costo", "gasto"),
            "tickets": ("ticket", "soporte", "satisfaccion", "satisfacción"),
            "proveedor": ("proveedor", "supplier", "compra"),
            "bodega": ("bodega", "warehouse", "stock", "inventario"),
            "riwi": ("riwi", "supply"),
        }
        for marker, words in hints.items():
            if any(word in normalized_question for word in words):
                table = next((entry for entry in tables if marker in entry[0].casefold()), None)
                if table:
                    break
    if table is None:
        table = tables[0]

    table_name, columns = table

    # 2. Si el usuario pide resumir o explorar los datos directamente
    is_summary_request = any(
        w in normalized_question
        for w in ("resum", "muestr", "explor", "primeros", "ver datos", "que datos", "qué datos")
    ) and not any(w in normalized_question for w in ("suma", "total", "promedio", "cuánt", "cuant"))

    if is_summary_request:
        return validate_query(f"SELECT * FROM {table_name} LIMIT 20", catalog)

    # 3. Detectar si hay intención de agrupación (" por ")
    group_col = None
    if " por " in normalized_question:
        after_por = normalized_question.split(" por ", 1)[1].strip()
        tokens = re.findall(r"[a-záéíóúñ_]+", after_por)
        for token in tokens:
            matched_col = next(
                (c for c in columns if token in c or c in token),
                None,
            )
            if matched_col:
                group_col = matched_col
                break

    # Si no se detectó por token, buscar columnas categóricas comunes mencionadas
    if not group_col and " por " in normalized_question:
        cat_candidates = [
            c for c in columns
            if any(k in c for k in ("region", "ciudad", "bodega", "proveedor", "producto", "categoria", "canal", "tienda", "estado", "warehouse", "supplier", "category"))
        ]
        if cat_candidates:
            group_col = cat_candidates[0]

    # Si es solicitud de ranking / "top" sin agrupación explícita
    if not group_col and any(w in normalized_question for w in ("top 10", "top 5", "top", "ranking", "mejores", "principales")):
        cat_candidates = [
            c for c in columns
            if any(k in c.lower() for k in ("country", "pais", "ciudad", "city", "company", "empresa", "categoria", "category", "region", "canal"))
        ]
        if cat_candidates:
            group_col = cat_candidates[0]

    # 4. Determinar la operación de agregación
    if any(word in normalized_question for word in ("promedio", "average", "avg")):
        operation = "AVG"
    elif any(word in normalized_question for word in ("cuánt", "cuant", "cuenta", "count", "registros", "number of", "cantidad de pedidos")):
        operation = "COUNT"
    else:
        operation = "SUM"

    # 5. Determinar la columna métrica
    num_col = None
    if operation != "COUNT":
        try:
            num_col = _numeric_column(normalized_question, columns)
        except Exception:
            # Fallback a la primera columna numérica detectable
            candidates = [
                c for c in columns
                if any(k in c for k in ("monto", "precio", "valor", "total", "costo", "cantidad", "stock", "horas", "unitprice", "quantity", "importe", "data_value", "magnitude"))
            ]
            if candidates:
                num_col = candidates[0]
            else:
                operation = "COUNT"

    # 6. Construir la expresión analítica
    if operation == "COUNT":
        agg_expr = "COUNT(*) AS total_registros"
    else:
        agg_expr = f"{operation}({num_col}) AS {operation.lower()}_{num_col}"

    year_match = re.search(r"\b((?:19|20)\d{2})\b", normalized_question)
    year_val = year_match.group(1) if year_match else None

    # Consulta agrupada
    if group_col:
        sql = f"SELECT {group_col}, {agg_expr} FROM {table_name}"
    else:
        sql = f"SELECT {agg_expr} FROM {table_name}"

    query = sqlglot.parse_one(sql, read="trino")

    # Filtros temporales
    if year_val:
        if "anio" in columns:
            query = query.where(exp.EQ(this=exp.column("anio"), expression=exp.Literal.number(int(year_val))))
        elif "año" in columns:
            query = query.where(exp.EQ(this=exp.column("año"), expression=exp.Literal.number(int(year_val))))
        elif "fecha" in columns:
            query = query.where(exp.Like(this=exp.column("fecha"), expression=exp.Literal.string(f"{year_val}%")))

    # Filtro categórico adicional
    filter_term = _category_filter(normalized_question, columns)
    if filter_term:
        col, val = filter_term
        query = query.where(exp.EQ(this=exp.column(col), expression=exp.Literal.string(val)))

    if group_col:
        query = query.group_by(exp.column(group_col)).order_by(exp.var("2"), desc=True).limit(20)

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
        "ventas": "monto",
        "ingreso": "monto",
        "ingresos": "monto",
        "revenue": "monto",
        "costos": "costo_operativo_fijo",
        "gastos": "gasto_marketing",
        "satisfaccion": "calificacion_satisfaccion",
        "satisfacción": "calificacion_satisfaccion",
        "salario": "salario",
        "sueldo": "sueldo",
        "horas": "horas",
        "stock": "stock",
        "inventario": "stock",
        "precio": "precio",
        "cantidad": "cantidad",
        "valor": "data_value",
        "data_value": "data_value",
        "magnitude": "magnitude",
        "period": "period",
    }
    for word, column in synonyms.items():
        if word in question:
            if column in columns:
                return column
            if word in ("venta", "ventas", "monto", "ingreso", "ingresos", "revenue", "valor") and "data_value" in columns:
                return "data_value"
    for column in sorted(columns, key=len, reverse=True):
        if column in columns and re.search(rf"\b{re.escape(column)}\b", question):
            return column
    for column in sorted(_SUPPORTED_NUMERIC_COLUMNS, key=len, reverse=True):
        if column in columns and re.search(rf"\b{re.escape(column)}\b", question):
            return column
    candidates = columns & _SUPPORTED_NUMERIC_COLUMNS
    if len(candidates) == 1:
        return candidates.pop()
    num_like = [c for c in columns if any(k in c for k in ("monto", "total", "precio", "costo", "salario", "sueldo", "horas", "cantidad", "stock", "valor", "data_value", "magnitude", "edad", "peso", "temp", "score", "rating"))]
    if len(num_like) == 1:
        return num_like[0]
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
