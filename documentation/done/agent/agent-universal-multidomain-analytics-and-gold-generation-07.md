# Entrega: Analítica Universal Multitemática, Copiloto Agéntico y Materialización Gold por Sesión

> **Historia de Usuario / Entrega:** HU-AGENT-06 / HU-FRONT-11  
> **Fecha:** Sábado, 24 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Dilan Chávez & Antigravity  
> **Área:** Agent, Lakehouse, Backend & Frontend Analytics  

---

## 1. Contexto y Principio Rector de Diseño

El sistema opera bajo el principio estricto de que **cada sesión está segmentada según la conexión de datos activa (1 Sesión = 1 Conexión)**. Todo gravita en torno al dato real conectado, sin depender de plantillas quemadas o supuestos únicos del dominio de ventas.

El Copiloto conversacional permite interactuar dinámicamente con cualquier conjunto de datos (RRHH, Salud, Logística, Operaciones, Finanzas, CRM, Educación, etc.) para:
1. Formular consultas analíticas dinámicas y desgloses multidimensionales.
2. Sintetizar hallazgos con narrativa ejecutiva sin cifras inventadas.
3. Generar visualizaciones ECharts automáticas adaptadas a la intención (barras horizontales, comparativas, pastel/dona para distribución, líneas para tendencias temporales y dispersión para correlaciones).
4. **Materializar conjuntos de datos en la capa Gold** bajo demanda del usuario, registrándolos en Apache Iceberg, publicando contratos declarativos en Airflow y dejándolos disponibles de inmediato para su visualización y dashboards ejecutivos en el Centro de Analítica.

---

## 2. Componentes Implementados y Modificados

### 2.1 Enrutamiento y Diálogo Multitemático (`router.py` & `dialogic.py`)
- **Desacoplamiento de supuestos de ventas:** Se eliminó la obligación artificial de solicitar años específicos (2024-2026) en preguntas de negocio generales, permitiendo consultas analíticas sobre cualquier materia.
- **Detección de intención `materialize_gold`:** Clasificación inmediata cuando el usuario pide crear, materializar o guardar una vista en la capa Gold.
- **Sugerencias y proactividad dinámica:** Extracción en caliente de columnas categóricas (`departamento`, `area`, `sede`, `cargo`, `especialidad`, `paciente`, `almacen`, `carrier`, `proveedor`, etc.) y numéricas (`salario`, `horas`, `stock`, `unidades`, `peso`, `duracion`, `temperatura`, `precio`, `costo`, etc.) desde el catálogo de la sesión activa.

### 2.2 Generación SQL y Storytelling Universal (`model_router.py` & `echarts_synthesizer.py`)
- **Ampliación universal de columnas métricas:** Soporte en el fallback determinístico para métricas de cualquier disciplina (RRHH, Logística, Salud, Educación, Finanzas).
- **Prompting ejecutivo agéntico:** Instrucción al LLM (Gemini Cloud API o Qwen 2.5: 3B local Zero-Trust) orientada a la toma de decisiones ejecutivas en cualquier dominio.
- **Formateo de moneda condicional:** Eliminación del formateo indiscriminado con signo de dólar (`$`) para campos numéricos que corresponden a identificadores, horas, unidades o conteos, reservándolo exclusivamente para métricas monetarias (`monto`, `precio`, `costo`, `salario`, `ingreso`, etc.).

### 2.3 Persistencia Inmediata de Capa Gold (`trino_client.py` & `agent.py`)
- **Ejecución y materialización CTAS:** Al confirmarse la materialización Gold, el sistema ejecuta la sentencia `CREATE TABLE IF NOT EXISTS iceberg.gold.{slug} AS {sql}`, computa los registros en caliente y persiste el dataset en `s3://midas-gold/gold/{slug}.json` y `gold/{slug}.parquet`.
- **Integración con Airflow:** Publicación del contrato YAML en `s3://midas-governance/airflow-specs/{session_id}/dag_{pipeline_id}.yaml`.
- **Aislamiento por sesión:** Registro de la tabla Gold creada en los metadatos de la sesión activa para su consumo inmediato.
- **Búsqueda unificada en el motor local:** El cliente de Trino ahora inspecciona tanto `midas-silver` como `midas-gold`, permitiendo consultas inmediatas sobre la nueva tabla Gold creada.

### 2.4 Centro de Analítica de Datos (`SessionAnalyticsView.tsx`)
- **Selector Dinámico de Tablas / Vistas:** Permite alternar entre la vista Silver limpia y cualquier Data Mart Gold generado por el Copiloto para la sesión activa.
- **Desglose Ejecutivo Visual:** Módulo que calcula dinámicamente el ranking y distribución de las categorías principales y métricas de la tabla seleccionada en tiempo real.
- **Explorador Tabular y Exportación CSV:** Tabla interactiva con visualización de registros reales y descarga de CSV con el nombre de la tabla activa.

---

## 3. Pruebas y Verificación

- **Backend Pytest:** 299/299 pruebas aprobadas al 100% (`tests/agent/`, `tests/api/`, `tests/lakehouse/`, `tests/governance/`, `tests/backend/`).
- **Frontend Vitest:** 147/147 pruebas aprobadas al 100% (`SessionAnalyticsView`, `CopilotChatDrawer`, `SourceActionMenu`, etc.).
- **Compilación Next.js 14:** `npm --workspace=src/frontend run build` completado exitosamente sin errores de tipos o linting.
