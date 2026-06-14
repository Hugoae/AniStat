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
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
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
import { ANIME_GENRE_RADAR_TOP_N } from "../config/listConstants";
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
  const genreRadarKey = useMemo(
    () =>
      mangaGenrePeriodData
        .slice(0, ANIME_GENRE_RADAR_TOP_N)
        .map((row) => `${row.name}:${row.count}`)
        .join("|"),
    [mangaGenrePeriodData]
  );
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

  const mangaGrid = useListTabMediaGrid({
    entries: mangaTabEntries,
    planningEntries: mangaPlanningEntries,
    isAllTime,
    year,
    month,
    layoutActive: mangaListLayoutActive,
  });

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
                      <RadarChart key={genreRadarKey} data={mangaGenrePeriodData.slice(0, ANIME_GENRE_RADAR_TOP_N)} outerRadius="88%">
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

