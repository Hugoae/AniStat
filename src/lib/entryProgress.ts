import type { AniListEntry } from "../types/domain";

/**
 * Progression effective d'une entrée : la valeur brute si elle existe, sinon
 * (pour une œuvre terminée) le total d'épisodes/chapitres connu de l'œuvre.
 */
export function entryProgressTotal(entry: AniListEntry, kind: "anime" | "manga"): number {
  const progress = Number(entry.progress || 0);
  if (progress > 0) return progress;
  if (entry.status !== "COMPLETED") return 0;
  const fallback = kind === "anime" ? Number(entry.media?.episodes || 0) : Number(entry.media?.chapters || 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}
