"""
Midas - Pruebas Automatizadas de Inmutabilidad y Concurrencia en Linaje Canónico
Historia de Usuario / Auditoría: Blindaje contra mutaciones de memoria global
Autor: Daniel Echeverría (Lead Architect)
"""

import copy
from src.core.lineage.canonical_lineage import (
    DEFAULT_CLIENTES_STAGES,
    DEFAULT_PEDIDOS_STAGES,
    get_table_lineage,
)


def test_canonical_stages_module_constants_remain_immutable():
    """Verifica que invocar get_table_lineage con nombres dinámicos nunca mute las constantes del módulo."""
    original_pedidos_snapshot = copy.deepcopy(DEFAULT_PEDIDOS_STAGES)
    original_clientes_snapshot = copy.deepcopy(DEFAULT_CLIENTES_STAGES)

    # Invocar con múltiples tablas dinámicas
    res1 = get_table_lineage("gold.fact_ventas_diarias")
    res2 = get_table_lineage("gold.ventas_departamento_it")
    res3 = get_table_lineage("gold.dim_clientes_premium")
    res4 = get_table_lineage("gold.analisis_ad_hoc_2026")

    # Verificar que los resultados reflejen la tabla solicitada
    assert res1["stages"][-1]["table"] == "gold.fact_ventas_diarias"
    assert res2["stages"][-1]["table"] == "gold.ventas_departamento_it"
    assert res3["stages"][-1]["table"] == "gold.dim_clientes_premium"
    assert res4["stages"][-1]["table"] == "gold.analisis_ad_hoc_2026"

    # Verificar que las constantes de módulo siguen idénticas a sus snapshots originales
    assert DEFAULT_PEDIDOS_STAGES == original_pedidos_snapshot
    assert DEFAULT_CLIENTES_STAGES == original_clientes_snapshot


def test_mutation_of_returned_lineage_stages_does_not_pollute_subsequent_calls():
    """Verifica que mutar el diccionario retornado no altere llamadas posteriores."""
    res1 = get_table_lineage("gold.fact_ventas")
    
    # Mutar el resultado intencionalmente
    res1["stages"][-1]["table"] = "TABLA_CORRUPTA"
    res1["stages"][0]["location"] = "UBICACION_CORRUPTA"

    # Segunda llamada limpia
    res2 = get_table_lineage("gold.fact_ventas")
    assert res2["stages"][-1]["table"] == "gold.fact_ventas"
    assert res2["stages"][0]["location"] == "midas-postgres:5432/midas_operational"
