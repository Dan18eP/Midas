"""Midas - Motor de Aplicación de Políticas Zero-Trust sobre Consultas Trino.

Historia de Usuario: HU-GOV-03
Responsable: Sebastian Castiblanco (Governance Lead)

Aplica, antes de enviar la consulta a Trino, las dos políticas declaradas en
formato Ranger: enmascaramiento dinámico de columnas etiquetadas
`PII_CONFIDENCIAL` y filtrado por filas según el territorio del rol.

Mientras Apache Ranger no esté desplegado, este motor es quien hace cumplir
las políticas. Cuando Ranger y su plugin de Trino estén en pie, el mismo
archivo de política gobierna ambos caminos y este motor puede desactivarse con
`RANGER_LOCAL_ENFORCEMENT=false`.

**Postura de seguridad: falla cerrado.** Si una política restrictiva aplica y
el motor no puede garantizar su aplicación —SQL no parseable, o proyección con
`SELECT *` que impide enumerar las columnas a enmascarar—, la consulta se
rechaza en lugar de enviarse sin proteger.
"""

from __future__ import annotations

from dataclasses import dataclass, field
import logging
import os
import time
from typing import Any, Dict, List, Optional, Tuple

import sqlglot
from sqlglot import exp

from src.security_governance.atlas.pii_classifier import classify_column
from src.security_governance.ranger.policy_store import (
    MaskingRule,
    RowFilterRule,
    declared_roles,
    resolve_masking_rule,
    resolve_row_filter_rule,
)

logger = logging.getLogger("midas.governance.ranger.engine")

DEFAULT_DIALECT = "trino"


class PolicyEnforcementError(PermissionError):
    """La política aplica pero no puede garantizarse: la consulta se rechaza."""


@dataclass
class PolicyDecision:
    """Resultado de aplicar las políticas a una consulta."""

    role: Optional[str]
    original_sql: str
    effective_sql: str
    masked_columns: List[str] = field(default_factory=list)
    row_filter_applied: Optional[str] = None
    overhead_ms: float = 0.0

    @property
    def was_rewritten(self) -> bool:
        return self.effective_sql.strip() != self.original_sql.strip()

    def to_dict(self) -> Dict[str, Any]:
        return {
            "role": self.role,
            "masked_columns": self.masked_columns,
            "row_filter_applied": self.row_filter_applied,
            "overhead_ms": round(self.overhead_ms, 3),
            "rewritten": self.was_rewritten,
        }


def local_enforcement_enabled() -> bool:
    """Permite delegar en el plugin de Ranger cuando esté desplegado."""
    return os.getenv("RANGER_LOCAL_ENFORCEMENT", "true").strip().lower() != "false"


def ranger_trino_plugin_enabled() -> bool:
    """Indica si Trino tiene instalado el plugin de Ranger.

    Desactivado por defecto: sin el plugin, Trino desconoce los roles
    Zero-Trust y rechaza la cabecera `X-Trino-Role` con "Cannot set role".
    """
    return os.getenv("RANGER_TRINO_PLUGIN_ENABLED", "false").strip().lower() == "true"


# ---------------------------------------------------------------------------
# Enmascaramiento de columnas
# ---------------------------------------------------------------------------
def _projection_name(projection: exp.Expression) -> Optional[str]:
    """Nombre visible de una expresión proyectada."""
    if isinstance(projection, exp.Alias):
        return projection.alias
    if isinstance(projection, exp.Column):
        return projection.name
    return None


def _pii_category(column_name: str) -> Optional[str]:
    """Categoría de la taxonomía a la que pertenece la columna, si es sensible.

    Se reutiliza el clasificador de HU-GOV-02 para que la etiqueta que Atlas
    registra y la que Ranger enmascara provengan de la misma definición.
    """
    result = classify_column(column_name)
    return result.category.value if result else None


def _apply_masking(
    select: exp.Select,
    role: str,
    dialect: str,
) -> List[str]:
    """Sustituye en la proyección las columnas etiquetadas. Devuelve sus nombres.

    La regla se resuelve por categoría: cada tipo de dato tiene su propia
    expresión de enmascaramiento.
    """
    masked: List[str] = []

    for index, projection in enumerate(list(select.expressions)):
        if isinstance(projection, exp.Star):
            raise PolicyEnforcementError(
                "El rol tiene enmascaramiento de PII activo y la consulta usa 'SELECT *', "
                "lo que impide determinar qué columnas proteger. Enumera las columnas."
            )

        name = _projection_name(projection)
        if not name:
            continue

        category = _pii_category(name)
        if category is None:
            continue

        rule = resolve_masking_rule(role, category)
        if rule is None or rule.is_passthrough:
            continue

        source = projection.this if isinstance(projection, exp.Alias) else projection
        rendered = rule.render(source.sql(dialect=dialect))
        masked_expr = sqlglot.parse_one(rendered, read=dialect)
        select.expressions[index] = exp.alias_(masked_expr, name)
        masked.append(name)

    return masked


# ---------------------------------------------------------------------------
# Filtrado por filas
# ---------------------------------------------------------------------------
def _referenced_tables(tree: exp.Expression) -> List[Tuple[Optional[str], str]]:
    """Pares (esquema, tabla) referenciados por la consulta."""
    tables = []
    for table in tree.find_all(exp.Table):
        tables.append((table.db or None, table.name))
    return tables


def _rule_covers_query(rule: RowFilterRule, tree: exp.Expression) -> bool:
    return any(rule.covers(schema, table) for schema, table in _referenced_tables(tree))


def _apply_row_filter(
    select: exp.Select,
    rule: RowFilterRule,
    dialect: str,
) -> str:
    """Añade el predicado de la política a la consulta."""
    condition = sqlglot.parse_one(rule.filter_expr, read=dialect)
    select.where(condition, append=True, copy=False)
    return rule.filter_expr


# ---------------------------------------------------------------------------
# Punto de entrada
# ---------------------------------------------------------------------------
def warm_up() -> None:
    """Precarga políticas y motor de SQL al importar el módulo.

    Sin esto, la primera consulta del día paga la lectura de los archivos de
    política y la inicialización de sqlglot —medido en ~90 ms—, muy por encima
    del presupuesto de 15 ms por consulta que exige CA-3. Al ejecutarse en el
    import, ese costo lo absorbe el arranque del contenedor.
    """
    try:
        for role in declared_roles():
            resolve_masking_rule(role, "EMAIL")
            resolve_row_filter_rule(role)
        sqlglot.parse_one("SELECT 1 FROM t WHERE a = 1", read=DEFAULT_DIALECT).sql(
            dialect=DEFAULT_DIALECT
        )
    except Exception as exc:  # noqa: BLE001 - el precalentamiento nunca debe romper el arranque
        logger.warning("No se pudo precalentar el motor de políticas: %s", exc)


def apply_policies(
    sql: str,
    role: Optional[str],
    *,
    dialect: str = DEFAULT_DIALECT,
) -> PolicyDecision:
    """Devuelve la consulta efectiva tras aplicar las políticas del rol.

    Sin rol, o sin reglas que apliquen, la consulta se devuelve intacta.
    """
    started = time.perf_counter()
    decision = PolicyDecision(role=role, original_sql=sql, effective_sql=sql)

    if not role or not local_enforcement_enabled():
        decision.overhead_ms = (time.perf_counter() - started) * 1000
        return decision

    masking_rule = resolve_masking_rule(role)
    row_filter_rule = resolve_row_filter_rule(role)

    needs_masking = masking_rule is not None and not masking_rule.is_passthrough
    needs_row_filter = row_filter_rule is not None and not row_filter_rule.is_unrestricted

    if not needs_masking and not needs_row_filter:
        decision.overhead_ms = (time.perf_counter() - started) * 1000
        return decision

    try:
        tree = sqlglot.parse_one(sql, read=dialect)
    except Exception as exc:  # noqa: BLE001 - falla cerrado ante SQL no parseable
        raise PolicyEnforcementError(
            f"No se pudo analizar la consulta para aplicar las políticas del rol '{role}': {exc}"
        ) from exc

    select = tree if isinstance(tree, exp.Select) else tree.find(exp.Select)
    if select is None:
        raise PolicyEnforcementError(
            f"La consulta no contiene una proyección sobre la que aplicar las políticas del rol '{role}'."
        )

    if needs_masking:
        decision.masked_columns = _apply_masking(select, role, dialect)

    if needs_row_filter and _rule_covers_query(row_filter_rule, tree):
        decision.row_filter_applied = _apply_row_filter(select, row_filter_rule, dialect)

    decision.effective_sql = tree.sql(dialect=dialect)
    decision.overhead_ms = (time.perf_counter() - started) * 1000

    if decision.was_rewritten:
        logger.info(
            "Políticas Zero-Trust aplicadas para '%s': columnas=%s filtro=%s (%.2f ms)",
            role,
            decision.masked_columns,
            decision.row_filter_applied,
            decision.overhead_ms,
        )

    return decision


# Se ejecuta al importar: el costo de arranque no lo paga la primera consulta.
warm_up()
