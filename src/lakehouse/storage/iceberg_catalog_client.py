"""
Midas Lakehouse - Apache Iceberg REST Catalog Client
Historia de Usuario: HU-LAKE-01
Responsable: Edgar Corzo (Data Engineering Lead)
"""

import os
import logging
from typing import List, Dict, Optional, Any

try:
    from pyiceberg.catalog import load_catalog, Catalog
    from pyiceberg.catalog.rest import RestCatalog
    from pyiceberg.exceptions import (
        NamespaceAlreadyExistsError,
        NoSuchNamespaceError,
        NoSuchTableError,
        TableAlreadyExistsError,
    )
except ImportError:
    load_catalog = None
    Catalog = None
    RestCatalog = None
    NamespaceAlreadyExistsError = Exception
    NoSuchNamespaceError = Exception
    NoSuchTableError = Exception
    TableAlreadyExistsError = Exception

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger("midas.lakehouse.storage.iceberg")

# Namespaces canónicos del Lakehouse Medallón Midas
CANONICAL_NAMESPACES: List[str] = [
    "bronze",
    "silver",
    "gold",
    "quarantine",
]


class MidasIcebergCatalogClient:
    """Cliente para administración y operaciones sobre el catálogo Apache Iceberg REST."""

    def __init__(
        self,
        catalog_uri: Optional[str] = None,
        warehouse: Optional[str] = None,
        s3_endpoint: Optional[str] = None,
        s3_access_key: Optional[str] = None,
        s3_secret_key: Optional[str] = None,
    ):
        self.catalog_uri = catalog_uri or os.getenv("ICEBERG_REST_URI") or os.getenv("ICEBERG_CATALOG_URL", "http://localhost:8181")
        self.warehouse = warehouse or os.getenv("ICEBERG_WAREHOUSE", "s3://midas-bronze/")
        self.s3_endpoint = s3_endpoint or os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
        self.s3_access_key = s3_access_key or os.getenv("MINIO_ROOT_USER", "midas_minio_admin")
        self.s3_secret_key = s3_secret_key or os.getenv("MINIO_ROOT_PASSWORD", "midas_minio_secret_2026")

        # Fallback a localhost si midas-iceberg-catalog o midas-minio no resuelven (ej. tests en host Windows)
        if "midas-iceberg-catalog" in self.catalog_uri:
            try:
                import socket
                socket.gethostbyname("midas-iceberg-catalog")
            except Exception:
                self.catalog_uri = self.catalog_uri.replace("midas-iceberg-catalog", "localhost")

        if "midas-minio" in self.s3_endpoint:
            try:
                import socket
                socket.gethostbyname("midas-minio")
            except Exception:
                self.s3_endpoint = self.s3_endpoint.replace("midas-minio", "localhost")

        self._catalog: Optional[Catalog] = None

    def get_catalog_properties(self) -> Dict[str, str]:
        """Genera el diccionario de propiedades de conexión para PyIceberg."""
        return {
            "type": "rest",
            "uri": self.catalog_uri,
            "warehouse": self.warehouse,
            "s3.endpoint": self.s3_endpoint,
            "s3.access-key-id": self.s3_access_key,
            "s3.secret-access-key": self.s3_secret_key,
            "s3.path-style-access": "true",
            "s3.region": "us-east-1",
        }

    @property
    def catalog(self) -> Catalog:
        if self._catalog is None:
            if load_catalog is None:
                raise RuntimeError("Librería 'pyiceberg' no está disponible en el entorno.")
            if not self.check_health(timeout_sec=0.5):
                raise ConnectionError(f"Catálogo Iceberg REST no disponible en {self.catalog_uri}")
            props = self.get_catalog_properties()
            self._catalog = load_catalog("midas_catalog", **props)
        return self._catalog

    def check_health(self, timeout_sec: float = 1.0) -> bool:
        """Verifica la disponibilidad del catálogo Iceberg REST mediante probe HTTP a /v1/config con timeout corto."""
        if httpx is not None:
            try:
                with httpx.Client(timeout=timeout_sec) as client:
                    resp = client.get(f"{self.catalog_uri}/v1/config")
                    if resp.status_code == 200:
                        return True
            except Exception:
                return False

        return False

    def list_namespaces(self) -> List[str]:
        """Lista todos los namespaces registrados en el catálogo."""
        try:
            namespaces = self.catalog.list_namespaces()
            # En PyIceberg, list_namespaces retorna tuplas tipo ('bronze',)
            result = []
            for ns in namespaces:
                if isinstance(ns, tuple):
                    result.append(ns[0] if len(ns) == 1 else ".".join(ns))
                else:
                    result.append(str(ns))
            return result
        except Exception as e:
            logger.error(f"Error listando namespaces en catálogo Iceberg: {e}")
            raise

    def create_namespace_if_not_exists(self, namespace: str) -> bool:
        """Crea el namespace en el catálogo si no existe."""
        try:
            current = self.list_namespaces()
            if namespace in current:
                return True
            self.catalog.create_namespace(namespace)
            logger.info(f"Namespace '{namespace}' creado exitosamente.")
            return True
        except NamespaceAlreadyExistsError:
            return True
        except Exception as e:
            logger.error(f"Error creando namespace '{namespace}': {e}")
            raise

    def ensure_canonical_namespaces(self) -> Dict[str, bool]:
        """Garantiza la creación de los namespaces canónicos: bronze, silver, gold, quarantine."""
        results = {}
        for ns in CANONICAL_NAMESPACES:
            try:
                results[ns] = self.create_namespace_if_not_exists(ns)
            except Exception as e:
                logger.error(f"Error asegurando namespace '{ns}': {e}")
                results[ns] = False
        return results

    def list_tables(self, namespace: str) -> List[str]:
        """Lista las tablas existentes bajo un namespace dado."""
        try:
            tables = self.catalog.list_tables(namespace)
            result = []
            for t in tables:
                if isinstance(t, tuple) and len(t) == 2:
                    result.append(t[1])
                else:
                    result.append(str(t))
            return result
        except NoSuchNamespaceError:
            return []
        except Exception as e:
            logger.error(f"Error listando tablas en '{namespace}': {e}")
            raise

    def table_exists(self, namespace: str, table_name: str) -> bool:
        """Comprueba si una tabla Iceberg existe en el catálogo."""
        identifier = f"{namespace}.{table_name}"
        try:
            self.catalog.load_table(identifier)
            return True
        except NoSuchTableError:
            return False
        except Exception as e:
            logger.debug(f"Error comprobando tabla '{identifier}': {e}")
            return False

    def drop_table(self, namespace: str, table_name: str, purge: bool = False) -> bool:
        """Elimina una tabla Iceberg del catálogo."""
        identifier = f"{namespace}.{table_name}"
        try:
            self.catalog.drop_table(identifier, purge=purge)
            return True
        except NoSuchTableError:
            return False
        except Exception as e:
            logger.error(f"Error eliminando tabla '{identifier}': {e}")
            return False
