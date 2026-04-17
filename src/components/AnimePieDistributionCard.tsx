import type { ReactNode } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartCard } from "./appUi/ChartCard";
import { MediaOriginFlagSvg } from "./AppUi";
import { C } from "../config/constants";

export type AnimePieSlice = {
  key: string;
  label: string;
  value: number;
  fill: string;
  flagCode?: string;
  extraInfo?: string;
};

type AnimePieDistributionCardProps = {
  title: string;
  screenReaderSummary?: string;
  slices: AnimePieSlice[];
  emptyLabel?: string;
  /** Bouton ou lien sous le message vide (ex. CTA « toute l’année »). */
  emptyExtra?: ReactNode;
  footnote?: string;
};

function pieTooltipContent({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload?: AnimePieSlice & { percent?: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div
      style={{
        background: C.cardBg,
        border: `1px solid ${C.border}`,
        borderRadius: "var(--radius-control)",
        padding: "10px 14px",
        fontSize: 13,
        boxShadow: "var(--shadow-tooltip)",
      }}
    >
      <div style={{ color: C.text, fontWeight: 600 }}>{p.label}</div>
      <div style={{ color: C.textMuted, marginTop: 4 }}>
        {p.label}
        {p.extraInfo ? (
          <>
            {"\u00A0"}
            <span style={{ padding: "0 0.2em", opacity: 0.92 }}>·</span>
            {"\u00A0"}
            {p.extraInfo}
          </>
        ) : null}
      </div>
      <div style={{ color: C.textMuted, marginTop: 2 }}>
        {p.value} titre{p.value > 1 ? "s" : ""}
        {typeof p.percent === "number" ? ` · ${p.percent}%` : ""}
      </div>
    </div>
  );
}

export function AnimePieDistributionCard({
  title,
  screenReaderSummary,
  slices,
  emptyLabel = "Aucune donnée pour cette période.",
  emptyExtra,
  footnote,
}: AnimePieDistributionCardProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const withPct = slices.map((sl) => ({
    ...sl,
    percent: total > 0 ? Math.round((sl.value / total) * 100) : 0,
  }));

  return (
    <div className="list-tab-anime-chart-block">
      <div className="chart-card__title-row list-tab-anime-chart-block__title-row">
        <h2 className="chart-card__title">{title}</h2>
      </div>
      <ChartCard noTitle screenReaderSummary={screenReaderSummary} className="list-tab-pie-card">
      {withPct.length === 0 || total === 0 ? (
        <div
          className={`list-tab-anime-charts__empty${emptyExtra ? " list-tab-anime-charts__empty--with-cta" : ""}`}
        >
          <span style={{ color: C.textMuted }}>{emptyLabel}</span>
          {emptyExtra}
        </div>
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
                    innerRadius={0}
                    paddingAngle={0}
                    stroke="none"
                    strokeWidth={0}
                  >
                    {withPct.map((s) => (
                      <Cell key={s.key} fill={s.fill} />
                    ))}
                  </Pie>
                  <Tooltip content={pieTooltipContent} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <ul className="list-tab-pie-card__legend">
              {withPct.map((row) => (
                <li key={row.key} className="list-tab-pie-legend-row">
                  <div className="list-tab-pie-legend-row__bar" style={{ background: row.fill }}>
                    <span className="list-tab-pie-legend-row__label">
                      <span className="list-tab-pie-legend-row__label-text">
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
                      {row.flagCode ? (
                        <span className="list-tab-pie-legend-row__flag" aria-hidden>
                          <MediaOriginFlagSvg code={row.flagCode} width={16} height={11} />
                        </span>
                      ) : null}
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
  );
}
