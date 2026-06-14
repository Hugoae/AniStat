import { useMemo } from "react";
import { MONTHS } from "../config/constants";
import {
  computePeriodDeltaFromActivities,
  computePeriodAnimeActivityTotals,
  computeMonthlyDeltasFromActivities,
  computeDailyDeltasInMonth,
  mergeActivitiesForDelta,
} from "../lib/stats";
import { getFirstActivityYear } from "../lib/accountYears";
import type { ActivityCacheByYear, ActivityItem, AniListEntry } from "../types/domain";

type OverviewCompareResolution = {
  compareY: number;
  compareM: number | null;
};

type UseOverviewDataParams = {
  isAllTime: boolean;
  year: number;
  month: number;
  mergedAnimeForTotals: ActivityItem[];
  mergedMangaForTotals: ActivityItem[];
  mergedAnimeForTabTotals: ActivityItem[];
  mergedMangaForTabTotals: ActivityItem[];
  effectiveAnimeActivityCache: ActivityCacheByYear;
  effectiveMangaActivityCache: ActivityCacheByYear;
  resolvedOverviewCompare: OverviewCompareResolution;
  animeTabEntries: AniListEntry[];
  mangaTabEntries: AniListEntry[];
  animePlanningEntries: AniListEntry[];
  mangaPlanningEntries: AniListEntry[];
};

/**
 * Données dérivées (pures) de la vue d'ensemble : séries temporelles des
 * graphiques « courbes N vs comparaison », et répartitions statut / format /
 * pays pour anime et manga. La machinerie de sélection de période de
 * comparaison (état + effets) reste dans `App`, ses valeurs résolues étant
 * passées en entrée.
 */
export function useOverviewData({
  isAllTime,
  year,
  month,
  mergedAnimeForTotals,
  mergedMangaForTotals,
  mergedAnimeForTabTotals,
  mergedMangaForTabTotals,
  effectiveAnimeActivityCache,
  effectiveMangaActivityCache,
  resolvedOverviewCompare,
  animeTabEntries,
  mangaTabEntries,
  animePlanningEntries,
  mangaPlanningEntries,
}: UseOverviewDataParams) {
  const allTimeActivityYears = useMemo(() => {
    if (!isAllTime) return [];
    const firstYear = getFirstActivityYear([...mergedAnimeForTotals, ...mergedMangaForTotals]);
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i);
  }, [isAllTime, mergedAnimeForTotals, mergedMangaForTotals]);

  /* ─── Séries temporelles pour les graphiques « courbes N vs comparaison » ─
   * La période de comparaison est choisie sur l’Overview (Supabase uniquement). */
  const mangaChaptersChartData = useMemo(() => {
    if (isAllTime) {
      return allTimeActivityYears.map((activityYear) => ({
        label: String(activityYear),
        current: computePeriodDeltaFromActivities(mergedMangaForTabTotals, activityYear, 0, "manga"),
        compare: 0,
      }));
    }
    const compareY = resolvedOverviewCompare.compareY;
    const compareM = resolvedOverviewCompare.compareM;
    const mergedCur = mergeActivitiesForDelta(year, effectiveMangaActivityCache);
    const mergedComp = mergeActivitiesForDelta(compareY, effectiveMangaActivityCache);

    if (month === 0) {
      const curM = computeMonthlyDeltasFromActivities(mergedCur, year, "manga");
      const prevM = computeMonthlyDeltasFromActivities(mergedComp, compareY, "manga");
      return MONTHS.map((name, i) => ({
        label: name,
        current: curM[i + 1] || 0,
        compare: prevM[i + 1] || 0,
      }));
    }
    const curD = computeDailyDeltasInMonth(mergedCur, year, month, "manga");
    const compD = computeDailyDeltasInMonth(mergedComp, compareY, compareM ?? 1, "manga");
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = i + 1;
      return {
        label: String(d),
        current: curD[d] || 0,
        compare: compD[d] || 0,
      };
    });
  }, [
    allTimeActivityYears,
    isAllTime,
    year,
    month,
    resolvedOverviewCompare.compareY,
    resolvedOverviewCompare.compareM,
    effectiveMangaActivityCache,
    mergedMangaForTabTotals,
  ]);

  const animeEpisodesChartData = useMemo(() => {
    if (isAllTime) {
      return allTimeActivityYears.map((activityYear) => ({
        label: String(activityYear),
        current: computePeriodAnimeActivityTotals(mergedAnimeForTabTotals, activityYear, 0).episodes,
        compare: 0,
      }));
    }
    const compareY = resolvedOverviewCompare.compareY;
    const compareM = resolvedOverviewCompare.compareM;
    const mergedCur = mergeActivitiesForDelta(year, effectiveAnimeActivityCache);
    const mergedComp = mergeActivitiesForDelta(compareY, effectiveAnimeActivityCache);

    if (month === 0) {
      const curM = computeMonthlyDeltasFromActivities(mergedCur, year, "anime");
      const prevM = computeMonthlyDeltasFromActivities(mergedComp, compareY, "anime");
      return MONTHS.map((name, i) => ({
        label: name,
        current: curM[i + 1] || 0,
        compare: prevM[i + 1] || 0,
      }));
    }
    const curD = computeDailyDeltasInMonth(mergedCur, year, month, "anime");
    const compD = computeDailyDeltasInMonth(mergedComp, compareY, compareM ?? 1, "anime");
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = i + 1;
      return {
        label: String(d),
        current: curD[d] || 0,
        compare: compD[d] || 0,
      };
    });
  }, [
    allTimeActivityYears,
    isAllTime,
    year,
    month,
    resolvedOverviewCompare.compareY,
    resolvedOverviewCompare.compareM,
    effectiveAnimeActivityCache,
    mergedAnimeForTabTotals,
  ]);
  const overviewCompareHasAnyData = useMemo(
    () => mangaChaptersChartData.some((row) => row.compare > 0) || animeEpisodesChartData.some((row) => row.compare > 0),
    [mangaChaptersChartData, animeEpisodesChartData]
  );

  const fmtData = useMemo(() => {
    const fmtCount: Record<string, number> = {};
    animeTabEntries.forEach((e) => {
      const f = e.media?.format || "OTHER";
      fmtCount[f] = (fmtCount[f] || 0) + 1;
    });
    return Object.entries(fmtCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [animeTabEntries]);

  const statusCntA = useMemo(() => {
    const counts: Record<string, number> = {};
    animeTabEntries.forEach((e) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    if (animePlanningEntries.length > 0) counts.PLANNING = animePlanningEntries.length;
    return counts;
  }, [animeTabEntries, animePlanningEntries]);
  const animeStatusEntriesOrdered = useMemo(() => {
    const order = ["COMPLETED", "CURRENT", "PAUSED", "DROPPED", "REPEATING", "PLANNING"];
    return Object.entries(statusCntA).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [statusCntA]);

  const animeCountryEntriesOrdered = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of animeTabEntries) {
      const raw = e.media?.countryOfOrigin;
      const code =
        raw != null && String(raw).trim() !== "" && /^[A-Za-z]{2}$/.test(String(raw).trim())
          ? String(raw).trim().toUpperCase()
          : "__UNKNOWN__";
      counts[code] = (counts[code] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [animeTabEntries]);
  const statusCntM = useMemo(() => {
    const counts: Record<string, number> = {};
    mangaTabEntries.forEach((e) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    if (mangaPlanningEntries.length > 0) counts.PLANNING = mangaPlanningEntries.length;
    return counts;
  }, [mangaTabEntries, mangaPlanningEntries]);
  const mangaStatusEntriesOrdered = useMemo(() => {
    const order = ["COMPLETED", "CURRENT", "PAUSED", "DROPPED", "REPEATING", "PLANNING"];
    return Object.entries(statusCntM).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [statusCntM]);

  const mangaCountryEntriesOrdered = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of mangaTabEntries) {
      const raw = e.media?.countryOfOrigin;
      const code =
        raw != null && String(raw).trim() !== "" && /^[A-Za-z]{2}$/.test(String(raw).trim())
          ? String(raw).trim().toUpperCase()
          : "__UNKNOWN__";
      counts[code] = (counts[code] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [mangaTabEntries]);

  const mangaFmtData = useMemo(() => {
    const fmtCount: Record<string, number> = {};
    mangaTabEntries.forEach((e) => {
      const f = e.media?.format || "OTHER";
      fmtCount[f] = (fmtCount[f] || 0) + 1;
    });
    return Object.entries(fmtCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [mangaTabEntries]);

  return {
    allTimeActivityYears,
    mangaChaptersChartData,
    animeEpisodesChartData,
    overviewCompareHasAnyData,
    fmtData,
    statusCntA,
    animeStatusEntriesOrdered,
    animeCountryEntriesOrdered,
    statusCntM,
    mangaStatusEntriesOrdered,
    mangaCountryEntriesOrdered,
    mangaFmtData,
  };
}
