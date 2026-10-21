# Bitácora de Cambios Diaria — 21-10-2026
> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Fecha:** Miércoles, 21 de Octubre de 2026  

---

### Registro de Actividades

- `[Miércoles]-[21/10/2026]-[04:36] - [Sebastian Castiblanco] : [Infraestructura & Monodocker: Restauración del arranque reproducible desde un clon limpio. Corrección de imágenes inaccesibles en Docker Hub (minio/minio, minio/mc y bitnami/spark migrados a bitnamilegacy), normalización de saltos de línea con .gitattributes (LF obligatorio en Windows), corrección de init-multi-db.sh con --dbname en PostgreSQL, depuración de flags de Trino 450 en jvm.config y config.properties, montaje aislado de JARs en Spark sin sobrescribir clases internas (/opt/midas/spark-jars), compatibilidad de versión en proveedor Airflow-Spark (==4.8.2) y dependencias pyarrow/openpyxl en FastAPI Gateway. Actualización de aserción de imagen en tests/infra/test_spark_cluster.py. Entrega: documentation/done/other/infra-arranque-reproducible-clon-limpio-03.md]`
