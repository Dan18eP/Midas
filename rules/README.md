# Midas — Repositorio de Reglas y Gobernanza de Código
> **Control Estricto de Calidad, Prevención de Code Drift y Flujo Document-First**

---

## 📌 Propósito de esta Carpeta

Este directorio define las **reglas inmutables de desarrollo, colaboración y arquitectura** para el equipo de ingeniería del proyecto **Midas**. 

El objetivo primordial es **eliminar el Code Drift**: evitar que el código diverja de la documentación y garantizar que cada línea escrita en `src/` o `docker/` esté respaldada por una especificación o ADR previamente aprobado.

---

## 📜 Índice de Reglas Oficiales

| Archivo | Título de la Regla | Resumen Ejecutivo |
| :--- | :--- | :--- |
| [`01_anti_code_drift_policy.md`](01_anti_code_drift_policy.md) | **Política Estricta Anti-Code Drift (Document-First)** | Prohíbe terminantemente cambios en código desfasados de la documentación. Obliga al ciclo *Document First $\rightarrow$ Code Second*. |
| [`02_adr_workflow_and_governance.md`](02_adr_workflow_and_governance.md) | **Gobernanza y Ciclo de Vida de ADRs** | Define cuándo es obligatorio un Architecture Decision Record, su plantilla canónica y el protocolo de aprobación por el Líder Técnico. |

---

## 🚦 Checklist Rápido para Desarrolladores y Agentes

Antes de enviar un Pull Request o solicitar revisión de código, verifica:

- [ ] ¿Existe un ADR o documento en `documentation/` que describa exactamente lo que estás construyendo?
- [ ] Si modificaste un esquema de datos, ¿actualizaste primero `documentation/03_especificacion_base_de_datos_y_lakehouse.md`?
- [ ] Si alteraste una fórmula de negocio o regla de Guardian, ¿está reflejada en `documentation/04_logica_de_negocio_y_resiliencia_guardian.md`?
- [ ] ¿Tu commit o PR referencia explícitamente el documento o ADR que autoriza la modificación?
- [ ] ¿Se redactó el reporte de entrega correspondiente en `documentation/done/[area]/`?

> ⚠️ **Recordatorio:** Todo cambio que no supere este checklist será rechazado automáticamente por el Líder de Proyecto (Daniel Echeverría).
