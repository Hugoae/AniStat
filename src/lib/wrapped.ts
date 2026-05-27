import type { ActivityCacheByYear, ActivityItem, AniListEntry, AniListUser, RecordMediaRef } from "../types/domain";
import {
  completedInYear,
  computePeriodAnimeActivityTotals,
  computePeriodBiggestSession,
  computePeriodDeltaFromActivities,
  computePeriodLongestStreak,
  computePeriodTopTags,
  dedupeEntriesByMedia,
  getMediaIdsWithProgressInPeriod,
  mergeActivitiesForDelta,
  startedInYear,
} from "./stats";
import { computeAnimeTopStudios, computeMangaTopAuthors } from "./periodRankings";

export type WrappedHighlight = {
  label: string;
  value: string;
  detail: string;
};

export type WrappedMedia = RecordMediaRef & {
  score?: number;
};

export type WrappedSummary = {
  year: number;
  userName: string;
  avatarUrl: string | null;
  bannerImage: string | null;
  totals: {
    animeCount: number;
    mangaCount: number;
    episodes: number;
    minutes: number;
    chapters: number;
    activeDays: number;
  };
  highlights: WrappedHighlight[];
  topGenre: { name: string; count: number } | null;
  topTag: { name: string; count: number } | null;
  topStudio: { name: string; minutesWatched: number } | null;
  topAuthor: { name: string; role: string; chaptersRead: number } | null;
  topAnime: WrappedMedia | null;
  topManga: WrappedMedia | null;
  covers: WrappedMedia[];
  emptyReason: string | null;
};

type BuildWrappedSummaryArgs = {
  user: AniListUser | null;
  year: number;
  allAnime: readonly AniListEntry[];
  allManga: readonly AniListEntry[];
  animeActivityCache: ActivityCacheByYear;
  mangaActivityCache: ActivityCacheByYear;
};

function isTsInYear(activity: ActivityItem, year: number): boolean {
  const ts = Number(activity?.createdAt || 0);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return new Date(ts * 1000).getFullYear() === year;
}

function countActiveDays(activities: readonly ActivityItem[], year: number): number {
  const days = new Set<string>();
  for (const activity of activities) {
    if (!isTsInYear(activity, year)) continue;
    const d = new Date(Number(activity.createdAt || 0) * 1000);
    days.add(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
    );
  }
  return days.size;
}

function mediaTitle(entry: AniListEntry): string {
  return String(entry.media?.title?.english || entry.media?.title?.romaji || "Sans titre");
}

function toWrappedMedia(entry: AniListEntry | null | undefined): WrappedMedia | null {
  const media = entry?.media;
  const id = Number(media?.id || 0);
  if (!media || !id) return null;
  return {
    id,
    title: mediaTitle(entry),
    coverImageUrl: media.coverImage?.large || media.coverImage?.medium || null,
    coverColor: media.coverImage?.color || null,
    anilistUrl: media.siteUrl || null,
    score: Number(entry.score || 0) || undefined,
  };
}

function periodEntries(
  entries: readonly AniListEntry[],
  year: number,
  activeMediaIds: Set<number>
): AniListEntry[] {
  const filtered = entries.filter((entry) => {
    const mediaId = Number(entry.media?.id || 0);
    return (
      (mediaId > 0 && activeMediaIds.has(mediaId)) ||
      completedInYear(entry, year) ||
      startedInYear(entry, year)
    );
  });
  return dedupeEntriesByMedia(filtered).items.filter((entry) => entry.status !== "PLANNING");
}

function topScoredMedia(entries: readonly AniListEntry[]): WrappedMedia | null {
  const best = [...entries]
    .filter((entry) => Number(entry.score || 0) > 0)
    .sort((a, b) => {
      const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return Number(b.media?.averageScore || 0) - Number(a.media?.averageScore || 0);
    })[0];
  return toWrappedMedia(best);
}

function topGenreFromEntries(entries: readonly AniListEntry[]): { name: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const genre of entry.media?.genres || []) {
      const name = String(genre || "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  const first = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return first ? { name: first[0], count: first[1] } : null;
}

function formatHours(minutes: number): string {
  const hours = Math.round(Math.max(0, minutes) / 60);
  return `${hours} h`;
}

function plural(value: number, singular: string, pluralLabel: string): string {
  return `${value} ${value > 1 ? pluralLabel : singular}`;
}

export function buildWrappedSummary({
  user,
  year,
  allAnime,
  allManga,
  animeActivityCache,
  mangaActivityCache,
}: BuildWrappedSummaryArgs): WrappedSummary {
  const animeActivities = mergeActivitiesForDelta(year, animeActivityCache);
  const mangaActivities = mergeActivitiesForDelta(year, mangaActivityCache);
  const animeActiveIds = getMediaIdsWithProgressInPeriod(animeActivities, year, 0, "anime") as Set<number>;
  const mangaActiveIds = getMediaIdsWithProgressInPeriod(mangaActivities, year, 0, "manga") as Set<number>;
  const animeEntries = periodEntries(allAnime, year, animeActiveIds);
  const mangaEntries = periodEntries(allManga, year, mangaActiveIds);

  const animeTotals = computePeriodAnimeActivityTotals(animeActivities, year, 0);
  const chapters = computePeriodDeltaFromActivities(mangaActivities, year, 0, "manga");
  const activeDays = countActiveDays([...animeActivities, ...mangaActivities], year);
  const combinedEntries = [...animeEntries, ...mangaEntries];
  const topTags = computePeriodTopTags(combinedEntries);
  const topStudios = computeAnimeTopStudios(animeEntries, animeActivities, false);
  const topAuthors = computeMangaTopAuthors(mangaEntries, mangaActivities, false);
  const longestStreak = computePeriodLongestStreak([...animeActivities, ...mangaActivities], year, 0);
  const animeBiggestSession = computePeriodBiggestSession(animeActivities, year, 0, "anime");
  const mangaBiggestSession = computePeriodBiggestSession(mangaActivities, year, 0, "manga");
  const topAnime = topScoredMedia(animeEntries);
  const topManga = topScoredMedia(mangaEntries);
  const covers = [...animeEntries, ...mangaEntries]
    .filter((entry) => Number(entry.score || 0) > 0)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .map(toWrappedMedia)
    .filter((media): media is WrappedMedia => Boolean(media))
    .slice(0, 8);

  const highlights: WrappedHighlight[] = [
    {
      label: "Temps anime",
      value: formatHours(animeTotals.minutes),
      detail: `${plural(animeTotals.episodes, "episode", "episodes")} vus`,
    },
    {
      label: "Lecture manga",
      value: String(Math.max(0, Math.round(chapters))),
      detail: "chapitres lus",
    },
    {
      label: "Jours actifs",
      value: String(activeDays),
      detail: "jours avec au moins une activité",
    },
  ];

  if (longestStreak) {
    highlights.push({
      label: "Meilleure série",
      value: `${longestStreak.length} j`,
      detail:
        longestStreak.length === 1
          ? `Le ${longestStreak.startDateLabel}`
          : `Du ${longestStreak.startDateLabel} au ${longestStreak.endDateLabel}`,
    });
  }

  const biggestSession =
    (animeBiggestSession?.count || 0) >= (mangaBiggestSession?.count || 0)
      ? animeBiggestSession
        ? { ...animeBiggestSession, unit: "episodes" }
        : null
      : mangaBiggestSession
        ? { ...mangaBiggestSession, unit: "chapitres" }
        : null;
  if (biggestSession) {
    highlights.push({
      label: "Plus grosse session",
      value: String(biggestSession.count),
      detail: `${biggestSession.unit} le ${biggestSession.dateLabel}`,
    });
  }

  const emptyReason =
    animeEntries.length === 0 && mangaEntries.length === 0
      ? `Aucune activité consolidée pour ${year}. Essaie une autre année ou lance une synchronisation.`
      : null;

  return {
    year,
    userName: user?.name || "AniStat",
    avatarUrl: user?.avatar?.large || user?.avatar?.medium || null,
    bannerImage: user?.bannerImage || null,
    totals: {
      animeCount: animeEntries.length,
      mangaCount: mangaEntries.length,
      episodes: animeTotals.episodes,
      minutes: animeTotals.minutes,
      chapters,
      activeDays,
    },
    highlights: highlights.slice(0, 5),
    topGenre: topGenreFromEntries(combinedEntries),
    topTag: topTags[0] ? { name: topTags[0].name, count: topTags[0].count } : null,
    topStudio: topStudios[0]
      ? { name: topStudios[0].name, minutesWatched: topStudios[0].minutesWatched }
      : null,
    topAuthor: topAuthors[0]
      ? {
          name: topAuthors[0].name,
          role: topAuthors[0].primaryRoleLabel,
          chaptersRead: topAuthors[0].chaptersRead,
        }
      : null,
    topAnime,
    topManga,
    covers,
    emptyReason,
  };
}
