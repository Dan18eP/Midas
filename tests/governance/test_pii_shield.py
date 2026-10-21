"""Pruebas del Escudo PII en caliente y la clasificación en Atlas (HU-GOV-02).

Responsable: Sebastian Castiblanco (Governance Lead)

Offline: Atlas y Ranger se sustituyen por dobles, de modo que la suite corra
sin que el stack esté levantado.
"""

import json

import pytest

from src.lakehouse.transforms.bronze_to_silver import BronzeToSilverTransformer
from src.security_governance.atlas.atlas_client import (
    AtlasSettings,
    build_bulk_classification_payload,
    build_column_qualified_name,
)
from src.security_governance.atlas.audit_log import (
    GENESIS_HASH,
    PIIAuditLog,
    compute_entry_hash,
)
from src.security_governance.atlas.pii_classifier import (
    PII_CLASSIFICATION,
    DetectionSignal,
    PIICategory,
    classify_column,
    classify_records,
    passes_luhn,
)
from src.security_governance.atlas.pii_shield import PIIShield

# Número de tarjeta de prueba publicado por las redes de pago (válido por Luhn).
TARJETA_VALIDA = "4111111111111111"
TARJETA_INVALIDA = "4111111111111112"


class FakeAtlasClient:
    """Doble del cliente de Atlas con comportamiento programable."""

    def __init__(self, *, classify_ok=True, type_ok=True, ranger_tags=None):
        self.classify_ok = classify_ok
        self.type_ok = type_ok
        self.ranger_tags = ranger_tags
        self.calls = []
        self.ranger_polls = 0
        self.settings = AtlasSettings(
            base_url="http://atlas-doble:21000",
            username=None,
            password=None,
            timeout_seconds=1.0,
            ranger_url="http://ranger-doble:6080",
            tagsync_deadline_seconds=5.0,
        )

    def ensure_classification_type(self, classification=PII_CLASSIFICATION):
        return self.type_ok

    def classify_columns(self, table, columns, **kwargs):
        self.calls.append((table, list(columns)))
        return self.classify_ok

    def fetch_ranger_tag_names(self):
        self.ranger_polls += 1
        if callable(self.ranger_tags):
            return self.ranger_tags(self.ranger_polls)
        return self.ranger_tags


@pytest.fixture
def audit_log(tmp_path):
    return PIIAuditLog(path=str(tmp_path / "pii_audit.jsonl"))


def make_shield(audit_log, **atlas_kwargs):
    return PIIShield(atlas_client=FakeAtlasClient(**atlas_kwargs), audit_log=audit_log)


LOTE_CLIENTES = [
    {
        "id_cliente": 1,
        "nombre": "Ana Restrepo",
        "email_contacto": "ana.restrepo@empresa.com",
        "telefono": "+57 310 555 4210",
        "ciudad": "Medellín",
    },
    {
        "id_cliente": 2,
        "nombre": "Luis Gómez",
        "email_contacto": "luis.gomez@empresa.com",
        "telefono": "+57 320 444 1180",
        "ciudad": "Bogotá",
    },
]


# ---------------------------------------------------------------------------
# CA-1 — Clasificador por taxonomía
# ---------------------------------------------------------------------------
@pytest.mark.parametrize(
    "columna, valores, categoria",
    [
        ("email_contacto", ["ana@empresa.com"], PIICategory.EMAIL),
        ("numero_cedula", ["1020304050"], PIICategory.IDENTIFICACION),
        ("numero_tarjeta", [TARJETA_VALIDA], PIICategory.TARJETA_CREDITO),
        ("salario_mensual", [4500000], PIICategory.SALARIO),
        ("telefono", ["+57 310 555 4210"], PIICategory.TELEFONO),
    ],
)
def test_clasifica_las_categorias_de_la_taxonomia(columna, valores, categoria):
    resultado = classify_column(columna, valores)
    assert resultado is not None
    assert resultado.category is categoria
    assert resultado.classification == PII_CLASSIFICATION


@pytest.mark.parametrize("columna", ["nombre", "ciudad", "categoria_segmento", "cantidad"])
def test_no_clasifica_columnas_no_sensibles(columna):
    assert classify_column(columna, ["Medellín", "Bogotá"]) is None


def test_ignora_columnas_de_control_del_lakehouse():
    assert classify_column("_ingested_at", ["2026-10-20T10:00:00Z"]) is None
    assert classify_column("_raw_id", ["abc"]) is None


def test_detecta_por_contenido_aunque_el_nombre_no_lo_delate():
    resultado = classify_column("campo_libre", ["ana@empresa.com", "luis@empresa.com"])
    assert resultado is not None
    assert resultado.category is PIICategory.EMAIL
    assert resultado.signal is DetectionSignal.VALUE_PATTERN


def test_detecta_por_nombre_aunque_la_muestra_venga_vacia():
    resultado = classify_column("email_contacto", [None, ""])
    assert resultado is not None
    assert resultado.signal is DetectionSignal.COLUMN_NAME


def test_confianza_maxima_cuando_coinciden_nombre_y_contenido():
    resultado = classify_column("email_contacto", ["ana@empresa.com"])
    assert resultado.signal is DetectionSignal.BOTH
    assert resultado.confidence == 1.0


def test_luhn_descarta_secuencias_que_no_son_tarjetas():
    assert passes_luhn(TARJETA_VALIDA)
    assert not passes_luhn(TARJETA_INVALIDA)
    resultado = classify_column("codigo_interno", [TARJETA_INVALIDA])
    assert resultado is None or resultado.category is not PIICategory.TARJETA_CREDITO


def test_un_valor_anomalo_no_clasifica_la_columna_entera():
    valores = ["bogota", "medellin", "cali", "ana@empresa.com"]
    assert classify_column("ciudad", valores) is None


def test_escaneo_de_lote_reporta_columnas_sensibles():
    resultado = classify_records(LOTE_CLIENTES, source_name="clientes", batch_id="b1")
    assert resultado.has_pii
    assert set(resultado.sensitive_columns) == {"email_contacto", "telefono"}
    assert resultado.columns_scanned == 5


def test_escaneo_acota_la_muestra(monkeypatch):
    registros = [{"email_contacto": f"u{i}@empresa.com"} for i in range(500)]
    resultado = classify_records(
        registros, source_name="clientes", batch_id="b1", sample_size=10
    )
    assert resultado.classifications[0].sampled_values == 10


# ---------------------------------------------------------------------------
# CA-2 — Registro en Apache Atlas
# ---------------------------------------------------------------------------
def test_fqn_de_columna_respeta_el_cluster():
    fqn = build_column_qualified_name("silver.clientes@midas", "email_contacto")
    assert fqn == "silver.clientes.email_contacto@midas"


def test_payload_de_clasificacion_masiva_sigue_el_contrato_de_atlas():
    payload = build_bulk_classification_payload(
        "silver.clientes@midas", ["email_contacto", "telefono"]
    )
    assert payload["classification"]["typeName"] == PII_CLASSIFICATION
    assert payload["classification"]["propagate"] is True
    assert len(payload["entityUniqueAttributes"]) == 2
    assert (
        payload["entityUniqueAttributes"][0]["uniqueAttributes"]["qualifiedName"]
        == "silver.clientes.email_contacto@midas"
    )


def test_el_escudo_despacha_las_columnas_detectadas(audit_log):
    shield = make_shield(audit_log)
    reporte = shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="b1")

    assert reporte.wait(timeout=5) is True
    tabla, columnas = shield.atlas_client.calls[0]
    assert tabla == "silver.clientes@midas"
    assert set(columnas) == {"email_contacto", "telefono"}


def test_lote_sin_pii_no_llama_a_atlas(audit_log):
    shield = make_shield(audit_log)
    reporte = shield.scan_batch(
        [{"id_pedido": 1, "cantidad": 3}], source_name="pedidos", batch_id="b2"
    )

    assert not reporte.sensitive_columns
    assert shield.atlas_client.calls == []
    assert audit_log.read_entries() == []


def test_atlas_caido_no_interrumpe_el_escudo(audit_log):
    shield = make_shield(audit_log, classify_ok=False)
    reporte = shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="b3")

    assert reporte.wait(timeout=5) is False
    assert reporte.sensitive_columns  # la deteccion sigue siendo valida
    assert len(audit_log.read_entries()) == 1


def test_el_despacho_no_bloquea_el_lote(audit_log):
    import threading
    import time

    liberar = threading.Event()

    class AtlasLento(FakeAtlasClient):
        def classify_columns(self, table, columns, **kwargs):
            liberar.wait(timeout=5)
            return super().classify_columns(table, columns, **kwargs)

    shield = PIIShield(atlas_client=AtlasLento(), audit_log=audit_log)
    inicio = time.monotonic()
    reporte = shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="b4")
    transcurrido = time.monotonic() - inicio

    # scan_batch retorna sin esperar a Atlas.
    assert transcurrido < 1.0
    liberar.set()
    assert reporte.wait(timeout=5) is True


# ---------------------------------------------------------------------------
# CA-3 — Propagación hacia Ranger vía TagSync
# ---------------------------------------------------------------------------
def test_tagsync_confirmado_dentro_de_la_ventana(audit_log):
    shield = make_shield(audit_log, ranger_tags=[PII_CLASSIFICATION])
    resultado = shield.verify_tagsync(deadline_seconds=5.0, poll_interval_seconds=0.01)

    assert resultado.propagated is True
    assert resultado.within_deadline
    assert resultado.elapsed_seconds <= 5.0


def test_tagsync_espera_a_que_la_etiqueta_aparezca(audit_log):
    # Ranger responde sin la etiqueta en el primer sondeo y con ella en el segundo.
    shield = make_shield(
        audit_log,
        ranger_tags=lambda intento: [] if intento < 2 else [PII_CLASSIFICATION],
    )
    resultado = shield.verify_tagsync(deadline_seconds=5.0, poll_interval_seconds=0.01)

    assert resultado.propagated is True
    assert shield.atlas_client.ranger_polls >= 2


def test_tagsync_no_comprobable_si_ranger_no_responde(audit_log):
    shield = make_shield(audit_log, ranger_tags=None)
    resultado = shield.verify_tagsync(deadline_seconds=0.05, poll_interval_seconds=0.01)

    # None distingue "no desplegado" de "fallo de propagacion".
    assert resultado.propagated is None
    assert not resultado.within_deadline


def test_tagsync_fallido_si_ranger_responde_sin_la_etiqueta(audit_log):
    shield = make_shield(audit_log, ranger_tags=["OTRA_ETIQUETA"])
    resultado = shield.verify_tagsync(deadline_seconds=0.05, poll_interval_seconds=0.01)

    assert resultado.propagated is False
    assert not resultado.within_deadline


# ---------------------------------------------------------------------------
# CA-4 — Bitácora inmutable
# ---------------------------------------------------------------------------
def test_la_bitacora_registra_fecha_lote_tabla_y_columnas(audit_log):
    shield = make_shield(audit_log)
    shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="lote_42")

    entrada = audit_log.read_entries()[0]
    assert entrada["batch_id"] == "lote_42"
    assert entrada["source_name"] == "clientes"
    assert entrada["table"] == "silver.clientes@midas"
    assert {col["column"] for col in entrada["columns"]} == {"email_contacto", "telefono"}
    assert entrada["timestamp"].startswith("20")


def test_la_cadena_de_hashes_encadena_las_entradas(audit_log):
    shield = make_shield(audit_log)
    shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="l1")
    shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="l2")

    entradas = audit_log.read_entries()
    assert entradas[0]["prev_hash"] == GENESIS_HASH
    assert entradas[1]["prev_hash"] == entradas[0]["entry_hash"]
    assert audit_log.verify_chain()


def test_la_verificacion_detecta_una_entrada_alterada(audit_log):
    shield = make_shield(audit_log)
    shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="l1")
    shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="l2")
    assert audit_log.verify_chain()

    entradas = audit_log.read_entries()
    entradas[0]["source_name"] = "manipulado"
    audit_log.path.write_text(
        "\n".join(json.dumps(e) for e in entradas) + "\n", encoding="utf-8"
    )

    assert not audit_log.verify_chain()


def test_la_verificacion_detecta_una_entrada_eliminada(audit_log):
    shield = make_shield(audit_log)
    for lote in ("l1", "l2", "l3"):
        shield.scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id=lote)

    entradas = audit_log.read_entries()
    del entradas[1]
    audit_log.path.write_text(
        "\n".join(json.dumps(e) for e in entradas) + "\n", encoding="utf-8"
    )

    assert not audit_log.verify_chain()


def test_el_hash_de_entrada_es_determinista():
    payload = {
        "timestamp": "2026-10-20T10:00:00+00:00",
        "batch_id": "l1",
        "source_name": "clientes",
        "table": "silver.clientes@midas",
        "columns": [],
        "atlas_dispatched": False,
        "prev_hash": GENESIS_HASH,
    }
    assert compute_entry_hash(payload) == compute_entry_hash(dict(reversed(list(payload.items()))))


def test_la_bitacora_se_replica_en_el_bucket_de_gobernanza(tmp_path):
    class FakeMinio:
        def __init__(self):
            self.objetos = []

        def put_object(self, bucket, object_name, data, content_type):
            self.objetos.append((bucket, object_name, content_type))

    minio = FakeMinio()
    log = PIIAuditLog(path=str(tmp_path / "audit.jsonl"), minio_client=minio)
    make_shield(log).scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="l1")

    bucket, nombre, tipo = minio.objetos[0]
    assert bucket == "midas-governance"
    assert nombre.startswith("pii_audit/l1_")
    assert tipo == "application/json"


def test_un_fallo_de_replicacion_no_rompe_la_bitacora(tmp_path):
    class MinioCaido:
        def put_object(self, **kwargs):
            raise RuntimeError("MinIO caído")

    log = PIIAuditLog(path=str(tmp_path / "audit.jsonl"), minio_client=MinioCaido())
    make_shield(log).scan_batch(LOTE_CLIENTES, source_name="clientes", batch_id="l1")

    assert len(log.read_entries()) == 1
    assert log.verify_chain()


# ---------------------------------------------------------------------------
# Integración con la transformación Bronze -> Silver
# ---------------------------------------------------------------------------
def test_el_transformador_reporta_las_columnas_sensibles(audit_log):
    transformer = BronzeToSilverTransformer(pii_shield=make_shield(audit_log))
    resultado = transformer.process_batch(
        records=LOTE_CLIENTES,
        source_name="clientes",
        primary_key_fields=["id_cliente"],
        persist_to_storage=False,
    )

    assert resultado.pii_report is not None
    assert set(resultado.pii_report["sensitive_columns"]) == {"email_contacto", "telefono"}
    assert resultado.to_summary_dict()["pii_columns"]


def test_sin_escudo_el_transformador_se_comporta_igual_que_antes():
    transformer = BronzeToSilverTransformer()
    resultado = transformer.process_batch(
        records=LOTE_CLIENTES,
        source_name="clientes",
        primary_key_fields=["id_cliente"],
        persist_to_storage=False,
    )

    assert resultado.pii_report is None
    assert resultado.valid_count == 2


def test_un_escudo_que_falla_no_interrumpe_la_transformacion():
    class EscudoRoto:
        def scan_batch(self, *args, **kwargs):
            raise RuntimeError("gobernanza caída")

    transformer = BronzeToSilverTransformer(pii_shield=EscudoRoto())
    resultado = transformer.process_batch(
        records=LOTE_CLIENTES,
        source_name="clientes",
        primary_key_fields=["id_cliente"],
        persist_to_storage=False,
    )

    assert resultado.valid_count == 2
    assert resultado.pii_report is None
