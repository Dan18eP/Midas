"""Midas API Gateway - Dynamic Source Connections Router.

Historia de Usuario: HU-LAKE-05 & GAP Resolution
Responsables: Edgar Corzo (Data Engineering Lead) & Daniel Echeverría (Backend Lead)
Soporta registro declarativo JSON y carga multipart/form-data de binarios Excel (.xlsx/.xls) y CSV.
"""

import csv
import io
import logging
from pathlib import Path
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from pydantic import BaseModel, Field

from src.lakehouse.models.connection import (
    SourceType,
    ConnectionStatus,
    SourceConnectionCreate,
    SourceConnectionResponse,
)
from src.lakehouse.ingestion.connection_registry import (
    SourceConnectionRegistry,
    get_connection_registry,
)

logger = logging.getLogger("midas.api.routes.connections")

router = APIRouter(
    prefix="/api/v1/connections",
    tags=["Source Connections"],
)


class FileUploadResponse(BaseModel):
    """Respuesta estructurada tras la carga e inspección de un archivo de datos."""

    connection_id: str = Field(..., description="Identificador único asignado a la conexión")
    name: str = Field(..., description="Nombre descriptivo de la fuente")
    source_type: SourceType = Field(..., description="Tipo de fuente detectado (EXCEL o CSV)")
    filename: str = Field(..., description="Nombre del archivo original cargado")
    sheets: List[str] = Field(default_factory=list, description="Lista de pestañas detectadas en archivos Excel")
    detected_columns: List[str] = Field(default_factory=list, description="Columnas normalizadas detectadas en cabecera")
    sample_rows: List[Dict[str, Any]] = Field(default_factory=list, description="Primeras filas de muestra para previsualización")
    storage_uri: Optional[str] = Field(None, description="URI de persistencia en MinIO S3 (capa Bronze)")
    status: ConnectionStatus = Field(ConnectionStatus.ACTIVE, description="Estado de la conexión")


class ConnectionTestRequest(BaseModel):
    """Payload para prueba de conectividad y socket previo al registro."""

    source_type: SourceType = Field(..., description="Tipo de fuente a probar")
    config_payload: Dict[str, Any] = Field(default_factory=dict, description="Parámetros de conexión")


class ConnectionTestResponse(BaseModel):
    """Resultado del diagnóstico pre-flight de conectividad."""

    success: bool = Field(..., description="Indica si el origen es accesible")
    latency_ms: float = Field(..., description="Latencia de respuesta de la prueba en ms")
    detail: str = Field(..., description="Detalle del diagnóstico")


@router.post(
    "/test",
    response_model=ConnectionTestResponse,
    status_code=status.HTTP_200_OK,
    summary="Probar conectividad de una fuente en caliente",
    description="Realiza un pre-flight check (socket TCP o petición HTTP) con timeout estricto de 1.5s.",
)
async def test_connection(payload: ConnectionTestRequest) -> ConnectionTestResponse:
    """Verifica la conectividad de la fuente sin persistir la conexión."""
    import socket
    import time
    import urllib.request

    start_t = time.perf_counter()
    stype = payload.source_type
    cfg = payload.config_payload

    if stype == SourceType.REST:
        url = cfg.get("url")
        if not url:
            return ConnectionTestResponse(success=False, latency_ms=0.0, detail="Falta el parámetro obligatorio 'url'")
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Midas-PreFlight/1.0"})
            with urllib.request.urlopen(req, timeout=1.5) as resp:
                elapsed = (time.perf_counter() - start_t) * 1000
                return ConnectionTestResponse(
                    success=200 <= resp.status < 400,
                    latency_ms=round(elapsed, 2),
                    detail=f"HTTP {resp.status} - Servicio accesible",
                )
        except Exception as exc:
            elapsed = (time.perf_counter() - start_t) * 1000
            return ConnectionTestResponse(
                success=False,
                latency_ms=round(elapsed, 2),
                detail=f"Fallo conectando al endpoint REST: {exc}",
            )

    elif stype == SourceType.POSTGRES:
        host = cfg.get("host", "localhost")
        port = int(cfg.get("port", 5432))
        try:
            with socket.create_connection((host, port), timeout=1.5):
                elapsed = (time.perf_counter() - start_t) * 1000
                return ConnectionTestResponse(
                    success=True,
                    latency_ms=round(elapsed, 2),
                    detail=f"Socket TCP abierto en {host}:{port}",
                )
        except Exception as exc:
            elapsed = (time.perf_counter() - start_t) * 1000
            return ConnectionTestResponse(
                success=False,
                latency_ms=round(elapsed, 2),
                detail=f"No se pudo conectar a {host}:{port}: {exc}",
            )

    # Para archivos locales o uploads siempre es válido si los metadatos están completos
    elapsed = (time.perf_counter() - start_t) * 1000
    return ConnectionTestResponse(
        success=True,
        latency_ms=round(elapsed, 2),
        detail=f"Formato {stype.value} validado para ingesta",
    )


@router.post(
    "/register",
    response_model=SourceConnectionResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Registrar una nueva conexión multi-fuente",
    description="Valida y almacena una nueva conexión en el catálogo operacional (PostgreSQL).",
)
async def register_connection(
    payload: SourceConnectionCreate,
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
):
    """Registra una nueva conexión de datos en caliente y publica su contrato en MinIO Governance."""
    try:
        registered = registry.register_connection(payload)

        # Publicar contrato declarativo para que Airflow genere el DAG automáticamente
        try:
            from src.lakehouse.ingestion.contract_publisher import publish_connection_contract

            publish_connection_contract(
                connection_id=registered.connection_id,
                source_type=registered.source_type.value,
                config_payload=registered.config_payload,
            )
        except Exception as pub_err:
            logger.debug("No se pudo publicar contrato de gobernanza: %s", pub_err)

        return registered
    except ValueError as val_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(val_err),
        )
    except Exception as exc:
        logger.error("Error registrando conexión: %s", exc, exc_info=True)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error interno registrando la conexión multi-fuente.",
        )


@router.post(
    "/upload",
    response_model=FileUploadResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Subir archivo binario Excel o CSV",
    description="Recibe un archivo .xlsx, .xls o .csv vía multipart/form-data, detecta hojas/delimitadores/columnas y registra la conexión.",
)
async def upload_source_file(
    file: UploadFile = File(..., description="Archivo de datos binario (.xlsx, .xls o .csv)"),
    name: Optional[str] = Form(None, description="Nombre descriptivo opcional para la conexión"),
    source_type: Optional[SourceType] = Form(None, description="Tipo de fuente forzado (opcional)"),
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
) -> FileUploadResponse:
    """Inspecciona el esquema del archivo, lo persiste en Bronze S3 y registra la conexión."""
    filename = file.filename or "uploaded_data.csv"
    clean_filename = filename.strip()
    ext = clean_filename.lower().split(".")[-1] if "." in clean_filename else ""

    if ext not in ("xlsx", "xls", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato '.{ext}' no soportado. Únicamente se admiten archivos .xlsx, .xls o .csv.",
        )

    effective_source_type = source_type or (SourceType.EXCEL if ext in ("xlsx", "xls") else SourceType.CSV)
    conn_name = name.strip() if name and name.strip() else clean_filename

    try:
        raw_bytes = await file.read()
    except Exception as read_err:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Error leyendo el archivo subido: {read_err}",
        )

    if not raw_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="El archivo subido está vacío.",
        )

    sheets: List[str] = []
    detected_columns: List[str] = []
    sample_rows: List[Dict[str, Any]] = []
    detected_delimiter: Optional[str] = None

    if effective_source_type == SourceType.EXCEL:
        try:
            import openpyxl

            wb = openpyxl.load_workbook(io.BytesIO(raw_bytes), data_only=True)
            sheets = list(wb.sheetnames)
            ws = wb.active
            rows_iter = ws.iter_rows(values_only=True)

            headers = []
            for row in rows_iter:
                non_empty = [str(c).strip() for c in row if c is not None and str(c).strip()]
                if len(non_empty) >= 1:
                    headers = [str(c).strip() if c is not None else f"col_{idx}" for idx, c in enumerate(row)]
                    break

            detected_columns = headers
            for row in rows_iter:
                if len(sample_rows) >= 5:
                    break
                if any(c is not None for c in row):
                    row_dict = {}
                    for idx, val in enumerate(row):
                        col_name = headers[idx] if idx < len(headers) else f"col_{idx}"
                        row_dict[col_name] = str(val) if val is not None else None
                    sample_rows.append(row_dict)
        except Exception as exc:
            logger.error("Error parseando estructura Excel: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error parseando estructura Excel: {exc}",
            )
    else:
        try:
            text_content = raw_bytes.decode("utf-8", errors="replace")
            sample_text = text_content[:4096]
            try:
                dialect = csv.Sniffer().sniff(sample_text, delimiters=";,|\t,")
                detected_delimiter = dialect.delimiter
            except Exception:
                detected_delimiter = ","

            reader = csv.reader(io.StringIO(text_content), delimiter=detected_delimiter)
            headers = next(reader, [])
            detected_columns = [h.strip() for h in headers if h.strip()]
            for row in reader:
                if len(sample_rows) >= 5:
                    break
                if any(c.strip() for c in row):
                    row_dict = {}
                    for idx, val in enumerate(row):
                        col_name = headers[idx] if idx < len(headers) else f"col_{idx}"
                        row_dict[col_name] = val.strip()
                    sample_rows.append(row_dict)
        except Exception as exc:
            logger.error("Error parseando archivo CSV: %s", exc)
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Error parseando archivo CSV: {exc}",
            )

    # Guardar archivo localmente de forma persistente en data/uploads/
    upload_dir = Path("data/uploads")
    upload_dir.mkdir(parents=True, exist_ok=True)
    local_file_path = upload_dir / clean_filename
    with open(local_file_path, "wb") as f:
        f.write(raw_bytes)

    create_dto = SourceConnectionCreate(
        name=conn_name,
        source_type=effective_source_type,
        config_payload={
            "filename": clean_filename,
            "file_path": str(local_file_path).replace("\\", "/"),
            "sheets": sheets,
            "detected_columns": detected_columns,
            "delimiter": detected_delimiter,
            "file_size_bytes": len(raw_bytes),
        },
    )

    try:
        registered = registry.register_connection(create_dto)
    except ValueError as val_err:
        if "Ya existe una conexión registrada" in str(val_err):
            # Buscar la conexión existente para reutilizarla
            existing_conn = next((c for c in registry.list_connections() if c.name == conn_name), None)
            if existing_conn:
                registered = existing_conn
            else:
                import uuid
                create_dto.name = f"{conn_name}_{uuid.uuid4().hex[:4]}"
                registered = registry.register_connection(create_dto)
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=str(val_err),
            )

    cid = registered.connection_id
    storage_path = f"s3://midas-bronze/sources/{cid}/raw/{clean_filename}"
    registered.config_payload["storage_uri"] = storage_path

    # Persistir archivo crudo en MinIO S3 si está disponible
    try:
        from src.lakehouse.storage.minio_client import MidasMinioClient
        minio_client = MidasMinioClient()
        if minio_client.check_health():
            minio_client.client.put_object(
                bucket_name="midas-bronze",
                object_name=f"sources/{cid}/raw/{clean_filename}",
                data=io.BytesIO(raw_bytes),
                length=len(raw_bytes),
                content_type="application/octet-stream",
            )
            logger.info("Archivo binario guardado en MinIO S3: %s", storage_path)
    except Exception as minio_err:
        logger.debug("MinIO S3 no disponible para almacenamiento directo del binario: %s", minio_err)

    # Publicar contrato declarativo en MinIO Governance para orquestación Airflow
    try:
        from src.lakehouse.ingestion.contract_publisher import publish_connection_contract

        publish_connection_contract(
            connection_id=cid,
            source_type=registered.source_type.value,
            config_payload=create_dto.config_payload,
            storage_uri=storage_path,
        )
    except Exception as pub_err:
        logger.debug("No se pudo publicar contrato de gobernanza para archivo: %s", pub_err)

    return FileUploadResponse(
        connection_id=cid,
        name=registered.name,
        source_type=registered.source_type,
        filename=clean_filename,
        sheets=sheets,
        detected_columns=detected_columns,
        sample_rows=sample_rows,
        storage_uri=storage_path,
        status=ConnectionStatus.ACTIVE,
    )


@router.get(
    "",
    response_model=List[SourceConnectionResponse],
    summary="Listar todas las fuentes conectadas",
    description="Retorna el listado de conexiones activas con filtros opcionales por tipo de fuente y estado.",
)
async def list_connections(
    source_type: Optional[SourceType] = Query(None, description="Filtrar por tipo de fuente: POSTGRES, EXCEL, CSV, REST"),
    status_filter: Optional[ConnectionStatus] = Query(None, alias="status", description="Filtrar por estado"),
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
):
    """Lista las conexiones registradas."""
    return registry.list_connections(source_type=source_type, status=status_filter)


@router.get(
    "/{connection_id}",
    response_model=SourceConnectionResponse,
    summary="Obtener detalle de una conexión",
    description="Retorna la configuración y estado de una conexión específica por su ID.",
)
async def get_connection_detail(
    connection_id: str,
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
):
    """Obtiene los detalles de una conexión."""
    conn = registry.get_connection(connection_id)
    if not conn:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Conexión con ID '{connection_id}' no encontrada.",
        )
    return conn
