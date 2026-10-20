"""
Midas Query Engine - AST SQL Guardrails & Security Enforcement
Historia de Usuario: HU-BACK-02 (Trino Query Engine & Catálogos Iceberg/PG)
Responsable: Daniel Echeverría (Team Leader & Principal Backend Architect)
"""

import re
from typing import Optional, Set
import sqlglot
from sqlglot import exp


class SecurityGuardrailError(ValueError):
    """Excepción emitida cuando una consulta viola las políticas de seguridad o solo lectura."""
    pass


# Expresiones permitidas exclusivamente (Solo lectura y metadatos)
ALLOWED_ROOT_EXPRESSIONS = (
    exp.Select,
    exp.Describe,
    exp.Show,
    exp.Command,
)

# Patrones para enmascaramiento estricto de credenciales en logs y trazas
CREDENTIAL_PATTERNS = [
    (re.compile(r"(password\s*[:=]\s*['\"]?)([^'\"\s&]+)(['\"]?)", re.IGNORECASE), r"\1***MASKED***\3"),
    (re.compile(r"(secret[_-]?key\s*[:=]\s*['\"]?)([^'\"\s&]+)(['\"]?)", re.IGNORECASE), r"\1***MASKED***\3"),
    (re.compile(r"(access[_-]?key\s*[:=]\s*['\"]?)([^'\"\s&]+)(['\"]?)", re.IGNORECASE), r"\1***MASKED***\3"),
    (re.compile(r"(bearer\s+)([A-Za-z0-9_\-\.~+/]+=*)", re.IGNORECASE), r"\1***MASKED***"),
    (re.compile(r"(://[^:]+:)([^@]+)(@)", re.IGNORECASE), r"\1***MASKED***\3"),  # URLs con user:password@host
]


def mask_sensitive_credentials(text: str) -> str:
    """
    Elimina y enmascara cualquier contraseña, token, o clave secreta en cadenas de texto o trazas SQL.
    Garantiza Criterio de Aceptación 4: 'Cero fugas de credenciales en logs de ejecución'.
    """
    if not text:
        return text
    result = text
    for pattern, replacement in CREDENTIAL_PATTERNS:
        result = pattern.sub(replacement, result)
    return result


def enforce_limit_and_read_only(
    sql: str,
    default_limit: int = 1000,
    max_limit: int = 1000,
    dialect: str = "trino",
) -> str:
    """
    Analiza la consulta SQL a nivel de AST (Abstract Syntax Tree), valida que sea de solo lectura
    e inyecta o ajusta la cláusula LIMIT a un máximo de 1000 filas.
    
    :param sql: Sentencia SQL a validar y transformar.
    :param default_limit: Límite a inyectar si la consulta carece de LIMIT (default 1000).
    :param max_limit: Límite máximo permitido. Si el usuario pide un límite mayor, se ajusta a este valor.
    :param dialect: Dialecto SQL (por defecto 'trino').
    :return: SQL transformado con LIMIT aplicado.
    :raises SecurityGuardrailError: Si la consulta es inválida, múltiple, o contiene DDL/DML destructivo.
    """
    cleaned_sql = sql.strip().rstrip(";")
    if not cleaned_sql:
        raise SecurityGuardrailError("La consulta SQL no puede estar vacía.")

    # 1. Parsear con sqlglot en dialecto Trino
    try:
        statements = sqlglot.parse(cleaned_sql, read=dialect)
    except Exception as exc:
        masked_err = mask_sensitive_credentials(str(exc))
        raise SecurityGuardrailError(f"Error de sintaxis SQL para Trino: {masked_err}") from exc

    if not statements or statements[0] is None:
        raise SecurityGuardrailError("No se encontró ninguna sentencia SQL válida.")

    if len(statements) > 1:
        raise SecurityGuardrailError("Solo se permite ejecutar una única consulta por solicitud (prevención de SQL multi-statement).")

    statement = statements[0]

    # 2. Verificar que sea de solo lectura
    if not isinstance(statement, ALLOWED_ROOT_EXPRESSIONS):
        statement_type = type(statement).__name__
        raise SecurityGuardrailError(
            f"Operación no permitida: Solo se permiten consultas de lectura (SELECT, EXPLAIN, SHOW, DESCRIBE). "
            f"Tipo detectado: {statement_type}."
        )

    if isinstance(statement, exp.Command):
        cmd_text = str(statement.this).strip().upper()
        if not cmd_text.startswith("EXPLAIN"):
            raise SecurityGuardrailError(
                f"Comando no permitido: Solo se admiten sentencias EXPLAIN. Comando recibido: {cmd_text[:20]}"
            )

    # Bloquear explícitamente cualquier DDL/DML en subqueries o CTEs
    for node in statement.walk():
        if isinstance(node, (exp.Drop, exp.Delete, exp.Update, exp.Insert, exp.Alter, exp.TruncateTable, exp.Create, exp.Grant, exp.Revoke)):
            raise SecurityGuardrailError("Comando de mutación detectado y bloqueado por política de solo lectura.")

    # 3. Inyección o Ajuste de LIMIT para sentencias SELECT
    if isinstance(statement, exp.Select):
        existing_limit = statement.args.get("limit")
        if existing_limit is None:
            statement = statement.limit(default_limit)
        else:
            try:
                current_limit_val = int(existing_limit.expression.this)
                if current_limit_val > max_limit or current_limit_val < 0:
                    statement = statement.limit(max_limit)
            except (ValueError, AttributeError):
                statement = statement.limit(max_limit)

    return statement.sql(dialect=dialect)

