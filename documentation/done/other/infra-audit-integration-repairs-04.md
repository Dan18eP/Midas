# Reparaciones de auditoría: integraciones reales y estado verificable

Esta rama corrige defectos confirmados de integración y elimina los éxitos simulados
del flujo normal de la API y la interfaz. **Aún no es una entrega validada de extremo
a extremo.** La ejecución completa del pipeline Spark y los controles de gobernanza
siguen siendo requisitos pendientes.

## Contexto de entrega

| Elemento | Valor |
|---|---|
| Fecha | 21-10-2026 |
| Base | `origin/develop`, `c6edcc4`, incluye las sesiones/cargas del PR #56 y el historial/linaje frontend del PR #57 |
| Rama | `feature/orchestration-airflow-dag-factory-audit-repairs` |
| Backlog | HU-ORCH-01 (#42), reparaciones de integración de HU-LAKE-02/03/04/05, HU-BACK-01/02/03, HU-AI-01/04, HU-FRONT-01/02/03 |
| Responsable | aZian10; revisión pendiente de los responsables de módulo y Daniel Echeverría |
| Referencias | Documentos canónicos 02–06 y ADR-009/010 |
| Entrega | Un PR combinado; el usuario aprobó expresamente la excepción de tamaño |

## Orden de revisión y estado de las reparaciones

| Unidad | Cambios | Límite de verificación |
|---|---|---|
| Docker y orquestación | Recursos aislados por proyecto, puertos locales, DNS interno de Trino, conexión/configuración de Spark, paquetes de ejecución e inicialización de sesiones/eventos | Configuración de Compose y construcción real de DAGs Airflow verificadas; la compilación/inicialización de todas las imágenes sigue sin verificarse |
| Fuentes a Silver/Gold | Publicación de contratos de fuentes; los errores de carga se informan; lotes Bronze confirmados con ruta estable; activación de Silver; deduplicación por clave de negocio; ubicaciones de namespaces e Iceberg v2; destinos administrados aislados | Pruebas unitarias/de contratos; aún se requiere ejecución distribuida |
| Consultas/API/agente | Paginación, errores y tiempos límite reales de Trino; sin resultados fabricados implícitos; catálogo y ejecución reales en el agente; errores del checkpointer/sesión PostgreSQL visibles | Pruebas del protocolo HTTP y persistencia PostgreSQL real; no se ejecutó una consulta real en Trino |
| Autenticación | Tokens distintos para operador y publicador; un encabezado de rol no concede identidad; cookie HttpOnly de sesión | Pruebas de autenticación backend; solo existe la cuenta local de dirección |
| Observabilidad/interfaz | Historial de eventos persistente y deduplicación de reintentos; historial/SSE reales; Canvas vacío hasta recibir datos; calidad/frescura de linaje desconocidas si no hay evidencia; SSE de demostración solo con activación explícita | Pruebas Python/frontend y compilación de producción; no se probó el pipeline en un navegador real |

## Verificaciones ejecutadas

- Python 3.11: `python -B -m pytest -p no:cacheprovider -q tests --maxfail=3`:
  **238 aprobadas**, dos avisos de obsolescencia de FastAPI.
- `npm ci --ignore-scripts --no-audit --no-fund`: terminó correctamente.
- Después de integrar el PR #57, `npm test -- --reporter=json --outputFile=.venv/frontend-tests.json`:
  **110 aprobadas**, cero fallos. Las pruebas pasan explícitamente la topología de demostración como fixture.
- `npm run build`: **aprobado en el árbol final integrado**, con validación de tipos TypeScript y generación de páginas estáticas.
- `docker compose --profile full config --quiet`: **aprobado**.
- Airflow real en un contenedor desechable sin red, usando la imagen local almacenada en caché: se construyeron y serializaron tres DAGs, se verificó la dependencia Bronze→Silver y se resolvió `spark_default` como `spark://midas-spark-master:7077`. Esta prueba con una imagen en caché no demuestra que la imagen declarada en el Dockerfile se pueda reconstruir correctamente.
- Proyecto aislado `midas-audit-20261021`, PostgreSQL 16, volumen nuevo propio del proyecto y puerto local 15432: inicialización terminada y base de datos saludable. `python -B -m scripts.verify_audit_database` verifica persistencia y recarga de sesión/mensajes/topología, durabilidad de eventos/deduplicación de reintentos/historial y registro/recarga de fuentes. La publicación del contrato de almacenamiento se reemplazó explícitamente por un mock.
- La compilación completa de imágenes aisladas se detuvo durante la descarga de dependencias porque la memoria disponible del host no alcanzaba mientras seguían activos otros servicios del equipo. Se conservaron esos contenedores y volúmenes.

La base temporal solo contiene registros sintéticos de auditoría y se detuvo tras
las pruebas. Se conserva su volumen; no se borraron volúmenes ni se contactaron
sistemas de producción.

## Revisión de la auditoría anterior

La evaluación de `documentation/reviews/auditoria_integral_arquitectura_y_mvp_dorado.md`
es evidencia histórica, no una especificación actual ni un reporte de ejecución vigente.

| Afirmación anterior | Estado actual |
|---|---|
| Faltaban servicios Spark y Java | Resuelta en cambios anteriores: los servicios declarados y Java ya existen. La interoperabilidad en ejecución sigue sin verificarse. |
| La falta de `airflow connections add` demuestra que no hay conexión | No sustentada: Airflow admite conexiones por variables de entorno. Estas reparaciones corrigen el problema real de análisis del JSON, verificado con el hook real. |
| La fábrica solo genera DAGs Gold | Resuelta en cambios anteriores; esta rama conecta la publicación de fuentes, el commit Bronze, el disparo de Silver y la programación basada en datasets. Aún no se ha ejecutado todo el flujo. |
| No había registro/aislamiento de fuentes | Parcialmente resuelta: el registro ya existía; aquí se reparan la activación/publicación y las rutas administradas. La consistencia distribuida y CDC siguen pendientes. |
| No existían endpoints de linaje/historial | Resuelta en cambios anteriores. Esta rama persiste el historial y conserva calidad desconocida si no existe dato observado; la cobertura automatizada de linaje sigue parcial. |
| Canvas/replay operativo era simulado | Parcialmente resuelto por el PR #57 y esta rama: sin topología demo por defecto, con historial/autenticación reales y fixtures demo explícitos. Falta validar el pipeline real desde el navegador. |
| Versiones, líneas y conteos de pruebas anteriores | Reemplazados por la inspección del código y los comandos actuales; no se copiaron a ciegas las versiones sugeridas. |

## Requisitos pendientes y siguientes pasos

| Prioridad | Requisito / brecha | Siguiente paso concreto | Esfuerzo estimado |
|---|---|---|---|
| P0 | Falta validar la compilación limpia de imágenes y la ejecución distribuida de Spark | Usar un host con memoria disponible; verificar versiones de Python, Java, conectores fijados y acceso desde el driver | 0,5–1 día |
| P0 | Falta recorrer fuente→Airflow→Bronze→Silver→Gold→Trino→API/navegador | Cargar un CSV pequeño con claves, campos monetarios y fechas explícitos; consultar totales, repetir el lote e inyectar un monto negativo e interrupción de dependencia | 0,5–1 día |
| P0 antes de habilitar usuarios restringidos | Faltan Ranger/Atlas, enmascaramiento PII backend y políticas de filas | Implementar HU-GOV-03 y probar resultados reales de consulta con identidades distintas; el token local de dirección no lo reemplaza | 1–3 días |
| P1 | Faltan marts/uniones/fórmulas de negocio canónicos y playbooks Guardian F1–F5 | Resolver con los responsables las diferencias de campos/fórmulas canónicos y luego implementar marts y playbooks aprobados | 2–4 días |
| P1 | Faltan línea base completa de cambios de esquema, controles de claves foráneas e historial de incidentes de solo anexado | Guardar comparación de esquema y agregar las reglas de calidad acordadas; hoy la cuarentena representa las filas inválidas actuales de cada fuente | 1–2 días |
| P1 | El registro se distribuye entre SQL y almacenamiento de objetos; la caché/sesiones SQL no forman una transacción | Agregar reconciliación de contratos publicados parcialmente y escritura transaccional de sesión/mensaje | 0,5–1 día |
| P1 | Faltan cobertura de linaje de catálogo/certificación de métricas y restauración completa del Canvas por sesión | Conectar catálogo y eventos de linaje en ejecución con la topología persistida; certificar solo métricas observadas | 1–2 días |
| P2 | Endurecimiento de despliegue | Fijar imágenes mutables restantes, rotar valores de desarrollo y agregar TLS/autenticación a consultas y controles de readiness/reinicio | Después de los requisitos de ejecución del MVP |

Gold se activa por cambios en datasets Silver **y** por su horario configurado;
un ciclo horario puede consultar la última instantánea Silver publicada. Un ID de
lote estable hace que el reintento use la misma ruta Bronze; cada nueva ejecución
programada crea otro lote. Las instantáneas de fuentes se acumulan: el manejo de
borrados y semántica CDC necesita un contrato explícito. Cada destino Gold generado
admite una ejecución activa y la validación impide que otro pipeline reclame ese
destino. Estas garantías aún requieren pruebas reales de fallos.

## Lista anti-desvío y aprobaciones

- [x] Se revisaron los requisitos canónicos y el código antes de implementar.
- [x] No se inventaron ni alteraron fórmulas de negocio.
- [x] Se preservaron e integraron los cambios upstream de sesiones/cargas.
- [x] Las pruebas distinguen mocks, verificaciones con base real e integraciones no ejecutadas.
- [x] El usuario aprobó la entrega combinada y la excepción de tamaño.
- [ ] Políticas Ranger y protección PII completas: siguen pendientes.
- [ ] Revisión de responsables de los módulos: requerida antes de integrar.
- [ ] Pipeline principal probado de extremo a extremo: sigue pendiente.

## Límites de reversión

Los commits separan infraestructura/pipeline, consultas/autenticación/persistencia
y cambios frontend de observabilidad. Si se retira el inicio de sesión, hay que
revertir en conjunto los cambios frontend y de autenticación que dependen de él.
El SQL agregado es aditivo; conserva sus datos y volúmenes al revertir contenedores
de la aplicación. No se deben borrar volúmenes PostgreSQL para migrar o revertir.
