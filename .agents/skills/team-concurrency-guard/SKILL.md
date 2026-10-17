---
name: team-concurrency-guard
description: Protocolo de concurrencia, no-colisión y prevención estricta de Code Drift para el equipo de desarrollo de Midas. Rige la lectura obligatoria previa de rules/ y lógica de negocio canónica, creación de ramas estrictamente según el Backlog, aislamiento por módulos (lakehouse, orchestration, security_governance, agent, frontend, docker), y registro obligatorio de completitud en documentation/done/[area]/.
---

# Team Concurrency Guard (Protocolo de No-Colisión, Anti-Drift y Entrega Continua)

Esta habilidad gobierna el flujo de trabajo colaborativo para el equipo de desarrollo del proyecto **Midas — Enterprise Active Lakehouse & Conversational Intelligence Platform**, liderado por **Daniel Echeverría**. 

Su objetivo fundamental es doble:
1. **Evitar que los desarrolladores se pisen los talones** mediante aislamiento estricto de ramas y módulos (*Single-Area Ownership*).
2. **Erradicar el Code Drift**: garantizar que ningún agente o desarrollador modifique la lógica de negocio, fórmulas de métricas o esquemas sin verificar y actualizar previamente las reglas y la documentación canónica aprobada.

---

## 0. Paso 0 Mandatorio: Inspección Previa de Reglas y Lógica de Negocio (Document-First)

> [!CRITICAL]
> **ANTES DE TOCAR CÓDIGO O CREAR UNA RAMA:**  
> Ningún agente o desarrollador puede implementar código a ciegas o asumir reglas de negocio. **Es mandatorio leer y validar las siguientes fuentes de verdad**:

1. **Gobernanza y Reglas de Desarrollo:**
   - [`rules/01_anti_code_drift_policy.md`](../../../rules/01_anti_code_drift_policy.md): Política estricta de *Document First $\rightarrow$ Code Second*.
   - [`rules/02_adr_workflow_and_governance.md`](../../../rules/02_adr_workflow_and_governance.md): Obligatoriedad de registrar decisiones en ADRs.
2. **Contratos de Datos y Esquemas Canónicos:**
   - [`documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md`](../../../documentation/canonical/03_especificacion_base_de_datos_y_lakehouse.md): Nombres exactos de tablas, columnas y tipos de Bronze, Silver y Gold.
3. **Lógica de Negocio y Resiliencia Inmutable:**
   - [`documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md`](../../../documentation/canonical/04_logica_de_negocio_y_resiliencia_guardian.md): Fórmulas canónicas oficiales (Venta Neta, Pedidos Válidos, Ticket Promedio) y playbooks de Midas Guardian.
4. **Interfaces de Usuario y Agente:**
   - [`documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md`](../../../documentation/canonical/05_arquitectura_frontend_y_experiencia_canvas.md) y [`documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md`](../../../documentation/canonical/06_arquitectura_agente_ia_y_capa_semantica.md).

> ⚠️ **Bloqueo Inmediato:** Si el cambio previsto altera una fórmula contable, un esquema de tabla o una decisión de arquitectura, el desarrollador **DEBE DETENERSE**, proponer el cambio en la documentación o en un ADR, y obtener la aprobación de Daniel Echeverría antes de programar.

---

## 1. Regla de Oro: El Product Backlog es la Única Verdad

1. **Cero Invención de Historias o Ramas:**  
   Todo desarrollo DEBE corresponder a una Historia de Usuario existente en el Backlog Oficial (`documentation/canonical/02_mvp_dorado_blueprint_global.md` o backlog de sprint).
2. **Nombres de Rama Oficiales:**  
   Se utiliza estrictamente el formato de rama asignado:  
   `feature/<area>-<nombre-descriptivo-hu>`  
   *(Ejemplos: `feature/lakehouse-spark-iceberg-silver`, `feature/orchestration-airflow-dag-factory`, `feature/security-ranger-masking`, `feature/agent-langgraph-dialogic`, `feature/frontend-canvas-replay`).*
3. **Criterios de Aceptación Inmutables:**  
   La implementación debe satisfacer al 100% los criterios de aceptación especificados sin desbordar el alcance acordado para el miércoles 21.

---

## 2. Protocolo de Aislamiento y No-Colisión de Ramas

Para evitar conflictos de fusión (*merge conflicts*) y bloqueos mutuos entre compañeros:

### Paso 1: Sincronización con `develop`
Antes de iniciar cualquier tarea:
```powershell
git checkout develop
git pull origin develop
```

### Paso 2: Creación de la Rama Oficial de la HU
```powershell
git checkout -b feature/<area>-<nombre-hu>
# Ejemplo: git checkout -b feature/lakehouse-spark-silver-cleanse
```

### Paso 3: Delimitación Estricta de Módulos (Single-Area Ownership en Midas)
Para garantizar cero pisadas de código entre áreas técnicas:
- **Lakehouse & Ingesta (`lakehouse`):** Solo crea/modifica archivos bajo `src/lakehouse/` (PySpark jobs, conectores JDBC/Excel, tablas Iceberg).
- **Orquestación (`orchestration`):** Solo crea/modifica archivos bajo `src/orchestration/` (DAGs de Airflow, DAG Factory, sensores).
- **Seguridad & Gobernanza (`security_governance`):** Solo crea/modifica archivos bajo `src/security_governance/` (políticas de Ranger, llamadas a APIs de Atlas y OpenMetadata).
- **Agente de IA & Semántica (`agent`):** Solo crea/modifica archivos bajo `src/agent/` (FastAPI, grafos LangGraph, cliente Trino, guardrails OWASP).
- **Frontend & Canvas (`frontend`):** Solo crea/modifica archivos bajo `src/frontend/` (React Flow Canvas, componentes de Chat, ECharts, Server-Sent Events).
- **Infraestructura (`docker`):** Solo crea/modifica archivos bajo `docker/` y `docker-compose.yml`.

---

## 3. Estándar de Documentación de Entregas: `documentation/done/`

Cada vez que una Historia de Usuario se implementa y prueba exitosamente, se DEBE generar un archivo de documentación exhaustiva dentro del directorio correspondiente:

```
documentation/done/
├── lakehouse/
│   ├── lakehouse-ingesta-universal-01.md
│   └── lakehouse-spark-silver-cleanse-02.md
├── orchestration/
│   ├── orchestration-airflow-dag-factory-01.md
│   └── orchestration-sensor-minio-02.md
├── security/
│   ├── security-ranger-trino-masking-01.md
│   └── security-atlas-autotag-pii-02.md
├── agent/
│   ├── agent-langgraph-dialogic-01.md
│   └── agent-storytelling-echarts-02.md
├── frontend/
│   ├── frontend-canvas-reactflow-01.md
│   └── frontend-replay-timetravel-02.md
└── other/
    └── docker-cluster-unificado-01.md
```

### 3.1. Formato Obligatorio del Nombre de Archivo
`documentation/done/[area]/[area]-[nombre_epica]-[nombre_hu]-[numero].md`

### 3.2. Estructura Obligatoria del Documento en `documentation/done/`
1. **Encabezado y Metadatos:**
   - Título oficial de la HU.
   - ID de la HU (ej. `DATA-01`, `SEC-02`, `UI-03`).
   - Rama Git en la que se desarrolló.
   - Documento canónico de referencia (`documentation/canonical/0X_...md` o `ADR-XXX`).
2. **Checklist Anti-Code Drift Verificado:**
   - [x] ¿Se verificó no alterar las fórmulas canónicas del negocio?
   - [x] ¿Los esquemas de datos coinciden exactamente con la especificación 03?
   - [x] ¿Se respetaron los guardrails de seguridad y permisos de Ranger?
3. **Detalle de Implementación Técnica:**
   - Módulos, clases, métodos o endpoints creados/modificados.
   - Decisiones de diseño aplicadas.
4. **Verificación y Pruebas Automatizadas:**
   - Pruebas unitarias o de integración ejecutadas.
   - Comando exacto para correr las pruebas y evidencia de éxito.
5. **Impacto y Coordinación con el Equipo:**
   - Confirmación de cero impacto negativo o bloqueos a otros miembros.

---

## 4. Ciclo de Cierre: Commit, Changelog y PR a `develop`

1. **Commit Convencional:**
   `git commit -m "feat(<scope>): <descripción concisa referenciando doc oficial>"`
2. **Bitácora Diaria:**
   Registrar la entrega terminada en `documentation/changelog/[DD]-[MM]-[YYYY]-changelog.md`:
   `[Day]-[DD/MM/YYYY]-[HH:MM] - [Autor] : [feat/fix/chore: descripción concisa]`
3. **Integración con `develop`:**
   - Subir la rama a `origin`: `git push -u origin feature/<area>-<nombre-hu>`
   - Crear Pull Request hacia `develop` adjuntando el checklist anti-code drift y el enlace al documento en `documentation/done/`.
   - Esperar revisión y aprobación por **Daniel Echeverría**.
