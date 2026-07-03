import type { ActivityCacheByYear, ActivityItem, AniListEntry, AniListUser, RecordMediaRef } from "../types/domain";
import { monthsShort, type AppLang } from "../config/constants";
import { makeT, type TFunction } from "../i18n/I18n";
import {
  completedInYear,
  countActiveProgressDays,
  computeMonthlyDeltasFromActivities,
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

export type WrappedMonthlyChartRow = {
  label: string;
  current: number;
  compare: number;
};

export type WrappedStatusSummary = {
  completed: number;
  current: number;
  dropped: number;
};

export type WrappedTimelineItem = {
  media: WrappedMedia;
  dateLabel: string;
};

export type WrappedTimelinePair = {
  first: WrappedTimelineItem | null;
  last: WrappedTimelineItem | null;
};

export type WrappedGenreRow = {
  name: string;
  count: number;
  percent: number;
};

export type WrappedSummary = {
  year: number;
  compareYear: number;
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
    averageAnimeScore: number | null;
    averageMangaScore: number | null;
    animeStatus: WrappedStatusSummary;
    mangaStatus: WrappedStatusSummary;
  };
  highlights: WrappedHighlight[];
  topGenre: { name: string; count: number } | null;
  topTag: { name: string; count: number } | null;
  topStudio: { name: string; minutesWatched: number } | null;
  topAuthor: { name: string; role: string; chaptersRead: number } | null;
  topAnime: WrappedMedia | null;
  topManga: WrappedMedia | null;
  topAnimeList: WrappedMedia[];
  topMangaList: WrappedMedia[];
  covers: WrappedMedia[];
  mangaChaptersChartData: WrappedMonthlyChartRow[];
  animeEpisodesChartData: WrappedMonthlyChartRow[];
  activityTimeline: WrappedTimelinePair;
  newSeriesTimeline: WrappedTimelinePair;
  genreChartData: WrappedGenreRow[];
  emptyReason: string | null;
};

type BuildWrappedSummaryArgs = {
  user: AniListUser | null;
  year: number;
  allAnime: readonly AniListEntry[];
  allManga: readonly AniListEntry[];
  animeActivityCache: ActivityCacheByYear;
  mangaActivityCache: ActivityCacheByYear;
  lang?: AppLang;
};

function isTsInYear(activity: ActivityItem, year: number): boolean {
  const ts = Number(activity?.createdAt || 0);
  if (!Number.isFinite(ts) || ts <= 0) return false;
  return new Date(ts * 1000).getFullYear() === year;
}

function mediaTitle(entry: AniListEntry): string {
  return String(entry.media?.title?.english || entry.media?.title?.romaji || "Sans titre");
}

function mediaRefTitle(media: { title?: { english?: string | null; romaji?: string | null } } | null | undefined): string {
  return String(media?.title?.english || media?.title?.romaji || "Sans titre");
}

function toWrappedMediaFromMedia(
  media: ActivityItem["media"] | null | undefined,
  fallbackByMediaId?: Map<number, WrappedMedia>
): WrappedMedia | null {
  const id = Number(media?.id || 0);
  if (!media || !id) return null;
  const fallback = fallbackByMediaId?.get(id);
  return {
    id,
    title: mediaRefTitle(media) || fallback?.title || "Sans titre",
    coverImageUrl: media.coverImage?.large || media.coverImage?.medium || fallback?.coverImageUrl || null,
    coverColor: media.coverImage?.color || fallback?.coverColor || null,
    anilistUrl: media.siteUrl || fallback?.anilistUrl || null,
  };
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

/**
 * Classement d'un ensemble d'entrées pour un « Top » : d'abord les œuvres notées
 * (note perso décroissante, départage par moyenne AniList), puis, si besoin de
 * compléter, les œuvres non notées par moyenne AniList décroissante.
 */
function rankMediaForTop(entries: readonly AniListEntry[]): AniListEntry[] {
  const scored = entries
    .filter((entry) => Number(entry.score || 0) > 0)
    .sort((a, b) => {
      const scoreDelta = Number(b.score || 0) - Number(a.score || 0);
      if (scoreDelta !== 0) return scoreDelta;
      return Number(b.media?.averageScore || 0) - Number(a.media?.averageScore || 0);
    });
  const rest = entries
    .filter((entry) => Number(entry.score || 0) <= 0)
    .sort((a, b) => Number(b.media?.averageScore || 0) - Number(a.media?.averageScore || 0));
  return [...scored, ...rest];
}

function topMediaList(entries: readonly AniListEntry[], max: number): WrappedMedia[] {
  return rankMediaForTop(entries)
    .map(toWrappedMedia)
    .filter((media): media is WrappedMedia => Boolean(media))
    .slice(0, max);
}

function averageScore(entries: readonly AniListEntry[]): number | null {
  const scored = entries.filter((entry) => Number(entry.score || 0) > 0);
  if (scored.length === 0) return null;
  const sum = scored.reduce((acc, entry) => acc + Number(entry.score || 0), 0);
  return sum / scored.length;
}

function statusSummary(entries: readonly AniListEntry[]): WrappedStatusSummary {
  return entries.reduce<WrappedStatusSummary>(
    (acc, entry) => {
      if (entry.status === "COMPLETED") acc.completed += 1;
      if (entry.status === "CURRENT" || entry.status === "REPEATING") acc.current += 1;
      if (entry.status === "DROPPED") acc.dropped += 1;
      return acc;
    },
    { completed: 0, current: 0, dropped: 0 }
  );
}

function formatShortDate(date: Date, lang: AppLang = "fr"): string {
  return date.toLocaleDateString(lang === "en" ? "en-US" : "fr-FR", { day: "2-digit", month: "short" });
}

function dateFromEntryDate(value: AniListEntry["startedAt"]): Date | null {
  const year = Number(value?.year || 0);
  const month = Number(value?.month || 0);
  const day = Number(value?.day || 0);
  if (year <= 0 || month <= 0 || day <= 0) return null;
  return new Date(year, month - 1, day);
}

function buildMediaLookup(entries: readonly AniListEntry[]): Map<number, WrappedMedia> {
  const out = new Map<number, WrappedMedia>();
  for (const entry of entries) {
    const media = toWrappedMedia(entry);
    if (media) out.set(media.id, media);
  }
  return out;
}

function buildActivityTimeline(
  activities: readonly ActivityItem[],
  year: number,
  fallbackByMediaId: Map<number, WrappedMedia>,
  lang: AppLang = "fr"
): WrappedTimelinePair {
  const items = activities
    .filter((activity) => isTsInYear(activity, year))
    .map((activity) => {
      const media = toWrappedMediaFromMedia(activity.media, fallbackByMediaId);
      const ts = Number(activity.createdAt || 0);
      if (!media || !Number.isFinite(ts) || ts <= 0) return null;
      const date = new Date(ts * 1000);
      return { media, date, dateLabel: formatShortDate(date, lang) };
    })
    .filter((item): item is { media: WrappedMedia; date: Date; dateLabel: string } => Boolean(item))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    first: items[0] ? { media: items[0].media, dateLabel: items[0].dateLabel } : null,
    last: items.at(-1) ? { media: items.at(-1)!.media, dateLabel: items.at(-1)!.dateLabel } : null,
  };
}

function buildNewSeriesTimeline(
  entries: readonly AniListEntry[],
  year: number,
  lang: AppLang = "fr"
): WrappedTimelinePair {
  const items = entries
    .map((entry) => {
      const date = dateFromEntryDate(entry.startedAt);
      const media = toWrappedMedia(entry);
      if (!date || date.getFullYear() !== year || !media) return null;
      return { media, date, dateLabel: formatShortDate(date, lang) };
    })
    .filter((item): item is { media: WrappedMedia; date: Date; dateLabel: string } => Boolean(item))
    .sort((a, b) => a.date.getTime() - b.date.getTime());

  return {
    first: items[0] ? { media: items[0].media, dateLabel: items[0].dateLabel } : null,
    last: items.at(-1) ? { media: items.at(-1)!.media, dateLabel: items.at(-1)!.dateLabel } : null,
  };
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

function genreRowsFromEntries(entries: readonly AniListEntry[], max = 10): WrappedGenreRow[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const genre of entry.media?.genres || []) {
      const name = String(genre || "").trim();
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    }
  }
  const total = Math.max(1, entries.length);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, max)
    .map(([name, count]) => ({
      name,
      count,
      percent: (count / total) * 100,
    }));
}

function formatHours(minutes: number): string {
  const hours = Math.round(Math.max(0, minutes) / 60);
  return `${hours} h`;
}

function buildWrappedMonthlyChartData(
  year: number,
  activityCache: ActivityCacheByYear,
  kind: "anime" | "manga",
  lang: AppLang = "fr"
): WrappedMonthlyChartRow[] {
  const compareYear = year - 1;
  const cur = mergeActivitiesForDelta(year, activityCache);
  const comp = mergeActivitiesForDelta(compareYear, activityCache);
  const curM = computeMonthlyDeltasFromActivities(cur, year, kind);
  const compM = computeMonthlyDeltasFromActivities(comp, compareYear, kind);

  return monthsShort(lang).map((name, index) => {
    const month = index + 1;
    return {
      label: name,
      current: curM[month] || 0,
      compare: compM[month] || 0,
    };
  });
}

export function buildWrappedSummary({
  user,
  year,
  allAnime,
  allManga,
  animeActivityCache,
  mangaActivityCache,
  lang = "fr",
}: BuildWrappedSummaryArgs): WrappedSummary {
  const t: TFunction = makeT(lang);
  const animeActivities = mergeActivitiesForDelta(year, animeActivityCache);
  const mangaActivities = mergeActivitiesForDelta(year, mangaActivityCache);
  const animeActiveIds = getMediaIdsWithProgressInPeriod(animeActivities, year, 0, "anime") as Set<number>;
  const mangaActiveIds = getMediaIdsWithProgressInPeriod(mangaActivities, year, 0, "manga") as Set<number>;
  const animeEntries = periodEntries(allAnime, year, animeActiveIds);
  const mangaEntries = periodEntries(allManga, year, mangaActiveIds);

  /**
   * Totaux « épisodes / minutes / chapitres » : on filtre les activités aux
   * médias présents dans les entrées de la période, exactement comme l'overview
   * (`mergedAnimeForTabTotals`). Cela garantit des chiffres identiques entre la
   * carte « Épisodes vus » de l'overview et le wrapped, et cohérents avec les
   * entrées affichées.
   */
  const animeEntryMediaIds = new Set(
    animeEntries.map((e) => Number(e.media?.id || 0)).filter((id) => id > 0)
  );
  const mangaEntryMediaIds = new Set(
    mangaEntries.map((e) => Number(e.media?.id || 0)).filter((id) => id > 0)
  );
  const animeActivitiesForTotals = animeActivities.filter((a) =>
    animeEntryMediaIds.has(Number(a?.media?.id || 0))
  );
  const mangaActivitiesForTotals = mangaActivities.filter((a) =>
    mangaEntryMediaIds.has(Number(a?.media?.id || 0))
  );

  const animeTotals = computePeriodAnimeActivityTotals(animeActivitiesForTotals, year, 0);
  const chapters = computePeriodDeltaFromActivities(mangaActivitiesForTotals, year, 0, "manga");
  const activeDays = countActiveProgressDays(animeActivities, mangaActivities, year, 0);
  const combinedEntries = [...animeEntries, ...mangaEntries];
  const topTags = computePeriodTopTags(combinedEntries);
  const topStudios = computeAnimeTopStudios(animeEntries, animeActivities, false);
  const topAuthors = computeMangaTopAuthors(mangaEntries, mangaActivities, false);
  const longestStreak = computePeriodLongestStreak([...animeActivities, ...mangaActivities], year, 0);
  const animeBiggestSession = computePeriodBiggestSession(animeActivities, year, 0, "anime");
  const mangaBiggestSession = computePeriodBiggestSession(mangaActivities, year, 0, "manga");
  const topAnimeList = topMediaList(animeEntries, 5);
  const topMangaList = topMediaList(mangaEntries, 5);
  const topAnime = topAnimeList[0] ?? null;
  const topManga = topMangaList[0] ?? null;
  const covers = [...animeEntries, ...mangaEntries]
    .filter((entry) => Number(entry.score || 0) > 0)
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .map(toWrappedMedia)
    .filter((media): media is WrappedMedia => Boolean(media))
    .slice(0, 8);

  const episodesCount = animeTotals.episodes;
  const highlights: WrappedHighlight[] = [
    {
      label: t("Temps anime", "Anime time"),
      value: formatHours(animeTotals.minutes),
      detail: t(
        `${episodesCount} ${episodesCount > 1 ? "episodes" : "episode"} vus`,
        `${episodesCount} ${episodesCount > 1 ? "episodes" : "episode"} watched`
      ),
    },
    {
      label: t("Lecture manga", "Manga reading"),
      value: String(Math.max(0, Math.round(chapters))),
      detail: t("chapitres lus", "chapters read"),
    },
    {
      label: t("Jours actifs", "Active days"),
      value: String(activeDays),
      detail: t("jours avec des épisodes ou chapitres", "days with episodes or chapters"),
    },
  ];

  if (longestStreak) {
    highlights.push({
      label: t("Meilleure série", "Best streak"),
      value: t(`${longestStreak.length} j`, `${longestStreak.length} d`),
      detail:
        longestStreak.length === 1
          ? t(`Le ${longestStreak.startDateLabel}`, `On ${longestStreak.startDateLabel}`)
          : t(
              `Du ${longestStreak.startDateLabel} au ${longestStreak.endDateLabel}`,
              `From ${longestStreak.startDateLabel} to ${longestStreak.endDateLabel}`
            ),
    });
  }

  const biggestSession =
    (animeBiggestSession?.count || 0) >= (mangaBiggestSession?.count || 0)
      ? animeBiggestSession
        ? { ...animeBiggestSession, unit: t("episodes", "episodes") }
        : null
      : mangaBiggestSession
        ? { ...mangaBiggestSession, unit: t("chapitres", "chapters") }
        : null;
  if (biggestSession) {
    highlights.push({
      label: t("Plus grosse session", "Biggest session"),
      value: String(biggestSession.count),
      detail: t(
        `${biggestSession.unit} le ${biggestSession.dateLabel}`,
        `${biggestSession.unit} on ${biggestSession.dateLabel}`
      ),
    });
  }

  const emptyReason =
    animeEntries.length === 0 && mangaEntries.length === 0
      ? t(
          `Aucune activité consolidée pour ${year}. Essaie une autre année ou lance une synchronisation.`,
          `No consolidated activity for ${year}. Try another year or run a sync.`
        )
      : null;

  const compareYear = year - 1;
  const mangaChaptersChartData = buildWrappedMonthlyChartData(year, mangaActivityCache, "manga", lang);
  const animeEpisodesChartData = buildWrappedMonthlyChartData(year, animeActivityCache, "anime", lang);
  const activityTimeline = buildActivityTimeline(
    [...animeActivities, ...mangaActivities],
    year,
    buildMediaLookup(combinedEntries),
    lang
  );
  const newSeriesTimeline = buildNewSeriesTimeline(combinedEntries, year, lang);
  const genreChartData = genreRowsFromEntries(combinedEntries);

  return {
    year,
    compareYear,
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
      averageAnimeScore: averageScore(animeEntries),
      averageMangaScore: averageScore(mangaEntries),
      animeStatus: statusSummary(animeEntries),
      mangaStatus: statusSummary(mangaEntries),
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
    topAnimeList,
    topMangaList,
    covers,
    mangaChaptersChartData,
    animeEpisodesChartData,
    activityTimeline,
    newSeriesTimeline,
    genreChartData,
    emptyReason,
  };
}
