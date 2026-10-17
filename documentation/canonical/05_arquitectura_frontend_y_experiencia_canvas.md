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

---

## 3. Funcionalidades Diferenciadoras del Canvas

### 3.1. Barra de Replay Temporal (*Time-Travel Playback*)
Ubicada en la parte superior del Canvas, permite arrastrar un control deslizante para reproducir la historia del pipeline en 4 estados clave de la demo:
- **`T0 (Normal):`** Todos los nodos en verde; flujo fluido de transacciones.
- **`T1 (Incidente Inyectado):`** El nodo Silver pasa a ámbar/rojo; se evidencia la llegada del fallo (ej. F3 monto negativo o F4 cambio de esquema).
- **`T2 (Guardian en Acción):`** Se activa el nodo Guardian, mostrando el aislamiento de registros en cuarentena y la preservación de la última versión Gold sana.
- **`T3 (Recuperado y Publicado):`** Validación completada, aprobación registrada y el pipeline vuelve a verde con el nuevo snapshot publicado.

### 3.2. Simulador Lente Zero-Trust
Selector en la cabecera con tres identidades de prueba para auditoría de seguridad con **Apache Ranger**:
- **Vista: Director General** $\rightarrow$ Todos los nodos del Canvas en verde; acceso irrestricto.
- **Vista: Gerente Regional Norte** $\rightarrow$ Nodos de otras regiones en ámbar con etiqueta flotante: `Row Filter: region = 'NORTE'`.
- **Vista: Analista Externo** $\rightarrow$ Nodos financieros en rojo con candado: `Acceso Denegado por Política Ranger #402`; nodos permitidos con etiqueta `Column Mask: PII`.

---

## 4. Experiencia del Copiloto Agéntico y Data Storytelling

### 4.1. "Explícame esta cifra" (Explicabilidad Interactiva)
Cada métrica en la narrativa del Copiloto se renderiza como un chip interactivo (ej. `[$1.2M ℹ️]`). Al hacer clic:
- Se abre un **Drawer Lateral** con el árbol de linaje:
  - **Fuente:** `s3://midas-gold/fact_ventas/` (Snapshot `#784239824`).
  - **Transformación:** Agregación de `silver.pedidos` con filtro `estado = 'ENTREGADO'`.
  - **Calidad:** 100% de reglas cumplidas, con 1.4% de registros excluidos en cuarentena.
  - **Origen:** Archivo `pedidos_20261017.csv` ingerido por Airflow a las 14:02 UTC.

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
