# Midas — Guión y Minutero de la Presentación en Vivo (30 Minutos)
## Protocolo de Demostración Técnica, Flujo Narrativo y Participación de los 6 Integrantes

> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Líder de Proyecto & Director de Pitch:** Daniel Echeverría  
> **Fecha de Demostración:** Jueves 22 de Octubre de 2026 (Entrega y congelación: Miércoles 21)  
> **Formato:** Demostración técnica en vivo sobre software real funcionando en Docker · 30 Minutos exactos  

---

## 1. Reglas de Oro de la Presentación

1. **Software Real y Cero Animaciones Ficticias:** Toda métrica, gráfica, alerta de Guardian y cambio en el Canvas proviene de llamadas HTTP/SSE reales y consultas a Trino y PostgreSQL.
2. **Coordinación y Relevos Impecables:** Cada integrante habla exactamente **5 minutos**, con una transición clara hacia su compañero.
3. **Estructura "Problema $\rightarrow$ Solución $\rightarrow$ Demostración en Pantalla":** Cada orador plantea el dolor empresarial antes de mostrar la tecnología en acción.

---

## 2. Minutero Oficial de la Demostración

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                     CRONOGRAMA DE INTERVENCIÓN (30 MINUTOS TOTAL)                      │
├───────┬───────────────────────────┬────────────────────────────────────────────────────┤
│ Min   │ Orador / Rol              │ Componente Demostrado en Vivo                      │
├───────┼───────────────────────────┼────────────────────────────────────────────────────┤
│ 00-05 │ Daniel Echeverría (TL/BE) │ Visión, Problemática, Arquitectura Global y Canvas │
│ 05-10 │ Edgar Corzo (Data Eng)    │ Ingesta Multi-Fuente Adaptativa (DB, Excel, API)   │
│ 10-15 │ Dilan Chávez (FE Lead)    │ Orquestación Airflow & Topología Canvas en Vivo    │
│ 15-20 │ Joshua Gonzales (UI/Gov)  │ Gobernanza Zero-Trust: Escudo PII y Lente Roles    │
│ 20-25 │ Sebastian Castiblanco(Scrum/Gov)│ Midas Guardian: Inyección de Fallo y Auto-Healing│
│ 25-30 │ Elian Rivera (AI Lead)    │ Copiloto Agéntico: Storytelling, Text-to-Gold      │
└───────┴───────────────────────────┴────────────────────────────────────────────────────┘
```

---

## 3. Guión Paso a Paso por Intervención

---

### Bloque 1 (00:00 - 05:00) | Daniel Echeverría: Visión Estratégica, Problemática y Canvas Central
- **Objetivo:** Captar la atención del jurado, exponer el problema de los silos de datos y presentar a Midas como la solución definitiva.
- **Acción en Pantalla:** Proyecta la arquitectura de alto nivel y abre el Canvas de Midas con los nodos encendidos en verde.
- **Guión y Puntos Clave:**
  - *"Buenos días a todos. Hoy las organizaciones se enfrentan a un dilema crítico: los datos viven dispersos en hojas de cálculo, bases relacionales y APIs externas, mientras que los equipos de negocio dependen de tableros estáticos o chatbots desconectados que alucinan respuestas."*
  - *"Hoy les presentamos Midas: un Active Lakehouse empresarial que no solo almacena datos con arquitectura Medallón, sino que los gobierna con seguridad Zero-Trust, se auto-recupera ante incidentes y democratiza la analítica mediante un copiloto agéntico dialógico."*
  - *"El sistema que verán a continuación está corriendo en vivo sobre nuestro clúster. Y para demostrar su versatilidad, comenzaremos viendo cómo Midas se adapta a cualquier fuente de datos."*
  - **Pase a Edgar Corzo:** *"Le doy la palabra a Edgar Corzo, nuestro Data Engineering Lead, para presenciar el motor de ingesta universal multi-fuente en acción."*

---

### Bloque 2 (05:00 - 10:00) | Edgar Corzo: Ingesta Multi-Fuente Adaptativa y Lakehouse Medallón
- **Objetivo:** Demostrar que Midas no depende de una sola tabla, sino que es un Data Fabric universal adaptable.
- **Acción en Pantalla:** Muestra la consola de MinIO S3 y una terminal ejecutando la ingesta simultánea de 3 fuentes distintas.
- **Guión y Puntos Clave:**
  - *"Midas cuenta con el Universal Ingestion Engine. Observen la pantalla: en este momento estamos recibiendo simultáneamente datos de una base de datos PostgreSQL, un archivo Excel con metas de presupuesto subido hace minutos, y un feed de API REST."*
  - Muestra cómo Bronze almacena la envoltura de auditoría (`_source_type`, `_schema_fingerprint`) en formato **Apache Iceberg**.
  - Ejecuta el job de **Apache Spark** que normaliza, tipa y limpia hacia Silver: *"Sin escribir código específico para cada fuente, Spark infiere los esquemas, maneja acentos y monedas, y estandariza las tablas en Silver listas para gobernar."*
  - **Pase a Dilan Chávez:** *"Pero un Lakehouse empresarial necesita coordinar estos flujos con resiliencia y visibilidad en tiempo real. Dilan Chávez nos mostrará cómo orquestamos y visualizamos este flujo en vivo."*

---

### Bloque 3 (10:00 - 15:00) | Dilan Chávez: Orquestación con Airflow y Fábrica Dinámica de DAGs
- **Objetivo:** Mostrar cómo los flujos se automatizan y cómo el sistema crea pipelines a partir de contratos declarativos reflejados en el Canvas.
- **Acción en Pantalla:** Interfaz gráfica de Apache Airflow, carpeta `s3://midas-governance/airflow-specs/` en MinIO y el Canvas React Flow.
- **Guión y Puntos Clave:**
  - *"En Apache Airflow tenemos configurados los sensores que vigilan la llegada de nuevos archivos a MinIO y disparan los pipelines Medallón automáticamente."*
  - Explica la **Fábrica Dinámica de DAGs (Pipeline-as-a-Prompt):**
    - *"Cuando un directivo pide en lenguaje natural crear un nuevo reporte Gold en el Copiloto, Midas no inventa código inseguro. Genera una especificación declarativa YAML firmada en MinIO."*
    - Muestra cómo el script maestro de Airflow lee la especificación y despliega instantáneamente un nuevo DAG con sensores, validación de calidad y registro de linaje.
  - Conecta con el Canvas: *"Cada cambio en los pipelines emite eventos de telemetría por Server-Sent Events que mueven las partículas de datos en el Canvas en tiempo real."*
  - **Pase a Joshua Gonzales:** *"Sin embargo, ningún dato puede procesarse sin garantizar seguridad de grado corporativo. Joshua Gonzales nos demostrará nuestra gobernanza Zero-Trust y el control de accesos."*

---

### Bloque 4 (15:00 - 20:00) | Joshua Gonzales: Gobernanza Zero-Trust y Lente de Roles en la UI
- **Objetivo:** Demostrar el Escudo PII en caliente y el impacto visual del Lente Zero-Trust en la plataforma web.
- **Acción en Pantalla:** Consola de Apache Atlas, Apache Ranger y la barra superior del Canvas con el selector de roles y el Drawer de linaje.
- **Guión y Puntos Clave:**
  - **Escudo PII:** *"En un pipeline tradicional, los datos sensibles quedan expuestos hasta que alguien los etiqueta a mano. En Midas, durante la ingesta a Silver, Spark detectó patrones de correos y documentos, llamó a la API de Apache Atlas y le asignó la etiqueta PII_CONFIDENCIAL automáticamente."*
  - Muestra Ranger: *"Gracias a TagSync, Ranger aplicó enmascaramiento dinámico inmediato en Trino."*
  - **Lente Zero-Trust en Vivo (Momento Visual):**
    - Cambia en la cabecera el rol de **Director General** a **Gerente Regional Norte**:
    - *"Observen el Canvas: los nodos del sur y centro se atenúan con alertas de restricción territorial, y las consultas de Trino se filtran por fila automáticamente. La seguridad no es teórica; es observable en tiempo real."*
  - **Pase a Sebastian Castiblanco:** *"¿Pero qué ocurre cuando un pipeline falla en producción? Sebastian Castiblanco nos mostrará cómo opera Midas Guardian, nuestro subsistema de auto-recuperación activa."*

---

### Bloque 5 (20:00 - 25:00) | Sebastian Castiblanco: Midas Guardian y Resiliencia en Vivo
- **Objetivo:** El momento clímax técnico: inyectar un fallo en vivo y demostrar que el sistema lo aísla y se recupera sin corromper la capa Gold.
- **Acción en Pantalla:** Ejecuta el script de inyección de fallo y muestra el Canvas reaccionando en vivo.
- **Guión y Puntos Clave:**
  - *"En lugar de decirles que el sistema es resiliente, se lo vamos a demostrar rompiéndolo en vivo."*
  - Ejecuta: `python scripts/inject_fault.py --fault negative_amount` (Inyección de registros corruptos con monto negativo y datos inválidos).
  - En el Canvas: El nodo Silver se tiñe de ámbar. Se activa el nodo **Midas Guardian**.
  - *"Observen lo que ocurrió: Guardian clasificó el error, aplicó el playbook QUARANTINE_INVALID_ROWS_V1 y desvió los 14 registros corruptos a la tabla de cuarentena. El 99.8% sano del lote continuó hacia Gold."*
  - *"Y lo más importante: mientras se resolvía el incidente, los dashboards y el Copiloto siguieron sirviendo la última versión válida aprobada. Cero caída de servicio, cero datos contables corruptos."*
  - **Pase a Elian Rivera:** *"Ahora que los datos están limpios, seguros y garantizados, Elian Rivera nos mostrará cómo el usuario final interactúa con esta inteligencia."*

---

### Bloque 6 (25:00 - 30:00) | Elian Rivera: Copiloto Agéntico, Storytelling y Cierre
- **Objetivo:** Cerrar con el máximo impacto conversacional: Modo Dialógico Proactivo, Data Storytelling con ECharts, linaje interactivo y Text-to-Gold en vivo.
- **Acción en Pantalla:** Canvas con Time-Travel Replay y el widget del Copiloto Agéntico interactuando en lenguaje natural.
- **Guión y Puntos Clave:**
  - **Time-Travel Replay:** Muestra la barra de scrubbing: *"Con nuestra barra de replay, el equipo de operaciones puede rebobinar el tiempo y ver exactamente cómo se originó y contuvo el fallo de las 2:00 AM como una película."*
  - **Copiloto Dialógico en Acción:**
    - Escribe: *"Hola Midas, ¿qué tenemos disponible?"* $\rightarrow$ Muestra el saludo inteligente donde el agente inspecciona activamente las 3 fuentes conectadas y propone análisis.
    - Escribe: *"Cruza las ventas reales del CRM con el presupuesto del Excel y muéstrame el cumplimiento por región"*.
    - Muestra la respuesta en segundos:
      1. Gráfico interactivo en **Apache ECharts** (Barras de Real vs. Meta).
      2. Narrativa ejecutiva estructurada con recomendaciones de negocio.
      3. **Sello de Certificación:** Calidad 100%, frescura de 3 minutos.
      4. Hace clic en un número: Se abre el drawer de **"Explícame esta cifra"** con el árbol de linaje exacto.
  - **Text-to-Gold en Vivo:** Hace clic en `[Aprobar y Crear Pipeline en Airflow]` $\rightarrow$ Se genera el mart en Gold y el Canvas dibuja el nuevo nodo en tiempo real.
  - **Cierre por Daniel Echeverría:** *"Esto es Midas: datos vivos, seguros, resilientes y al servicio de las decisiones estratégicas de la organización. Muchas gracias a todos; abrimos la sesión de preguntas."*

---

## 4. Plan de Contingencia ante Fallos en la Demo

| Posible Imprevisto | Causa Probable | Plan de Mitigación Inmediato |
| :--- | :--- | :--- |
| **Demora en respuesta de Trino** | Consulta sin filtro | El guardrail inyecta automáticamente `LIMIT 1000` y el semáforo de costo advierte antes de lanzar la query. |
| **Cierre accidental del navegador** | Desconexión local | SSE reconecta de inmediato usando `Last-Event-ID` y PostgreSQL restaura el estado exacto del Canvas. |
| **Caída de un contenedor Docker** | Memoria local saturada | La máquina de estados de Guardian entra en modo seguro y muestra los snapshots cacheados de las tablas Gold aprobadas. |
