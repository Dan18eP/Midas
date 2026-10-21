# HU-AI-05: Inferencia local Zero-Trust con Qwen 2.5 (3B)

- **ID:** HU-AI-05
- **Rama:** `feature/agent-qwen-local-zero-trust`
- **Responsable:** Elian Rivera (`aZian10`)
- **Referencias:** `documentation/06_nuevo_backlog_mvp_dorado.md`, `documentation/adr/ADR-008-adopcion-modelo-local-qwen-2-5-3b-zero-trust.md` y `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Fecha:** 20 de octubre de 2026

## Resultado

El agente usa Ollama con `qwen2.5:3b` en uno de los dos endpoints locales aprobados. Si Ollama no está disponible o devuelve SQL inválido, el router usa plantillas SQLGlot para conteos, sumas, promedios y filtros categóricos permitidos. Las intenciones ambiguas fallan de forma segura. No hay proveedor cloud configurado.

## Revisión anti-deriva

- [x] No se alteraron fórmulas ni esquemas canónicos.
- [x] El fallback solo usa tablas y columnas del catálogo activo en `silver` o `gold`.
- [x] El SQL del modelo y del fallback pasa por `QueryGuardrail`, que agrega `LIMIT 1000` cuando falta.
- [x] Los cambios quedan dentro del módulo `agent`, sus pruebas y documentación.

## Cambios

- `src/agent/models/model_router.py`: Ollama local y fallback SQLGlot sin ruta cloud.
- `src/agent/prompts/qwen_prompts.py`: instrucciones compactas para Text-to-Gold con Qwen.
- `src/agent/tools/text_to_sql.py` y `src/agent/graph/builder.py`: conexión del router al generador y al grafo.
- `src/agent/guardrails/query_guardrail.py`: restricción del catálogo a `silver` y `gold`.
- `tests/agent/test_qwen_inference.py`: cobertura de proveedor local, fallback, filtros, guardrail y latencia.

## Verificación

- **Comando:** `python -m pytest tests/agent -q`
- **Resultado:** 77 pruebas aprobadas en 3,56 s después de sincronizar con `develop`.
- Las pruebas no requieren Ollama, internet ni API keys externas; la llamada local se simula.
- El fallback cumple el umbral de latencia `<10 ms` en la prueba automatizada.
- **No ejecutado:** llamada real al servicio Ollama ni consulta a Trino.

## Impacto y reversión

No se modificaron áreas fuera del agente ni dependencias externas. Revertir los cambios de HU-AI-05 elimina el enrutamiento Qwen, el fallback AST, el prompt y su documentación.
