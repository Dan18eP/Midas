# ADR-001: Almacenamiento MinIO y Formato Abierto Apache Iceberg con Catálogo JDBC
> **Estado:** Aceptado  
> **Fecha:** 17 de Octubre de 2026  
> **Autores:** Daniel Echeverría (Líder / Arquitecto), Edgar Corzo, Elian Rivera  
> **Decisores:** Equipo de Arquitectura Midas  

---

## 1. Contexto

La plataforma Midas requiere una capa de almacenamiento de objetos desacoplada, compatible con S3 y con soporte para transacciones ACID, versionamiento de datos (*time-travel*), aislamiento concurrente y evolución de esquemas.

Durante la investigación técnica se identificaron dos factores determinantes:
1. El repositorio comunitario de **MinIO** fue archivado en abril de 2026 bajo licencia AGPLv3, recomendando su versión empresarial (AIStor).
2. Se evaluó el formato de tabla abierta: **Delta Lake** vs. **Apache Iceberg**, así como el tipo de catálogo técnico para registrar las tablas (Catálogo REST como Apache Polaris vs. Catálogo JDBC sobre PostgreSQL vs. Catálogo Hive/Hadoop).

---

## 2. Decisión

1. **Almacenamiento de Objetos en Laboratorio:** Se mantiene **MinIO** congelando una imagen Docker oficial, estable y reproducible (`minio/minio:RELEASE.2024-05-10T01-41-38Z` o similar LTS). Esto garantiza compatibilidad 100% con la API S3 y zero-cost para el entorno local. Se documenta la necesidad de evaluar AIStor Enterprise o Ceph RGW antes de un despliegue en producción corporativa.
2. **Formato de Tablas Abiertas:** Se adopta **Apache Iceberg (formato v2)** como estándar transversal en las capas Bronze, Silver y Gold.
3. **Catálogo Técnico de Tablas:** Se descarta temporalmente desplegar Apache Polaris por la complejidad de configurar STS en 4 días, y se adopta el **Catálogo JDBC de Apache Iceberg sobre PostgreSQL**. PostgreSQL ya forma parte de nuestro stack (usado por Airflow y Ranger), ofrece transaccionalidad ACID probada y permite registrar metadatos de Iceberg con mínimo consumo de recursos.

---

## 3. Consecuencias

### Positivas:
- **Time-Travel y Snapshots Nativos:** Permite consultar estados históricos de las tablas mediante `FOR SYSTEM_TIME AS OF`, habilitando de inmediato la capacidad de reproducir incidentes pasados.
- **Write-Audit-Publish (WAP):** Facilita escribir en tablas o ramas candidatas y promover a Gold únicamente cuando los tests de calidad se superen.
- **Simplicidad de Despliegue:** Cero servicios adicionales frágiles. Spark y Trino se conectan al catálogo Iceberg compartiendo la misma base de metadatos en PostgreSQL.

### Negativas / Mitigaciones:
- El catálogo JDBC no tiene una interfaz gráfica web dedicada; esto se mitiga completamente utilizando **OpenMetadata** como la interfaz de visualización y catálogo de negocio.
