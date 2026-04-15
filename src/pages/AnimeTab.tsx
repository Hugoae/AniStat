import { useMemo, type RefObject } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
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
import { ANIME_GENRE_RADAR_TOP_N } from "../app/listConstants";
import { animeHalfScoreBarColor } from "../lib/animeScoreUtils";
import { RechartsWhenVisible } from "../components/RechartsWhenVisible";
import { AnimePieDistributionCard } from "../components/AnimePieDistributionCard";
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
  animeListToShow: AniListEntry[];
  animeListNeedsMoreLess: boolean;
  animeListExpanded: boolean;
  setAnimeListExpanded: (v: boolean) => void;
  animeMediaGridRef: RefObject<HTMLDivElement | null>;
  animeScoreHalfDistributionRows: { bucket: number; label: string; count: number }[];
  animeGenrePeriodData: { name: string; count: number }[];
  animeDurationByFormatData: { name: string; minutes: number }[];
  animeTopStudios: { name: string; count: number }[];
  animeTopProducers: { name: string; count: number }[];
  animeReleaseYearHistogram: { yearLabel: string; count: number }[];
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
  animeListToShow,
  animeListNeedsMoreLess,
  animeListExpanded,
  setAnimeListExpanded,
  animeMediaGridRef,
  animeScoreHalfDistributionRows,
  animeGenrePeriodData,
  animeDurationByFormatData,
  animeTopStudios,
  animeTopProducers,
  animeReleaseYearHistogram,
}: AnimeTabProps) {
  const formatPieSlices = useMemo(
    () =>
      fmtData.map((row, i) => ({
        key: String(row.name),
        label: mediaFormatShortLabel(row.name) || String(row.name),
        value: row.value,
        fill: PIE_COLORS[i % PIE_COLORS.length],
      })),
    [fmtData]
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
        };
      }),
    [animeCountryEntriesOrdered]
  );

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
        <div ref={animeMediaGridRef} className="list-tab-media-grid">
          {animeListToShow.map((e) => (
            <MediaCard key={e.id} entry={e} type="ANIME" />
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

      <div id="anime-graphiques" className="list-tab-anime-charts-section list-tab-anchor">
        <ChartCard
          className="list-tab-anime-chart--scores"
          title="Répartition des scores"
          titleHint="Chaque note est ramenée au demi-point le plus proche avant d’être comptée (ex. 7,2 → 7 ; 7,8 → 8 ; 8,25 → 8,5)"
          screenReaderSummary="Histogramme des scores : effectifs par tranche de demi-point de 1 à 10 pour les anime notés sur la période."
        >
          {animeScoreHalfDistributionRows.length > 0 ? (
            <div className="list-tab-anime-score-chart-wrap">
              <RechartsWhenVisible height={348} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={348}>
                  <BarChart
                    data={animeScoreHalfDistributionRows}
                    margin={{ top: 26, right: 8, left: 4, bottom: 10 }}
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
                      height={36}
                    />
                    <YAxis type="number" hide width={0} domain={[0, "auto"]} />
                    <Tooltip content={<CTooltip />} cursor={{ fill: "rgba(61, 180, 242, 0.07)" }} />
                    <Bar dataKey="count" name="Anime" radius={0} maxBarSize={40}>
                      {animeScoreHalfDistributionRows.map((row) => (
                        <Cell key={row.bucket} fill={animeHalfScoreBarColor(row.bucket)} />
                      ))}
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
              {month !== 0 ? (
                <button type="button" className="list-tab-empty-cta" onClick={() => setMonth(0)}>
                  Voir toute l&apos;année {year}
                </button>
              ) : null}
            </div>
          )}
        </ChartCard>

        <div className="list-tab-anime-charts list-tab-anime-charts--genre-only">
          <ChartCard
            title="Genres"
            screenReaderSummary="Radar des dix genres les plus fréquents sur les anime de la période."
          >
            {animeGenrePeriodData.length > 0 ? (
              <RechartsWhenVisible height={320} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={320}>
                  <RadarChart data={animeGenrePeriodData.slice(0, ANIME_GENRE_RADAR_TOP_N)} outerRadius="76%">
                    <PolarGrid stroke={C.border} strokeOpacity={0.65} />
                    <PolarAngleAxis dataKey="name" tick={{ fill: C.textMuted, fontSize: 10 }} />
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
                {month !== 0 ? (
                  <button type="button" className="list-tab-empty-cta" onClick={() => setMonth(0)}>
                    Voir toute l&apos;année {year}
                  </button>
                ) : null}
              </div>
            )}
          </ChartCard>
        </div>

        <div className="list-tab-anime-charts list-tab-anime-charts--two">
          <ChartCard
            title="Durée visionnée par format"
            titleHint="Minutes = épisodes regardés dans la période × durée d’un épisode (24 min si AniList ne fournit pas la durée)."
            screenReaderSummary="Temps de visionnement agrégé par format, à partir des activités de la période."
          >
            {animeDurationByFormatData.length > 0 ? (
              <RechartsWhenVisible height={300} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={animeDurationByFormatData} margin={{ top: 12, right: 8, left: 4, bottom: 44 }}>
                    <CartesianGrid strokeDasharray="3 6" horizontal vertical={false} stroke="rgba(139, 160, 178, 0.12)" />
                    <XAxis
                      dataKey="name"
                      tickFormatter={(v) => mediaFormatShortLabel(String(v)) || String(v)}
                      angle={-28}
                      textAnchor="end"
                      interval={0}
                      height={54}
                      tick={{ fill: C.textMuted, fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} width={36} />
                    <Tooltip
                      content={<CTooltip />}
                      formatter={(v: number) => [fmtMin(Number(v)), "Temps"]}
                      labelFormatter={(v) => mediaFormatShortLabel(String(v)) || String(v)}
                    />
                    <Bar dataKey="minutes" name="Minutes" fill={C.accent} radius={[6, 6, 0, 0]} maxBarSize={56} />
                  </BarChart>
                </ResponsiveContainer>
              </RechartsWhenVisible>
            ) : (
              <div className="list-tab-anime-charts__empty">
                Pas assez d’activité sur la période pour estimer la durée par format.
              </div>
            )}
          </ChartCard>

          <ChartCard
            title="Année de sortie"
            screenReaderSummary="Nombre d’anime de la période par année de sortie (seasonYear ou date de début)."
          >
            {animeReleaseYearHistogram.length > 0 ? (
              <RechartsWhenVisible height={300} className="list-tab-anime-recharts-mount">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={animeReleaseYearHistogram} margin={{ top: 12, right: 8, left: 4, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 6" horizontal vertical={false} stroke="rgba(139, 160, 178, 0.12)" />
                    <XAxis
                      dataKey="yearLabel"
                      interval="preserveStartEnd"
                      minTickGap={20}
                      tick={{ fill: C.textMuted, fontSize: 10 }}
                    />
                    <YAxis tick={{ fill: C.textMuted, fontSize: 10 }} width={32} />
                    <Tooltip content={<CTooltip />} formatter={(v: number) => [String(v), "Titres"]} />
                    <Bar dataKey="count" name="Anime" fill={C.purple} radius={[6, 6, 0, 0]} maxBarSize={40} />
                  </BarChart>
                </ResponsiveContainer>
              </RechartsWhenVisible>
            ) : (
              <div className="list-tab-anime-charts__empty">Aucune année de sortie renseignée sur ces titres.</div>
            )}
          </ChartCard>
        </div>

        <div className="list-tab-anime-charts list-tab-anime-charts--two">
          <ChartCard title="Studios (principaux)" screenReaderSummary="Studios marqués comme principaux sur AniList.">
            {animeTopStudios.length > 0 ? (
              <div className="list-tab-distro-row">
                {animeTopStudios.map((s) => (
                  <div key={s.name} className="list-tab-status-pill">
                    <span className="list-tab-status-pill__count" style={{ color: C.accent }}>
                      {s.count}
                    </span>
                    <span className="list-tab-status-pill__label">{s.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="list-tab-anime-charts__empty">Aucun studio principal listé par l’API pour cette sélection.</div>
            )}
          </ChartCard>
          <ChartCard title="Autres studios / producteurs" screenReaderSummary="Studios non principaux (souvent co-productions).">
            {animeTopProducers.length > 0 ? (
              <div className="list-tab-distro-row">
                {animeTopProducers.map((p) => (
                  <div key={p.name} className="list-tab-status-pill">
                    <span className="list-tab-status-pill__count" style={{ color: C.yellow }}>
                      {p.count}
                    </span>
                    <span className="list-tab-status-pill__label">{p.name}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="list-tab-anime-charts__empty">Aucun producteur secondaire détecté.</div>
            )}
          </ChartCard>
        </div>
      </div>

      <div id="anime-camemberts" className="list-tab-anime-pie-bottom list-tab-anchor">
        <div className="list-tab-pie-pair">
          <AnimePieDistributionCard
            title="Répartition par format"
            screenReaderSummary="Camembert des formats (effectifs de titres sur la période)."
            slices={formatPieSlices}
          />
          <AnimePieDistributionCard
            title="Pays d’origine"
            screenReaderSummary="Camembert des pays d’origine des anime sur la période."
            slices={countryPieSlices}
          />
        </div>
      </div>
    </div>
  );
}
