"""
Midas Lakehouse - Unit and Integration Tests for Source Connections & MinIO Isolation
Historia de Usuario: HU-LAKE-05
Responsable: Edgar Corzo (Data Engineering Lead)
Documentos Canónicos:
  - documentation/06_nuevo_backlog_mvp_dorado.md
  - documentation/adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md
"""

from datetime import datetime, timezone
import io
import json
import pytest
from starlette.testclient import TestClient

import pyarrow as pa
import pyarrow.parquet as pq

from src.api.main import app
from src.lakehouse.models.connection import (
    SourceType,
    ConnectionStatus,
    SourceConnectionCreate,
    SourceConnectionResponse,
)
from src.lakehouse.ingestion.connection_registry import (
    SourceConnectionRegistry,
    get_connection_registry,
    reset_connection_registry,
)
from src.lakehouse.ingestion.universal_engine import (
    UniversalIngestionEngine,
    IngestionResult,
)


@pytest.fixture(autouse=True)
def clean_registry():
    """Reinicia el singleton del registro de conexiones antes de cada prueba."""
    reset_connection_registry()
    yield
    reset_connection_registry()


# ==============================================================================
# 1. Tests Unitarios del Registro de Conexiones (Repositorio)
# ==============================================================================

def test_connection_registry_seed_defaults():
    """Valida que el registro se inicialice con las conexiones canónicas de Midas."""
    registry = get_connection_registry()
    connections = registry.list_connections()

    assert len(connections) >= 3
    conn_ids = [c.connection_id for c in connections]
    assert "conn_pg_crm_default" in conn_ids
    assert "conn_excel_budget_default" in conn_ids
    assert "conn_rest_crm_default" in conn_ids


def test_connection_registration_all_types():
    """Valida el registro exitoso de conexiones para los 4 tipos de fuentes."""
    registry = get_connection_registry()

    types_to_test = [
        (SourceType.POSTGRES, "Base de Datos Logística PG", {"host": "pg-logistics", "db": "logistics"}),
        (SourceType.EXCEL, "Reporte Ventas Excel 2026", {"file_path": "data/ventas.xlsx"}),
        (SourceType.CSV, "Catálogo Productos CSV", {"delimiter": ",", "encoding": "utf-8"}),
        (SourceType.REST, "API Proveedores REST", {"url": "https://api.suppliers.io/v1"}),
    ]

    for stype, name, payload in types_to_test:
        dto = SourceConnectionCreate(name=name, source_type=stype, config_payload=payload)
        res = registry.register_connection(dto)

        assert res.connection_id.startswith(f"conn_{stype.value.lower()}_")
        assert res.name == name
        assert res.source_type == stype
        assert res.status == ConnectionStatus.ACTIVE
        assert res.config_payload == payload


def test_connection_registration_duplicate_name_rejection():
    """Valida que no se permitan nombres duplicados (case-insensitive)."""
    registry = get_connection_registry()

    dto1 = SourceConnectionCreate(
        name="CRM Regional Occidente",
        source_type=SourceType.POSTGRES,
        config_payload={"host": "pg-occidente"},
    )
    registry.register_connection(dto1)

    # Intento con exactamente el mismo nombre
    with pytest.raises(ValueError, match="Ya existe una conexión"):
        registry.register_connection(dto1)

    # Intento con variaciones de mayúsculas/minúsculas y espacios
    dto2 = SourceConnectionCreate(
        name="  crm regional occidente  ",
        source_type=SourceType.POSTGRES,
        config_payload={"host": "pg-occidente-2"},
    )
    with pytest.raises(ValueError, match="Ya existe una conexión"):
        registry.register_connection(dto2)


def test_connection_filtering_by_type_and_status():
    """Valida el filtrado en listado por source_type y status."""
    registry = get_connection_registry()

    # Añadir una conexión CSV
    registry.register_connection(
        SourceConnectionCreate(name="Fuente CSV Prueba", source_type=SourceType.CSV)
    )

    csv_list = registry.list_connections(source_type=SourceType.CSV)
    assert len(csv_list) == 1
    assert csv_list[0].source_type == SourceType.CSV

    pg_list = registry.list_connections(source_type=SourceType.POSTGRES)
    assert len(pg_list) >= 1
    assert all(c.source_type == SourceType.POSTGRES for c in pg_list)


# ==============================================================================
# 2. Tests de Endpoints REST en FastAPI (/api/v1/connections)
# ==============================================================================

def test_api_register_connection_success():
    """Valida el endpoint POST /api/v1/connections/register con respuesta 201 Created."""
    client = TestClient(app)

    payload = {
        "name": "Feed de Facturación Electrónica",
        "source_type": "REST",
        "config_payload": {
            "endpoint_url": "https://facturacion.dian.gov.co/api/v1",
            "auth_scheme": "BearerToken",
        },
    }

    response = client.post("/api/v1/connections/register", json=payload)
    assert response.status_code == 201
    data = response.json()

    assert data["name"] == "Feed de Facturación Electrónica"
    assert data["source_type"] == "REST"
    assert data["status"] == "ACTIVE"
    assert "connection_id" in data
    assert data["connection_id"].startswith("conn_rest_")


def test_api_register_connection_duplicate_conflict():
    """Valida que un nombre duplicado en la API retorne 400 Bad Request."""
    client = TestClient(app)

    payload = {
        "name": "Almacén Central Inventarios",
        "source_type": "POSTGRES",
        "config_payload": {"db": "inventarios"},
    }

    res1 = client.post("/api/v1/connections/register", json=payload)
    assert res1.status_code == 201

    res2 = client.post("/api/v1/connections/register", json=payload)
    assert res2.status_code == 400
    assert "Ya existe una conexión" in res2.json()["detail"]


def test_api_register_connection_invalid_source_type():
    """Valida que un tipo de fuente desconocido arroje 422 Unprocessable Entity."""
    client = TestClient(app)

    payload = {
        "name": "Fuente Desconocida",
        "source_type": "KAFKA_STREAM",  # No soportado
    }

    res = client.post("/api/v1/connections/register", json=payload)
    assert res.status_code == 422


def test_api_list_connections_and_filter():
    """Valida el endpoint GET /api/v1/connections con y sin query params."""
    client = TestClient(app)

    # Registrar conexión CSV
    client.post("/api/v1/connections/register", json={
        "name": "Auditoría Financiera CSV",
        "source_type": "CSV",
    })

    # Listar todas
    res_all = client.get("/api/v1/connections")
    assert res_all.status_code == 200
    all_conns = res_all.json()
    assert len(all_conns) >= 4

    # Filtrar por source_type
    res_filtered = client.get("/api/v1/connections?source_type=CSV")
    assert res_filtered.status_code == 200
    csv_conns = res_filtered.json()
    assert len(csv_conns) == 1
    assert csv_conns[0]["name"] == "Auditoría Financiera CSV"


def test_api_get_connection_by_id():
    """Valida el endpoint GET /api/v1/connections/{connection_id}."""
    client = TestClient(app)

    # Conexión existente
    res = client.get("/api/v1/connections/conn_pg_crm_default")
    assert res.status_code == 200
    assert res.json()["name"] == "CRM Operacional PostgreSQL"

    # Conexión inexistente -> 404
    res_404 = client.get("/api/v1/connections/conn_inexistente_999")
    assert res_404.status_code == 404


# ==============================================================================
# 3. Tests de Formato Parquet (Snappy) y Aislamiento en MinIO S3
# ==============================================================================

class MockMinioClient:
    """Mock en memoria para verificar la escritura en MinIO S3 sin contenedor activo."""
    def __init__(self):
        self.objects: dict[str, dict[str, Any]] = {}

    def put_object(self, bucket: str, object_name: str, data: bytes, content_type: str = ""):
        self.objects[f"{bucket}/{object_name}"] = {
            "bucket": bucket,
            "object_name": object_name,
            "data": data,
            "content_type": content_type,
        }
        return "mock_etag_123"


def test_parquet_snappy_persistence_in_bronze():
    """
    Valida que los datos en Bronze se escriban en formato Parquet
    con compresión Snappy y contenido binario íntegro.
    """
    mock_minio = MockMinioClient()
    engine = UniversalIngestionEngine(minio_client=mock_minio)

    records = [
        {"_raw_id": "RAW-01", "cliente_id": "C-1", "monto": 1500.0},
        {"_raw_id": "RAW-02", "cliente_id": "C-2", "monto": 2500.0},
    ]

    s3_path = engine._persist_to_bronze_storage(
        source_type="JDBC_POSTGRES",
        source_origin="public.clientes",
        batch_id="batch_test_01",
        records=records,
        connection_id="conn_crm_bogota",
    )

    assert s3_path is not None
    assert s3_path.startswith("s3://midas-bronze/sources/conn_crm_bogota/public.clientes/")
    assert s3_path.endswith("/batch_test_01.parquet")

    # Extraer el binario guardado en el mock
    saved_key = list(mock_minio.objects.keys())[0]
    saved_obj = mock_minio.objects[saved_key]

    assert saved_obj["content_type"] == "application/vnd.apache.parquet"

    # Leer el buffer con PyArrow Parquet para confirmar formato y compresión Snappy
    parquet_buffer = io.BytesIO(saved_obj["data"])
    parquet_file = pq.ParquetFile(parquet_buffer)

    # Verificar compresión Snappy en metadatos
    column_meta = parquet_file.metadata.row_group(0).column(0)
    assert column_meta.compression == "SNAPPY"

    # Leer tabla de vuelta y verificar filas
    read_table = parquet_file.read()
    assert len(read_table) == 2
    assert read_table.column("_raw_id").to_pylist() == ["RAW-01", "RAW-02"]


def test_multi_source_non_collision_partitioning():
    """
    Criterio de Aceptación: Múltiples fuentes inyectadas no colisionan en prefijos de MinIO.
    Verifica que dos conexiones diferentes ingiriendo el mismo dataset 'transacciones'
    tengan rutas completamente aisladas bajo su propio <connection_id>.
    """
    mock_minio = MockMinioClient()
    engine = UniversalIngestionEngine(minio_client=mock_minio)

    conn_bogota = "conn_pg_bogota_01"
    conn_medellin = "conn_pg_medellin_02"
    dataset_name = "crm_transacciones"
    fixed_time = datetime(2026, 10, 20, 12, 0, 0, tzinfo=timezone.utc)

    path_bogota = engine.build_bronze_storage_path(
        connection_id=conn_bogota,
        dataset=dataset_name,
        batch_id="batch_01",
        timestamp=fixed_time,
    )

    path_medellin = engine.build_bronze_storage_path(
        connection_id=conn_medellin,
        dataset=dataset_name,
        batch_id="batch_01",
        timestamp=fixed_time,
    )

    # Las rutas deben ser distintas y contener el connection_id respectivo
    assert path_bogota != path_medellin
    assert path_bogota == "sources/conn_pg_bogota_01/crm_transacciones/year=2026/month=10/day=20/batch_01.parquet"
    assert path_medellin == "sources/conn_pg_medellin_02/crm_transacciones/year=2026/month=10/day=20/batch_01.parquet"

    # Ejecutar persistencia en el mock para ambas
    engine._persist_to_bronze_storage("JDBC_POSTGRES", dataset_name, "batch_01", [{"id": 1}], connection_id=conn_bogota)
    engine._persist_to_bronze_storage("JDBC_POSTGRES", dataset_name, "batch_01", [{"id": 2}], connection_id=conn_medellin)

    assert len(mock_minio.objects) == 2
    stored_keys = list(mock_minio.objects.keys())
    assert any("conn_pg_bogota_01" in k for k in stored_keys)
    assert any("conn_pg_medellin_02" in k for k in stored_keys)


def test_quarantine_isolated_paths():
    """Valida la generación de rutas aisladas para incidentes de cuarentena (ADR-009)."""
    mock_minio = MockMinioClient()
    engine = UniversalIngestionEngine(minio_client=mock_minio)

    conn_id = "conn_rest_tickets_01"
    incident_data = {
        "error_type": "NEGATIVE_AMOUNT",
        "bad_record": {"id": 99, "monto": -50.0},
    }

    q_path = engine.persist_to_quarantine(
        connection_id=conn_id,
        incident_data=incident_data,
        incident_id="inc_007",
    )

    assert q_path is not None
    assert q_path.startswith("s3://midas-quarantine/incidents/conn_rest_tickets_01/")
    assert q_path.endswith("/incident_inc_007.json")

    saved_key = list(mock_minio.objects.keys())[0]
    saved_data = json.loads(mock_minio.objects[saved_key]["data"].decode("utf-8"))
    assert saved_data["error_type"] == "NEGATIVE_AMOUNT"


# ==============================================================================
# 5. Tests del Endpoint de Carga de Archivos Binarios (POST /connections/upload)
# ==============================================================================

def test_upload_file_csv_success():
    """Valida la carga multipart/form-data de un archivo CSV y registro automático."""
    client = TestClient(app)
    csv_content = b"id,producto,precio,categoria\n1,Laptop,1200.50,Tecnologia\n2,Mouse,25.00,Accesorios\n"

    response = client.post(
        "/api/v1/connections/upload",
        files={"file": ("ventas_octubre.csv", io.BytesIO(csv_content), "text/csv")},
        data={"name": "Ventas Octubre 2026 CSV"},
    )
    assert response.status_code == 201
    data = response.json()

    assert data["connection_id"].startswith("conn_csv_")
    assert data["source_type"] == "CSV"
    assert data["detected_columns"] == ["id", "producto", "precio", "categoria"]
    assert len(data["sample_rows"]) == 2
    assert "s3://midas-bronze/sources/" in data["storage_uri"]

    # Verificar que quedó registrado en el ConnectionRegistry
    reg = get_connection_registry()
    saved = reg.get_connection(data["connection_id"])
    assert saved is not None
    assert saved.name == "Ventas Octubre 2026 CSV"


def test_upload_same_file_twice_reuses_existing_connection():
    """Reimportar el mismo archivo con el mismo nombre no debe fallar por duplicado."""
    client = TestClient(app)
    csv_content = b"id,producto,precio\n1,Laptop,1200.50\n"

    first = client.post(
        "/api/v1/connections/upload",
        files={"file": ("Walmart_Sales_normalized_v2.csv", io.BytesIO(csv_content), "text/csv")},
        data={"name": "Walmart_Sales_normalized_v2"},
    )
    assert first.status_code == 201
    first_data = first.json()

    second = client.post(
        "/api/v1/connections/upload",
        files={"file": ("Walmart_Sales_normalized_v2.csv", io.BytesIO(csv_content), "text/csv")},
        data={"name": "Walmart_Sales_normalized_v2"},
    )
    assert second.status_code == 201
    second_data = second.json()

    assert second_data["connection_id"] == first_data["connection_id"]
    assert second_data["name"] == "Walmart_Sales_normalized_v2"


def test_upload_file_excel_success():
    """Valida la carga multipart/form-data de un archivo Excel (.xlsx) y extracción de hojas."""
    import openpyxl

    client = TestClient(app)

    wb = openpyxl.Workbook()
    ws = wb.active
    ws.title = "Presupuesto2026"
    ws.append(["codigo", "departamento", "monto_asignado"])
    ws.append(["DP-01", "Finanzas", 500000.0])
    ws.append(["DP-02", "Operaciones", 850000.0])

    excel_buf = io.BytesIO()
    wb.save(excel_buf)
    excel_bytes = excel_buf.getvalue()

    response = client.post(
        "/api/v1/connections/upload",
        files={"file": ("presupuesto_q4.xlsx", io.BytesIO(excel_bytes), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")},
        data={"name": "Presupuesto Q4 2026 Excel"},
    )
    assert response.status_code == 201
    data = response.json()

    assert data["connection_id"].startswith("conn_excel_")
    assert data["source_type"] == "EXCEL"
    assert data["detected_columns"] == ["codigo", "departamento", "monto_asignado"]
    assert "Presupuesto2026" in data["sheets"]
    assert len(data["sample_rows"]) == 2
    assert "s3://midas-bronze/sources/" in data["storage_uri"]


def test_upload_file_unsupported_format_rejected():
    """Valida el rechazo con HTTP 400 para extensiones no soportadas."""
    client = TestClient(app)
    bad_content = b"%PDF-1.4 dummy binary content"

    response = client.post(
        "/api/v1/connections/upload",
        files={"file": ("documento.pdf", io.BytesIO(bad_content), "application/pdf")},
        data={"name": "Reporte PDF Invalido"},
    )
    assert response.status_code == 400
    assert "no soportado" in response.json()["detail"]
