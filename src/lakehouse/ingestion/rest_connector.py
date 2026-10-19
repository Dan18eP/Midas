"""
Midas Lakehouse Ingestion - REST API Connector
Historia de Usuario: HU-LAKE-02 (Universal Ingestion Multi-Fuente)
Responsables: Edgar Corzo (Data Eng Lead) & Daniel Echeverría (Backend Lead)
"""

import logging
import time
from typing import Any, Callable, Dict, Generator, List, Optional

try:
    import httpx
except ImportError:
    httpx = None

from src.lakehouse.ingestion.fingerprint import (
    compute_schema_fingerprint,
    create_bronze_envelope,
)

logger = logging.getLogger("midas.lakehouse.ingestion.rest")


class RestApiSourceConnector:
    """
    Extractor de ingesta para APIs REST externas (ej. helpdesk_tickets_live / CRM endpoints).
    Soporta:
    - Paginación basada en cursor (`next_cursor`, tokens de paginación o enlaces).
    - Paginación por offset/página (`page`, `offset`, `limit`).
    - Manejo de Rate Limits (HTTP 429) y errores transitorios 5xx mediante retroceso exponencial (Exponential Backoff).
    - Inyección de cabeceras de autorización y trazabilidad.
    - Envoltura canónica automática en la capa Bronze.
    """

    def __init__(
        self,
        base_url: str,
        auth_token: Optional[str] = None,
        headers: Optional[Dict[str, str]] = None,
        max_retries: int = 4,
        backoff_factor: float = 0.5,
        timeout_sec: float = 10.0,
        http_client: Optional[Any] = None,
    ):
        """
        :param base_url: URL base del servicio REST.
        :param auth_token: Bearer token opcional.
        :param headers: Cabeceras HTTP adicionales.
        :param max_retries: Intentos máximos ante 429 o 5xx.
        :param backoff_factor: Factor multiplicador para el tiempo de espera entre reintentos.
        :param timeout_sec: Timeout de petición en segundos.
        :param http_client: Cliente HTTP opcional (para inyección de mocks o httpx.Client personalizado).
        """
        self.base_url = base_url.rstrip("/")
        self.max_retries = max_retries
        self.backoff_factor = backoff_factor
        self.timeout_sec = timeout_sec
        self.headers = headers or {}
        if auth_token:
            self.headers["Authorization"] = f"Bearer {auth_token}"

        self._custom_client = http_client

    def _request_with_retry(
        self,
        method: str,
        endpoint: str,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Ejecuta la petición HTTP con política de reintentos y retroceso exponencial ante 429/5xx.
        """
        url = f"{self.base_url}/{endpoint.lstrip('/')}"
        
        # Modo con cliente inyectado (o mock de pruebas)
        client = self._custom_client
        created_client = False
        if client is None:
            if httpx is None:
                raise RuntimeError("La librería 'httpx' no está instalada en el entorno.")
            client = httpx.Client(timeout=self.timeout_sec)
            created_client = True

        attempt = 0
        try:
            while attempt < self.max_retries:
                attempt += 1
                try:
                    resp = client.request(method=method, url=url, headers=self.headers, params=params)
                    
                    if resp.status_code == 200:
                        return resp.json()
                    
                    # Manejo de Rate Limit (429) o fallas transitorias de servidor (500, 502, 503, 504)
                    if resp.status_code in (429, 500, 502, 503, 504):
                        retry_after = resp.headers.get("Retry-After")
                        if retry_after and retry_after.isdigit():
                            sleep_time = float(retry_after)
                        else:
                            sleep_time = self.backoff_factor * (2 ** (attempt - 1))
                        
                        logger.warning(
                            "HTTP %d en %s (intento %d/%d). Reintentando en %.2f s...",
                            resp.status_code,
                            url,
                            attempt,
                            self.max_retries,
                            sleep_time,
                        )
                        time.sleep(sleep_time)
                        continue

                    # Para otros códigos de error, lanzar excepción
                    resp.raise_for_status()
                except Exception as exc:
                    if attempt >= self.max_retries:
                        logger.error("Agotados los reintentos para %s: %s", url, exc)
                        raise
                    sleep_time = self.backoff_factor * (2 ** (attempt - 1))
                    logger.warning("Error de red en intento %d/%d (%s). Reintentando en %.2f s...", attempt, self.max_retries, exc, sleep_time)
                    time.sleep(sleep_time)

            raise RuntimeError(f"Excedido el número máximo de reintentos ({self.max_retries}) para {url}")
        finally:
            if created_client and hasattr(client, "close"):
                client.close()

    def extract_cursor_paginated(
        self,
        endpoint: str,
        batch_id: str,
        data_key: str = "data",
        cursor_param: str = "cursor",
        next_cursor_key: str = "next_cursor",
        limit_param: str = "limit",
        page_size: int = 100,
        max_records: Optional[int] = None,
        source_type: str = "REST_API_CRM",
    ) -> List[Dict[str, Any]]:
        """
        Extrae registros iterando a través de paginación basada en cursor hasta agotar o llegar a max_records.
        Cada registro se envuelve en el contrato canónico Bronze.
        """
        enveloped_records: List[Dict[str, Any]] = []
        current_cursor = None
        cached_fingerprint = None

        while True:
            params: Dict[str, Any] = {limit_param: page_size}
            if current_cursor is not None:
                params[cursor_param] = current_cursor

            response_data = self._request_with_retry("GET", endpoint, params=params)

            # Extraer lista de items
            items = response_data.get(data_key, [])
            if not isinstance(items, list) or len(items) == 0:
                break

            # Calcular o reutilizar fingerprint de esquema
            if cached_fingerprint is None and len(items) > 0 and isinstance(items[0], dict):
                cached_fingerprint = compute_schema_fingerprint(list(items[0].keys()))

            for item in items:
                if isinstance(item, dict):
                    envelope = create_bronze_envelope(
                        record=item,
                        source_type=source_type,
                        source_origin=f"{self.base_url}/{endpoint.lstrip('/')}",
                        batch_id=batch_id,
                        schema_fingerprint=cached_fingerprint,
                    )
                    enveloped_records.append(envelope)
                if max_records and len(enveloped_records) >= max_records:
                    break

            if max_records and len(enveloped_records) >= max_records:
                break

            # Obtener siguiente cursor
            next_cursor = response_data.get(next_cursor_key)
            if not next_cursor or next_cursor == current_cursor:
                break
            current_cursor = next_cursor

        logger.info(
            "Extraídos %d registros vía REST desde %s (batch_id=%s)",
            len(enveloped_records),
            endpoint,
            batch_id,
        )
        return enveloped_records
