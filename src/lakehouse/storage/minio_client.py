"""
Midas Lakehouse - MinIO S3 Storage Client
Historia de Usuario: HU-LAKE-01
Responsable: Edgar Corzo (Data Engineering Lead)
"""

import io
import os
import logging
from typing import List, Dict, Optional
import urllib.parse

try:
    from minio import Minio
    from minio.error import S3Error
except ImportError:
    Minio = None
    S3Error = Exception

try:
    import httpx
except ImportError:
    httpx = None

logger = logging.getLogger("midas.lakehouse.storage.minio")

# 5 Buckets canónicos del Lakehouse Medallón según Especificación 03 y ADR-001
CANONICAL_BUCKETS: List[str] = [
    "midas-bronze",
    "midas-silver",
    "midas-gold",
    "midas-quarantine",
    "midas-governance",
]


class MidasMinioClient:
    """Cliente para administración y operaciones de almacenamiento S3 en MinIO."""

    def __init__(
        self,
        endpoint: Optional[str] = None,
        access_key: Optional[str] = None,
        secret_key: Optional[str] = None,
        secure: bool = False,
    ):
        raw_endpoint = endpoint or os.getenv("MINIO_ENDPOINT", "http://localhost:9000")
        
        # Extraer host y puerto limpios para la librería minio (sin http://)
        parsed = urllib.parse.urlparse(raw_endpoint if "://" in raw_endpoint else f"http://{raw_endpoint}")
        self.endpoint_host = parsed.netloc or parsed.path
        self.raw_endpoint = f"{parsed.scheme or 'http'}://{self.endpoint_host}"
        
        # Si corre en host externo a la red Docker y midas-minio no resuelve, redirigir a localhost
        if "midas-minio" in self.endpoint_host:
            try:
                import socket
                socket.gethostbyname("midas-minio")
            except Exception:
                self.endpoint_host = self.endpoint_host.replace("midas-minio", "localhost")
                self.raw_endpoint = self.raw_endpoint.replace("midas-minio", "localhost")

        self.secure = secure or (parsed.scheme == "https")
        
        self.access_key = access_key or os.getenv("MINIO_ROOT_USER", "midas_minio_admin")
        self.secret_key = secret_key or os.getenv("MINIO_ROOT_PASSWORD", "midas_minio_secret_2026")

        self._client: Optional[Minio] = None
        if Minio is not None:
            try:
                import urllib3
                pool = urllib3.PoolManager(
                    timeout=urllib3.Timeout(connect=2.0, read=5.0),
                    retries=urllib3.Retry(total=1, connect=1, read=1, status=0),
                )
                self._client = Minio(
                    self.endpoint_host,
                    access_key=self.access_key,
                    secret_key=self.secret_key,
                    secure=self.secure,
                    http_client=pool,
                )
            except Exception as e:
                logger.warning(f"No se pudo inicializar Minio SDK directamente: {e}")

    @property
    def client(self) -> Minio:
        if self._client is None:
            if Minio is None:
                raise RuntimeError("Librería 'minio' no está instalada en el entorno.")
            import urllib3
            pool = urllib3.PoolManager(
                timeout=urllib3.Timeout(connect=2.0, read=5.0),
                retries=urllib3.Retry(total=1, connect=1, read=1, status=0),
            )
            self._client = Minio(
                self.endpoint_host,
                access_key=self.access_key,
                secret_key=self.secret_key,
                secure=self.secure,
                http_client=pool,
            )
        return self._client

    def check_health(self, timeout_sec: float = 1.0) -> bool:
        """Verifica la conectividad y disponibilidad de MinIO con timeout corto."""
        # 1. Intentar probe HTTP rápido primero para evitar bloqueos
        if httpx is not None:
            try:
                with httpx.Client(timeout=timeout_sec) as http:
                    resp = http.get(f"{self.raw_endpoint}/minio/health/live")
                    if resp.status_code == 200:
                        return True
            except Exception:
                return False

        # 2. Intentar vía SDK de MinIO
        if self._client is not None:
            try:
                self._client.list_buckets()
                return True
            except Exception:
                return False

        return False

    def list_buckets(self) -> List[str]:
        """Retorna la lista de nombres de buckets existentes en MinIO."""
        try:
            buckets = self.client.list_buckets()
            return [b.name for b in buckets]
        except Exception as e:
            logger.error(f"Error listando buckets en MinIO: {e}")
            raise

    def bucket_exists(self, bucket_name: str) -> bool:
        """Comprueba si un bucket específico existe."""
        try:
            return self.client.bucket_exists(bucket_name)
        except Exception as e:
            logger.error(f"Error verificando bucket '{bucket_name}': {e}")
            return False

    def create_bucket_if_not_exists(self, bucket_name: str) -> bool:
        """Crea el bucket si no existe previamente. Retorna True si ya existía o fue creado."""
        try:
            if not self.client.bucket_exists(bucket_name):
                self.client.make_bucket(bucket_name)
                logger.info(f"Bucket creado exitosamente: {bucket_name}")
            return True
        except Exception as e:
            logger.error(f"Error creando bucket '{bucket_name}': {e}")
            raise

    def ensure_canonical_buckets(self) -> Dict[str, bool]:
        """Aprovisiona y garantiza la existencia de los 5 buckets canónicos de Midas."""
        results = {}
        for bucket in CANONICAL_BUCKETS:
            try:
                existed_or_created = self.create_bucket_if_not_exists(bucket)
                results[bucket] = existed_or_created
            except Exception as e:
                logger.error(f"Fallo aprovisionamiento de bucket '{bucket}': {e}")
                results[bucket] = False
        return results

    def put_object(
        self,
        bucket: str,
        object_name: str,
        data: bytes,
        content_type: str = "application/octet-stream",
    ) -> str:
        """Escribe un objeto en MinIO S3 y retorna su etag identificador."""
        stream = io.BytesIO(data)
        length = len(data)
        result = self.client.put_object(
            bucket_name=bucket,
            object_name=object_name,
            data=stream,
            length=length,
            content_type=content_type,
        )
        return result.etag

    def get_object(self, bucket: str, object_name: str) -> bytes:
        """Descarga los bytes de un objeto almacenado en MinIO."""
        response = self.client.get_object(bucket, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def list_objects(self, bucket: str, prefix: str = "", max_items: Optional[int] = None) -> List[str]:
        """Lista los nombres de objetos existentes bajo un prefijo en un bucket."""
        objects = self.client.list_objects(bucket, prefix=prefix, recursive=True)
        res: List[str] = []
        for obj in objects:
            res.append(obj.object_name)
            if max_items is not None and len(res) >= max_items:
                break
        return res

    def delete_object(self, bucket: str, object_name: str) -> bool:
        """Elimina un objeto del bucket."""
        try:
            self.client.remove_object(bucket, object_name)
            return True
        except Exception as e:
            logger.error(f"Error eliminando objeto '{object_name}' en '{bucket}': {e}")
            return False
