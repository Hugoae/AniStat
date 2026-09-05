/**
 * AniList `ListActivity.status` is a free-text phrase
 * (`watched episode`, `rewatched`, `reread chapter`…), not `MediaListStatus`.
 */

function normalizeActivityStatus(statusRaw: string | null | undefined): string {
  return String(statusRaw ?? "").trim().toLowerCase();
}

/** Rewatch / reread, including per-episode and per-chapter updates. */
export function isRewatchOrRereadStatus(statusRaw: string | null | undefined): boolean {
  const s = normalizeActivityStatus(statusRaw);
  if (!s) return false;
  return s === "repeating" || s.startsWith("rewatch") || s.startsWith("reread");
}

/**
 * Title finished in a single activity: first completion, or a whole-title
 * rewatch / reread (typical for movies and one-shots, where `progress` is null).
 */
export function isCompletedLikeActivityStatus(statusRaw: string | null | undefined): boolean {
  const s = normalizeActivityStatus(statusRaw);
  return s === "completed" || s === "rewatched" || s === "reread";
}

/** List activity created when the user drops a title. */
export function isDroppedActivityStatus(statusRaw: string | null | undefined): boolean {
  return normalizeActivityStatus(statusRaw) === "dropped";
}
