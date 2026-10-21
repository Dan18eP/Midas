# Entrega Técnica: HU-GOV-03 Políticas de Enmascaramiento Dinámico y Filtrado por Filas en Apache Ranger

> **ID de la Historia:** `HU-GOV-03`
> **Épica:** `04. Gobernanza Zero-Trust & Resiliencia Activa`
> **Responsable:** Sebastian Castiblanco (Co-Líder, Scrum Master & Governance Lead)
> **Pair/Revisor:** Daniel Echeverría (Líder General de Proyecto & Backend Lead)
> **Rama Oficial:** `feature/governance-ranger-security-policies`
> **Story Points:** 3 SP | **Prioridad:** MUST HAVE
> **Módulo de Código:** `src/security_governance/ranger/`
> **Fecha de Entrega:** Martes 21 de Octubre de 2026
> **Estado:** Completada; políticas aplicadas y verificadas en el contenedor `midas-api`

---

## 1. Historia de Usuario & Criterios de Aceptación

### Declaración de Valor

*Como Governance Lead, quiero configurar políticas de enmascaramiento dinámico
y filtrado por filas en Apache Ranger, para restringir los datos en Trino de
acuerdo con el rol del usuario.*

### Criterios de Aceptación

- [x] **CA-1:** Enmascaramiento dinámico de columnas con tag `PII_CONFIDENCIAL`,
  diferenciado por rol.
- [x] **CA-2:** Filtrado por filas: el rol `Gerente Regional Norte` recibe
  `WHERE region = 'NORTE'` de forma transparente.
- [x] **CA-3:** Validación de consultas sin degradar la latencia más de 15 ms.

---

## 2. Decisión de Alcance

Apache Ranger **no está desplegado** —requiere Solr, base propia y el servicio
TagSync—, y el intento de desplegar Apache Atlas durante HU-GOV-02 falló en dos
imágenes independientes. Entregar solo los archivos de política habría dejado
la historia sin efecto observable y el guión de `canonical/07` sin su momento
de Lente Zero-Trust.

La decisión, tomada con el Governance Lead, fue **declarar y aplicar**:

1. Las políticas se declaran en el **formato nativo de importación de Ranger**,
   listas para cargarse en Ranger Admin sin modificación.
2. Un **motor local** interpreta esos mismos archivos y aplica las políticas
   reescribiendo la consulta antes de enviarla a Trino.

Cuando Ranger y su plugin estén en pie, el mismo archivo gobierna ambos
caminos y el motor local se apaga con `RANGER_LOCAL_ENFORCEMENT=false`.

---

## 3. Detalle de Implementación Técnica

### 3.1. Archivos Creados

| Archivo | Propósito |
| :--- | :--- |
| `src/security_governance/ranger/policies/masking_policy.json` | Seis políticas de enmascaramiento (`policyType 1`), una por etiqueta. |
| `src/security_governance/ranger/policies/row_filter_policy.json` | Política de filtrado por filas (`policyType 2`). |
| `src/security_governance/ranger/policy_store.py` | Carga y resuelve las políticas por rol y categoría. |
| `src/security_governance/ranger/policy_engine.py` | Aplica las políticas reescribiendo el SQL con sqlglot. |
| `tests/governance/test_ranger_security.py` | Suite de 26 pruebas offline. |

### 3.2. Archivos Modificados

| Archivo | Cambio |
| :--- | :--- |
| `src/core/query_engine/trino_client.py` | Aplicación de políticas antes de enviar a Trino; cabecera de rol condicionada al plugin; `security_policy` en el resultado. |
| `docker-compose.yml` / `.env.example` | Variables `RANGER_URL`, `RANGER_LOCAL_ENFORCEMENT`, `RANGER_TRINO_PLUGIN_ENABLED`. |

### 3.3. CA-1 — Enmascaramiento dinámico

Conforme a `canonical/05` §3.2, que es la especificación vinculante:

| Rol | Enmascaramiento | Resultado |
| :--- | :--- | :--- |
| `analista_externo` (Analista / Auditor) | `CUSTOM` por categoría | `u****@riwi.io` |
| `gerente_norte` | `MASK_HASH` | SHA-256: agrupa y cuenta sin exponer |
| `director_general` (Admin) | `NONE` | Texto completo, con `isAuditEnabled` |

> **Discrepancia resuelta.** La redacción de la HU indica que el rol *Auditor*
> accede a texto completo, mientras que `canonical/05` define
> `analista_externo` como "Analista Externo (Auditor)" con enmascaramiento
> estricto de PII. Por política Document-First se siguió la especificación
> canónica. Si el equipo quiere separar Auditor de Analista, corresponde
> primero modificar `canonical/05` y `CANONICAL_ROLES`.

**Una política por etiqueta, no una sola.** La primera versión aplicaba una
única expresión a todas las columnas etiquetadas. Al revisar el SQL generado se
detectó que la sustitución parcial pensada para correos —que conserva el
dominio tras la `@`— **no casa con un número telefónico y lo dejaba en claro**:
un fallo de seguridad silencioso, porque la columna figuraba como enmascarada.
Ahora hay una política por categoría (`PII_EMAIL`, `PII_TELEFONO`,
`PII_IDENTIFICACION`, `PII_TARJETA_CREDITO`, `PII_SALARIO`) y
`PII_CONFIDENCIAL` como respaldo. La categoría la determina el clasificador de
HU-GOV-02, de modo que la etiqueta que Atlas registra y la que Ranger enmascara
salen de la misma definición.

**Compatibilidad con RE2.** Las expresiones que conservan los últimos cuatro
caracteres se escribieron primero con *lookahead* (`.(?=.{4})`). Trino evalúa
expresiones regulares con RE2, que **no soporta lookarounds**: habrían fallado
en ejecución. Se reescribieron con `concat`, `substr` y `length`, soportadas
nativamente.

### 3.4. CA-2 — Filtrado por filas

La política declara el recurso `catalog=iceberg`, `schema in (gold, silver)`,
`table=*`, y para `gerente_norte` el predicado `region = 'NORTE'`.

El motor analiza la consulta, comprueba que alguna tabla referenciada cae
dentro del recurso y añade el predicado al `WHERE`:

```sql
-- Consulta del usuario
SELECT region, SUM(total_neto) AS venta FROM gold.fact_ventas_diarias GROUP BY region

-- Consulta efectiva enviada a Trino
SELECT region, SUM(total_neto) AS venta FROM gold.fact_ventas_diarias
WHERE region = 'NORTE' GROUP BY region
```

Si la consulta ya tiene `WHERE`, el predicado se suma con `AND` en lugar de
sustituirlo. Las tablas fuera del recurso —por ejemplo `bronze.pedidos`— no
reciben filtro, igual que haría Ranger.

### 3.5. Postura de seguridad: falla cerrado

Si una política restrictiva aplica y el motor **no puede garantizar** su
aplicación, la consulta se rechaza con `PolicyEnforcementError` en lugar de
enviarse sin proteger. Dos casos:

- **`SELECT *` con enmascaramiento activo:** sin enumerar columnas no se puede
  saber cuáles proteger. Se exige nombrarlas.
- **SQL no parseable:** no se puede inyectar el filtro ni enmascarar.

### 3.6. Corrección de un fallo preexistente en la impersonación

`TrinoClient` enviaba siempre la cabecera `X-Trino-Role` cuando había rol.
Con Trino levantado, esto provoca **`Access Denied: Cannot set role`** y la
consulta falla: Trino desconoce los roles Zero-Trust porque el plugin de Ranger
no está instalado. El fallo existía antes de esta rama —se reprodujo con los
cambios guardados en `stash`— y rompía toda consulta con rol, incluido el
recorrido del Lente Zero-Trust en la demostración.

La cabecera ahora se envía solo si `RANGER_TRINO_PLUGIN_ENABLED=true`.
Mientras tanto la restricción la aplica el motor local.

---

## 4. Verificación

```bash
pytest tests/governance/test_ranger_security.py -v
```

**26 pruebas, 26 aprobadas.** La suite de gobernanza completa suma **84**
junto a HU-GOV-01 (21) y HU-GOV-02 (37).

Cobertura: estructura y tipo de ambas políticas; anclaje a las etiquetas de
Atlas; cobertura de los tres roles canónicos; expresión propia por categoría
—incluida una prueba de que la del correo y la del teléfono difieren—; ausencia
de lookarounds incompatibles con RE2; anulación de salarios; enmascaramiento
efectivo sobre la consulta; predicado territorial; suma a un `WHERE` existente;
tablas fuera del recurso sin filtro; delegación en el plugin; los dos casos de
fallo cerrado; overhead; y 30 consultas concurrentes con los tres roles
comprobando que no se contaminan entre sí.

### 4.1. CA-3 — Overhead medido

En la suite, sobre 50 iteraciones: promedio y p95 **por debajo de 15 ms**.

Medición dentro del contenedor `midas-api` recién arrancado:

| Rol | Primera consulta |
| :--- | ---: |
| `analista_externo` | 5.40 ms |
| `gerente_norte` | 5.22 ms |
| `director_general` | 0.07 ms |

**Hallazgo y corrección:** antes del precalentamiento, la primera consulta tras
el arranque costaba **88.88 ms** —lectura de los archivos de política más
inicialización de sqlglot—, muy por encima del presupuesto. Se añadió un
`warm_up()` que se ejecuta al importar el módulo, de modo que ese costo lo
absorbe el arranque del contenedor y ninguna consulta de usuario lo paga.

> El presupuesto de CA-3 se definió para el plugin de Ranger. Lo medido aquí es
> el overhead del motor local, que es quien hace cumplir las políticas hoy.
> Cuando el plugin esté instalado habrá que repetir la medición sobre él.

---

## 5. Alcance y Deuda Pendiente

- **Ranger no desplegado.** Las políticas están listas para importar; falta
  Ranger Admin con Solr y TagSync. Con el plugin instalado se pone
  `RANGER_LOCAL_ENFORCEMENT=false` y `RANGER_TRINO_PLUGIN_ENABLED=true`, sin
  cambios de código.
- **Etiquetas por categoría en Atlas.** HU-GOV-02 registra hoy solo
  `PII_CONFIDENCIAL`. Para que Ranger aplique la expresión correcta por tipo de
  dato, el escudo debe registrar además la etiqueta de categoría. Localmente no
  es un problema porque el motor consulta el clasificador directamente.
- **Enmascaramiento sobre `SELECT *`.** Resolverlo requiere consultar el
  catálogo de columnas en Trino antes de reescribir. Hoy se rechaza la consulta.
- **Observación sobre una prueba de otra área (no modificada):**
  `tests/backend/test_trino_query_engine.py::test_query_execute_endpoint_success`
  falla con Trino levantado. Consulta `silver.crm_transacciones`, que no existe
  —el catálogo Iceberg solo tiene `information_schema` porque los pipelines de
  Squad 1 aún no materializaron tablas— y la consulta se cuelga hasta agotar el
  timeout en lugar de caer al motor determinista local. El fallo es previo a
  esta rama y ajeno a ella; se reporta para Daniel Echeverría.
