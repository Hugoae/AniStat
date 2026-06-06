import { STATUS_LABELS } from "../config/constants";
import type { ActivityItem, AniListEntry } from "../types/domain";

export type OverviewRecentActivity = {
  key: string;
  kind: "anime" | "manga";
  mediaId: number;
  coverUrl: string | null;
  /** Texte avant le lien, terminé par " de " (ex. "Lu Chapitres 135–158 de "). */
  prefix: string;
  title: string;
  mediaUrl: string;
  formattedAt: string;
  createdAt: number;
};

const ACTIVITY_SESSION_WINDOW_HOURS = 6;

type BuildOverviewRecentActivitiesArgs = {
  animeActivities: readonly ActivityItem[];
  mangaActivities: readonly ActivityItem[];
  allAnime: readonly AniListEntry[];
  allManga: readonly AniListEntry[];
  year: number;
  month: number;
  limit?: number;
};

function isTsInPeriod(ts: number, year: number, month: number): boolean {
  if (!ts) return false;
  if (year === 0) return true;
  const d = new Date(ts * 1000);
  if (d.getFullYear() !== year) return false;
  return month === 0 ? true : d.getMonth() + 1 === month;
}

function buildMediaLookup(allAnime: readonly AniListEntry[], allManga: readonly AniListEntry[]) {
  const map = new Map<number, { title: string; coverUrl: string | null }>();
  for (const entry of [...allAnime, ...allManga]) {
    const id = entry.media?.id;
    if (!id) continue;
    const title = String(entry.media.title?.english || entry.media.title?.romaji || "Sans titre");
    const coverUrl = entry.media.coverImage?.medium || entry.media.coverImage?.large || null;
    map.set(id, { title, coverUrl });
  }
  return map;
}

function formatActivityAbsoluteDate(ts: number): string {
  const d = new Date(ts * 1000);
  if (Number.isNaN(d.getTime())) return "";
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/** Verbe d'action déduit du format et du statut (rewatch / reread inclus). */
function actionVerb(kind: "anime" | "manga", status: string | null | undefined): string {
  const repeating = String(status ?? "").toUpperCase() === "REPEATING";
  if (kind === "anime") return repeating ? "Revu" : "Regardé";
  return repeating ? "Relu" : "Lu";
}

/** Libellé de progression sans verbe (ex. "Chapitres 135–158", "Épisode 3"). */
function formatProgressLabel(progressRaw: string | null | undefined, kind: "anime" | "manga"): string | null {
  const raw = String(progressRaw ?? "").trim();
  if (!raw) return null;

  const unitSingular = kind === "anime" ? "Épisode" : "Chapitre";
  const unitPlural = kind === "anime" ? "Épisodes" : "Chapitres";

  const rangeMatch = raw.match(/(\d+)\s*-\s*(\d+)/);
  if (rangeMatch) {
    const start = Math.min(Number(rangeMatch[1]), Number(rangeMatch[2]));
    const end = Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]));
    return start === end ? `${unitSingular} ${start}` : `${unitPlural} ${start}–${end}`;
  }

  const slashMatch = raw.match(/^(\d+)\s*\/\s*\d+/);
  const singleMatch = raw.match(/^(\d+)$/);
  const n = Number(slashMatch?.[1] ?? singleMatch?.[1] ?? 0);
  if (n > 0) return `${unitSingular} ${n}`;

  return null;
}

/** Construit le préfixe d'activité terminé par " de ", à coller devant le lien œuvre. */
function buildActivityPrefix(activity: ActivityItem, kind: "anime" | "manga"): string {
  const status = String(activity.status ?? "").toUpperCase();
  const progressLabel = formatProgressLabel(activity.progress, kind);

  if (progressLabel) {
    return `${actionVerb(kind, status)} ${progressLabel} de `;
  }
  if (status === "COMPLETED") {
    return "Terminé de ";
  }
  if (status && STATUS_LABELS[status]) {
    return `${STATUS_LABELS[status]} de `;
  }
  return `${actionVerb(kind, status)} de `;
}

export function buildOverviewRecentActivities({
  animeActivities,
  mangaActivities,
  allAnime,
  allManga,
  year,
  month,
  limit = 30,
}: BuildOverviewRecentActivitiesArgs): OverviewRecentActivity[] {
  const mediaLookup = buildMediaLookup(allAnime, allManga);
  const seen = new Set<string>();
  const rows: OverviewRecentActivity[] = [];

  const pushActivity = (activity: ActivityItem, kind: "anime" | "manga") => {
    const createdAt = Number(activity.createdAt || 0);
    const mediaId = activity.media?.id;
    if (!createdAt || !mediaId || !isTsInPeriod(createdAt, year, month)) return;

    const dedupeKey = activity.id != null ? `id:${activity.id}` : `t:${createdAt}:${mediaId}:${kind}`;
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);

    const media = mediaLookup.get(mediaId);
    rows.push({
      key: dedupeKey,
      kind,
      mediaId,
      coverUrl: media?.coverUrl ?? null,
      prefix: buildActivityPrefix(activity, kind),
      title: media?.title ?? "Sans titre",
      mediaUrl: `https://anilist.co/${kind}/${mediaId}`,
      formattedAt: formatActivityAbsoluteDate(createdAt),
      createdAt,
    });
  };

  for (const activity of animeActivities) pushActivity(activity, "anime");
  for (const activity of mangaActivities) pushActivity(activity, "manga");

  return rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

export function mergeRecentActivities(
  activities: readonly OverviewRecentActivity[]
): OverviewRecentActivity[] {
  const sorted = [...activities].sort((a, b) => b.createdAt - a.createdAt);
  const mergedActivities: OverviewRecentActivity[] = [];

  for (const activity of sorted) {
    const previousSameMedia = [...mergedActivities]
      .reverse()
      .find((merged) => merged.mediaId === activity.mediaId);

    if (previousSameMedia) {
      const diffHours = Math.abs(previousSameMedia.createdAt - activity.createdAt) / 3600;
      // AniList regroupe les updates d'une même œuvre dans une session de 6h :
      // la plus récente porte la progression complète, donc on masque l'ancienne.
      if (diffHours <= ACTIVITY_SESSION_WINDOW_HOURS) continue;
    }

    mergedActivities.push(activity);
  }

  return mergedActivities;
}
