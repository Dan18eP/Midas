# Midas — Arquitectura del Agente de IA, Capa Semántica y Modo Dialógico
## Orquestación con LangGraph, FastAPI, Introspección Multi-Fuente, Text-to-Gold y Guardrails OWASP

> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Fecha:** 17 de Octubre de 2026 · **Versión:** 2.0 (Agente Dialógico Proactivo & Multi-Fuente)  
> **Stack AI:** Python 3.11 · FastAPI · LangGraph · LangChain · Trino Python Client · ECharts JSON  

---

## 1. Visión del Copiloto Agéntico: Asistente Dialógico Proactivo

El Copiloto Agéntico de Midas trasciende el paradigma de "pregunta y respuesta pasiva". Opera como un **Consultor de Datos Autónomo** que:
1. **Inicia el Diálogo e Introspecciona Fuentes:** Al entrar a la plataforma o ante un saludo, inspecciona el catálogo de **OpenMetadata** y le pregunta proactivamente al usuario qué fuente, base de datos o tabla desea explorar.
2. **Navegación Guiada de Tablas:** Permite al usuario descubrir qué tablas existen en Silver, cuántos registros tienen, qué columnas son confidenciales y cuál es su estado de calidad.
3. **Cero Alucinaciones:** Toda métrica o número se calcula mediante SQL en **Trino** sobre las tablas Iceberg; el modelo nunca inventa cálculos contables.
4. **Transformación Multi-Fuente a Gold (Text-to-Gold):** Puede sugerir o ejecutar cruces entre fuentes heterogéneas (ej. cruzar transacciones de PostgreSQL con metas de un archivo Excel) y materializar el resultado en Airflow.
5. **Seguridad Nativa por Rol:** Toda consulta se ejecuta impersonando el rol del usuario bajo las políticas de **Apache Ranger**.

---

## 2. Grafo de Estados del Agente (LangGraph Architecture)

La implementación inicial del diálogo usa estos nodos y mantiene la ruta
analítica en este orden: `route_intent` → `introspect_schema` →
`proactive_suggest` → `generate_sql` → `validate_guardrails` → `execute_query` →
`synthesize_storytelling`. Los saludos, el descubrimiento y las preguntas ambiguas
terminan después de `proactive_suggest`; una solicitud analítica completa sigue
hasta la síntesis.

La memoria de cada sesión se guarda con el checkpointer `PostgresSaver` de
LangGraph en la base operacional PostgreSQL existente. Cada llamada debe incluir
un `thread_id` estable en `configurable`; conversaciones con IDs distintos no
comparten estado. La aplicación prepara las tablas de checkpoint al iniciar el
servicio. Las conexiones a OpenMetadata, generación SQL y Trino se entregan al
grafo como servicios, para que sus nodos no simulen resultados cuando una
integración no esté disponible.

El estado conversacional conserva tanto los mensajes `HumanMessage` como los
`AIMessage` de respuesta. Si una pregunta queda pendiente de una aclaración,
`pending_intent` y `pending_query` guardan su contexto; al recibir la respuesta,
el enrutador combina ambos turnos antes de solicitar SQL.

El guardado del grafo acepta la interfaz común `BaseCheckpointSaver`, de modo
que PostgreSQL se usa en ejecución y `InMemorySaver` en pruebas.

El catálogo de demostración muestra las tres fuentes definidas en la sección 3.1.
En despliegue, el proveedor de fuentes activas debe consultar el registro de
conectores y reemplazar ese catálogo de demostración.

```mermaid
flowchart TD
    START([Mensaje del Usuario o Inicio de Sesión]) --> INTENT_ROUTER{Enrutador de Intención}
    
    %% Rutas de Intención
    INTENT_ROUTER -->|Saludo / Descubrimiento de Fuentes| DISCOVERY_NODE[Introspección de Fuentes & Guía Proactiva]
    INTENT_ROUTER -->|Pregunta Analítica / Métricas| SEMANTIC_RETRIEVER[Recuperador Semántico\n(OpenMetadata + Contratos)]
    INTENT_ROUTER -->|Solicitud de Nueva Capa Gold| GOLD_TRANSFORMER[Planificador Text-to-Gold Multi-Fuente]
    INTENT_ROUTER -->|Consulta de Incidente / Falla| GUARDIAN_DIAGNOSTIC[Diagnóstico de Midas Guardian]

    %% Flujo de Descubrimiento Guiado
    DISCOVERY_NODE --> DISCOVERY_PROMPT[Presentar Fuentes Conectadas & Opciones de Exploración]
    DISCOVERY_PROMPT --> FINAL_RESPONSE([Respuesta Interactiva])

    %% Flujo Analítico
    SEMANTIC_RETRIEVER --> SQL_GENERATOR[Generador SQL Seguro]
    SQL_GENERATOR --> SQL_GUARDRAILS{Validador OWASP & Costo}
    SQL_GUARDRAILS -->|Aprobado| TRINO_EXECUTOR[Ejecutor Trino\n(Impersonando Rol Ranger)]
    SQL_GUARDRAILS -->|Rechazado| REWRITE_QUERY[Ajuste de Filtros / Error]
    REWRITE_QUERY --> SQL_GENERATOR
    
    TRINO_EXECUTOR --> STORYTELLING_NODE[Motor de Storytelling & ECharts]
    STORYTELLING_NODE --> EXPLAINABILITY_CHIPS[Extracción de Chips 'Explícame esta Cifra']
    EXPLAINABILITY_CHIPS --> FINAL_RESPONSE

    %% Flujo Text-to-Gold Multi-Fuente
    GOLD_TRANSFORMER --> COST_SEMAPHORE{Semáforo de Costo Spark}
    COST_SEMAPHORE -->|Verde / Aceptable| SPEC_GENERATOR[Generador de Contrato YAML en MinIO]
    COST_SEMAPHORE -->|Rojo / Excesivo| WARN_USER[Sugerencia de Partición / Filtro]
    SPEC_GENERATOR --> PREVIEW_PROMPT[Presentar Preview & Botón de Aprobación en Airflow]
    PREVIEW_PROMPT --> FINAL_RESPONSE

    %% Flujo Guardian
    GUARDIAN_DIAGNOSTIC --> INCIDENT_EXPLAINER[Explicación de Causa Raíz & Playbook]
    INCIDENT_EXPLAINER --> FINAL_RESPONSE
```

---

## 3. Especificación de los Nodos del Grafo

### 3.1. `DiscoveryAndGuidanceNode` (Modo Dialógico Proactivo)
- **Activación:** Se dispara cuando el usuario inicia sesión, saluda (*"Hola"*, *"Buenas tardes"*), o pregunta *"¿Qué datos tienes?"* o *"¿Qué puedo consultar?"*.
- **Acción:** Invoca la API de OpenMetadata (`GET /api/v1/services/databaseServices`) y el registro de conectores de PostgreSQL.
- **Respuesta Estructurada:** Genera un mensaje de bienvenida dinámico listando las fuentes activas:
  - 🗄️ **Base Relacional:** `crm_operaciones` (Tablas: `clientes`, `transacciones`).
  - 📁 **Hoja Excel:** `Presupuesto_2026.xlsx` (Hojas: `Presupuesto_Metas`, `Costos_Operativos`).
  - 🌐 **API REST:** `helpdesk_tickets_live` (Tickets y satisfacción CSAT).
- **Llamado a la Acción Guiado:** Ofrece 3 botones o sugerencias interactivas:  
  `[Explorar tablas de CRM]` · `[Analizar cumplimiento de presupuesto]` · `[Crear nuevo Mart Gold]`.
- **Aclaración de año dinámica:** Si una pregunta de ventas no especifica año, el
  nodo consulta los años distintos realmente presentes en
  `gold.fact_ventas.anio` y los ofrece como opciones. Si no hay metadatos
  disponibles, solicita el año sin valores fijos y acepta `todos` para consultar
  el histórico completo. Nunca se inventan años de demostración.

### 3.2. `SemanticRetrieverNode`
- Consulta el glosario de OpenMetadata y recupera la definición canónica de las columnas de las tablas involucradas.
- Soporta sinónimos de negocio (ej. *"facturación"*, *"ingresos"* o *"ventas"* mapean a `monto_neto`).

### 3.3. `SqlGeneratorNode` & `SqlGuardrailsNode` (OWASP LLM01 Defense)
- Genera sentencias `SELECT` compatibles con Trino sobre tablas Gold y Silver
  autorizadas por el catálogo introspeccionado. El proveedor activo entrega el
  nombre calificado y las columnas reales de cada tabla; estas definiciones
  deben coincidir con los contratos canónicos de `documentation/canonical/03`.
- El validador procesa una sola sentencia con `sqlglot` en dialecto Trino y
  acepta únicamente consultas de lectura. Rechaza DDL/DML (`DROP`, `DELETE`,
  `TRUNCATE`, `ALTER`, `INSERT`, `UPDATE`, `CREATE`, `GRANT` y `REVOKE`),
  sentencias encadenadas, tablas desconocidas y columnas fuera del catálogo.
- Si la consulta no declara un límite, el validador agrega `LIMIT 1000` al AST.
- Un escudo de prompt injection bloquea instrucciones para ignorar políticas,
  revelar prompts o eludir restricciones antes de llamar al generador.
- La consulta solo llega al ejecutor Trino después de pasar todos los controles;
  cualquier error cierra el flujo sin ejecutar SQL.

El AST resuelve alias de tablas y columnas calificadas. Una columna no
calificada se acepta solo cuando existe en todas las tablas del `FROM`/`JOIN`
autorizadas; ante ambigüedad o metadatos insuficientes, la consulta se rechaza.
El proveedor de introspección entrega cada tabla como nombre calificado y su
lista de columnas. Si el catálogo no está disponible o no contiene columnas,
no se genera ni ejecuta una consulta analítica.

#### Enrutamiento local de modelos (ADR-008 / HU-AI-05)

El `ModelRouter` usa Gemini (`GEMINI_MODEL`, por defecto
`gemini-3.1-flash-lite`) cuando `GEMINI_API_KEY` está configurada. Si no hay
clave o la llamada falla, usa Ollama local con `qwen2.5:3b` en los endpoints
aprobados `http://midas-ollama:11434` o `http://host.docker.internal:11434`; el
primero es el valor predeterminado. La petición local tiene un timeout de 8
segundos. No configura proveedores cloud distintos de Gemini.

Para las intenciones que coinciden con el contrato analítico soportado, el
router resuelve primero la consulta con SQLGlot y la plantilla determinística
certificada, sin invocar al modelo. Para el resto de intenciones consulta
Gemini u Ollama y valida la salida con el `QueryGuardrail`; si el modelo falla o
devuelve SQL inválido, reintenta la plantilla determinística y, si tampoco
aplica, falla sin ejecutar SQL. La plantilla prioriza las tablas Gold
certificadas (`gold.fact_ventas`, `gold.fct_ventas_diarias`) y usa
`venta_neta` como métrica canónica para "ventas" o "ingresos"; si la tabla Gold
no existe, recurre a la tabla Silver de ventas disponible en el catálogo.
Admite conteos, suma/promedio y filtros por año. También admite una única
dimensión de agrupación (`region_id`, `mes`, `anio`, `tienda_id`,
`canal_venta`, `cliente_id` o `dia`) y variantes Top N
(*"top 5 tiendas por ventas"*), generando `GROUP BY` y orden descendente por la
métrica. Los filtros de categoría disponibles son `region_id` (`REG-NORTE`,
`REG-SUR`, `REG-CENTRO`), `canal_venta` (`ONLINE`, `TIENDA`, `PARTNER`) y
`estado` (`CERRADO`, `ABIERTO`), con un filtro por consulta. Las comparaciones
entre años, los cruces de tablas y las agrupaciones con más de una dimensión
siguen fallando sin ejecutar SQL.

Si Trino reporta que una tabla o columna no existe, el cliente **no** sirve
filas sintéticas en producción: devuelve un error explícito y el agente informa
que no encontró datos reales. El motor local determinístico de fixtures queda
restringido a `fallback_for_testing=True` (pruebas unitarias e integración sin
cluster) y nunca se activa en el flujo conversacional real.

Los prompts de Text-to-Gold para Qwen reciben el catálogo permitido, solicitan
una única consulta Trino sin prosa y recuerdan las reglas de solo lectura. Toda
salida, incluida la del fallback, pasa por el mismo `QueryGuardrail`: solo
`SELECT`, capas `silver`/`gold`, validación de tablas y columnas e inyección de
`LIMIT 1000`.

### 3.4. `TrinoExecutorNode`
- Ejecuta la consulta en Trino pasando la cabecera `X-Trino-User` con el rol actual del Lente Zero-Trust (ej. `director_general`, `gerente_norte`, `analista_externo`).
- Ranger intercepta y aplica las políticas de enmascaramiento y filtrado de forma transparente.

### 3.5. `StorytellingNode` y Chips de "Explícame esta Cifra"
- Sintetiza exclusivamente las filas devueltas por Trino en un resultado estructurado con tres campos:
  - `narrative`: resumen Markdown con hallazgos y recomendación de negocio.
  - `echarts_option`: opción compatible con Apache ECharts, con título, tooltip,
    leyenda, ejes cuando correspondan y la paleta Midas (`#0F766E`, `#14B8A6`,
    `#F59E0B`, `#1E293B`).
  - `metrics_summary`: lista de cifras observadas con etiqueta, valor original,
    columna de origen e índice de fila para que el cliente pueda abrir el drawer
    de linaje correspondiente.
- El generador narrativo no calcula cifras nuevas. Cada número en `narrative`
  debe copiarse literalmente de un valor numérico presente en las filas de
  Trino; conteos, porcentajes, diferencias y promedios no observados no se
  agregan.
- El sintetizador de gráficos decide el tipo a partir de los valores y nombres
  de columnas, en este orden: una dimensión temporal con valores numéricos usa
  línea con área; dos columnas numéricas usan dispersión; una categoría
  discreta junto a una columna numérica usa barras horizontales. Si no hay
  suficientes datos para esos casos, devuelve una opción ECharts válida sin
  series y explica la limitación sin inventar cifras.
- El contrato del estado del agente separa el texto para el chat de los datos
  de visualización: `state.response` contiene solo `narrative` en Markdown y el
  historial `messages` presenta ese mismo texto. `state.storytelling_result`
  conserva el objeto serializable con `narrative`, `echarts_option` y
  `metrics_summary`, para que la API exponga los gráficos y el linaje en campos
  estructurados sin mostrarlos como JSON crudo en el chat.
- Ante un error de consulta, `state.response` contiene el mensaje de error y
  `state.storytelling_result` queda vacío. La síntesis se ejecuta después de
  Trino y no altera las filas recibidas.

### 3.6. `TextToGoldPlannerNode` (Pipeline-as-a-Prompt Multi-Fuente)
- Cuando el usuario solicita un cruce complejo (ej. transacciones de PostgreSQL con metas del Excel):
  1. Genera la consulta de agregación en Spark SQL.
  2. Valida que el costo de escaneo sea seguro (**Semáforo Verde**).
  3. Muestra una vista previa de 5 filas en el chat.
  4. Genera el contrato declarativo en `s3://midas-governance/airflow-specs/` y pide la aprobación del usuario para activar el DAG en Airflow.

### 3.7. Confirmación y contrato de materialización Gold
- La materialización solo se publica después de una confirmación explícita del usuario.
- El backend valida una única consulta `SELECT` con el catálogo de Trino, conserva el SQL validado y deriva un nombre seguro para el DAG y la tabla `gold`.
- El YAML en `midas-governance/airflow-specs/dag_gold_<nombre>.yaml` contiene `pipeline_id`, `cron_schedule`, `transform_sql`, `output_table` y `quality_policies`. No contiene código Python generado por el modelo.
- La fábrica de Airflow vuelve a consultar el prefijo `airflow-specs/` durante el ciclo de parseo del scheduler; así puede registrar nuevos DAGs sin reiniciar el scheduler. Cada DAG ejecuta la transformación Spark con sus políticas de calidad y publica un aviso SSE.
- Después de publicar el YAML, se emite un evento SSE `telemetry` con `details.event_type = NEW_GOLD_NODE_AVAILABLE`, el identificador del DAG y la tabla destino. El cliente usa `node_id` para agregar o actualizar el nodo Gold.
- El botón de aprobación del Canvas envía `Materializa este reporte como tabla Gold diaria` por `POST /api/v1/agent/chat`. El backend reutiliza el SQL y el catálogo validados en ese `thread_id`; sin una consulta previa, devuelve un conflicto y no publica.
- El endpoint `POST /api/v1/agent/materialize` también permite publicar contratos desde clientes que envían explícitamente el SQL, el catálogo, el nombre del reporte, el cron y `confirmed`. Si `confirmed` es falso, no escribe el contrato ni emite el evento.

---

## 4. Ejemplos de Diálogo Guiado en la Plataforma

### Caso 1: Descubrimiento Proactivo
```
Usuario: "Hola Midas, ¿qué información tenemos disponible para analizar?"

Copiloto:
"¡Hola Daniel! Actualmente tengo acceso a 3 fuentes de datos integradas en el Lakehouse:

 1. Base de Datos CRM (PostgreSQL):
    • clientes (12,400 registros)
    • transacciones (184,200 registros de ventas)
 2. Archivo Excel 'Presupuesto_Corporativo_2026.xlsx':
    • Metas de ingresos y costos fijos por región
 3. API REST Helpdesk:
    • Tickets de soporte y calificación de satisfacción CSAT

¿Te gustaría que analicemos el cumplimiento del presupuesto, revisemos el comportamiento de los clientes por región, o prefieres ver las métricas de calidad de alguna tabla?"
```

### Caso 2: Petición de Transformación Multi-Fuente a Gold
```
Usuario: "Quiero cruzar las ventas reales del CRM con las metas del Excel para ver qué regiones van perdiendo el año"

Copiloto:
"Excelente idea. Puedo cruzar la tabla 'silver.crm_transacciones' con la hoja 'silver.finanzas_metas_presupuesto' agrupando por región y mes.

He preparado una vista previa:
| Región | Venta Real ($) | Meta Presupuesto ($) | Cumplimiento (%) | Brecha ($) |
|---|---|---|---|---|
| NORTE  | $420,000       | $500,000             | 84.0%            | -$80,000   |
| SUR    | $310,000       | $300,000             | 103.3%           | +$10,000   |
| CENTRO | $680,000       | $700,000             | 97.1%            | -$20,000   |

Semáforo de Costo Spark: 🟢 Verde (Escaneo eficiente de 14 MB).
¿Deseas que guarde esta vista en la capa Gold y programe su actualización automática cada 6 horas en Apache Airflow?"
```
