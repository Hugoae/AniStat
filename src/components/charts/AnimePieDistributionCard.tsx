import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartCard } from "./ChartCard";
import { EmptyState, MediaOriginFlagSvg, SectionTitle } from "../ui";
import { ChartCollapseToggle } from "./ChartCollapseToggle";
import { useCollapsedChart } from "../../hooks/useCollapsedChart";
export type AnimePieSlice = {
  key: string;
  label: string;
  value: number;
  fill: string;
  flagCode?: string;
  extraInfo?: string;
};

export type AnimePieMode = {
  key: string;
  /** Libellé affiché dans le toggle (ex. "Titres", "Épisodes", "Chapitres"). */
  label: string;
  /** Libellé singulier/pluriel pour le tooltip (ex. "titre", "épisode vu"). */
  unitSingular?: string;
  unitPlural?: string;
  slices: AnimePieSlice[];
  footnote?: string;
  emptyLabel?: string;
};

type PieSliceWithPercent = AnimePieSlice & { percent: number };

type AnimePieDistributionCardProps = {
  title: string;
  screenReaderSummary?: string;
  modes: AnimePieMode[];
  defaultModeKey?: string;
  /** Bouton ou lien sous le message vide (ex. CTA « toute l’année »). */
  emptyExtra?: ReactNode;
  /** Identifiant stable utilisé pour mémoriser l'état « masqué ». Si absent, pas de bouton de collapse. */
  collapseId?: string;
};

function pieTooltipContent(unitSingular: string, unitPlural: string) {
  return function PieTooltip({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload?: PieSliceWithPercent }>;
  }) {
    if (!active || !payload?.length) return null;
    const p = payload[0]?.payload;
    if (!p) return null;
    const noun = p.value > 1 ? unitPlural : unitSingular;
    return (
      <div className="chart-tooltip chart-tooltip--pie">
        <div className="chart-tooltip__pie-label">{p.label}</div>
        {p.extraInfo ? <div className="chart-tooltip__pie-meta">{p.extraInfo}</div> : null}
        <div className="chart-tooltip__pie-extra">
          {p.value} {noun}
          {` · ${p.percent}%`}
        </div>
      </div>
    );
  };
}

function formatDonutTotal(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(value);
}

export function AnimePieDistributionCard({
  title,
  screenReaderSummary,
  modes,
  defaultModeKey,
  emptyExtra,
  collapseId,
}: AnimePieDistributionCardProps) {
  const collapseState = useCollapsedChart(collapseId || "");
  const collapsed = collapseId ? collapseState.collapsed : false;
  const initialKey =
    defaultModeKey && modes.some((m) => m.key === defaultModeKey)
      ? defaultModeKey
      : (modes[0]?.key ?? "");
  const [activeKey, setActiveKey] = useState<string>(initialKey);
  const [focusedSliceKey, setFocusedSliceKey] = useState<string | null>(null);

  /** Si la liste des modes change (ex. nouvelle période sans données), garde un mode valide. */
  useEffect(() => {
    if (modes.length > 0 && !modes.some((m) => m.key === activeKey)) {
      setActiveKey(modes[0].key);
    }
  }, [activeKey, modes]);

  const activeMode = modes.find((m) => m.key === activeKey) ?? modes[0];
  const slices = activeMode?.slices ?? [];
  const footnote = activeMode?.footnote;
  const emptyLabel = activeMode?.emptyLabel ?? "Aucune donnée pour cette période.";
  const unitSingular = activeMode?.unitSingular ?? "titre";
  const unitPlural = activeMode?.unitPlural ?? `${unitSingular}s`;
  const safeModes = modes;

  const total = slices.reduce((s, x) => s + x.value, 0);
  const withPct: PieSliceWithPercent[] = slices.map((sl) => ({
    ...sl,
    percent: total > 0 ? Math.round((sl.value / total) * 100) : 0,
  }));

  const groupId = useId();
  const TooltipContent = useMemo(() => pieTooltipContent(unitSingular, unitPlural), [unitSingular, unitPlural]);
  const bodyId = `${groupId}-body`;

  return (
    <div className="list-tab-anime-chart-block">
      <SectionTitle
        rowClassName="list-tab-anime-chart-block__title-row list-tab-pie-card__title-row"
        aside={
          <>
            {collapseId ? (
              <ChartCollapseToggle
                collapsed={collapsed}
                onToggle={collapseState.toggle}
                chartTitle={title}
                controlsId={bodyId}
              />
            ) : null}
            {safeModes.length > 1 ? (
              <div
                className="list-tab-pie-card__mode-toggle"
                role="radiogroup"
                aria-label={`Métrique du graphique « ${title} »`}
              >
                {safeModes.map((m) => {
                  const isActive = m.key === activeMode?.key;
                  return (
                    <button
                      key={m.key}
                      type="button"
                      role="radio"
                      aria-checked={isActive}
                      className={`list-tab-pie-card__mode-toggle-btn${isActive ? " is-active" : ""}`}
                      onClick={() => setActiveKey(m.key)}
                      id={`${groupId}-${m.key}`}
                    >
                      {m.label}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </>
        }
      >
        {title}
      </SectionTitle>
      <div
        className={`collapsible-chart-animator${collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
        aria-hidden={collapsed}
      >
      <div id={collapseId ? bodyId : undefined} className="collapsible-chart-animator__inner">
      <ChartCard
        noTitle
        screenReaderSummary={screenReaderSummary}
        className="list-tab-pie-card"
        dataTable={{
          caption: screenReaderSummary || title,
          columns: ["Catégorie", activeMode?.label ?? "Valeur", "Pourcentage", "Détail"],
          rows: withPct.map((row) => [
            row.label,
            row.value,
            `${row.percent}%`,
            row.extraInfo ?? "",
          ]),
        }}
      >
        {withPct.length === 0 || total === 0 ? (
          <EmptyState icon="stack" title={emptyLabel} cta={emptyExtra} />
        ) : (
          <>
            <div className="list-tab-pie-card__body">
              <div className="list-tab-pie-card__chart" aria-hidden>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={withPct}
                      dataKey="value"
                      nameKey="label"
                      cx="50%"
                      cy="50%"
                      outerRadius={76}
                      innerRadius={46}
                      paddingAngle={2}
                      cornerRadius={5}
                      stroke="var(--surface-bg)"
                      strokeWidth={3}
                      isAnimationActive={false}
                    >
                      {withPct.map((s) => (
                        <Cell
                          key={s.key}
                          fill={s.fill}
                          opacity={focusedSliceKey && focusedSliceKey !== s.key ? 0.36 : 1}
                          onMouseEnter={() => setFocusedSliceKey(s.key)}
                          onMouseLeave={() => setFocusedSliceKey(null)}
                        />
                      ))}
                    </Pie>
                    <Tooltip
                      content={TooltipContent}
                      wrapperStyle={{
                        zIndex: 1000,
                        pointerEvents: "none",
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
                <div className="list-tab-pie-card__center-label" aria-hidden>
                  <span className="list-tab-pie-card__center-value">{formatDonutTotal(total)}</span>
                  <span className="list-tab-pie-card__center-unit">{activeMode?.label ?? "Total"}</span>
                </div>
              </div>
              <ul className="list-tab-pie-card__legend">
                {withPct.map((row) => (
                  <li
                    key={row.key}
                    className={`list-tab-pie-legend-row${focusedSliceKey && focusedSliceKey !== row.key ? " is-dimmed" : ""}${focusedSliceKey === row.key ? " is-focused" : ""}`}
                    onMouseEnter={() => setFocusedSliceKey(row.key)}
                    onMouseLeave={() => setFocusedSliceKey(null)}
                    onFocus={() => setFocusedSliceKey(row.key)}
                    onBlur={() => setFocusedSliceKey(null)}
                  >
                    <div className="list-tab-pie-legend-row__bar" style={{ background: row.fill }}>
                      <span className="list-tab-pie-legend-row__label">
                        <span className="list-tab-pie-legend-row__label-text">
                          {row.flagCode ? (
                            <span className="list-tab-pie-legend-row__flag" aria-hidden>
                              <MediaOriginFlagSvg code={row.flagCode} width={16} height={11} />
                            </span>
                          ) : null}
                          <span className="list-tab-pie-legend-row__name">{row.label}</span>
                          {row.extraInfo ? (
                            <>
                              <span className="list-tab-pie-legend-row__sep" aria-hidden>
                                ·
                              </span>
                              <span className="list-tab-pie-legend-row__meta">{row.extraInfo}</span>
                            </>
                          ) : null}
                        </span>
                      </span>
                      <span className="list-tab-pie-legend-row__pct">{row.percent}%</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
            {footnote ? <p className="list-tab-pie-card__footnote">{footnote}</p> : null}
          </>
        )}
      </ChartCard>
      </div>
      </div>
    </div>
  );
}
