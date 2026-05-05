import { PIE_COLORS } from "../config/constants";

function stableHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function keyOf(label: string): string {
  return String(label || "__unknown__").trim().toLowerCase();
}

/**
 * Verrouille les couleurs selon un ordre de référence existant.
 * Exemple : le mode "Titres" garde ses couleurs actuelles par index, puis
 * le mode "Chapitres" réutilise ces couleurs par clé.
 */
export function buildColorMapFromOrderedKeys(
  keys: readonly string[],
  palette: readonly string[] = PIE_COLORS
): Record<string, string> {
  const out: Record<string, string> = {};
  keys.forEach((rawKey, index) => {
    const key = keyOf(rawKey);
    if (!out[key]) out[key] = palette[index % palette.length];
  });
  return out;
}

export function getColorForLabel(
  label: string,
  lockedColors?: Record<string, string>,
  palette: readonly string[] = PIE_COLORS
): string {
  const key = keyOf(label);
  if (lockedColors?.[key]) return lockedColors[key];
  if (palette.length === 0) return "#3DB4F2";
  return palette[stableHash(key) % palette.length];
}

