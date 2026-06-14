import { useCallback, useMemo } from "react";
import {
  computePeriodBiggestSession,
  computePeriodLongestStreak,
  findPeriodLongestCompleted,
  findPeriodHighestScore,
  findPeriodLowestScore,
  findPeriodFirstStarted,
  findPeriodLastStarted,
  findPeriodFirstActivity,
  findPeriodLastActivity,
  findPeriodFastestCompleted,
  collectPeriodWorksStartedEntries,
  collectPeriodWorksCompletedEntries,
  pickSpotlightEntriesFromWorks,
} from "../lib/stats";
import type { ActivityItem, AniListEntry } from "../types/domain";

type UseProfileRecordsParams = {
  year: number;
  month: number;
  animeTabEntries: AniListEntry[];
  mergedAnimeForTabTotals: ActivityItem[];
  animePlanningEntries: AniListEntry[];
  mangaTabEntries: AniListEntry[];
  mergedMangaForTabTotals: ActivityItem[];
  mangaPlanningEntries: AniListEntry[];
};

/**
 * Calcule les bundles « records / faits marquants » de la période courante
 * pour les onglets Anime et Manga. Un record est un superlatif (meilleur
 * score, plus longue œuvre, plus grande session…) présenté dans un template
 * commun par la carrousel de records.
 */
export function useProfileRecords({
  year,
  month,
  animeTabEntries,
  mergedAnimeForTabTotals,
  animePlanningEntries,
  mangaTabEntries,
  mergedMangaForTabTotals,
  mangaPlanningEntries,
}: UseProfileRecordsParams) {
  /**
   * Transforme une entrée AniList en référence minimale (id, titre, cover)
   * pour l'affichage dans une card de record. Renvoie `null` si l'entrée
   * n'a pas d'id utilisable, auquel cas le record est ignoré.
   */
  const buildRecordMediaRef = useCallback((entry: AniListEntry | undefined | null) => {
    if (!entry?.media?.id) return null;
    const media = entry.media;
    const title = String(media.title?.english || media.title?.romaji || "Sans titre");
    return {
      id: media.id,
      title,
      coverImageUrl: media.coverImage?.large || media.coverImage?.medium || null,
      coverColor: media.coverImage?.color || null,
      anilistUrl: media.siteUrl || null,
    };
  }, []);

  const findBiggestOpinionGapRecord = useCallback(
    (entries: AniListEntry[]) => {
      let bestEntry: AniListEntry | null = null;
      let bestGap = 0;
      let bestUserScore = 0;
      let bestAverageScore = 0;
      for (const entry of entries) {
        const userScore = Number(entry.score || 0);
        const averageScore = Number(entry.media?.averageScore || 0) / 10;
        if (!Number.isFinite(userScore) || !Number.isFinite(averageScore) || userScore <= 0 || averageScore <= 0) {
          continue;
        }
        const gap = Math.abs(userScore - averageScore);
        if (gap > bestGap) {
          bestEntry = entry;
          bestGap = gap;
          bestUserScore = userScore;
          bestAverageScore = averageScore;
        }
      }
      if (!bestEntry || bestGap <= 0) return null;
      const media = buildRecordMediaRef(bestEntry);
      return media ? { media, gap: bestGap, userScore: bestUserScore, averageScore: bestAverageScore } : null;
    },
    [buildRecordMediaRef]
  );

  const findMostPromisingPlannedRecord = useCallback(
    (entries: AniListEntry[]) => {
      let bestEntry: AniListEntry | null = null;
      let bestAverageScore = 0;
      for (const entry of entries) {
        const averageScore = Number(entry.media?.averageScore || 0);
        if (!Number.isFinite(averageScore) || averageScore <= 0) continue;
        if (averageScore > bestAverageScore) {
          bestEntry = entry;
          bestAverageScore = averageScore;
        }
      }
      if (!bestEntry) return null;
      const media = buildRecordMediaRef(bestEntry);
      return media ? { media, averageScore: bestAverageScore / 10 } : null;
    },
    [buildRecordMediaRef]
  );

  const buildPeriodRecordsBundle = useCallback(
    (
      entries: AniListEntry[],
      activities: ActivityItem[],
      kind: "anime" | "manga",
      planningEntries: AniListEntry[]
    ) => {
      const entryByMediaId = new Map<number, AniListEntry>();
      for (const entry of entries) {
        const mediaId = Number(entry?.media?.id || 0);
        if (mediaId > 0 && !entryByMediaId.has(mediaId)) entryByMediaId.set(mediaId, entry);
      }
      const biggest = computePeriodBiggestSession(activities, year, month, kind);
      const streak = computePeriodLongestStreak(activities, year, month);
      const longest = findPeriodLongestCompleted(entries, year, month, kind);
      const high = findPeriodHighestScore(entries);
      const low = findPeriodLowestScore(entries);
      const first = findPeriodFirstStarted(entries, year, month);
      const last = findPeriodLastStarted(entries, year, month);
      // Premier / dernier de la période « toutes activités confondues » :
      // on balaie les activités brutes, pas les entrées (une session de lecture
      // sur un manga déjà en cours compte, là où `firstStarted` ne retenait
      // que les nouvelles séries).
      const firstAct = findPeriodFirstActivity(activities, year, month);
      const lastAct = findPeriodLastActivity(activities, year, month);
      const fast = findPeriodFastestCompleted(entries, year, month);
      const opinionGap = findBiggestOpinionGapRecord(entries);
      const promisingPlanned = findMostPromisingPlannedRecord(planningEntries);
      const startedWorks = collectPeriodWorksStartedEntries(entries, year, month);
      const completedWorks = collectPeriodWorksCompletedEntries(entries, year, month);
      const spotlightStarted = pickSpotlightEntriesFromWorks(startedWorks, 3)
        .map((e) => buildRecordMediaRef(e))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      const spotlightCompleted = pickSpotlightEntriesFromWorks(completedWorks, 3)
        .map((e) => buildRecordMediaRef(e))
        .filter((m): m is NonNullable<typeof m> => Boolean(m));
      const wrap = <T extends { entry: AniListEntry }>(r: T | null) => {
        if (!r) return null;
        const m = buildRecordMediaRef(r.entry);
        return m ? { ...r, media: m } : null;
      };
      // Les activités portent leur `media` au même format qu'une entry, mais
      // pas dans `r.entry` : on adapte en synthétisant une mini-entry pour
      // réutiliser `buildRecordMediaRef` sans duplication.
      const wrapActivity = <T extends { activity: ActivityItem }>(r: T | null) => {
        if (!r) return null;
        const mediaId = Number(r.activity.media?.id || 0);
        if (!mediaId) return null;
        const entry = entryByMediaId.get(mediaId);
        const activityMedia = r.activity.media;
        const media =
          entry?.media && (entry.media.title?.romaji || entry.media.title?.english || entry.media.coverImage?.large)
            ? entry.media
            : activityMedia;
        const m = buildRecordMediaRef({ id: mediaId, media } as AniListEntry);
        return m ? { ...r, media: m } : null;
      };
      const longestM = wrap(longest);
      const highM = wrap(high);
      const lowM = wrap(low);
      const firstM = wrap(first);
      const lastM = wrap(last);
      const firstActM = wrapActivity(firstAct);
      const lastActM = wrapActivity(lastAct);
      const fastM = wrap(fast);
      return {
        biggestSession: biggest,
        longestStreak: streak,
        longestCompleted: longestM ? { media: longestM.media, count: longestM.count } : null,
        highestScore: highM ? { media: highM.media, score: highM.score } : null,
        lowestScore: lowM ? { media: lowM.media, score: lowM.score } : null,
        firstStarted: firstM ? { media: firstM.media, dateLabel: firstM.dateLabel } : null,
        lastStarted: lastM ? { media: lastM.media, dateLabel: lastM.dateLabel } : null,
        firstActivity: firstActM ? { media: firstActM.media, dateLabel: firstActM.dateLabel } : null,
        lastActivity: lastActM ? { media: lastActM.media, dateLabel: lastActM.dateLabel } : null,
        fastestCompleted: fastM ? { media: fastM.media, days: fastM.days } : null,
        biggestOpinionGap: opinionGap,
        mostPromisingPlanned: promisingPlanned,
        worksStartedInPeriod:
          startedWorks.length > 0 ? { count: startedWorks.length, spotlight: spotlightStarted } : null,
        worksCompletedInPeriod:
          completedWorks.length > 0
            ? { count: completedWorks.length, spotlight: spotlightCompleted }
            : null,
      };
    },
    [
      year,
      month,
      buildRecordMediaRef,
      findBiggestOpinionGapRecord,
      findMostPromisingPlannedRecord,
    ]
  );

  const animeRecordsData = useMemo(
    () => buildPeriodRecordsBundle(animeTabEntries, mergedAnimeForTabTotals, "anime", animePlanningEntries),
    [animeTabEntries, mergedAnimeForTabTotals, animePlanningEntries, buildPeriodRecordsBundle]
  );

  const mangaRecordsData = useMemo(
    () => buildPeriodRecordsBundle(mangaTabEntries, mergedMangaForTabTotals, "manga", mangaPlanningEntries),
    [mangaTabEntries, mergedMangaForTabTotals, mangaPlanningEntries, buildPeriodRecordsBundle]
  );

  return { animeRecordsData, mangaRecordsData };
}
