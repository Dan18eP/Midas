"""Midas - Configuración del Catálogo Central OpenMetadata.

Historia de Usuario: HU-GOV-01
Responsable: Sebastian Castiblanco (Governance Lead)

Carga la declaración canónica de conectores (`connector_config.yaml`) y los
parámetros de conexión al servidor de OpenMetadata desde variables de entorno.
"""

from dataclasses import dataclass
from functools import lru_cache
import os
from pathlib import Path
from typing import Any, Dict, List, Optional

CONNECTOR_CONFIG_PATH = Path(__file__).with_name("connector_config.yaml")

DEFAULT_OPENMETADATA_URL = "http://midas-openmetadata:8585"
DEFAULT_TIMEOUT_SECONDS = 3.0


@dataclass(frozen=True)
class OpenMetadataSettings:
    """Parámetros de conexión al servidor de catálogo."""

    base_url: str
    jwt_token: Optional[str]
    timeout_seconds: float

    @property
    def api_url(self) -> str:
        return f"{self.base_url.rstrip('/')}/api/v1"

    @property
    def auth_headers(self) -> Dict[str, str]:
        """Cabeceras de autenticación; vacías cuando no hay token de bot."""
        if not self.jwt_token:
            return {}
        return {"Authorization": f"Bearer {self.jwt_token}"}


def load_settings() -> OpenMetadataSettings:
    """Resuelve la configuración desde el entorno en cada invocación.

    No se cachea: el gateway de linaje debe poder reaccionar a un token
    inyectado después del arranque del contenedor.
    """
    raw_timeout = os.getenv("OPENMETADATA_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS))
    try:
        timeout = float(raw_timeout)
    except ValueError:
        timeout = DEFAULT_TIMEOUT_SECONDS

    token = os.getenv("OPENMETADATA_JWT_TOKEN", "").strip()

    return OpenMetadataSettings(
        base_url=os.getenv("OPENMETADATA_URL", DEFAULT_OPENMETADATA_URL),
        jwt_token=token or None,
        timeout_seconds=timeout,
    )


@lru_cache(maxsize=1)
def load_connector_config() -> Dict[str, Any]:
    """Lee y cachea la declaración canónica de conectores y linaje.

    `yaml` se importa de forma diferida para que el camino de solo lectura del
    gateway de linaje no dependa de PyYAML hasta que realmente se necesite.
    """
    import yaml  # noqa: PLC0415 - import diferido intencional

    with CONNECTOR_CONFIG_PATH.open(encoding="utf-8") as handle:
        config = yaml.safe_load(handle)

    if not isinstance(config, dict):
        raise ValueError("connector_config.yaml debe declarar un mapeo en su raíz.")
    return config


def get_connectors() -> List[Dict[str, Any]]:
    """Servicios de base de datos declarados para ingesta de metadatos."""
    return list(load_connector_config().get("connectors", []))


def get_pipelines() -> List[Dict[str, Any]]:
    """Pipelines de transformación declarados para extracción de linaje."""
    return list(load_connector_config().get("lineage", {}).get("pipelines", []))


def resolve_service_name(connector_name: str) -> str:
    """Permite sobreescribir por entorno el nombre publicado de un servicio.

    Mantiene alineados `connector_config.yaml` y las variables
    `OPENMETADATA_SERVICE_ICEBERG` / `OPENMETADATA_SERVICE_POSTGRES` del `.env`.
    """
    overrides = {
        "midas_lakehouse_iceberg": "OPENMETADATA_SERVICE_ICEBERG",
        "midas_operational_postgres": "OPENMETADATA_SERVICE_POSTGRES",
    }
    env_var = overrides.get(connector_name)
    if not env_var:
        return connector_name
    return os.getenv(env_var, "").strip() or connector_name


def resolve_connection_username(connector: Dict[str, Any]) -> str:
    """Usuario efectivo de un conector, resolviendo su variable de entorno."""
    connection = connector.get("connection", {}) or {}
    env_var = connection.get("username_env")
    default = str(connection.get("username_default", ""))
    if not env_var:
        return default
    return os.getenv(str(env_var), "").strip() or default
