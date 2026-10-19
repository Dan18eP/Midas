"""Genera narrativa ejecutiva sin crear cifras nuevas."""

import re
from decimal import Decimal


_NUMBER = re.compile(r"(?<![\w])[-+]?\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?")


def build_narrative(rows: list[dict[str, object]]) -> str:
    """Redacta hallazgos desde valores numéricos originales de Trino."""
    findings: list[str] = []
    source_numbers: set[str] = set()

    for row in rows:
        for column, value in row.items():
            if not _is_number(value):
                continue
            original = _number_text(value)
            source_numbers.add(original)
            label = _label_without_numbers(str(column))
            findings.append(f"- `{label}`: `{original}` (valor retornado por Trino).")
            if len(findings) == 5:
                break
        if len(findings) == 5:
            break

    if not findings:
        findings.append("- El resultado no contiene cifras numéricas para resumir.")

    narrative = "\n".join(
        [
            "## Hallazgo principal",
            *findings,
            "",
            "## Recomendación de negocio",
            "Usar estos resultados como base para revisar el comportamiento observado y definir la acción adecuada con el equipo responsable.",
        ]
    )
    if any(token not in source_numbers for token in _NUMBER.findall(narrative)):
        raise ValueError("La narrativa contiene una cifra que no proviene de Trino.")
    return narrative


def _is_number(value: object) -> bool:
    return isinstance(value, (int, float, Decimal)) and not isinstance(value, bool)


def _number_text(value: int | float | Decimal) -> str:
    return str(value)


def _label_without_numbers(label: str) -> str:
    return re.sub(r"\d+(?:[.,]\d+)?(?:[eE][-+]?\d+)?", "", label).strip() or "métrica"
