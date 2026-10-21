# Entrega Técnica: HU-INFRA-02 Clúster Apache Spark 3.5 en Monodocker y Cliente Airflow

> **ID de la Historia:** `HU-INFRA-02`  
> **Épica:** `01. Infraestructura Base & Foundation`  
> **Responsable:** Daniel Echeverría (Líder General de Proyecto & Backend Lead)  
> **Revisor:** N/A (Aprobación Directa Líder)  
> **Rama Oficial:** `feature/infra-spark-cluster-airflow`  
> **Fecha de Entrega:** Martes 20 de Octubre de 2026  
> **Estado:** Completada al 100% & Verificada con Pruebas Automatizadas  
> **Documentos Canónicos de Referencia:** [ADR-009](../../adr/ADR-009-orquestacion-tri-medallon-airflow-y-aislamiento-minio.md), [06_nuevo_backlog_mvp_dorado.md](../../06_nuevo_backlog_mvp_dorado.md)  
> **Issue en GitHub:** [#39](https://github.com/Dan18eP/Midas/issues/39)

---

## 1. Historia de Usuario & Criterios de Aceptación

### Declaración de Valor:
*Como Backend Lead & Data Architect, quiero aprovisionar los servicios de Apache Spark 3.5 (Master y Worker) en el entorno Monodocker e integrar el cliente PySpark y OpenJDK 17 en la imagen de Apache Airflow, para que los pipelines de orquestación puedan ejecutar trabajos distribuidos de ingesta y transformación Bronze, Silver y Gold contra el catálogo Iceberg REST y MinIO S3 de forma auditada y desacoplada.*

### Criterios de Aceptación Cumplidos:
- [x] **CA-1 (Servicios Spark Master & Worker en Compose):** Incorporación de `midas-spark-master` (`bitnami/spark:3.5.1`) con puertos `7077` (RPC) y `8086:8080` (Web UI), y `midas-spark-worker` (`bitnami/spark:3.5.1`) con Web UI en puerto `8081` bajo la red bridge `midas-network` y perfiles `["lakehouse", "spark", "orchestration", "full"]`.
- [x] **CA-2 (Configuración de Catálogo Iceberg REST y MinIO):** Archivo `docker/spark/conf/spark-defaults.conf` con las extensiones `IcebergSparkSessionExtensions`, catálogo por defecto `iceberg` tipo REST hacia `http://midas-iceberg-catalog:8181`, warehouse `s3://midas-warehouse/` y conector `S3AFileSystem` apuntando al endpoint de MinIO (`http://midas-minio:9000`).
- [x] **CA-3 (Cliente Airflow con Java 17 y PySpark):** Actualización de `docker/airflow/Dockerfile` para aprovisionar `openjdk-17-jre-headless`, `procps` y `curl` con `JAVA_HOME=/usr/lib/jvm/java-17-openjdk-amd64`, e inclusión de `pyspark>=3.5.0,<3.6.0` en `src/orchestration/requirements.txt`.
- [x] **CA-4 (Conexión spark_default Idempotente en Airflow):** Script `docker/airflow/init.sh` actualizado para registrar la conexión `spark_default` apuntando a `spark://midas-spark-master:7077`.
- [x] **CA-5 (Montaje de Volúmenes JARs y Jobs):** Montaje de `docker/spark/jars` y `docker/spark/conf/spark-defaults.conf` en los contenedores de Airflow y Spark.
- [x] **CA-6 (Validación y Pruebas Unitarias Automatizadas):** Suite de pruebas en `tests/infra/test_spark_cluster.py` con 5 pruebas automatizadas pasando al 100%, junto con la verificación estructural en `scripts/check_stack.py` y `docker compose config`.

---

## 2. Detalle de Implementación Técnica

### 2.1. Archivos Creados y Modificados:
1. **`docker-compose.yml`:**
   - Agregados los servicios `midas-spark-master` y `midas-spark-worker` con políticas de reinicio y healthchecks dependientes de MinIO.
   - Añadida dependencia de `midas-airflow-init` sobre `midas-spark-master`.
   - Volúmenes compartidos en `airflow-volumes` para extensiones JAR y `spark-defaults.conf`.
2. **`docker/spark/conf/spark-defaults.conf`:**
   - Configuración centralizada de extensiones Iceberg, URI de catálogo REST (`http://midas-iceberg-catalog:8181`) y acceso a buckets S3A en MinIO.
3. **`docker/spark/jars/.gitkeep` y `docker/spark/README.md`:**
   - Estructura documentada para almacenar los JARs de runtime (`iceberg-spark-runtime-3.5_2.12-1.5.0.jar` y `bundle-2.20.18.jar`).
4. **`docker/airflow/Dockerfile`:**
   - Instalación segura de `openjdk-17-jre-headless` como usuario `root` antes de cambiar a usuario `airflow`.
5. **`docker/airflow/init.sh`:**
   - Registro automático e idempotente de la conexión `spark_default`.
6. **`src/orchestration/requirements.txt`:**
   - Incorporación de `pyspark>=3.5.0,<3.6.0`.
7. **`scripts/check_stack.py`:**
   - Detección de puertos Spark RPC (7077) y Web UIs (8086, 8081), además de validación de archivos de configuración.
8. **`.env.example`:**
   - Variables de memoria y cores para worker (`SPARK_WORKER_MEMORY=1G`, `SPARK_WORKER_CORES=1`).
9. **`tests/infra/test_spark_cluster.py`:**
   - Suite de 5 pruebas unitarias verificando contratos de Compose, Airflow y Spark.

---

## 3. Checklist Anti-Code Drift Verificado
- [x] ¿Se verificó no alterar las fórmulas canónicas del negocio? (Sin cambios en métricas canónicas).
- [x] ¿Los esquemas de datos y contratos coinciden exactamente con la especificación? (Iceberg REST URI `8181`, MinIO `9000`).
- [x] ¿Single-Area Ownership respetado al 100%? (Propiedad exclusiva de Infra/Backend por Daniel Echeverría).
- [x] ¿Zero Mocks en código de producción? (Configuraciones reales de clúster).

---

## 4. Verificación y Pruebas Automatizadas

### Ejecución de Pruebas Unitarias de Infraestructura:
```bash
python -m pytest tests/infra/ -v
```
**Resultado:**
```text
tests/infra/test_infra_foundation.py::test_docker_compose_exists_and_configured PASSED
tests/infra/test_infra_foundation.py::test_postgres_init_scripts_exist PASSED
tests/infra/test_infra_foundation.py::test_env_example_contains_required_keys PASSED
tests/infra/test_infra_foundation.py::test_check_stack_script_executes_successfully PASSED
tests/infra/test_spark_cluster.py::test_spark_services_in_docker_compose PASSED
tests/infra/test_spark_cluster.py::test_spark_defaults_conf_contract PASSED
tests/infra/test_airflow_dockerfile_openjdk_and_pyspark PASSED
tests/infra/test_airflow_init_registers_spark_default_connection PASSED
tests/infra/test_airflow_mounts_spark_jars_and_conf PASSED
============================== 9 passed in 0.28s ==============================
```

### Ejecución de la Suite Completa del Repositorio:
```bash
python -m pytest
```
**Resultado:**
```text
====================== 151 passed, 2 warnings in 11.61s =======================
```

### Validación de Sintaxis Docker Compose:
```bash
docker compose config --quiet
```
**Resultado:** Exitoso (código de salida 0).
