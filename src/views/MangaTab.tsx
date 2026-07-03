import { memo, useEffect, useMemo, useState } from "react";
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
  CartesianGrid,
  LabelList,
} from "recharts";
import { C } from "../config/constants";
import type { MangaTopAuthorRow } from "../lib/periodRankings";
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
import { RechartsWhenVisible } from "../components/charts/RechartsWhenVisible";
import { AnimePieDistributionCard } from "../components/charts/AnimePieDistributionCard";
import { ScoreScatterCard } from "../components/charts/ScoreScatterCard";
import { TopTagsCard, type TopTagsRow } from "../components/charts/TopTagsCard";
import { ActivityHeatmap, type DailyTotalsByIso } from "../components/charts/ActivityHeatmap";
import { CollapsibleChartBlock } from "../components/charts/CollapsibleChartBlock";
import { ChartCollapseToggle } from "../components/charts/ChartCollapseToggle";
import { useCollapsedChart } from "../hooks/useCollapsedChart";
import { useListTabMediaGrid } from "../hooks/useListTabMediaGrid";
import { ListTabMediaGrid } from "../components/ui/ListTabMediaGrid";
import { ListTabDistributionSection } from "../components/ui/ListTabDistributionSection";
import { RecordsSection } from "../components/ui/RecordsSection";
import { buildStatusPieSlices } from "../lib/pieSlices";
import { useProfilePeriod } from "../contexts/profilePeriodCore";
import { LIST_TAB_PAIR_CHART_HEIGHT } from "../config/listConstants";
import { getComparisonPeriodMeta } from "../lib/stats";
import { GenreRadarChart, type GenreRadarRow } from "../components/charts/GenreRadarChart";
import type { AniListEntry, PeriodRecordsBundle } from "../types/domain";
import { useT, useLang } from "../i18n/I18n";

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
  mangaGenrePeriodData: GenreRadarRow[];
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
  const t = useT();
  const lang = useLang();
  const { year, month, isAllTime, setMonth } = useProfilePeriod();
  const genreComparisonLabel = useMemo(
    () => (isAllTime ? "" : getComparisonPeriodMeta(year, month).legendCompare),
    [isAllTime, month, year]
  );
  const viewFullYearCta =
    month !== 0 ? (
      <button type="button" className="list-tab-empty-cta" onClick={() => setMonth(0)}>
        {t("Voir toute l'année", "View the full year")} {year}
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
    return `${ch} ${t(ch > 1 ? "chapitres" : "chapitre", ch > 1 ? "chapters" : "chapter")}`;
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
    return `${n} ${t(n > 1 ? "titres" : "titre", n > 1 ? "titles" : "title")}`;
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
    [mangaFmtData, formatColorMap, formatChaptersByName, t]
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
  }, [mangaChaptersByFormatData, mangaFmtData, formatColorMap, t]);

  const countryPieSlicesByTitles = useMemo(
    () =>
      mangaCountryEntriesOrdered.map(([code, c]) => {
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code, lang);
        const label = meta ? meta.label : t("Inconnu", "Unknown");
        return {
          key: code,
          label,
          value: c,
          fill: getColorForLabel(code, countryColorMap),
          flagCode: meta?.code,
          extraInfo: formatChaptersLabel(countryChaptersByCode.get(code) || 0),
        };
      }),
    [mangaCountryEntriesOrdered, countryColorMap, countryChaptersByCode, formatChaptersLabel, t, lang]
  );
  const countryPieSlicesByChapters = useMemo(() => {
    const titlesByCode = new Map(
      mangaCountryEntriesOrdered.map(([code, c]) => [String(code), Number(c) || 0] as const)
    );
    return mangaChaptersByCountryData
      .filter((row) => Number(row.chapters) > 0)
      .map((row) => {
        const code = String(row.code);
        const meta = code === "__UNKNOWN__" ? null : mediaCountryOriginMeta(code, lang);
        const label = meta ? meta.label : t("Inconnu", "Unknown");
        return {
          key: code,
          label,
          value: Number(row.chapters) || 0,
          fill: getColorForLabel(code, countryColorMap),
          flagCode: meta?.code,
          extraInfo: formatTitlesLabel(titlesByCode.get(code) || 0),
        };
      });
  }, [mangaChaptersByCountryData, mangaCountryEntriesOrdered, countryColorMap, formatTitlesLabel, t, lang]);
  const statusPieSlices = useMemo(
    () => buildStatusPieSlices(mangaStatusEntriesOrdered),
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
      { key: "unknown", label: t("Inconnu", "Unknown"), count: 0 },
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
  }, [mangaTabEntries, t]);
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

  const mangaGrid = useListTabMediaGrid({
    entries: mangaTabEntries,
    planningEntries: mangaPlanningEntries,
    isAllTime,
    year,
    month,
    layoutActive: mangaListLayoutActive,
  });

  const sectionNavItems = useMemo(() => [
    { id: "manga-synthese", label: t("Statistiques", "Statistics") },
    { id: "manga-repartition", label: t("Liste des œuvres", "List of titles") },
    { id: "manga-records", label: t("Records", "Records") },
    { id: "manga-graphiques", label: t("Graphiques", "Charts") },
    { id: "manga-auteurs", label: t("Auteurs", "Authors") },
  ], [t]);

  return (
    <div className="list-tab-shell">
      <ListTabSectionNav items={sectionNavItems} label={t("Navigation des sections manga", "Manga sections navigation")} />
      <div className="list-tab-page">
      <div id="manga-synthese" className="overview-stats-cluster list-tab-anchor">
        <div className="fade-in stat-stat-al-row--overview">
          <StatCard label={t("Total manga", "Total manga")} value={mangaEntriesLength} icon="book" />
          <StatCard label={t("Chapitres lus", "Chapters read")} value={totalCh} icon="book" />
          <StatCard label={t("Volumes", "Volumes")} value={totalVol} icon="stack" />
          <StatCard label={t("Score moyen", "Average score")} value={avgM} icon="star" />
          <StatCard
            label={t("Dispersion (σ)", "Dispersion (σ)")}
            value={mangaVsCommunityScoreStdDev}
            icon="divide"
            labelHint={t(
              "Écart-type (σ) de vos écarts (votre note − moyenne AniList) sur la période, en points sur 10. C'est l'amplitude typique d'un écart, sans considérer son sens : 0 = vos notes collent à la moyenne du site, plus la valeur monte plus vos notes sont tranchées (au-dessus comme au-dessous). Pour savoir si vous sur- ou sous-notez en moyenne, regardez le graphique « Ta note vs note AniList » plus bas.",
              "Standard deviation (σ) of your gaps (your score − AniList average) over the period, in points out of 10. It is the typical magnitude of a gap, regardless of its direction: 0 = your scores match the site average, and the higher the value the more polarized your scores are (both above and below). To find out whether you over- or under-rate on average, see the “Your score vs AniList score” chart below."
            )}
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
            title={`${t("Calendrier d'activité manga", "Manga activity calendar")} ${periodYearLabel}`}
            dailyTotals={mangaDailyTotalsForYear}
            unitSingular={t("chapitre", "chapter")}
            unitPlural={t("chapitres", "chapters")}
            collapseId="manga.heatmap"
            titleHint={t(
              "Chaque cellule représente une journée de l'année. La couleur indique le nombre de chapitres lus ce jour-là (toutes activités manga AniList confondues, période ignorée). Survole une cellule pour voir le total exact.",
              "Each cell represents a day of the year. The color indicates the number of chapters read that day (across all AniList manga activity, ignoring the period). Hover over a cell to see the exact total."
            )}
          />
        </section>
      ) : null}

      <ListTabDistributionSection
        idPrefix="manga"
        mediaNoun="manga"
        statusEntriesOrdered={mangaStatusEntriesOrdered}
        countryEntriesOrdered={mangaCountryEntriesOrdered}
        fmtData={mangaFmtData}
      />

      <ListTabMediaGrid
        grid={mangaGrid}
        idPrefix="manga"
        mediaType="MANGA"
        entriesLength={mangaTabEntries.length}
        planningLength={mangaPlanningEntries.length}
        isAllTime={isAllTime}
        periodProgressByMedia={mangaPeriodProgressByMedia}
      />

      <RecordsSection records={mangaRecords} kind="manga" />

      <div
        key={`manga-viz-${year}-${month}`}
        className="list-tab-anime-viz-reveal"
      >
        <div id="manga-graphiques" className="list-tab-anime-charts-section list-tab-anchor">
          <div className="list-tab-anime-charts list-tab-anime-charts--two">
            <CollapsibleChartBlock
              id="manga.scores"
              title={t("Répartition des scores", "Score distribution")}
              withHint
              titleAside={
                <StatLabelHint text={t(
                  "Chaque note est ramenée au demi-point le plus proche avant d’être comptée (ex. 7,2 → 7 ; 7,8 → 8 ; 8,25 → 8,5)",
                  "Each score is rounded to the nearest half-point before being counted (e.g. 7.2 → 7; 7.8 → 8; 8.25 → 8.5)"
                )} />
              }
            >
              <ChartCard
                noTitle
                className="list-tab-anime-chart--scores"
                screenReaderSummary={t(
                  "Histogramme des scores : effectifs par tranche de demi-point de 1 à 10 pour les manga notés sur la période.",
                  "Score histogram: counts per half-point bracket from 1 to 10 for manga rated in the period."
                )}
                dataTable={{
                  caption: t("Répartition des scores manga", "Manga score distribution"),
                  columns: ["Score", "Manga"],
                  rows: mangaScoreHalfDistributionVisibleRows.map((row) => [row.label, row.count]),
                }}
              >
                {mangaScoreHalfDistributionVisibleRows.length > 0 ? (
                  <div className="list-tab-anime-score-chart-wrap">
                    <RechartsWhenVisible
                      height={LIST_TAB_PAIR_CHART_HEIGHT}
                      className="list-tab-anime-recharts-mount list-tab-pair-chart-mount"
                    >
                      <ResponsiveContainer width="100%" height={LIST_TAB_PAIR_CHART_HEIGHT}>
                        <BarChart
                          data={mangaScoreHalfDistributionVisibleRows}
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
                    title={t("Aucun score sur les manga de cette période.", "No score for manga in this period.")}
                    cta={viewFullYearCta}
                  />
                )}
              </ChartCard>
            </CollapsibleChartBlock>

            <CollapsibleChartBlock id="manga.genres" title="Genres">
              <GenreRadarChart
                kind="manga"
                rows={mangaGenrePeriodData}
                comparisonLabel={genreComparisonLabel}
                emptyCta={viewFullYearCta}
              />
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
            <CollapsibleChartBlock id="manga.releaseYear" title={t("Année de sortie", "Release year")}>
              <ChartCard
                noTitle
                screenReaderSummary={t(
                  "Nombre de manga de la période par année de sortie (date de début).",
                  "Number of manga in the period by release year (start date)."
                )}
                dataTable={{
                  caption: t("Manga par année de sortie", "Manga by release year"),
                  columns: [t("Année", "Year"), t("Titres", "Titles")],
                  rows: mangaReleaseYearHistogram.map((row) => [row.yearLabel, row.count]),
                }}
              >
                {mangaReleaseYearHistogram.length > 0 ? (
                  <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                    <ResponsiveContainer width="100%" height={212}>
                      <LineChart data={mangaReleaseYearHistogram} margin={{ top: 30, right: 12, left: 0, bottom: 4 }}>
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
                        <Tooltip content={<CTooltip />} formatter={(v: number) => [String(v), t("Titres", "Titles")]} />
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
                    title={t("Aucune année de sortie renseignée sur ces titres.", "No release year listed for these titles.")}
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
              title={t("Répartition par format", "Distribution by format")}
              screenReaderSummary={t("Camembert des formats sur la période.", "Pie chart of formats over the period.")}
              emptyExtra={viewFullYearCta}
              defaultModeKey="titles"
              collapseId="manga.format"
              modes={[
                {
                  key: "titles",
                  label: t("Titres", "Titles"),
                  unitSingular: t("titre", "title"),
                  unitPlural: t("titres", "titles"),
                  slices: formatPieSlicesByTitles,
                  footnote:
                    t(
                      "Le pourcentage représente la part de titres, le nombre de chapitres lus est une information complémentaire.",
                      "The percentage represents the share of titles; the number of chapters read is additional information."
                    ),
                },
                {
                  key: "chapters",
                  label: t("Chapitres", "Chapters"),
                  unitSingular: t("chapitre lu", "chapter read"),
                  unitPlural: t("chapitres lus", "chapters read"),
                  slices: formatPieSlicesByChapters,
                  footnote:
                    t(
                      "Le pourcentage représente la part de chapitres lus, le nombre de titres est une information complémentaire.",
                      "The percentage represents the share of chapters read; the number of titles is additional information."
                    ),
                },
              ]}
            />
            <AnimePieDistributionCard
              title={t("Pays d'origine", "Country of origin")}
              screenReaderSummary={t("Camembert des pays d'origine des manga sur la période.", "Pie chart of manga countries of origin over the period.")}
              emptyExtra={viewFullYearCta}
              defaultModeKey="titles"
              collapseId="manga.country"
              modes={[
                {
                  key: "titles",
                  label: t("Titres", "Titles"),
                  unitSingular: t("titre", "title"),
                  unitPlural: t("titres", "titles"),
                  slices: countryPieSlicesByTitles,
                  footnote:
                    t(
                      "Le pourcentage représente la part de titres, le nombre de chapitres lus est une information complémentaire.",
                      "The percentage represents the share of titles; the number of chapters read is additional information."
                    ),
                },
                {
                  key: "chapters",
                  label: t("Chapitres", "Chapters"),
                  unitSingular: t("chapitre lu", "chapter read"),
                  unitPlural: t("chapitres lus", "chapters read"),
                  slices: countryPieSlicesByChapters,
                  footnote:
                    t(
                      "Le pourcentage représente la part de chapitres lus, le nombre de titres est une information complémentaire.",
                      "The percentage represents the share of chapters read; the number of titles is additional information."
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
                  "Camembert des statuts manga All Time, incluant terminés, en cours, abandonnés et planifiés.",
                  "Pie chart of All Time manga statuses, including completed, in progress, dropped and planned."
                )}
                defaultModeKey="titles"
                collapseId="manga.statusAllTime"
                modes={[
                  {
                    key: "titles",
                    label: t("Titres", "Titles"),
                    unitSingular: t("titre", "title"),
                    unitPlural: t("titres", "titles"),
                    slices: statusPieSlices,
                    footnote:
                      t(
                        "Le pourcentage représente la part de titres, le nombre de titres est une information complémentaire.",
                        "The percentage represents the share of titles; the number of titles is additional information."
                      ),
                  },
                ]}
              />
              <CollapsibleChartBlock id="manga.chapterBuckets" title={t("Longueur des œuvres", "Length of titles")}>
                <ChartCard
                  noTitle
                  screenReaderSummary={t(
                    "Distribution All Time des manga par volume de chapitres.",
                    "All Time distribution of manga by chapter count."
                  )}
                  dataTable={{
                    caption: t("Distribution manga par volume de chapitres", "Manga distribution by chapter count"),
                    columns: [t("Catégorie", "Category"), t("Titres", "Titles")],
                    rows: mangaChapterVolumeBuckets.map((row) => [row.label, row.count]),
                  }}
                >
                  {mangaChapterVolumeBuckets.length > 0 ? (
                    <div className="list-tab-anime-score-chart-wrap">
                      <RechartsWhenVisible height={212} className="list-tab-anime-recharts-mount">
                        <ResponsiveContainer width="100%" height={212}>
                          <BarChart data={mangaChapterVolumeBuckets} margin={{ top: 30, right: 8, left: 4, bottom: 2 }} barCategoryGap="18%">
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
                    <EmptyState icon="book" title={t("Aucun volume de chapitres à afficher.", "No chapter count to display.")} />
                  )}
                  <p className="list-tab-pie-card__footnote">
                    {t(
                      "Répartition des mangas selon leur nombre total de chapitres.",
                      "Distribution of manga by their total number of chapters."
                    )}
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
                chartTitle={t("Auteurs", "Authors")}
                controlsId="manga-authors-body"
              />
              <StatLabelHint text={t(
                "Auteurs créditeurs des manga de la période (mangakas, scénaristes, illustrateurs, créateurs originaux). Les rôles secondaires comme la traduction ou l'édition sont exclus. Les chapitres lus sont calculés sur la période sélectionnée à partir des activités AniList.",
                "Authors credited on the manga in the period (mangaka, writers, illustrators, original creators). Secondary roles such as translation or editing are excluded. Chapters read are computed over the selected period from AniList activity."
              )} />
            </>
          }
        >
          {t("Auteurs", "Authors")}
        </SectionTitle>
        <div
          className={`collapsible-chart-animator${mangaAuthorsCollapse.collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
          aria-hidden={mangaAuthorsCollapse.collapsed}
        >
          <div id="manga-authors-body" className="collapsible-chart-animator__inner">
            {mangaTopAuthors.length > 0 ? (
              <>
                <p id="manga-authors-summary" className="chart-card__sr-only">
                  {t(
                    "Auteurs AniList sur la période, avec leur rôle dominant et un aperçu des titres.",
                    "AniList authors over the period, with their dominant role and a preview of titles."
                  )}
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
                                title={t(
                                  `${periodRank}${periodRank === 1 ? "er" : "e"} sur la période (titres, puis note moyenne)`,
                                  `Rank ${periodRank} of the period (by titles, then average score)`
                                )}
                                aria-label={t(
                                  `Classement sur la période : ${periodRank} sur ${mangaTopAuthors.length}`,
                                  `Ranking over the period: ${periodRank} of ${mangaTopAuthors.length}`
                                )}
                              >
                                {periodRank}
                              </div>
                            ) : null}
                          </div>
                          <div className="list-tab-author-card__stats">
                            <div className="list-tab-author-stat">
                              <div className="list-tab-author-stat__value">{author.count}</div>
                              <div className="list-tab-author-stat__label">{t("Titres", "Titles")}</div>
                            </div>
                            <div className="list-tab-author-stat">
                              <div className="list-tab-author-stat__value">
                                {author.meanUserScore > 0 ? author.meanUserScore.toFixed(1) : "—"}
                              </div>
                              <div className="list-tab-author-stat__label">{t("Score moyen", "Average score")}</div>
                            </div>
                            <div className="list-tab-author-stat">
                              <div className="list-tab-author-stat__value list-tab-author-stat__value--chapters">
                                {author.chaptersRead}
                              </div>
                              <div className="list-tab-author-stat__label">{t("Chapitres lus", "Chapters read")}</div>
                            </div>
                          </div>
                        </div>
                        <div
                          className="list-tab-author-card__carousel"
                          aria-label={t(`Titres lus de ${author.name}`, `Titles read by ${author.name}`)}
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
                                  aria-label={t(`${media.title} sur AniList`, `${media.title} on AniList`)}
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
                      <span>{authorsExpanded ? t("Voir moins", "Show less") : t("Voir plus", "Show more")}</span>
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
                title={t("Aucun auteur listé par l'API pour cette sélection.", "No author listed by the API for this selection.")}
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

