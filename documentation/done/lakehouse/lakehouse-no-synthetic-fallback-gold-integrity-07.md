# Erradicacion de Datos Sinteticos en Ingesta y Proteccion de Gold Operativo

> **Entrega:** HU-LAKE-07 / HU-AGENT-14 (Integridad de datos y aislamiento de pruebas)  
> **Rama Git:** `feature/agent-deterministic-gold-queries` (PR #78)  
> **Responsable:** Edgar Corzo (Data Engineering Lead)  
> **Fecha:** 22-10-2026

---

## 1. Problema Detectado

El Copiloto ofrecia el año **2026** como disponible aunque el CSV cargado (Walmart Sales)
solo contiene informacion de **2010, 2011 y 2012**. Al consultar "ventas por region 2026"
el agente devolvia una cifra inexistente (2.048.000), construida a partir de filas de prueba.

Causa raiz: `UniversalIngestionEngine` generaba un lote sintetico con `datetime.now()`
cuando no podia leer la fuente (ruta ausente, conexion fallida o archivo vacio). Ese lote
sintetico se propagaba a Silver y Gold, agregando filas con el año en curso. Ademas, la
suite `tests/api` disparaba el pipeline real y escribia esas filas en el Iceberg operativo.

## 2. Correcciones Implementadas

### 2.1 Guard de produccion en `UniversalIngestionEngine`
- Nuevo parametro `fallback_for_testing` (autodetectado con `MIDAS_TEST_MODE`,
  `MIDAS_TESTING=1` o `PYTEST_CURRENT_TEST`).
- Si no se extraen registros reales y no estamos en testing, se lanza `ValueError`
  explicito. Midas ya no inventa filas sinteticas en produccion.
- El fallback sintetico se conserva unicamente para pruebas controladas.

### 2.2 Eliminacion de año hardcodeado en el pipeline
- Se elimino el fallback `fecha = "2026-MM-01"` en `src/api/routes/pipelines.py`.
  La fecha solo se construye a partir de año/mes presentes en el dato original.

### 2.3 Aislamiento de la suite de API
- `trigger_pipeline` calcula `persist_iceberg = not is_test_env`. En pruebas ya no se
  escribe en `gold.fact_ventas` ni en `gold.dim_tiendas_regiones`, evitando contaminar
  el catalogo Iceberg operativo al ejecutar `pytest`.

### 2.4 Limpieza de datos contaminados
- Se eliminaron 16 filas con `anio = 2026` de `gold.fact_ventas`.
- Estado verificado: **2010 (2.160 filas), 2011 (2.341), 2012 (1.935)**. Sin 2026.

## 3. Verificacion

| Verificacion | Resultado |
|---|---|
| Suite backend (`lakehouse`, `api`, `agent`, `backend`, `core`) | **214 passed** |
| `gold.fact_ventas` tras ejecutar la suite completa | Solo años 2010, 2011, 2012 |
| Aclaracion del Copiloto | "Años disponibles en tus datos: 2010, 2011, 2012. También puedes escribir \"todos\"." |
| Consulta `ventas por region 2026` | Sin cifras inventadas (respuesta honesta sin datos) |

## 4. Pruebas Añadidas

- `tests/lakehouse/test_universal_ingestion.py`
  - `test_ingest_source_sin_registros_reales_falla_en_produccion`
  - `test_ingest_source_fallback_sintetico_solo_en_modo_testing`

## 5. Archivos Modificados

- `src/lakehouse/ingestion/universal_engine.py`
- `src/api/routes/pipelines.py`
- `tests/lakehouse/test_universal_ingestion.py`
- `documentation/changelog/22-10-2026-changelog.md`
