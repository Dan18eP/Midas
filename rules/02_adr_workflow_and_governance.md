# Regla 02: Gobernanza y Flujo de Registro de Decisiones de Arquitectura (ADRs)
> **Ámbito:** Obligatorio para todo cambio de diseño estructural en el Proyecto Midas  
> **Líder de Proyecto & Autoridad Técnica:** Daniel Echeverría  
> **Estado:** Activa e Inmutable  

---

## 1. ¿Qué es un ADR en Midas y Cuándo es Obligatorio?

Un **Architecture Decision Record (ADR)** es un documento formal que captura una decisión arquitectónica significativa tomada para el proyecto, junto con su contexto, alternativas descartadas y consecuencias.

### Es OBLIGATORIO crear un ADR cuando se pretenda:
1. **Agregar, reemplazar o eliminar una tecnología del stack** (ej. motores de base de datos, brokers de eventos, conectores, librerías core).
2. **Alterar la estrategia de almacenamiento o formato de datos** (ej. pasar de Parquet simple a Iceberg, cambiar el tipo de catálogo).
3. **Modificar protocolos de comunicación entre servicios** (ej. SSE vs. WebSockets, gRPC vs. REST).
4. **Cambiar políticas de seguridad, enmascaramiento o autenticación** (ej. integración de Ranger, roles de acceso).
5. **Ajustar el alcance fundamental de resiliencia o de la capa agéntica** (ej. playbooks de Guardian, guardrails OWASP).

---

## 2. Nomenclatura y Ubicación Obligatoria

Todo nuevo ADR debe alojarse exclusivamente en:  
`documentation/adr/`  

Siguiendo el formato de numeración consecutiva estricta:  
`ADR-[NUMERO]-[nombre-descriptivo-kebab-case].md`  
*(Ejemplo: `ADR-008-estrategia-de-cacheo-redis-para-trino.md`)*

---

## 3. Estructura Canónica Obligatoria de un ADR

Todo archivo ADR debe contener sin excepción las siguientes 5 secciones:

```markdown
# ADR-[NUMERO]: [Título Claro de la Decisión]
> **Estado:** Propuesto | Aceptado | Reemplazado por ADR-XXX  
> **Fecha:** [DD de Mes de AAAA]  
> **Autores:** [Nombre de los autores]  
> **Aprobador Oficial:** Daniel Echeverría (Team Leader & Arquitecto)  

---

## 1. Contexto y Problema
- ¿Qué situación técnica o de negocio motiva esta decisión?
- ¿Qué limitaciones existen (tiempo de entrega al miércoles 21, hardware local, etc.)?

## 2. Alternativas Evaluadas
- Opción A: Ventajas y desventajas.
- Opción B: Ventajas y desventajas.

## 3. Decisión Adoptada
- Declaración explícita, concisa e inequívoca de lo que se va a construir o adoptar.

## 4. Consecuencias
### Positivas:
- Beneficios concretos para el proyecto y la demostración.
### Negativas / Riesgos y Mitigaciones:
- Deuda técnica asumida, consumo adicional de recursos y cómo se mitiga.

## 5. Documentos Afectados que Deben Actualizarse
- Lista de archivos bajo `documentation/` que deben ser editados en el mismo PR para reflejar esta decisión.
```

---

## 4. Estados del Ciclo de Vida de un ADR

1. **`Propuesto`:** Documento redactado por un miembro del equipo sometido a revisión técnica. Aún **no autoriza** tirar código.
2. **`Aceptado`:** Revisado y aprobado por Daniel Echeverría. **A partir de este momento es vinculante** y se autoriza la codificación.
3. **`Reemplazado (Superseded)`:** Una decisión anterior queda sin efecto porque un nuevo ADR la sustituye (ej. *"ADR-001 Reemplazado por ADR-012"*). Queda prohibido borrar el ADR antiguo; se conserva por auditoría histórica.
