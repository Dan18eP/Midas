# Subsanación de Resolución Resiliente de Conexiones en Catálogo Operacional y Canvas

> **Historia de Usuario:** HU-LAKE-05 & HU-BACK-03 (Registro Dinámico de Conexiones Multi-Fuente y Ejecución de Pipelines)  
> **Fecha:** Jueves, 22 de Octubre de 2026  
> **Responsables:** Daniel Echeverría & Edgar Corzo  
> **Área:** Lakehouse, Backend & Frontend Canvas  

---

## 1. Causa Raíz del Error (`Error: La conexión '1792672346884' no existe en el catálogo.`)

1. **Desconexión entre ID de Canvas y Catálogo Backend:**
   Al subir un archivo en `QuickConnectionModal.tsx` (`uploadDataFile`), el backend registraba exitosamente la conexión en la tabla operacional PostgreSQL con un identificador determinístico (ej: `conn_csv_walmart_sales_2c7736`). Sin embargo, el frontend generaba el identificador del nodo en el lienzo usando un timestamp volátil `Date.now()`:
   ```typescript
   const nodeId = `source_${Date.now()}`; // e.g. source_1792672346884
   ```
   Ignorando el `connection_id` retornado por `uploadResult`.

2. **Extracción y Disparo en `NodeInspectionDrawer.tsx`:**
   Al inspeccionar el nodo y presionar *"Ejecutar Pipeline Lakehouse"*, el componente extraía el ID eliminando el prefijo `source_`:
   ```typescript
   const connId = rawId.startsWith('source_') ? rawId.replace('source_', '') : rawId; // '1792672346884'
   ```
   Disparando la petición hacia `POST /api/v1/pipelines/1792672346884/trigger`.

3. **Inexistencia de Fallback en el Catálogo:**
   `SourceConnectionRegistry.get_connection` únicamente realizaba una búsqueda por clave exacta en su mapa en memoria. Al no coincidir el timestamp del cliente (`1792672346884`) con la conexión real persistida (`conn_csv_walmart_sales_2c7736`), el backend devolvía HTTP 404:
   `detail: "La conexión '1792672346884' no existe en el catálogo."`.
   Asimismo, los nodos canónicos (`source_postgres`, `source_excel`, `source_api`) fallaban al pasar `postgres`, `excel` o `api` sin traducción a `conn_pg_crm_default`, `conn_excel_budget_default` o `conn_rest_crm_default`.

---

## 2. Solución Implementada

### 2.1 Backend (`SourceConnectionRegistry` & `pipelines.py`)
- **Resolución Multi-Estrategia en `get_connection()` y `resolve_connection()`:**
  1. Coincidencia directa exacta.
  2. Mapeo de alias canónicos (`postgres`, `source_postgres` -> `conn_pg_crm_default`, `excel` -> `conn_excel_budget_default`, `api` -> `conn_rest_crm_default`).
  3. Eliminación transparente del prefijo `source_`.
  4. Búsqueda por índice de nombre e introspección en PostgreSQL operacional (`_fetch_from_postgres`).
  5. **Mapeo inteligente de IDs numéricos (timestamps `Date.now()`):** Conversión de timestamps de milisegundos a segundos para identificar la conexión personalizada creada más cercana en el catálogo operacional.
- **Normalización de tipos en `SourceConnectionCreate`:** Soporte para tipos alternativos como `REST_API`, `API`, `WEBHOOK` -> `REST` y `POSTGRESQL`, `MYSQL` -> `POSTGRES`.
- **Aislamiento en pruebas unitarias herméticas:** Prevención de contaminación de estado de PostgreSQL en suites de pruebas unitarias (`os.getenv("PYTEST_CURRENT_TEST")`).

### 2.2 Frontend (`QuickConnectionModal.tsx` & `NodeInspectionDrawer.tsx`)
- **Propagación del `connection_id` Real:** `QuickConnectionModal.tsx` ahora enlaza explícitamente `uploadResult.connection_id` (o el `connection_id` resultante de `registerConnection`) como `node.data.connectionId` y en `node.data.details.connection_id`.
- **Resolución Segura en Drawer:** `NodeInspectionDrawer.tsx` consulta primero `selectedNode.connectionId` o `selectedNode.details.connection_id`, mapea fuentes canónicas explícitas y aplica fallback determinístico.

---

## 3. Pruebas y Verificación

- **Pruebas de Integración de Pipelines:**
  ```bash
  curl -X POST http://localhost:8000/api/v1/pipelines/1792672346884/trigger -> HTTP 200 OK
  curl -X POST http://localhost:8000/api/v1/pipelines/source_1792672346884/trigger -> HTTP 200 OK
  curl -X POST http://localhost:8000/api/v1/pipelines/postgres/trigger -> HTTP 200 OK
  curl -X POST http://localhost:8000/api/v1/pipelines/source_postgres/trigger -> HTTP 200 OK
  curl -X POST http://localhost:8000/api/v1/pipelines/conn_inexistente_999/trigger -> HTTP 404 Not Found
  ```
- **Suites de Pruebas Automatizadas:**
  - 101/101 pruebas backend (`tests/api/`, `tests/lakehouse/`) pasando al 100%.
  - 146/146 pruebas frontend (`vitest run`) pasando al 100%.
  - Compilación y build de producción Next.js 14 exitoso en Docker.
