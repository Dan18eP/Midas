# HU-AI-03: Motor de narrativa ejecutiva y síntesis automática de opciones ECharts

- **ID:** HU-AI-03
- **Responsable:** Elian Rivera (AI Lead)
- **Rama:** `feature/agent-storytelling-echarts`
- **Módulo:** `src/agent/storytelling/`
- **Documento canónico:** `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`
- **Backlog:** `documentation/05_sprint_backlog_detallado.md`
- **Estado de verificación:** Correcciones del PR #27 aplicadas; pruebas automatizadas ejecutadas.

## Alcance implementado

- `narrative_generator.py` crea hallazgos en Markdown a partir de cifras originales de Trino. La narrativa no calcula promedios, porcentajes, diferencias ni conteos.
- `echarts_synthesizer.py` selecciona una serie temporal con área, dispersión para dos columnas numéricas o barras horizontales para categorías discretas. Incluye título, tooltip, leyenda, ejes y paleta Midas. Si faltan datos adecuados, devuelve una opción válida sin series.
- `synthesize_storytelling` reúne `narrative`, `echarts_option` y `metrics_summary`. Cada cifra del resumen incluye etiqueta, valor original, columna de origen e índice de fila.
- El nodo `synthesize_storytelling` guarda el objeto serializable en `storytelling_result`. `response` y el historial del asistente contienen solo la narrativa Markdown.

## Revisión anti-deriva

- [x] Se revisaron las fórmulas canónicas; no se modificaron.
- [x] No se agregaron ni cambiaron esquemas, tablas o columnas.
- [x] La síntesis consume las filas entregadas por el ejecutor Trino y no altera las consultas ni sus resultados.
- [x] Se actualizó primero la especificación del nodo en `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`.
- [x] La selección de gráficos, el contrato de respuesta y la validación de cifras se verifican con pruebas automatizadas.

## Verificación

Pruebas ejecutadas:

```powershell
pytest tests/agent/test_storytelling.py -v
python -m pytest tests/agent -q
```

La integración con una instancia activa de Trino y el renderizado en `EChartsRenderer` no forman parte de estas pruebas unitarias.

## Coordinación e impacto

El contrato de estado documentado en `documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md` mantiene el chat legible y permite exponer los gráficos y el linaje como datos estructurados. Los cambios se limitan al área del agente.
