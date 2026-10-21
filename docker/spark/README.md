# Midas - Clúster Distribuido Apache Spark 3.5

Este directorio contiene la configuración y volúmenes para el clúster Apache Spark 3.5 integrado con Apache Iceberg y MinIO dentro del entorno Monodocker de Midas.

## Estructura

- `conf/spark-defaults.conf`: Configuración maestro de Spark para el catálogo REST de Iceberg (`http://midas-iceberg-catalog:8181`) y credenciales S3A contra MinIO.
- `jars/`: Directorio montado en `/opt/bitnami/spark/jars` y `/opt/spark/jars` para almacenar opcionalmente extensiones JAR externas (`iceberg-spark-runtime-3.5_2.12-1.5.0.jar`, `bundle-2.20.18.jar`).

## Puertos y Servicios

- **Spark Master (RPC):** `7077`
- **Spark Master Web UI:** `8086:8080`
- **Spark Worker Web UI:** `8081:8081`

## Uso en Pipelines Airflow

Airflow ejecuta tareas de Spark utilizando el cliente `pyspark` o el operador `SparkSubmitOperator` apuntando a `spark://midas-spark-master:7077`.
