import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
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
} from "../components/AppUi";
import { StatLabelHint } from "../components/appUi/StatPrimitives";
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
import { resolveLocalStudioLogoUrl } from "../lib/studioLogos";
import type { AniListEntry } from "../types/domain";

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
  animeScoreHalfDistributionRows: { bucket: number; label: string; count: number }[];
  animeGenrePeriodData: { name: string; count: number }[];
  animeDurationByFormatData: { name: string; minutes: number }[];
  animeDurationByCountryData: { code: string; minutes: number }[];
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
  animeScoreHalfDistributionRows,
  animeGenrePeriodData,
  animeDurationByFormatData,
  animeDurationByCountryData,
  animeTopStudios,
  animeReleaseYearHistogram,
  animeSeasonHistogram,
  animeListLayoutActive,
}: AnimeTabProps) {
  const [studiosExpanded, setStudiosExpanded] = useState(false);
  const [studioLogoByName, setStudioLogoByName] = useState<Record<string, string>>({});
  const [animeListExpanded, setAnimeListExpanded] = useState(false);
  const [animeListGridWidth, setAnimeListGridWidth] = useState(0);
  const animeMediaGridRef = useRef<HTMLDivElement | null>(null);
  const [animeSearchQuery, setAnimeSearchQuery] = useState("");
  const [animeSortKey, setAnimeSortKey] = useState<AnimeGridSortKey>(ANIME_GRID_SORT_DEFAULT);
  const [animeFilterScoredOnly, setAnimeFilterScoredOnly] = useState(false);
  const [animeFilterCompletedOnly, setAnimeFilterCompletedOnly] = useState(false);

  const viewFullYearCta =
    month !== 0 ? (
      <button type="button" className="list-tab-empty-cta" onClick={() => setMonth(0)}>
        Voir toute l&apos;année {year}
      </button>
    ) : null;

  const animeSearchNormalized = useMemo(
    () => normalizeAnimeSearchText(animeSearchQuery),
    [animeSearchQuery]
  );
  const animeGridFiltered = useMemo(
    () =>
      filterAnimeGridEntries(animeTabEntries, {
        normalizedSearch: animeSearchNormalized,
        scoredOnly: animeFilterScoredOnly,
        completedOnly: animeFilterCompletedOnly,
      }),
    [animeTabEntries, animeSearchNormalized, animeFilterScoredOnly, animeFilterCompletedOnly]
  );
  const animeGridSorted = useMemo(
    () => [...animeGridFiltered].sort((a, b) => compareAnimeGridEntries(a, b, animeSortKey)),
    [animeGridFiltered, animeSortKey]
  );

  /** Colonnes = cartes 155px + gap 14px (aligné sur .list-tab-media-grid). */
  const animeListGridColumns = useMemo(() => {
    const w = animeListGridWidth;
    if (!Number.isFinite(w) || w <= 0) return 1;
    const cell = LIST_TAB_ANIME_CARD_WIDTH + LIST_TAB_ANIME_GRID_GAP;
    return Math.max(1, Math.floor((w + LIST_TAB_ANIME_GRID_GAP) / cell));
  }, [animeListGridWidth]);
  const animeListCollapsedMax = animeListGridColumns * LIST_TAB_ANIME_VISIBLE_ROWS;
  const animeListNeedsMoreLess = animeGridSorted.length > animeListCollapsedMax;
  const animeListToShow = useMemo(() => {
    if (!animeListNeedsMoreLess || animeListExpanded) return animeGridSorted;
    return animeGridSorted.slice(0, animeListCollapsedMax);
  }, [animeGridSorted, animeListNeedsMoreLess, animeListExpanded, animeListCollapsedMax]);

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

  useEffect(() => {
    setAnimeListExpanded(false);
    setAnimeSearchQuery("");
    setAnimeSortKey(ANIME_GRID_SORT_DEFAULT);
    setAnimeFilterScoredOnly(false);
    setAnimeFilterCompletedOnly(false);
  }, [year, month]);
  const formatMinutesByName = useMemo(
    () =>
      new Map(
        animeDurationByFormatData.map((row) => [String(row.name), Number(row.minutes) || 0] as const)
      ),
    [animeDurationByFormatData]
  );
  const countryMinutesByCode = useMemo(
    () =>
      new Map(
        animeDurationByCountryData.map((row) => [String(row.code), Number(row.minutes) || 0] as const)
      ),
    [animeDurationByCountryData]
  );
  const formatMinutesHm = (minutesRaw: number) => {
    const minutes = Math.max(0, Math.round(Number(minutesRaw) || 0));
    const hours = Math.floor(minutes / 60);
    const remain = minutes % 60;
    return `${hours}h ${remain}min`;
  };
  const formatPieSlices = useMemo(
    () =>
      fmtData.map((row, i) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: row.value,
        fill: PIE_COLORS[i % PIE_COLORS.length],
        extraInfo: formatMinutesHm(formatMinutesByName.get(String(row.name)) || 0),
      })),
    [fmtData, formatMinutesByName]
  );

  const countryPieSlices = useMemo(
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
          extraInfo: formatMinutesHm(countryMinutesByCode.get(code) || 0),
        };
      }),
    [animeCountryEntriesOrdered, countryMinutesByCode]
  );
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
  }, [visibleStudioNamesKey]);

  useEffect(() => {
    setStudiosExpanded(false);
  }, [year, month]);

  return (
    <div className="list-tab-page">
      <div id="anime-synthese" className="overview-stats-cluster list-tab-anchor">
        <div className="fade-in stat-stat-al-row--overview">
          <StatCard label="Total anime" value={animeEntriesLength} icon="tv" />
          <StatCard label="Épisodes vus" value={totalEp} icon="play" />
          <StatCard label="Temps" value={fmtMin(totalMin)} icon="clock" />
          <StatCard label="Score moyen" value={avgA} icon="star" />
          <StatCard
            label="Écart-type"
            value={animeVsCommunityScoreStdDev}
            icon="divide"
            labelHint="Dispersion de vos écarts (votre note − moyenne AniList). Le + ou − indique si vous tendez à noter en moyenne au-dessus ou en dessous de la moyenne du site."
          />
        </div>
        <hr className="overview-stats-divider" />
      </div>

      <section
        id="anime-repartition"
        className="overview-section fade-in list-tab-distribution-section list-tab-anchor"
        aria-labelledby="anime-par-statut-title"
      >
        <div className="list-tab-distribution">
          <div className="list-tab-distribution__col">
            <h2 id="anime-par-statut-title" className="overview-block-title">
              Par statut
            </h2>
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
            <h2 id="anime-par-pays-title" className="overview-block-title">
              Par pays d’origine
            </h2>
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
            <h2 id="anime-par-format-title" className="overview-block-title">
              Par format
            </h2>
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
              </div>
            </div>
            <div className="list-tab-anime-grid-toolbar__sort">
              <span className="list-tab-anime-grid-toolbar__eyebrow" id="anime-grid-sort-label">
                Trier par
              </span>
              <div className="list-tab-anime-grid-toolbar__select-shell">
                <select
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
        {animeTabEntries.length > 0 && animeGridFiltered.length === 0 ? (
          <div className="list-tab-anime-grid-empty-filters">
            <p className="list-tab-anime-grid-empty-filters__text">Aucun titre ne correspond aux filtres.</p>
            <button
              type="button"
              className="list-tab-empty-cta"
              onClick={() => {
                setAnimeSearchQuery("");
                setAnimeFilterScoredOnly(false);
                setAnimeFilterCompletedOnly(false);
              }}
            >
              Réinitialiser filtres
            </button>
          </div>
        ) : null}
        <div
          ref={animeMediaGridRef}
          className="list-tab-media-grid"
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
        {animeListNeedsMoreLess && !animeListExpanded ? (
          <button
            type="button"
            className="list-tab-anime-more-btn"
            onClick={() => setAnimeListExpanded(true)}
            aria-expanded={false}
          >
            <span>Voir plus</span>
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
        {animeListNeedsMoreLess && animeListExpanded ? (
          <button
            type="button"
            className="list-tab-anime-more-btn list-tab-anime-more-btn--collapse"
            onClick={() => setAnimeListExpanded(false)}
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

      <div
        key={`anime-viz-${year}-${month}`}
        className="list-tab-anime-viz-reveal"
      >
      <div id="anime-graphiques" className="list-tab-anime-charts-section list-tab-anchor">
        <div className="list-tab-anime-charts list-tab-anime-charts--two">
        <div className="list-tab-anime-chart-block">
        <div className="chart-card__title-row chart-card__title-row--with-hint list-tab-anime-chart-block__title-row">
          <h2 className="chart-card__title">Répartition des scores</h2>
          <StatLabelHint text="Chaque note est ramenée au demi-point le plus proche avant d’être comptée (ex. 7,2 → 7 ; 7,8 → 8 ; 8,25 → 8,5)" />
        </div>
        <ChartCard
          noTitle
          className="list-tab-anime-chart--scores"
          screenReaderSummary="Histogramme des scores : effectifs par tranche de demi-point de 1 à 10 pour les anime notés sur la période."
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
            <div className="list-tab-anime-charts__empty list-tab-anime-charts__empty--with-cta">
              <span style={{ color: C.textMuted }}>Aucun score sur les anime de cette période.</span>
              {viewFullYearCta}
            </div>
          )}
        </ChartCard>
        </div>

          <div className="list-tab-anime-chart-block">
          <div className="chart-card__title-row list-tab-anime-chart-block__title-row">
            <h2 className="chart-card__title">Genres</h2>
          </div>
          <ChartCard
            noTitle
            screenReaderSummary="Radar des dix genres les plus fréquents sur les anime de la période."
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
              <div className="list-tab-anime-charts__empty list-tab-anime-charts__empty--with-cta">
                <span style={{ color: C.textMuted }}>Aucun genre renseigné pour les anime de cette période.</span>
                {viewFullYearCta}
              </div>
            )}
          </ChartCard>
          </div>
        </div>

        <div className="list-tab-anime-charts list-tab-anime-charts--two">
          <div className="list-tab-anime-chart-block">
          <div className="chart-card__title-row list-tab-anime-chart-block__title-row">
            <h2 className="chart-card__title">Année de sortie</h2>
          </div>
          <ChartCard
            noTitle
            screenReaderSummary="Nombre d’anime de la période par année de sortie (seasonYear ou date de début)."
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
              <div className="list-tab-anime-charts__empty list-tab-anime-charts__empty--with-cta">
                <span style={{ color: C.textMuted }}>Aucune année de sortie renseignée sur ces titres.</span>
                {viewFullYearCta}
              </div>
            )}
          </ChartCard>
          </div>

          <div className="list-tab-anime-chart-block">
            <div className="chart-card__title-row list-tab-anime-chart-block__title-row">
              <h2 className="chart-card__title">Saison de diffusion</h2>
            </div>
            <ChartCard
              noTitle
              screenReaderSummary="Répartition des anime de la période par saison de diffusion AniList (hiver, printemps, été, automne)."
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
                <div className="list-tab-anime-charts__empty list-tab-anime-charts__empty--with-cta">
                  <span style={{ color: C.textMuted }}>Aucune saison à afficher pour cette sélection.</span>
                  {viewFullYearCta}
                </div>
              )}
            </ChartCard>
          </div>
        </div>

      </div>

      <div id="anime-camemberts" className="list-tab-anime-pie-bottom list-tab-anchor">
        <div className="list-tab-pie-pair">
          <AnimePieDistributionCard
            title="Répartition par format"
            screenReaderSummary="Camembert des formats (effectifs de titres sur la période)."
            slices={formatPieSlices}
            emptyExtra={viewFullYearCta}
            footnote="Le pourcentage représente la part de titres, la durée est une information complémentaire."
          />
          <AnimePieDistributionCard
            title="Pays d’origine"
            screenReaderSummary="Camembert des pays d’origine des anime sur la période."
            slices={countryPieSlices}
            emptyExtra={viewFullYearCta}
            footnote="Le pourcentage représente la part de titres, la durée est une information complémentaire."
          />
        </div>
      </div>
      </div>

      <section
        id="anime-studios"
        className="list-tab-studios-section list-tab-anchor"
        aria-labelledby="anime-studios-title"
        aria-describedby={animeTopStudios.length > 0 ? "anime-studios-summary" : undefined}
      >
        <div className="list-tab-anime-chart-block__title-row list-tab-studios-section__title-row">
          <h2 id="anime-studios-title" className="chart-card__title">
            Studios
          </h2>
        </div>
        {animeTopStudios.length > 0 ? (
          <>
            <p id="anime-studios-summary" className="chart-card__sr-only">
              Studios d&apos;animation AniList sur la période (hors producteurs), avec aperçu des titres.
            </p>
            <div className="list-tab-studios-grid">
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
          <div className="list-tab-anime-charts__empty list-tab-anime-charts__empty--with-cta">
            <span style={{ color: C.textMuted }}>
              Aucun studio d&apos;animation listé par l&apos;API pour cette sélection.
            </span>
            {viewFullYearCta}
          </div>
        )}
      </section>
    </div>
  );
}
