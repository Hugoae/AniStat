import type { ActivityItem, AniListEntry, AniListUser } from "../types/domain";

/** Année de la toute première activité connue (sinon année courante). */
export function getFirstActivityYear(activities: ActivityItem[]): number {
  let first = Number.POSITIVE_INFINITY;
  activities.forEach((activity) => {
    const ts = Number(activity?.createdAt || 0);
    if (ts > 0 && ts < first) first = ts;
  });
  return Number.isFinite(first) ? new Date(first * 1000).getFullYear() : new Date().getFullYear();
}

/** Année de création du compte AniList (sinon `fallback`). */
function getAccountCreationYear(user: AniListUser | null, fallback = 2015): number {
  const createdAt = Number(user?.createdAt || 0);
  if (Number.isFinite(createdAt) && createdAt > 0) {
    return new Date(createdAt * 1000).getFullYear();
  }
  return fallback;
}

/** Année la plus ancienne déduite du compte, des activités et des entrées. */
export function getFirstKnownUserYear(
  user: AniListUser | null,
  activities: ActivityItem[],
  entries: AniListEntry[]
): number {
  const candidates: number[] = [];
  const accountYear = getAccountCreationYear(user, 0);
  if (accountYear > 0) candidates.push(accountYear);

  for (const activity of activities) {
    const ts = Number(activity?.createdAt || 0);
    if (ts > 0) candidates.push(new Date(ts * 1000).getFullYear());
  }

  for (const entry of entries) {
    if (entry.updatedAt) candidates.push(new Date(entry.updatedAt * 1000).getFullYear());
    if (entry.startedAt?.year != null) candidates.push(Number(entry.startedAt.year));
    if (entry.completedAt?.year != null) candidates.push(Number(entry.completedAt.year));
  }

  const valid = candidates.filter((y) => Number.isFinite(y) && y >= 1970);
  return valid.length > 0 ? Math.min(...valid) : 2015;
}
