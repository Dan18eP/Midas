# Midas
> **Enterprise Active Lakehouse & Conversational Intelligence Platform**  
> Data Fabric Medallón con Seguridad Zero-Trust, Observabilidad en Vivo y Copiloto Agéntico

![Architecture](https://img.shields.io/badge/Architecture-Medallion%20Lakehouse-blue?style=for-the-badge)
![Security](https://img.shields.io/badge/Security-Apache%20Ranger%20%2B%20Atlas-red?style=for-the-badge)
![Governance](https://img.shields.io/badge/Governance-OpenMetadata-purple?style=for-the-badge)
![Compute](https://img.shields.io/badge/Compute-Apache%20Spark%20%2B%20Airflow-orange?style=for-the-badge)
![Storage](https://img.shields.io/badge/Storage-MinIO%20S3-crimson?style=for-the-badge)
![AI](https://img.shields.io/badge/AI-Agentic%20Text--to--Gold-emerald?style=for-the-badge)

---

## 🚀 Visión del Proyecto

Esta plataforma redefine la analítica y la ingeniería de datos corporativa. No es un chatbot aislado ni un tablero pasivo: es un **Lakehouse Activo Empresarial** que integra:

1. **Flujo de Ingesta Universal y Arquitectura Medallón:** Capaz de consumir cualquier fuente (PostgreSQL, MySQL, APIs REST, archivos Excel, CSV o streams) organizados en capas **Bronze**, **Silver** y **Gold** sobre almacenamiento MinIO S3 y Apache Spark.
2. **Gobernanza y Seguridad Grado Bancario:** Centralización de metadatos, calidad y linaje automatizado con **OpenMetadata**, clasificación de sensibilidad con **Apache Atlas** y control de accesos granular con **Apache Ranger** (RBAC, ABAC y enmascaramiento dinámico de datos).
3. **Canvas de Flujo de Datos en Tiempo Real:** Visualización gráfica e interactiva del pipeline donde se observan los registros transitando entre capas con métricas de salud y rendimiento en vivo.
4. **Chatbot Agéntico con Text-to-Transformation & Storytelling:** Un asistente inteligente capaz de:
   - Responder preguntas complejas con gráficas interactivas y narrativa orientada a la toma de decisiones.
   - **Materializar nuevas capas Gold bajo demanda en lenguaje natural:** Generar, validar y ejecutar jobs de Spark para crear nuevos marts de datos analíticos en segundos.

---

## 👥 Equipo de Ingeniería (Riwi)

- **Daniel Echeverría:** Líder de Proyecto & Arquitecto Principal (Dirección Técnica, Arquitectura Global y Gobierno de Calidad).
- **Elian Rivera:** Agentic AI & Semantic Layer Specialist (FastAPI, LangGraph, Text-to-Transformation y Motor de Data Storytelling).
- **Edgar Corzo:** Data Engineering Lead (Apache Spark, Formatos Delta/Parquet y MinIO Storage).
- **Dilan Chávez:** Pipeline Orchestration & Frontend Co-Lead (Apache Airflow, Sensores, Canvas React Flow en Vivo y WebSockets).
- **Joshua Gonzales:** Security, Access Governance & Frontend Co-Lead (Apache Ranger, Atlas, Políticas RBAC/ABAC y Plataforma Web Interactiva).
- **Sebastian Castiblanco:** Data Catalog, Lineage & Observability Lead (OpenMetadata, Apache Atlas y Data Quality).

---

## 📂 Estructura del Repositorio

```bash
PROYECTO-JUEVES-22/
├── docker/                     # Manifiestos de Docker Compose y configuraciones de servicios
├── documentation/              # Especificaciones, blueprints y bitácoras
│   ├── 01_master_architecture_and_project_plan.md
│   ├── changelog/              # Bitácora diaria de avance
│   └── done/                   # Historias de usuario y módulos completados
├── src/
│   ├── lakehouse/              # PySpark jobs, transformaciones Bronze -> Silver -> Gold
│   ├── orchestration/          # Apache Airflow DAGs, sensores y hooks
│   ├── security_governance/    # Políticas Ranger, clasificación Atlas y config OpenMetadata
│   ├── agent/                  # Backend FastAPI, LangGraph, Text-to-Transformation
│   └── frontend/               # UI interactiva (Next.js/React, React Flow, ECharts)
└── data/
    └── sample_sources/         # Fuentes reales y simuladas de prueba (Excel, CSV, DBs)
```

---

## 📖 Documentación Completa

Para profundizar en el diseño técnico, la matriz RACI, los diagramas de secuencia del agente y el roadmap de ejecución detallado, consulta:  
👉 [documentation/01_master_architecture_and_project_plan.md](documentation/01_master_architecture_and_project_plan.md)
