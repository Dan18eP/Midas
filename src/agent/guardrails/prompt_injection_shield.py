"""Detecta instrucciones que intentan cambiar las reglas del agente."""

import re


class PromptInjectionError(ValueError):
    """La entrada intenta eludir las instrucciones del sistema."""


_INJECTION_PATTERNS = (
    re.compile(r"\b(ignore|disregard|forget|override)\b.{0,60}\b(previous|prior|above|system|developer|all)\b", re.I | re.S),
    re.compile(r"\b(ignore|disregard|forget|override)\b.{0,60}\b(instructions?|rules?|guardrails?|polic(y|ies)|restrictions?)\b", re.I | re.S),
    re.compile(r"\b(reveal|print|show|repeat|leak|expose)\b.{0,50}\b(system|developer|hidden|secret)\b.{0,30}\b(prompt|instructions?)\b", re.I | re.S),
    re.compile(r"\b(jailbreak|prompt injection|DAN mode|do anything now)\b", re.I),
    re.compile(r"\b(bypass|evade|disable|remove)\b.{0,40}\b(guardrails?|safety|security|restrictions?|polic(y|ies))\b", re.I | re.S),
    re.compile(r"\b(act as|pretend to be|roleplay as)\b.{0,50}\b(system|developer|admin|unrestricted)\b", re.I | re.S),
    re.compile(r"(?:^|\n)\s*(?:system|developer)\s*:\s*", re.I),
    re.compile(r"\b(ignora|olvida|desobedece|omite)\b.{0,60}\b(instrucciones?|reglas?|pol[ií]ticas?|restricciones?)\b", re.I | re.S),
    re.compile(r"\b(revela|muestra|imprime)\b.{0,40}\b(prompt|instrucciones?|secretos?)\b", re.I | re.S),
)


def assert_safe_prompt(message: str) -> None:
    """Reject common attempts to override or disclose agent instructions."""
    if any(pattern.search(message) for pattern in _INJECTION_PATTERNS):
        raise PromptInjectionError("La solicitud fue bloqueada por seguridad.")
