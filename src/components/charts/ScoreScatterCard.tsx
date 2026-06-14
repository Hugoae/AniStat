import { useId, useMemo, type ReactNode } from "react";
import {
  CartesianGrid,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { ChartCard } from "./ChartCard";
import { EmptyState, SectionTitle } from "../ui";
import { RechartsWhenVisible } from "./RechartsWhenVisible";
import { ChartCollapseToggle } from "./ChartCollapseToggle";
import { useCollapsedChart } from "../../hooks/useCollapsedChart";
import { C } from "../../config/constants";
import type { AniListEntry } from "../../types/domain";

export type ScoreScatterCardProps = {
  /** Entrées de la période (anime ou manga). On filtre celles qui ont à la fois ta note et la note AniList. */
  entries: AniListEntry[];
  kind: "anime" | "manga";
  /** Bouton CTA affiché sous le message vide (ex. "Voir toute l'année"). */
  emptyExtra?: ReactNode;
  className?: string;
  /** Identifiant stable pour mémoriser l'état « masqué ». Si absent, pas de bouton de collapse. */
  collapseId?: string;
};

type ScatterPoint = {
  user: number;
  site: number;
  /** Coordonnée Y dessinée (= user + jitter pour limiter la superposition). */
  yDraw: number;
  delta: number;
  title: string;
  coverImageUrl: string | null;
  anilistUrl: string | null;
  fill: string;
};

const COLOR_OVER = C.green;
const COLOR_UNDER = C.red;
const COLOR_NEUTRAL = C.accent;
const NEUTRAL_THRESHOLD = 0.5;

/** Jitter déterministe sur Y pour limiter la superposition exacte des points (mêmes notes). */
function deterministicJitter(seed: number) {
  const a = Math.sin(seed * 9301 + 49297) * 233280;
  const fract = a - Math.floor(a);
  return (fract - 0.5) * 0.28;
}

function colorForDelta(delta: number) {
  if (delta > NEUTRAL_THRESHOLD) return COLOR_OVER;
  if (delta < -NEUTRAL_THRESHOLD) return COLOR_UNDER;
  return COLOR_NEUTRAL;
}

function ScatterTooltip({
  active,
  payload,
  kind,
}: {
  active?: boolean;
  payload?: Array<{ payload?: ScatterPoint }>;
  kind: "anime" | "manga";
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  const sign = p.delta >= 0 ? "+" : "\u2212";
  const deltaColor = colorForDelta(p.delta);
  const noun = kind === "manga" ? "manga" : "anime";
  return (
    <div className="chart-tooltip chart-tooltip--scatter">
      <div className="chart-tooltip__title chart-tooltip__title--compact">{p.title}</div>
      <div className="chart-tooltip__scatter-body">
        <span>
          Ta note&nbsp;: <strong className="chart-tooltip__value">{p.user.toFixed(1)} / 10</strong>
        </span>
        <span>
          Moyenne AniList&nbsp;: <strong className="chart-tooltip__value">{p.site.toFixed(1)} / 10</strong>
        </span>
        <span>
          Écart&nbsp;:{" "}
          <strong style={{ color: deltaColor }}>
            {sign}
            {Math.abs(p.delta).toFixed(2)}
          </strong>{" "}
          <span className="chart-tooltip__scatter-hint">
            ({p.delta > 0 ? `tu sur-notes ce ${noun}` : p.delta < 0 ? `tu sous-notes ce ${noun}` : "note alignée"})
          </span>
        </span>
      </div>
    </div>
  );
}

export function ScoreScatterCard({ entries, kind, emptyExtra, className, collapseId }: ScoreScatterCardProps) {
  const collapseState = useCollapsedChart(collapseId || "");
  const collapsed = collapseId ? collapseState.collapsed : false;
  const groupId = useId();
  const bodyId = `${groupId}-body`;
  const points = useMemo<ScatterPoint[]>(() => {
    const out: ScatterPoint[] = [];
    for (const e of entries) {
      const user = Number(e?.score || 0);
      if (!Number.isFinite(user) || user <= 0) continue;
      const rawSite = Number(e?.media?.averageScore);
      if (!Number.isFinite(rawSite) || rawSite <= 0) continue;
      const site = rawSite / 10;
      const delta = user - site;
      const mediaId = e?.media?.id ?? 0;
      out.push({
        user,
        site,
        yDraw: Math.max(0, Math.min(10, user + deterministicJitter(mediaId))),
        delta,
        title: String(e?.media?.title?.english || e?.media?.title?.romaji || "Sans titre"),
        coverImageUrl: e?.media?.coverImage?.large || e?.media?.coverImage?.medium || null,
        anilistUrl: e?.media?.siteUrl || null,
        fill: colorForDelta(delta),
      });
    }
    return out;
  }, [entries]);

  const counts = useMemo(() => {
    let over = 0;
    let under = 0;
    let neutral = 0;
    for (const p of points) {
      if (p.delta > NEUTRAL_THRESHOLD) over++;
      else if (p.delta < -NEUTRAL_THRESHOLD) under++;
      else neutral++;
    }
    return { over, under, neutral };
  }, [points]);

  const stats = useMemo(() => {
    if (points.length === 0) return null;
    const n = points.length;
    const meanDelta = points.reduce((s, p) => s + p.delta, 0) / n;
    if (n < 2) return { meanDelta, sigma: null as number | null, n };
    const variance =
      points.reduce((s, p) => s + (p.delta - meanDelta) ** 2, 0) / (n - 1);
    return { meanDelta, sigma: Math.sqrt(variance), n };
  }, [points]);

  return (
    <div className={`list-tab-anime-chart-block${className ? ` ${className}` : ""}`}>
      <SectionTitle
        rowClassName="list-tab-anime-chart-block__title-row"
        aside={
          collapseId ? (
            <ChartCollapseToggle
              collapsed={collapsed}
              onToggle={collapseState.toggle}
              chartTitle="Ta note vs note AniList"
              controlsId={bodyId}
            />
          ) : null
        }
      >
        Ta note vs note AniList
      </SectionTitle>
      <div
        className={`collapsible-chart-animator${collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
        aria-hidden={collapsed}
      >
      <div id={collapseId ? bodyId : undefined} className="collapsible-chart-animator__inner">
      <ChartCard
        noTitle
        screenReaderSummary={`Nuage de points : ta note (axe vertical) en fonction de la note moyenne AniList (axe horizontal). ${points.length} ${kind === "manga" ? "manga" : "anime"} affichés.`}
        dataTable={{
          caption: `Ta note vs note AniList (${kind === "manga" ? "manga" : "anime"})`,
          columns: ["Titre", "Ta note", "Moyenne AniList", "Écart"],
          rows: points.map((point) => [
            point.title,
            point.user.toFixed(1),
            point.site.toFixed(1),
            point.delta.toFixed(2),
          ]),
        }}
      >
        {points.length === 0 ? (
          <EmptyState
            icon="star"
            title="Pas assez de notes attribuées sur cette période pour comparer."
            description="Notez vos titres sur AniList pour débloquer ce graphique."
            cta={emptyExtra}
          />
        ) : (
          <div className="score-scatter">
            <RechartsWhenVisible height={320} className="list-tab-anime-recharts-mount">
              <ResponsiveContainer width="100%" height={320}>
                <ScatterChart margin={{ top: 14, right: 18, left: 4, bottom: 28 }}>
                  <CartesianGrid stroke="rgba(139, 160, 178, 0.12)" strokeDasharray="3 6" />
                  <XAxis
                    type="number"
                    dataKey="site"
                    name="Moyenne AniList"
                    domain={[0, 10]}
                    ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                    tick={{ fill: "rgba(232, 238, 244, 0.78)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(139, 160, 178, 0.22)" }}
                    tickLine={false}
                    label={{
                      value: "Note moyenne AniList (/10)",
                      position: "insideBottom",
                      offset: -16,
                      fill: "rgba(139, 160, 178, 0.85)",
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="yDraw"
                    name="Ta note"
                    domain={[0, 10]}
                    ticks={[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]}
                    tick={{ fill: "rgba(232, 238, 244, 0.78)", fontSize: 11 }}
                    axisLine={{ stroke: "rgba(139, 160, 178, 0.22)" }}
                    tickLine={false}
                    label={{
                      value: "Ta note (/10)",
                      angle: -90,
                      position: "insideLeft",
                      offset: 12,
                      fill: "rgba(139, 160, 178, 0.85)",
                      fontSize: 11,
                    }}
                  />
                  <ZAxis range={[60, 60]} />
                  <Tooltip
                    cursor={{ stroke: "rgba(61, 180, 242, 0.25)", strokeDasharray: "3 4" }}
                    content={<ScatterTooltip kind={kind} />}
                  />
                  {/* Diagonale y = x : sert de référence visuelle. */}
                  <ReferenceLine
                    ifOverflow="extendDomain"
                    segment={[
                      { x: 0, y: 0 },
                      { x: 10, y: 10 },
                    ]}
                    stroke="rgba(139, 160, 178, 0.55)"
                    strokeDasharray="4 5"
                    strokeWidth={1}
                  />
                  {/* Points : un seul Scatter, couleurs portées par <Cell>. */}
                  <Scatter data={points} fillOpacity={0.78} isAnimationActive={false}>
                    {points.map((p, i) => (
                      <Cell key={i} fill={p.fill} stroke={p.fill} strokeOpacity={0.6} />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            </RechartsWhenVisible>
            <div className="score-scatter__legend" aria-hidden>
              <span className="score-scatter__legend-item">
                <span className="score-scatter__dot" style={{ background: COLOR_OVER }} />
                Tu sur-notes&nbsp;({counts.over})
              </span>
              <span className="score-scatter__legend-item">
                <span className="score-scatter__dot" style={{ background: COLOR_NEUTRAL }} />
                Note alignée&nbsp;({counts.neutral})
              </span>
              <span className="score-scatter__legend-item">
                <span className="score-scatter__dot" style={{ background: COLOR_UNDER }} />
                Tu sous-notes&nbsp;({counts.under})
              </span>
              <span className="score-scatter__legend-sep" aria-hidden>
                ·
              </span>
              <span className="score-scatter__legend-item">
                <span className="score-scatter__legend-line" />
                Diagonale y = x (note alignée)
              </span>
            </div>
            {stats ? (
              <p className="score-scatter__footnote">
                Sur {stats.n} {kind === "manga" ? "manga notés" : "anime notés"} avec une moyenne AniList connue, tu
                notes en moyenne{" "}
                <strong style={{ color: colorForDelta(stats.meanDelta) }}>
                  {stats.meanDelta >= 0 ? "+" : "\u2212"}
                  {Math.abs(stats.meanDelta).toFixed(2)}
                </strong>{" "}
                par rapport à la moyenne du site
                {stats.sigma != null ? (
                  <>
                    , avec une dispersion typique de{" "}
                    <strong>±{stats.sigma.toFixed(2)}</strong> point (écart-type)
                  </>
                ) : null}
                . La diagonale en pointillés représente la note parfaitement alignée (ta note = la moyenne AniList) ; un
                seuil de ±0,5 sépare les notes alignées des écarts marqués.
              </p>
            ) : null}
          </div>
        )}
      </ChartCard>
      </div>
      </div>
    </div>
  );
}
