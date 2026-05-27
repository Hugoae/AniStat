import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  CartesianGrid,
  LabelList,
} from "recharts";
import { C, STATUS_LABELS, STATUS_COLORS } from "../config/constants";
import type { MangaTopAuthorRow } from "../lib/periodRankings";
import {
  StatCard,
  ChartCard,
  MediaCard,
  CTooltip,
  MediaOriginFlagSvg,
  mediaCountryOriginMeta,
  mediaFormatShortLabel,
  SectionTitle,
  EmptyState,
  ListTabSectionNav,
} from "../components/AppUi";
import { StatLabelHint } from "../components/appUi/StatPrimitives";
import { buildColorMapFromOrderedKeys, getColorForLabel } from "../lib/chartColors";
import { RecordCard } from "../components/appUi/RecordCard";
import { RecordsCarouselSection } from "../components/appUi/RecordsCarouselSection";
import { RechartsWhenVisible } from "../components/RechartsWhenVisible";
import { AnimePieDistributionCard } from "../components/AnimePieDistributionCard";
import { ScoreScatterCard } from "../components/ScoreScatterCard";
import { TopTagsCard, type TopTagsRow } from "../components/TopTagsCard";
import { ActivityHeatmap, type DailyTotalsByIso } from "../components/ActivityHeatmap";
import { CollapsibleChartBlock } from "../components/appUi/CollapsibleChartBlock";
import { ChartCollapseToggle } from "../components/appUi/ChartCollapseToggle";
import { useCollapsedChart } from "../hooks/useCollapsedChart";
import { useProfilePeriod } from "../contexts/profilePeriodCore";
import {
  ANIME_GENRE_RADAR_TOP_N,
  LIST_TAB_ANIME_CARD_WIDTH,
  LIST_TAB_ANIME_GRID_GAP,
  LIST_TAB_ANIME_VISIBLE_ROWS,
} from "../app/listConstants";
import {
  ANIME_GRID_SORT_DEFAULT,
  type AnimeGridSortKey,
  compareAnimeGridEntries,
  filterAnimeGridEntries,
  normalizeAnimeSearchText,
} from "../lib/animeGridQuery";
import type { AniListEntry, PeriodRecordsBundle } from "../types/domain";

export type MangaTabProps = {
  mangaEntriesLength: number;
  totalCh: number;
  totalVol: number;
  avgM: string;
  mangaVsCommunityScoreStdDev: string;
  mangaStatusEntriesOrdered: [string, number][];
  mangaCountryEntriesOrdered: [string, number][];
  mangaFmtData: { name: string; value: number }[];
  mangaTabEntries: AniListEntry[];
  mangaPlanningEntries: AniListEntry[];
  mangaScoreHalfDistributionRows: { bucket: number; label: string; count: number }[];
  mangaGenrePeriodData: { name: string; count: number }[];
  mangaTopTagsData: TopTagsRow[];
  mangaChaptersByFormatData: { name: string; chapters: number }[];
  mangaChaptersByCountryData: { code: string; chapters: number }[];
  mangaReleaseYearHistogram: { yearLabel: string; count: number }[];
  /** Top auteurs (mangakas, scénaristes, illustrateurs, créateurs originaux) sur la période. */
  mangaTopAuthors: MangaTopAuthorRow[];
  mangaRecords: PeriodRecordsBundle;
  /** Activité quotidienne manga de l'année courante (clé YYYY-MM-DD → chapitres). */
  mangaDailyTotalsForYear: DailyTotalsByIso;
  /** Évite de mesurer la grille quand l’onglet est masqué (largeur 0). */
  mangaListLayoutActive: boolean;
  mangaPeriodProgressByMedia: Map<number, number>;
};

export const MangaTab = memo(function MangaTab({
  mangaEntriesLength,
  totalCh,
  totalVol,
  avgM,
  mangaVsCommunityScoreStdDev,
  mangaStatusEntriesOrdered,
  mangaCountryEntriesOrdered,
  mangaFmtData,
  mangaTabEntries,
  mangaPlanningEntries,
  mangaScoreHalfDistributionRows,
  mangaGenrePeriodData,
  mangaTopTagsData,
  mangaChaptersByFormatData,
  mangaChaptersByCountryData,
  mangaReleaseYearHistogram,
  mangaTopAuthors,
  mangaRecords,
  mangaDailyTotalsForYear,
  mangaListLayoutActive,
  mangaPeriodProgressByMedia,
}: MangaTabProps) {
  const { year, month, isAllTime, setMonth } = useProfilePeriod();
  const viewFullYearCta =
    month !== 0 ? (
      <button type="button" className="list-tab-empty-cta" onClick={() => setMonth(0)}>
        Voir toute l&apos;année {year}
      </button>
    ) : null;
  const periodYearLabel = isAllTime ? "All Time" : String(year);

  const mangaAuthorsCollapse = useCollapsedChart("manga.authors");
  const [authorsExpanded, setAuthorsExpanded] = useState(false);
  const authorsCollapsedCount = 6;
  const authorsVisibleRows = authorsExpanded
    ? mangaTopAuthors
    : mangaTopAuthors.slice(0, authorsCollapsedCount);
  const authorsHasMore = mangaTopAuthors.length > authorsCollapsedCount;
  const authorPeriodRankById = useMemo(() => {
    const m = new Map<number, number>();
    mangaTopAuthors.forEach((a, i) => m.set(a.id, i + 1));
    return m;
  }, [mangaTopAuthors]);
  /** Réinitialise l'expansion à chaque changement de période (mois/année). */
  useEffect(() => {
    setAuthorsExpanded(false);
  }, [year, month]);

  const formatChaptersLabel = (chaptersRaw: number) => {
    const ch = Math.max(0, Math.round(Number(chaptersRaw) || 0));
    return `${ch} chapitre${ch > 1 ? "s" : ""}`;
  };
  const formatChaptersByName = useMemo(
    () =>
      new Map(
        mangaChaptersByFormatData.map((row) => [String(row.name), Number(row.chapters) || 0] as const)
      ),
    [mangaChaptersByFormatData]
  );
  const countryChaptersByCode = useMemo(
    () =>
      new Map(
        mangaChaptersByCountryData.map((row) => [String(row.code), Number(row.chapters) || 0] as const)
      ),
    [mangaChaptersByCountryData]
  );
  const formatTitlesLabel = (titlesRaw: number) => {
    const n = Math.max(0, Math.round(Number(titlesRaw) || 0));
    return `${n} titre${n > 1 ? "s" : ""}`;
  };
  const formatColorMap = useMemo(
    () => buildColorMapFromOrderedKeys(mangaFmtData.map((row) => String(row.name))),
    [mangaFmtData]
  );
  const countryColorMap = useMemo(
    () => buildColorMapFromOrderedKeys(mangaCountryEntriesOrdered.map(([code]) => String(code))),
    [mangaCountryEntriesOrdered]
  );

  const formatPieSlicesByTitles = useMemo(
    () =>
      mangaFmtData.map((row) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: row.value,
        fill: getColorForLabel(String(row.name), formatColorMap),
        extraInfo: formatChaptersLabel(formatChaptersByName.get(String(row.name)) || 0),
      })),
    [mangaFmtData, formatColorMap, formatChaptersByName]
  );
  const formatPieSlicesByChapters = useMemo(() => {
    const titlesByName = new Map(mangaFmtData.map((row) => [String(row.name), Number(row.value) || 0] as const));
    return mangaChaptersByFormatData
      .filter((row) => Number(row.chapters) > 0)
      .map((row) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: Number(row.chapters) || 0,
        fill: getColorForLabel(String(row.name), formatColorMap),
        extraInfo: formatTitlesLabel(titlesByName.get(String(row.name)) || 0),
      }));
  }, [mangaChaptersByFormatData, mangaFmtData, formatColorMap]);

  const countryPieSlicesByTitles = useMemo(
    () =>
      mangaCountryEntriesOrdered.map(([code, c]) => {
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code);
        const label = meta ? meta.label : "Inconnu";
        return {
          key: code,
          label,
          value: c,
          fill: getColorForLabel(code, countryColorMap),
          flagCode: meta?.code,
          extraInfo: formatChaptersLabel(countryChaptersByCode.get(code) || 0),
        };
      }),
    [mangaCountryEntriesOrdered, countryColorMap, countryChaptersByCode]
  );
  const countryPieSlicesByChapters = useMemo(() => {
    const titlesByCode = new Map(
      mangaCountryEntriesOrdered.map(([code, c]) => [String(code), Number(c) || 0] as const)
    );
    return mangaChaptersByCountryData
      .filter((row) => Number(row.chapters) > 0)
      .map((row) => {
        const code = String(row.code);
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code);
        const label = meta ? meta.label : "Inconnu";
        return {
          key: code,
          label,
          value: Number(row.chapters) || 0,
          fill: getColorForLabel(code, countryColorMap),
          flagCode: meta?.code,
          extraInfo: formatTitlesLabel(titlesByCode.get(code) || 0),
        };
      });
  }, [mangaChaptersByCountryData, mangaCountryEntriesOrdered, countryColorMap]);
  const statusPieSlices = useMemo(
    () =>
      mangaStatusEntriesOrdered.map(([status, value]) => ({
        key: status,
        label: STATUS_LABELS[status] || status,
        value,
        fill: STATUS_COLORS[status] || getColorForLabel(status),
        extraInfo: `${value} titre${value > 1 ? "s" : ""}`,
      })),
    [mangaStatusEntriesOrdered]
  );
  const mangaChapterVolumeBuckets = useMemo(() => {
    const rows = [
      { key: "1", label: "1", count: 0 },
      { key: "2-10", label: "2-10", count: 0 },
      { key: "11-25", label: "11-25", count: 0 },
      { key: "26-50", label: "26-50", count: 0 },
      { key: "51-100", label: "51-100", count: 0 },
      { key: "101-200", label: "101-200", count: 0 },
      { key: "200+", label: "200+", count: 0 },
      { key: "unknown", label: "Inconnu", count: 0 },
    ];
    for (const entry of mangaTabEntries) {
      const chapters = Number(entry.media?.chapters || 0);
      if (chapters === 1) rows[0].count += 1;
      else if (chapters >= 2 && chapters <= 10) rows[1].count += 1;
      else if (chapters >= 11 && chapters <= 25) rows[2].count += 1;
      else if (chapters >= 26 && chapters <= 50) rows[3].count += 1;
      else if (chapters >= 51 && chapters <= 100) rows[4].count += 1;
      else if (chapters >= 101 && chapters <= 200) rows[5].count += 1;
      else if (chapters > 200) rows[6].count += 1;
      else rows[7].count += 1;
    }
    return rows.filter((row) => row.count > 0);
  }, [mangaTabEntries]);
  const mangaScoreHalfDistributionVisibleRows = useMemo(() => {
    if (mangaScoreHalfDistributionRows.length === 0) return [];
    const nonZeroIndices = mangaScoreHalfDistributionRows
      .map((row, idx) => (row.count > 0 ? idx : -1))
      .filter((idx) => idx >= 0);
    if (nonZeroIndices.length === 0) return [];
    const minIdx = nonZeroIndices[0];
    const maxIdx = nonZeroIndices[nonZeroIndices.length - 1];
    return mangaScoreHalfDistributionRows.slice(minIdx, maxIdx + 1);
  }, [mangaScoreHalfDistributionRows]);

  const [mangaListExpanded, setMangaListExpanded] = useState(false);
  const [mangaListGridWidth, setMangaListGridWidth] = useState(0);
  const mangaMediaGridRef = useRef<HTMLDivElement | null>(null);
  const [mangaSearchQuery, setMangaSearchQuery] = useState("");
  const [mangaSortKey, setMangaSortKey] = useState<AnimeGridSortKey>(ANIME_GRID_SORT_DEFAULT);
  const [mangaFilterScoredOnly, setMangaFilterScoredOnly] = useState(false);
  const [mangaFilterCompletedOnly, setMangaFilterCompletedOnly] = useState(false);
  const [mangaFilterCurrentOnly, setMangaFilterCurrentOnly] = useState(false);
  const [mangaFilterDroppedOnly, setMangaFilterDroppedOnly] = useState(false);
  const [mangaFilterPlanningOnly, setMangaFilterPlanningOnly] = useState(false);
  const [mangaPlanningVisible, setMangaPlanningVisible] = useState(false);

  const mangaSearchNormalized = useMemo(
    () => normalizeAnimeSearchText(mangaSearchQuery),
    [mangaSearchQuery]
  );
  const compareByAverageScoreDesc = useCallback((a: AniListEntry, b: AniListEntry) => {
    const avgA = Number(a.media?.averageScore) || 0;
    const avgB = Number(b.media?.averageScore) || 0;
    if (avgB !== avgA) return avgB - avgA;
    return compareAnimeGridEntries(a, b, "title-asc");
  }, []);

  const mangaGridSorted = useMemo(
    () => {
      const normalBase = filterAnimeGridEntries(mangaTabEntries, {
        normalizedSearch: mangaSearchNormalized,
        scoredOnly: mangaFilterScoredOnly,
        completedOnly: !isAllTime && mangaFilterCompletedOnly,
      });
      if (!isAllTime) return [...normalBase].sort((a, b) => compareAnimeGridEntries(a, b, mangaSortKey));
      const planningBase = filterAnimeGridEntries(mangaPlanningEntries, {
        normalizedSearch: mangaSearchNormalized,
        scoredOnly: mangaFilterScoredOnly,
        completedOnly: false,
      }).sort(compareByAverageScoreDesc);
      const statusFilters = [
        mangaFilterCompletedOnly && "COMPLETED",
        mangaFilterCurrentOnly && "CURRENT",
        mangaFilterDroppedOnly && "DROPPED",
        mangaFilterPlanningOnly && "PLANNING",
      ].filter(Boolean);
      if (statusFilters.length > 0) {
        const selected = [...normalBase, ...planningBase].filter((entry) => statusFilters.includes(String(entry.status)));
        if (statusFilters.length === 1 && statusFilters[0] === "PLANNING") return selected.sort(compareByAverageScoreDesc);
        return selected.sort((a, b) => compareAnimeGridEntries(a, b, mangaSortKey));
      }
      const normalSorted = [...normalBase].sort((a, b) => compareAnimeGridEntries(a, b, mangaSortKey));
      return mangaPlanningVisible ? [...normalSorted, ...planningBase] : normalSorted;
    },
    [
      mangaTabEntries,
      mangaPlanningEntries,
      mangaSearchNormalized,
      mangaFilterScoredOnly,
      mangaFilterCompletedOnly,
      mangaFilterCurrentOnly,
      mangaFilterDroppedOnly,
      mangaFilterPlanningOnly,
      mangaPlanningVisible,
      mangaSortKey,
      compareByAverageScoreDesc,
      isAllTime,
    ]
  );

  const mangaPlanningFilteredSorted = useMemo(
    () =>
      filterAnimeGridEntries(mangaPlanningEntries, {
        normalizedSearch: mangaSearchNormalized,
        scoredOnly: mangaFilterScoredOnly,
        completedOnly: false,
      }).sort(compareByAverageScoreDesc),
    [mangaPlanningEntries, mangaSearchNormalized, mangaFilterScoredOnly, compareByAverageScoreDesc]
  );

  /** Colonnes = cartes 155px + gap 14px (aligné sur .list-tab-media-grid). */
  const mangaListGridColumns = useMemo(() => {
    const w = mangaListGridWidth;
    if (!Number.isFinite(w) || w <= 0) return 1;
    const cell = LIST_TAB_ANIME_CARD_WIDTH + LIST_TAB_ANIME_GRID_GAP;
    return Math.max(1, Math.floor((w + LIST_TAB_ANIME_GRID_GAP) / cell));
  }, [mangaListGridWidth]);
  const mangaListCollapsedMax = mangaListGridColumns * LIST_TAB_ANIME_VISIBLE_ROWS;
  const mangaListHasStatusFilter =
    mangaFilterCompletedOnly || mangaFilterCurrentOnly || mangaFilterDroppedOnly || mangaFilterPlanningOnly;
  const mangaListNeedsMoreLess =
    !mangaListHasStatusFilter && !mangaPlanningVisible && mangaGridSorted.length > mangaListCollapsedMax;
  const mangaCanRevealPlanning =
    isAllTime &&
    !mangaListHasStatusFilter &&
    !mangaPlanningVisible &&
    mangaPlanningFilteredSorted.length > 0 &&
    (!mangaListNeedsMoreLess || mangaListExpanded);
  const mangaListToShow = useMemo(() => {
    if (mangaListHasStatusFilter) return mangaGridSorted;
    if (mangaPlanningVisible) return mangaGridSorted;
    if (!mangaListNeedsMoreLess || mangaListExpanded) return mangaGridSorted;
    return mangaGridSorted.slice(0, mangaListCollapsedMax);
  }, [
    mangaGridSorted,
    mangaListHasStatusFilter,
    mangaPlanningVisible,
    mangaListNeedsMoreLess,
    mangaListExpanded,
    mangaListCollapsedMax,
  ]);

  useLayoutEffect(() => {
    if (!mangaListLayoutActive) return undefined;
    const el = mangaMediaGridRef.current;
    if (!el) return undefined;
    const apply = () => {
      const w = el.clientWidth;
      if (typeof w === "number" && Number.isFinite(w)) setMangaListGridWidth(w);
    };
    apply();
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      const w = cr?.width;
      if (typeof w === "number" && Number.isFinite(w)) setMangaListGridWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [mangaListLayoutActive, mangaGridSorted.length]);

  useEffect(() => {
    setMangaListExpanded(false);
    setMangaSearchQuery("");
    setMangaSortKey(ANIME_GRID_SORT_DEFAULT);
    setMangaFilterScoredOnly(false);
    setMangaFilterCompletedOnly(false);
    setMangaFilterCurrentOnly(false);
    setMangaFilterDroppedOnly(false);
    setMangaFilterPlanningOnly(false);
    setMangaPlanningVisible(false);
  }, [year, month]);

  const sectionNavItems = useMemo(() => [
    { id: "manga-synthese", label: "Statistiques" },
    { id: "manga-repartition", label: "Liste des œuvres" },
    { id: "manga-records", label: "Records" },
    { id: "manga-graphiques", label: "Graphiques" },
    { id: "manga-auteurs", label: "Auteurs" },
  ], []);

  return (
    <div className="list-tab-shell">
      <ListTabSectionNav items={sectionNavItems} label="Navigation des sections manga" />
      <div className="list-tab-page">
      <div id="manga-synthese" className="overview-stats-cluster list-tab-anchor">
        <div className="fade-in stat-stat-al-row--overview">
          <StatCard label="Total manga" value={mangaEntriesLength} icon="book" />
          <StatCard label="Chapitres lus" value={totalCh} icon="book" />
          <StatCard label="Volumes" value={totalVol} icon="stack" />
          <StatCard label="Score moyen" value={avgM} icon="star" />
          <StatCard
            label="Dispersion (σ)"
            value={mangaVsCommunityScoreStdDev}
            icon="divide"
            labelHint="Écart-type (σ) de vos écarts (votre note − moyenne AniList) sur la période, en points sur 10. C'est l'amplitude typique d'un écart, sans considérer son sens : 0 = vos notes collent à la moyenne du site, plus la valeur monte plus vos notes sont tranchées (au-dessus comme au-dessous). Pour savoir si vous sur- ou sous-notez en moyenne, regardez le graphique « Ta note vs note AniList » plus bas."
          />
        </div>
      </div>

      {!isAllTime ? (
        <section
          id="manga-heatmap"
          className="fade-in list-tab-anchor"
          aria-labelledby="manga-heatmap-title"
        >
          <ActivityHeatmap
            year={year}
            title={`Calendrier d'activité manga ${periodYearLabel}`}
            dailyTotals={mangaDailyTotalsForYear}
            unitSingular="chapitre"
            unitPlural="chapitres"
            collapseId="manga.heatmap"
            titleHint="Chaque cellule représente une journée de l'année. La couleur indique le nombre de chapitres lus ce jour-là (toutes activités manga AniList confondues, période ignorée). Survole une cellule pour voir le total exact."
          />
        </section>
      ) : null}

      <section
        id="manga-repartition"
        className="overview-section fade-in list-tab-distribution-section list-tab-anchor"
        aria-labelledby="manga-par-statut-title"
      >
        <div className="list-tab-distribution">
          <div className="list-tab-distribution__col">
            <SectionTitle size="lg" id="manga-par-statut-title">
              Par statut
            </SectionTitle>
            <div className="list-tab-distro-row">
              {mangaStatusEntriesOrdered.map(([s, c]) => (
                <div key={s} className="list-tab-status-pill">
                  <span className="list-tab-status-pill__count" style={{ color: STATUS_COLORS[s] || C.accent }}>
                    {String(c)}
                  </span>
                  <span className="list-tab-status-pill__label">{STATUS_LABELS[s] || s}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="list-tab-distribution__col">
            <SectionTitle size="lg" id="manga-par-pays-title">
              Par pays d’origine
            </SectionTitle>
            <div className="list-tab-distro-row">
              {mangaCountryEntriesOrdered.map(([code, c]) => {
                const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code);
                const label = meta ? meta.label : "Inconnu";
                const a11yCountry = meta ? meta.label : "pays inconnu";
                const countStr = String(c);
                return (
                  <div
                    key={code}
                    className="list-tab-origin-pill"
                    role="group"
                    aria-label={`${countStr} manga · ${a11yCountry}`}
                  >
                    <span className="list-tab-status-pill__count" style={{ color: C.accent }}>
                      {countStr}
                    </span>
                    <div className="list-tab-origin-pill__meta">
                      <span className="list-tab-origin-pill__flag" aria-hidden>
                        {meta ? (
                          <MediaOriginFlagSvg code={meta.code} width={20} height={13} />
                        ) : (
                          <span className="list-tab-origin-pill__flag-unknown">?</span>
                        )}
                      </span>
                      <span className="list-tab-origin-pill__name">{label}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="list-tab-distribution__col">
            <SectionTitle size="lg" id="manga-par-format-title">
              Par format
            </SectionTitle>
            <div className="list-tab-distro-row">
              {mangaFmtData.map(({ name, value: fv }) => (
                <div key={name} className="list-tab-status-pill">
                  <span className="list-tab-status-pill__count" style={{ color: C.accent }}>
                    {String(fv)}
                  </span>
                  <span className="list-tab-status-pill__label">{mediaFormatShortLabel(name) || name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div id="manga-liste" className="list-tab-anime-list list-tab-anchor">
        <div className="list-tab-anime-grid-toolbar" role="search">
          <div className="list-tab-anime-grid-toolbar__inner">
            <div className="list-tab-anime-grid-toolbar__search-block">
              <span className="list-tab-anime-grid-toolbar__eyebrow" id="manga-grid-search-label">
                Recherche
              </span>
              <div className="list-tab-anime-grid-toolbar__search-shell">
                <input
                  type="search"
                  id="manga-grid-search"
                  name="manga-grid-search"
                  className="list-tab-anime-grid-toolbar__input"
                  value={mangaSearchQuery}
                  onChange={(ev) => setMangaSearchQuery(ev.target.value)}
                  placeholder="Romaji ou anglais…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-labelledby="manga-grid-search-label"
                />
              </div>
            </div>
            <div className="list-tab-anime-grid-toolbar__filter-group">
              <span className="list-tab-anime-grid-toolbar__eyebrow">Filtres</span>
              <div className="list-tab-anime-grid-toolbar__toggles" role="group" aria-label="Filtres liste">
                <button
                  type="button"
                  className={`list-tab-anime-grid-toolbar__toggle${mangaFilterScoredOnly ? " is-active" : ""}`}
                  aria-pressed={mangaFilterScoredOnly}
                  title="Afficher uniquement les titres avec une note"
                  onClick={() => setMangaFilterScoredOnly((v) => !v)}
                >
                  Notés
                  {mangaFilterScoredOnly ? (
                    <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`list-tab-anime-grid-toolbar__toggle${mangaFilterCompletedOnly ? " is-active" : ""}`}
                  aria-pressed={mangaFilterCompletedOnly}
                  title="Afficher uniquement les titres au statut terminé"
                  onClick={() => setMangaFilterCompletedOnly((v) => !v)}
                >
                  Terminés
                  {mangaFilterCompletedOnly ? (
                    <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
                {isAllTime ? (
                  <>
                    <button
                      type="button"
                      className={`list-tab-anime-grid-toolbar__toggle${mangaFilterCurrentOnly ? " is-active" : ""}`}
                      aria-pressed={mangaFilterCurrentOnly}
                      title="Afficher uniquement les titres en cours"
                      onClick={() => setMangaFilterCurrentOnly((v) => !v)}
                    >
                      En cours
                      {mangaFilterCurrentOnly ? (
                        <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className={`list-tab-anime-grid-toolbar__toggle${mangaFilterDroppedOnly ? " is-active" : ""}`}
                      aria-pressed={mangaFilterDroppedOnly}
                      title="Afficher uniquement les titres abandonnés"
                      onClick={() => setMangaFilterDroppedOnly((v) => !v)}
                    >
                      Abandonnés
                      {mangaFilterDroppedOnly ? (
                        <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className={`list-tab-anime-grid-toolbar__toggle${mangaFilterPlanningOnly ? " is-active" : ""}`}
                      aria-pressed={mangaFilterPlanningOnly}
                      title="Afficher uniquement les titres planifiés"
                      onClick={() => {
                        setMangaPlanningVisible(false);
                        setMangaFilterPlanningOnly((v) => !v);
                      }}
                    >
                      Planifiés
                      {mangaFilterPlanningOnly ? (
                        <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                  </>
                ) : null}
              </div>
            </div>
            <div className="list-tab-anime-grid-toolbar__sort">
              <span className="list-tab-anime-grid-toolbar__eyebrow" id="manga-grid-sort-label">
                Trier par
              </span>
              <div className="list-tab-anime-grid-toolbar__select-shell">
                <select
                  id="manga-grid-sort"
                  name="manga-grid-sort"
                  className="list-tab-anime-grid-toolbar__select"
                  value={mangaSortKey}
                  onChange={(ev) => setMangaSortKey(ev.target.value as AnimeGridSortKey)}
                  aria-labelledby="manga-grid-sort-label"
                >
                  <option value="score-desc">Vos notes ▼</option>
                  <option value="score-asc">Vos notes ▲</option>
                  <option value="title-desc">Titre ▼</option>
                  <option value="title-asc">Titre ▲</option>
                  <option value="release-desc">Sortie ▼</option>
                  <option value="release-asc">Sortie ▲</option>
                  <option value="progress-desc">Progression ▼</option>
                  <option value="progress-asc">Progression ▲</option>
                </select>
              </div>
            </div>
          </div>
        </div>
        {(mangaTabEntries.length > 0 || mangaPlanningEntries.length > 0) && mangaGridSorted.length === 0 ? (
          <EmptyState
            compact
            icon="flag"
            title="Aucun titre ne correspond aux filtres."
            cta={
              <button
                type="button"
                className="list-tab-empty-cta"
                onClick={() => {
                  setMangaSearchQuery("");
                  setMangaFilterScoredOnly(false);
                  setMangaFilterCompletedOnly(false);
                  setMangaFilterCurrentOnly(false);
                  setMangaFilterDroppedOnly(false);
                  setMangaFilterPlanningOnly(false);
                  setMangaPlanningVisible(false);
                }}
              >
                Réinitialiser filtres
              </button>
            }
          />
        ) : null}
        <div
          ref={mangaMediaGridRef}
          className="list-tab-media-grid stagger-reveal"
          style={
            {
              "--anime-grid-cols": mangaListGridColumns,
              "--anime-grid-gap": `${LIST_TAB_ANIME_GRID_GAP}px`,
            } as CSSProperties
          }
        >
          {mangaListToShow.map((e) => (
            <MediaCard
              key={e.id}
              entry={e}
              type="MANGA"
              deferCover
              periodProgress={mangaPeriodProgressByMedia.get(e.media?.id || 0) || 0}
            />
          ))}
        </div>
        {(mangaListNeedsMoreLess && !mangaListExpanded) || mangaCanRevealPlanning ? (
          <button
            type="button"
            className="list-tab-anime-more-btn"
            onClick={() => {
              if (mangaListNeedsMoreLess && !mangaListExpanded) setMangaListExpanded(true);
              else setMangaPlanningVisible(true);
            }}
            aria-expanded={mangaCanRevealPlanning ? mangaPlanningVisible : false}
          >
            <span>{mangaCanRevealPlanning ? "Voir œuvres planifiées" : "Voir plus"}</span>
            <svg
              className="list-tab-anime-more-btn__icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
        ) : null}
        {((mangaListNeedsMoreLess && mangaListExpanded && !mangaCanRevealPlanning) || mangaPlanningVisible) ? (
          <button
            type="button"
            className="list-tab-anime-more-btn list-tab-anime-more-btn--collapse"
            onClick={() => {
              setMangaPlanningVisible(false);
              setMangaListExpanded(false);
            }}
            aria-expanded={true}
          >
            <span>Voir moins</span>
            <svg
              className="list-tab-anime-more-btn__icon"
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <path d="M18 15l-6-6-6 6" />
            </svg>
          </button>
        ) : null}
      </div>

      <MangaRecordsSection records={mangaRecords} />

      <div
        key={`manga-viz-${year}-${month}`}
        className="list-tab-anime-viz-reveal"
      >
        <div id="manga-graphiques" className="list-tab-anime-charts-section list-tab-anchor">
          <div className="list-tab-anime-charts list-tab-anime-charts--two">
            <CollapsibleChartBlock
              id="manga.scores"
              title="Répartition des scores"
              withHint
              titleAside={
                <StatLabelHint text="Chaque note est ramenée au demi-point le plus proche avant d’être comptée (ex. 7,2 → 7 ; 7,8 → 8 ; 8,25 → 8,5)" />
              }
            >
              <ChartCard
                noTitle
                className="list-tab-anime-chart--scores"
                screenReaderSummary="Histogramme des scores : effectifs par tranche de demi-point de 1 à 10 pour les manga notés sur la période."
                dataTable={{
                  caption: "Répartition des scores manga",
                  columns: ["Score", "Manga"],
                  rows: mangaScoreHalfDistributionVisibleRows.map((row) => [row.label, row.count]),
                }}
              >
                {mangaScoreHalfDistributionVisibleRows.length > 0 ? (
                  <div className="list-tab-anime-score-chart-wrap">
                    <RechartsWhenVisible height={260} className="list-tab-anime-recharts-mount">
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart
                          data={mangaScoreHalfDistributionVisibleRows}
                          margin={{ top: 22, right: 8, left: 4, bottom: 2 }}
                          barCategoryGap="12%"
                        >
                          <CartesianGrid
                            strokeDasharray="3 6"
                            horizontal
                            vertical={false}
                            stroke="rgba(139, 160, 178, 0.12)"
                          />
                          <XAxis
                            dataKey="label"
                            tick={{ fill: "rgba(232, 238, 244, 0.88)", fontSize: 9, fontWeight: 500 }}
                            axisLine={{ stroke: "rgba(139, 160, 178, 0.22)" }}
                            tickLine={false}
                            interval={0}
                            height={28}
                          />
                          <YAxis type="number" hide width={0} domain={[0, "auto"]} />
                          <Tooltip content={<CTooltip />} cursor={{ fill: "rgba(61, 180, 242, 0.07)" }} />
                          <Bar dataKey="count" name="Manga" fill={C.accent} radius={[8, 8, 0, 0]} maxBarSize={40}>
                            <LabelList
                              dataKey="count"
                              position="top"
                              offset={6}
                              fill="rgba(237, 241, 245, 0.95)"
                              fontSize={11}
                              fontWeight={600}
                              formatter={(v) => (v != null && Number(v) > 0 ? String(v) : "")}
                            />
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </RechartsWhenVisible>
                  </div>
                ) : (
                  <EmptyState
                    icon="star"
                    title="Aucun score sur les manga de cette période."
                    cta={viewFullYearCta}
                  />
                )}
              </ChartCard>
            </CollapsibleChartBlock>

            <CollapsibleChartBlock id="manga.genres" title="Genres">
              <ChartCard
                noTitle
                screenReaderSummary="Radar des dix genres les plus fréquents sur les manga de la période."
                dataTable={{
                  caption: "Genres manga les plus fréquents",
                  columns: ["Genre", "Titres"],
                  rows: mangaGenrePeriodData.slice(0, ANIME_GENRE_RADAR_TOP_N).map((row) => [row.name, row.count]),
                }}
              >
                {mangaGenrePeriodData.length > 0 ? (
                  <RechartsWhenVisible height={260} className="list-tab-anime-recharts-mount">
                    <ResponsiveContainer width="100%" height={260}>
                      <RadarChart data={mangaGenrePeriodData.slice(0, ANIME_GENRE_RADAR_TOP_N)} outerRadius="88%">
                        <PolarGrid stroke={C.border} strokeOpacity={0.65} />
                        <PolarAngleAxis dataKey="name" tick={{ fill: "rgba(237, 241, 245, 0.9)", fontSize: 10 }} />
                        <PolarRadiusAxis tick={false} axisLine={false} />
                        <Radar
                          name="Titres"
                          dataKey="count"
                          stroke={C.accent}
                          fill={C.accent}
                          fillOpacity={0.2}
                          strokeWidth={2}
                        />
                        <Tooltip content={<CTooltip />} />
                      </RadarChart>
                    </ResponsiveContainer>
                  </RechartsWhenVisible>
                ) : (
                  <EmptyState
                    icon="stack"
                    title="Aucun genre renseigné pour les manga de cette période."
                    cta={viewFullYearCta}
                  />
                )}
              </ChartCard>
            </CollapsibleChartBlock>
          </div>

          <div className="list-tab-anime-charts">
            <ScoreScatterCard
              entries={mangaTabEntries}
              kind="manga"
              emptyExtra={viewFullYearCta}
              collapseId="manga.scatter"
            />
          </div>

          <div className="list-tab-anime-charts">
            <TopTagsCard
              tags={mangaTopTagsData}
              kind="manga"
              emptyExtra={viewFullYearCta}
              collapseId="manga.topTags"
            />
          </div>

          <div className="list-tab-anime-charts">
            <CollapsibleChartBlock id="manga.releaseYear" title="Année de sortie">
              <ChartCard
                noTitle
                screenReaderSummary="Nombre de manga de la période par année de sortie (date de début)."
                dataTable={{
                  caption: "Manga par année de sortie",
                  columns: ["Année", "Titres"],
                  rows: mangaReleaseYearHistogram.map((row) => [row.yearLabel, row.count]),
                }}
              >
                {mangaReleaseYearHistogram.length > 0 ? (
                  <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                    <ResponsiveContainer width="100%" height={212}>
                      <LineChart data={mangaReleaseYearHistogram} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                        <defs>
                          <linearGradient id="manga-release-year-fill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="#2A3A4D" stopOpacity={0.62} />
                            <stop offset="55%" stopColor="#223142" stopOpacity={0.72} />
                            <stop offset="100%" stopColor="#1A2736" stopOpacity={0.82} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 6" horizontal vertical={false} stroke="rgba(139, 160, 178, 0.12)" />
                        <XAxis
                          dataKey="yearLabel"
                          interval="preserveStartEnd"
                          minTickGap={20}
                          tick={{ fill: C.textMuted, fontSize: 10 }}
                          axisLine={false}
                          tickLine={false}
                          dy={8}
                        />
                        <YAxis
                          tick={{ fill: C.textMuted, fontSize: 10 }}
                          width={32}
                          axisLine={false}
                          tickLine={false}
                          allowDecimals={false}
                          domain={[0, "auto"]}
                        />
                        <Tooltip content={<CTooltip />} formatter={(v: number) => [String(v), "Titres"]} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          name="Manga"
                          stroke="none"
                          fill="url(#manga-release-year-fill)"
                          baseValue={0}
                          isAnimationActive={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="count"
                          name="Manga"
                          stroke={C.accent}
                          strokeWidth={2.8}
                          dot={{
                            r: 4,
                            fill: "rgba(61, 180, 242, 0.58)",
                            stroke: "rgba(11, 22, 34, 0.55)",
                            strokeWidth: 1,
                          }}
                          activeDot={{ r: 6, fill: "rgba(61, 180, 242, 0.95)", stroke: "#0d1621", strokeWidth: 1 }}
                          isAnimationActive={false}
                        >
                          <LabelList
                            dataKey="count"
                            position="top"
                            offset={8}
                            fill="#edf1f5"
                            fontSize={11}
                            fontWeight={600}
                            formatter={(v) => (v != null && Number(v) > 0 ? String(v) : "")}
                          />
                        </Line>
                      </LineChart>
                    </ResponsiveContainer>
                  </RechartsWhenVisible>
                ) : (
                  <EmptyState
                    icon="calendar"
                    title="Aucune année de sortie renseignée sur ces titres."
                    cta={viewFullYearCta}
                  />
                )}
              </ChartCard>
            </CollapsibleChartBlock>
          </div>
        </div>

        <div id="manga-camemberts" className="list-tab-anime-pie-bottom list-tab-anchor">
          <div className="list-tab-pie-pair">
            <AnimePieDistributionCard
              title="Répartition par format"
              screenReaderSummary="Camembert des formats sur la période."
              emptyExtra={viewFullYearCta}
              defaultModeKey="titles"
              collapseId="manga.format"
              modes={[
                {
                  key: "titles",
                  label: "Titres",
                  unitSingular: "titre",
                  unitPlural: "titres",
                  slices: formatPieSlicesByTitles,
                  footnote:
                    "Le pourcentage représente la part de titres, le nombre de chapitres lus est une information complémentaire.",
                },
                {
                  key: "chapters",
                  label: "Chapitres",
                  unitSingular: "chapitre lu",
                  unitPlural: "chapitres lus",
                  slices: formatPieSlicesByChapters,
                  footnote:
                    "Le pourcentage représente la part de chapitres lus, le nombre de titres est une information complémentaire.",
                },
              ]}
            />
            <AnimePieDistributionCard
              title="Pays d’origine"
              screenReaderSummary="Camembert des pays d’origine des manga sur la période."
              emptyExtra={viewFullYearCta}
              defaultModeKey="titles"
              collapseId="manga.country"
              modes={[
                {
                  key: "titles",
                  label: "Titres",
                  unitSingular: "titre",
                  unitPlural: "titres",
                  slices: countryPieSlicesByTitles,
                  footnote:
                    "Le pourcentage représente la part de titres, le nombre de chapitres lus est une information complémentaire.",
                },
                {
                  key: "chapters",
                  label: "Chapitres",
                  unitSingular: "chapitre lu",
                  unitPlural: "chapitres lus",
                  slices: countryPieSlicesByChapters,
                  footnote:
                    "Le pourcentage représente la part de chapitres lus, le nombre de titres est une information complémentaire.",
                },
              ]}
            />
          </div>
          {isAllTime ? (
            <div className="list-tab-pie-pair list-tab-alltime-extra-charts">
              <AnimePieDistributionCard
                title="Répartition par statut"
                screenReaderSummary="Camembert des statuts manga All Time, incluant terminés, en cours, abandonnés et planifiés."
                defaultModeKey="titles"
                collapseId="manga.statusAllTime"
                modes={[
                  {
                    key: "titles",
                    label: "Titres",
                    unitSingular: "titre",
                    unitPlural: "titres",
                    slices: statusPieSlices,
                    footnote:
                      "Le pourcentage représente la part de titres, le nombre de titres est une information complémentaire.",
                  },
                ]}
              />
              <CollapsibleChartBlock id="manga.chapterBuckets" title="Longueur des œuvres">
                <ChartCard
                  noTitle
                  screenReaderSummary="Distribution All Time des manga par volume de chapitres."
                  dataTable={{
                    caption: "Distribution manga par volume de chapitres",
                    columns: ["Catégorie", "Titres"],
                    rows: mangaChapterVolumeBuckets.map((row) => [row.label, row.count]),
                  }}
                >
                  {mangaChapterVolumeBuckets.length > 0 ? (
                    <div className="list-tab-anime-score-chart-wrap">
                      <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                        <ResponsiveContainer width="100%" height={212}>
                          <BarChart data={mangaChapterVolumeBuckets} margin={{ top: 22, right: 8, left: 4, bottom: 2 }} barCategoryGap="18%">
                            <CartesianGrid strokeDasharray="3 6" horizontal vertical={false} stroke="rgba(139, 160, 178, 0.12)" />
                            <XAxis
                              dataKey="label"
                              tick={{ fill: "rgba(232, 238, 244, 0.88)", fontSize: 10, fontWeight: 500 }}
                              axisLine={{ stroke: "rgba(139, 160, 178, 0.22)" }}
                              tickLine={false}
                              interval={0}
                              height={36}
                            />
                            <YAxis type="number" hide width={0} domain={[0, "auto"]} />
                            <Tooltip content={<CTooltip />} cursor={{ fill: "rgba(61, 180, 242, 0.07)" }} />
                            <Bar dataKey="count" name="Titres" fill={C.accent} radius={[8, 8, 0, 0]} maxBarSize={48}>
                              <LabelList
                                dataKey="count"
                                position="top"
                                offset={6}
                                fill="rgba(237, 241, 245, 0.95)"
                                fontSize={11}
                                fontWeight={600}
                                formatter={(v: number) => (v != null && Number(v) > 0 ? String(v) : "")}
                              />
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </RechartsWhenVisible>
                    </div>
                  ) : (
                    <EmptyState icon="book" title="Aucun volume de chapitres à afficher." />
                  )}
                  <p className="list-tab-pie-card__footnote">
                    Répartition des mangas selon leur nombre total de chapitres.
                  </p>
                </ChartCard>
              </CollapsibleChartBlock>
            </div>
          ) : null}
        </div>
      </div>

      <section
        id="manga-auteurs"
        className="list-tab-authors-section list-tab-anchor"
        aria-labelledby="manga-authors-title"
        aria-describedby={mangaTopAuthors.length > 0 && !mangaAuthorsCollapse.collapsed ? "manga-authors-summary" : undefined}
      >
        <SectionTitle
          id="manga-authors-title"
          rowClassName="list-tab-anime-chart-block__title-row list-tab-authors-section__title-row"
          aside={
            <>
              <ChartCollapseToggle
                collapsed={mangaAuthorsCollapse.collapsed}
                onToggle={mangaAuthorsCollapse.toggle}
                chartTitle="Auteurs"
                controlsId="manga-authors-body"
              />
              <StatLabelHint text="Auteurs créditeurs des manga de la période (mangakas, scénaristes, illustrateurs, créateurs originaux). Les rôles secondaires comme la traduction ou l'édition sont exclus. Les chapitres lus sont calculés sur la période sélectionnée à partir des activités AniList." />
            </>
          }
        >
          Auteurs
        </SectionTitle>
        <div
          className={`collapsible-chart-animator${mangaAuthorsCollapse.collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
          aria-hidden={mangaAuthorsCollapse.collapsed}
        >
          <div id="manga-authors-body" className="collapsible-chart-animator__inner">
            {mangaTopAuthors.length > 0 ? (
              <>
                <p id="manga-authors-summary" className="chart-card__sr-only">
                  Auteurs AniList sur la période, avec leur rôle dominant et un aperçu des titres.
                </p>
                <div className="list-tab-authors-grid stagger-reveal">
                  {authorsVisibleRows.map((author) => {
                    const periodRank = authorPeriodRankById.get(author.id) ?? 0;
                    return (
                      <article key={author.id} className="list-tab-author-card">
                        <div className="list-tab-author-card__top">
                          <div className="list-tab-author-card__head">
                            <div className="list-tab-author-card__identity">
                              <div className="list-tab-author-card__portrait-wrap">
                                {author.imageUrl ? (
                                  <img
                                    className="list-tab-author-card__portrait"
                                    src={author.imageUrl}
                                    alt=""
                                    loading="lazy"
                                    decoding="async"
                                  />
                                ) : (
                                  <div className="list-tab-author-card__portrait-fallback" aria-hidden>
                                    {author.name.slice(0, 1).toUpperCase()}
                                  </div>
                                )}
                              </div>
                              <div className="list-tab-author-card__name-block">
                                <div className="list-tab-author-card__name" title={author.name}>
                                  {author.siteUrl ? (
                                    <a
                                      href={author.siteUrl}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="list-tab-author-card__name-link"
                                    >
                                      {author.name}
                                    </a>
                                  ) : (
                                    author.name
                                  )}
                                </div>
                                {author.primaryRoleLabel ? (
                                  <div className="list-tab-author-card__role">
                                    {author.primaryRoleLabel}
                                  </div>
                                ) : null}
                              </div>
                            </div>
                            {periodRank > 0 ? (
                              <div
                                className="list-tab-author-card__rank"
                                title={`${periodRank}${periodRank === 1 ? "er" : "e"} sur la période (titres, puis note moyenne)`}
                                aria-label={`Classement sur la période : ${periodRank} sur ${mangaTopAuthors.length}`}
                              >
                                {periodRank}
                              </div>
                            ) : null}
                          </div>
                          <div className="list-tab-author-card__stats">
                            <div className="list-tab-author-stat">
                              <div className="list-tab-author-stat__value">{author.count}</div>
                              <div className="list-tab-author-stat__label">Titres</div>
                            </div>
                            <div className="list-tab-author-stat">
                              <div className="list-tab-author-stat__value">
                                {author.meanUserScore > 0 ? author.meanUserScore.toFixed(1) : "—"}
                              </div>
                              <div className="list-tab-author-stat__label">Score moyen</div>
                            </div>
                            <div className="list-tab-author-stat">
                              <div className="list-tab-author-stat__value list-tab-author-stat__value--chapters">
                                {author.chaptersRead}
                              </div>
                              <div className="list-tab-author-stat__label">Chapitres lus</div>
                            </div>
                          </div>
                        </div>
                        <div
                          className="list-tab-author-card__carousel"
                          aria-label={`Titres lus de ${author.name}`}
                        >
                          {author.carouselMedia.map((media) => {
                            const cover = media.coverImageUrl ? (
                              <img
                                className="list-tab-author-card__cover"
                                src={media.coverImageUrl}
                                alt=""
                                loading="lazy"
                                decoding="async"
                              />
                            ) : (
                              <div className="list-tab-author-card__cover list-tab-author-card__cover--fallback" />
                            );
                            if (media.anilistUrl) {
                              return (
                                <a
                                  key={media.id}
                                  href={media.anilistUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="list-tab-author-card__carousel-item list-tab-author-card__carousel-link"
                                  title={media.title}
                                  aria-label={`${media.title} sur AniList`}
                                >
                                  {cover}
                                </a>
                              );
                            }
                            return (
                              <div
                                key={media.id}
                                className="list-tab-author-card__carousel-item"
                                title={media.title}
                              >
                                {cover}
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                </div>
                {authorsHasMore ? (
                  <div className="list-tab-authors-actions">
                    <button
                      type="button"
                      className="list-tab-anime-more-btn list-tab-anime-more-btn--authors-toggle"
                      onClick={() => setAuthorsExpanded((v) => !v)}
                      aria-expanded={authorsExpanded}
                    >
                      <span>{authorsExpanded ? "Voir moins" : "Voir plus"}</span>
                      <svg
                        className="list-tab-anime-more-btn__icon"
                        width="20"
                        height="20"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden
                      >
                        {authorsExpanded ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
                      </svg>
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                icon="book"
                title="Aucun auteur listé par l'API pour cette sélection."
                cta={viewFullYearCta}
              />
            )}
          </div>
        </div>
      </section>
    </div>
    </div>
  );
});

function MangaRecordsSection({ records }: { records: PeriodRecordsBundle }) {
  const cards: ReactNode[] = [];

  if (records.longestCompleted) {
    cards.push(
      <RecordCard
        key="longest"
        icon="trophy"
        label="Plus longue série complétée"
        value={`${records.longestCompleted.count} chapitre${records.longestCompleted.count > 1 ? "s" : ""}`}
        media={records.longestCompleted.media}
      />
    );
  }
  if (records.highestScore) {
    cards.push(
      <RecordCard
        key="high"
        icon="star"
        label="Plus haute note attribuée"
        value={`${records.highestScore.score.toFixed(1)} / 10`}
        media={records.highestScore.media}
      />
    );
  }
  if (records.lowestScore) {
    cards.push(
      <RecordCard
        key="low"
        icon="thumbs-down"
        label="Plus basse note attribuée"
        value={`${records.lowestScore.score.toFixed(1)} / 10`}
        media={records.lowestScore.media}
      />
    );
  }
  if (records.biggestSession) {
    cards.push(
      <RecordCard
        key="biggest"
        icon="bolt"
        label="Plus grosse session"
        value={`${records.biggestSession.count} chapitre${records.biggestSession.count > 1 ? "s" : ""}`}
        sub={`Le ${records.biggestSession.dateLabel}`}
        labelHint="Plus grand nombre de chapitres lus en un seul jour de la période sélectionnée."
      />
    );
  }
  if (records.firstStarted) {
    cards.push(
      <RecordCard
        key="first"
        icon="flag"
        label="Première nouvelle série"
        value={records.firstStarted.dateLabel}
        media={records.firstStarted.media}
        labelHint="Premier manga commencé (date startedAt la plus ancienne) durant la période sélectionnée."
      />
    );
  }
  if (records.lastStarted) {
    cards.push(
      <RecordCard
        key="last"
        icon="check"
        label="Dernière nouvelle série"
        value={records.lastStarted.dateLabel}
        media={records.lastStarted.media}
        labelHint="Dernier manga commencé (date startedAt la plus récente) durant la période sélectionnée."
      />
    );
  }
  if (records.worksStartedInPeriod) {
    const n = records.worksStartedInPeriod.count;
    cards.push(
      <RecordCard
        key="works-started"
        icon="stack"
        label="Œuvres commencées"
        value={`${n} œuvre${n > 1 ? "s" : ""}`}
        mediaStack={records.worksStartedInPeriod.spotlight.map((r) => ({
          id: r.id,
          title: r.title,
          coverImageUrl: r.coverImageUrl,
          coverColor: r.coverColor,
          anilistUrl: r.anilistUrl,
        }))}
        labelHint="Titres distincts dont la date de début sur la liste (startedAt) tombe dans la période sélectionnée. Vignettes : vos meilleures notes, sinon les meilleures moyennes AniList."
      />
    );
  }
  if (records.worksCompletedInPeriod) {
    const n = records.worksCompletedInPeriod.count;
    cards.push(
      <RecordCard
        key="works-completed"
        icon="check"
        label="Œuvres terminées"
        value={`${n} œuvre${n > 1 ? "s" : ""}`}
        mediaStack={records.worksCompletedInPeriod.spotlight.map((r) => ({
          id: r.id,
          title: r.title,
          coverImageUrl: r.coverImageUrl,
          coverColor: r.coverColor,
          anilistUrl: r.anilistUrl,
        }))}
        labelHint="Titres passés en « terminé » avec une date de complétion (completedAt) dans la période sélectionnée. Vignettes : vos meilleures notes, sinon les meilleures moyennes AniList."
      />
    );
  }
  if (records.firstActivity) {
    cards.push(
      <RecordCard
        key="first-activity"
        icon="calendar"
        label="Première activité"
        value={records.firstActivity.dateLabel}
        media={records.firstActivity.media}
        labelHint="Toute première activité manga de la période (chapitre lu, volume complété, changement de statut), nouvelle série ou non."
      />
    );
  }
  if (records.lastActivity) {
    cards.push(
      <RecordCard
        key="last-activity"
        icon="clock"
        label="Dernière activité"
        value={records.lastActivity.dateLabel}
        media={records.lastActivity.media}
        labelHint="Toute dernière activité manga enregistrée sur la période, peu importe qu'il s'agisse d'une nouvelle série ou d'une série en cours."
      />
    );
  }
  if (records.biggestOpinionGap) {
    const deltaSign = records.biggestOpinionGap.userScore >= records.biggestOpinionGap.averageScore ? "+" : "\u2212";
    cards.push(
      <RecordCard
        key="opinion-gap"
        icon="divide"
        label="Écart d'opinion maximal"
        value={`${deltaSign}${records.biggestOpinionGap.gap.toFixed(1)}`}
        media={{
          ...records.biggestOpinionGap.media,
          meta: `Vous ${records.biggestOpinionGap.userScore.toFixed(1)} · AniList ${records.biggestOpinionGap.averageScore.toFixed(1)}`,
        }}
        labelHint="Plus grand écart absolu entre votre note et la moyenne AniList, ramenées sur 10."
      />
    );
  }
  if (records.mostPromisingPlanned) {
    cards.push(
      <RecordCard
        key="promising-planned"
        icon="flag"
        label="Planifié le plus prometteur"
        value={`${records.mostPromisingPlanned.averageScore.toFixed(1)} / 10`}
        media={records.mostPromisingPlanned.media}
        labelHint="Manga planifié avec la meilleure moyenne globale AniList. Disponible surtout en All Time."
      />
    );
  }
  if (records.fastestCompleted) {
    cards.push(
      <RecordCard
        key="fast"
        icon="rocket"
        label="Plus rapide à terminer"
        value={records.fastestCompleted.days === 0 ? "En 1 journée" : `${records.fastestCompleted.days} jour${records.fastestCompleted.days > 1 ? "s" : ""}`}
        media={records.fastestCompleted.media}
        labelHint="Durée la plus courte entre la date de début (startedAt) et la date de fin (completedAt)."
      />
    );
  }
  if (records.longestStreak) {
    cards.push(
      <RecordCard
        key="streak"
        icon="flame"
        label="Plus longue série de jours"
        value={`${records.longestStreak.length} jour${records.longestStreak.length > 1 ? "s" : ""}`}
        sub={
          records.longestStreak.length === 1
            ? `Le ${records.longestStreak.startDateLabel}`
            : `Du ${records.longestStreak.startDateLabel} au ${records.longestStreak.endDateLabel}`
        }
        labelHint="Plus long enchaînement de jours consécutifs avec au moins une activité (chapitre lu) sur la période."
      />
    );
  }

  return (
    <RecordsCarouselSection
      sectionId="manga-records"
      titleId="manga-records-title"
      title="Records & faits marquants"
      cards={cards}
      collapseId="manga.records"
    />
  );
}
