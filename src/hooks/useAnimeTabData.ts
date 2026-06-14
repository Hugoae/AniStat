import { useMemo } from "react";
import {
  computePeriodAnimeActivityTotals,
  computePeriodProgressByMedia,
  computePeriodTopTags,
  computeGenreDistributionFromEntries,
  computePeriodGenreDistribution,
  computePeriodWatchEpisodesByFormat,
  computePeriodWatchMinutesByFormat,
  computePeriodWatchEpisodesByCountry,
  computePeriodWatchMinutesByCountry,
} from "../lib/stats";
import { buildAnimeHalfScoreDistributionFullRange } from "../lib/animeScoreUtils";
import { computeAnimeTopStudios } from "../lib/periodRankings";
import { entryProgressTotal } from "../lib/entryProgress";
import type { ActivityMediaBits } from "../lib/activityEnrichment";
import type { ActivityItem, AniListEntry } from "../types/domain";

type UseAnimeTabDataParams = {
  animeTabEntries: AniListEntry[];
  mergedAnimeForTabTotals: ActivityItem[];
  isAllTime: boolean;
  year: number;
  month: number;
  mediaBitsForStats: Map<number, ActivityMediaBits>;
};

/**
 * Données dérivées de l'onglet Anime sur la période courante : totaux
 * (épisodes/minutes), répartitions (tags, genres, scores, format, pays),
 * top studios et histogrammes (année de sortie, saison).
 */
export function useAnimeTabData({
  animeTabEntries,
  mergedAnimeForTabTotals,
  isAllTime,
  year,
  month,
  mediaBitsForStats,
}: UseAnimeTabDataParams) {
  const animeTabActivityTotals = useMemo(
    () => computePeriodAnimeActivityTotals(mergedAnimeForTabTotals, year, month),
    [mergedAnimeForTabTotals, year, month]
  );
  const animePeriodProgressByMedia = useMemo(
    () =>
      isAllTime
        ? new Map<number, number>()
        : computePeriodProgressByMedia(mergedAnimeForTabTotals, year, month, "anime"),
    [isAllTime, mergedAnimeForTabTotals, year, month]
  );
  const totalEpAnimeTab = useMemo(
    () =>
      isAllTime
        ? animeTabEntries.reduce((sum, entry) => sum + entryProgressTotal(entry, "anime"), 0)
        : animeTabActivityTotals.episodes,
    [animeTabActivityTotals.episodes, animeTabEntries, isAllTime]
  );
  const totalMinAnimeTab = useMemo(
    () =>
      isAllTime
        ? animeTabEntries.reduce((sum, entry) => {
            const episodes = entryProgressTotal(entry, "anime");
            const duration = Number(entry.media?.duration || 24) || 24;
            return sum + episodes * duration;
          }, 0)
        : animeTabActivityTotals.minutes,
    [animeTabActivityTotals.minutes, animeTabEntries, isAllTime]
  );

  const scoredATab = useMemo(() => animeTabEntries.filter((e) => e.score > 0), [animeTabEntries]);
  const avgA = scoredATab.length
    ? (scoredATab.reduce((s, e) => s + e.score, 0) / scoredATab.length).toFixed(1)
    : "—";

  /**
   * Dispersion (σ) des écarts note perso − moyenne AniList du média (échelle /10).
   * Mesure pure de l'amplitude typique d'un écart, indépendante du sens. La direction
   * moyenne (sur-notation / sous-notation) est lisible dans le scatter « Ta note vs AniList ».
   */
  const animeVsCommunityScoreStdDev = useMemo(() => {
    const deltas = [];
    for (const e of animeTabEntries) {
      if (e.score <= 0) continue;
      const raw = Number(e.media?.averageScore);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const meanSiteOn10 = raw / 10;
      deltas.push(e.score - meanSiteOn10);
    }
    const n = deltas.length;
    if (n < 2) return "—";
    const meanDelta = deltas.reduce((s, d) => s + d, 0) / n;
    const variance = deltas.reduce((s, d) => s + (d - meanDelta) ** 2, 0) / (n - 1);
    return Math.sqrt(variance).toFixed(2);
  }, [animeTabEntries]);

  /**
   * Top tags AniList sur la période (anime).
   *
   * Approche choisie : on compte le nombre d'œuvres de la période portant chaque tag,
   * en filtrant par défaut les spoilers (media + génériques) et les tags adultes.
   * On garde aussi le `meanRank` pour départager les égalités et calibrer l'intensité visuelle.
   */
  const animeTopTagsData = useMemo(
    () => computePeriodTopTags(animeTabEntries),
    [animeTabEntries]
  );

  /** Genres (onglet Anime) : activités de la période (ou entrées en All Time). */
  const animeGenrePeriodData = useMemo(
    () =>
      isAllTime
        ? computeGenreDistributionFromEntries(animeTabEntries)
        : computePeriodGenreDistribution(
            mergedAnimeForTabTotals,
            year,
            month,
            "anime",
            mediaBitsForStats
          ),
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month, mediaBitsForStats]
  );

  /** Répartition des scores : tranches 1 à 10 par pas de 0,5 (effectifs, y compris 0). */
  const animeScoreHalfDistributionRows = useMemo(() => {
    if (scoredATab.length === 0) return [];
    return buildAnimeHalfScoreDistributionFullRange(scoredATab);
  }, [scoredATab]);

  const animeEpisodesByFormatData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchEpisodesByFormat(mergedAnimeForTabTotals, year, month);
      const byFormat = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const key = entry.media?.format || "OTHER";
        byFormat.set(key, (byFormat.get(key) || 0) + entryProgressTotal(entry, "anime"));
      });
      return [...byFormat.entries()]
        .map(([name, episodes]) => ({ name, episodes }))
        .sort((a, b) => b.episodes - a.episodes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );
  const animeMinutesByFormatData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchMinutesByFormat(mergedAnimeForTabTotals, year, month);
      const byFormat = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const key = entry.media?.format || "OTHER";
        const minutes = entryProgressTotal(entry, "anime") * (Number(entry.media?.duration || 24) || 24);
        byFormat.set(key, (byFormat.get(key) || 0) + minutes);
      });
      return [...byFormat.entries()]
        .map(([name, minutes]) => ({ name, minutes }))
        .sort((a, b) => b.minutes - a.minutes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );
  const animeEpisodesByCountryData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchEpisodesByCountry(mergedAnimeForTabTotals, year, month);
      const byCountry = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const raw = String(entry.media?.countryOfOrigin || "").trim();
        const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
        byCountry.set(code, (byCountry.get(code) || 0) + entryProgressTotal(entry, "anime"));
      });
      return [...byCountry.entries()]
        .map(([code, episodes]) => ({ code, episodes }))
        .sort((a, b) => b.episodes - a.episodes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );
  const animeMinutesByCountryData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchMinutesByCountry(mergedAnimeForTabTotals, year, month);
      const byCountry = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const raw = String(entry.media?.countryOfOrigin || "").trim();
        const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
        const minutes = entryProgressTotal(entry, "anime") * (Number(entry.media?.duration || 24) || 24);
        byCountry.set(code, (byCountry.get(code) || 0) + minutes);
      });
      return [...byCountry.entries()]
        .map(([code, minutes]) => ({ code, minutes }))
        .sort((a, b) => b.minutes - a.minutes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );

  const animeTopStudios = useMemo(
    () => computeAnimeTopStudios(animeTabEntries, mergedAnimeForTabTotals, isAllTime),
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals]
  );

  const animeReleaseYearHistogram = useMemo(() => {
    const bins = new Map<number, number>();
    for (const entry of animeTabEntries) {
      const rawYear = entry.media?.seasonYear ?? entry.media?.startDate?.year;
      const y = Number(rawYear);
      if (!Number.isFinite(y) || y < 1900) continue;
      bins.set(y, (bins.get(y) || 0) + 1);
    }
    return [...bins.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([yearLabel, count]) => ({ yearLabel: String(yearLabel), count }));
  }, [animeTabEntries]);

  const animeSeasonHistogram = useMemo(() => {
    const labels: Record<string, string> = {
      WINTER: "Hiver",
      SPRING: "Printemps",
      SUMMER: "Été",
      FALL: "Automne",
    };
    const order = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;
    const counts: Record<string, number> = {
      WINTER: 0,
      SPRING: 0,
      SUMMER: 0,
      FALL: 0,
      UNKNOWN: 0,
    };
    for (const e of animeTabEntries) {
      const s = String(e.media?.season || "").toUpperCase();
      if (s === "WINTER" || s === "SPRING" || s === "SUMMER" || s === "FALL") counts[s]++;
      else counts.UNKNOWN++;
    }
    const out: { key: string; name: string; count: number }[] = [];
    for (const k of order) {
      if (counts[k] > 0) out.push({ key: k, name: labels[k], count: counts[k] });
    }
    if (counts.UNKNOWN > 0) {
      out.push({ key: "UNKNOWN", name: "Non renseigné", count: counts.UNKNOWN });
    }
    return out;
  }, [animeTabEntries]);

  return {
    animeTabActivityTotals,
    animePeriodProgressByMedia,
    totalEpAnimeTab,
    totalMinAnimeTab,
    avgA,
    animeVsCommunityScoreStdDev,
    animeTopTagsData,
    animeGenrePeriodData,
    animeScoreHalfDistributionRows,
    animeEpisodesByFormatData,
    animeMinutesByFormatData,
    animeEpisodesByCountryData,
    animeMinutesByCountryData,
    animeTopStudios,
    animeReleaseYearHistogram,
    animeSeasonHistogram,
  };
}
