# Midas — Reporte de Investigación y Propuestas Técnicas

**Proyecto:** Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform
**Fecha:** 16 de octubre de 2026

---

## Introducción

En este reporte presento cinco funcionalidades puntuales que podrían diferenciar a Midas, tanto en el Canvas en tiempo real como en el Copiloto agéntico. Cada una es independiente de las demás y se puede demostrar por separado, de modo que sea sencillo decidir cuáles implementar según el tiempo y los recursos disponibles.

Para cada propuesta se incluye una descripción, un ejemplo concreto, el valor que aporta y una estimación del esfuerzo.

| # | Funcionalidad | Área | Esfuerzo | Impacto en demo |
|---|---|---|---|---|
| 1 | Rebobinar el flujo | Canvas | Medio | Muy alto |
| 2 | "Explícame esta cifra" | Copiloto | Medio | Muy alto |
| 3 | Modo What-if | Copiloto | Medio-Alto | Muy alto |
| 4 | Briefing ejecutivo automático | Copiloto | Bajo-Medio | Alto |
| 5 | Detección de anomalías narrada | Copiloto / Calidad | Medio | Alto |

---

## 1. Rebobinar el flujo

**Descripción:** Propongo agregar al Canvas una barra de tiempo que permita ver cómo estaba el pipeline en cualquier momento del pasado: qué jobs corrían, cuántos datos fluían y qué tablas estaban sanas o con problemas. El flujo se puede reproducir como una "película" y, cuando se quiera, se vuelve al modo en vivo.

**Ejemplo:** Ayer a las 3 a.m. falló algo. El usuario arrastra la barra a esa hora y ve exactamente qué job se cayó y qué tablas quedaron desactualizadas.

**Valor que aporta:**
- Convierte el Canvas de un simple monitor en una herramienta para investigar incidentes.
- Es muy llamativo en una demo: se rebobina y se ve el problema "ocurrir" de nuevo.

**Esfuerzo estimado:** Medio.

---

## 2. "Explícame esta cifra"

**Descripción:** Cada número que muestre el Copiloto en sus resúmenes sería clicable. Al hacer clic se despliega su recorrido completo: de qué tabla Gold sale, qué datos de Silver y Bronze la alimentan, cuál es la fuente original y qué filtros o reglas se aplicaron en el camino. Incluye una explicación breve en lenguaje sencillo.

**Ejemplo:** El Copiloto dice "los ingresos de septiembre fueron $1.2M". Al hacer clic aparece: "Suma de ventas netas de la tabla `ventas_mensuales`, que viene de `silver.ventas`, excluyendo 1.2% de registros en cuarentena".

**Valor que aporta:**
- Ataca el mayor problema de la IA en análisis de datos: la desconfianza ("¿de dónde salió esto?").
- Muestra el linaje y la calidad de los datos de forma comprensible para un ejecutivo.

**Esfuerzo estimado:** Medio.

---

## 3. Modo What-if

**Descripción:** El usuario hace una pregunta de simulación en lenguaje natural y el Copiloto la responde probándola en una copia temporal de los datos, sin tocar los datos reales. Luego muestra el resultado comparado con la situación actual y aclara los supuestos utilizados.

**Ejemplo:** "¿Qué pasaría con el margen si subimos los precios 5% en la categoría A?" El Copiloto simula el cambio y responde: "El margen subiría de 22% a 26%, asumiendo que la demanda no cambia".

**Valor que aporta:**
- Pasa de describir el pasado a apoyar decisiones futuras.
- Aprovecha las capacidades de un Lakehouse moderno (copias y versiones de los datos), algo que un pipeline tradicional no ofrece.
- Es seguro: lo simulado nunca afecta producción y la copia se elimina sola.

**Esfuerzo estimado:** Medio-Alto. Es la más ambiciosa de las cinco.

---

## 4. Briefing ejecutivo automático

**Descripción:** Cada mañana el Copiloto generaría y enviaría un resumen corto con los 3 cambios más importantes en las métricas del negocio, la causa probable de cada uno y un gráfico. Estaría escrito como una narración, no como una tabla de cifras.

**Ejemplo:** "Buenos días. Hoy destacan tres cambios: las ventas subieron 9% por la categoría A, las devoluciones aumentaron en la región sur y la tasa de conversión bajó en el canal web".

**Valor que aporta:**
- Demuestra el storytelling con métricas ejecutivas planteado en el proyecto.
- Es proactivo: la plataforma informa sin que nadie tenga que preguntar.
- Es la más rápida de construir del grupo y se luce bien en una demo.

**Esfuerzo estimado:** Bajo-Medio.

---

## 5. Detección de anomalías narrada

**Descripción:** Cuando una métrica se comporte de forma inusual, el sistema no solo avisaría, sino que explicaría qué pasó. Revisaría si el problema coincide con fallas en el pipeline (por ejemplo, datos rechazados o retrasos) para distinguir entre un problema real del negocio y un problema de los datos.

**Ejemplo:** "Las ventas de la región norte cayeron 18% frente a lo esperado. Coincide con un aumento de registros rechazados en `silver.pedidos` desde las 2:10 a.m., originado en la fuente `crm_norte`. Probablemente es un problema de datos, no una caída real".

**Valor que aporta:**
- Evita que se tomen decisiones con datos dañados.
- Conecta calidad de datos, linaje y lenguaje natural en una sola alerta fácil de entender.

**Esfuerzo estimado:** Medio.