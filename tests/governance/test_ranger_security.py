"""Pruebas de las políticas Zero-Trust de Apache Ranger (HU-GOV-03).

Responsable: Sebastian Castiblanco (Governance Lead)

Offline: validan las políticas declaradas y el motor que las aplica sobre la
consulta antes de enviarla a Trino. No requieren Ranger ni el stack levantado.
"""

import concurrent.futures
import statistics
import time

import pytest

from src.security_governance.ranger.policy_engine import (
    PolicyEnforcementError,
    apply_policies,
)
from src.security_governance.ranger.policy_store import (
    MASK_TYPE_CUSTOM,
    MASK_TYPE_HASH,
    MASK_TYPE_NONE,
    MASK_TYPE_NULL,
    clear_cache,
    declared_roles,
    load_masking_policy,
    load_row_filter_policy,
    resolve_masking_rule,
    resolve_row_filter_rule,
)

# Roles canónicos de documentation/canonical/05 seccion 3.2.
ROL_ADMIN = "director_general"
ROL_GERENTE = "gerente_norte"
ROL_ANALISTA = "analista_externo"

CONSULTA_PII = "SELECT id_cliente, email_contacto, telefono, region FROM gold.dim_clientes"
CONSULTA_METRICAS = "SELECT region, SUM(total_neto) AS venta FROM gold.fact_ventas_diarias GROUP BY region"

# Overhead maximo admitido por CA-3 / ST-GOV-03.4.
LATENCIA_MAXIMA_MS = 15.0


@pytest.fixture(autouse=True)
def _reset_cache():
    clear_cache()
    yield
    clear_cache()


@pytest.fixture(autouse=True)
def _enforcement_activo(monkeypatch):
    monkeypatch.delenv("RANGER_LOCAL_ENFORCEMENT", raising=False)


# ---------------------------------------------------------------------------
# Políticas declaradas en formato nativo de Ranger
# ---------------------------------------------------------------------------
def test_las_politicas_de_enmascaramiento_son_de_tipo_masking():
    documento = load_masking_policy()
    assert documento["serviceType"] == "trino"

    for policy in documento["policies"]:
        assert policy["policyType"] == 1
        assert policy["isEnabled"] is True
        assert policy["isAuditEnabled"] is True


def test_el_enmascaramiento_se_ancla_a_los_tags_de_atlas():
    tags = {
        tag
        for policy in load_masking_policy()["policies"]
        for tag in policy["resources"]["tag"]["values"]
    }
    assert "PII_CONFIDENCIAL" in tags
    assert {"PII_EMAIL", "PII_TELEFONO", "PII_IDENTIFICACION"} <= tags


def test_la_politica_de_filas_es_de_tipo_row_filter():
    policy = load_row_filter_policy()
    assert policy["policyType"] == 2
    assert "gold" in policy["resources"]["schema"]["values"]


def test_las_politicas_cubren_los_tres_roles_canonicos():
    roles = declared_roles()
    assert set(roles) == {ROL_ADMIN, ROL_GERENTE, ROL_ANALISTA}


# ---------------------------------------------------------------------------
# CA-1 — Enmascaramiento dinámico por rol
# ---------------------------------------------------------------------------
def test_el_analista_recibe_sustitucion_parcial_de_correo():
    regla = resolve_masking_rule(ROL_ANALISTA, "EMAIL")
    assert regla.mask_type == MASK_TYPE_CUSTOM
    assert "regexp_replace" in regla.render("email_contacto").lower()


def test_cada_categoria_tiene_su_propia_expresion():
    # Un correo conserva el dominio; un telefono conserva los ultimos digitos.
    # Aplicar la expresion del correo a un telefono lo dejaria SIN enmascarar.
    email = resolve_masking_rule(ROL_ANALISTA, "EMAIL").render("email_contacto")
    telefono = resolve_masking_rule(ROL_ANALISTA, "TELEFONO").render("telefono")

    assert email != telefono
    assert "@" in email
    assert "substr" in telefono.lower()


def test_las_expresiones_no_usan_lookahead():
    # Trino evalua las expresiones con RE2, que no soporta lookarounds.
    for categoria in ("EMAIL", "TELEFONO", "IDENTIFICACION", "TARJETA_CREDITO"):
        regla = resolve_masking_rule(ROL_ANALISTA, categoria)
        if regla and regla.value_expr:
            assert "(?=" not in regla.value_expr
            assert "(?!" not in regla.value_expr
            assert "(?<" not in regla.value_expr


def test_el_salario_se_anula_para_roles_sin_privilegio():
    regla = resolve_masking_rule(ROL_ANALISTA, "SALARIO")
    assert regla.mask_type == MASK_TYPE_NULL
    assert "NULL" in regla.render("salario_mensual").upper()


def test_el_gerente_recibe_hash_irreversible():
    regla = resolve_masking_rule(ROL_GERENTE, "EMAIL")
    assert regla.mask_type == MASK_TYPE_HASH
    assert "sha256" in regla.render("email_contacto").lower()


def test_el_admin_accede_en_claro():
    for categoria in ("EMAIL", "TELEFONO", "SALARIO", None):
        regla = resolve_masking_rule(ROL_ADMIN, categoria)
        assert regla.mask_type == MASK_TYPE_NONE
        assert regla.is_passthrough


def test_una_categoria_desconocida_cae_en_la_politica_general():
    regla = resolve_masking_rule(ROL_ANALISTA, "CATEGORIA_INEXISTENTE")
    assert regla.tag == "PII_CONFIDENCIAL"
    assert regla.mask_type == MASK_TYPE_HASH


def test_la_consulta_del_analista_enmascara_las_columnas_pii():
    decision = apply_policies(CONSULTA_PII, ROL_ANALISTA)

    assert set(decision.masked_columns) == {"email_contacto", "telefono"}
    efectiva = decision.effective_sql.lower()
    assert "regexp_replace" in efectiva
    # El telefono no puede quedar con la expresion pensada para correos
    # (sqlglot normaliza substr a substring al serializar para Trino).
    assert "length(telefono)" in efectiva
    # Las columnas no sensibles quedan intactas.
    assert "id_cliente" in decision.effective_sql
    assert "region" in decision.effective_sql


def test_la_consulta_del_admin_no_se_reescribe():
    decision = apply_policies(CONSULTA_PII, ROL_ADMIN)

    assert decision.masked_columns == []
    assert decision.row_filter_applied is None
    assert not decision.was_rewritten


def test_una_consulta_sin_columnas_pii_no_se_toca():
    sql = "SELECT id_cliente, ciudad FROM gold.dim_clientes"
    decision = apply_policies(sql, ROL_ANALISTA)

    assert decision.masked_columns == []
    assert not decision.was_rewritten


# ---------------------------------------------------------------------------
# CA-2 — Filtrado por filas
# ---------------------------------------------------------------------------
def test_el_gerente_norte_recibe_el_predicado_territorial():
    regla = resolve_row_filter_rule(ROL_GERENTE)
    assert regla.filter_expr == "region = 'NORTE'"

    decision = apply_policies(CONSULTA_METRICAS, ROL_GERENTE)
    assert decision.row_filter_applied == "region = 'NORTE'"
    assert "WHERE" in decision.effective_sql.upper()
    assert "NORTE" in decision.effective_sql


def test_el_filtro_se_suma_a_un_where_existente():
    sql = "SELECT region, total_neto FROM gold.fact_ventas_diarias WHERE total_neto > 100"
    decision = apply_policies(sql, ROL_GERENTE)

    efectiva = decision.effective_sql.upper()
    assert "TOTAL_NETO > 100" in efectiva
    assert "NORTE" in decision.effective_sql
    assert efectiva.count("WHERE") == 1


def test_los_roles_sin_restriccion_territorial_no_reciben_filtro():
    for rol in (ROL_ADMIN, ROL_ANALISTA):
        assert resolve_row_filter_rule(rol).is_unrestricted
        assert apply_policies(CONSULTA_METRICAS, rol).row_filter_applied is None


def test_el_filtro_no_aplica_a_tablas_fuera_del_recurso():
    # El recurso de la politica cubre los esquemas gold y silver, no bronze.
    sql = "SELECT region FROM bronze.pedidos"
    decision = apply_policies(sql, ROL_GERENTE)

    assert decision.row_filter_applied is None


def test_sin_rol_la_consulta_pasa_intacta():
    decision = apply_policies(CONSULTA_PII, None)
    assert not decision.was_rewritten
    assert decision.masked_columns == []


def test_el_motor_se_puede_delegar_en_el_plugin_de_ranger(monkeypatch):
    monkeypatch.setenv("RANGER_LOCAL_ENFORCEMENT", "false")
    decision = apply_policies(CONSULTA_PII, ROL_ANALISTA)

    assert not decision.was_rewritten
    assert decision.masked_columns == []


# ---------------------------------------------------------------------------
# Postura de seguridad: falla cerrado
# ---------------------------------------------------------------------------
def test_select_estrella_se_rechaza_si_hay_enmascaramiento():
    # Sin enumerar columnas no se puede saber cuales proteger: se rechaza en
    # lugar de enviar la consulta sin enmascarar.
    with pytest.raises(PolicyEnforcementError, match="SELECT \\*"):
        apply_policies("SELECT * FROM gold.dim_clientes", ROL_ANALISTA)


def test_select_estrella_se_permite_a_un_rol_sin_enmascaramiento():
    decision = apply_policies("SELECT * FROM gold.dim_clientes", ROL_ADMIN)
    assert not decision.was_rewritten


def test_sql_no_parseable_se_rechaza_cuando_aplica_una_politica():
    with pytest.raises(PolicyEnforcementError):
        apply_policies("SELECT DESDE DONDE ((", ROL_GERENTE)


# ---------------------------------------------------------------------------
# CA-3 / ST-GOV-03.4 — Overhead de latencia
# ---------------------------------------------------------------------------
def test_el_overhead_por_consulta_no_supera_los_15_ms():
    # Se descartan las primeras iteraciones: cargan el YAML y calientan sqlglot.
    for _ in range(5):
        apply_policies(CONSULTA_PII, ROL_ANALISTA)

    medidas = []
    for _ in range(50):
        inicio = time.perf_counter()
        apply_policies(CONSULTA_PII, ROL_ANALISTA)
        medidas.append((time.perf_counter() - inicio) * 1000)

    promedio = statistics.mean(medidas)
    p95 = sorted(medidas)[int(len(medidas) * 0.95) - 1]

    assert promedio < LATENCIA_MAXIMA_MS, f"promedio {promedio:.2f} ms"
    assert p95 < LATENCIA_MAXIMA_MS, f"p95 {p95:.2f} ms"


def test_el_overhead_reportado_coincide_con_el_medido():
    decision = apply_policies(CONSULTA_METRICAS, ROL_GERENTE)
    assert 0 < decision.overhead_ms < LATENCIA_MAXIMA_MS


# ---------------------------------------------------------------------------
# ST-GOV-03.3 — Consultas concurrentes con distintos usuarios
# ---------------------------------------------------------------------------
def test_roles_concurrentes_no_se_contaminan_entre_si():
    esperado = {
        ROL_ANALISTA: ("regexp_replace", None),
        ROL_GERENTE: ("sha256", "region = 'NORTE'"),
        ROL_ADMIN: (None, None),
    }

    def ejecutar(rol):
        decision = apply_policies(CONSULTA_PII, rol)
        return rol, decision

    with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool:
        futuros = [pool.submit(ejecutar, rol) for rol in list(esperado) * 10]
        resultados = [futuro.result() for futuro in futuros]

    assert len(resultados) == 30
    for rol, decision in resultados:
        marca, filtro = esperado[rol]
        if marca is None:
            assert not decision.was_rewritten, f"{rol} no debia reescribirse"
        else:
            assert marca in decision.effective_sql.lower(), f"{rol} sin enmascaramiento"
        assert decision.row_filter_applied == filtro, f"{rol} con filtro inesperado"
