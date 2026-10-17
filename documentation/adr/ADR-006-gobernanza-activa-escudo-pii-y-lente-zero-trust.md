# ADR-006: Gobernanza Activa: Escudo PII en Ingesta y Lente Zero-Trust
> **Estado:** Aceptado  
> **Fecha:** 17 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Joshua Gonzales, Edgar Corzo, Sebastian Castiblanco  
> **Decisores:** Equipo de Arquitectura Midas  

---

## 1. Contexto

En arquitecturas tradicionales de Big Data, la gobernanza y la seguridad son reactivas: las herramientas como Apache Atlas y Apache Ranger existen, pero requieren que un administrador humano identifique manualmente las tablas y clasifique cada columna sensible. Si un usuario crea una nueva tabla Gold con el Copiloto o se ingesta un nuevo archivo con datos personales, existe una ventana de vulnerabilidad donde los datos quedan expuestos.

Asimismo, la seguridad suele ser "invisible" en las demostraciones de producto porque opera silenciosamente a nivel de protocolo, dificultando que los evaluadores aprecien el valor de la seguridad Zero-Trust.

---

## 2. Decisión

Se implementan dos capacidades de gobernanza activa:

1. **Escudo PII Activo (Auto-Tagging Zero-Trust en Ingesta):**
   - Durante la ejecución del pipeline en **Apache Spark** (Bronze $\rightarrow$ Silver y materialización a Gold), un inspector de sensibilidad analiza muestras de cada columna nueva utilizando expresiones regulares y patrones conocidos (emails, documentos de identidad, números telefónicos, datos de tarjetas).
   - Cuando se detecta un patrón de datos sensibles, el job de Spark invoca la API REST de **Apache Atlas** (`/v2/entity/bulk/classification`) y le asigna automáticamente la etiqueta `PII_CONFIDENCIAL` a la columna.
   - Gracias a la sincronización de etiquetas entre Atlas y **Apache Ranger** (*TagSync*), las políticas de Ranger aplican de inmediato enmascaramiento dinámico (ej. `j****@gmail.com`) en las consultas de Trino sin intervención humana.
2. **Lente Zero-Trust (Simulador de Roles en Vivo):**
   - La plataforma web incorpora en su cabecera un selector de rol para auditoría:
     - `Rol: Director General` (Acceso total, sin filtros territoriales).
     - `Rol: Gerente Regional Norte` (Filtro automático por fila: `region = 'NORTE'`).
     - `Rol: Analista Externo` (Enmascaramiento total de PII y bloqueo de tablas financieras).
   - Al cambiar de rol, el **Canvas** colorea los nodos (verde: acceso permitido; ámbar: acceso filtrado; rojo: bloqueado por Ranger) y el **Copiloto** recalcula sus respuestas ejecutando la consulta en Trino impersonando dicho rol, agregando una nota auditable de transparencia: *"Calculado bajo políticas de Apache Ranger para el rol [Gerente Regional Norte]"*.

---

## 3. Consecuencias

### Positivas:
- **Zero-Day Exposure:** Ningún dato confidencial queda desprotegido al ingresar al lago.
- **Factor WOW de Seguridad:** Permite demostrar en 30 segundos la efectividad de Apache Atlas y Apache Ranger combinados, haciéndolos visualmente comprensibles e interactivos.
- **Trazabilidad Empresarial:** Toda consulta queda registrada en la auditoría de Ranger con el usuario, rol, IP y políticas aplicadas.
