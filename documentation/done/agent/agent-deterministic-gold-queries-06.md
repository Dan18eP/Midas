# HU-AGENT-14: Consultas deterministicas sobre Gold, anios dinamicos y graficos agrupados

- **ID:** HU-AGENT-14 (subsanacion operativa del Copiloto)
- **Responsable:** Edgar Corzo
- **Rama:** `feature/agent-deterministic-gold-queries`
- **Modulo:** `src/agent/`, `src/api/routes/agent.py`, `src/core/query_engine/trino_client.py`
- **Documento canonico:** `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Documento de datos:** `documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md`
- **Estado:** Implementado y verificado contra Trino/Gold local.

## Problema observado

1. El Copiloto ofrecia anios fijos (`2024, 2025, 2026`) que no existian en los datos reales importados.
2. Las preguntas de ventas terminaban en tablas Silver inexistentes y el cliente Trino devolvia filas sinteticas de demostracion (`1.350.000`, `2.520.000`, `850.000`) en lugar de datos Gold.
3. El fallback deterministico no soportaba `GROUP BY`, por lo que preguntas como "ventas por region" o "ventas por mes" fallaban o no generaban grafico.
4. La introspeccion del catalogo Trino fallaba si el esquema `silver` no existia, dejando al agente sin las tablas Gold reales.

## Solucion implementada

### 1. Anios dinamicos desde Gold

- `make_proactive_suggest(year_provider)` consulta los anios distintos reales de `gold.fact_ventas.anio`.
- La aclaracion muestra solo los anios presentes en los datos y ofrece la opcion `todos`.
- Si la consulta de metadatos falla, pide el anio sin inventar valores fijos.
- `available_sales_years()` en `src/api/routes/agent.py` alimenta el grafo con los anios reales.

### 2. Datos Gold reales y sin fixtures en produccion

- El router deterministico prioriza `gold.fact_ventas`, luego `gold.fct_ventas_diarias`, luego otros marts Gold y finalmente Silver.
- La metrica canonica para "ventas" o "ingresos" es `venta_neta`.
- `TrinoClient` solo usa el motor deterministico de fixtures cuando `fallback_for_testing=True`. En produccion, una tabla o columna inexistente devuelve un error explicito y el agente informa que no encontro datos reales.
- El catalogo del agente expone siempre el contrato canonico Gold, aunque la introspeccion de Trino falle o `silver` no exista.
- La introspeccion consulta primero los esquemas existentes y luego las columnas por esquema, evitando fallos por namespaces ausentes.

### 3. GROUP BY y graficos

- Se admite una dimension por consulta: `region_id`, `mes`, `anio`, `tienda_id`, `canal_venta`, `cliente_id`, `dia` o `estado`.
- Se admiten variantes Top N: `Top 5 tiendas por ventas en 2011`.
- Las agrupaciones categoricas ordenan por la metrica descendente (barras horizontales).
- Las agrupaciones temporales (`mes`, `anio`, `dia`, `fecha`) ordenan cronologicamente para que la linea de ECharts sea correcta.
- El sintetizador ECharts existente genera barras para categorias y lineas con area para series temporales; no fue necesario modificar el frontend.

### 4. Prioridad deterministica sobre el LLM

- Para intenciones soportadas por la plantilla certificada, `ModelRouter` devuelve la consulta deterministica sin invocar a Gemini/Ollama.
- El modelo se usa solo para intenciones fuera del contrato analitico soportado.
- Si el modelo falla y la plantilla tampoco aplica, el agente falla sin ejecutar SQL.

## Verificacion local

Consultas ejecutadas contra el catalogo Gold real:

| Pregunta | Resultado |
| :--- | :--- |
| `Cual es el total de ventas 2011?` | `2.449.382.740,35` (sin fixtures) |
| `Ventas por region en 2011` | 3 filas, grafico `bar` |
| `Ventas por mes en 2011` | 12 filas, grafico `line` en orden enero->diciembre |
| `Top 5 tiendas por ventas en 2011` | 5 filas, grafico `bar` |
| `Quiero ver las ventas` | Anios reales: `2010, 2011, 2012, 2026` + opcion `todos` |

Pruebas automatizadas ejecutadas dentro de la imagen `midas-api` (Python 3.11):

```powershell
python -m pytest tests/agent/test_qwen_inference.py tests/agent/test_gemini_inference.py `
  tests/agent/test_langgraph_flow.py tests/agent/test_storytelling.py `
  tests/api/test_agent_endpoint.py tests/backend/test_trino_query_engine.py -q
```

Resultado: **55 passed**.

## Revision anti-deriva

- [x] Se actualizaron primero los documentos canonicos 03 y 06.
- [x] No se modificaron las formulas canonicas; `venta_neta` sigue siendo la metrica oficial de ventas.
- [x] No se agregaron ni cambiaron tablas o columnas del lakehouse.
- [x] Los cambios se limitan al agente, su ruta API y el cliente Trino compartido.
- [x] Se agregaron pruebas para anios dinamicos, filtro por anio, agrupaciones, Top N, metrica canonica, graficos y ausencia de fixtures en produccion.

## Coordinacion e impacto

El cambio toca `src/core/query_engine/trino_client.py` para eliminar el fallback sintetico en produccion. Es una correccion de comportamiento, no un cambio de arquitectura ni de esquema, por lo que no requiere un ADR nuevo. El contrato de `TrinoClient` se mantiene: `fallback_for_testing=True` conserva el motor deterministico para pruebas sin cluster.

> Nota de entorno: durante la verificacion local se creo manualmente `iceberg.silver` para desbloquear una introspeccion previa. El codigo nuevo ya no depende de que `silver` exista, porque consulta los esquemas disponibles y expone el contrato Gold canonico.
