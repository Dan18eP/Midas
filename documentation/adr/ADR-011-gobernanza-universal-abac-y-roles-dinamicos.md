# ADR-011: Gobernanza Universal Dinamica, Arquetipos de Seguridad (RBAC/ABAC) y Desacoplamiento de Negocio

> **Estado:** Aceptado  
> **Fecha:** 21 de Octubre de 2026  
> **Autores:** Daniel Echeverria (Backend Lead & Arquitecto), Sebastian Castiblanco (Governance Lead), Dilan Chavez (Frontend Lead)  
> **Decisores:** Jesus Noguera (Team Leader), Daniel Echeverria (Backend Lead & Arquitecto)  

---

## 1. Contexto

La arquitectura inicial de gobernanza y seguridad Zero-Trust en Midas (documentada en ADR-002, ADR-006 y Especificacion 05) adopto identidades de prueba canonicas denominadas `director_general`, `gerente_norte` y `analista_externo`, asociadas a un predicado territorial rigido: `region = 'NORTE'` en `row_filter_policy.json` y a listas fijas de nodos (`source_postgres`, `gold_marts`) en `auth.py`.

La auditoria integral de producto y la validacion de casos de uso multifuente revelaron tres limitaciones arquitectonicas criticas:

1. **Acoplamiento de Dominio y Percepcion de "Mock":**  
   Al atar las politicas a un caso de negocio de retail colombiano con regiones geograficas, la plataforma pierde su propuesta de valor fundamental: ser un Active Lakehouse universal capaz de ingerir y consultar datos de cualquier industria (salud, banca, manufactura, educacion, recursos humanos o logistica). En un dataset de pacientes o de inventarios industriales, no existe "Gerente Norte" ni columna `region`.

2. **Riesgo de Ruptura en Consultas SQL Trino:**  
   Si una politica de Row-Level Security (RLS) inyecta de forma ciega `WHERE region = 'NORTE'` sobre tablas que carecen de la columna `region` (por ejemplo, transacciones de archivos CSV o tablas dimensionales sin particion geografica), Trino rechaza la consulta con error sintactico (`Column 'region' cannot be resolved`), degradando la resiliencia del sistema.

3. **Desconexion entre la UI y el Agente Conversacional:**  
   Aunque el middleware ASGI `CorrelationIdMiddleware` captura la cabecera HTTP `X-User-Role`, las peticiones del frontend (`copilotApi.ts` y `lineageApi.ts`) omitian enviar el rol seleccionado en la Lente Zero-Trust, y el endpoint del Copiloto (`/api/v1/agent/chat`) no inyectaba dicho contexto en el grafo de LangGraph ni en el ejecutor de Trino.

---

## 2. Decision

Se adopta una **Arquitectura de Gobernanza Universal Dinamica basada en Arquetipos de Seguridad (NIST RBAC/ABAC) y Enmascaramiento por Etiquetas de Metadatos (Tag-Based Masking)**:

### 2.1. Arquetipos Universales de Seguridad
Se reemplaza la rigidez de personas de retail por tres arquetipos de seguridad abstractos de estandar empresarial:

1. **`data_owner` / Propietario de Datos (Acceso Irrestricto):**  
   - Acceso total a todas las fuentes, capas Medallion y datasets.  
   - Consultas ejecutadas en claro, sin filtros de fila ni enmascaramiento.

2. **`restricted_operator` / Operador de Alcance Limitado (ABAC / RLS Parametrico):**  
   - Acceso condicionado a atributos de alcance (Attribute-Based Access Control).  
   - El filtro no es estatico: se define mediante pares parametricos `(scope_column, scope_value)`.  
   - Inspeccion segura del AST: el motor verifica si la tabla consultada contiene la columna de alcance antes de inyectar el predicado `WHERE`, previniendo errores de ejecucion en tablas agnosticas.

3. **`compliance_auditor` / Auditor de Privacidad (Zero-Trust Privacy / Tag-Based Masking):**  
   - Menor privilegio para observabilidad y cumplimiento regulatorio.  
   - Enmascaramiento universal basado en etiquetas de clasificacion taxonomica de Apache Atlas (`PII_EMAIL`, `PII_TELEFONO`, `PII_IDENTIFICACION`, `PII_SALARIO`, `PII_CONFIDENCIAL`).  
   - Aplica de forma automatica y transversal sobre cualquier tabla o archivo ingestal, sin importar si los datos pertenecen a clientes, empleados o pacientes.

### 2.2. Retrocompatibilidad Total (Legacy Alias Mapping)
Para garantizar cero impacto y 100% de aprobacion sobre las suites de pruebas existentes:
- `director_general` opera como alias canonico de `data_owner`.
- `gerente_norte` opera como alias canonico de `restricted_operator` con alcance por defecto `(region, NORTE)`.
- `analista_externo` opera como alias canonico de `compliance_auditor`.

### 2.3. Catalogo y Registro Dinamico de Roles (`/api/v1/auth/roles`)
El endpoint `GET /api/v1/auth/roles` devuelve los arquetipos universales enriquecidos con sus alias legacy y metadatos de politicas activas. Ademas, se habilita `POST /api/v1/auth/roles` para que administradores o conectores puedan registrar roles personalizados en caliente con filtros de alcance parametricos segun el dataset conectado.

### 2.4. Conexion E2E de Identidad (X-User-Role)
Se establece la propagacion continua del rol de seguridad a lo largo de toda la pila:
1. **Frontend:** `ZeroTrustLens` comunica el rol activo al contexto global; `copilotApi.ts` y `lineageApi.ts` transmiten el encabezado HTTP `X-User-Role`.
2. **Gateway:** `CorrelationIdMiddleware` valida y aloja el rol en `request.state.user_role`.
3. **Endpoint Copiloto:** `chat_with_agent` extrae `user_role` y lo transmite al estado conversacional `AgentState`.
4. **LangGraph & Trino:** El nodo `execute_query` despacha la consulta a `TrinoClient.execute_query(sql, user_role=user_role)`.
5. **Ranger Policy Engine:** `apply_policies(sql, user_role)` reescribe el AST aplicando RLS seguro y mascaras PII.
6. **Sintesis Conversacional:** `synthesize_storytelling` y el Copiloto reportan explicitamente en la narrativa y metadatos si la cifra fue calculada bajo politicas de gobernanza activas.

---

## 3. Consecuencias

### Positivas:
- **Universalidad de Negocio:** La gobernanza opera de manera identica para cualquier tipo de dato (financiero, sanitario, comercial, educativo o de RRHH) sin requerir codigo nuevo.
- **Seguridad Real Demostrable:** El cambio de perfil en la interfaz de usuario produce respuestas y cifras tangiblemente distintas en el Copiloto y en Trino, erradicando la percepcion de simulacion.
- **Robustez del Motor SQL:** Al validar la presencia de columnas antes de inyectar RLS, se eliminan fallos en tablas que no comparten el esquema de particion.
- **Preservacion de Inversiones:** El 100% de las pruebas preexistentes (285 backend / 122 frontend) continuan pasando sin modificacion destructiva.

### Consideraciones y Mitigaciones:
- **Precalentamiento de AST:** La evaluacion dinamica de politicas con `sqlglot` se mantiene precalentada en memoria (`warm_up()`) garantizando una latencia menor a 15 ms por consulta (cumplimiento CA-3 de HU-GOV-03).
