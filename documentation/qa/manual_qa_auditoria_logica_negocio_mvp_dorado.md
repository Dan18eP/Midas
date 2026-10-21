# Manual Maestro de Auditoría QA, Lógica de Negocio y Certificación del MVP Dorado

> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Destinatarios:** Equipo de Control de Calidad (QA), Auditores de Arquitectura y Líderes Técnicos  
> **Objetivo:** Establecer la guía exhaustiva de pruebas, validaciones y preguntas críticas para certificar si el sistema cumple la visión del MVP Dorado o presenta fracturas, mocks o Code Drift.  
> **Fecha:** Miércoles, 21 de Octubre de 2026 · **Versión:** 1.0 (Canónica)  

---

## 1. Misión del QA en el MVP Dorado

El objetivo del equipo de QA en Midas no es simplemente validar que la interfaz renderice botones o que los endpoints devuelvan código HTTP 200. Su misión principal es **verificar la verdad arquitectónica y la coherencia del negocio**:
1. Confirmar que el dato que ve el usuario en el frontend proviene de un motor analítico real y no de un mock sintético.
2. Comprobar que los cálculos matemáticos y financieros siguen las fórmulas canónicas inmutables.
3. Asegurar que la orquestación, el almacenamiento tri-medallón, el catálogo de gobernanza y la inteligencia artificial funcionan de manera integrada, desacoplada y con tolerancia a fallos.

---

## 2. Diccionario Semántico Canónico e Inmutable de Lógica de Negocio

Todo reporte, cálculo en SQL, respuesta del agente conversacional o tarjeta del frontend debe adherirse con precisión matemática a las siguientes definiciones. Cualquier desviación constituye **defecto crítico de lógica de negocio (P0)**.

| Métrica Oficial | Fórmula Canónica | Restricciones de Dominio y Reconocimiento | Comportamiento ante Anomalías |
| :--- | :--- | :--- | :--- |
| **Venta Bruta** | $\sum(\text{cantidad} \times \text{precio\_unitario})$ | Aplica sobre transacciones en estado `ENTREGADO` o `EN_TRANSITO`. | Si el registro tiene cantidad $\le 0$, debe enviarse a cuarentena. |
| **Venta Neta** | $\sum(\text{monto\_bruto} - \text{descuento} - \text{devoluciones})$ | Es la cifra oficial para toda pregunta sobre "ventas", "facturación" o "ingresos". | Los descuentos no pueden superar el monto bruto. Las devoluciones se descuentan en la fecha contable efectiva. |
| **Pedidos Válidos** | $\text{COUNT}(\text{DISTINCT } \text{pedido\_id})$ | Excluye cancelaciones previas al despacho y pedidos de prueba (`is_test = TRUE`). | Pedidos duplicados por reintento de ingesta deben dedupicarse en capa Silver. |
| **Ticket Promedio** | $\frac{\text{Venta Neta}}{\text{Pedidos Válidos}}$ | Cociente estricto de las dos métricas anteriores. | Si el denominador es 0, el resultado debe ser exactamente `$0.00` (división por cero prevenida). |
| **Tasa de Devolución** | $\frac{\text{Pedidos Devueltos}}{\text{Total Pedidos Entregados}} \times 100$ | Calculado por cohorte mensual cerrada o ventana deslizante de 30 días. | No puede ser negativa ni superar el 100%. |
| **Margen Operativo Bruto** | $\frac{\text{Venta Neta} - \text{Costo Total Mercancía}}{\text{Venta Neta}} \times 100$ | Costo Total obtenido de la tabla de costos de catálogo en capa Silver. | Si Venta Neta es 0, retorna 0.0%. |
| **Cliente Activo** | Cliente con $\ge 1$ pedido válido en últimos 90 días | Basado en fecha de corte `current_date` o parámetro de Time-Travel. | Excluye clientes con estado bloqueado o baja administrativa. |

---

## 3. Matriz de Auditoría: Las 10 Cuestionantes Críticas de la Plataforma

A continuación se desglosan las diez interrogantes clave formuladas sobre el sistema, acompañadas del método exacto de prueba técnica y el criterio de éxito o rechazo.

---

### Pregunta 1: ¿De verdad sirve el workflow orquestado por Airflow?

- **Riesgo:** Que Airflow solo sea un contenedor levantado de adorno con DAGs estáticos mientras las transformaciones corren en scripts locales aislados.
- **Qué debe auditar el QA:**
  1. Acceder a la interfaz de Airflow (`http://localhost:8080`) con credenciales `admin` / `admin`.
  2. Verificar que los DAGs no sean estáticos, sino generados dinámicamente por [dag_factory.py](file:///c:/Users/LENOVO/Documents/DANI%20DOCS/PROYECTO-JUEVES-22/src/orchestration/dag_factory.py) a partir de las fuentes registradas (`dag_ingest_{conn_id}`, `dag_clean_{conn_id}`, `dag_gold_{pipeline_id}`).
  3. Disparar un DAG manualmente (Trigger DAG) y observar los logs de las tareas.
  4. Comprobar que las tareas de Spark (`SparkSubmitOperator`) se comuniquen efectivamente con `spark://midas-spark-master:7077` y no fallen con errores de conexión o ejecución de submisión.
- **Criterio de Aprobación:** El DAG pasa a estado `success`, genera artefactos Parquet/Iceberg en MinIO y reporta eventos de telemetría a FastAPI.
- **Criterio de Rechazo:** DAG inexistente para nuevas fuentes, tareas en bucle infinito de reintentos, o dependencia de submisiones manuales por terminal externa.

---

### Pregunta 2: ¿Cómo puedo auditar el proceso y sí sirven las herramientas establecidas para ello?

- **Riesgo:** Que se prometan capacidades de gobierno y linaje sin trazabilidad real ni evidencia auditable.
- **Qué debe auditar el QA:**
  1. **OpenMetadata Server (`http://localhost:8585`):** Verificar que el catálogo tenga registradas las entidades de Trino (`iceberg.bronze.*`, `iceberg.silver.*`, `iceberg.gold.*`) y PostgreSQL operacional (`midas_operational.*`).
  2. **Linaje Automatizado E2E:** Consultar el endpoint `GET /api/v1/lineage/table/gold.fact_ventas` y corroborar que devuelva el sobre `LineageGatewayPayload` con las 4 capas (`source -> bronze -> silver -> gold`), los nombres de tablas upstream y el hash SHA-256 criptográfico de auditoría.
  3. **Hash Criptográfico de Certificación:** Verificar que el hash reportado coincida con el cálculo determinístico:
     `SHA-256(table + stages + formula_key + formula_latex + quality_percent)`.
  4. **Seguridad y Enmascaramiento:** Consultar Trino con un usuario analista y verificar que campos PII sensibles (e.g., `email_cliente`, `numero_tarjeta`) se visualicen enmascarados según las directivas de Apache Ranger / OpenMetadata.
- **Criterio de Aprobación:** Toda cifra en el dashboard tiene un linaje navegable hasta la fuente cruda con certificación criptográfica inmutable.

---

### Pregunta 3: ¿El frontend tiene datos mockeados o estáticos o está 100% conectado con el backend?

- **Riesgo:** Que el lienzo de React Flow y los paneles muestren nodos hardcodeados de archivos mock (`initialTopology.ts`, `historicalTelemetryService.ts`) en lugar de responder a la API viva.
- **Qué debe auditar el QA:**
  1. Abrir las herramientas de desarrollador del navegador (pestaña Red / Network).
  2. Recargar la aplicación y abrir una sesión: verificar peticiones HTTP a:
     - `GET /api/v1/sessions`
     - `GET /api/v1/sessions/{session_id}`
     - `GET /api/v1/connections`
     - `GET /api/v1/lineage/table/{table}`
     - `GET /api/v1/telemetry/history?window=24h`
     - `GET /api/v1/telemetry/stream` (conexión Server-Sent Events continua).
  3. Comprobar que el lienzo cargue los nodos desde `session.topology_state` y no desde la constante estática de 7 nodos de `initialTopology.ts`.
  4. Modificar la topología o agregar una fuente: validar que se emita un `PUT /api/v1/sessions/{session_id}/topology` y que al refrescar la página (`F5`), el lienzo mantenga la posición y configuración exacta de los nodos.
- **Criterio de Aprobación:** Cero datos sintéticos en pantalla; todos los componentes se hidratan desde respuestas JSON reales del backend.

---

### Pregunta 4: ¿El backend está 100% alineado y coherente con la lógica del negocio?

- **Riesgo:** Que las consultas SQL o transformaciones de Spark apliquen lógicas arbitrarias que alteren los balances contables o métricas de ingresos.
- **Qué debe auditar el QA:**
  1. Inyectar datos de prueba controlados:
     - 10 pedidos entregados con valor unitario $100.
     - 2 pedidos con descuento de $20.
     - 1 pedido devuelto con reembolso de $100.
     - 1 pedido cancelado antes de despacho.
  2. Ejecutar la consulta en Trino sobre la capa Gold:
     ```sql
     SELECT 
         SUM(monto_bruto) AS venta_bruta,
         SUM(monto_bruto - descuento - devoluciones) AS venta_neta,
         COUNT(DISTINCT pedido_id) AS pedidos_validos
     FROM iceberg.gold.fact_ventas;
     ```
  3. Validar:
     - `venta_bruta` debe ser $1,000 (excluyendo el cancelado antes de despacho).
     - `venta_neta` debe ser exactamente: $1,000 - $40 (descuentos) - $100 (devolución) = $860.
     - `pedidos_validos` debe ser exactamente 10.
     - `ticket_promedio` debe ser exactamente $86.00.
- **Criterio de Aprobación:** Los valores calculados coinciden al 100% con la especificación matemática sin discrepancias de redondeo ni omisión de devoluciones/descuentos.

---

### Pregunta 5: ¿El flujo total de los datos se está respetando?

- **Riesgo:** Saltarse capas del medallón (e.g., escribir desde la fuente directo a Silver o Gold) o mutar datos históricos en lugar de operar en modo apéndice/snapshots.
- **Qué debe auditar el QA:**
  1. **Trazabilidad Tri-Medallón:**
     - **Bronze (`s3://midas-bronze/`):** Almacenamiento en formato Parquet crudo con sobre de auditoría canónico de 8 metadatos (`_midas_source_id`, `_midas_ingested_at`, `_midas_batch_id`, `_midas_raw_fingerprint`, etc.).
     - **Silver (`s3://midas-silver/`):** Registros saneados, tipados fuertemente, deduplicados y con aislamiento de anomalías en cuarentena (`s3://midas-quarantine/`).
     - **Gold (`s3://midas-gold/`):** Tablas multidimensionales Iceberg (`fact_ventas`, `dim_clientes`, `dim_productos`) optimizadas para consulta analítica en Trino.
  2. **Inmutabilidad y Auditoría:** Comprobar que en Bronze nunca se ejecute un `UPDATE` ni `DELETE`; únicamente `APPEND`.
- **Criterio de Aprobación:** Toda fila en Gold tiene una correspondencia unívoca identificable en Silver y Bronze mediante `_midas_raw_fingerprint`.

---

### Pregunta 6: ¿La IA funciona, el text-to-SQL funciona, las gráficas se generan correctamente, el chatbot es interactivo y no inventa información?

- **Riesgo:** Alucinaciones de esquema, ejecución de consultas destructivas (`DROP TABLE`), invención de columnas inexistentes o caídas del chat por saturación del modelo.
- **Qué debe auditar el QA:**
  1. **Inferencia Local Zero-Trust:** Verificar que [model_router.py](file:///c:/Users/LENOVO/Documents/DANI%20DOCS/PROYECTO-JUEVES-22/src/agent/models/model_router.py) interactúe con el endpoint de Ollama (`http://localhost:11434` o `http://midas-ollama:11434`) ejecutando `qwen2.5:3b`. No debe haber llamadas a APIs cloud externas.
  2. **Filtro de Seguridad AST (Query Guardrails):** Intentar consultas maliciosas en el chat:
     - *"Elimina la tabla de ventas"* -> Debe ser interceptada y rechazada con mensaje de seguridad.
     - *"Muestra las contraseñas de los usuarios"* -> Rechazada por los guardrails AST.
  3. **Generación de ECharts:** Preguntar *"Muestra la evolución mensual de ventas netas en una gráfica de barras"*.
     - Verificar que la respuesta devuelva un bloque JSON `echarts_option` válido con `xAxis`, `yAxis`, `series` y tema visual consistente.
  4. **Chips de Cifras Clicables (`metrics_summary`):** Confirmar que toda métrica numérica generada en la respuesta esté encapsulada en metadatos interactivos que permitan abrir el drawer "Explícame esta cifra".
  5. **Manejo de Caídas:** Apagar temporalmente el contenedor de Ollama (`docker stop midas-ollama`). Realizar una pregunta analítica estándar. El sistema debe responder en menos de 50ms utilizando el generador determinístico pre-certificado sin romper la sesión.
- **Criterio de Aprobación:** Cero alucinaciones de sintaxis, cero ejecuciones de DDL/DML destructivo y visualización fluida de gráficos interactivos.

---

### Pregunta 7: ¿El flujo de datos generado por el frontend está 100% conectado a la fuente de datos/conexión seleccionada?

- **Riesgo:** Que al seleccionar una conexión en el modal, el backend procese datos genéricos o de otra fuente por falta de enlace en el payload.
- **Qué debe auditar el QA:**
  1. Registrar dos conexiones distintas en el Welcome Hub:
     - Fuente A: `conn_pg_bogota_01` (PostgreSQL CRM Bogotá).
     - Fuente B: `conn_excel_medellin_02` (Excel Presupuesto Medellín).
  2. Iniciar ingesta para la Fuente B.
  3. Verificar en MinIO (`http://localhost:9001`) que los archivos se depositen estrictamente en:
     `s3://midas-bronze/sources/conn_excel_medellin_02/raw/...`
  4. Corroborar que en los metadatos de la tabla Silver y Gold el campo `_midas_source_id` coincida unívocamente con `conn_excel_medellin_02` y no con la Fuente A.
- **Criterio de Aprobación:** Aislamiento total de particiones por conexión conforme a la especificación de ADR-009.

---

### Pregunta 8: ¿El Docker sí está funcionando como debe?

- **Riesgo:** Que la plataforma requiera instalaciones manuales en la máquina anfitrión o que los contenedores colapsen al reiniciar.
- **Qué debe auditar el QA:**
  1. Ejecutar en terminal: `docker compose ps`
  2. Verificar el estado `healthy` o `up` de los siguientes servicios nucleares:
     - `midas-postgres` (Puerto 5432)
     - `midas-minio` (Puertos 9000, 9001)
     - `midas-trino` (Puerto 8080)
     - `midas-spark-master` (Puertos 7077, 8081)
     - `midas-spark-worker-1` (Puerto 8082)
     - `midas-airflow-webserver` y `scheduler` (Puerto 8085)
     - `midas-openmetadata` y `opensearch` (Puerto 8585)
     - `midas-ollama` (Puerto 11434)
     - `midas-gateway` (Puerto 8000)
     - `midas-frontend` (Puerto 3000)
  3. Ejecutar una prueba de persistencia: detener todos los contenedores (`docker compose down`) y levantarlos nuevamente (`docker compose up -d`).
  4. Comprobar que las sesiones de chat, tablas de PostgreSQL y archivos de MinIO permanezcan intactos gracias a los volúmenes persistentes.
- **Criterio de Aprobación:** Despliegue reproducible desde cero con un solo comando y persistencia de estado post-reinicio.

---

### Pregunta 9: ¿El historial de sesiones de verdad devuelve la información pasada, cómo se maneja el contexto o cómo sabe el agente conversacional que está en x sesión por encima de otra?

- **Riesgo:** Sesiones efímeras que se borran al recargar, contaminación de contexto entre pestañas del navegador o mezcla de preguntas entre diferentes hilos.
- **Qué debe auditar el QA:**
  1. Crear una sesión "Sesión Alfa - Auditoría Ventas" y enviar la pregunta *"¿Cuál es la venta neta?"*.
  2. Crear una segunda sesión "Sesión Beta - Análisis Logística" y enviar *"¿Cuántos pedidos están en tránsito?"*.
  3. Alternar entre ambas sesiones desde la barra lateral:
     - Validar que al seleccionar "Sesión Alfa", los mensajes, gráficos de ECharts y el lienzo de React Flow reflejen exclusivamente el contexto de Alfa.
     - Validar que el agente conversacional en la Sesión Beta no tenga en su historial reciente las preguntas de Alfa (aislamiento por `session_id` / `thread_id`).
  4. Verificar en la base de datos operacional:
     ```sql
     SELECT session_id, title, user_id, updated_at FROM midas_operational.chat_sessions;
     SELECT message_id, session_id, sender, content FROM midas_operational.session_messages WHERE session_id = 'sess_alfa_id';
     ```
  5. Comprobar que el título de la sesión se haya autogenerado con 3 a 5 palabras ejecutivas basadas en la primera pregunta (e.g., *"Venta Neta Regional"*) y no con el texto recortado genérico.
- **Criterio de Aprobación:** Segregación estricta de memoria conversacional y persistencia relacional en PostgreSQL verificada.

---

### Pregunta 10: ¿La ingesta de datos multiformato sirve al 100%, Excel, API, base de datos, CSV?

- **Riesgo:** Que el sistema solo soporte un formato simulado y falle ante archivos reales con particularidades (delimitadores variables, hojas múltiples, paginación API).
- **Qué debe auditar el QA:**
  1. **Excel (.xlsx / .xls):**
     - Subir un archivo con 3 hojas (`Enero`, `Febrero`, `Presupuesto`) usando `POST /api/v1/connections/upload`.
     - Validar que la respuesta liste las hojas disponibles en el array `sheets` y devuelva el esquema preliminar de columnas.
  2. **CSV:**
     - Subir un archivo delimitado por punto y coma (`;`) y otro por comas (`,`).
     - Validar que `csv.Sniffer` detecte el delimitador exacto y extraiga las columnas sin agruparlas en un solo string erróneo.
  3. **Base de Datos Relacional (PostgreSQL):**
     - Registrar conexión con credenciales de prueba y validar que extraiga tablas estructuradas preservando tipos numéricos y temporales.
  4. **API REST:**
     - Probar conexión hacia un endpoint REST que devuelva un payload JSON anidado.
     - Validar que el conector aplane los objetos JSON y genere un esquema tabular apto para Parquet.
- **Criterio de Aprobación:** Ingesta exitosa de los 4 formatos sin errores de conversión y con sobre de auditoría canónico adjunto.

---

## 4. Cuestionantes Adicionales de Calidad para Certificar el "MVP Dorado"

Para asegurar que Midas sobrepase el nivel de prototipo académico y alcance la categoría de producto de grado empresarial, el equipo de QA debe auditar obligatoriamente estas cinco dimensiones suplementarias:

---

### Pregunta 11: ¿Qué ocurre cuando ingresan datos corruptos o anómalos? (Aislamiento en Cuarentena)

- **Riesgo:** Que una fila con monto negativo o fecha en el año 2099 tumbe todo el pipeline de Spark o contamine los reportes de la junta directiva.
- **Prueba QA:**
  1. Inyectar un archivo CSV con 100 filas válidas y 5 filas con anomalías intencionales (monto negativo, cliente nulo, producto inexistente).
  2. Ejecutar el pipeline de limpieza Silver.
  3. Comprobar que:
     - Las 100 filas sanas se promuevan a la capa Silver (`s3://midas-silver/`).
     - Las 5 filas anómalas se desvíen inmediatamente al bucket de cuarentena (`s3://midas-quarantine/incidents/{conn_id}/incident_{id}.json`).
     - El pipeline no se detenga con excepción no controlada (`unhandled crash`).
     - Se genere un evento de alerta en el hub de telemetría visible en el Time-Travel Scrubber.

---

### Pregunta 12: ¿El sistema es idempotente ante reintentos de ejecución? (Zero-Duplicates)

- **Riesgo:** Si un pipeline de Airflow o un usuario sube dos veces el mismo archivo, las ventas se duplican, falseando los balances financieros.
- **Prueba QA:**
  1. Subir el archivo de ventas `ventas_octubre.csv` y procesarlo hasta Gold. Anotar la Venta Neta calculada ($X).
  2. Reintentar la ejecución del pipeline exactamente con el mismo archivo y los mismos parámetros.
  3. Consultar nuevamente la Venta Neta en Trino.
- **Criterio de Aprobación:** La Venta Neta debe seguir siendo exactamente $X. El número de filas en Gold no debe duplicarse gracias a la deduplicación por huella digital (`_midas_raw_fingerprint`) y control de versiones Iceberg (WAP).

---

### Pregunta 13: ¿Cómo reacciona la plataforma ante caídas de servicios? (Resiliencia Midas Guardian)

- **Riesgo:** Que la indisponibilidad de un nodo secundario congele la aplicación completa sin informar al usuario.
- **Prueba QA (Inyección de Fallos):**
  1. Simular fallo de ejecutor Spark: `docker stop midas-spark-worker-1`.
  2. Disparar una consulta analítica o proceso de agregación.
  3. Verificar que Midas Guardian clasifique la causa raíz (`F4 Worker Dead`), intente el playbook `JOB_RETRY_V1` y envíe una notificación clara al frontend indicando el estado del servicio en lugar de un error 500 genérico.
  4. Reiniciar el worker (`docker start midas-spark-worker-1`) y validar auto-recuperación.

---

### Pregunta 14: ¿El Time-Travel y la Telemetría Histórica reflejan la realidad temporal?

- **Riesgo:** Que el control deslizante de tiempo (Time-Travel Scrubber) sea un adorno visual que no altere los datos del lienzo.
- **Prueba QA:**
  1. En el frontend, mover el scrubber a `hace 2 horas`.
  2. Verificar que los nodos del lienzo cambien de color e indicadores numéricos reflejando el estado de latencia, throughput y salud que tenían en ese momento específico.
  3. Presionar el botón "Regresar a En Vivo" (`Return to LIVE`): corroborar que el indicador pase a modo `LIVE` y se reanude la recepción de eventos por SSE.

---

### Pregunta 15: ¿Cumple el sistema con los Acuerdos de Nivel de Servicio (SLAs) de Rendimiento?

- **Riesgo:** Que las consultas tarden más de 30 segundos, arruinando la experiencia ejecutiva en vivo.
- **Límites de Rendimiento Críticos (Benchmarks):**
  | Operación | SLA Máximo Permitido | Método de Medición |
  | :--- | :--- | :--- |
  | Consulta Analítica Trino (Gold) | $\le 2.0\text{ segundos}$ | Inspección en encabezados de red / Trino UI |
  | Inferencia Copiloto (Text-to-SQL) | $\le 3.5\text{ segundos}$ | Tiempo desde envío de mensaje hasta primer token |
  | Fallback Determinístico del Chatbot | $\le 50\text{ milisegundos}$ | Medición directa con Ollama apagado |
  | Latencia de Notificación SSE | $\le 500\text{ milisegundos}$ | Diferencia temporal entre evento Spark y render Canvas |
  | Carga y Parseo de Archivo (Upload) | $\le 3.0\text{ segundos}$ para archivos $\le 25\text{ MB}$ | Respuesta de `POST /connections/upload` |

---

## 5. Casos de Prueba End-to-End (E2E) para Ejecución Manual

### Caso de Prueba E2E-01: Ingesta de Archivo CSV y Consulta en Copiloto
1. **Precondición:** Contenedores activos, usuario en el Welcome Hub (`/`).
2. **Paso 1:** Hacer clic en el launcher de archivo `[ CSV]`.
3. **Paso 2:** Cargar el archivo de prueba `tests/fixtures/ventas_prueba.csv` delimitado por comas.
4. **Paso 3:** Observar el modal de previsualización: verificar columnas y primeras 5 filas de muestra.
5. **Paso 4:** Confirmar la creación de la conexión.
6. **Paso 5:** Verificar que aparezca un nuevo nodo en el lienzo de React Flow conectado a Bronze.
7. **Paso 6:** Abrir el Copilot Chat Drawer y escribir: *"¿Cuál es la venta neta del archivo cargado?"*.
8. **Resultado Esperado:** El asistente genera el SQL exacto sobre `gold.fact_ventas`, presenta la cifra neta con chip clicable, grafica el resultado en ECharts y al hacer clic en el chip abre el Explain Number Drawer con el linaje de 4 etapas y hash SHA-256 válido.

### Caso de Prueba E2E-02: Detección y Contención de Fraude de Esquema (Schema Drift)
1. **Precondición:** Pipeline en estado saludable.
2. **Paso 1:** Subir un archivo con una columna eliminada o renombrada arbitrariamente (`precio` renombrado a `valor_monetario`).
3. **Paso 2:** Ejecutar la etapa de ingesta y validación de contrato.
4. **Resultado Esperado:** Guardian detecta `F1 Schema Drift`, bloquea la promoción a Gold, desvía el lote a Cuarentena, emite alerta roja en el nodo correspondiente del Canvas y conserva disponible la última versión sana de la tabla Gold en Iceberg.

---

## 6. Protocolo de Calificación: Criterios Go / No-Go para Demostración Ejecutiva

Para autorizar la presentación en vivo ante evaluadores y directores de negocio, el sistema debe superar el 100% de la siguiente lista de verificación:

- [ ] **Sin Mocks:** El archivo `initialTopology.ts` no se utiliza como fuente de verdad en el Canvas; los nodos provienen de la API de sesiones.
- [ ] **Fórmulas Certificadas:** La Venta Neta dedujo explícitamente descuentos y devoluciones en todas las pruebas.
- [ ] **Persistencia Docker:** Al reiniciar contenedores, las sesiones y archivos no sufren pérdida de datos.
- [ ] **Zero-Trust:** No existe ninguna clave de API de OpenAI o servicios en la nube en el repositorio; la inferencia es estrictamente local con Qwen 2.5.
- [ ] **Batería de Pruebas Automatizadas:** 
  - Backend: 209/209 pruebas aprobadas al 100%.
  - Frontend: 78/78 pruebas aprobadas al 100%.
- [ ] **Resiliencia Operativa:** Ante caída de Ollama, el agente conversacional responde fluidamente con el motor determinístico sin colapsar la interfaz.
- [ ] **Trazabilidad:** Toda cifra mostrada en el chat permite abrir el drawer de linaje y auditar las transformaciones paso a paso.
