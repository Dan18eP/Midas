"""Zero-Trust Lens identities and roles per documentation/canonical/05_...md Section 3.2."""

from typing import Dict, List, Optional
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field

router = APIRouter(prefix="/api/v1/auth", tags=["Zero-Trust Lens & Governance"])


class ZeroTrustRole(BaseModel):
    """Zero-Trust test identity definition for Canvas security simulation."""
    role_id: str = Field(..., description="Unique identifier of the test identity.")
    title: str = Field(..., description="Human-readable title displayed in the Canvas header switcher.")
    description: str = Field(..., description="Description of the security profile and access level.")
    canvas_effect: str = Field(..., description="Visual behavior in the React Flow canvas.")
    ranger_row_filter: Optional[str] = Field(None, description="Simulated Apache Ranger row filtering policy.")
    ranger_column_mask: Optional[str] = Field(None, description="Simulated Apache Ranger column masking policy.")
    allowed_nodes: List[str] = Field(..., description="List of Lakehouse node IDs accessible by this identity.")
    locked_nodes: List[str] = Field(default_factory=list, description="List of locked or restricted node IDs.")
    archetype: Optional[str] = Field("DATA_OWNER", description="Universal archetype: DATA_OWNER, RESTRICTED_OPERATOR, COMPLIANCE_AUDITOR")
    scope_column: Optional[str] = Field(None, description="Target column for ABAC scoped filtering")
    scope_value: Optional[str] = Field(None, description="Target value for ABAC scoped filtering")


CANONICAL_ROLES = [
    ZeroTrustRole(
        role_id="director_general",
        title="Director General (Data Owner)",
        description="Acceso irrestricto a todas las capas del Lakehouse (Bronze, Silver, Gold y Guardian).",
        canvas_effect="Todos los nodos del Canvas en verde brillante; acceso completo sin restricciones.",
        ranger_row_filter=None,
        ranger_column_mask=None,
        allowed_nodes=[
            "source_postgres",
            "source_csv",
            "source_api",
            "bronze_raw",
            "silver_cleansing",
            "silver_quarantine",
            "guardian_monitor",
            "gold_marts",
        ],
        locked_nodes=[],
        archetype="DATA_OWNER",
    ),
    ZeroTrustRole(
        role_id="gerente_norte",
        title="Gerente Regional Norte (Restricted Operator)",
        description="Acceso condicionado a métricas y transacciones pertenecientes exclusivamente a la región NORTE.",
        canvas_effect="Nodos de otras regiones en ámbar con etiqueta flotante: Row Filter: region = 'NORTE'.",
        ranger_row_filter="region = 'NORTE'",
        ranger_column_mask=None,
        allowed_nodes=[
            "source_postgres",
            "bronze_raw",
            "silver_cleansing",
            "gold_marts",
        ],
        locked_nodes=["source_csv", "silver_quarantine"],
        archetype="RESTRICTED_OPERATOR",
        scope_column="region",
        scope_value="NORTE",
    ),
    ZeroTrustRole(
        role_id="analista_externo",
        title="Analista Externo (Compliance Auditor)",
        description="Perfil de menor privilegio con enmascaramiento estricto de PII y bloqueo de nodos financieros.",
        canvas_effect="Nodos financieros bloqueados con candado (Política Ranger #402); nodos permitidos con Column Mask: PII.",
        ranger_row_filter=None,
        ranger_column_mask="PII_HASH (email, telefono, rfc)",
        allowed_nodes=[
            "source_api",
            "bronze_raw",
            "silver_cleansing",
        ],
        locked_nodes=["gold_marts", "silver_quarantine"],
        archetype="COMPLIANCE_AUDITOR",
    ),
]

_custom_roles: Dict[str, ZeroTrustRole] = {}


class CreateRoleRequest(BaseModel):
    role_id: str = Field(..., min_length=2, description="Identificador único del rol")
    title: str = Field(..., min_length=2, description="Nombre legible del rol")
    description: str = Field(..., description="Descripción del perfil de acceso")
    archetype: str = Field("RESTRICTED_OPERATOR", description="DATA_OWNER, RESTRICTED_OPERATOR, COMPLIANCE_AUDITOR")
    scope_column: Optional[str] = Field(None, description="Columna para filtrado ABAC (ej: sede, departamento, sucursal)")
    scope_value: Optional[str] = Field(None, description="Valor del alcance para filtrado ABAC (ej: BOGOTA, FINANZAS)")
    allowed_nodes: Optional[List[str]] = Field(None, description="Nodos permitidos en el canvas")
    locked_nodes: Optional[List[str]] = Field(None, description="Nodos bloqueados en el canvas")


@router.get(
    "/roles",
    response_model=List[ZeroTrustRole],
    summary="List Zero-Trust Lens Test Identities",
    description="Returns canonical Zero-Trust identities and dynamically registered roles for the Canvas switcher.",
)
async def list_roles() -> List[ZeroTrustRole]:
    """Retrieve all canonical and dynamic Zero-Trust identities."""
    return list(CANONICAL_ROLES) + list(_custom_roles.values())


@router.post(
    "/roles",
    response_model=ZeroTrustRole,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar Rol Dinámico Universal",
    description="Permite registrar nuevos roles en caliente con alcance paramétrico (ABAC) o políticas de privacidad.",
)
async def create_role(payload: CreateRoleRequest) -> ZeroTrustRole:
    """Registra una nueva identidad de seguridad en el catálogo dinámico."""
    from src.security_governance.ranger.policy_store import register_dynamic_row_filter

    filter_expr = f"{payload.scope_column} = '{payload.scope_value}'" if payload.scope_column and payload.scope_value else None
    if filter_expr:
        register_dynamic_row_filter(role=payload.role_id, filter_expr=filter_expr)

    new_role = ZeroTrustRole(
        role_id=payload.role_id,
        title=payload.title,
        description=payload.description,
        canvas_effect=f"Filtro ABAC: {filter_expr}" if filter_expr else "Acceso según arquetipo",
        ranger_row_filter=filter_expr,
        ranger_column_mask="PII_HASH (email, telefono, rfc)" if payload.archetype == "COMPLIANCE_AUDITOR" else None,
        allowed_nodes=payload.allowed_nodes or ["source_postgres", "bronze_raw", "silver_cleansing", "gold_marts"],
        locked_nodes=payload.locked_nodes or [],
        archetype=payload.archetype,
        scope_column=payload.scope_column,
        scope_value=payload.scope_value,
    )
    _custom_roles[payload.role_id] = new_role
    return new_role


def reset_roles_catalog() -> None:
    """Limpia roles personalizados para aislamiento de pruebas."""
    _custom_roles.clear()
