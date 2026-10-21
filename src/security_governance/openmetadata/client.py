"""Midas - Cliente REST del Catálogo Central OpenMetadata.

Historia de Usuario: HU-GOV-01
Responsable: Sebastian Castiblanco (Governance Lead)

Envoltorio delgado sobre la API REST de OpenMetadata. Toda operación es
tolerante a fallos: si el servidor no está disponible, devuelve `None` o
`False` en lugar de propagar la excepción, de modo que la gobernanza nunca
tumbe al API Gateway ni al drawer del frontend.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, Optional

import httpx

from src.security_governance.openmetadata.config import (
    OpenMetadataSettings,
    load_settings,
)

logger = logging.getLogger("midas.governance.openmetadata.client")


class OpenMetadataClient:
    """Cliente síncrono y tolerante a fallos del catálogo central."""

    def __init__(self, settings: Optional[OpenMetadataSettings] = None) -> None:
        self._settings = settings or load_settings()

    @property
    def settings(self) -> OpenMetadataSettings:
        return self._settings

    # ------------------------------------------------------------------
    # Transporte
    # ------------------------------------------------------------------
    def _request(
        self,
        method: str,
        path: str,
        *,
        params: Optional[Dict[str, Any]] = None,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        """Ejecuta una llamada y devuelve el cuerpo JSON, o None ante cualquier fallo."""
        url = f"{self._settings.api_url}{path}"
        headers = {"Accept": "application/json", **self._settings.auth_headers}
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        try:
            response = httpx.request(
                method,
                url,
                params=params,
                json=json_body,
                headers=headers,
                timeout=self._settings.timeout_seconds,
            )
        except httpx.HTTPError as exc:
            logger.warning("OpenMetadata inalcanzable en %s: %s", url, exc)
            return None

        if response.status_code >= 400:
            logger.warning(
                "OpenMetadata respondió HTTP %s en %s: %s",
                response.status_code,
                url,
                response.text[:200],
            )
            return None

        if not response.content:
            return {}

        try:
            payload = response.json()
        except ValueError:
            logger.warning("OpenMetadata devolvió un cuerpo no JSON en %s", url)
            return None

        return payload if isinstance(payload, dict) else {"data": payload}

    # ------------------------------------------------------------------
    # Lectura
    # ------------------------------------------------------------------
    def is_available(self) -> bool:
        """Indica si el servidor de catálogo responde."""
        return self._request("GET", "/system/version") is not None

    def get_table_by_fqn(self, fqn: str) -> Optional[Dict[str, Any]]:
        """Recupera una tabla del catálogo por su nombre completamente calificado."""
        return self._request("GET", f"/tables/name/{fqn}")

    def get_table_lineage(
        self,
        fqn: str,
        *,
        upstream_depth: int = 3,
        downstream_depth: int = 3,
    ) -> Optional[Dict[str, Any]]:
        """Grafo de linaje ascendente y descendente de una tabla."""
        return self._request(
            "GET",
            f"/lineage/table/name/{fqn}",
            params={
                "upstreamDepth": upstream_depth,
                "downstreamDepth": downstream_depth,
            },
        )

    # ------------------------------------------------------------------
    # Escritura
    # ------------------------------------------------------------------
    def upsert_database_service(self, payload: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Crea o actualiza un servicio de base de datos en el catálogo."""
        return self._request("PUT", "/services/databaseServices", json_body=payload)

    def upsert_lineage_edge(self, payload: Dict[str, Any]) -> bool:
        """Registra una arista de linaje entre dos entidades."""
        return self._request("PUT", "/lineage", json_body=payload) is not None
