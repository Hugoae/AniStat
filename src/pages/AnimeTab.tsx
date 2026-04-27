import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import {
  BarChart,
  Bar,
  Cell,
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
import { C, PIE_COLORS, STATUS_LABELS, STATUS_COLORS } from "../config/constants";
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
import { RecordCard } from "../components/appUi/RecordCard";
import { RecordsCarouselSection } from "../components/appUi/RecordsCarouselSection";
import { CollapsibleChartBlock } from "../components/appUi/CollapsibleChartBlock";
import { ChartCollapseToggle } from "../components/appUi/ChartCollapseToggle";
import { useCollapsedChart } from "../hooks/useCollapsedChart";
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
import { RechartsWhenVisible } from "../components/RechartsWhenVisible";
import { AnimePieDistributionCard } from "../components/AnimePieDistributionCard";
import { ScoreScatterCard } from "../components/ScoreScatterCard";
import { TopTagsCard, type TopTagsRow } from "../components/TopTagsCard";
import { ActivityHeatmap, type DailyTotalsByIso } from "../components/ActivityHeatmap";
import { resolveLocalStudioLogoUrl } from "../lib/studioLogos";
import type { AniListEntry, PeriodRecordsBundle } from "../types/domain";

export type AnimeTabProps = {
  year: number;
  month: number;
  setMonth: (m: number) => void;
  animeEntriesLength: number;
  totalEp: number;
  totalMin: number;
  fmtMin: (min: number) => string;
  avgA: string;
  animeVsCommunityScoreStdDev: string;
  animeStatusEntriesOrdered: [string, number][];
  animeCountryEntriesOrdered: [string, number][];
  fmtData: { name: string; value: number }[];
  animeTabEntries: AniListEntry[];
  animePlanningEntries: AniListEntry[];
  animeScoreHalfDistributionRows: { bucket: number; label: string; count: number }[];
  animeGenrePeriodData: { name: string; count: number }[];
  animeTopTagsData: TopTagsRow[];
  animeEpisodesByFormatData: { name: string; episodes: number }[];
  animeMinutesByFormatData: { name: string; minutes: number }[];
  animeEpisodesByCountryData: { code: string; episodes: number }[];
  animeMinutesByCountryData: { code: string; minutes: number }[];
  animeTopStudios: {
    name: string;
    anilistStudioId: number | null;
    count: number;
    meanUserScore: number;
    minutesWatched: number;
    topMedia: { id: number; title: string; coverImageUrl: string | null; anilistUrl: string | null }[];
    carouselMedia: { id: number; title: string; coverImageUrl: string | null; anilistUrl: string | null }[];
  }[];
  animeReleaseYearHistogram: { yearLabel: string; count: number }[];
  animeSeasonHistogram: { key: string; name: string; count: number }[];
  animeRecords: PeriodRecordsBundle;
  /** Activité quotidienne anime de l'année courante (clé YYYY-MM-DD → épisodes). */
  animeDailyTotalsForYear: DailyTotalsByIso;
  /** Évite de mesurer la grille quand l’onglet est masqué (largeur 0). */
  animeListLayoutActive: boolean;
};

export function AnimeTab({
  year,
  month,
  setMonth,
  animeEntriesLength,
  totalEp,
  totalMin,
  fmtMin,
  avgA,
  animeVsCommunityScoreStdDev,
  animeStatusEntriesOrdered,
  animeCountryEntriesOrdered,
  fmtData,
  animeTabEntries,
  animePlanningEntries,
  animeScoreHalfDistributionRows,
  animeGenrePeriodData,
  animeTopTagsData,
  animeEpisodesByFormatData,
  animeMinutesByFormatData,
  animeEpisodesByCountryData,
  animeMinutesByCountryData,
  animeTopStudios,
  animeReleaseYearHistogram,
  animeSeasonHistogram,
  animeRecords,
  animeDailyTotalsForYear,
  animeListLayoutActive,
}: AnimeTabProps) {
  /* ─── État local : UI-only (toggles, filtres, tri, largeur mesurée) ──
   * Tout le « métier » (entrées, stats, tops) arrive via les props, calculé
   * en amont par `App.tsx`. Ici on ne gère que l'état d'affichage propre à
   * l'onglet Anime. */
  const animeStudiosCollapse = useCollapsedChart("anime.studios");
  const [studiosExpanded, setStudiosExpanded] = useState(false);
  const [studioLogoByName, setStudioLogoByName] = useState<Record<string, string>>({});
  const [animeListExpanded, setAnimeListExpanded] = useState(false);
  const [animeListGridWidth, setAnimeListGridWidth] = useState(0);
  const animeMediaGridRef = useRef<HTMLDivElement | null>(null);
  const [animeSearchQuery, setAnimeSearchQuery] = useState("");
  const [animeSortKey, setAnimeSortKey] = useState<AnimeGridSortKey>(ANIME_GRID_SORT_DEFAULT);
  const [animeFilterScoredOnly, setAnimeFilterScoredOnly] = useState(false);
  const [animeFilterCompletedOnly, setAnimeFilterCompletedOnly] = useState(false);
  const [animeFilterCurrentOnly, setAnimeFilterCurrentOnly] = useState(false);
  const [animeFilterDroppedOnly, setAnimeFilterDroppedOnly] = useState(false);
  const [animeFilterPlanningOnly, setAnimeFilterPlanningOnly] = useState(false);
  const [animePlanningVisible, setAnimePlanningVisible] = useState(false);

  const viewFullYearCta =
    month !== 0 ? (
      <button type="button" className="list-tab-empty-cta" onClick={() => setMonth(0)}>
        Voir toute l&apos;année {year}
      </button>
    ) : null;
  const periodYearLabel = year === 0 ? "All Time" : String(year);
  const isAllTime = year === 0;

  const animeSearchNormalized = useMemo(
    () => normalizeAnimeSearchText(animeSearchQuery),
    [animeSearchQuery]
  );
  const compareByAverageScoreDesc = useCallback((a: AniListEntry, b: AniListEntry) => {
    const avgA = Number(a.media?.averageScore) || 0;
    const avgB = Number(b.media?.averageScore) || 0;
    if (avgB !== avgA) return avgB - avgA;
    return compareAnimeGridEntries(a, b, "title-asc");
  }, []);

  const animeGridSorted = useMemo(
    () => {
      const normalBase = filterAnimeGridEntries(animeTabEntries, {
        normalizedSearch: animeSearchNormalized,
        scoredOnly: animeFilterScoredOnly,
        completedOnly: !isAllTime && animeFilterCompletedOnly,
      });
      if (!isAllTime) return [...normalBase].sort((a, b) => compareAnimeGridEntries(a, b, animeSortKey));
      const planningBase = filterAnimeGridEntries(animePlanningEntries, {
        normalizedSearch: animeSearchNormalized,
        scoredOnly: animeFilterScoredOnly,
        completedOnly: false,
      }).sort(compareByAverageScoreDesc);
      const statusFilters = [
        animeFilterCompletedOnly && "COMPLETED",
        animeFilterCurrentOnly && "CURRENT",
        animeFilterDroppedOnly && "DROPPED",
        animeFilterPlanningOnly && "PLANNING",
      ].filter(Boolean);
      if (statusFilters.length > 0) {
        const selected = [...normalBase, ...planningBase].filter((entry) => statusFilters.includes(String(entry.status)));
        if (statusFilters.length === 1 && statusFilters[0] === "PLANNING") return selected.sort(compareByAverageScoreDesc);
        return selected.sort((a, b) => compareAnimeGridEntries(a, b, animeSortKey));
      }
      const normalSorted = [...normalBase].sort((a, b) => compareAnimeGridEntries(a, b, animeSortKey));
      return animePlanningVisible ? [...normalSorted, ...planningBase] : normalSorted;
    },
    [
      animeTabEntries,
      animePlanningEntries,
      animeSearchNormalized,
      animeFilterScoredOnly,
      animeFilterCompletedOnly,
      animeFilterCurrentOnly,
      animeFilterDroppedOnly,
      animeFilterPlanningOnly,
      animePlanningVisible,
      animeSortKey,
      compareByAverageScoreDesc,
      isAllTime,
    ]
  );

  const animePlanningFilteredSorted = useMemo(
    () =>
      filterAnimeGridEntries(animePlanningEntries, {
        normalizedSearch: animeSearchNormalized,
        scoredOnly: animeFilterScoredOnly,
        completedOnly: false,
      }).sort(compareByAverageScoreDesc),
    [animePlanningEntries, animeSearchNormalized, animeFilterScoredOnly, compareByAverageScoreDesc]
  );

  /** Colonnes = cartes 155px + gap 14px (aligné sur .list-tab-media-grid). */
  const animeListGridColumns = useMemo(() => {
    const w = animeListGridWidth;
    if (!Number.isFinite(w) || w <= 0) return 1;
    const cell = LIST_TAB_ANIME_CARD_WIDTH + LIST_TAB_ANIME_GRID_GAP;
    return Math.max(1, Math.floor((w + LIST_TAB_ANIME_GRID_GAP) / cell));
  }, [animeListGridWidth]);
  const animeListCollapsedMax = animeListGridColumns * LIST_TAB_ANIME_VISIBLE_ROWS;
  const animeListHasStatusFilter =
    animeFilterCompletedOnly || animeFilterCurrentOnly || animeFilterDroppedOnly || animeFilterPlanningOnly;
  const animeListNeedsMoreLess =
    !animeListHasStatusFilter && !animePlanningVisible && animeGridSorted.length > animeListCollapsedMax;
  const animeCanRevealPlanning =
    isAllTime &&
    !animeListHasStatusFilter &&
    !animePlanningVisible &&
    animePlanningFilteredSorted.length > 0 &&
    (!animeListNeedsMoreLess || animeListExpanded);
  const animeListToShow = useMemo(() => {
    if (animeListHasStatusFilter) return animeGridSorted;
    if (animePlanningVisible) return animeGridSorted;
    if (!animeListNeedsMoreLess || animeListExpanded) return animeGridSorted;
    return animeGridSorted.slice(0, animeListCollapsedMax);
  }, [
    animeGridSorted,
    animeListHasStatusFilter,
    animePlanningVisible,
    animeListNeedsMoreLess,
    animeListExpanded,
    animeListCollapsedMax,
  ]);

  /*
   * Mesure dynamique de la largeur de la grille pour en déduire le nombre
   * de colonnes (aligné sur la grille CSS). Ne s'active que lorsque
   * l'onglet est visible (`animeListLayoutActive = true`) : mesurer une
   * grille masquée renverrait 0 et casserait le calcul.
   */
  useLayoutEffect(() => {
    if (!animeListLayoutActive) return undefined;
    const el = animeMediaGridRef.current;
    if (!el) return undefined;
    const apply = () => {
      const w = el.clientWidth;
      if (typeof w === "number" && Number.isFinite(w)) setAnimeListGridWidth(w);
    };
    apply();
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      const w = cr?.width;
      if (typeof w === "number" && Number.isFinite(w)) setAnimeListGridWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [animeListLayoutActive, animeGridSorted.length]);

  /* Au changement de période, on remet tous les filtres et tris à zéro :
   * sinon l'utilisateur verrait une liste filtrée/triée avec une sélection
   * qui n'a pas de sens pour la nouvelle période. */
  useEffect(() => {
    setAnimeListExpanded(false);
    setAnimeSearchQuery("");
    setAnimeSortKey(ANIME_GRID_SORT_DEFAULT);
    setAnimeFilterScoredOnly(false);
    setAnimeFilterCompletedOnly(false);
    setAnimeFilterCurrentOnly(false);
    setAnimeFilterDroppedOnly(false);
    setAnimeFilterPlanningOnly(false);
    setAnimePlanningVisible(false);
  }, [year, month]);
  const formatEpisodesByName = useMemo(
    () =>
      new Map(
        animeEpisodesByFormatData.map((row) => [String(row.name), Number(row.episodes) || 0] as const)
      ),
    [animeEpisodesByFormatData]
  );
  const countryEpisodesByCode = useMemo(
    () =>
      new Map(
        animeEpisodesByCountryData.map((row) => [String(row.code), Number(row.episodes) || 0] as const)
      ),
    [animeEpisodesByCountryData]
  );
  const formatEpisodesLabel = useCallback((episodesRaw: number) => {
    const ep = Math.max(0, Math.round(Number(episodesRaw) || 0));
    return `${ep} épisode${ep > 1 ? "s" : ""} vu${ep > 1 ? "s" : ""}`;
  }, []);
  const formatTimeLabel = useCallback(
    (minutesRaw: number) => fmtMin(Math.max(0, Math.round(Number(minutesRaw) || 0))),
    [fmtMin]
  );

  const formatPieSlicesByTitles = useMemo(
    () =>
      fmtData.map((row, i) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: row.value,
        fill: PIE_COLORS[i % PIE_COLORS.length],
        extraInfo: formatEpisodesLabel(formatEpisodesByName.get(String(row.name)) || 0),
      })),
    [fmtData, formatEpisodesByName, formatEpisodesLabel]
  );
  const formatPieSlicesByEpisodes = useMemo(() => {
    const minutesByName = new Map(
      animeMinutesByFormatData.map((row) => [String(row.name), Number(row.minutes) || 0] as const)
    );
    return animeEpisodesByFormatData
      .filter((row) => Number(row.episodes) > 0)
      .map((row, i) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: Number(row.episodes) || 0,
        fill: PIE_COLORS[i % PIE_COLORS.length],
        extraInfo: formatTimeLabel(minutesByName.get(String(row.name)) || 0),
      }));
  }, [animeEpisodesByFormatData, animeMinutesByFormatData, formatTimeLabel]);

  const countryPieSlicesByTitles = useMemo(
    () =>
      animeCountryEntriesOrdered.map(([code, c], i) => {
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code);
        const label = meta ? meta.label : "Inconnu";
        return {
          key: code,
          label,
          value: c,
          fill: PIE_COLORS[i % PIE_COLORS.length],
          flagCode: meta?.code,
          extraInfo: formatEpisodesLabel(countryEpisodesByCode.get(code) || 0),
        };
      }),
    [animeCountryEntriesOrdered, countryEpisodesByCode, formatEpisodesLabel]
  );
  const countryPieSlicesByEpisodes = useMemo(() => {
    const minutesByCode = new Map(
      animeMinutesByCountryData.map((row) => [String(row.code), Number(row.minutes) || 0] as const)
    );
    return animeEpisodesByCountryData
      .filter((row) => Number(row.episodes) > 0)
      .map((row, i) => {
        const code = String(row.code);
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code);
        const label = meta ? meta.label : "Inconnu";
        return {
          key: code,
          label,
          value: Number(row.episodes) || 0,
          fill: PIE_COLORS[i % PIE_COLORS.length],
          flagCode: meta?.code,
          extraInfo: formatTimeLabel(minutesByCode.get(code) || 0),
        };
      });
  }, [animeEpisodesByCountryData, animeMinutesByCountryData, formatTimeLabel]);
  const statusPieSlices = useMemo(
    () =>
      animeStatusEntriesOrdered.map(([status, value], i) => ({
        key: status,
        label: STATUS_LABELS[status] || status,
        value,
        fill: STATUS_COLORS[status] || PIE_COLORS[i % PIE_COLORS.length],
        extraInfo: `${value} titre${value > 1 ? "s" : ""}`,
      })),
    [animeStatusEntriesOrdered]
  );
  const animeDurationBuckets = useMemo(() => {
    const rows = [
      { key: "short", label: "< 15 min", count: 0 },
      { key: "mid", label: "15-21 min", count: 0 },
      { key: "standard", label: "22-25 min", count: 0 },
      { key: "long", label: "26-45 min", count: 0 },
      { key: "feature", label: "> 45 min", count: 0 },
      { key: "unknown", label: "Inconnu", count: 0 },
    ];
    for (const entry of animeTabEntries) {
      const duration = Number(entry.media?.duration || 0);
      if (duration > 0 && duration < 15) rows[0].count += 1;
      else if (duration >= 15 && duration <= 21) rows[1].count += 1;
      else if (duration >= 22 && duration <= 25) rows[2].count += 1;
      else if (duration >= 26 && duration <= 45) rows[3].count += 1;
      else if (duration > 45) rows[4].count += 1;
      else rows[5].count += 1;
    }
    return rows.filter((row) => row.count > 0);
  }, [animeTabEntries]);
  const animeScoreHalfDistributionVisibleRows = useMemo(() => {
    if (animeScoreHalfDistributionRows.length === 0) return [];
    const nonZeroIndices = animeScoreHalfDistributionRows
      .map((row, idx) => (row.count > 0 ? idx : -1))
      .filter((idx) => idx >= 0);
    if (nonZeroIndices.length === 0) return [];
    const minIdx = nonZeroIndices[0];
    const maxIdx = nonZeroIndices[nonZeroIndices.length - 1];
    return animeScoreHalfDistributionRows.slice(minIdx, maxIdx + 1);
  }, [animeScoreHalfDistributionRows]);
  const studiosCollapsedCount = 6;
  const studiosVisibleRows = studiosExpanded
    ? animeTopStudios
    : animeTopStudios.slice(0, studiosCollapsedCount);
  const studiosHasMore = animeTopStudios.length > studiosCollapsedCount;
  const visibleStudioNames = useMemo(
    () => studiosVisibleRows.map((s) => s.name).filter(Boolean),
    [studiosVisibleRows]
  );
  const visibleStudioNamesKey = useMemo(() => visibleStudioNames.join("|"), [visibleStudioNames]);
  /** Classement sur la période : 1 = plus de titres anime, puis note moyenne perso, puis temps vu. */
  const studioPeriodRankByName = useMemo(() => {
    const m = new Map<string, number>();
    animeTopStudios.forEach((s, i) => m.set(s.name, i + 1));
    return m;
  }, [animeTopStudios]);

  /*
   * Résolution paresseuse des logos de studios (bundle public local). On
   * ne charge que les studios actuellement visibles (6 par défaut, plus
   * si l'utilisateur a dépilé) pour limiter les accès disque inutiles.
   * `visibleStudioNamesKey` sert de signature stable pour ne pas relancer
   * l'effet tant que la liste est identique.
   */
  useEffect(() => {
    if (visibleStudioNames.length === 0) {
      return;
    }
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const name of visibleStudioNames) {
        const local = await resolveLocalStudioLogoUrl(name);
        if (!cancelled && local) next[name] = local;
      }
      if (cancelled || Object.keys(next).length === 0) return;
      setStudioLogoByName((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
    /* `visibleStudioNames` est déjà capturé via la clé stable
     * `visibleStudioNamesKey` (jointure normalisée). Ajouter le tableau lui-
     * même en dep relancerait l'effet sur des références identiques en
     * contenu mais différentes en identité. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleStudioNamesKey]);

  /* Replier la liste étendue quand la période change (même logique que la
   * grille d'animes plus haut). */
  useEffect(() => {
    setStudiosExpanded(false);
  }, [year, month]);

  const sectionNavItems = useMemo(() => [
    { id: "anime-synthese", label: "Statistiques" },
    { id: "anime-repartition", label: "Liste des œuvres" },
    { id: "anime-records", label: "Records" },
    { id: "anime-graphiques", label: "Graphiques" },
    { id: "anime-studios", label: "Studios" },
  ], []);

  return (
    <div className="list-tab-shell">
    <ListTabSectionNav items={sectionNavItems} label="Navigation des sections anime" />
    <div className="list-tab-page">
      <div id="anime-synthese" className="overview-stats-cluster list-tab-anchor">
        <div className="fade-in stat-stat-al-row--overview">
          <StatCard label="Total anime" value={animeEntriesLength} icon="tv" />
          <StatCard label="Épisodes vus" value={totalEp} icon="play" />
          <StatCard label="Score moyen" value={avgA} icon="star" />
          <StatCard
            label="Dispersion (σ)"
            value={animeVsCommunityScoreStdDev}
            icon="divide"
            labelHint="Écart-type (σ) de vos écarts (votre note − moyenne AniList) sur la période, en points sur 10. C'est l'amplitude typique d'un écart, sans considérer son sens : 0 = vos notes collent à la moyenne du site, plus la valeur monte plus vos notes sont tranchées (au-dessus comme au-dessous). Pour savoir si vous sur- ou sous-notez en moyenne, regardez le graphique « Ta note vs note AniList » plus bas."
          />
          <StatCard label="Temps total" value={fmtMin(totalMin)} icon="clock" />
        </div>
      </div>

      {!isAllTime ? (
        <section
          id="anime-heatmap"
          className="fade-in list-tab-anchor"
          aria-labelledby="anime-heatmap-title"
        >
          <ActivityHeatmap
            year={year}
            title={`Calendrier d'activité anime ${periodYearLabel}`}
            dailyTotals={animeDailyTotalsForYear}
            unitSingular="épisode"
            unitPlural="épisodes"
            collapseId="anime.heatmap"
            titleHint="Chaque cellule représente une journée de l'année. La couleur indique le nombre d'épisodes vus ce jour-là (toutes activités anime AniList confondues, période ignorée). Survole une cellule pour voir le total exact."
          />
        </section>
      ) : null}

      <section
        id="anime-repartition"
        className="overview-section fade-in list-tab-distribution-section list-tab-anchor"
        aria-labelledby="anime-par-statut-title"
      >
        <div className="list-tab-distribution">
          <div className="list-tab-distribution__col">
            <SectionTitle size="lg" id="anime-par-statut-title">
              Par statut
            </SectionTitle>
            <div className="list-tab-distro-row">
              {animeStatusEntriesOrdered.map(([s, c]) => (
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
            <SectionTitle size="lg" id="anime-par-pays-title">
              Par pays d’origine
            </SectionTitle>
            <div className="list-tab-distro-row">
                {animeCountryEntriesOrdered.map(([code, c]) => {
                const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code);
                const label = meta ? meta.label : "Inconnu";
                const a11yCountry = meta ? meta.label : "pays inconnu";
                const countStr = String(c);
                return (
                  <div
                    key={code}
                    className="list-tab-origin-pill"
                    role="group"
                    aria-label={`${countStr} anime · ${a11yCountry}`}
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
            <SectionTitle size="lg" id="anime-par-format-title">
              Par format
            </SectionTitle>
            <div className="list-tab-distro-row">
              {fmtData.map(({ name, value: fv }) => (
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

      <div id="anime-liste" className="list-tab-anime-list list-tab-anchor">
        <div className="list-tab-anime-grid-toolbar" role="search">
          <div className="list-tab-anime-grid-toolbar__inner">
            <div className="list-tab-anime-grid-toolbar__search-block">
              <span className="list-tab-anime-grid-toolbar__eyebrow" id="anime-grid-search-label">
                Recherche
              </span>
              <div className="list-tab-anime-grid-toolbar__search-shell">
                <input
                  type="search"
                  id="anime-grid-search"
                  name="anime-grid-search"
                  className="list-tab-anime-grid-toolbar__input"
                  value={animeSearchQuery}
                  onChange={(ev) => setAnimeSearchQuery(ev.target.value)}
                  placeholder="Romaji ou anglais…"
                  autoComplete="off"
                  spellCheck={false}
                  aria-labelledby="anime-grid-search-label"
                />
              </div>
            </div>
            <div className="list-tab-anime-grid-toolbar__filter-group">
              <span className="list-tab-anime-grid-toolbar__eyebrow">Filtres</span>
              <div className="list-tab-anime-grid-toolbar__toggles" role="group" aria-label="Filtres liste">
                <button
                  type="button"
                  className={`list-tab-anime-grid-toolbar__toggle${animeFilterScoredOnly ? " is-active" : ""}`}
                  aria-pressed={animeFilterScoredOnly}
                  title="Afficher uniquement les titres avec une note"
                  onClick={() => setAnimeFilterScoredOnly((v) => !v)}
                >
                  Notés
                  {animeFilterScoredOnly ? (
                    <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
                <button
                  type="button"
                  className={`list-tab-anime-grid-toolbar__toggle${animeFilterCompletedOnly ? " is-active" : ""}`}
                  aria-pressed={animeFilterCompletedOnly}
                  title="Afficher uniquement les titres au statut terminé"
                  onClick={() => setAnimeFilterCompletedOnly((v) => !v)}
                >
                  Terminés
                  {animeFilterCompletedOnly ? (
                    <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                      ✓
                    </span>
                  ) : null}
                </button>
                {isAllTime ? (
                  <>
                    <button
                      type="button"
                      className={`list-tab-anime-grid-toolbar__toggle${animeFilterCurrentOnly ? " is-active" : ""}`}
                      aria-pressed={animeFilterCurrentOnly}
                      title="Afficher uniquement les titres en cours"
                      onClick={() => setAnimeFilterCurrentOnly((v) => !v)}
                    >
                      En cours
                      {animeFilterCurrentOnly ? (
                        <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className={`list-tab-anime-grid-toolbar__toggle${animeFilterDroppedOnly ? " is-active" : ""}`}
                      aria-pressed={animeFilterDroppedOnly}
                      title="Afficher uniquement les titres abandonnés"
                      onClick={() => setAnimeFilterDroppedOnly((v) => !v)}
                    >
                      Abandonnés
                      {animeFilterDroppedOnly ? (
                        <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                          ✓
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className={`list-tab-anime-grid-toolbar__toggle${animeFilterPlanningOnly ? " is-active" : ""}`}
                      aria-pressed={animeFilterPlanningOnly}
                      title="Afficher uniquement les titres planifiés"
                      onClick={() => {
                        setAnimePlanningVisible(false);
                        setAnimeFilterPlanningOnly((v) => !v);
                      }}
                    >
                      Planifiés
                      {animeFilterPlanningOnly ? (
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
              <span className="list-tab-anime-grid-toolbar__eyebrow" id="anime-grid-sort-label">
                Trier par
              </span>
              <div className="list-tab-anime-grid-toolbar__select-shell">
                <select
                  id="anime-grid-sort"
                  name="anime-grid-sort"
                  className="list-tab-anime-grid-toolbar__select"
                  value={animeSortKey}
                  onChange={(ev) => setAnimeSortKey(ev.target.value as AnimeGridSortKey)}
                  aria-labelledby="anime-grid-sort-label"
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
        {(animeTabEntries.length > 0 || animePlanningEntries.length > 0) && animeGridSorted.length === 0 ? (
          <EmptyState
            compact
            icon="flag"
            title="Aucun titre ne correspond aux filtres."
            cta={
              <button
                type="button"
                className="list-tab-empty-cta"
                onClick={() => {
                  setAnimeSearchQuery("");
                  setAnimeFilterScoredOnly(false);
                  setAnimeFilterCompletedOnly(false);
                  setAnimeFilterCurrentOnly(false);
                  setAnimeFilterDroppedOnly(false);
                  setAnimeFilterPlanningOnly(false);
                  setAnimePlanningVisible(false);
                }}
              >
                Réinitialiser filtres
              </button>
            }
          />
        ) : null}
        <div
          ref={animeMediaGridRef}
          className="list-tab-media-grid stagger-reveal"
          style={
            {
              "--anime-grid-cols": animeListGridColumns,
              "--anime-grid-gap": `${LIST_TAB_ANIME_GRID_GAP}px`,
            } as CSSProperties
          }
        >
          {animeListToShow.map((e) => (
            <MediaCard key={e.id} entry={e} type="ANIME" deferCover />
          ))}
        </div>
        {(animeListNeedsMoreLess && !animeListExpanded) || animeCanRevealPlanning ? (
          <button
            type="button"
            className="list-tab-anime-more-btn"
            onClick={() => {
              if (animeListNeedsMoreLess && !animeListExpanded) setAnimeListExpanded(true);
              else setAnimePlanningVisible(true);
            }}
            aria-expanded={animeCanRevealPlanning ? animePlanningVisible : false}
          >
            <span>{animeCanRevealPlanning ? "Voir œuvres planifiées" : "Voir plus"}</span>
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
        {((animeListNeedsMoreLess && animeListExpanded && !animeCanRevealPlanning) || animePlanningVisible) ? (
          <button
            type="button"
            className="list-tab-anime-more-btn list-tab-anime-more-btn--collapse"
            onClick={() => {
              setAnimePlanningVisible(false);
              setAnimeListExpanded(false);
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

      <AnimeRecordsSection records={animeRecords} />

      <div
        key={`anime-viz-${year}-${month}`}
        className="list-tab-anime-viz-reveal"
      >
      <div id="anime-graphiques" className="list-tab-anime-charts-section list-tab-anchor">
        <div className="list-tab-anime-charts list-tab-anime-charts--two">
        <CollapsibleChartBlock
          id="anime.scores"
          title="Répartition des scores"
          withHint
          titleAside={
            <StatLabelHint text="Chaque note est ramenée au demi-point le plus proche avant d’être comptée (ex. 7,2 → 7 ; 7,8 → 8 ; 8,25 → 8,5)" />
          }
        >
        <ChartCard
          noTitle
          className="list-tab-anime-chart--scores"
          screenReaderSummary="Histogramme des scores : effectifs par tranche de demi-point de 1 à 10 pour les anime notés sur la période."
          dataTable={{
            caption: "Répartition des scores anime",
            columns: ["Score", "Anime"],
            rows: animeScoreHalfDistributionVisibleRows.map((row) => [row.label, row.count]),
          }}
        >
          {animeScoreHalfDistributionVisibleRows.length > 0 ? (
            <div className="list-tab-anime-score-chart-wrap">
              <RechartsWhenVisible height={260} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={animeScoreHalfDistributionVisibleRows}
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
                    <Bar dataKey="count" name="Anime" fill={C.accent} radius={[8, 8, 0, 0]} maxBarSize={40}>
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
              title="Aucun score sur les anime de cette période."
              cta={viewFullYearCta}
            />
          )}
        </ChartCard>
        </CollapsibleChartBlock>

          <CollapsibleChartBlock id="anime.genres" title="Genres">
          <ChartCard
            noTitle
            screenReaderSummary="Radar des dix genres les plus fréquents sur les anime de la période."
            dataTable={{
              caption: "Genres anime les plus fréquents",
              columns: ["Genre", "Titres"],
              rows: animeGenrePeriodData.slice(0, ANIME_GENRE_RADAR_TOP_N).map((row) => [row.name, row.count]),
            }}
          >
            {animeGenrePeriodData.length > 0 ? (
              <RechartsWhenVisible height={260} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={260}>
                  <RadarChart data={animeGenrePeriodData.slice(0, ANIME_GENRE_RADAR_TOP_N)} outerRadius="88%">
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
                title="Aucun genre renseigné pour les anime de cette période."
                cta={viewFullYearCta}
              />
            )}
          </ChartCard>
          </CollapsibleChartBlock>
        </div>

        <div className="list-tab-anime-charts">
          <ScoreScatterCard
            entries={animeTabEntries}
            kind="anime"
            emptyExtra={viewFullYearCta}
            collapseId="anime.scatter"
          />
        </div>

        <div className="list-tab-anime-charts">
          <TopTagsCard
            tags={animeTopTagsData}
            kind="anime"
            emptyExtra={viewFullYearCta}
            collapseId="anime.topTags"
          />
        </div>

        <div className="list-tab-anime-charts list-tab-anime-charts--two">
          <CollapsibleChartBlock id="anime.releaseYear" title="Année de sortie">
          <ChartCard
            noTitle
            screenReaderSummary="Nombre d’anime de la période par année de sortie (seasonYear ou date de début)."
            dataTable={{
              caption: "Anime par année de sortie",
              columns: ["Année", "Titres"],
              rows: animeReleaseYearHistogram.map((row) => [row.yearLabel, row.count]),
            }}
          >
            {animeReleaseYearHistogram.length > 0 ? (
              <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={212}>
                  <LineChart data={animeReleaseYearHistogram} margin={{ top: 14, right: 12, left: 0, bottom: 4 }}>
                    <defs>
                      <linearGradient id="anime-release-year-fill" x1="0" y1="0" x2="0" y2="1">
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
                      name="Anime"
                      stroke="none"
                      fill="url(#anime-release-year-fill)"
                      baseValue={0}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name="Anime"
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

          <CollapsibleChartBlock id="anime.season" title="Saison de diffusion">
            <ChartCard
              noTitle
              screenReaderSummary="Répartition des anime de la période par saison de diffusion AniList (hiver, printemps, été, automne)."
              dataTable={{
                caption: "Anime par saison de diffusion",
                columns: ["Saison", "Titres"],
                rows: animeSeasonHistogram.map((row) => [row.name, row.count]),
              }}
            >
              {animeSeasonHistogram.length > 0 ? (
                <div className="list-tab-anime-score-chart-wrap">
                  <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                    <ResponsiveContainer width="100%" height={212}>
                      <BarChart
                        data={animeSeasonHistogram.map((row) => ({
                          label: row.name,
                          count: row.count,
                        }))}
                        margin={{ top: 22, right: 8, left: 4, bottom: 2 }}
                        barCategoryGap="18%"
                      >
                        <CartesianGrid
                          strokeDasharray="3 6"
                          horizontal
                          vertical={false}
                          stroke="rgba(139, 160, 178, 0.12)"
                        />
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
                        <Bar dataKey="count" name="Titres" radius={[8, 8, 0, 0]} maxBarSize={48}>
                          {animeSeasonHistogram.map((row, i) => (
                            <Cell key={row.key} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                          ))}
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
                <EmptyState
                  icon="calendar"
                  title="Aucune saison à afficher pour cette sélection."
                  cta={viewFullYearCta}
                />
              )}
            </ChartCard>
          </CollapsibleChartBlock>
        </div>

      </div>

      <div id="anime-camemberts" className="list-tab-anime-pie-bottom list-tab-anchor">
        <div className="list-tab-pie-pair">
          <AnimePieDistributionCard
            title="Répartition par format"
            screenReaderSummary="Camembert des formats sur la période."
            emptyExtra={viewFullYearCta}
            defaultModeKey="titles"
            collapseId="anime.format"
            modes={[
              {
                key: "titles",
                label: "Titres",
                unitSingular: "titre",
                unitPlural: "titres",
                slices: formatPieSlicesByTitles,
                footnote:
                  "Le pourcentage représente la part de titres, le nombre d’épisodes vus est une information complémentaire.",
              },
              {
                key: "episodes",
                label: "Épisodes",
                unitSingular: "épisode vu",
                unitPlural: "épisodes vus",
                slices: formatPieSlicesByEpisodes,
                footnote:
                  "Le pourcentage représente la part d’épisodes vus, le nombre de titres est une information complémentaire.",
              },
            ]}
          />
          <AnimePieDistributionCard
            title="Pays d’origine"
            screenReaderSummary="Camembert des pays d’origine des anime sur la période."
            emptyExtra={viewFullYearCta}
            defaultModeKey="titles"
            collapseId="anime.country"
            modes={[
              {
                key: "titles",
                label: "Titres",
                unitSingular: "titre",
                unitPlural: "titres",
                slices: countryPieSlicesByTitles,
                footnote:
                  "Le pourcentage représente la part de titres, le nombre d’épisodes vus est une information complémentaire.",
              },
              {
                key: "episodes",
                label: "Épisodes",
                unitSingular: "épisode vu",
                unitPlural: "épisodes vus",
                slices: countryPieSlicesByEpisodes,
                footnote:
                  "Le pourcentage représente la part d’épisodes vus, le nombre de titres est une information complémentaire.",
              },
            ]}
          />
        </div>
        {isAllTime ? (
          <div className="list-tab-pie-pair list-tab-alltime-extra-charts">
            <AnimePieDistributionCard
              title="Répartition par statut"
              screenReaderSummary="Camembert des statuts anime All Time, incluant terminés, en cours, abandonnés et planifiés."
              defaultModeKey="titles"
              collapseId="anime.statusAllTime"
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
            <CollapsibleChartBlock id="anime.durationBuckets" title="Durée des épisodes">
              <ChartCard
                noTitle
                screenReaderSummary="Distribution All Time des anime par durée d'épisode."
                dataTable={{
                  caption: "Distribution anime par durée d'épisode",
                  columns: ["Catégorie", "Titres"],
                  rows: animeDurationBuckets.map((row) => [row.label, row.count]),
                }}
              >
                {animeDurationBuckets.length > 0 ? (
                  <div className="list-tab-anime-score-chart-wrap">
                    <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                      <ResponsiveContainer width="100%" height={212}>
                        <BarChart data={animeDurationBuckets} margin={{ top: 22, right: 8, left: 4, bottom: 2 }} barCategoryGap="18%">
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
                  <EmptyState icon="clock" title="Aucune durée d'épisode à afficher." />
                )}
                <p className="list-tab-pie-card__footnote">
                  Répartition des animés selon la durée moyenne de leurs épisodes.
                </p>
              </ChartCard>
            </CollapsibleChartBlock>
          </div>
        ) : null}
      </div>
      </div>

      <section
        id="anime-studios"
        className="list-tab-studios-section list-tab-anchor"
        aria-labelledby="anime-studios-title"
        aria-describedby={animeTopStudios.length > 0 && !animeStudiosCollapse.collapsed ? "anime-studios-summary" : undefined}
      >
        <SectionTitle
          id="anime-studios-title"
          rowClassName="list-tab-anime-chart-block__title-row list-tab-studios-section__title-row"
          aside={
            <ChartCollapseToggle
              collapsed={animeStudiosCollapse.collapsed}
              onToggle={animeStudiosCollapse.toggle}
              chartTitle="Studios"
              controlsId="anime-studios-body"
            />
          }
        >
          Studios
        </SectionTitle>
        <div
          className={`collapsible-chart-animator${animeStudiosCollapse.collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
          aria-hidden={animeStudiosCollapse.collapsed}
        >
        <div id="anime-studios-body" className="collapsible-chart-animator__inner">
        {animeTopStudios.length > 0 ? (
          <>
            <p id="anime-studios-summary" className="chart-card__sr-only">
              Studios d&apos;animation AniList sur la période (hors producteurs), avec aperçu des titres.
            </p>
            <div className="list-tab-studios-grid stagger-reveal">
              {studiosVisibleRows.map((studio) => {
                const periodRank = studioPeriodRankByName.get(studio.name) ?? 0;
                return (
                <article key={studio.name} className="list-tab-studio-card">
                  <div className="list-tab-studio-card__top">
                    <div className="list-tab-studio-card__head">
                      <div className="list-tab-studio-card__identity">
                        <div className="list-tab-studio-card__logo-wrap">
                          {studioLogoByName[studio.name] ? (
                            <img
                              className="list-tab-studio-card__logo"
                              src={studioLogoByName[studio.name]}
                              alt=""
                              loading="lazy"
                              decoding="async"
                            />
                          ) : (
                            <div className="list-tab-studio-card__logo-fallback" aria-hidden>
                              {studio.name.slice(0, 1).toUpperCase()}
                            </div>
                          )}
                        </div>
                        <div className="list-tab-studio-card__name" title={studio.name}>
                          {studio.anilistStudioId != null ? (
                            <a
                              href={`https://anilist.co/studio/${studio.anilistStudioId}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="list-tab-studio-card__name-link"
                            >
                              {studio.name}
                            </a>
                          ) : (
                            studio.name
                          )}
                        </div>
                      </div>
                      {periodRank > 0 ? (
                        <div
                          className="list-tab-studio-card__rank"
                          title={`${periodRank}${periodRank === 1 ? "er" : "e"} sur la période (titres, puis note moyenne)`}
                          aria-label={`Classement sur la période : ${periodRank} sur ${animeTopStudios.length}`}
                        >
                          {periodRank}
                        </div>
                      ) : null}
                    </div>
                    <div className="list-tab-studio-card__stats">
                      <div className="list-tab-studio-stat">
                        <div className="list-tab-studio-stat__value">{studio.count}</div>
                        <div className="list-tab-studio-stat__label">Titres</div>
                      </div>
                      <div className="list-tab-studio-stat">
                        <div className="list-tab-studio-stat__value">
                          {studio.meanUserScore > 0 ? studio.meanUserScore.toFixed(1) : "—"}
                        </div>
                        <div className="list-tab-studio-stat__label">Score moyen</div>
                      </div>
                      <div className="list-tab-studio-stat">
                        <div className="list-tab-studio-stat__value list-tab-studio-stat__value--duration">
                          {fmtMin(studio.minutesWatched)}
                        </div>
                        <div className="list-tab-studio-stat__label">Temps vu</div>
                      </div>
                    </div>
                  </div>
                  <div className="list-tab-studio-card__carousel" aria-label={`Titres vus du studio ${studio.name}`}>
                    {studio.carouselMedia.map((media) => {
                      const cover = media.coverImageUrl ? (
                        <img
                          className="list-tab-studio-card__cover"
                          src={media.coverImageUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="list-tab-studio-card__cover list-tab-studio-card__cover--fallback" />
                      );
                      if (media.anilistUrl) {
                        return (
                          <a
                            key={media.id}
                            href={media.anilistUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="list-tab-studio-card__carousel-item list-tab-studio-card__carousel-link"
                            title={media.title}
                            aria-label={`${media.title} sur AniList`}
                          >
                            {cover}
                          </a>
                        );
                      }
                      return (
                        <div key={media.id} className="list-tab-studio-card__carousel-item" title={media.title}>
                          {cover}
                        </div>
                      );
                    })}
                  </div>
                </article>
              );
              })}
            </div>
            {studiosHasMore ? (
              <div className="list-tab-studios-actions">
                <button
                  type="button"
                  className="list-tab-anime-more-btn list-tab-anime-more-btn--studios-toggle"
                  onClick={() => setStudiosExpanded((v) => !v)}
                  aria-expanded={studiosExpanded}
                >
                  <span>{studiosExpanded ? "Voir moins" : "Voir plus"}</span>
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
                    {studiosExpanded ? <path d="M18 15l-6-6-6 6" /> : <path d="M6 9l6 6 6-6" />}
                  </svg>
                </button>
              </div>
            ) : null}
          </>
        ) : (
          <EmptyState
            icon="tv"
            title="Aucun studio d'animation listé par l'API pour cette sélection."
            cta={viewFullYearCta}
          />
        )}
        </div>
        </div>
      </section>
    </div>
    </div>
  );
}

function AnimeRecordsSection({ records }: { records: PeriodRecordsBundle }) {
  const cards: ReactNode[] = [];

  if (records.longestCompleted) {
    cards.push(
      <RecordCard
        key="longest"
        icon="trophy"
        label="Plus longue série complétée"
        value={`${records.longestCompleted.count} épisode${records.longestCompleted.count > 1 ? "s" : ""}`}
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
        value={`${records.biggestSession.count} épisode${records.biggestSession.count > 1 ? "s" : ""}`}
        sub={`Le ${records.biggestSession.dateLabel}`}
        labelHint="Plus grand nombre d'épisodes vus en un seul jour de la période sélectionnée."
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
        labelHint="Premier anime commencé (date startedAt la plus ancienne) durant la période sélectionnée."
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
        labelHint="Dernier anime commencé (date startedAt la plus récente) durant la période sélectionnée."
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
        labelHint="Toute première activité anime de la période (épisode vu, changement de statut, etc.), nouvelle série ou non."
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
        labelHint="Toute dernière activité anime enregistrée sur la période, peu importe qu'il s'agisse d'une nouvelle série ou d'une série en cours."
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
        labelHint="Anime planifié avec la meilleure moyenne globale AniList. Disponible surtout en All Time."
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
        labelHint="Plus long enchaînement de jours consécutifs avec au moins une activité (épisode vu) sur la période."
      />
    );
  }

  return (
    <RecordsCarouselSection
      sectionId="anime-records"
      titleId="anime-records-title"
      title="Records & faits marquants"
      cards={cards}
      collapseId="anime.records"
    />
  );
}
