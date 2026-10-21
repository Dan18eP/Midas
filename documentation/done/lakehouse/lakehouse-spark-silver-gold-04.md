# HU-LAKE-04: PySpark Silver $\rightarrow$ Gold Business Marts & KPI Aggregations

- **ID de la Historia:** `HU-LAKE-04`
- **Título Oficial:** PySpark Silver $\rightarrow$ Gold Business Marts & KPI Aggregations
- **Rama Oficial:** `feature/lakehouse-spark-silver-gold`
- **Responsables:** Edgar Corzo (Data Engineering Lead) & Daniel Echeverría (Backend Lead)
- **Revisor Oficial:** Daniel Echeverría (Backend Lead & Líder de Proyecto)
- **Fecha de Entrega:** 20 de Octubre de 2026
- **Documentos Canónicos de Referencia:**
  - [`documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md`](../../canonical/03_especificacion_base_de_datos_y_lakehouse.md)
  - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../canonical/04_logica_de_negocio_y_resiliencia_guardian.md)
  - [`documentation/04_product_backlog.md`](../../04_product_backlog.md#L170-L187)
  - [`documentation/05_sprint_backlog_detallado.md`](../../05_sprint_backlog_detallado.md#L159-L177)

---

## 1. Verificación de Criterios de Aceptación (100% Cumplidos)

| Criterio de Aceptación | Estado | Evidencia de Implementación |
| :--- | :---: | :--- |
| **1. Materialización del mart `gold.fct_ventas_diarias` y `gold.dim_tiendas_regiones`** | ✅ Cumplido | Modelado dimensional en `src/lakehouse/models/gold_marts.py` (`FctVentasDiariasRecord`, `DimTiendasRegionesRecord`), esquemas PyIceberg/PyArrow oficiales y agregación analítica en `src/lakehouse/transforms/silver_to_gold.py`. |
| **2. Implementación de métricas canónicas oficiales (Venta Neta y Ticket Promedio)** | ✅ Cumplido | Implementado en `calculate_canonical_kpis()` con precisión decimal exacta (`ROUND_HALF_UP`):<br>$$\text{Venta Neta} = \sum(\text{monto\_bruto} - \text{descuento} - \text{devoluciones})$$<br>$$\text{Ticket Promedio} = \frac{\text{Venta Neta}}{\text{Conteo de Pedidos Válidos}}$$<br>Exclusión de cancelaciones previas al despacho y salvaguarda de división por cero ($0.00$). |
| **3. Particionado por año y mes (`partition_by: ["anio", "mes"]`) con Z-Ordering en IDs de clientes y regiones** | ✅ Cumplido | Extracción determinística de componentes de fecha `(anio, mes, dia)` y ordenamiento multidimensional (Z-Ordering) por `(region_id, cliente_id)` implementado en `transform_and_aggregate_sales()`. |
| **4. Generación de firmas de metadatos para registro automático en OpenMetadata** | ✅ Cumplido | Funciones `get_fct_ventas_openmetadata_spec()` y `get_dim_tiendas_openmetadata_spec()` con linaje upstream documentado (`silver.crm_transacciones`, `silver.pedidos`, `silver.crm_tiendas`) y tags `GOLD_CERTIFIED`, `FINANCIAL_KPI`. |

---

## 2. Checklist Anti-Code Drift y Gobernanza

- [x] **Cero desvío de fórmulas de negocio:** Fórmulas matemáticas idénticas a las definidas en `documentation/canonical/04_logica_de_negocio_...md`. Cero aproximaciones flotantes.
- [x] **Contratos de Esquema Respetados:** Nombres de columnas, tipos de datos y grano dimensional coincidentes al 100% con la especificación 03 del Lakehouse.
- [x] **Aislamiento Estricto de Módulo (`Single-Area Ownership`):** Todo el código reside bajo `src/lakehouse/models/`, `src/lakehouse/transforms/` y `tests/lakehouse/`. Cero afectación colateral a otros squads.

---

## 3. Detalle de la Implementación Técnica

### 3.1. Modelado Dimensional Gold (`src/lakehouse/models/gold_marts.py`)
- `FctVentasDiariasRecord`: Dataclass para el grano diario por `(fecha, anio, mes, dia, region_id, tienda_id, cliente_id, canal_venta)` con métricas contables exactas.
- `DimTiendasRegionesRecord`: Dimensión enriquecida con `tienda_id`, `nombre_tienda`, `region_id`, `region_geografica`, `ciudad`, `canal_predominante`, `gerente_regional`.
- `GoldMartsResult`: Estructura contenedora del lote con métricas globales agregadas, paths Iceberg y firmas OpenMetadata.
- `get_fct_ventas_iceberg_schema()` y `get_dim_tiendas_iceberg_schema()`: Esquemas PyIceberg v2 para almacenamiento transaccional en `s3://midas-gold/`.
- `generate_openmetadata_table_spec()`: Generador de entidades de tabla OpenMetadata con linaje upstream, configuración de particionamiento y llaves de optimización Z-Order.

### 3.2. Motor de Transformación y Agregación (`src/lakehouse/transforms/silver_to_gold.py`)
- Clase `SilverToGoldTransformer`:
  - `parse_date_components()`: Extracción robusta de `fecha (YYYY-MM-DD)`, `anio`, `mes` y `dia`.
  - `calculate_canonical_kpis()`: Motor aritmético que computa Venta Bruta, Descuentos, Devoluciones, Venta Neta, Pedidos Válidos (excluyendo `CANCELADO`), Ticket Promedio y Tasa de Devolución.
  - `build_dim_tiendas()`: Generación de la dimensión de tiendas y regiones, admitiendo catálogo por defecto o inyección personalizada.
  - `transform_and_aggregate_sales()`: Agrupación dimensional, cálculo de KPIs por grupo, ordenamiento Z-Order `(region_id, cliente_id)`, persistencia Iceberg v2 opcional y emisión de telemetría.
  - `_emit_telemetry()`: Emisión de eventos SSE para el Canvas con `node_id="gold_marts"` y `stage="GOLD_PUBLISH"`.

---

## 4. Pruebas y Evidencias de Ejecución

### 4.1. Pruebas Unitarias de HU-LAKE-04
```powershell
pytest tests/lakehouse/test_silver_to_gold.py -v
```
**Resultado:**
```text
tests/lakehouse/test_silver_to_gold.py::test_canonical_kpi_formulas_calculation PASSED [ 10%]
tests/lakehouse/test_silver_to_gold.py::test_canonical_kpis_zero_division_guard PASSED [ 20%]
tests/lakehouse/test_silver_to_gold.py::test_tasa_devolucion_calculation PASSED [ 30%]
tests/lakehouse/test_silver_to_gold.py::test_dim_tiendas_regiones_construction PASSED [ 40%]
tests/lakehouse/test_silver_to_gold.py::test_dim_tiendas_custom_catalog PASSED [ 50%]
tests/lakehouse/test_silver_to_gold.py::test_partitioning_components_extraction PASSED [ 60%]
tests/lakehouse/test_silver_to_gold.py::test_transform_and_aggregate_sales_daily_grain_and_z_ordering PASSED [ 70%]
tests/lakehouse/test_silver_to_gold.py::test_openmetadata_signatures_structure PASSED [ 80%]
tests/lakehouse/test_silver_to_gold.py::test_telemetry_emission_gold_marts PASSED [ 90%]
tests/lakehouse/test_silver_to_gold.py::test_end_to_end_iceberg_v2_gold_marts_persistence PASSED [100%]

============================= 10 passed in 1.78s ==============================
```

### 4.2. Regresión Completa del Módulo Lakehouse
```powershell
pytest tests/lakehouse/ -v
```
**Resultado:**
```text
============================= 39 passed in 2.35s ==============================
```

---

## 5. Impacto y Coordinación con el Equipo

- **Squad 1 (Backend - Daniel Echeverría):**
  - Desbloquea consultas analíticas directas en Trino sobre `gold.fct_ventas_diarias` y `gold.dim_tiendas_regiones`.
- **Squad 3 (Agentic AI - Elian Rivera):**
  - Provee las tablas certificadas y el diccionario semántico para Text-to-Gold (`HU-AI-02`) y Data Storytelling con ECharts (`HU-AI-03`).
- **Squad 4 (Gobernanza - Sebastian Castiblanco):**
  - Habilita la catalogación directa en OpenMetadata (`HU-GOV-01`) mediante las firmas de metadatos y linaje upstream generadas.
