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

- **Daniel Echeverría:** Líder General de Proyecto & Backend Lead (Arquitectura Principal, Core Backend, API Gateway y Supervisión Lakehouse).
- **Edgar Corzo:** Data Engineering Lead & Backend Partner (Apache Spark, Almacenamiento MinIO S3, Iceberg v2 y Pipelines Medallón).
- **Dilan Chávez:** Frontend Lead & Real-Time Canvas Architect (React Flow, Telemetría SSE, Topología en Vivo y Time-Travel Replay).
- **Joshua Gonzales:** UI/UX Specialist & Frontend Partner (Chat Copiloto, Componentes ECharts, Lente Zero-Trust y Drawer de Linaje).
- **Elian Rivera:** AI & Intelligent Systems Lead (LangGraph, FastAPI Agente, Modo Dialógico Proactivo, Text-to-Gold y Guardrails OWASP).
- **Sebastian Castiblanco:** Co-Líder, Scrum Master & Data Governance Lead (Cadencia Ágil, Auditoría Anti-Drift en `documentation/done/`, Catálogo OpenMetadata, Clasificación Atlas/Ranger y Resiliencia Midas Guardian).

### 🚀 Células de Trabajo (Squads)
1. **Squad 1 - Backend & Data Lakehouse:** Daniel Echeverría (Lead) & Edgar Corzo (Data Eng / Backend Partner)
2. **Squad 2 - Frontend & Real-Time Canvas:** Dilan Chávez (Lead) & Joshua Gonzales (UI/UX & Frontend Partner)
3. **Squad 3 - Agentic AI & Semantic Intelligence:** Elian Rivera (Lead) & Daniel Echeverría (Backend Support)
4. **Squad 4 - Governance, Midas Guardian & Agile Management:** Sebastian Castiblanco (Co-Líder, Scrum Master & Governance Lead)

---

## 📂 Estructura del Repositorio

```bash
PROYECTO-JUEVES-22/
├── .agents/                    # Reglas de desarrollo y habilidades del equipo (team-concurrency-guard)
├── docker/                     # Manifiestos de Docker Compose y configuraciones de servicios
├── documentation/              # Especificaciones, blueprints y bitácoras
│   ├── 04_product_backlog.md   # Product Backlog oficial y plan de sprint (a la vista)
│   ├── canonical/              # Especificaciones maestras del MVP Dorado (01 a 07)
│   ├── adr/                    # Decisiones de arquitectura inmutables (ADR-001 a ADR-007)
│   ├── changelog/              # Bitácora diaria de avance
│   ├── done/                   # Historias de usuario y módulos completados
│   └── propuestas/             # Reportes de investigación originales
├── rules/                      # Políticas vinculantes de Cero Code Drift y gobernanza ADR
├── src/
│   ├── lakehouse/              # PySpark jobs, transformaciones Bronze -> Silver -> Gold
│   ├── orchestration/          # Apache Airflow DAGs, sensores y hooks
│   ├── security_governance/    # Políticas Ranger, clasificación Atlas y config OpenMetadata
│   ├── agent/                  # Backend FastAPI, LangGraph, Text-to-Transformation
│   └── frontend/               # UI interactiva (Next.js/React, React Flow, ECharts)
└── data/
    └── sample_sources/         # Fuentes reales y simuladas de prueba (Excel, CSV, DBs)
```

## 📖 Suite Documental Oficial y Gobernanza

Toda la arquitectura, decisiones y contratos están estrictamente documentados bajo la política de **Cero Code Drift** (`rules/01_anti_code_drift_policy.md`):

1. **Product Backlog & Plan de Sprint (Entrega Miércoles 21 de Octubre):**  
   👉 [documentation/04_product_backlog.md](documentation/04_product_backlog.md)
2. **Especificaciones Canónicas (MVP Dorado):**  
   - [01. Master Architecture & Project Plan](documentation/canonical/01_master_architecture_and_project_plan.md)
   - [02. MVP Dorado Blueprint Global](documentation/canonical/02_mvp_dorado_blueprint_global.md)
   - [03. Especificación Base de Datos & Lakehouse (Multi-fuente)](documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md)
   - [04. Lógica de Negocio Canónica & Resiliencia Guardian](documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md)
   - [05. Arquitectura Frontend & Experiencia Canvas en Vivo](documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md)
   - [06. Arquitectura Agente IA & Capa Semántica Dialógica](documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md)
   - [07. Guión y Minutero de Demostración en Vivo (30 Minutos)](documentation/canonical/07_guion_presentacion_en_vivo_30_minutos.md)
3. **Decisiones de Arquitectura (ADRs):**  
   👉 [documentation/adr/](documentation/adr/) (ADR-001 a ADR-007)
4. **Reglas de Gobernanza y Políticas Anti-Drift:**  
   👉 [rules/](rules/) (`01_anti_code_drift_policy.md`, `02_adr_workflow_and_governance.md`)
