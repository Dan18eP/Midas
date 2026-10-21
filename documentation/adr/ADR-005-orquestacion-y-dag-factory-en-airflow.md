# ADR-005: Orquestación y Fábrica Dinámica de DAGs en Apache Airflow (Pipeline-as-a-Prompt)
> **Estado:** Aceptado  
> **Fecha:** 17 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Dilan Chávez, Edgar Corzo  
> **Decisores:** Equipo de Arquitectura Midas  

---

## 1. Contexto

La visión de Midas establece que el usuario debe poder solicitar nuevas transformaciones o productos de datos en la capa Gold mediante lenguaje natural a través del Copiloto Agéntico.

Sin embargo, ejecutar una consulta puntual en Spark deja el nuevo reporte desamparado: cuando lleguen nuevos datos a MinIO mañana, ese reporte quedará obsoleto a menos que se integre al ciclo de vida formal de la organización. Para que sea un Lakehouse Activo, la nueva vista Gold debe convertirse en un pipeline orquestado, monitoreado y recurrente en **Apache Airflow**.

Generar código Python arbitrario con un LLM y escribirlo en la carpeta `dags/` de Airflow presenta altos riesgos de fallos de sintaxis, inyección de código y demoras por el ciclo de escaneo (*DAG parsing*) de Airflow.

---

## 2. Decisión

Se adopta el patrón **Pipeline-as-a-Prompt con Fábrica Dinámica de DAGs (DAG Factory) basada en Contratos Declarativos**:

1. **Generación de Contratos Declarativos:**  
   Cuando el Copiloto genera y valida un nuevo producto Gold y el usuario hace clic en *"Aprobar y Automatizar"*, el backend de FastAPI no escribe código Python libre. En su lugar, genera un archivo declarativo estructurado en formato JSON/YAML firmado:
   ```yaml
   pipeline_id: gold_ventas_semanales_categoria
   cron_schedule: "0 */6 * * *"
   owner: "alian_rivera"
   inputs:
     - table: silver.pedidos
       check_quality: true
   transform_sql: "SELECT categoria, DATE_TRUNC('week', fecha) as semana, SUM(monto) as total FROM silver.pedidos GROUP BY 1, 2"
   output_table: gold.ventas_semanales_categoria
   retention_days: 90
   ```
   Este contrato se almacena en el bucket dedicado `s3://midas-governance/airflow-specs/`.
2. **DAG Maestro Parametrizado en Apache Airflow:**  
   Un script maestro en Airflow (`dags/dynamic_gold_factory_dag.py`) lee periódicamente las especificaciones aprobadas en MinIO y genera dinámicamente las instancias de DAGs correspondientes.
   Each generated DAG uses a fixed UTC start date (`2026-01-01`) and `catchup=false`. Airflow requires a start date, and disabling catchup prevents historical runs when a contract is registered.
3. **Estructura Estándar del Pipeline Generado:**  
   Cada DAG generado ejecuta 4 pasos estandarizados:
   - `sensor_silver_ready`: Valida que las tablas Silver fuente tengan un snapshot reciente y sin alertas de Guardian.
   - `spark_execute_gold`: Lanza la transformación en Spark con identidad de servicio restringida.
   - `openmetadata_register_lineage`: Registra el linaje visual en OpenMetadata (`Silver -> Gold`).
   - `sse_notify_canvas`: Emite un evento que actualiza el nodo en tiempo real en el Canvas de la plataforma web.

---

## 3. Consecuencias

### Positivas:
- **Cero Riesgo de Código Malicioso:** El LLM genera especificaciones contra un esquema validado, nunca código Python con acceso al sistema operativo de los contenedores.
- **Transparencia en el Demo:** El usuario aprueba en el chat y en segundos puede abrir la UI de Airflow y ver su nuevo DAG listo y ejecutándose.
- **Mantenibilidad:** Si cambian las versiones de Spark o Airflow, solo se actualiza la plantilla de la fábrica, sin tener que reescribir decenas de DAGs individuales.
