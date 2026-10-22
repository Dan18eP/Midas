# Registro de Entrega: Migracion Gemini 3.1 Flash Lite y Subsanacion de Pipelines Excel

> **Modulo:** Agent & Lakehouse Ingestion  
> **Fecha:** 22/10/2026  
> **Rama:** `feature/gemini-llm-pipeline-excel-fix`  
> **Autores:** Daniel Echeverria & Dilan Chavez  
> **Estado:** COMPLETADO Y VERIFICADO  

---

## 1. Contexto y Objetivos

1. **Desactivacion de `midas-ollama`:** Se aislo el contenedor bajo el perfil `ollama-optional` en `docker-compose.yml` y se detuvo la ejecucion en vivo, recuperando ~12 GB de memoria RAM en el host y eliminando el cuello de botella de inicializacion lenta.
2. **Migracion a Gemini API:** Sustitucion del motor de inferencia local por la API oficial de Google GenAI (`google-genai` SDK) usando el modelo `gemini-3.1-flash-lite`, con orden resiliente de resolucion (`gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-flash-latest`) y fallback determinista AST con SQLGlot para ambientes aislados.
3. **Subsanacion de Ejecucion de Pipelines Excel:** Resolucion integral de errores 404, fallos de compuertas de calidad por llaves primarias ausentes o compuestas, colapso de registros en deduplicacion Silver y errores de conversion de tipo en Gold.
4. **Despliegue en Caliente (Zero Downtime):** Actualizacion de `midas-api` y `midas-frontend` sin recrear el cluster completo ni reiniciar bases de datos o almacenamiento.

---

## 2. Cambios Implementados

### 2.1 Inferencia y Model Router (`src/agent/models/model_router.py`)
- Integracion de `google.genai.Client` con clave `GEMINI_API_KEY`.
- Bucle de candidatos: `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-flash-latest`.
- Sanitizacion quirurgica de respuestas SQL (`_clean_sql_output`) eliminando bloques markdown y ruido discursivo.
- Fallback determinista garantizado con AST SQLGlot ante cortes de red o indisponibilidad de API.

### 2.2 Titulos Ejecutivos (`src/core/session/title_generator.py`)
- Generacion de titulos ejecutivos ultra-rapidos (<1s) a traves de Gemini con fallback semantico local.

### 2.3 Compuerta de Calidad y Pipeline Excel (`src/api/routes/pipelines.py`)
- Resolucion dinamica de fuentes en el endpoint de disparo (`source_excel`, marcas de tiempo numericas y alias).
- Flexibilizacion de llaves primarias en validacion de Bronze (`id`, `pedido_id`, `id_transaccion`, `numero_factura`, o autonumeracion sintetica) para prevenir cuarentena total erronea (`NULL_PRIMARY_KEY`).
- Normalizacion de campos de monto (`valor_servicio`, `monto_bruto`, `total`, `monto`) y estados terminados (`FINALIZADO`, `COMPLETADO`, `PAGADO`).

### 2.4 Transformaciones Silver y Gold
- `src/lakehouse/transforms/bronze_to_silver.py`: Correccion del bug de deduplicacion donde columnas faltantes provocaban que todos los registros colapsaran en una tupla `(None,)`. Ahora resuelve la PK disponible o preserva `_raw_id`.
- `src/lakehouse/transforms/silver_to_gold.py`: Adicion de `_safe_decimal` para prevenir excepciones `ConversionSyntax` ante valores vacios o nulos.

### 2.5 Resiliencia Frontend (`src/frontend/components/canvas/NodeInspectionDrawer.tsx` y `QuickConnectionModal.tsx`)
- Resolucion de `connectionId` en `MidasNodeData` y persistencia dual en configuracion.

---

## 3. Evidencia de Verificacion

1. **Pruebas Backend Pytest:**
   - 294 pruebas pasadas al 100% en 44.02 segundos.
   - Nueva suite: `tests/agent/test_gemini_inference.py` (4/4 tests aprobados).
2. **Pruebas Frontend Vitest:**
   - 146 pruebas pasadas al 100% en 13.31 segundos.
3. **Chequeo de Tipos TypeScript:**
   - `npx tsc --noEmit -p src/frontend/tsconfig.json` limpio con 0 errores.
4. **Validacion en Contenedores en Vivo:**
   - `http://localhost:8000/health`: 200 OK (Postgres, MinIO, Trino y Telemetry saludables).
   - `POST /api/v1/pipelines/source_excel/trigger`: 200 OK, HEALTHY, 3 registros procesados de Bronze a Gold sin cuarentena.
   - `POST /api/v1/agent/chat`: Inferencia con Gemini operativa con generacion de SQL analitico y entrega hacia Trino.
