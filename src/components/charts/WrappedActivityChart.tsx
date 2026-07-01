import {
  Area,
  CartesianGrid,
  LabelList,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import { C } from "../../config/constants";
import type { WrappedMonthlyChartRow } from "../../lib/wrapped";

type RechartsTooltipProps = TooltipProps<
  number | string | Array<number | string>,
  number | string
>;

function WrappedChartLegend({ currentYear, compareYear }: { currentYear: number; compareYear: number }) {
  return (
    <div className="wrapped-chart-legend">
      <div className="wrapped-chart-legend__row">
        <span className="period-compare-legend__swatch period-compare-legend__swatch--current" />
        <span className="period-compare-legend__label period-compare-legend__label--current">{currentYear}</span>
      </div>
      <div className="wrapped-chart-legend__row">
        <span className="period-compare-legend__swatch period-compare-legend__swatch--compare" />
        <span className="period-compare-legend__vs">vs</span>
        <span className="period-compare-legend__label period-compare-legend__label--compare">{compareYear}</span>
      </div>
    </div>
  );
}

function renderActivityTooltip(
  props: RechartsTooltipProps,
  year: number,
  compareYear: number,
  unitLabel: string
) {
  if (!props.active || !props.payload?.length) return null;
  const row = props.payload[0]?.payload as WrappedMonthlyChartRow | undefined;
  if (!row) return null;

  return (
    <div className="chart-tooltip chart-tooltip--basic wrapped-activity-tooltip">
      <div className="chart-tooltip__label">{String(props.label ?? "")}</div>
      <div style={{ color: C.accent }}>
        {year} : {row.current} {unitLabel}
      </div>
      <div style={{ color: "#8ba0b2" }}>
        {compareYear} : {row.compare} {unitLabel}
      </div>
    </div>
  );
}

export function WrappedMonthlyCompareChart({
  data,
  year,
  compareYear,
  unitLabel,
}: {
  data: WrappedMonthlyChartRow[];
  year: number;
  compareYear: number;
  unitLabel: string;
}) {
  const fillGradientId = "wrapped-activity-area";

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 2, right: 14, left: -4, bottom: 6 }}>
        <defs>
          <linearGradient id={fillGradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={C.accent} stopOpacity={0.5} />
            <stop offset="45%" stopColor={C.accent} stopOpacity={0.2} />
            <stop offset="82%" stopColor={C.accent} stopOpacity={0.06} />
            <stop offset="100%" stopColor={C.accent} stopOpacity={0} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="rgba(139, 160, 178, 0.1)" />
        <XAxis
          dataKey="label"
          tick={{ fill: C.textDim, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          interval={0}
          padding={{ left: 8, right: 16 }}
          dy={5}
        />
        <YAxis
          tick={{ fill: C.textDim, fontSize: 10 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={36}
        />
        <Tooltip
          content={(props) => renderActivityTooltip(props, year, compareYear, unitLabel)}
          cursor={{ stroke: "rgba(139, 160, 178, 0.2)", strokeWidth: 1 }}
        />
        <Legend
          verticalAlign="top"
          align="left"
          height={32}
          content={() => <WrappedChartLegend currentYear={year} compareYear={compareYear} />}
        />
        <Area type="monotone" dataKey="current" stroke="none" fill={`url(#${fillGradientId})`} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="current"
          stroke={C.accent}
          strokeWidth={2.25}
          dot={{
            r: 4,
            fill: "rgba(61, 180, 242, 0.78)",
            stroke: "rgba(11, 22, 34, 0.55)",
            strokeWidth: 1,
          }}
          activeDot={{ r: 5, fill: "rgba(61, 180, 242, 0.95)", stroke: "#0d1621", strokeWidth: 1 }}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="current"
            position="top"
            offset={6}
            fill="#edf1f5"
            fontSize={9}
            fontWeight={600}
            formatter={(v) => (v != null && Number(v) > 0 ? String(v) : "")}
          />
        </Line>
        <Line
          type="monotone"
          dataKey="compare"
          stroke="#4a5d6e"
          strokeOpacity={0.42}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 3, fill: "rgba(74, 93, 110, 0.68)" }}
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
