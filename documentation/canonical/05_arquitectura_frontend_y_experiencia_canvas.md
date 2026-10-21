# Midas — Arquitectura Frontend y Experiencia del Canvas en Vivo
## Canvas React Flow, Telemetría SSE, Time-Travel Replay y Experiencia Conversacional

> **Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform  
> **Fecha:** 17 de Octubre de 2026 · **Versión:** 1.0  
> **Stack UI:** Next.js 14 / React 18 · Tailwind CSS · React Flow 11 · Apache ECharts · Lucide Icons  

---

## 1. Visión y Distribución de la Interfaz de Usuario

La plataforma Midas está diseñada como una consola de comando ejecutiva dividida en dos paneles sincronizados en tiempo real:

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              MIDAS ENTERPRISE PLATFORM                                 │
├────────────────────────────────────────────────────────────────────────────────────────┤
│ [Logo Midas]  [Barra de Replay: T0 Normal | T1 Falla | T2 Guardian | T3 OK]  [Rol: ▾]  │
├───────────────────────────────────────────┬────────────────────────────────────────────┤
│                                           │                                            │
│        CANVAS DE FLUJO EN TIEMPO REAL     │             COPILOTO AGÉNTICO              │
│                 (React Flow)              │          (Chat, Storytelling & ECharts)    │
│                                           │                                            │
│   ┌────────┐    ┌────────┐    ┌────────┐  │  > Briefing Matutino Proactivo:            │
│   │ Bronze │───>│ Silver │───>│  Gold  │  │    "Ventas netas subieron 14% [Info]...    │
│   └────────┘    └────────┘    └────────┘  │                                            │
│        │             │                    │  [Gráfico Interactivo ECharts: Tendencia]   │
│        ▼             ▼                    │                                            │
│   ┌──────────────────────┐                │  > Sello de Certificación:                 │
│   │ Midas Guardian Alert │                │    ✓ 100% Calidad · MinIO Frescura: 2m     │
│   └──────────────────────┘                │                                            │
│                                           │  [Entrada de Prompt: "Crea vista Gold..."] │
└───────────────────────────────────────────┴────────────────────────────────────────────┘
```

---

## 2. El Canvas de Flujo de Datos en Tiempo Real (React Flow)

El Canvas no es una imagen estática; es un grafo interactivo animado que reacciona a eventos transmitidos desde el backend a través de **Server-Sent Events (SSE)**.

### 2.1. Nodos Personalizados del Grafo
1. **`SourceNode`:** Representa los orígenes de datos (archivos CSV, bases relacionales). Muestra tasa de lectura y estado del sensor de Airflow.
2. **`BronzeNode`:** Representa `bronze.pedidos_raw` en MinIO. Muestra contador total de filas crudas y último timestamp de ingesta.
3. **`SilverNode`:** Representa `silver.pedidos`. Incluye un indicador de registros limpios y un sub-nodo de advertencia para `silver.pedidos_quarantine` con conteo de filas desviadas.
4. **`GoldNode`:** Representa `gold.fact_ventas` y los marts dinámicos. Indica la versión del snapshot de Iceberg y si está bloqueada por Guardian.
5. **`GuardianNode`:** Nodo de monitoreo flotante. Se ilumina cuando se detecta un incidente y muestra el playbook en ejecución.

### 2.2. Animación de Conexiones (*Edge Flow*)
- Cuando un lote de datos está transitando entre capas, las aristas (*edges*) activan partículas luminosas animadas con SVG/CSS.
- El color de las aristas cambia según la salud:
  - **Verde brillante:** Flujo normal y saludable.
  - **Ámbar parpadeante:** Detección de filas en cuarentena.
  - **Rojo:** Bloqueo de promoción por error crítico de contrato.

### 2.3. Nodos Dinámicos Debutados por SSE (HU-FRONT-08)
> **Estado:** Vigente desde el 21 de Octubre de 2026 · **HU:** `HU-FRONT-08` · **Responsable:** Joshua Gonzales

El grafo del Canvas **no es una lista cerrada**. El frontend incorpora al estado del grafo los nodos y aristas que el backend anuncia en caliente, sin recarga de página y sin duplicar entidades.

1. **Contrato de evento (único y canónico).** El Hub de Telemetría emite objetos `TelemetryEvent` (`src/core/telemetry/events.py`). El frontend **no inventa campos**: consume el evento tal cual llega.
   - `event_id`: identificador único e inmutable del evento. Es la clave de **deduplicación**: un `event_id` repetido (reenvío por `Last-Event-ID`, reconexión o reintento) **nunca** crea un nodo, una arista ni una métrica duplicada.
   - `node_id`: identificador único del nodo en el grafo.
   - `details.event_type`: discriminante semántico del evento. El backend publica `NEW_GOLD_NODE_AVAILABLE` (ver `src/agent/tools/dag_generator.py`) para anunciar un mart Gold recién materializado, con `details.output_table` como nombre calificado de la tabla.
2. **Nodo nuevo.** Ante un evento cuyo `node_id` no existe en el grafo, el Canvas **crea** el nodo y lo **añade** al estado (`append`, nunca `replace`). Los nodos y aristas preexistentes se conservan íntegros, con sus posiciones, selección y viewport.
   - La capa del nodo se deduce del `node_id` y de `details.output_table`; un nodo Gold se representa con el tipo `stage` y subtipo `gold` reutilizando `StageNode` (sin alterar los nodos personalizados existentes).
   - La posición del nodo dinámico se calcula de forma **determinista** en una banda inferior del grafo, de modo que nunca solapa la topología canónica.
3. **Arista derivada.** El backend **no emite** eventos de conexión. La arista de un nodo debutado se **deriva** de la cadena Medallion canónica (`source → bronze → silver → gold`): un nodo Gold nace conectado desde `silver_cleansing` y un nodo Silver desde `bronze_raw`. La arista es de lectura lógica, no de certificación de linaje.
   - La arista sólo se crea si su nodo padre existe en el grafo. Si el padre aún no ha sido recibido, la conexión queda **pendiente** y se enlaza cuando el padre aparezca (tolerancia a eventos fuera de orden).
   - El identificador de la arista es determinista (`edge_<origen>_<destino>`), lo que garantiza la **idempotencia**: un evento repetido no duplica la conexión.
4. **Restablecer layout.** La acción de reinicio de layout restaura la topología canónica **sin eliminar** los nodos y aristas dinámicos ya recibidos.
5. **Escudo de honestidad.** El Canvas nunca fabrica un nodo a partir de un evento que no cumple el contrato mínimo `TelemetryEvent`. Un `node_id` desconocido **no** se descarta silenciosamente: se incorpora al grafo como nodo con estado `UNKNOWN` y sin métricas inventadas.

---

## 3. Funcionalidades Diferenciadoras del Canvas

### 3.1. Barra de Replay Temporal (*Time-Travel Playback*)
Ubicada en la parte superior del Canvas, permite arrastrar un control deslizante para reproducir la historia del pipeline en 4 estados clave de la demo:
- **`T0 (Normal):`** Todos los nodos en verde; flujo fluido de transacciones.
- **`T1 (Incidente Inyectado):`** El nodo Silver pasa a ámbar/rojo; se evidencia la llegada del fallo (ej. F3 monto negativo o F4 cambio de esquema).
- **`T2 (Guardian en Acción):`** Se activa el nodo Guardian, mostrando el aislamiento de registros en cuarentena y la preservación de la última versión Gold sana.
- **`T3 (Recuperado y Publicado):`** Validación completada, aprobación registrada y el pipeline vuelve a verde con el nuevo snapshot publicado.

> **Regla de fuente de verdad (HU-FRONT-08, 21-Oct-2026):** la línea de tiempo **no se fabrica en el frontend**. Los eventos que alimentan el scrubber provienen de `GET /api/v1/telemetry/history` del Gateway de Telemetría. El frontend **no genera snapshots sintéticos** en el flujo productivo: los hitos canónicos T0–T3 se anclan sobre los eventos publicados por el backend en `GET /api/v1/telemetry/scenarios/{id}` y se rotulan como **escenario del backend**, nunca como telemetría persistida. Los estados `vacío`, `cargando` y `error` son de primera clase y se comunican al usuario.

### 3.2. Simulador Lente Zero-Trust
Selector en la cabecera con tres identidades de prueba para auditoría de seguridad con **Apache Ranger**:
- **Vista: Director General** $\rightarrow$ Todos los nodos del Canvas en verde; acceso irrestricto.
- **Vista: Gerente Regional Norte** $\rightarrow$ Nodos de otras regiones en ámbar con etiqueta flotante: `Row Filter: region = 'NORTE'`.
- **Vista: Analista Externo** $\rightarrow$ Nodos financieros en rojo con candado: `Acceso Denegado por Política Ranger #402`; nodos permitidos con etiqueta `Column Mask: PII`.

> **Regla de evidencia (HU-FRONT-08, 21-Oct-2026):** las identidades, los nodos permitidos y bloqueados y la política declarada (`ranger_row_filter`, `ranger_column_mask`) provienen de `GET /api/v1/auth/roles`. El frontend **no** inventa porcentajes de visibilidad, correos ni salarios de ejemplo. La Lente distingue tres planos y **sólo** afirma aplicación de enmascaramiento cuando el backend entrega evidencia verificable; en ausencia de evidencia declara explícitamente *"sin evidencia de aplicación"*.

---

## 4. Experiencia del Copiloto Agéntico y Data Storytelling

### 4.1. "Explícame esta cifra" (Explicabilidad Interactiva)
Cada métrica en la narrativa del Copiloto se renderiza como un chip interactivo (ej. `[$1.2M ℹ️]`). Al hacer clic:
- Se abre un **Drawer Lateral** con el árbol de linaje:
  - **Fuente:** `s3://midas-gold/fact_ventas/` (Snapshot `#784239824`).
  - **Transformación:** Agregación de `silver.pedidos` con filtro `estado = 'ENTREGADO'`.
  - **Calidad:** 100% de reglas cumplidas, con 1.4% de registros excluidos en cuarentena.
  - **Origen:** Archivo `pedidos_20261017.csv` ingerido por Airflow a las 14:02 UTC.

> **Regla de certificación (HU-FRONT-08, 21-Oct-2026):** el árbol de linaje, la fórmula y la certificación del drawer provienen **exclusivamente** de `GET /api/v1/lineage/table/{table}`. Si el gateway no responde, la cifra se muestra **explícitamente no certificada**: sin porcentaje de calidad, sin resumen "100% Contratos Certificados" y sin presentar el hash local derivado como si fuera una firma del catálogo. El frontend **no rellena** con valores literales las etapas incompletas que devuelve el gateway; una etapa sin tabla o ubicación no se muestra.

### 4.2. Sello de Certificación Ejecutiva
Cada respuesta analítica concluye con una tarjeta visual compacta de confianza:
- 🟢 **Calidad de Datos:** 100% Contratos Aprobados (OpenMetadata).
- 🕒 **Frescura:** Actualizado hace 4 minutos en MinIO Iceberg.
- 🔒 **Gobernanza:** Filtrado bajo políticas de Apache Ranger.
- 📋 **Linaje:** Verificado en OpenMetadata.

### 4.3. Modal de Aprobación Text-to-Gold
Cuando el usuario solicita crear una nueva capa Gold mediante lenguaje natural:
1. El Copiloto presenta una tarjeta de vista previa con los primeros 5 registros de muestra y el Semáforo de Costo de Spark (**Verde**).
2. Muestra un botón destacado: `[Aprobar y Crear Pipeline en Airflow]`.
3. Al hacer clic, el backend envía la especificación declarativa a MinIO, Airflow genera el DAG dinámico y el Canvas dibuja inmediatamente el nuevo nodo Gold en la pantalla.
