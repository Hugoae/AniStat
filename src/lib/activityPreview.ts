import type { ActivityItem } from "../types/domain";

/** Nombre de jours calendaires distincts couverts par des activités passées. */
export function countActivityDays(activities: ActivityItem[]): number {
  const today = Date.now();
  const days = new Set<string>();
  activities.forEach((activity) => {
    const ts = Number(activity?.createdAt || 0);
    if (!ts) return;
    const ms = ts * 1000;
    if (ms > today) return;
    const d = new Date(ms);
    days.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  });
  return days.size;
}

/** Fusionne et dédoublonne des lots d'activités (par année) pour l'aperçu. */
export function mergeActivityRowsForPreview(rowsByYear: Array<ActivityItem[] | undefined>): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  rowsByYear.forEach((rows) => {
    (rows || []).forEach((item) => {
      if (!item) return;
      const key = item.id != null ? `id:${item.id}` : `t:${item.createdAt}:${item.media?.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
  });
  return out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}
