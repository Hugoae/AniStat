import { fetchListActivitiesForYear, sleep } from "../api/anilistClient";
import type { ActivityItem } from "../types/domain";

export const ACTIVITY_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
export const ACTIVITY_MAX_AUTO_RETRY = 3;
export const IS_DEV_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

export function devLog(...args) {
  if (IS_DEV_LOCAL && args[0]?.includes?.("failed")) console.warn("[AniListStat]", ...args);
}

export const normalizeName = (name) => String(name || "").trim().toLowerCase();

/** Filtre les pistes locales PROFILE_QUICK_SUGGESTIONS (sans API). */
export function filterQuickProfileSuggestions(inputRaw, list) {
  if (!list || list.length === 0) return [];
  const q = normalizeName(inputRaw);
  /* Sans saisie : pas de menu (évite des requêtes avatar sur tous les raccourcis au focus). */
  const rows = !q
    ? []
    : list.filter((p) => {
        const n = normalizeName(p.userName);
        const lbl = normalizeName(p.label || "");
        return n.startsWith(q) || n.includes(q) || (lbl && lbl.includes(q));
      });
  return rows.slice(0, 12);
}

export async function fetchActivitiesWithRetry(
  userId: number,
  type: "ANIME_LIST" | "MANGA_LIST",
  year: number,
  signal?: AbortSignal,
  options: { sinceId?: number | null } = {}
): Promise<ActivityItem[]> {
  const maxExtraRetries = 2;
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      // Les types générés par codegen pour les activités AniList sont des
      // unions discriminées par `__typename` (ListActivity | TextActivity | …).
      // Notre domaine applicatif (`ActivityItem`) ne conserve que les champs
      // utiles communs (`createdAt`, `media`, …) : on cast via `unknown` car
      // les deux formes sont compatibles au runtime mais divergent côté types.
      return (await fetchListActivitiesForYear(userId, type, year, {
        signal,
        sinceId: options.sinceId,
      })) as unknown as ActivityItem[];
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      if (e?.name === "AbortError") throw err;
      const msg = String(e?.message || "");
      const retryable = msg.includes("Rate limit") || msg.includes("429");
      if (!retryable || attempt >= maxExtraRetries) throw err;
      attempt += 1;
      await sleep(1500 * Math.pow(2, attempt), signal);
    }
  }
}
