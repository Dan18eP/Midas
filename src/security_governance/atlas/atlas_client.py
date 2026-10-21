"""Midas - Cliente REST de Apache Atlas para Clasificación en Caliente.

Historia de Usuario: HU-GOV-02 (`ST-GOV-02.2`, `ST-GOV-02.3`)
Responsable: Sebastian Castiblanco (Governance Lead)

Registra la clasificación `PII_CONFIDENCIAL` sobre las columnas detectadas
usando el endpoint canónico declarado en ADR-006:
`POST /api/atlas/v2/entity/bulk/classification`.

Como el resto del módulo de gobernanza, toda operación es tolerante a fallos:
si Atlas no está disponible devuelve `False` en lugar de propagar la excepción,
de modo que el escudo PII nunca interrumpa la transformación Bronze → Silver.
"""

from __future__ import annotations

from dataclasses import dataclass
import logging
import os
from typing import Any, Dict, List, Optional, Sequence

import httpx

from src.security_governance.atlas.pii_classifier import PII_CLASSIFICATION

logger = logging.getLogger("midas.governance.atlas.client")

DEFAULT_ATLAS_URL = "http://midas-atlas:21000"
DEFAULT_RANGER_URL = "http://midas-ranger:6080"
DEFAULT_TIMEOUT_SECONDS = 3.0

# Ventana máxima de propagación Atlas -> Ranger exigida por el criterio CA-3.
TAGSYNC_DEADLINE_SECONDS = 5.0


@dataclass(frozen=True)
class AtlasSettings:
    """Parámetros de conexión a Atlas y a Ranger."""

    base_url: str
    username: Optional[str]
    password: Optional[str]
    timeout_seconds: float
    ranger_url: str
    tagsync_deadline_seconds: float

    @property
    def api_url(self) -> str:
        return f"{self.base_url.rstrip('/')}/api/atlas/v2"

    @property
    def auth(self) -> Optional[tuple]:
        if self.username and self.password:
            return (self.username, self.password)
        return None


def load_settings() -> AtlasSettings:
    """Resuelve la configuración desde variables de entorno."""
    try:
        timeout = float(os.getenv("ATLAS_TIMEOUT_SECONDS", str(DEFAULT_TIMEOUT_SECONDS)))
    except ValueError:
        timeout = DEFAULT_TIMEOUT_SECONDS

    try:
        deadline = float(os.getenv("ATLAS_TAGSYNC_DEADLINE_SECONDS", str(TAGSYNC_DEADLINE_SECONDS)))
    except ValueError:
        deadline = TAGSYNC_DEADLINE_SECONDS

    return AtlasSettings(
        base_url=os.getenv("ATLAS_URL", DEFAULT_ATLAS_URL),
        username=os.getenv("ATLAS_USERNAME", "").strip() or None,
        password=os.getenv("ATLAS_PASSWORD", "").strip() or None,
        timeout_seconds=timeout,
        ranger_url=os.getenv("RANGER_URL", DEFAULT_RANGER_URL),
        tagsync_deadline_seconds=deadline,
    )


def build_column_qualified_name(
    table_qualified_name: str,
    column: str,
    cluster: str = "midas",
) -> str:
    """FQN de una columna en Atlas: `base.tabla.columna@cluster`."""
    base = table_qualified_name.split("@", 1)[0]
    return f"{base}.{column}@{cluster}"


def build_bulk_classification_payload(
    table_qualified_name: str,
    columns: Sequence[str],
    *,
    classification: str = PII_CLASSIFICATION,
    cluster: str = "midas",
    attributes: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Cuerpo de `POST /v2/entity/bulk/classification` para varias columnas."""
    return {
        "classification": {
            "typeName": classification,
            "attributes": attributes or {},
            "propagate": True,
        },
        "entityGuids": [],
        "entityUniqueAttributes": [
            {
                "typeName": "hive_column",
                "uniqueAttributes": {
                    "qualifiedName": build_column_qualified_name(
                        table_qualified_name, column, cluster
                    )
                },
            }
            for column in columns
        ],
    }


class AtlasClient:
    """Cliente síncrono y tolerante a fallos de Apache Atlas."""

    def __init__(self, settings: Optional[AtlasSettings] = None) -> None:
        self._settings = settings or load_settings()

    @property
    def settings(self) -> AtlasSettings:
        return self._settings

    def _request(
        self,
        method: str,
        url: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
    ) -> Optional[Dict[str, Any]]:
        headers = {"Accept": "application/json"}
        if json_body is not None:
            headers["Content-Type"] = "application/json"

        try:
            response = httpx.request(
                method,
                url,
                json=json_body,
                headers=headers,
                auth=self._settings.auth,
                timeout=self._settings.timeout_seconds,
            )
        except httpx.HTTPError as exc:
            logger.warning("Apache Atlas inalcanzable en %s: %s", url, exc)
            return None

        if response.status_code >= 400:
            logger.warning(
                "Apache Atlas respondió HTTP %s en %s: %s",
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
            return {}
        return payload if isinstance(payload, dict) else {"data": payload}

    # ------------------------------------------------------------------
    # Atlas
    # ------------------------------------------------------------------
    def is_available(self) -> bool:
        """Indica si Atlas responde."""
        url = f"{self._settings.base_url.rstrip('/')}/api/atlas/admin/version"
        return self._request("GET", url) is not None

    def ensure_classification_type(
        self,
        classification: str = PII_CLASSIFICATION,
    ) -> bool:
        """Crea la definición de la clasificación si todavía no existe."""
        type_url = f"{self._settings.api_url}/types/typedef/name/{classification}"
        if self._request("GET", type_url) is not None:
            return True

        payload = {
            "classificationDefs": [
                {
                    "name": classification,
                    "description": "Columna con datos personales sensibles detectada por el Escudo PII de Midas.",
                    "superTypes": [],
                    "attributeDefs": [],
                }
            ]
        }
        created = self._request("POST", f"{self._settings.api_url}/types/typedefs", json_body=payload)
        return created is not None

    def classify_columns(
        self,
        table_qualified_name: str,
        columns: Sequence[str],
        *,
        classification: str = PII_CLASSIFICATION,
        cluster: str = "midas",
    ) -> bool:
        """Registra la clasificación sobre las columnas indicadas."""
        if not columns:
            return True

        payload = build_bulk_classification_payload(
            table_qualified_name, columns, classification=classification, cluster=cluster
        )
        url = f"{self._settings.api_url}/entity/bulk/classification"
        return self._request("POST", url, json_body=payload) is not None

    # ------------------------------------------------------------------
    # Ranger (CA-3: verificación de la propagación TagSync)
    # ------------------------------------------------------------------
    def fetch_ranger_tag_names(self) -> Optional[List[str]]:
        """Etiquetas que Ranger ya recibió desde Atlas vía TagSync.

        Devuelve `None` si Ranger no está desplegado o no responde, lo que el
        verificador interpreta como "propagación no comprobable".
        """
        url = f"{self._settings.ranger_url.rstrip('/')}/service/tags/tags"
        payload = self._request("GET", url)
        if payload is None:
            return None

        items = payload.get("data") if isinstance(payload.get("data"), list) else payload
        if isinstance(items, list):
            return [str(item.get("type", item)) for item in items if item]
        return []
