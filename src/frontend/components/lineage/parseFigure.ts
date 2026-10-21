export const FIGURE_TOKEN_PATTERN =
  '(?:[$€£]\\s?)?\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d+)?%?|' +
  '(?:[$€£]\\s?)\\d+(?:[.,]\\d+)?(?:\\s?(?:[KMB]|millones|mil)\\b)?|' +
  '\\b\\d+(?:[.,]\\d+)?\\s?%|' +
  '\\b\\d+(?:[.,]\\d+)?\\s?[KMB]\\b';

const FIGURE_TOKEN = new RegExp(FIGURE_TOKEN_PATTERN, 'g');

const SUFFIX_MULTIPLIER: Record<string, number> = {
  K: 1_000,
  M: 1_000_000,
  B: 1_000_000_000,
  mil: 1_000,
  millones: 1_000_000,
};

export function extractFigureTokens(text: string): string[] {
  return text.match(FIGURE_TOKEN) ?? [];
}

function decimalFromParts(integerPart: string, decimalPart: string): number {
  const value = Number(`${integerPart}.${decimalPart}`);
  return Number.isFinite(value) ? value : Number.NaN;
}

function resolveSeparatorNumber(body: string): number {
  const lastDot = body.lastIndexOf('.');
  const lastComma = body.lastIndexOf(',');

  if (lastDot >= 0 && lastComma >= 0) {
    const decimalSeparatorIndex = Math.max(lastDot, lastComma);
    const thousandsSeparator = decimalSeparatorIndex === lastDot ? ',' : '.';
    const integerPart = body.slice(0, decimalSeparatorIndex).split(thousandsSeparator).join('');
    const decimalPart = body.slice(decimalSeparatorIndex + 1).split(thousandsSeparator).join('');
    return decimalFromParts(integerPart.replace(/[.,]/g, ''), decimalPart);
  }

  const separatorIndex = Math.max(lastDot, lastComma);
  if (separatorIndex < 0) return Number(body);

  // Un único tipo de separador con grupos de 3 dígitos => formato es-CO de miles ("1.490", "1,490,000").
  if (/^\d{1,3}(?:[.,]\d{3})+$/.test(body)) {
    return Number(body.replace(/[.,]/g, ''));
  }

  const integerPart = body.slice(0, separatorIndex).replace(/[.,]/g, '');
  const decimalPart = body.slice(separatorIndex + 1);
  return decimalFromParts(integerPart, decimalPart);
}

export function parseFigureValue(token: string | null | undefined): number | null {
  if (!token) return null;
  const cleaned = token.replace(/[$€£%\s]/g, '');
  if (!cleaned) return null;

  const suffixMatch = /^(.*?)(millones|mil|[KMB])$/i.exec(cleaned);
  const body = suffixMatch ? suffixMatch[1] : cleaned;
  if (!body) return null;

  const value = resolveSeparatorNumber(body);
  if (!Number.isFinite(value)) return null;

  if (suffixMatch) {
    const multiplier = SUFFIX_MULTIPLIER[suffixMatch[2].toLowerCase()] ?? SUFFIX_MULTIPLIER[suffixMatch[2]];
    return multiplier ? value * multiplier : value;
  }
  return value;
}

export function formatFigureValue(value: number): string {
  return new Intl.NumberFormat('es-CO', { maximumFractionDigits: 2 }).format(value);
}

export function valuesLooselyEqual(a: number | null, b: number | null): boolean {
  if (a === null || b === null) return false;
  if (a === b) return true;
  const scale = Math.max(Math.abs(a), Math.abs(b));
  if (scale === 0) return true;
  return Math.abs(a - b) / scale < 0.001;
}
