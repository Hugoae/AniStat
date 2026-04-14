import { C } from "../config/constants";

/** Note liste → demi-point le plus proche (1, 1.5, … 10), hors plage / invalide → null. */
export function roundAnimeListScoreToHalf(raw) {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  const half = Math.round(n * 2) / 2;
  return Math.min(10, Math.max(1, half));
}

export function formatHalfScoreLabel(v) {
  return new Intl.NumberFormat("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  }).format(v);
}

/**
 * Histogramme demi-points 1 à 10 : toutes les tranches affichées même à 0,
 * pour garder une échelle fixe (1, 1,5, … 10).
 */
export function buildAnimeHalfScoreDistributionFullRange(scoredAnimeEntries) {
  const counts = {};
  for (const e of scoredAnimeEntries) {
    const b = roundAnimeListScoreToHalf(e.score);
    if (b == null) continue;
    counts[b] = (counts[b] || 0) + 1;
  }
  const rows = [];
  for (let step = 2; step <= 20; step += 1) {
    const v = step / 2;
    rows.push({
      bucket: v,
      label: formatHalfScoreLabel(v),
      count: counts[v] || 0,
    });
  }
  return rows;
}

export function animeHalfScoreBarColor(bucket) {
  const v = Number(bucket);
  if (!Number.isFinite(v)) return C.accent;
  if (v < 4) return C.red;
  if (v < 6) return C.orange;
  if (v < 8) return C.yellow;
  return C.green;
}
