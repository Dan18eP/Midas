# ADR-003: Transporte de Telemetría en Tiempo Real vía Server-Sent Events (SSE) y PostgreSQL
> **Estado:** Aceptado  
> **Fecha:** 17 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Elian Rivera, Dilan Chávez, Joshua Gonzales  
> **Decisores:** Equipo de Arquitectura Midas  

---

## 1. Contexto

Para cumplir con el requerimiento de visualizar el **flujo de datos en tiempo real en la plataforma web**, se necesita comunicar eventos de progreso, tasas de ingesta, alertas de incidentes y estados de ejecución desde los pipelines de backend hacia el Canvas en React.

Se evaluaron tres opciones arquitectónicas:
1. **Apache Kafka + WebSockets Bidireccionales:** Bus de eventos con Kafka broker y servidor WebSocket.
2. **WebSockets con Redis Pub/Sub:** Servidor WebSocket en FastAPI respaldado por Redis.
3. **Server-Sent Events (SSE) sobre HTTP/2 + Proyección de Eventos en PostgreSQL:** Canal de streaming unidireccional nativo desde FastAPI hacia el navegador, persistiendo cada evento en PostgreSQL.

---

## 2. Decisión

Se adopta **Server-Sent Events (SSE) sobre HTTP + Proyección de Eventos en PostgreSQL** para el transporte de telemetría y alertas hacia el Canvas y el Copiloto:

1. **Flujo Unidireccional Óptimo:** La telemetría de monitoreo de un pipeline es por naturaleza unidireccional (*Server $\rightarrow$ Client*). Los comandos del usuario hacia el backend (ej. solicitar una transformación o aprobar una recuperación) viajan por llamadas estándar REST (`POST /api/v1/actions`).
2. **Reconexión y Trazabilidad con `Last-Event-ID`:** SSE incluye soporte estándar para reanudación de transmisiones. Si el navegador se desconecta, envía el último ID recibido y el backend reproduce los eventos perdidos almacenados en la tabla `pipeline_events` de PostgreSQL.
3. **Ahorro de Complejidad y Memoria:** Se pospone el despliegue de Apache Kafka para la Fase 2 corporativa. Esto libera 4 a 6 GB de memoria RAM en el entorno local de desarrollo y ahorra 2 días de configuración de connectors, asegurando la entrega antes de la noche del Miércoles 21.

---

## 3. Consecuencias

### Positivas:
- **Cero Dependencias Pesadas:** Funciona nativamente con FastAPI (`EventSourceResponse`) y la API estándar `EventSource` de JavaScript en React.
- **Persistencia Histórica Lista para el Replay:** Dado que cada evento queda grabado en PostgreSQL con su timestamp, habilitar la barra de **Time-Travel Replay** en el Canvas es trivial: se consulta `GET /api/v1/events?time_window=...`.
- **Estabilidad Total:** Cero caídas por timeouts de sockets o desincronización de brokers en entornos Docker locales.

### Negativas / Mitigaciones:
- No apto para escenarios con millones de eventos por segundo (sensores IoT masivos). Para el volumen de eventos de control y lotes de un Lakehouse empresarial, PostgreSQL + SSE soporta holgadamente miles de eventos por segundo sin degradación.
