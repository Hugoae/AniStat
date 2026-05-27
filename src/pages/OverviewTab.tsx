import { memo, type RefObject } from "react";
import {
  StatCard,
  ChartCard,
  MediaCard,
  SectionTitle,
  EmptyState,
} from "../components/AppUi";
import { OverviewActivityLineChart } from "../components/OverviewActivityLineChart";
import { ActivityHeatmap, type DailyTotalsByIso } from "../components/ActivityHeatmap";
import { CarouselNavButtons } from "../components/appUi/CarouselNavButtons";
import { useProfilePeriod } from "../contexts/profilePeriodCore";
import type { AniListEntry } from "../types/domain";

export type CompareAvailability = {
  missing: boolean;
  loadingComparison: boolean;
  loadingLabel: string;
  idleLabel: string;
};

export type OverviewTabProps = {
  totalAnime: number;
  totalManga: number;
  totalEp: number;
  totalTimeLabel: string;
  avgA: string;
  animeVsCommunityScoreStdDev: string;
  totalCh: number;
  avgM: string;
  mangaVsCommunityScoreStdDev: string;
  activeDaysCount: number;
  periodDayTotal: number;
  chartLegendCurrent: string;
  overviewCompareSelectValue: string;
  overviewCompareSelectOptions: { value: string; label: string }[];
  onOverviewCompareChange: (value: string) => void;
  /** Courbe grisée tant que les activités Supabase de comparaison manquent. */
  overviewCompareLineDimmed: boolean;
  overviewCompareEmptyLabel: string | null;
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

export const OverviewTab = memo(function OverviewTab({
  totalAnime,
  totalManga,
  totalEp,
  totalTimeLabel,
  avgA,
  animeVsCommunityScoreStdDev,
  totalCh,
  avgM,
  mangaVsCommunityScoreStdDev,
  activeDaysCount,
  periodDayTotal,
  chartLegendCurrent,
  overviewCompareSelectValue,
  overviewCompareSelectOptions,
  onOverviewCompareChange,
  overviewCompareLineDimmed,
  overviewCompareEmptyLabel,
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
  const { year, month, isAllTime } = useProfilePeriod();
  const periodYearLabel = isAllTime ? "All Time" : String(year);
  return (
    <div className="overview-page">
      <div className="overview-stats-cluster">
        {isAllTime ? (
          <>
            <div className="fade-in stat-stat-al-row--overview">
              <StatCard label="Total manga" value={totalManga} icon="book" />
              <StatCard label="Chapitres lus" value={totalCh} icon="book" />
              <StatCard label="Score moyen manga" value={avgM} icon="star" />
              <StatCard label="Dispersion (σ) manga" value={mangaVsCommunityScoreStdDev} icon="divide" />
              <StatCard label="Jours actifs" value={activeDaysCount} icon="calendar" />
            </div>
            <div className="fade-in stat-stat-al-row--overview">
              <StatCard label="Total animé" value={totalAnime} icon="tv" />
              <StatCard label="Épisodes vus" value={totalEp} icon="play" />
              <StatCard label="Score moyen anime" value={avgA} icon="star" />
              <StatCard label="Dispersion (σ) anime" value={animeVsCommunityScoreStdDev} icon="divide" />
              <StatCard label="Temps total" value={totalTimeLabel} icon="clock" />
            </div>
          </>
        ) : (
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
        )}
        <hr className="overview-stats-divider" />
      </div>

      {!isAllTime ? (
        <div className="fade-in fade-in-delay-1">
        <ActivityHeatmap
          year={year}
          title={`Calendrier d'activité ${periodYearLabel}`}
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
      ) : null}

      <div key={`overview-${year}-${month}`} className="overview-period-body">
        <div className="overview-main-column">
          <div className="overview-section fade-in fade-in-delay-1">
            <div className="overview-section__inner">
              <div className="chart-section">
                <SectionTitle size="lg">Chapitres lus</SectionTitle>
                <ChartCard noTitle className="chart-card--overview-line">
                  {!isAllTime && compareAvailability.missing ? (
                    <div
                      className={`overview-compare-hint${compareAvailability.loadingComparison ? " overview-compare-hint--loading" : ""}`}
                    >
                      {compareAvailability.loadingComparison
                        ? compareAvailability.loadingLabel
                        : compareAvailability.idleLabel}
                    </div>
                  ) : null}
                  <OverviewActivityLineChart
                    data={mangaChaptersChartData}
                    month={month}
                    year={year}
                    fillGradientId="overview-activity-area-manga"
                    compareLineDimmed={overviewCompareLineDimmed}
                    legendCurrent={chartLegendCurrent}
                    compareValue={overviewCompareSelectValue}
                    compareOptions={overviewCompareSelectOptions}
                    onCompareChange={onOverviewCompareChange}
                    compareEmptyLabel={overviewCompareEmptyLabel}
                  />
                </ChartCard>
              </div>

              <div className="fade-in fade-in-delay-2">
                <SectionTitle as="h3" size="lg">
                  Ton top {overviewTopCount} manga {overviewTopPeriodTitle}
                </SectionTitle>
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
                    <div ref={overviewMangaTopScrollRef} className="overview-top-scroll__track stagger-reveal">
                      {overviewTopManga.map((e) => (
                        <MediaCard key={e.id} entry={e} type="MANGA" />
                      ))}
                    </div>
                    <CarouselNavButtons
                      scrollRef={overviewMangaTopScrollRef}
                      canScrollLeft={overviewMangaTopFades.left}
                      canScrollRight={overviewMangaTopFades.right}
                      ariaLabelBase={`Top manga ${overviewTopPeriodTitle}`}
                    />
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon="book"
                    title="Aucun manga à afficher pour cette période."
                  />
                )}
              </div>
            </div>
          </div>

          <div className="overview-section fade-in fade-in-delay-3">
            <div className="overview-section__inner">
              <div className="chart-section">
                <SectionTitle size="lg">Épisodes vus</SectionTitle>
                <ChartCard noTitle className="chart-card--overview-line">
                  {!isAllTime && compareAvailability.missing ? (
                    <div
                      className={`overview-compare-hint${compareAvailability.loadingComparison ? " overview-compare-hint--loading" : ""}`}
                    >
                      {compareAvailability.loadingComparison
                        ? compareAvailability.loadingLabel
                        : compareAvailability.idleLabel}
                    </div>
                  ) : null}
                  <OverviewActivityLineChart
                    data={animeEpisodesChartData}
                    month={month}
                    year={year}
                    fillGradientId="overview-activity-area-anime"
                    compareLineDimmed={overviewCompareLineDimmed}
                    legendCurrent={chartLegendCurrent}
                    compareValue={overviewCompareSelectValue}
                    compareOptions={overviewCompareSelectOptions}
                    onCompareChange={onOverviewCompareChange}
                    compareEmptyLabel={overviewCompareEmptyLabel}
                  />
                </ChartCard>
              </div>

              <div className="fade-in fade-in-delay-4">
                <SectionTitle as="h3" size="lg">
                  Ton top {overviewTopCount} anime {overviewTopPeriodTitle}
                </SectionTitle>
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
                    <div ref={overviewAnimeTopScrollRef} className="overview-top-scroll__track stagger-reveal">
                      {overviewTopAnime.map((e) => (
                        <MediaCard key={e.id} entry={e} type="ANIME" />
                      ))}
                    </div>
                    <CarouselNavButtons
                      scrollRef={overviewAnimeTopScrollRef}
                      canScrollLeft={overviewAnimeTopFades.left}
                      canScrollRight={overviewAnimeTopFades.right}
                      ariaLabelBase={`Top anime ${overviewTopPeriodTitle}`}
                    />
                  </div>
                ) : (
                  <EmptyState
                    compact
                    icon="tv"
                    title="Aucun anime à afficher pour cette période."
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});
