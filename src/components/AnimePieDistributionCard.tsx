import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { ChartCard } from "./appUi/ChartCard";
import { C } from "../config/constants";

export type AnimePieSlice = {
  key: string;
  label: string;
  value: number;
  fill: string;
};

type AnimePieDistributionCardProps = {
  title: string;
  screenReaderSummary?: string;
  slices: AnimePieSlice[];
  emptyLabel?: string;
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
}: AnimePieDistributionCardProps) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const withPct = slices.map((sl) => ({
    ...sl,
    percent: total > 0 ? Math.round((sl.value / total) * 100) : 0,
  }));

  return (
    <ChartCard title={title} screenReaderSummary={screenReaderSummary} className="list-tab-pie-card">
      {withPct.length === 0 || total === 0 ? (
        <div className="list-tab-anime-charts__empty">{emptyLabel}</div>
      ) : (
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
                  paddingAngle={1.2}
                  stroke="rgba(11, 22, 34, 0.92)"
                  strokeWidth={1}
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
                  <span className="list-tab-pie-legend-row__label">{row.label}</span>
                  <span className="list-tab-pie-legend-row__pct">{row.percent}%</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </ChartCard>
  );
}
