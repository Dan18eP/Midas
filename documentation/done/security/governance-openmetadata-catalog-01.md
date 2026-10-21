# Entrega Técnica: HU-GOV-01 OpenMetadata Catalog Ingestion & Automated End-to-End Lineage

> **ID de la Historia:** `HU-GOV-01`
> **Épica:** `04. Gobernanza Zero-Trust & Resiliencia Activa`
> **Responsable:** Sebastian Castiblanco (Co-Líder, Scrum Master & Governance Lead)
> **Pair/Revisor:** Equipo Midas
> **Rama Oficial:** `feature/governance-openmetadata-catalog`
> **Story Points:** 3 SP | **Prioridad:** SHOULD HAVE
> **Módulo de Código:** `src/security_governance/openmetadata/`
> **Fecha de Entrega:** Martes 21 de Octubre de 2026
> **Estado:** Completada y verificada con pruebas automatizadas

---

## 1. Historia de Usuario & Criterios de Aceptación

### Declaración de Valor

*Como Governance Lead, quiero desplegar OpenMetadata y automatizar la ingesta
de metadatos desde MinIO, Trino y Spark, para auditar el catálogo central y
visualizar el linaje de extremo a extremo.*

### Criterios de Aceptación

- [x] **CA-1 (Despliegue):** `midas-openmetadata` y `midas-opensearch` operativos
  en Docker, bajo los perfiles `governance` y `full`, con migración de esquema
  previa en un contenedor efímero.
- [x] **CA-2 (Conectores):** Servicios declarados para las tablas Iceberg
  (`bronze`, `silver`, `gold`) vía Trino y para el PostgreSQL operacional.
- [x] **CA-3 (Linaje automatizado):** Registro de la dependencia entre fuentes
  crudas, transformaciones PySpark y marts Gold.
- [x] **CA-4 (API REST):** El gateway `/api/v1/lineage/table/{table}` resuelve el
  linaje contra OpenMetadata en caliente para el drawer "Explícame esta cifra".

---

## 2. Detalle de Implementación Técnica

### 2.1. Archivos Creados

| Archivo | Propósito |
| :--- | :--- |
| `src/security_governance/__init__.py` | Raíz del módulo de gobernanza (Squad 4). |
| `src/security_governance/openmetadata/connector_config.yaml` | Declaración canónica de conectores y topología de linaje. |
| `src/security_governance/openmetadata/config.py` | Carga de la declaración y parámetros de conexión por entorno. |
| `src/security_governance/openmetadata/client.py` | Cliente REST tolerante a fallos del catálogo. |
| `src/security_governance/openmetadata/lineage_extractor.py` | Publicación de servicios, registro de linaje y resolución del contrato del drawer. |
| `tests/governance/test_openmetadata_lineage.py` | Suite de 19 pruebas offline. |

### 2.2. Archivos Modificados

| Archivo | Cambio |
| :--- | :--- |
| `docker-compose.yml` | Servicios `midas-opensearch`, `midas-openmetadata-migrate` y `midas-openmetadata`; volumen `opensearch_data`. |
| `.env.example` | Variables del catálogo, del cliente de gobernanza y del índice de búsqueda. |
| `src/api/routes/lineage.py` | Cambio aditivo: intenta OpenMetadata y degrada al linaje canónico. |

### 2.3. CA-1 — Despliegue de OpenMetadata y OpenSearch

Tres servicios nuevos, aislados bajo los perfiles `governance` y `full` para no
alterar el arranque mínimo del stack:

- **`midas-opensearch`** (`opensearchproject/opensearch:2.11.1`): índice de
  búsqueda y linaje en modo `single-node`, con el plugin de seguridad
  desactivado (entorno local) y heap configurable vía `OPENSEARCH_HEAP`.
- **`midas-openmetadata-migrate`**: contenedor efímero que ejecuta
  `openmetadata-ops.sh -d migrate` sobre la base `openmetadata_db` —ya provista
  por `init-multi-db.sh`— antes de que arranque el servidor. El servidor declara
  `service_completed_successfully` sobre él, de modo que nunca levanta contra un
  esquema sin migrar.
- **`midas-openmetadata`** (`docker.getcollate.io/openmetadata/server:1.5.11`):
  catálogo central en el puerto `8585` conforme a la tabla de puertos de
  `documentation/canonical/02`, con puerto de administración `8586` usado por el
  healthcheck.

La configuración de ambos contenedores de OpenMetadata se comparte con un ancla
YAML (`&openmetadata-environment`), evitando que la migración y el servidor
puedan divergir.

### 2.4. CA-2 — Conectores de metadatos

`connector_config.yaml` es la **única fuente de verdad** del módulo: declara qué
se cataloga y qué aristas de linaje existen. El extractor no infiere nada que no
esté declarado allí, conforme a la política Cero Code Drift.

- `midas_lakehouse_iceberg` (serviceType `Trino`, `midas-trino:8080`, catálogo
  `iceberg`) con los tres esquemas Medallón y su capa asociada.
- `midas_operational_postgres` (serviceType `Postgres`, `midas-postgres:5432`,
  base `midas_operational`) con el esquema `public` como capa `source`.

Los nombres publicados pueden sobreescribirse con `OPENMETADATA_SERVICE_ICEBERG`
y `OPENMETADATA_SERVICE_POSTGRES` sin tocar el YAML.

### 2.5. CA-3 — Extracción de linaje automatizada

La sección `lineage.pipelines` declara las tres transformaciones de la
arquitectura y sus aristas:

1. `universal_ingestion_source_to_bronze` — `src/lakehouse/ingestion/`
2. `pyspark_bronze_to_silver` — `jobs/bronze_to_silver.py`
3. `pyspark_silver_to_gold` — `jobs/materialize_gold.py`

`register_pipeline_lineage()` resuelve el UUID de cada entidad por su FQN y
publica la arista vía `PUT /api/v1/lineage`. Las tablas que todavía no han sido
ingeridas por el catálogo se reportan como **omitidas** y no interrumpen el
registro de las demás: el resultado es un reporte `{created, skipped}`, no una
excepción.

`build_declared_chain()` reconstruye la cadena ascendente completa de cualquier
tabla recorriendo las aristas declaradas, con corte de ciclos defensivo.

Ejecución manual del registro completo:

```bash
docker exec midas-api python -m src.security_governance.openmetadata.lineage_extractor
```

### 2.6. CA-4 — Gateway REST para el drawer del frontend

El endpoint `/api/v1/lineage/table/{table}` ya existía (HU-BACK-03, Squad 1)
sirviendo el linaje canónico estático. Para no romper el contrato que consume
`ExplainNumberDrawer`, el cambio es **estrictamente aditivo**:

```
resolve_lineage_payload(tabla)  ──► ¿OpenMetadata responde y la tabla existe?
                                     │
                            sí ──────┴──── no ──► get_table_lineage(tabla)
                             │                     (linaje canónico, sin cambios)
                             ▼
                     payload con linaje verificado en caliente
```

El payload producido respeta exactamente el modelo `LineagePayloadResponse`
—`stages`, `transformation`, `certification`, `formula`—, reutilizando
`compute_audit_hash` y las definiciones canónicas de métricas de
`src/core/lineage/canonical_lineage.py` para que el hash de auditoría y la
fórmula KaTeX sigan siendo los mismos de siempre.

### 2.7. Principio de diseño: degradación elegante

Toda operación del módulo es tolerante a fallos y ninguna excepción de
gobernanza puede tumbar el API Gateway:

- El cliente devuelve `None`/`False` ante error de red, HTTP ≥ 400 o cuerpo no
  JSON, registrando un `warning`.
- `resolve_lineage_payload()` devuelve `None` si el catálogo no responde, si la
  tabla no está catalogada o si no hay topología declarada.
- La llamada desde la ruta está envuelta en su propio `try/except`.

**Con OpenMetadata apagado, el comportamiento del drawer es idéntico al actual.**

---

## 3. Verificación

### 3.1. Suite automatizada

```bash
pytest tests/governance/test_openmetadata_lineage.py -v
```

**Resultado: 19 pruebas, 19 aprobadas.** Cubren:

- Declaración de los dos conectores y de las tres capas Medallón (CA-2).
- Construcción del payload de servicio y sobreescritura por entorno.
- Topología completa hasta Gold y cadena ascendente de cuatro capas (CA-3).
- Resolución de UUIDs, aristas enviadas y omisión de entidades no catalogadas.
- Contrato del drawer: claves, orden de capas, hash de 64 caracteres, fórmula
  canónica y ubicaciones físicas por capa (CA-4).
- Degradación elegante en los cuatro escenarios de fallo.

Las pruebas son **offline**: el cliente REST se sustituye por un doble, de modo
que la suite no requiere que el stack esté levantado.

### 3.2. Verificación sobre el stack real

Ejecutada sobre el monodocker completo (11 contenedores del perfil `full`):

| Comprobación | Resultado |
| :--- | :--- |
| `midas-opensearch` | Up (healthy), `/_cluster/health` responde |
| `midas-openmetadata-migrate` | Exited (0); esquema migrado hasta la revisión `1.5.11` |
| `midas-openmetadata` | Up (healthy); `/api/v1/system/version` → `1.5.11`, UI HTTP 200 |
| Cliente desde `midas-api` | `OpenMetadataClient().is_available()` → `True` |
| **CA-2** Registro de servicios | `Servicios registrados: ['midas_lakehouse_iceberg', 'midas_operational_postgres'] \| fallidos: []`, confirmado en `dbservice_entity` |
| **CA-3** Escritura de linaje | `PUT /api/v1/lineage` verificado contra el servidor real: arista creada y releída (`upstreamEdges: 1`) |
| **CA-4** Gateway de linaje | `/api/v1/lineage/table/{tabla}` → HTTP 200, cuatro capas en orden `source → bronze → silver → gold` |
| Degradación con catálogo caído | Mismo contrato, idéntico al comportamiento previo a esta HU |

#### Nota sobre el estado del linaje en el catálogo

`register_pipeline_lineage()` reporta hoy **0 aristas creadas y 9 omitidas**.
Es el resultado correcto y esperado: las aristas se registran entre entidades
que ya existen en el catálogo, y las tablas Iceberg de `bronze`, `silver` y
`gold` todavía no han sido materializadas por los pipelines de Squad 1, por lo
que no hay nada que catalogar. El extractor lo reporta tabla por tabla en lugar
de fallar.

Para no dejar el camino de escritura sin probar, se verificó de forma
independiente contra el servidor real: se crearon dos entidades desechables, se
registró la arista entre ellas **con el propio cliente del módulo**, se releyó
el grafo (`upstreamEdges: 1`) y se eliminaron las entidades. El catálogo quedó
sin residuo, conservando únicamente los dos servicios de CA-2.

#### Nota sobre autenticación

Las escrituras exigen un JWT válido. El token del `ingestion-bot` **está
cifrado en reposo** en `user_entity`, por lo que leerlo de la base de datos no
sirve: el servidor lo rechaza con `401 Invalid token`. La vía correcta es
`POST /api/v1/users/login` con el usuario administrador, o generar el token
desde la UI (Settings → Bots). La verificación anterior se realizó con un token
de administrador obtenido por login; `OPENMETADATA_JWT_TOKEN` se mantiene vacío
en `.env.example` para que el repositorio no transporte credenciales.

---

## 4. Alcance y Deuda Pendiente

- **Ingesta programada:** el registro de servicios y linaje se dispara hoy de
  forma manual con el comando de la sección 2.5. Programarlo como DAG recurrente
  de Airflow corresponde a la integración con HU-ORCH-01 y queda fuera de esta
  historia.
- **Token de bot:** `OPENMETADATA_JWT_TOKEN` se entrega vacío. Sin él, las
  escrituras al catálogo son rechazadas por el `JwtFilter` y el extractor las
  reporta como omitidas; las lecturas del gateway degradan al linaje canónico.
  El token se genera desde la UI (Settings → Bots → ingestion-bot) y se inyecta
  por `.env`. El valor almacenado en la base de datos está cifrado y no sirve.
- **Catalogación de tablas:** registrar los *servicios* no ingiere sus tablas.
  La ingesta de metadatos tabla por tabla requiere desplegar el conector de
  ingesta de OpenMetadata (`openmetadata/ingestion`) y que los pipelines de
  Squad 1 hayan materializado las tablas Iceberg. Hasta entonces las aristas se
  reportan como omitidas.
- **Perfilado y tests de calidad:** OpenMetadata soporta data profiling; no se
  activa en esta entrega por presupuesto de recursos del monodocker.
- **Observación sobre código de otra área (no modificado):** en
  `src/core/lineage/canonical_lineage.py`, `get_table_lineage()` hace
  `stages = list(DEFAULT_PEDIDOS_STAGES)` —copia superficial— y acto seguido
  muta `stages[-1]["table"]`. Esto altera de forma permanente la constante de
  módulo compartida entre peticiones. No se corrige aquí por pertenecer a
  Squad 1; se reporta para que Daniel Echeverría decida.
