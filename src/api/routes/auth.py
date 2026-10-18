"""Zero-Trust Lens identities and roles per documentation/canonical/05_...md Section 3.2."""

from typing import Dict, List, Optional
from fastapi import APIRouter
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


CANONICAL_ROLES = [
    ZeroTrustRole(
        role_id="director_general",
        title="Director General",
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
    ),
    ZeroTrustRole(
        role_id="gerente_norte",
        title="Gerente Regional Norte",
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
    ),
    ZeroTrustRole(
        role_id="analista_externo",
        title="Analista Externo (Auditor)",
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
    ),
]


@router.get(
    "/roles",
    response_model=List[ZeroTrustRole],
    summary="List Zero-Trust Lens Test Identities",
    description="Returns the 3 canonical Zero-Trust test identities for the Canvas role switcher (HU-FRONT-05).",
)
async def list_roles() -> List[ZeroTrustRole]:
    """Retrieve all canonical Zero-Trust test identities."""
    return CANONICAL_ROLES
