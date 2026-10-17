# ADR-004: Arquitectura de Resiliencia y Auto-Recuperación con Midas Guardian
> **Estado:** Aceptado  
> **Fecha:** 17 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Sebastian Castiblanco, Joshua Gonzales  
> **Decisores:** Equipo de Arquitectura Midas  

---

## 1. Contexto

Uno de los mayores riesgos en plataformas de datos que integran IA es prometer una "autocorrección mágica" sin límites. En entornos empresariales reales, permitir que un modelo de lenguaje o un script sin supervisión modifique esquemas o tablas Gold ante un fallo introduce riesgos de pérdida de datos o publicación de métricas financieras erróneas.

Se requiere un marco formal de **Data Reliability Engineering (DRE)** que sea verificable, determinista, auditable y con criterios de éxito objetivos.

---

## 2. Decisión

Se adopta el subsistema **Midas Guardian** como el coordinador oficial de confiabilidad y resiliencia del Lakehouse:

1. **Máquina de Estados de Incidentes:**  
   Todo fallo pasa por una transición de estados estricta registrada en PostgreSQL:  
   `DETECTED` $\rightarrow$ `TRIAGED` $\rightarrow$ `CONTAINED` $\rightarrow$ `RECOVERY_PREPARED` $\rightarrow$ `VALIDATING` $\rightarrow$ `AWAITING_APPROVAL` / `PUBLISHING` $\rightarrow$ `RESOLVED`.
2. **Biblioteca de 5 Playbooks Predefinidos:**
   - `JOB_RETRY_V1` *(Automático)*: Reintento acotado con backoff ante caídas temporales de ejecutores de Spark.
   - `QUARANTINE_INVALID_ROWS_V1` *(Automático)*: Desvío de filas que violan reglas no bloqueantes hacia una tabla de cuarentena (`silver.pedidos_quarantine`), permitiendo procesar el 98% sano sin bloquear el pipeline.
   - `REPLAY_WINDOW_V1` *(Automático si es idempotente)*: Reprocesamiento de la ventana o partición afectada leyendo desde Bronze inmutable.
   - `SCHEMA_DRIFT_V1` *(Supervisado / Bloqueante)*: Detección de incompatibilidad de tipos; bloquea publicación, preserva la última Gold sana y presenta un plan de migración al operador humano.
   - `BUSINESS_ANOMALY_V1` *(Supervisado / Diagnóstico)*: Señala desviaciones estadísticas sin modificar datos contables.
3. **Principio Human-in-the-Loop y Protección de Gold:**  
   Ninguna acción que altere datos o contratos en la capa Gold se publica sin la confirmación explícita del usuario o del operador en la interfaz. Mientras un incidente se resuelve, los consumidores siguen leyendo la **última versión Gold aprobada**, rotulada con su fecha y hora exacta de frescura.
4. **Batería Oficial de 5 Fallos Inyectados para el Demo Day:**
   - **F1:** Caída temporal de tarea en Spark.
   - **F2:** Inyección de pedido con ID duplicado.
   - **F3:** Fila con monto negativo/inválido.
   - **F4:** Cambio incompatible de esquema (`total_amount` pasa a texto).
   - **F5:** Interrupción de proceso antes del commit de publicación.

---

## 3. Consecuencias

### Positivas:
- **Demostración Infalible:** La demo no depende del azar; se inyectan las 5 fallas deliberadamente y se muestra cómo Guardian responde con precisión quirúrgica.
- **Auditoría Integral:** Cada incidente guarda qué pasó, qué datos se aislaron, qué versión del playbook se ejecutó y quién aprobó la acción.
- **Cero Corrupción de Métricas:** La capa Gold nunca se publica con datos incompletos.
