# ADR-008: Adopción de Modelo Local Qwen 2.5 (3B) para Inferencia Agéntica Zero-Trust sin Fallback Cloud

> **Estado:** Aceptado  
> **Fecha:** 20 de Octubre de 2026  
> **Autores:** Daniel Echeverría, Elian Rivera, Edgar Corzo  
> **Decisores:** Jesús Noguera (Team Leader), Daniel Echeverría (Backend Lead & Arquitecto)  

---

## 1. Contexto

La arquitectura de Midas exige un Copiloto Agéntico capaz de realizar traducción de lenguaje natural a SQL (Text-to-Gold), sintetizar narrativa de negocio con visualizaciones (Data Storytelling) y generar contratos declarativos de pipelines para Apache Airflow (Pipeline-as-a-Prompt).

En las fases exploratorias se evaluó el uso de modelos en la nube (APIs comerciales de Google Gemini o OpenAI). Sin embargo, bajo los lineamientos corporativos y la especificación de **Gobernanza Zero-Trust Activa** ([ADR-006](ADR-006-gobernanza-activa-escudo-pii-y-lente-zero-trust.md) y [04_logica_de_negocio_y_resiliencia_guardian.md](../canonical/04_logica_de_negocio_y_resiliencia_guardian.md)):
1. **Riesgo de Fuga de Metadatos y PII:** Enviar catálogos DDL, nombres de tablas operacionales, esquemas financieros o consultas de negocio a endpoints externos viola la soberanía y privacidad de datos requerida en entornos empresariales.
2. **Dependencia Externa y Latencia:** Las llamadas a APIs externas introducen costos recurrentes impredecibles, límites de tasa (*rate-limits*) y puntos únicos de fallo ante caídas de conectividad WAN.
3. **Mandato de Seguridad:** Por directriz estricta de la dirección técnica, **cualquier fallback a modelos en la nube queda formalmente prohibido**.

---

## 2. Decisión

Se adopta **Qwen 2.5 (3B)** como el motor de inferencia local y exclusivo de la plataforma Midas, operado mediante un contenedor local Ollama / vLLM, con una política estricta de **Cero Salida a la Nube (Air-Gapped Zero-Trust)**:

1. **Despliegue y Ejecución On-Premises / Monodocker:**
   - El modelo `qwen2.5:3b` se ejecuta localmente mediante el servicio `midas-ollama` en `docker-compose.yml` o conectado al daemon Ollama del host (`http://host.docker.internal:11434`).
   - Se utiliza la cuantización `Q4_K_M`, la cual requiere únicamente **~1.9 GB de VRAM/RAM**, permitiendo su ejecución sin fricción en hardware estándar tanto en CPU (18–30 tokens/s) como en GPU modesta (50–85 tokens/s).

2. **Prohibición de Fallback Cloud y Adopción de Fallback Determinístico AST:**
   - Queda estrictamente vetado el envío de peticiones hacia OpenAI, Anthropic o Gemini.
   - Si el servicio de inferencia local `midas-ollama` no se encuentra disponible, se satura o arroja timeout, el agente activará automáticamente un **Fallback Determinístico Basado en AST**:
     - Motor sintáctico offline basado en `sqlglot` y plantillas de consulta semánticas precertificadas.
     - Este mecanismo resuelve las consultas básicas de métricas, conteos y filtros sin requerir LLM ni comprometer la disponibilidad del sistema.

3. **Guardrails Sintácticos y de Seguridad de Consultas:**
   - Toda salida SQL generada por Qwen 2.5 debe transitar obligatoriamente por el componente `QueryGuardrail`:
     - Validación estricta de operaciones de solo lectura (`SELECT`).
     - Rechazo categórico de sentencias destructivas (`DROP`, `DELETE`, `ALTER`, `INSERT`).
     - Restricción del esquema de consulta a las capas gobernadas (`silver` o `gold`).
     - Inyección forzosa de cláusula `LIMIT 1000` para proteger la memoria de Trino.

---

## 3. Consecuencias

### Positivas:
- **Privacidad y Soberanía 100% Garantizadas:** Ni un solo byte de esquema DDL, consulta de usuario o dato analítico sale de la red privada de Docker (`midas-network`).
- **Cero Costos Operacionales de Tokens:** Costo de inferencia nulo y disponibilidad ilimitada sin cuotas ni suscripciones.
- **Alta Precisión en SQL:** Qwen 2.5 (3B) exhibe un desempeño líder en benchmarks de Text-to-SQL (Spider y BIRD) entre modelos ligeros menores a 7B.
- **Resiliencia Operativa:** Si el motor de inferencia se apaga, el fallback determinístico AST mantiene operativo el flujo base de métricas sin degradación del sistema.

### Mitigaciones y Límites:
- **Consumo de Memoria en Docker:** Requiere reservar ~2 GB de RAM dedicados para el proceso de Ollama en el clúster local.
- **Capacidad de Inferencia Compleja:** Para consultas analíticas de extrema complejidad (múltiples subconsultas correlacionadas), se aplican *few-shot examples* y esquemas DDL compactos en el prompt del sistema.
