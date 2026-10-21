"""Midas API Gateway - Dynamic Source Connections Router.

Historia de Usuario: HU-LAKE-05 & GAP Resolution
Responsables: Edgar Corzo (Data Engineering Lead) & Daniel Echeverría (Backend Lead)
Soporta registro declarativo JSON y carga multipart/form-data de binarios Excel (.xlsx/.xls) y CSV.
"""

import csv
import io
import logging
from pathlib import PurePosixPath
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
    """Registra una nueva conexión de datos en caliente."""
    try:
        registered = registry.register_connection(payload)
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
    primary_key_fields: str = Form(""),
    amount_fields: str = Form(""),
    date_fields: str = Form(""),
    registry: SourceConnectionRegistry = Depends(get_connection_registry),
) -> FileUploadResponse:
    """Inspecciona el esquema del archivo, lo persiste en Bronze S3 y registra la conexión."""
    filename = file.filename or "uploaded_data.csv"
    clean_filename = PurePosixPath(filename.replace("\\", "/")).name.strip()
    ext = clean_filename.lower().split(".")[-1] if "." in clean_filename else ""

    if ext not in ("xlsx", "csv"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Formato '.{ext}' no soportado. Únicamente se admiten archivos .xlsx, .xls o .csv.",
        )

    effective_source_type = source_type or (SourceType.EXCEL if ext in ("xlsx", "xls") else SourceType.CSV)
    if effective_source_type != (SourceType.EXCEL if ext == "xlsx" else SourceType.CSV):
        raise HTTPException(status_code=400, detail="File type does not match its extension")
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

    create_dto = SourceConnectionCreate(
        name=conn_name,
        source_type=effective_source_type,
        config_payload={
            "filename": clean_filename,
            "sheets": sheets,
            "detected_columns": detected_columns,
            "delimiter": detected_delimiter,
            "file_size_bytes": len(raw_bytes),
            "silver": {"primary_key_fields": [field.strip() for field in primary_key_fields.split(",") if field.strip()] or ["_raw_payload_hash"],
                       "amount_fields": [field.strip() for field in amount_fields.split(",") if field.strip()],
                       "date_fields": [field.strip() for field in date_fields.split(",") if field.strip()]},
        },
    )

    cid = registry._generate_connection_id(effective_source_type, conn_name)
    storage_path = f"s3://midas-bronze/sources/{cid}/raw/{clean_filename}"

    # Persistir archivo crudo en MinIO S3 si está disponible
    try:
        from src.lakehouse.storage.minio_client import MidasMinioClient
        minio_client = MidasMinioClient()
        minio_client.put_object("midas-bronze", f"sources/{cid}/raw/{clean_filename}", raw_bytes)
    except Exception as minio_err:
        logger.warning("File storage failed: %s", type(minio_err).__name__)
        raise HTTPException(status_code=503, detail="The file could not be stored") from None

    # Register only after the shared file is actually available.
    create_dto.config_payload["storage_uri"] = storage_path
    try:
        registered = registry.register_connection(create_dto, connection_id=cid)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception:
        raise HTTPException(status_code=503, detail="The source could not be activated") from None

    return FileUploadResponse(
        connection_id=registered.connection_id,
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
