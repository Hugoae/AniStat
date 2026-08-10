import type { ActivityItem } from "../types/domain";

export function getActivityIds(activities: ActivityItem[]): number[] {
  return activities
    .map((activity) => Number(activity?.id || 0))
    .filter((id) => Number.isFinite(id) && id > 0);
}

export function findOrphanedActivityIds(
  existingIds: number[],
  fetchedActivities: ActivityItem[]
): number[] {
  const fetchedIds = new Set(getActivityIds(fetchedActivities));
  return existingIds.filter((id) => !fetchedIds.has(id));
}

export function replaceActivityYear(
  existingActivities: ActivityItem[],
  fetchedActivities: ActivityItem[],
  year: number
): ActivityItem[] {
  const outsideYear = existingActivities.filter((activity) => {
    const createdAt = Number(activity?.createdAt || 0);
    if (!Number.isFinite(createdAt) || createdAt <= 0) return true;
    return new Date(createdAt * 1000).getFullYear() !== year;
  });

  const seen = new Set<number>();
  return [...fetchedActivities, ...outsideYear]
    .filter((activity) => {
      const id = Number(activity?.id || 0);
      if (!Number.isFinite(id) || id <= 0) return true;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}
