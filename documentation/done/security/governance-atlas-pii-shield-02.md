# Entrega Técnica: HU-GOV-02 Escudo de Detección PII & Etiquetado Dinámico vía Apache Atlas

> **ID de la Historia:** `HU-GOV-02`
> **Épica:** `04. Gobernanza Zero-Trust & Resiliencia Activa`
> **Responsable:** Sebastian Castiblanco (Co-Líder, Scrum Master & Governance Lead)
> **Pair/Revisor:** Edgar Corzo (Data Engineering Lead)
> **Rama Oficial:** `feature/governance-atlas-pii-shield`
> **Story Points:** 3 SP | **Prioridad:** MUST HAVE
> **Módulo de Código:** `src/security_governance/atlas/`
> **Fecha de Entrega:** Martes 21 de Octubre de 2026
> **Estado:** Completada con pruebas automatizadas; CA-2 y CA-3 verificados contra dobles (ver sección 4)

---

## 1. Historia de Usuario & Criterios de Aceptación

### Declaración de Valor

*Como Governance Lead, quiero un escudo de detección de datos sensibles (PII)
durante la transición Bronze → Silver, para clasificar columnas automáticamente
en Apache Atlas con etiquetas vinculantes.*

### Criterios de Aceptación

- [x] **CA-1:** Clasificador por expresiones regulares y nombres de columnas que
  detecta correos, identificaciones, tarjetas de crédito y salarios.
- [x] **CA-2:** Llamada **asíncrona** a la API REST de Apache Atlas para
  registrar `PII_CONFIDENCIAL` sobre la columna detectada.
- [x] **CA-3:** Verificación de la sincronización hacia Apache Ranger vía
  TagSync dentro de la ventana de 5 segundos.
- [x] **CA-4:** Bitácora de auditoría inmutable con fecha, lote, tabla y
  columnas clasificadas.

---

## 2. Detalle de Implementación Técnica

### 2.1. Archivos Creados

| Archivo | Propósito |
| :--- | :--- |
| `src/security_governance/atlas/pii_classifier.py` | Taxonomía empresarial y clasificador puro (`ST-GOV-02.1`). |
| `src/security_governance/atlas/atlas_client.py` | Cliente REST de Atlas y sonda de etiquetas de Ranger (`ST-GOV-02.2`, `ST-GOV-02.3`). |
| `src/security_governance/atlas/audit_log.py` | Bitácora append-only con encadenamiento criptográfico (`ST-GOV-02.4`). |
| `src/security_governance/atlas/pii_shield.py` | Orquestador del escudo: clasifica, despacha en segundo plano y sella la auditoría. |
| `tests/governance/test_pii_shield.py` | Suite de 37 pruebas offline. |

### 2.2. Archivos Modificados

| Archivo | Cambio |
| :--- | :--- |
| `src/lakehouse/transforms/bronze_to_silver.py` | Colaborador opcional `pii_shield` y campo `pii_report` en el resultado. |
| `.env.example` | Variables de Atlas, Ranger y ruta de la bitácora. |

### 2.3. CA-1 — Clasificador por taxonomía empresarial

El clasificador combina **dos señales independientes** y es puro: no hace red
ni E/S, de modo que puede ejecutarse dentro de un job PySpark sin penalizar
el lote.

| Categoría | Señal por nombre | Señal por contenido |
| :--- | :--- | :--- |
| `TARJETA_CREDITO` | `tarjeta`, `card`, `pan`… | 13–19 dígitos **validados con Luhn** |
| `EMAIL` | `email`, `correo`, `mail` | patrón de dirección de correo |
| `IDENTIFICACION` | `cedula`, `documento`, `nit`, `dni`… | 6–12 dígitos con separadores opcionales |
| `TELEFONO` | `telefono`, `celular`, `movil` | prefijo internacional y 8–20 dígitos |
| `SALARIO` | `salario`, `sueldo`, `nomina`… | — (los montos no tienen forma distintiva) |

`TELEFONO` se incluye porque `documentation/canonical/03` (sección 4.1) exige
enmascarar `telefono` junto con `email`.

Tres decisiones de diseño que evitan falsos positivos y falsos negativos:

1. **Precedencia del nombre sobre el contenido.** Un salario de siete dígitos
   encaja en el patrón de documento de identidad. Si el contenido decidiera,
   `salario_mensual` quedaría clasificado como `IDENTIFICACION` y enmascarado
   con la máscara equivocada. El clasificador hace dos pasadas: primero busca
   coincidencia por nombre —que fija la categoría— y solo si ninguna coincide
   decide por contenido.
2. **Umbral de proporción.** Una columna se clasifica por contenido solo si al
   menos el 60% de sus valores no vacíos coinciden. Un único correo perdido en
   una columna `ciudad` no la convierte en PII.
3. **Validación de Luhn.** Sin ella, cualquier secuencia de 16 dígitos —un
   código interno, un consecutivo— se etiquetaría como tarjeta de crédito.

La confianza reportada refleja cuántas señales concordaron: `1.0` nombre y
contenido, `0.8` solo nombre, `0.75` solo contenido.

### 2.4. CA-2 — Registro asíncrono en Apache Atlas

`PIIShield.scan_batch()` clasifica el lote y **retorna de inmediato**: la
llamada a Atlas se despacha a un `ThreadPoolExecutor` y el lote sigue su curso.
Quien necesite confirmar el resultado llama a `ShieldReport.wait()`.

El cliente usa el endpoint canónico declarado en ADR-006,
`POST /api/atlas/v2/entity/bulk/classification`, con el FQN por columna
(`silver.clientes.email_contacto@midas`) y `propagate: true` para que la
etiqueta viaje por el linaje. Antes del primer registro, `ensure_classification_type()`
crea la definición de `PII_CONFIDENCIAL` si no existe.

### 2.5. CA-3 — Propagación hacia Ranger

`verify_tagsync()` sondea el endpoint de etiquetas de Ranger hasta que aparece
`PII_CONFIDENCIAL` o se agota la ventana de 5 segundos (`ATLAS_TAGSYNC_DEADLINE_SECONDS`).

El resultado distingue **tres** estados, no dos:

| `propagated` | Significado |
| :--- | :--- |
| `True` | Ranger recibió la etiqueta; `elapsed_seconds` dice en cuánto |
| `False` | Ranger respondió pero la etiqueta no llegó dentro de la ventana |
| `None` | Ranger no está desplegado o no responde: **no comprobable** |

Esa distinción importa: hoy Ranger no está en el compose, y reportar `False`
sugeriría un fallo de propagación donde en realidad no hay nada que propagar.

### 2.6. CA-4 — Bitácora inmutable

Registro append-only en JSON Lines con **encadenamiento criptográfico**: cada
entrada guarda el hash SHA-256 de la anterior, partiendo de un hash génesis.
Cada línea contiene fecha ISO-8601, lote, fuente, tabla y las columnas
clasificadas con su categoría, señal y confianza.

`verify_chain()` detecta tanto la **alteración** de una entrada (el hash del
contenido deja de concordar) como su **eliminación** (se rompe el enlace
`prev_hash`). La bitácora se replica además en `s3://midas-governance/pii_audit/`,
el bucket canónico creado en HU-LAKE-01, cuando se le inyecta el cliente MinIO.

### 2.7. Integración con Bronze → Silver

El enganche en `BronzeToSilverTransformer` es **aditivo y desactivado por
defecto**, siguiendo el patrón de inyección que la clase ya usaba para
`minio_client` y `telemetry_publisher`:

```python
transformer = BronzeToSilverTransformer(pii_shield=build_default_shield(minio))
resultado = transformer.process_batch(records, source_name="clientes")
resultado.pii_report["sensitive_columns"]  # ['email_contacto', 'telefono']
```

Sin `pii_shield`, el comportamiento de la transformación es idéntico al
anterior a esta HU. El escaneo se ejecuta tras la deduplicación, sobre los
registros que efectivamente van a Silver, y está envuelto en su propio
`try/except`: **una caída de gobernanza no interrumpe el pipeline de datos**.

---

## 3. Verificación

```bash
pytest tests/governance/test_pii_shield.py -v
```

**37 pruebas, 37 aprobadas.** La suite completa de gobernanza
(`tests/governance/`) suma **58 aprobadas** junto a HU-GOV-01. La suite de
Squad 1 `tests/lakehouse/test_bronze_to_silver.py` sigue en **15 aprobadas**,
confirmando que el enganche no alteró la transformación.

Cobertura por criterio:

- **CA-1:** las cinco categorías; columnas no sensibles (`nombre`, `ciudad`)
  que no deben clasificarse; columnas de control `_*` ignoradas; detección solo
  por contenido y solo por nombre; precedencia nombre sobre contenido; Luhn
  descartando una secuencia inválida; umbral de proporción.
- **CA-2:** contrato del payload de `bulk/classification`, FQN por columna,
  despacho de las columnas detectadas, lote sin PII que no llama a Atlas, Atlas
  caído que no interrumpe, y una prueba que verifica que `scan_batch()` retorna
  antes de que Atlas responda.
- **CA-3:** propagación confirmada dentro de la ventana, propagación que
  aparece en un sondeo posterior, Ranger no desplegado (`None`) y Ranger que
  responde sin la etiqueta (`False`).
- **CA-4:** contenido de la entrada, encadenamiento, detección de entrada
  alterada y de entrada eliminada, determinismo del hash, replicación en
  `midas-governance` y fallo de replicación que no rompe la bitácora.
- **Integración:** el transformador reporta las columnas sensibles, se comporta
  igual sin escudo y sobrevive a un escudo que lanza excepción.

---

## 4. Alcance y Deuda Pendiente

Esta entrega implementa el escudo completo, pero **Apache Atlas y Apache Ranger
no se desplegaron**, por decisión explícita de alcance tomada el día de la
congelación del sprint:

- **Apache Atlas no tiene imagen oficial en Docker Hub.** `apache/atlas` no está
  publicada; la única alternativa es la imagen de terceros `sburn/apache-atlas`,
  desactualizada y sin soporte.
- **Apache Ranger con TagSync** exige además Solr, su propia base de datos y el
  servicio de sincronización por separado. Es trabajo de varias horas con riesgo
  de desestabilizar el stack antes de la demostración, y pisa el alcance de
  HU-GOV-03 (`Ranger Dynamic Masking & Row-Level Filters`).

En consecuencia:

- **CA-1 y CA-4 están verificados de punta a punta**: no dependen de servicios
  externos.
- **CA-2 y CA-3 están implementados contra el contrato REST real** y verificados
  con dobles de prueba. Cuando Atlas y Ranger se desplieguen, el escudo funciona
  sin cambios de código: basta apuntar `ATLAS_URL` y `RANGER_URL`.
- **Mientras tanto el sistema no queda desprotegido ni roto**: la detección y la
  auditoría operan igual, y el despacho se asienta como no confirmado.

Otros puntos abiertos:

- **Job PySpark independiente:** `jobs/transform_silver.py` es una
  implementación separada que no usa `BronzeToSilverTransformer`, así que no
  pasa por el escudo. Engancharlo exige instalar el paquete de gobernanza y
  `httpx` dentro de la imagen de Spark; corresponde coordinarlo con Edgar Corzo.
- **Enmascaramiento efectivo:** clasificar no enmascara. El enmascaramiento
  dinámico en Trino depende de las políticas de Ranger, que son HU-GOV-03.
- **Rotación de la bitácora:** el archivo crece sin límite. Para producción
  corresponde una política de rotación que preserve la cadena de hashes.
