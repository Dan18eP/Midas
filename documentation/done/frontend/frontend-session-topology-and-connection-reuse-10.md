# Continuidad de Topología entre Sesiones y Reimportación Idempotente de Fuentes

> **Entrega:** HU-FRONT-07 / HU-LAKE-05 (Continuidad de workspace y catálogo de conexiones)  
> **Rama Git:** `feature/agent-deterministic-gold-queries` (PR #78)  
> **Responsable:** Edgar Corzo  
> **Fecha:** 22-10-2026

---

## 1. Problemas Detectados

1. Al iniciar una nueva conversación, el Canvas mostraba la topología demo
   (`INITIAL_CANVAS_NODES`: PostgreSQL/Excel/API + capas medallón) en lugar de conservar
   el flujo de datos que el usuario ya había construido (por ejemplo,
   `Walmart_Sales_normalized_v2`).
2. Reimportar el mismo CSV con el mismo nombre fallaba con:
   `"Ya existe una conexión registrada con el nombre '...'"`, aunque el archivo ya estaba
   cargado y era la misma fuente.

## 2. Causa

- `startNewSession()` limpiaba `activeTopology` y `createAndSelectSession()` creaba la
  sesión sin topología. El Canvas caía al valor por defecto `INITIAL_CANVAS_NODES`.
- `POST /api/v1/connections/upload` llamaba a `register_connection()`, que rechaza
  nombres duplicados. No existía una ruta idempotente para reemplazar el binario de una
  fuente existente.

## 3. Correcciones Implementadas

### 3.1 Herencia de topología al crear una nueva conversación
- `SessionContext` conserva la última topología activa no vacía en `lastTopologyRef`.
- `createAndSelectSession()` usa esa topología cuando no se pasa una explícita, de modo
  que una nueva conversación mantiene el mismo espacio de datos y su flujo visible.

### 3.2 Reimportación idempotente de archivos
- `POST /api/v1/connections/upload` reutiliza la conexión existente cuando el nombre
  coincide y el tipo de fuente es el mismo.
- El binario se sobrescribe en `data/uploads/` con la versión más reciente.
- La respuesta mantiene el mismo `connection_id`, por lo que el nodo del Canvas sigue
  apuntando a la fuente correcta.

### 3.3 Nodo de fuente sin duplicados
- `QuickConnectionModal` actualiza el nodo existente (`source_<connection_id>`) en lugar
  de añadir un nodo duplicado al reimportar la misma fuente.

## 4. Verificación

| Verificación | Resultado |
|---|---|
| `tsc --noEmit` | Sin errores |
| Vitest frontend | **148/148** |
| Pytest backend (lakehouse, api, agent, backend, core) | **215/215** |
| `gold.fact_ventas` tras la suite | Solo 2010, 2011, 2012 |
| Reimportar mismo CSV con mismo nombre | HTTP 201 con el mismo `connection_id` |

## 5. Comportamiento Esperado

- Nueva conversación → conserva el flujo de datos de la conversación anterior.
- Reimportar el mismo archivo → actualiza la fuente existente, sin error de duplicado.
- Para recuperar un flujo antiguo que quedó guardado con la topología demo, basta con
  volver a importar el CSV: se reutiliza la conexión y se añade/actualiza su nodo.

## 6. Archivos Modificados

- `src/frontend/context/SessionContext.tsx`
- `src/frontend/components/workspace/QuickConnectionModal.tsx`
- `src/api/routes/connections.py`
- `tests/lakehouse/test_source_connections.py`
- `documentation/changelog/22-10-2026-changelog.md`
