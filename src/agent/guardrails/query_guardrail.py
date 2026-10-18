"""Valida consultas de lectura contra el catálogo de Trino."""

from collections.abc import Mapping, Sequence

import sqlglot
from sqlglot import exp


class QueryValidationError(ValueError):
    """La consulta no cumple el contrato de solo lectura del catálogo."""


def validate_query(sql: str, catalog: Sequence[Mapping[str, object]]) -> str:
    """Validate one Trino SELECT and add the required row limit."""
    if not catalog:
        raise QueryValidationError("El catálogo de Trino no está disponible.")

    try:
        statements = sqlglot.parse(sql, read="trino")
    except sqlglot.errors.ParseError as error:
        raise QueryValidationError("La consulta SQL no es válida para Trino.") from error

    if len(statements) != 1 or statements[0] is None:
        raise QueryValidationError("Solo se permite una consulta SQL por solicitud.")
    query = statements[0]
    if not isinstance(query, exp.Select):
        raise QueryValidationError("Solo se permiten consultas SELECT de lectura.")
    if any((join.args.get("kind") or "").upper() == "CROSS" for join in query.find_all(exp.Join)):
        raise QueryValidationError("No se permiten CROSS JOIN sin condición de enlace.")

    tables: dict[str, set[str]] = {}
    for entry in catalog:
        table_name = entry.get("table")
        columns = entry.get("columns")
        if not isinstance(table_name, str) or not isinstance(columns, (list, tuple, set)):
            continue
        normalized = _normalize_name(table_name)
        if normalized and columns:
            tables[normalized] = {str(column).casefold() for column in columns}
    if not tables:
        raise QueryValidationError("El catálogo no contiene tablas con columnas.")

    table_aliases: dict[str, str] = {}
    for table in query.find_all(exp.Table):
        name = _normalize_name(".".join(part.name for part in table.parts))
        if name not in tables:
            raise QueryValidationError(f"La tabla '{name}' no existe en el catálogo permitido.")
        table_aliases[(table.alias or table.name).casefold()] = name

    if not table_aliases:
        raise QueryValidationError("La consulta debe leer una tabla del catálogo permitido.")

    selected_aliases = {
        projection.alias.casefold()
        for projection in query.expressions
        if isinstance(projection, exp.Alias) and projection.alias
    }
    for column in query.find_all(exp.Column):
        if column.is_star:
            continue
        if not column.table and column.name.casefold() in selected_aliases:
            continue
        if column.table:
            table_name = table_aliases.get(column.table.casefold())
            if table_name is None or column.name.casefold() not in tables[table_name]:
                raise QueryValidationError(f"La columna '{column.sql()}' no existe en el catálogo permitido.")
            continue
        if not all(column.name.casefold() in tables[name] for name in table_aliases.values()):
            raise QueryValidationError(f"La columna '{column.name}' no es válida en todas las tablas consultadas.")

    if query.args.get("limit") is None:
        query = query.limit(1000)
    return query.sql(dialect="trino")


def _normalize_name(name: str) -> str:
    return ".".join(part.strip('"`').casefold() for part in name.split(".") if part)
