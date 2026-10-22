"""Midas - Carga y Resolución de Políticas de Apache Ranger.

Historia de Usuario: HU-GOV-03
Responsable: Sebastian Castiblanco (Governance Lead)

Lee los archivos de política en formato nativo de Ranger (`policies/*.json`) y
resuelve, para un rol Zero-Trust dado, qué enmascaramiento y qué filtro de
filas le corresponden. Los mismos archivos se importan sin cambios en Ranger
Admin cuando el servicio esté desplegado.
"""

from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
import json
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence

POLICIES_DIR = Path(__file__).parent / "policies"
MASKING_POLICY_FILE = POLICIES_DIR / "masking_policy.json"
ROW_FILTER_POLICY_FILE = POLICIES_DIR / "row_filter_policy.json"

# Tipos de enmascaramiento de Ranger que el motor local sabe interpretar.
MASK_TYPE_NONE = "NONE"
MASK_TYPE_CUSTOM = "CUSTOM"
MASK_TYPE_HASH = "MASK_HASH"
MASK_TYPE_NULL = "MASK_NULL"

# Expresiones por defecto para los tipos que Ranger define sin `valueExpr`.
DEFAULT_MASK_EXPRESSIONS = {
    MASK_TYPE_HASH: "to_hex(sha256(to_utf8({col})))",
    MASK_TYPE_NULL: "CAST(NULL AS VARCHAR)",
}

# Mapeo de arquetipos universales a identidades declaradas en políticas nativas
ROLE_ALIASES: Dict[str, str] = {
    "data_owner": "director_general",
    "admin": "director_general",
    "restricted_operator": "gerente_norte",
    "scoped_operator": "gerente_norte",
    "compliance_auditor": "analista_externo",
    "auditor": "analista_externo",
}

_dynamic_row_filters: Dict[str, RowFilterRule] = {}


def canonicalize_role(role: Optional[str]) -> str:
    """Mapea arquetipos universales a identidades declaradas o devuelve el rol normalizado."""
    if not role:
        return "director_general"
    clean = str(role).strip().lower()
    return ROLE_ALIASES.get(clean, clean)


def register_dynamic_row_filter(role: str, filter_expr: str, tables: Optional[Sequence[str]] = None) -> None:
    """Permite a la API registrar reglas de filtrado por fila para roles creados en caliente."""
    clean = canonicalize_role(role)
    _dynamic_row_filters[clean] = RowFilterRule(
        role=clean,
        filter_expr=filter_expr,
        catalogs=["*"],
        schemas=["*"],
        tables=list(tables) if tables else ["*"],
    )



class PolicyError(ValueError):
    """Política mal formada o incoherente."""


FALLBACK_TAG = "PII_CONFIDENCIAL"


def category_tag(category: Optional[str]) -> str:
    """Etiqueta de Atlas correspondiente a una categoría de la taxonomía."""
    if not category:
        return FALLBACK_TAG
    return f"PII_{category.upper()}"


@dataclass(frozen=True)
class MaskingRule:
    """Enmascaramiento aplicable a un rol sobre las columnas etiquetadas."""

    role: str
    mask_type: str
    value_expr: Optional[str]
    tag: str

    @property
    def is_passthrough(self) -> bool:
        """`NONE` significa acceso en claro: no se reescribe la columna."""
        return self.mask_type == MASK_TYPE_NONE

    def render(self, column: str) -> str:
        """Expresión SQL que sustituye a la columna."""
        template = self.value_expr or DEFAULT_MASK_EXPRESSIONS.get(self.mask_type)
        if not template:
            raise PolicyError(
                f"El tipo de enmascaramiento '{self.mask_type}' no define expresión."
            )
        return template.replace("{col}", column)


@dataclass(frozen=True)
class RowFilterRule:
    """Predicado de fila aplicable a un rol sobre un conjunto de tablas."""

    role: str
    filter_expr: str
    catalogs: Sequence[str]
    schemas: Sequence[str]
    tables: Sequence[str]

    @property
    def is_unrestricted(self) -> bool:
        """Un filtro vacío equivale a acceso a todas las filas."""
        return not self.filter_expr.strip()

    def covers(self, schema: Optional[str], table: Optional[str]) -> bool:
        """Indica si el recurso de la política cubre la tabla consultada."""
        return _matches(self.schemas, schema) and _matches(self.tables, table)


def _matches(values: Sequence[str], candidate: Optional[str]) -> bool:
    if "*" in values:
        return True
    if candidate is None:
        return False
    return candidate.lower() in {value.lower() for value in values}


def _load_json(path: Path) -> Dict[str, Any]:
    try:
        with path.open(encoding="utf-8") as handle:
            data = json.load(handle)
    except FileNotFoundError as exc:
        raise PolicyError(f"No se encontró el archivo de política: {path}") from exc
    except json.JSONDecodeError as exc:
        raise PolicyError(f"Política mal formada en {path}: {exc}") from exc

    if not isinstance(data, dict):
        raise PolicyError(f"La política {path} debe ser un objeto JSON.")
    return data


@lru_cache(maxsize=1)
def load_masking_policy() -> Dict[str, Any]:
    """Política de enmascaramiento en formato Ranger."""
    return _load_json(MASKING_POLICY_FILE)


@lru_cache(maxsize=1)
def load_row_filter_policy() -> Dict[str, Any]:
    """Política de filtrado por filas en formato Ranger."""
    return _load_json(ROW_FILTER_POLICY_FILE)


def clear_cache() -> None:
    """Invalida el caché de políticas (útil en pruebas)."""
    load_masking_policy.cache_clear()
    load_row_filter_policy.cache_clear()
    _dynamic_row_filters.clear()


def _policy_roles(item: Dict[str, Any]) -> List[str]:
    return [str(role) for role in item.get("roles", [])]


def _masking_policies() -> List[Dict[str, Any]]:
    """Políticas de enmascaramiento declaradas, en orden."""
    document = load_masking_policy()
    policies = document.get("policies")
    if isinstance(policies, list):
        return [p for p in policies if p.get("isEnabled", True)]
    # Compatibilidad con un documento de política única.
    return [document] if document.get("isEnabled", True) else []


def _policy_tags(policy: Dict[str, Any]) -> List[str]:
    return [str(v) for v in policy.get("resources", {}).get("tag", {}).get("values", [])]


def _rule_from_policy(policy: Dict[str, Any], role: str, tag: str) -> Optional[MaskingRule]:
    for item in policy.get("dataMaskPolicyItems", []):
        if role not in _policy_roles(item):
            continue
        mask_info = item.get("dataMaskInfo", {}) or {}
        return MaskingRule(
            role=role,
            mask_type=str(mask_info.get("dataMaskType", MASK_TYPE_NONE)),
            value_expr=mask_info.get("valueExpr"),
            tag=tag,
        )
    return None


def resolve_masking_rule(role: str, category: Optional[str] = None) -> Optional[MaskingRule]:
    """Enmascaramiento que corresponde al rol para una categoría de PII."""
    clean_role = canonicalize_role(role)
    wanted = category_tag(category)

    for tag in (wanted, FALLBACK_TAG):
        for policy in _masking_policies():
            if tag not in _policy_tags(policy):
                continue
            rule = _rule_from_policy(policy, clean_role, tag)
            if rule is not None:
                return rule
    return None


def resolve_row_filter_rule(role: str) -> Optional[RowFilterRule]:
    """Filtro de filas que corresponde al rol, o `None` si no hay regla."""
    clean_role = canonicalize_role(role)
    if clean_role in _dynamic_row_filters:
        return _dynamic_row_filters[clean_role]

    policy = load_row_filter_policy()
    if not policy.get("isEnabled", True):
        return None

    resources = policy.get("resources", {})
    catalogs = [str(v) for v in resources.get("catalog", {}).get("values", ["*"])]
    schemas = [str(v) for v in resources.get("schema", {}).get("values", ["*"])]
    tables = [str(v) for v in resources.get("table", {}).get("values", ["*"])]

    for item in policy.get("rowFilterPolicyItems", []):
        if clean_role not in _policy_roles(item):
            continue
        filter_info = item.get("rowFilterInfo", {}) or {}
        return RowFilterRule(
            role=clean_role,
            filter_expr=str(filter_info.get("filterExpr", "")),
            catalogs=catalogs,
            schemas=schemas,
            tables=tables,
        )
    return None


def declared_roles() -> List[str]:
    """Roles cubiertos por alguna de las dos políticas."""
    roles: List[str] = []
    documents = [(policy, "dataMaskPolicyItems") for policy in _masking_policies()]
    documents.append((load_row_filter_policy(), "rowFilterPolicyItems"))

    for policy, key in documents:
        for item in policy.get(key, []):
            for role in _policy_roles(item):
                if role not in roles:
                    roles.append(role)
    return roles