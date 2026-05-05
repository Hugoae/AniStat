import {
  ResponsiveContainer,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Area,
  Line,
  LabelList,
  type TooltipProps,
} from "recharts";
import { C } from "../config/constants";
import { CompareLineTooltip } from "./AppUi";

/** Type générique du payload passé par Recharts à un `content` de `Tooltip`. */
type RechartsTooltipProps = TooltipProps<
  number | string | Array<number | string>,
  number | string
>;

type OverviewCompareSelectOption = { value: string; label: string };

function OverviewChartLegend({
  legendCurrent,
  compareValue,
  compareOptions,
  onCompareChange,
  compareEmptyLabel,
}: {
  legendCurrent: string;
  compareValue: string;
  compareOptions: OverviewCompareSelectOption[];
  onCompareChange: (value: string) => void;
  compareEmptyLabel?: string | null;
}) {
  return (
    <div className="overview-chart-legend flex flex-row items-center gap-4">
      <div className="overview-chart-legend__row">
        <span className="period-compare-legend__swatch period-compare-legend__swatch--current" />
        <span className="period-compare-legend__label period-compare-legend__label--current">{legendCurrent}</span>
      </div>
      <div className="overview-chart-legend__row">
        <span className="period-compare-legend__swatch period-compare-legend__swatch--compare" />
        <span className="period-compare-legend__vs">vs</span>
        <label className="overview-chart-legend__select-wrap">
          <span className="visually-hidden">Période de comparaison</span>
          <select
            className="overview-chart-legend__select bg-slate-800 text-slate-200 border border-slate-700/60 outline-none cursor-pointer"
            value={compareValue}
            disabled={compareOptions.length === 0}
            onChange={(e) => onCompareChange(e.target.value)}
          >
            {compareOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        {compareEmptyLabel ? (
          <span className="overview-chart-legend__empty-note">{compareEmptyLabel}</span>
        ) : null}
      </div>
    </div>
  );
}

/**
 * Adapte le payload générique de Recharts vers le shape plus strict attendu
 * par `CompareLineTooltip` (name en string, value brute). Sans cet adaptateur,
 * les types génériques `ValueType | NameType` de Recharts (qui défaillent à
 * `unknown`) ne sont pas compatibles avec notre tooltip.
 */
function renderCompareTooltip(
  props: RechartsTooltipProps,
  year: number,
  month: number
) {
  const payload = (props.payload ?? []).map((p) => ({
    dataKey: p.dataKey as string | number | undefined,
    name: p.name != null ? String(p.name) : undefined,
    value: p.value,
    color: p.color,
  }));
  return (
    <CompareLineTooltip
      active={props.active}
      payload={payload}
      label={typeof props.label === "string" ? props.label : String(props.label ?? "")}
      year={year}
      month={month}
    />
  );
}

export function OverviewActivityLineChart({
  data,
  month,
  year,
  fillGradientId,
  compareLineDimmed,
  legendCurrent,
  compareValue,
  compareOptions,
  onCompareChange,
  compareEmptyLabel,
}: {
  data: unknown[];
  month: number;
  year: number;
  fillGradientId: string;
  /** Réduit l’opacité de la courbe de comparaison (ex. chargement Supabase). */
  compareLineDimmed?: boolean;
  legendCurrent?: string;
  compareValue?: string;
  compareOptions?: OverviewCompareSelectOption[];
  onCompareChange?: (value: string) => void;
  compareEmptyLabel?: string | null;
}) {
  const showCompare = year !== 0;
  const compareStrokeOpacity = compareLineDimmed ? 0.18 : 0.42;
  const legendOptions = compareOptions ?? [];
  return (
    <ResponsiveContainer width="100%" height={240}>
      <LineChart data={data} margin={{ top: 8, right: 34, left: 8, bottom: 6 }}>
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
          tick={{ fill: C.textDim, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          interval={month === 0 ? 0 : "preserveStartEnd"}
          padding={{ left: 12, right: 28 }}
          dy={4}
        />
        <YAxis
          tick={{ fill: C.textDim, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip
          content={(props) => renderCompareTooltip(props, year, month)}
          cursor={{ stroke: "rgba(139, 160, 178, 0.2)", strokeWidth: 1 }}
        />
        {showCompare && legendCurrent && compareValue && onCompareChange ? (
          <Legend
            verticalAlign="top"
            align="left"
            height={66}
            content={() => (
              <OverviewChartLegend
                legendCurrent={legendCurrent}
                compareValue={compareValue}
                compareOptions={legendOptions}
                onCompareChange={onCompareChange}
                compareEmptyLabel={compareEmptyLabel}
              />
            )}
          />
        ) : null}
        <Area type="monotone" dataKey="current" stroke="none" fill={`url(#${fillGradientId})`} isAnimationActive={false} />
        <Line
          type="monotone"
          dataKey="current"
          stroke={C.accent}
          strokeWidth={2.25}
          dot={{
            r: 5,
            fill: "rgba(61, 180, 242, 0.78)",
            stroke: "rgba(11, 22, 34, 0.55)",
            strokeWidth: 1,
          }}
          activeDot={{ r: 7, fill: "rgba(61, 180, 242, 0.95)", stroke: "#0d1621", strokeWidth: 1 }}
          isAnimationActive={false}
        >
          <LabelList
            dataKey="current"
            position="top"
            offset={8}
            fill="#edf1f5"
            fontSize={month === 0 ? 13 : 12}
            fontWeight={600}
            formatter={(v) => (v != null && Number(v) > 0 ? String(v) : "")}
          />
        </Line>
        {showCompare ? (
          <Line
            type="monotone"
            dataKey="compare"
            stroke="#4a5d6e"
            strokeOpacity={compareStrokeOpacity}
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "rgba(74, 93, 110, 0.68)" }}
            isAnimationActive={false}
          />
        ) : null}
      </LineChart>
    </ResponsiveContainer>
  );
}

