"""Construye un prompt para generar SQL de Trino según el catálogo activo."""

from collections.abc import Callable, Mapping, Sequence

from src.agent.guardrails.prompt_injection_shield import assert_safe_prompt
from src.agent.prompts.qwen_prompts import text_to_sql_system_prompt


class TextToSqlGenerator:
    """Genera SQL mediante una función de modelo inyectada."""

    def __init__(self, model: Callable[[str, str], str]) -> None:
        self._model = model

    def __call__(self, question: str, catalog: list[dict[str, object]]) -> str:
        """Solicita al modelo una consulta de lectura para Trino."""
        assert_safe_prompt(question)
        allowed_tables = _catalog_prompt(catalog)
        if not allowed_tables:
            raise ValueError("El catálogo de Trino no está disponible.")
        system_prompt = text_to_sql_system_prompt(allowed_tables)
        generate_sql = getattr(self._model, "generate_sql", None)
        if callable(generate_sql):
            return generate_sql(question, catalog, system_prompt)
        return self._model(system_prompt, question)


def _catalog_prompt(catalog: Sequence[Mapping[str, object]]) -> str:
    """Devuelve las tablas y columnas permitidas para el prompt."""
    lines = []
    for entry in catalog:
        table = entry.get("table")
        columns = entry.get("columns")
        if isinstance(table, str) and isinstance(columns, (list, tuple, set)) and columns:
            lines.append(f"{table}: {', '.join(sorted(str(column) for column in columns))}")
    return "\n".join(lines)
