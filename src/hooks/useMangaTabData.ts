import { useMemo } from "react";
import {
  computePeriodProgressByMedia,
  computePeriodDeltaFromActivities,
  computePeriodTopTags,
  computeGenreDistributionFromEntries,
  computePeriodGenreDistribution,
  computePeriodReadChaptersByFormat,
  computePeriodReadChaptersByCountry,
} from "../lib/stats";
import { buildAnimeHalfScoreDistributionFullRange } from "../lib/animeScoreUtils";
import { computeMangaTopAuthors } from "../lib/periodRankings";
import { entryProgressTotal } from "../lib/entryProgress";
import type { ActivityMediaBits } from "../lib/activityEnrichment";
import type { ActivityItem, AniListEntry } from "../types/domain";

type UseMangaTabDataParams = {
  mangaTabEntries: AniListEntry[];
  mergedMangaForTabTotals: ActivityItem[];
  isAllTime: boolean;
  year: number;
  month: number;
  mediaBitsForStats: Map<number, ActivityMediaBits>;
};

/**
 * Données dérivées de l'onglet Manga sur la période courante : totaux
 * (chapitres/volumes), répartitions (tags, genres, scores, format, pays),
 * top auteurs et histogramme d'année de sortie.
 */
export function useMangaTabData({
  mangaTabEntries,
  mergedMangaForTabTotals,
  isAllTime,
  year,
  month,
  mediaBitsForStats,
}: UseMangaTabDataParams) {
  const mangaPeriodProgressByMedia = useMemo(
    () =>
      isAllTime
        ? new Map<number, number>()
        : computePeriodProgressByMedia(mergedMangaForTabTotals, year, month, "manga"),
    [isAllTime, mergedMangaForTabTotals, year, month]
  );
  const totalChMangaTab = useMemo(
    () =>
      isAllTime
        ? mangaTabEntries.reduce((sum, entry) => sum + entryProgressTotal(entry, "manga"), 0)
        : computePeriodDeltaFromActivities(mergedMangaForTabTotals, year, month, "manga"),
    [isAllTime, mangaTabEntries, mergedMangaForTabTotals, year, month]
  );
  const totalVol = useMemo(
    () => mangaTabEntries.reduce((s, e) => s + (e.progressVolumes || 0), 0),
    [mangaTabEntries]
  );

  const scoredMTab = useMemo(() => mangaTabEntries.filter((e) => e.score > 0), [mangaTabEntries]);
  const avgM = scoredMTab.length
    ? (scoredMTab.reduce((s, e) => s + e.score, 0) / scoredMTab.length).toFixed(1)
    : "—";

  /** Top tags AniList sur la période (manga). Mêmes filtres par défaut que côté anime. */
  const mangaTopTagsData = useMemo(
    () => computePeriodTopTags(mangaTabEntries),
    [mangaTabEntries]
  );

  /** Genres (onglet Manga) : activités de la période (ou entrées en All Time). */
  const mangaGenrePeriodData = useMemo(
    () =>
      isAllTime
        ? computeGenreDistributionFromEntries(mangaTabEntries)
        : computePeriodGenreDistribution(
            mergedMangaForTabTotals,
            year,
            month,
            "manga",
            mediaBitsForStats
          ),
    [mangaTabEntries, isAllTime, mergedMangaForTabTotals, year, month, mediaBitsForStats]
  );

  /** Répartition des scores manga : tranches 1 à 10 par pas de 0,5 (effectifs, y compris 0). */
  const mangaScoreHalfDistributionRows = useMemo(() => {
    if (scoredMTab.length === 0) return [];
    return buildAnimeHalfScoreDistributionFullRange(scoredMTab);
  }, [scoredMTab]);

  const mangaChaptersByFormatData = useMemo(
    () => {
      if (!isAllTime) return computePeriodReadChaptersByFormat(mergedMangaForTabTotals, year, month);
      const byFormat = new Map<string, number>();
      mangaTabEntries.forEach((entry) => {
        const key = entry.media?.format || "OTHER";
        byFormat.set(key, (byFormat.get(key) || 0) + entryProgressTotal(entry, "manga"));
      });
      return [...byFormat.entries()]
        .map(([name, chapters]) => ({ name, chapters }))
        .sort((a, b) => b.chapters - a.chapters);
    },
    [isAllTime, mangaTabEntries, mergedMangaForTabTotals, year, month]
  );
  const mangaChaptersByCountryData = useMemo(
    () => {
      if (!isAllTime) return computePeriodReadChaptersByCountry(mergedMangaForTabTotals, year, month);
      const byCountry = new Map<string, number>();
      mangaTabEntries.forEach((entry) => {
        const raw = String(entry.media?.countryOfOrigin || "").trim();
        const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
        byCountry.set(code, (byCountry.get(code) || 0) + entryProgressTotal(entry, "manga"));
      });
      return [...byCountry.entries()]
        .map(([code, chapters]) => ({ code, chapters }))
        .sort((a, b) => b.chapters - a.chapters);
    },
    [isAllTime, mangaTabEntries, mergedMangaForTabTotals, year, month]
  );

  const mangaReleaseYearHistogram = useMemo(() => {
    const bins = new Map<number, number>();
    for (const entry of mangaTabEntries) {
      const rawYear = entry.media?.startDate?.year;
      const y = Number(rawYear);
      if (!Number.isFinite(y) || y < 1900) continue;
      bins.set(y, (bins.get(y) || 0) + 1);
    }
    return [...bins.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([yearLabel, count]) => ({ yearLabel: String(yearLabel), count }));
  }, [mangaTabEntries]);

  const mangaTopAuthors = useMemo(
    () => computeMangaTopAuthors(mangaTabEntries, mergedMangaForTabTotals, isAllTime),
    [isAllTime, mangaTabEntries, mergedMangaForTabTotals]
  );

  return {
    mangaPeriodProgressByMedia,
    totalChMangaTab,
    totalVol,
    avgM,
    mangaTopTagsData,
    mangaGenrePeriodData,
    mangaScoreHalfDistributionRows,
    mangaChaptersByFormatData,
    mangaChaptersByCountryData,
    mangaReleaseYearHistogram,
    mangaTopAuthors,
  };
}
