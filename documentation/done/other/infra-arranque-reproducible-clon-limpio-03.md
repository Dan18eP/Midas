# Entrega Técnica: Remediación de Arranque Reproducible del Monodocker desde Clon Limpio

> **ID de la Entrega:** `FIX-INFRA-03`
> **Épica:** `01. Infraestructura Base & Foundation`
> **Responsable:** Sebastian Castiblanco (Co-Líder, Scrum Master & Governance Lead)
> **Revisor:** Daniel Echeverría (Líder General de Proyecto & Backend Lead)
> **Rama Oficial:** `fix/infra-arranque-reproducible-clon-limpio`
> **Fecha de Entrega:** Martes 21 de Octubre de 2026
> **Estado:** Verificada — stack completo (`--profile full`) levantado y probado

---

## 1. Contexto y Motivación

Un clon limpio del repositorio sobre `develop` **no levantaba**. Al ejecutar
`docker compose --profile full up -d --build` sobre una máquina sin estado previo
de Docker, fallaban 7 de los 9 servicios por causas independientes entre sí:
imágenes base retiradas de sus registries, scripts con finales de línea de
Windows, un bug en la creación de bases de datos, opciones de JVM inexistentes,
un montaje que destruía la instalación de Spark y dependencias Python faltantes.

Este reporte documenta la remediación completa y la verificación end-to-end.

---

## 2. Fallos Detectados y Corrección Aplicada

### 2.1. Imágenes base no descargables (`midas-minio`, `midas-minio-init`, Spark)

- **Síntoma:** `pull access denied for minio/mc, repository does not exist or may require 'docker login'`.
- **Diagnóstico:** `minio/minio` y `minio/mc` fueron retiradas de Docker Hub
  (la API de Hub responde `404 object not found`) y los repositorios espejo en
  `quay.io/minio/*` exigen autenticación. En paralelo, `bitnami/spark:3.5.1`
  fue movida al namespace `bitnamilegacy`. **No es un problema de credenciales
  locales:** ninguna cuenta de Docker Hub puede descargar esas rutas hoy.
- **Corrección (`docker-compose.yml`):**
  - `midas-minio` → `bitnamilegacy/minio:latest`. La imagen de Bitnami arranca
    el servidor por su propio entrypoint, por lo que se elimina el `command`
    explícito, el volumen pasa a `/bitnami/minio/data` y el healthcheck pasa de
    `mc ready local` a `curl` contra `/minio/health/live`. Se fija `user: "0"`
    porque el volumen nombrado pertenece a root.
  - `midas-minio-init` → `bitnamilegacy/minio-client:latest`. En esta imagen el
    binario `mc` no está en `/usr/bin/mc`, por lo que el entrypoint reescribe
    esa ruta antes de ejecutar el script canónico, que se conserva intacto.
  - `midas-spark-master` / `midas-spark-worker` → `bitnamilegacy/spark:3.5.1`.

### 2.2. Finales de línea CRLF en archivos montados en contenedores Linux

- **Síntoma:** `/init_buckets.sh: 7: set: Illegal option -` y, en Trino,
  opciones de JVM corruptas.
- **Diagnóstico:** el repositorio no declaraba normalización de fin de línea.
  Al clonar en Windows, Git convierte a CRLF **todos** los archivos de texto,
  incluidos los `.sh`, `.sql`, `.conf` y `.properties` que se montan dentro de
  contenedores Linux, donde el `\r` final rompe al intérprete.
- **Corrección:** se agrega `.gitattributes` con `* text=auto eol=lf` y reglas
  explícitas por extensión, y se normalizan a LF los 12 archivos afectados bajo
  `docker/`. Esto hace que el fallo no pueda reaparecer en futuros clones.

### 2.3. `midas-postgres` nunca creaba las bases de datos

- **Síntoma:** `FATAL: database "midas_admin" does not exist`; el contenedor
  terminaba con las bases por defecto únicamente.
- **Diagnóstico:** en `docker/postgres/init-multi-db.sh`, la llamada
  `psql --username "$POSTGRES_USER"` omite `--dbname`. Sin ese parámetro psql
  usa como base de destino el propio nombre de usuario (`midas_admin`), que no
  existe. Ninguna de las 5 bases (`iceberg_catalog`, `midas_operational`,
  `openmetadata_db`, `airflow_db`, `midas_guardian`) llegaba a crearse, lo que
  además bloqueaba a Airflow y al catálogo Iceberg.
- **Corrección:** se añade `--dbname "${POSTGRES_DB:-postgres}"` a la invocación.

### 2.4. `midas-trino` no arrancaba la JVM

- **Síntoma 1:** `Unrecognized VM option 'G1GCOptimizingDuringPrepare=true'`.
  Esa opción no existe en ninguna versión de la JVM.
- **Síntoma 2 (una vez eliminada):** `Trino requires
  -XX:+UnlockDiagnosticVMOptions -XX:G1NumCollectionsKeepPinned=10000000 on
  Java versions lower than 22.0.2 due to JDK-8329528`.
- **Síntoma 3:** `Defunct property 'query.max-total-memory-per-node'`, retirada
  en versiones recientes de Trino.
- **Corrección:** en `docker/trino/etc/jvm.config` se elimina la opción
  inexistente y se agregan las dos que Trino 450 exige; en
  `docker/trino/etc/config.properties` se elimina la propiedad obsoleta.

### 2.5. El montaje de JARs destruía la instalación de Spark

- **Síntoma:** `Could not find or load main class org.apache.spark.launcher.Main`.
- **Diagnóstico:** el compose montaba `./docker/spark/jars` sobre
  `/opt/bitnami/spark/jars`, que es el directorio donde la imagen guarda **sus
  propios** JARs. Como el directorio del repositorio solo contiene `.gitkeep`,
  el montaje dejaba a Spark sin ninguna de sus clases.
- **Corrección:** los JARs externos pasan a montarse en `/opt/midas/spark-jars`
  (solo lectura) y `spark-defaults.conf` los incorpora vía
  `spark.driver.extraClassPath` y `spark.executor.extraClassPath`. El mismo
  ajuste se aplica al montaje equivalente en los servicios de Airflow.

### 2.6. La imagen de Airflow no compilaba

- **Síntoma:** `ResolutionImpossible` durante `pip install`.
- **Diagnóstico:** `src/orchestration/requirements.txt` fijaba
  `apache-airflow-providers-apache-spark==4.9.0`, mientras que el archivo de
  constraints oficial de Airflow 2.9.3 / Python 3.11 — usado en el mismo
  comando `pip install` del Dockerfile — fija `==4.8.2`. Las dos restricciones
  son mutuamente excluyentes.
- **Corrección:** se alinea el pin a `4.8.2`, la versión que el constraints
  oficial soporta.

### 2.7. `midas-api` no levantaba por dependencias faltantes

- **Síntoma 1:** `ModuleNotFoundError: No module named 'pyarrow'`.
- **Síntoma 2:** `AttributeError: 'NoneType' object has no attribute 'Workbook'`.
- **Diagnóstico:** `docker/api/Dockerfile` instala únicamente los requirements
  de `src/api` y `src/agent`, pero `src/api/routes/connections.py` importa
  `src.lakehouse.models`, que requiere `pyarrow`. Adicionalmente, `openpyxl` —
  usado por `src/lakehouse/ingestion/excel_connector.py` — no estaba declarado
  en ningún archivo de requirements del repositorio; el `try/except ImportError`
  del conector enmascaraba la falta hasta fallar en tiempo de definición de clase.
- **Corrección:** la imagen de API instala también
  `src/lakehouse/requirements.txt`, y se agrega `openpyxl>=3.1.0` a ese archivo.

---

## 3. Verificación End-to-End

Ejecutado sobre un clon limpio, con `docker compose --profile full up -d --build`:

| Servicio | Estado | Verificación |
| :--- | :--- | :--- |
| `midas-postgres` | Up (healthy) | Las 5 bases creadas: `airflow_db`, `iceberg_catalog`, `midas_guardian`, `midas_operational`, `openmetadata_db` |
| `midas-minio` | Up (healthy) | `/minio/health/live` → `200` |
| `midas-minio-init` | Exited (0) | 5 buckets canónicos creados: bronze, silver, gold, quarantine, governance |
| `midas-iceberg-catalog` | Up | `/v1/config` → `200` |
| `midas-trino` | Up (healthy) | `SHOW CATALOGS` → `iceberg`, `postgresql`, `system`; `SHOW SCHEMAS FROM postgresql` responde correctamente |
| `midas-spark-master` | Up | Web UI → `200`; worker registrado con 1 core / 1024 MiB |
| `midas-spark-worker` | Up | Registrado contra el master |
| `midas-api` | Up (healthy) | `/health` → `{"status":"healthy","service":"midas-api-gateway"}` |
| `midas-airflow-init` | Exited (0) | Migración de metadata y usuario admin completados |
| `midas-airflow-webserver` | Up | `/health`: metadatabase `healthy`, scheduler latiendo |
| `midas-airflow-scheduler` | Up | Sin errores de importación de DAGs |

**Nota sobre Airflow:** `airflow dags list` devuelve vacío. Es el estado
esperado en un clon limpio: el DAG Factory materializa DAGs únicamente a partir
de especificaciones Gold aprobadas, y todavía no existe ninguna.

---

## 4. Alcance y Deuda Pendiente

- `docker/spark/jars/` sigue vacío (solo `.gitkeep`). Los daemons de Spark ya
  arrancan correctamente, pero para ejecutar jobs contra Iceberg hará falta
  depositar ahí `iceberg-spark-runtime-3.5_2.12` y el bundle de AWS, tal como
  indica `docker/spark/README.md`.
- El healthcheck de Postgres (`pg_isready -U midas_admin`, sin `-d`) genera una
  línea `FATAL: database "midas_admin" does not exist` cada 5 segundos en los
  logs. Es ruido cosmético: el healthcheck reporta sano porque el servidor
  responde. No se modifica aquí para no mezclarlo con la corrección funcional.
- La sustitución a imágenes `bitnamilegacy` es una medida de continuidad. Si el
  equipo requiere versiones soportadas a largo plazo, corresponde abrir un ADR
  evaluando alternativas de almacenamiento S3 y distribución de Spark.
