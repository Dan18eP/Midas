# Entrega Tecnica: Gobernanza Universal ABAC y Roles Dinamicos End-to-End

> **ID de la Entrega:** `GOV-ABAC-04`
> **Epica:** `04. Gobernanza Zero-Trust & Resiliencia Activa`
> **Responsables:** Sebastian Castiblanco (Governance Lead) & Daniel Echeverria (Backend & Project Lead)
> **Rama Oficial:** `feature/universal-governance-abac-e2e`
> **Prioridad:** MUST HAVE (Arquitectura Universal Agnóstica de Dominio)
> **Fecha de Entrega:** Miercoles 21 de Octubre de 2026
> **Estado:** Completada y verificada (287/287 pruebas backend y 145/145 pruebas frontend pasando al 100%)

---

## 1. Contexto y Justificacion del Cambio

Durante las revisiones de arquitectura del MVP Dorado se identifico una limitacion de diseño fundamental:
Los roles canonicos previos (`director_general`, `gerente_norte`, `analista_externo`) con reglas fijas (`region = 'NORTE'`) ataban la plataforma a un caso especifico de ventas minoristas, dando una impresion de implementacion estatica o simulada ("mock"), incompatible con el objetivo de Midas de actuar como un Active Lakehouse universal capaz de gobernar datasets de cualquier sector (finanzas, salud, logistica, telecomunicaciones o manufactura).

Para resolver esta deuda arquitectonica, se formulo el **ADR-011: Gobernanza Universal ABAC y Roles Dinamicos sin Sesgo de Dominio** (`documentation/adr/ADR-011-gobernanza-universal-abac-y-roles-dinamicos.md`), estableciendo una transicion hacia:
1. **Arquetipos Semanticos Universales:** Roles basados en permisos ontologicos (`data_owner`, `restricted_operator`, `compliance_auditor`) que aplican independientemente de la industria.
2. **Filtrado por Atributos Dinamico (ABAC):** Registro en tiempo de ejecucion de predicados sobre cualquier dimension de negocio (por ejemplo, `hospital_id = 'H-401'`, `warehouse_code = 'BOG-01'`, `country = 'CO'`).
3. **Propagacion End-to-End:** Transmision del rol y contexto Zero-Trust desde la cabecera HTTP `X-User-Role` en la UI, pasando por el middleware ASGI, LangGraph, el motor de consultas Trino y la sintesis del Copiloto conversacional.

---

## 2. Detalle de Implementacion Tecnica

### 2.1. Gobernanza y Motor de Politicas (Ranger & Policy Store)
- Archivo modificado: `src/security_governance/ranger/policy_store.py`
  - Ingestion de arquetipos semanticos (`ROLE_ALIASES`) que normalizan dinamicamente los roles (`data_owner` -> `director_general`, `restricted_operator` -> `gerente_norte`, `compliance_auditor` -> `analista_externo`).
  - Registro de predicados ABAC en memoria: implementacion de `register_dynamic_row_filter(role_id, filter_expr, table_name)` y `reset_dynamic_row_filters()`.
  - Resolucion unificada de politicas de filtrado de filas y enmascaramiento (`resolve_row_filter_rule`, `resolve_masking_rule`), preservando compatibilidad absoluta con las politicas nativas declaradas en Ranger JSON.

### 2.2. Motor de Consultas y Determinismo Local
- Archivo modificado: `src/core/query_engine/trino_client.py`
  - Incorporacion de `execute_query_sync(sql, catalog, schema_name, user_role, timeout_sec)` para invocaciones sincronas deterministas.
  - Actualizacion de `_execute_deterministic_local_engine` para aplicar activamente el filtrado por filas (Row-Level Security) y enmascaramiento de columnas PII sobre las filas locales resultantes cuando las politicas de seguridad aplican en ejecuciones offline o pruebas de integracion.

### 2.3. Estado del Agente Conversacional y LangGraph
- Archivo modificado: `src/agent/state.py`
  - Inclusion del campo `user_role: str` en el esquema de estado `AgentState`.
- Archivo modificado: `src/agent/graph/nodes/pipeline.py`
  - En el nodo `execute`: Extraccion de `user_role` desde el estado y envio a `execute_query(sql, user_role=role)` para ejecucion bajo politicas de Ranger.
  - En el nodo `synthesize`: Insercion automatica de la nota ejecutiva Zero-Trust en la respuesta final del agente cuando se detecta aplicacion de RLS o enmascaramiento de datos.
- Archivo modificado: `src/agent/graph/builder.py`
  - Actualizacion de `invoke_turn` para recibir `user_role` e inyectarlo en el estado de LangGraph.
- Archivo modificado: `src/api/routes/agent.py`
  - Enlace de `execute_query` por defecto a `trino_client.execute_query_sync`.
  - En el endpoint `POST /api/v1/agent/chat`: Extraccion del rol de usuario desde `request.state.user_role` (inyectado por `CorrelationIdMiddleware`) o desde la cabecera `X-User-Role`, traspasandolo a `invoke_turn` y persistiendo el rol utilizado en los metadatos de la sesion.

### 2.4. API de Roles Dinamicos y ABAC
- Archivo modificado: `src/api/routes/auth.py`
  - Enriquecimiento del modelo `ZeroTrustRole` con los campos `archetype`, `scope_column` y `scope_value`.
  - Creacion del endpoint `POST /api/v1/auth/roles` para provisionamiento dinamico de roles en caliente mediante `CreateRoleRequest`, registrando automaticamente el filtro de fila en `policy_store.register_dynamic_row_filter`.
  - Incorporacion de `reset_roles_catalog()` para aislamiento en suites de pruebas unitarias.

### 2.5. Propagacion de Rol en Frontend (UI / React)
- Archivo modificado: `src/frontend/components/copilot/copilotApi.ts`
  - Inyeccion de la cabecera HTTP `X-User-Role` en la llamada `POST /api/v1/agent/chat`.
- Archivos modificados: `src/frontend/components/copilot/useCopilotChat.ts` y `CopilotChatContext.tsx`
  - Exposicion de `activeRole` y `setActiveRole(role)` dentro del contexto y controlador del chat, garantizando que cada mensaje del usuario viaje firmado con el rol activo en la interfaz.
- Archivo modificado: `src/frontend/components/lineage/lineageApi.ts`
  - Inyeccion de la cabecera `X-User-Role` en la consulta del grafo de linaje de tablas `GET /api/v1/lineage/tables/{table_id}`.
- Archivo modificado: `src/frontend/app/page.tsx`
  - Sincronizacion segura del selector de rol global hacia el controlador del Copiloto mediante invocacion defensiva `copilotChat?.setActiveRole?.(...)`.

---

## 3. Matriz de Pruebas y Verificacion

| Suite de Pruebas | Alcance | Resultado |
| :--- | :--- | :--- |
| `tests/governance/test_ranger_security.py` | 26 pruebas de enmascaramiento y RLS de Ranger | 26/26 APROBADAS |
| `tests/api/test_governance_dynamic_roles_and_agent.py` | Creacion dinamica de roles ABAC y chat con cabecera `X-User-Role` | 2/2 APROBADAS |
| `tests/api/test_agent_endpoint.py` y `tests/agent/` | Validacion completa del Copiloto, generacion SQL y orquestacion LangGraph | 82/82 APROBADAS |
| Suite Backend General (`pytest`) | Totalidad de los modulos de backend, lakehouse, orquestacion y gobernanza | 287/287 APROBADAS |
| Suite Frontend (`vitest`) | 14 suites que cubren Canvas, ZeroTrustLens, SessionWorkspace, Copilot y Telemetria | 145/145 APROBADAS |

---

## 4. Estado de la Rama y Registro de Cambios

- **Rama Git:** `feature/universal-governance-abac-e2e`
- **Registro en Changelog:** `documentation/changelog/21-10-2026-changelog.md`
- **ADR Oficial:** `documentation/adr/ADR-011-gobernanza-universal-abac-y-roles-dinamicos.md`
- **Pull Request:** Abierto contra la rama base `develop` para revision y aprobacion por el equipo.
