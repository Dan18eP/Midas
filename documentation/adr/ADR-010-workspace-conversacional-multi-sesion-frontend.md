# ADR-010: Arquitectura de Workspace Conversacional Multi-Sesión y Navegación de Estados en Frontend

> **Estado:** Aceptado  
> **Fecha:** 20 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Joshua Gonzales, Dilan Chávez  
> **Decisores:** Jesús Noguera (Team Leader), Daniel Echeverría (Backend Lead & Arquitecto)  

---

## 1. Contexto

La interfaz de usuario inicial de Midas se concentró en un lienzo topológico monolítico basado en React Flow ([PipelineCanvas.tsx](../../src/frontend/components/canvas/PipelineCanvas.tsx)) con un chat flotante subordinado en la esquina inferior.

La auditoría de producto y los requerimientos del usuario revelaron tres limitaciones críticas:
1. **Falta de Experiencia Conversacional Central (ChatGPT-Style):** Al ingresar, el usuario no encuentra un punto de entrada empático ni opciones directas para declarar su intención, sino un lienzo técnico precargado con 7 nodos estáticos.
2. **Carencia de Accesos Rápidos de Ingesta:** La conexión a fuentes de datos heterogéneas (archivos Excel, CSV, APIs REST o bases de datos relacionales) no cuenta con accesos directos (*launchers*) que guíen al usuario de manera intuitiva.
3. **Ausencia de Historial de Sesiones y Aislamiento de Contexto:** El sistema no permitía navegar sesiones anteriores. Cada recarga del navegador borraba el contexto conversacional o forzaba un estado genérico, impidiendo revisar qué generó la IA en una consulta pasada, qué auditorías se realizaron o qué flujo topológico se originó.

---

## 2. Decisión

Se adopta una **Arquitectura de Workspace Conversacional Multi-Sesión con Navegación de Estados Dinámica** en Next.js 14:

1. **Pantalla de Bienvenida y Lanzadores de Ingesta (Welcome Hub):**  
   Al ingresar a la plataforma o abrir una nueva conversación, el usuario es recibido con una vista central estilo ChatGPT:
   - Encabezado empático: *"Hola, {usuario}. ¿Qué tienes en mente hoy?"*
   - Cuatro botones de acción rápida para ingesta:
     - `[📊 Excel (.xlsx)]`: Inicia la carga o inspección de hojas de cálculo con detección de esquema.
     - `[📄 CSV]`: Asistente de delimitadores y subida a Bronze.
     - `[🔌 API REST / Webhook]`: Formulario de configuración de endpoints y cabeceras de autorización.
     - `[🗄️ Base de Datos Relacional]`: Conexión guiada JDBC/SQL a PostgreSQL/MySQL operacionales.

2. **Panel Lateral de Historial de Sesiones Navegable (Session History Sidebar):**  
   Se integra una barra lateral izquierda colapsable que agrupa las sesiones anteriores cronológicamente (*Hoy*, *Ayer*, *Últimos 7 días*):
   - Cada entrada muestra: Título autogenerado por el modelo local Qwen 2.5, marca temporal, conteo de intercambios e insignias de módulos activados (`Auditoría`, `Flujo`, `Mart Gold`).
   - Opción destacada `Nueva Sesión (+)` para reiniciar el workspace en blanco.

3. **Restauración Integral de Contexto por Sesión:**  
   Al seleccionar una sesión previa, el frontend no solo restaura el historial de mensajes del chat, sino que recompone el estado completo del workspace:
   - **Flujo Topológico Específico:** El Canvas React Flow renderiza únicamente los nodos y aristas generados o analizados en esa sesión.
   - **Módulos de Auditoría y Linaje:** Los drawers de linaje ("Explícame esta cifra") y telemetría Guardian reflejan el estado capturado durante dicha sesión.

4. **Transición Fluida entre Estados del Workspace:**  
   - **Modo 1 (Welcome Hub):** Visible cuando no hay mensajes activos en la sesión actual.
   - **Modo 2 (Active Canvas & Copilot):** Se activa automáticamente en cuanto el usuario envía un prompt o pulsa un botón de conexión rápida, dividiendo la pantalla armónicamente entre el Canvas React Flow (a la izquierda/centro) y el panel de conversación con gráficos ECharts (a la derecha).

5. **Contrato Backend de Sesiones en FastAPI:**  
   Se establece el soporte de persistencia en PostgreSQL (`midas_operational.chat_sessions` y `midas_operational.session_messages`) mediante los endpoints:
   - `GET /api/v1/sessions`: Lista de sesiones del usuario.
   - `POST /api/v1/sessions`: Crea una nueva sesión.
   - `GET /api/v1/sessions/{session_id}`: Recupera mensajes, topología y artefactos asociados.

---

## 3. Consecuencias

### Positivas:
- **Usabilidad de Nivel Corporativo:** La experiencia de usuario se alinea con los estándares modernos de asistentes de IA (ChatGPT / Claude), reduciendo la curva de aprendizaje de usuarios de negocio.
- **Trazabilidad de Decisiones:** Los analistas pueden auditar exactamente qué transformaciones, preguntas y reportes se ejecutaron en sesiones previas sin pérdida de información.
- **Desacoplamiento Visual:** Se eliminan definitivamente los mocks estáticos del canvas ([initialTopology.ts](../../src/frontend/components/canvas/topology/initialTopology.ts)), poblando el grafo topológico exclusivamente con datos reales de la sesión activa.

### Mitigaciones y Límites:
- **Gestión de Estado en Frontend:** Requiere un `SessionContext` robusto en React para coordinar el cambio de sesión sin parpadeos (*flickering*) en el lienzo de React Flow.
