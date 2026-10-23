# HU-AGENT-14: Consultas deterministicas sobre Gold, anios dinamicos y graficos agrupados

- **ID:** HU-AGENT-14 (subsanacion operativa del Copiloto)
- **Responsable:** Edgar Corzo
- **Rama:** `feature/agent-deterministic-gold-queries`
- **Modulo:** `src/agent/`, `src/lakehouse/transforms/silver_to_gold.py`, `src/api/routes/agent.py`, `src/core/query_engine/trino_client.py`
- **Documento canonico:** `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Documento de datos:** `documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md`
- **Estado:** Implementado y verificado contra Trino/Gold local.

## Problema observado

1. El Copiloto ofrecia anios fijos (`2024, 2025, 2026`) que no existian en los datos reales importados.
2. Las preguntas de ventas terminaban en tablas Silver inexistentes y el cliente Trino devolvia filas sinteticas de demostracion (`1.350.000`, `2.520.000`, `850.000`) en lugar de datos Gold.
3. El fallback deterministico no soportaba `GROUP BY`, por lo que preguntas como "ventas por region" o "ventas por mes" fallaban o no generaban grafico.
4. La introspeccion del catalogo Trino fallaba si el esquema `silver` no existia, dejando al agente sin las tablas Gold reales.
5. Formulaciones como "ranking de regiones por venta neta" o "region con mayor venta neta" no detectaban la dimension y devolvian el total global en lugar del desglose.
6. "Canal de venta con mejor ticket promedio" priorizaba la palabra "venta" sobre `ticket_promedio`, devolviendo `AVG(venta_neta)` en lugar del ticket por canal.
7. Reimportar el mismo CSV volvia a ejecutar el pipeline y duplicaba las filas Gold, inflando los totales que consumia el Copiloto.
8. La narrativa y `metrics_summary` mostraban solo el nombre de la metrica, sin indicar a que region, canal o periodo correspondia cada cifra.

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

### 3.1. Ranking, superlativos y metrica explicita

- `_RANKING_RE` reconoce `ranking`, `top`, `mejor`, `peor`, `mayor`, `menor` y `principales` aunque la pregunta no use la forma `por <dimension>`.
- "Ranking de regiones por venta neta en 2011" genera `SELECT region_id, SUM(venta_neta) ... GROUP BY region_id`.
- "Region con mayor venta neta" y "canal con mejor ticket promedio" generan `LIMIT 1` para devolver un unico ganador.
- `_METRIC_SYNONYMS` resuelve primero las metricas explicitas. `ticket_promedio` tiene prioridad sobre la deteccion generica de "venta", por lo que el ticket por canal usa `AVG(ticket_promedio)`.
- Los superlativos de ventas siguen usando `SUM(venta_neta)`; el promedio solo se aplica cuando la pregunta lo pide o la metrica ya es un promedio canonico.

### 3.2. Etiquetas de dimension en narrativa y chips

- `dimension_columns()` identifica dimensiones categoricas y temporales, incluidas las numericas como `mes` o `anio`.
- `metric_columns()` excluye esas dimensiones de la lista de metricas para no reportar `mes` o `anio` como si fueran cifras de negocio.
- La narrativa muestra `region_id=REG-NORTE · venta_neta` en lugar de solo `venta_neta`.
- `metrics_summary` conserva la etiqueta contextual y agrega `dimensions` (`{"region_id": "REG-NORTE"}`) para el drawer de linaje y los chips.
- La validacion anti-alucinacion sigue rechazando cifras que no provengan de Trino; los digitos de identificadores como `TND-001` se permiten solo porque provienen de la fila consultada.

### 3.3. Reingesta idempotente de Gold

- `SilverToGoldTransformer._upsert_unique_rows()` combina las filas existentes con las nuevas y conserva una sola fila por clave natural.
- Claves usadas: `tienda_id` en `gold.dim_tiendas_regiones` y `fecha, anio, mes, dia, region_id, tienda_id, cliente_id, canal_venta` en `gold.fct_ventas_diarias` y `gold.fact_ventas`.
- La escritura reemplaza el snapshot Gold con el conjunto deduplicado; reimportar el mismo CSV ya no duplica hechos ni dimensiones.
- Se limpiaron los duplicados existentes y las 4 filas residuales `anio=2026` de `gold.fct_ventas_diarias`.
- Gold quedo reconciliado con el CSV real: 2010 = 2.160 filas / 2.288.886.120,41; 2011 = 2.340 filas / 2.448.200.007,35; 2012 = 1.935 filas / 2.000.132.859,35.

### 4. Prioridad deterministica sobre el LLM

- Para intenciones soportadas por la plantilla certificada, `ModelRouter` devuelve la consulta deterministica sin invocar a Gemini/Ollama.
- El modelo se usa solo para intenciones fuera del contrato analitico soportado.
- Si el modelo falla y la plantilla tampoco aplica, el agente falla sin ejecutar SQL.

## Verificacion local

Consultas ejecutadas contra el catalogo Gold real:

| Pregunta | Resultado |
| :--- | :--- |
| `Cual es el total de ventas 2011?` | `2.448.200.007,35` (suma exacta del CSV) |
| `Ventas por region en 2011` | 3 filas, grafico `bar`, etiquetas `REG-NORTE/CENTRO/SUR` |
| `Hazme un ranking de regiones por venta neta en 2011` | 3 filas ordenadas, `region_id=... · venta_neta` |
| `Ventas por mes en 2011` | 12 filas, grafico `line` en orden enero->diciembre |
| `Top 5 tiendas por ventas en 2011` | 5 filas, grafico `bar` |
| `Que canal de venta tuvo mejor ticket promedio en 2012?` | 1 fila, `canal_venta=TIENDA · ticket_promedio = 1.033.660,39` |
| `Quiero ver las ventas` | Anios reales: `2010, 2011, 2012` + opcion `todos` |

Pruebas automatizadas ejecutadas dentro de la imagen `midas-api` (Python 3.11):

```powershell
python -m pytest tests/agent/test_qwen_inference.py tests/agent/test_storytelling.py `
  tests/lakehouse/test_silver_to_gold.py -q
```

Resultado: **41 passed**. Suite backend funcional: **308 pruebas pasando** (306 en la corrida
completa y 2 pruebas de latencia de Ranger re-ejecutadas aisladas). Los 9 tests de
infraestructura que fallan lo hacen porque el contenedor `midas-api` no monta
`docker-compose.yml`, `docker/`, `scripts/` ni `.env.example`, no por los cambios funcionales.

Verificacion E2E por API (`POST /api/v1/agent/chat`) con las dos preguntas reportadas:
la respuesta incluye la dimension junto a la metrica, las cifras coinciden con Gold y
`echarts_option` usa barras horizontales con `region_id` o `canal_venta` como categoria.

## Revision anti-deriva

- [x] Se actualizaron primero los documentos canonicos 03 y 06.
- [x] No se modificaron las formulas canonicas; `venta_neta` sigue siendo la metrica oficial de ventas.
- [x] No se agregaron ni cambiaron tablas o columnas del lakehouse.
- [x] Los cambios se limitan al agente, su ruta API y el cliente Trino compartido.
- [x] Se agregaron pruebas para anios dinamicos, filtro por anio, agrupaciones, Top N, metrica canonica, graficos y ausencia de fixtures en produccion.
- [x] Se agregaron pruebas para ranking sin `por`, superlativos, prioridad de `ticket_promedio`, etiquetas de dimension y upsert idempotente de Gold.
- [x] No se alteraron formulas canonicas ni se agregaron columnas/tablas; la reingesta usa la clave natural ya existente.

## Coordinacion e impacto

El cambio toca `src/core/query_engine/trino_client.py` para eliminar el fallback sintetico en produccion. Es una correccion de comportamiento, no un cambio de arquitectura ni de esquema, por lo que no requiere un ADR nuevo. El contrato de `TrinoClient` se mantiene: `fallback_for_testing=True` conserva el motor deterministico para pruebas sin cluster.

> Nota de entorno: durante la verificacion local se creo manualmente `iceberg.silver` para desbloquear una introspeccion previa. El codigo nuevo ya no depende de que `silver` exista, porque consulta los esquemas disponibles y expone el contrato Gold canonico.
