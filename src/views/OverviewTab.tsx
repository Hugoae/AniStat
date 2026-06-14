import { memo, useEffect, useState, type RefObject } from "react";
import {
  StatCard,
  ChartCard,
  MediaCard,
  SectionTitle,
  EmptyState,
} from "../components/ui";
import { OverviewActivityLineChart } from "../components/charts/OverviewActivityLineChart";
import { ActivityHeatmap, type DailyTotalsByIso } from "../components/charts/ActivityHeatmap";
import { CarouselNavButtons } from "../components/ui/CarouselNavButtons";
import { useProfilePeriod } from "../contexts/profilePeriodCore";
import type { AniListEntry } from "../types/domain";
import {
  mergeRecentActivities,
  type OverviewRecentActivity,
} from "../lib/overviewRecentActivities";

const OVERVIEW_RECENT_INITIAL = 10;
const OVERVIEW_RECENT_MAX = 30;

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
  overviewRecentActivities: OverviewRecentActivity[];
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
  overviewRecentActivities,
}: OverviewTabProps) {
  const { year, month, isAllTime } = useProfilePeriod();
  const [recentExpanded, setRecentExpanded] = useState(false);

  useEffect(() => {
    setRecentExpanded(false);
  }, [year, month, overviewRecentActivities]);

  const mergedRecentActivities = mergeRecentActivities(overviewRecentActivities);
  const recentVisibleCount = recentExpanded ? OVERVIEW_RECENT_MAX : OVERVIEW_RECENT_INITIAL;
  const recentVisible = mergedRecentActivities.slice(0, recentVisibleCount);
  const recentHasToggle = mergedRecentActivities.length > OVERVIEW_RECENT_INITIAL;

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

          <div className="overview-recent-activities fade-in fade-in-delay-5">
            <SectionTitle as="h3" size="lg">
              Dernières activités
            </SectionTitle>
            {mergedRecentActivities.length > 0 ? (
              <>
                <ul className="overview-recent-activities-grid">
                  {recentVisible.map((item) => (
                    <li key={item.key} className="overview-recent-activity">
                      {item.coverUrl ? (
                        <img
                          className="overview-recent-activity__cover"
                          src={item.coverUrl}
                          alt=""
                          loading="lazy"
                          decoding="async"
                        />
                      ) : (
                        <div className="overview-recent-activity__cover overview-recent-activity__cover--fallback" aria-hidden />
                      )}
                      <div className="overview-recent-activity__body">
                        <p className="overview-recent-activity__text">
                          {item.prefix}
                          <a
                            className="overview-recent-activity__title-link"
                            href={item.mediaUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                          >
                            {item.title}
                          </a>
                        </p>
                        <time
                          className="overview-recent-activity__date"
                          dateTime={new Date(item.createdAt * 1000).toISOString()}
                        >
                          {item.formattedAt}
                        </time>
                      </div>
                    </li>
                  ))}
                </ul>
                {recentHasToggle ? (
                  <div className="overview-recent-activities-actions">
                    <button
                      type="button"
                      className={`list-tab-anime-more-btn${recentExpanded ? " list-tab-anime-more-btn--collapse" : ""}`}
                      onClick={() => setRecentExpanded((prev) => !prev)}
                      aria-expanded={recentExpanded}
                    >
                      <span>{recentExpanded ? "Voir moins" : "Voir plus"}</span>
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
                        <path d={recentExpanded ? "M18 15l-6-6-6 6" : "M6 9l6 6 6-6"} />
                      </svg>
                    </button>
                  </div>
                ) : null}
              </>
            ) : (
              <EmptyState
                compact
                icon="calendar"
                title="Aucune activité récente pour cette période."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
});
