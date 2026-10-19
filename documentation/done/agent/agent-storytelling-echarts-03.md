# HU-AI-03: Motor de narrativa ejecutiva y síntesis automática de opciones ECharts

- **ID:** HU-AI-03
- **Responsable:** Elian Rivera (AI Lead)
- **Rama:** `feature/agent-storytelling-echarts`
- **Módulo:** `src/agent/storytelling/`
- **Documento canónico:** `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Backlog:** `documentation/05_sprint_backlog_detallado.md`
- **Estado de verificación:** Implementación lista; verificación automatizada pendiente.

## Alcance implementado

- `narrative_generator.py` crea hallazgos en Markdown a partir de cifras originales de Trino. La narrativa no calcula promedios, porcentajes, diferencias ni conteos.
- `echarts_synthesizer.py` selecciona una serie temporal con área, dispersión para dos columnas numéricas o barras horizontales para categorías discretas. Incluye título, tooltip, leyenda, ejes y paleta Midas. Si faltan datos adecuados, devuelve una opción válida sin series.
- `synthesize_storytelling` reúne `narrative`, `echarts_option` y `metrics_summary`. Cada cifra del resumen incluye etiqueta, valor original, columna de origen e índice de fila.
- El nodo `synthesize_storytelling` del grafo guarda el objeto en `storytelling_result` y serializa el resultado como JSON en `response` y en el historial del asistente.

## Revisión anti-deriva

- [x] Se revisaron las fórmulas canónicas; no se modificaron.
- [x] No se agregaron ni cambiaron esquemas, tablas o columnas.
- [x] La síntesis consume las filas entregadas por el ejecutor Trino y no altera las consultas ni sus resultados.
- [x] Se actualizó primero la especificación del nodo en `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`.
- [ ] La selección de gráficos y la serialización JSON aún requieren verificación automatizada.

## Verificación

No se ejecutaron pruebas automatizadas. Comandos pendientes según el backlog:

```powershell
pytest tests/agent/test_storytelling_engine.py -v
python -m pytest tests/agent -q
```

Tampoco se verificó la integración con una instancia activa de Trino ni el renderizado en `EChartsRenderer`.

## Coordinación e impacto

Los cambios de código se limitan a `src/agent/storytelling/`, `src/agent/state.py` y `src/agent/graph/nodes/pipeline.py`. No se cambian contratos HTTP, guardrails SQL ni módulos de otros squads.
