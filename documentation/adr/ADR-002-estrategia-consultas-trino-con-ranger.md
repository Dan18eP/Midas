# ADR-002: Estrategia de Consultas Interactivas con Trino y Seguridad Apache Ranger
> **Estado:** Aceptado  
> **Fecha:** 17 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Elian Rivera, Edgar Corzo, Joshua Gonzales  
> **Decisores:** Equipo de Arquitectura Midas  

---

## 1. Contexto

El Copiloto Agéntico y la plataforma web requieren responder preguntas analíticas en lenguaje natural con tiempos de respuesta interactivos (sub-segundo o <2 segundos). 

Lanzar trabajos de **Apache Spark** para cada pregunta conversacional introduce una latencia inaceptable para la experiencia de usuario (entre 5 y 20 segundos por arranque de contexto, asignación de ejecutores y planificación de DAGs). Asimismo, se requiere garantizar que las políticas de seguridad de **Apache Ranger** (filtrado de filas por región y enmascaramiento dinámico de columnas PII) se apliquen de forma estricta a nivel de motor SQL.

---

## 2. Decisión

1. **Separación de Cómputo (Batch vs. Interactivo):**
   - **Apache Spark 3.5:** Reservado para el trabajo pesado y distribuido de ingeniería de datos (ingesta masiva Bronze $\rightarrow$ Silver $\rightarrow$ Gold, validaciones complejas de calidad y materialización de nuevos marts).
   - **Trino (SQL Distributed Engine):** Motor oficial de consultas interactivas para el Copiloto Agéntico y los dashboards de la plataforma. Trino consulta directamente las tablas Iceberg en MinIO.
2. **Control de Acceso Centralizado con Apache Ranger:**
   - Se despliega el **Plugin Oficial de Apache Ranger para Trino**.
   - Toda consulta originada por el Copiloto o el usuario se ejecuta impersonando la identidad del usuario actual (ej. `role: director_general`, `role: gerente_norte`, `role: analista_externo`).
   - Ranger aplica enmascaramiento en caliente (`HASH`, `NULLIFY` o `MASK_SHOW_LAST_4`) sobre columnas etiquetadas como PII y añade cláusulas `WHERE` automáticas para filtros de fila sin que el usuario o el LLM puedan saltárselas.

---

## 3. Consecuencias

### Positivas:
- **Tiempos de Respuesta Ultrarrápidos:** Las consultas sobre tablas Gold en Iceberg tardan entre 150 ms y 800 ms en Trino.
- **Seguridad Infranqueable:** El LLM no puede filtrar datos que Ranger oculta; la seguridad está en el motor de ejecución SQL, no en el prompt del LLM.
- **Transparencia en Demo:** Hace posible el **Lente Zero-Trust**: al cambiar de rol en la barra superior, la misma pregunta genera resultados distintos gobernados por Ranger.

### Negativas / Mitigaciones:
- Añade el contenedor de Trino Coordinator a la infraestructura. Se optimiza asignándole límites de memoria acotados (1.5 GB RAM) suficientes para las pruebas del laboratorio.
