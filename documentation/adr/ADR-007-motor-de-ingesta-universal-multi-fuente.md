# ADR-007: Motor de Ingesta Universal Multi-Fuente y Arquitectura Adaptable
> **Estado:** Aceptado  
> **Fecha:** 17 de Octubre de 2026  
> **Autores:** Daniel Echeverría (Líder / Arquitecto) y Equipo de Arquitectura Midas  
> **Decisores:** Equipo de Arquitectura Midas  

---

## 1. Contexto

La visión empresarial de Midas exige que la plataforma no esté acoplada a un único caso de negocio o tabla rígida (ej. solo pedidos de comercio electrónico). El sistema debe funcionar como un **Data Fabric / Active Lakehouse Universal** capaz de adaptarse a cualquier origen de datos que la organización decida incorporar:
- Bases de datos relacionales corporativas (PostgreSQL, MySQL, SQL Server, Oracle).
- Archivos locales o subidos por usuarios (hojas de cálculo Excel `.xlsx`/`.xls` con múltiples pestañas, archivos CSV con delimitadores variables, JSON).
- APIs REST externas (servicios web de CRM, ERPs o mesas de ayuda que devuelven JSON anidado).
- Flujos continuos o carpetas compartidas de almacenamiento.

Ingestar estas fuentes dispares sin un patrón estandarizado provocaría la proliferación de scripts manuales y código frágil que rompería el pipeline cada vez que cambie una columna o llegue un nuevo archivo.

---

## 2. Decisión

Se adopta el **Motor de Ingesta Universal de Midas (Midas Universal Ingestion Engine — UIE)** basado en 4 pilares:

### 2.1. Conectores Modulares Adaptativos (PySpark + Airflow)
1. **Conector JDBC Universal:** Utiliza drivers JDBC estándar en PySpark para inspeccionar el catálogo de origen (`information_schema.columns`), inferir tipos y extraer tablas completas o deltas incrementales.
2. **Conector de Hojas de Cálculo (Excel & CSV):** Parser tolerante que detecta automáticamente encabezados, soporta archivos multi-hoja (`.xlsx`), limpia formatos de moneda/porcentaje y maneja delimitadores automáticos (coma, punto y coma, tabulador) con codificación UTF-8.
3. **Conector REST API:** Cliente asíncrono en FastAPI/Airflow que consume endpoints HTTP con autenticación (Bearer Token / API-Key), gestiona paginación (`offset`, `page`, `cursor`) y aplana (*flattening*) estructuras JSON anidadas.

### 2.2. Envoltura de Auditoría Universal en Capa Bronze
Toda fuente que ingresa al Lakehouse, independientemente de su origen o formato, se encapsula en una tabla Iceberg Bronze inmutable con metadatos técnicos estandarizados:
- `_raw_id`: Identificador único UUID del registro.
- `_source_type`: Tipo de conector (`JDBC_POSTGRES`, `EXCEL_SPREADSHEET`, `REST_API`, `CSV_FILE`).
- `_source_origin`: Nombre de la tabla, endpoint o nombre del archivo subido.
- `_ingested_at`: Timestamp UTC de ingesta.
- `_schema_fingerprint`: Hash criptográfico (SHA-256) de la lista de columnas y tipos detectados para alertar tempranamente sobre *Schema Drift*.
- `_data_payload`: Columnas originales preservadas en tipos semi-estructurados para no perder información antes del saneamiento.

### 2.3. Transición Automática Bronze $\rightarrow$ Silver (Schema Evolution)
- El motor en PySpark lee la envoltura de Bronze, infiere el esquema final, normaliza nombres de columnas a minúsculas y snake_case, castea tipos y registra la entidad en **OpenMetadata**.
- Si el Escudo PII detecta datos personales en alguna columna nueva, la clasifica en **Apache Atlas** sin intervención manual.

---

## 3. Consecuencias

### Positivas:
- **Adaptabilidad Real:** Permite demostrar que el sistema procesa simultáneamente un Excel contable, una tabla de PostgreSQL y una API de soporte en la misma plataforma.
- **Zero-Code Ingestion:** La incorporación de una nueva fuente no requiere escribir pipelines de cero; se parametriza mediante un contrato de conexión.
- **Resiliencia ante Cambios de Esquema:** Si una hoja de cálculo agrega una columna nueva, el conector Bronze la absorbe sin caerse y Silver evoluciona el esquema de Iceberg ordenadamente.

### Negativas / Mitigaciones:
- La inferencia automática de esquemas en archivos CSV o Excel muy grandes puede consumir tiempo de cómputo en Spark. Se mitiga configurando un muestreo (*sampling ratio*) de las primeras 1,000 filas para inferir tipos de datos antes del procesamiento distribuido.
