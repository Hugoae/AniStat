import { memo, useCallback, useEffect, useMemo, useState } from "react";
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
  CartesianGrid,
  LabelList,
} from "recharts";
import { C } from "../config/constants";
import { useT, useLang } from "../i18n/I18n";
import type { AnimeTopStudioRow } from "../lib/periodRankings";
import {
  StatCard,
  ChartCard,
  CTooltip,
  mediaCountryOriginMeta,
  mediaFormatShortLabel,
  SectionTitle,
  EmptyState,
  ListTabSectionNav,
} from "../components/ui";
import { StatLabelHint } from "../components/ui/StatPrimitives";
import { buildColorMapFromOrderedKeys, getColorForLabel } from "../lib/chartColors";
import { CollapsibleChartBlock } from "../components/charts/CollapsibleChartBlock";
import { ChartCollapseToggle } from "../components/charts/ChartCollapseToggle";
import { useCollapsedChart } from "../hooks/useCollapsedChart";
import { useListTabMediaGrid } from "../hooks/useListTabMediaGrid";
import { ListTabMediaGrid } from "../components/ui/ListTabMediaGrid";
import { ListTabDistributionSection } from "../components/ui/ListTabDistributionSection";
import { RecordsSection } from "../components/ui/RecordsSection";
import { buildStatusPieSlices } from "../lib/pieSlices";
import { LIST_TAB_PAIR_CHART_HEIGHT } from "../config/listConstants";
import { RechartsWhenVisible } from "../components/charts/RechartsWhenVisible";
import { AnimePieDistributionCard } from "../components/charts/AnimePieDistributionCard";
import { GenreRadarChart, type GenreRadarRow } from "../components/charts/GenreRadarChart";
import { ScoreScatterCard } from "../components/charts/ScoreScatterCard";
import { TopTagsCard, type TopTagsRow } from "../components/charts/TopTagsCard";
import { ActivityHeatmap, type DailyTotalsByIso } from "../components/charts/ActivityHeatmap";
import { resolveLocalStudioLogoUrl } from "../lib/studioLogos";
import { getComparisonPeriodMeta } from "../lib/stats";
import { useProfilePeriod } from "../contexts/profilePeriodCore";
import type { AniListEntry, PeriodRecordsBundle } from "../types/domain";

export type AnimeTabProps = {
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
  animeGenrePeriodData: GenreRadarRow[];
  animeTopTagsData: TopTagsRow[];
  animeEpisodesByFormatData: { name: string; episodes: number }[];
  animeMinutesByFormatData: { name: string; minutes: number }[];
  animeEpisodesByCountryData: { code: string; episodes: number }[];
  animeMinutesByCountryData: { code: string; minutes: number }[];
  animeTopStudios: AnimeTopStudioRow[];
  animeReleaseYearHistogram: { yearLabel: string; count: number }[];
  animeSeasonHistogram: { key: string; name: string; count: number }[];
  animeRecords: PeriodRecordsBundle;
  /** Activité quotidienne anime de l'année courante (clé YYYY-MM-DD → épisodes). */
  animeDailyTotalsForYear: DailyTotalsByIso;
  /** Évite de mesurer la grille quand l’onglet est masqué (largeur 0). */
  animeListLayoutActive: boolean;
  animePeriodProgressByMedia: Map<number, number>;
};

export const AnimeTab = memo(function AnimeTab({
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
  animePeriodProgressByMedia,
}: AnimeTabProps) {
  const { year, month, isAllTime, setMonth } = useProfilePeriod();
  const t = useT();
  const lang = useLang();
  const genreComparisonLabel = useMemo(
    () => (isAllTime ? "" : getComparisonPeriodMeta(year, month).legendCompare),
    [isAllTime, month, year]
  );
  /* ─── État local : UI-only (toggles, filtres, tri, largeur mesurée) ──
   * Tout le « métier » (entrées, stats, tops) arrive via les props, calculé
   * en amont par `App.tsx`. Ici on ne gère que l'état d'affichage propre à
   * l'onglet Anime. */
  const animeStudiosCollapse = useCollapsedChart("anime.studios");
  const [studiosExpanded, setStudiosExpanded] = useState(false);
  const [studioLogoByName, setStudioLogoByName] = useState<Record<string, string>>({});
  const animeGrid = useListTabMediaGrid({
    entries: animeTabEntries,
    planningEntries: animePlanningEntries,
    isAllTime,
    year,
    month,
    layoutActive: animeListLayoutActive,
  });

  const viewFullYearCta =
    month !== 0 ? (
      <button type="button" className="list-tab-empty-cta" onClick={() => setMonth(0)}>
        {t(`Voir toute l'année ${year}`, `View the full year ${year}`)}
      </button>
    ) : null;
  const periodYearLabel = isAllTime ? "All Time" : String(year);

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
  const formatEpisodesLabel = useCallback(
    (episodesRaw: number) => {
      const ep = Math.max(0, Math.round(Number(episodesRaw) || 0));
      return t(
        `${ep} épisode${ep > 1 ? "s" : ""} vu${ep > 1 ? "s" : ""}`,
        `${ep} episode${ep > 1 ? "s" : ""} watched`
      );
    },
    [t]
  );
  const formatTimeLabel = useCallback(
    (minutesRaw: number) => fmtMin(Math.max(0, Math.round(Number(minutesRaw) || 0))),
    [fmtMin]
  );
  const formatColorMap = useMemo(
    () => buildColorMapFromOrderedKeys(fmtData.map((row) => String(row.name))),
    [fmtData]
  );
  const countryColorMap = useMemo(
    () => buildColorMapFromOrderedKeys(animeCountryEntriesOrdered.map(([code]) => String(code))),
    [animeCountryEntriesOrdered]
  );
  const animeSeasonColorMap = useMemo(
    () => buildColorMapFromOrderedKeys(animeSeasonHistogram.map((row) => row.key)),
    [animeSeasonHistogram]
  );

  const formatPieSlicesByTitles = useMemo(
    () =>
      fmtData.map((row) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: row.value,
        fill: getColorForLabel(String(row.name), formatColorMap),
        extraInfo: formatEpisodesLabel(formatEpisodesByName.get(String(row.name)) || 0),
      })),
    [fmtData, formatColorMap, formatEpisodesByName, formatEpisodesLabel]
  );
  const formatPieSlicesByEpisodes = useMemo(() => {
    const minutesByName = new Map(
      animeMinutesByFormatData.map((row) => [String(row.name), Number(row.minutes) || 0] as const)
    );
    return animeEpisodesByFormatData
      .filter((row) => Number(row.episodes) > 0)
      .map((row) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: Number(row.episodes) || 0,
        fill: getColorForLabel(String(row.name), formatColorMap),
        extraInfo: formatTimeLabel(minutesByName.get(String(row.name)) || 0),
      }));
  }, [animeEpisodesByFormatData, animeMinutesByFormatData, formatColorMap, formatTimeLabel]);

  const countryPieSlicesByTitles = useMemo(
    () =>
      animeCountryEntriesOrdered.map(([code, c]) => {
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code, lang);
        const label = meta ? meta.label : t("Inconnu", "Unknown");
        return {
          key: code,
          label,
          value: c,
          fill: getColorForLabel(code, countryColorMap),
          flagCode: meta?.code,
          extraInfo: formatEpisodesLabel(countryEpisodesByCode.get(code) || 0),
        };
      }),
    [animeCountryEntriesOrdered, countryColorMap, countryEpisodesByCode, formatEpisodesLabel, t, lang]
  );
  const countryPieSlicesByEpisodes = useMemo(() => {
    const minutesByCode = new Map(
      animeMinutesByCountryData.map((row) => [String(row.code), Number(row.minutes) || 0] as const)
    );
    return animeEpisodesByCountryData
      .filter((row) => Number(row.episodes) > 0)
      .map((row) => {
        const code = String(row.code);
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code, lang);
        const label = meta ? meta.label : t("Inconnu", "Unknown");
        return {
          key: code,
          label,
          value: Number(row.episodes) || 0,
          fill: getColorForLabel(code, countryColorMap),
          flagCode: meta?.code,
          extraInfo: formatTimeLabel(minutesByCode.get(code) || 0),
        };
      });
  }, [animeEpisodesByCountryData, animeMinutesByCountryData, countryColorMap, formatTimeLabel, t, lang]);
  const statusPieSlices = useMemo(
    () => buildStatusPieSlices(animeStatusEntriesOrdered),
    [animeStatusEntriesOrdered]
  );
  const animeDurationBuckets = useMemo(() => {
    const rows = [
      { key: "short", label: "< 15 min", count: 0 },
      { key: "mid", label: "15-21 min", count: 0 },
      { key: "standard", label: "22-25 min", count: 0 },
      { key: "long", label: "26-45 min", count: 0 },
      { key: "feature", label: "> 45 min", count: 0 },
      { key: "unknown", label: t("Inconnu", "Unknown"), count: 0 },
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
  }, [animeTabEntries, t]);
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
    { id: "anime-synthese", label: t("Statistiques", "Statistics") },
    { id: "anime-repartition", label: t("Liste des œuvres", "Titles list") },
    { id: "anime-records", label: t("Records", "Records") },
    { id: "anime-graphiques", label: t("Graphiques", "Charts") },
    { id: "anime-studios", label: t("Studios", "Studios") },
  ], [t]);

  return (
    <div className="list-tab-shell">
    <ListTabSectionNav items={sectionNavItems} label={t("Navigation des sections anime", "Anime section navigation")} />
    <div className="list-tab-page">
      <div id="anime-synthese" className="overview-stats-cluster list-tab-anchor">
        <div className="fade-in stat-stat-al-row--overview">
          <StatCard label={t("Total anime", "Total anime")} value={animeEntriesLength} icon="tv" />
          <StatCard label={t("Épisodes vus", "Episodes watched")} value={totalEp} icon="play" />
          <StatCard label={t("Score moyen", "Average score")} value={avgA} icon="star" />
          <StatCard
            label={t("Dispersion (σ)", "Dispersion (σ)")}
            value={animeVsCommunityScoreStdDev}
            icon="divide"
            labelHint={t(
              "Écart-type (σ) de vos écarts (votre note − moyenne AniList) sur la période, en points sur 10. C'est l'amplitude typique d'un écart, sans considérer son sens : 0 = vos notes collent à la moyenne du site, plus la valeur monte plus vos notes sont tranchées (au-dessus comme au-dessous). Pour savoir si vous sur- ou sous-notez en moyenne, regardez le graphique « Ta note vs note AniList » plus bas.",
              "Standard deviation (σ) of your gaps (your score − AniList average) over the period, in points out of 10. It's the typical magnitude of a gap, regardless of its direction: 0 = your scores match the site average, and the higher the value, the more decisive your scores are (both above and below). To find out whether you over- or under-rate on average, look at the \"Your score vs AniList score\" chart below."
            )}
          />
          <StatCard label={t("Temps total", "Total time")} value={fmtMin(totalMin)} icon="clock" />
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
            title={t(
              `Calendrier d'activité anime ${periodYearLabel}`,
              `Anime activity calendar ${periodYearLabel}`
            )}
            dailyTotals={animeDailyTotalsForYear}
            unitSingular={t("épisode", "episode")}
            unitPlural={t("épisodes", "episodes")}
            collapseId="anime.heatmap"
            titleHint={t(
              "Chaque cellule représente une journée de l'année. La couleur indique le nombre d'épisodes vus ce jour-là (toutes activités anime AniList confondues, période ignorée). Survole une cellule pour voir le total exact.",
              "Each cell represents one day of the year. The color indicates the number of episodes watched that day (across all AniList anime activity, period ignored). Hover over a cell to see the exact total."
            )}
          />
        </section>
      ) : null}

      <ListTabDistributionSection
        idPrefix="anime"
        mediaNoun="anime"
        statusEntriesOrdered={animeStatusEntriesOrdered}
        countryEntriesOrdered={animeCountryEntriesOrdered}
        fmtData={fmtData}
      />

      <ListTabMediaGrid
        grid={animeGrid}
        idPrefix="anime"
        mediaType="ANIME"
        entriesLength={animeTabEntries.length}
        planningLength={animePlanningEntries.length}
        isAllTime={isAllTime}
        periodProgressByMedia={animePeriodProgressByMedia}
      />

      <RecordsSection records={animeRecords} kind="anime" />

      <div
        key={`anime-viz-${year}-${month}`}
        className="list-tab-anime-viz-reveal"
      >
      <div id="anime-graphiques" className="list-tab-anime-charts-section list-tab-anchor">
        <div className="list-tab-anime-charts list-tab-anime-charts--two">
        <CollapsibleChartBlock
          id="anime.scores"
          title={t("Répartition des scores", "Score distribution")}
          withHint
          titleAside={
            <StatLabelHint text={t(
              "Chaque note est ramenée au demi-point le plus proche avant d'être comptée (ex. 7,2 → 7 ; 7,8 → 8 ; 8,25 → 8,5)",
              "Each score is rounded to the nearest half-point before being counted (e.g. 7.2 → 7; 7.8 → 8; 8.25 → 8.5)"
            )} />
          }
        >
        <ChartCard
          noTitle
          className="list-tab-anime-chart--scores"
          screenReaderSummary={t(
            "Histogramme des scores : effectifs par tranche de demi-point de 1 à 10 pour les anime notés sur la période.",
            "Score histogram: counts per half-point bucket from 1 to 10 for anime rated over the period."
          )}
          dataTable={{
            caption: t("Répartition des scores anime", "Anime score distribution"),
            columns: [t("Score", "Score"), t("Anime", "Anime")],
            rows: animeScoreHalfDistributionVisibleRows.map((row) => [row.label, row.count]),
          }}
        >
          {animeScoreHalfDistributionVisibleRows.length > 0 ? (
            <div className="list-tab-anime-score-chart-wrap">
              <RechartsWhenVisible
                height={LIST_TAB_PAIR_CHART_HEIGHT}
                className="list-tab-anime-recharts-mount list-tab-pair-chart-mount"
              >
                <ResponsiveContainer width="100%" height={LIST_TAB_PAIR_CHART_HEIGHT}>
                  <BarChart
                    data={animeScoreHalfDistributionVisibleRows}
                    margin={{ top: 30, right: 8, left: 4, bottom: 2 }}
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
                    <Bar dataKey="count" name={t("Anime", "Anime")} fill={C.accent} radius={[8, 8, 0, 0]} maxBarSize={40}>
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
              title={t("Aucun score sur les anime de cette période.", "No score for anime in this period.")}
              cta={viewFullYearCta}
            />
          )}
        </ChartCard>
        </CollapsibleChartBlock>

          <CollapsibleChartBlock id="anime.genres" title={t("Genres", "Genres")}>
            <GenreRadarChart
              kind="anime"
              rows={animeGenrePeriodData}
              comparisonLabel={genreComparisonLabel}
              emptyCta={viewFullYearCta}
            />
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
          <CollapsibleChartBlock id="anime.releaseYear" title={t("Année de sortie", "Release year")}>
          <ChartCard
            noTitle
            screenReaderSummary={t(
              "Nombre d'anime de la période par année de sortie (seasonYear ou date de début).",
              "Number of anime in the period by release year (seasonYear or start date)."
            )}
            dataTable={{
              caption: t("Anime par année de sortie", "Anime by release year"),
              columns: [t("Année", "Year"), t("Titres", "Titles")],
              rows: animeReleaseYearHistogram.map((row) => [row.yearLabel, row.count]),
            }}
          >
            {animeReleaseYearHistogram.length > 0 ? (
              <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={212}>
                  <LineChart data={animeReleaseYearHistogram} margin={{ top: 30, right: 12, left: 0, bottom: 4 }}>
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
                    <Tooltip content={<CTooltip />} formatter={(v: number) => [String(v), t("Titres", "Titles")]} />
                    <Area
                      type="monotone"
                      dataKey="count"
                      name={t("Anime", "Anime")}
                      stroke="none"
                      fill="url(#anime-release-year-fill)"
                      baseValue={0}
                      isAnimationActive={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      name={t("Anime", "Anime")}
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
                title={t("Aucune année de sortie renseignée sur ces titres.", "No release year listed for these titles.")}
                cta={viewFullYearCta}
              />
            )}
          </ChartCard>
          </CollapsibleChartBlock>

          <CollapsibleChartBlock id="anime.season" title={t("Saison de diffusion", "Airing season")}>
            <ChartCard
              noTitle
              screenReaderSummary={t(
                "Répartition des anime de la période par saison de diffusion AniList (hiver, printemps, été, automne).",
                "Distribution of the period's anime by AniList airing season (winter, spring, summer, autumn)."
              )}
              dataTable={{
                caption: t("Anime par saison de diffusion", "Anime by airing season"),
                columns: [t("Saison", "Season"), t("Titres", "Titles")],
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
                        margin={{ top: 30, right: 8, left: 4, bottom: 2 }}
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
                        <Bar dataKey="count" name={t("Titres", "Titles")} radius={[8, 8, 0, 0]} maxBarSize={48}>
                          {animeSeasonHistogram.map((row) => (
                            <Cell key={row.key} fill={getColorForLabel(row.key, animeSeasonColorMap)} />
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
                  title={t("Aucune saison à afficher pour cette sélection.", "No season to display for this selection.")}
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
            title={t("Répartition par format", "Distribution by format")}
            screenReaderSummary={t("Camembert des formats sur la période.", "Pie chart of formats over the period.")}
            emptyExtra={viewFullYearCta}
            defaultModeKey="titles"
            collapseId="anime.format"
            modes={[
              {
                key: "titles",
                label: t("Titres", "Titles"),
                unitSingular: t("titre", "title"),
                unitPlural: t("titres", "titles"),
                slices: formatPieSlicesByTitles,
                footnote: t(
                  "Le pourcentage représente la part de titres, le nombre d'épisodes vus est une information complémentaire.",
                  "The percentage represents the share of titles; the number of episodes watched is additional information."
                ),
              },
              {
                key: "episodes",
                label: t("Épisodes", "Episodes"),
                unitSingular: t("épisode vu", "episode watched"),
                unitPlural: t("épisodes vus", "episodes watched"),
                slices: formatPieSlicesByEpisodes,
                footnote: t(
                  "Le pourcentage représente la part d'épisodes vus, le nombre de titres est une information complémentaire.",
                  "The percentage represents the share of episodes watched; the number of titles is additional information."
                ),
              },
            ]}
          />
          <AnimePieDistributionCard
            title={t("Pays d'origine", "Country of origin")}
            screenReaderSummary={t(
              "Camembert des pays d'origine des anime sur la période.",
              "Pie chart of the anime's countries of origin over the period."
            )}
            emptyExtra={viewFullYearCta}
            defaultModeKey="titles"
            collapseId="anime.country"
            modes={[
              {
                key: "titles",
                label: t("Titres", "Titles"),
                unitSingular: t("titre", "title"),
                unitPlural: t("titres", "titles"),
                slices: countryPieSlicesByTitles,
                footnote: t(
                  "Le pourcentage représente la part de titres, le nombre d'épisodes vus est une information complémentaire.",
                  "The percentage represents the share of titles; the number of episodes watched is additional information."
                ),
              },
              {
                key: "episodes",
                label: t("Épisodes", "Episodes"),
                unitSingular: t("épisode vu", "episode watched"),
                unitPlural: t("épisodes vus", "episodes watched"),
                slices: countryPieSlicesByEpisodes,
                footnote: t(
                  "Le pourcentage représente la part d'épisodes vus, le nombre de titres est une information complémentaire.",
                  "The percentage represents the share of episodes watched; the number of titles is additional information."
                ),
              },
            ]}
          />
        </div>
        {isAllTime ? (
          <div className="list-tab-pie-pair list-tab-alltime-extra-charts">
            <AnimePieDistributionCard
              title={t("Répartition par statut", "Distribution by status")}
              screenReaderSummary={t(
                "Camembert des statuts anime All Time, incluant terminés, en cours, abandonnés et planifiés.",
                "Pie chart of All Time anime statuses, including completed, in progress, dropped and planned."
              )}
              defaultModeKey="titles"
              collapseId="anime.statusAllTime"
              modes={[
                {
                  key: "titles",
                  label: t("Titres", "Titles"),
                  unitSingular: t("titre", "title"),
                  unitPlural: t("titres", "titles"),
                  slices: statusPieSlices,
                  footnote: t(
                    "Le pourcentage représente la part de titres, le nombre de titres est une information complémentaire.",
                    "The percentage represents the share of titles; the number of titles is additional information."
                  ),
                },
              ]}
            />
            <CollapsibleChartBlock id="anime.durationBuckets" title={t("Durée des épisodes", "Episode duration")}>
              <ChartCard
                noTitle
                screenReaderSummary={t(
                  "Distribution All Time des anime par durée d'épisode.",
                  "All Time distribution of anime by episode duration."
                )}
                dataTable={{
                  caption: t("Distribution anime par durée d'épisode", "Anime distribution by episode duration"),
                  columns: [t("Catégorie", "Category"), t("Titres", "Titles")],
                  rows: animeDurationBuckets.map((row) => [row.label, row.count]),
                }}
              >
                {animeDurationBuckets.length > 0 ? (
                  <div className="list-tab-anime-score-chart-wrap">
                    <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                      <ResponsiveContainer width="100%" height={212}>
                        <BarChart data={animeDurationBuckets} margin={{ top: 30, right: 8, left: 4, bottom: 2 }} barCategoryGap="18%">
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
                          <Bar dataKey="count" name={t("Titres", "Titles")} fill={C.accent} radius={[8, 8, 0, 0]} maxBarSize={48}>
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
                  <EmptyState icon="clock" title={t("Aucune durée d'épisode à afficher.", "No episode duration to display.")} />
                )}
                <p className="list-tab-pie-card__footnote">
                  {t(
                    "Répartition des animés selon la durée moyenne de leurs épisodes.",
                    "Distribution of anime by the average duration of their episodes."
                  )}
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
              chartTitle={t("Studios", "Studios")}
              controlsId="anime-studios-body"
            />
          }
        >
          {t("Studios", "Studios")}
        </SectionTitle>
        <div
          className={`collapsible-chart-animator${animeStudiosCollapse.collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
          aria-hidden={animeStudiosCollapse.collapsed}
        >
        <div id="anime-studios-body" className="collapsible-chart-animator__inner">
        {animeTopStudios.length > 0 ? (
          <>
            <p id="anime-studios-summary" className="chart-card__sr-only">
              {t(
                "Studios d'animation AniList sur la période (hors producteurs), avec aperçu des titres.",
                "AniList animation studios over the period (excluding producers), with a preview of titles."
              )}
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
                          title={t(
                            `${periodRank}${periodRank === 1 ? "er" : "e"} sur la période (titres, puis note moyenne)`,
                            `#${periodRank} over the period (titles, then average score)`
                          )}
                          aria-label={t(
                            `Classement sur la période : ${periodRank} sur ${animeTopStudios.length}`,
                            `Ranking over the period: ${periodRank} of ${animeTopStudios.length}`
                          )}
                        >
                          {periodRank}
                        </div>
                      ) : null}
                    </div>
                    <div className="list-tab-studio-card__stats">
                      <div className="list-tab-studio-stat">
                        <div className="list-tab-studio-stat__value">{studio.count}</div>
                        <div className="list-tab-studio-stat__label">{t("Titres", "Titles")}</div>
                      </div>
                      <div className="list-tab-studio-stat">
                        <div className="list-tab-studio-stat__value">
                          {studio.meanUserScore > 0 ? studio.meanUserScore.toFixed(1) : "—"}
                        </div>
                        <div className="list-tab-studio-stat__label">{t("Score moyen", "Average score")}</div>
                      </div>
                      <div className="list-tab-studio-stat">
                        <div className="list-tab-studio-stat__value list-tab-studio-stat__value--duration">
                          {fmtMin(studio.minutesWatched)}
                        </div>
                        <div className="list-tab-studio-stat__label">{t("Temps vu", "Time watched")}</div>
                      </div>
                    </div>
                  </div>
                  <div className="list-tab-studio-card__carousel" aria-label={t(`Titres vus du studio ${studio.name}`, `Titles watched from ${studio.name}`)}>
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
                            aria-label={t(`${media.title} sur AniList`, `${media.title} on AniList`)}
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
                  <span>{studiosExpanded ? t("Voir moins", "Show less") : t("Voir plus", "Show more")}</span>
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
            title={t("Aucun studio d'animation listé par l'API pour cette sélection.", "No animation studio listed by the API for this selection.")}
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

