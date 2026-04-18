import type { RefObject } from "react";
import { C } from "../config/constants";
import { StatCard, ChartCard, MediaCard, PeriodCompareLegend } from "../components/AppUi";
import { OverviewActivityLineChart } from "../components/OverviewActivityLineChart";
import { ActivityHeatmap, type DailyTotalsByIso } from "../components/ActivityHeatmap";
import type { AniListEntry } from "../types/domain";

export type CompareAvailability = {
  missing: boolean;
  loadingComparison: boolean;
  loadingLabel: string;
  idleLabel: string;
};

export type ChartPeriodLegend = {
  legendCurrent: string;
  legendCompare: string;
};

export type OverviewTabProps = {
  year: number;
  month: number;
  totalEp: number;
  avgA: string;
  totalCh: number;
  avgM: string;
  activeDaysCount: number;
  periodDayTotal: number;
  chartPeriodLegend: ChartPeriodLegend;
  compareAvailability: CompareAvailability;
  mangaChaptersChartData: { label: string; current: number; compare: number }[];
  animeEpisodesChartData: { label: string; current: number; compare: number }[];
  overviewTopCount: number;
  overviewTopPeriodTitle: string;
  overviewTopManga: AniListEntry[];
  overviewTopAnime: AniListEntry[];
  overviewMangaTopFades: { left: boolean; right: boolean };
  overviewAnimeTopFades: { left: boolean; right: boolean };
  overviewMangaTopScrollRef: RefObject<HTMLDivElement | null>;
  overviewAnimeTopScrollRef: RefObject<HTMLDivElement | null>;
  /** Activité quotidienne agrégée (anime + manga) pour la heatmap. */
  overviewDailyTotalsForYear: DailyTotalsByIso;
  /** Activité quotidienne anime seule, pour le détail dans le tooltip. */
  animeDailyTotalsForYear: DailyTotalsByIso;
  /** Activité quotidienne manga seule, pour le détail dans le tooltip. */
  mangaDailyTotalsForYear: DailyTotalsByIso;
};

export function OverviewTab({
  year,
  month,
  totalEp,
  avgA,
  totalCh,
  avgM,
  activeDaysCount,
  periodDayTotal,
  chartPeriodLegend,
  compareAvailability,
  mangaChaptersChartData,
  animeEpisodesChartData,
  overviewTopCount,
  overviewTopPeriodTitle,
  overviewTopManga,
  overviewTopAnime,
  overviewMangaTopFades,
  overviewAnimeTopFades,
  overviewMangaTopScrollRef,
  overviewAnimeTopScrollRef,
  overviewDailyTotalsForYear,
  animeDailyTotalsForYear,
  mangaDailyTotalsForYear,
}: OverviewTabProps) {
  return (
    <div className="overview-page">
      <div className="overview-stats-cluster">
        <div className="fade-in stat-stat-al-row--overview">
          <StatCard label="Épisodes vus" value={totalEp} icon="play" />
          <StatCard label="Score anime" value={avgA} icon="star" />
          <StatCard label="Chapitres lus" value={totalCh} icon="book" />
          <StatCard label="Score manga" value={avgM} icon="star" />
          <StatCard
            label="Jours actifs"
            value={`${activeDaysCount}\u00A0/\u00A0${periodDayTotal}`}
            icon="calendar"
          />
        </div>
        <hr className="overview-stats-divider" />
      </div>

      <div className="fade-in fade-in-delay-1">
        <ActivityHeatmap
          year={year}
          title={`Calendrier d'activité ${year}`}
          dailyTotals={overviewDailyTotalsForYear}
          unitSingular="action"
          unitPlural="actions"
          collapseId="overview.heatmap"
          titleHint="Chaque cellule représente une journée de l'année. La couleur indique l'intensité totale d'activité (anime + manga). Une « action » correspond à un épisode vu ou un chapitre lu. Survole une cellule pour voir le détail anime / manga du jour."
          breakdown={[
            {
              key: "anime",
              label: "Anime",
              unitSingular: "épisode",
              unitPlural: "épisodes",
              values: animeDailyTotalsForYear,
            },
            {
              key: "manga",
              label: "Manga",
              unitSingular: "chapitre",
              unitPlural: "chapitres",
              values: mangaDailyTotalsForYear,
            },
          ]}
        />
      </div>

      <div key={`overview-${year}-${month}`} className="overview-period-body">
        <div className="overview-main-column">
          <div className="overview-section fade-in fade-in-delay-1">
            <div className="overview-section__inner">
              <div className="chart-section">
                <h2 className="overview-block-title">Chapitres lus</h2>
                <ChartCard noTitle className="chart-card--overview-line">
                  <PeriodCompareLegend
                    legendCurrent={chartPeriodLegend.legendCurrent}
                    legendCompare={chartPeriodLegend.legendCompare}
                  />
                  {compareAvailability.missing && (
                    <div
                      style={{
                        color: compareAvailability.loadingComparison ? C.textMuted : C.orange,
                        fontSize: 12,
                        marginBottom: 8,
                      }}
                    >
                      {compareAvailability.loadingComparison
                        ? compareAvailability.loadingLabel
                        : compareAvailability.idleLabel}
                    </div>
                  )}
                  <OverviewActivityLineChart
                    data={mangaChaptersChartData}
                    month={month}
                    year={year}
                    fillGradientId="overview-activity-area-manga"
                  />
                </ChartCard>
              </div>

              <div className="fade-in fade-in-delay-2">
                <h3 className="overview-block-title">
                  Ton top {overviewTopCount} manga {overviewTopPeriodTitle}
                </h3>
                {overviewTopManga.length > 0 ? (
                  <div
                    className={[
                      "overview-top-scroll",
                      overviewMangaTopFades.left && "overview-top-scroll--fade-start",
                      overviewMangaTopFades.right && "overview-top-scroll--fade-end",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div ref={overviewMangaTopScrollRef} className="overview-top-scroll__track">
                      {overviewTopManga.map((e) => (
                        <MediaCard key={e.id} entry={e} type="MANGA" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="overview-top-empty"
                    style={{ color: C.textDim, fontSize: 17, fontWeight: 600, lineHeight: 1.45 }}
                  >
                    Aucun manga à afficher pour cette période.
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="overview-section fade-in fade-in-delay-3">
            <div className="overview-section__inner">
              <div className="chart-section">
                <h2 className="overview-block-title">Épisodes vus</h2>
                <ChartCard noTitle className="chart-card--overview-line">
                  <PeriodCompareLegend
                    legendCurrent={chartPeriodLegend.legendCurrent}
                    legendCompare={chartPeriodLegend.legendCompare}
                  />
                  {compareAvailability.missing && (
                    <div
                      style={{
                        color: compareAvailability.loadingComparison ? C.textMuted : C.orange,
                        fontSize: 12,
                        marginBottom: 8,
                      }}
                    >
                      {compareAvailability.loadingComparison
                        ? compareAvailability.loadingLabel
                        : compareAvailability.idleLabel}
                    </div>
                  )}
                  <OverviewActivityLineChart
                    data={animeEpisodesChartData}
                    month={month}
                    year={year}
                    fillGradientId="overview-activity-area-anime"
                  />
                </ChartCard>
              </div>

              <div className="fade-in fade-in-delay-4">
                <h3 className="overview-block-title">
                  Ton top {overviewTopCount} anime {overviewTopPeriodTitle}
                </h3>
                {overviewTopAnime.length > 0 ? (
                  <div
                    className={[
                      "overview-top-scroll",
                      overviewAnimeTopFades.left && "overview-top-scroll--fade-start",
                      overviewAnimeTopFades.right && "overview-top-scroll--fade-end",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <div ref={overviewAnimeTopScrollRef} className="overview-top-scroll__track">
                      {overviewTopAnime.map((e) => (
                        <MediaCard key={e.id} entry={e} type="ANIME" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    className="overview-top-empty"
                    style={{ color: C.textDim, fontSize: 17, fontWeight: 600, lineHeight: 1.45 }}
                  >
                    Aucun anime à afficher pour cette période.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
