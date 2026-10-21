"""Midas - Generador Inteligente de Títulos para Sesiones Conversacionales.

Historia de Usuario: HU-BACK-03 & ADR-010
Autor: Daniel Echeverría (Backend Lead)
Sintetiza la intención inicial del usuario en un título ejecutivo de 3 a 5 palabras
utilizando Qwen 2.5 local (ModelRouter) con fallback heurístico determinístico (<5ms).
"""

import logging
import re
from typing import Optional

logger = logging.getLogger("midas.session.title_generator")

_CLEANUP_REGEX = re.compile(
    r"(?i)^(hola|buenas|buenos días|buenas tardes|por favor|cu[aá]l es|cu[aá]les son|mu[eé]strame|dime|quiero ver|puedes mostrar|mostrar|consultar|ver|dame|necesito ver)\s*"
)
_PUNCTUATION_REGEX = re.compile(r'[?¿!¡.,:;"\'`_{}[\]()]')


def _heuristic_title_fallback(text: str) -> str:
    """Extrae un título ejecutivo determinístico de 3 a 5 palabras sin requerir red."""
    clean = text.strip().split("\n")[0]
    clean = _CLEANUP_REGEX.sub("", clean).strip()
    clean = _PUNCTUATION_REGEX.sub(" ", clean).strip()
    words = [w for w in clean.split() if len(w) > 1 or w.isupper()]

    if not words:
        return "Consulta Analítica Midas"

    # Tomar de 3 a 5 palabras representativas
    selected = words[:5]
    title = " ".join(selected)
    return title.capitalize()[:60]


def generate_session_title(first_user_message: str) -> str:
    """Genera un título ejecutivo para la sesión mediante Qwen 2.5 local o fallback heurístico."""
    clean_message = first_user_message.strip()
    if not clean_message:
        return "Nueva Conversación"

    # 1. Intentar inferencia local con Qwen 2.5 (timeout estricto de 1.5s)
    try:
        from src.agent.models.model_router import ModelRouter

        router = ModelRouter(timeout=1.5)
        system_prompt = (
            "Eres un asistente ejecutivo de Business Intelligence en Midas Lakehouse. "
            "Genera un título muy conciso de 3 a 5 palabras que sintetice la intención analítica "
            "de la consulta del usuario. "
            "Responde únicamente con el título, sin comillas, sin explicaciones y sin signos ortográficos."
        )
        raw_title = router._call_ollama(system_prompt=system_prompt, question=clean_message)
        if raw_title:
            cleaned = _PUNCTUATION_REGEX.sub(" ", raw_title).strip()
            words = cleaned.split()
            if 2 <= len(words) <= 7:
                return " ".join(words[:5]).capitalize()[:60]
    except Exception as exc:
        logger.debug("Ollama no disponible para titulación rápida, usando fallback heurístico: %s", exc)

    # 2. Fallback heurístico determinístico
    return _heuristic_title_fallback(clean_message)
