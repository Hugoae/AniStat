import type { CSSProperties } from "react";
import { C, MONTHS, MONTHS_FULL } from "../../config/constants";

type TooltipPayloadEntry = {
  dataKey?: string | number;
  name?: string;
  value?: unknown;
  color?: string;
};

export function CTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip chart-tooltip--basic">
      <div className="chart-tooltip__label">{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.accent }}>{String(p.name ?? "")}: {String(p.value ?? "")}</div>
      ))}
    </div>
  );
}

export function PeriodCompareLegend({
  legendCurrent,
  legendCompare,
  className,
  style,
}: {
  legendCurrent: string;
  legendCompare: string;
  className?: string;
  style?: CSSProperties;
}) {
  const cls = ["period-compare-legend", className].filter(Boolean).join(" ");
  return (
    <div className={cls} style={style}>
      <span className="period-compare-legend__item">
        <span className="period-compare-legend__swatch period-compare-legend__swatch--current" />
        <span className="period-compare-legend__label period-compare-legend__label--current">{legendCurrent}</span>
      </span>
      <span className="period-compare-legend__item">
        <span className="period-compare-legend__swatch period-compare-legend__swatch--compare" />
        <span className="period-compare-legend__label period-compare-legend__label--compare">{legendCompare}</span>
      </span>
    </div>
  );
}

export function CompareLineTooltip({
  active,
  payload,
  label,
  year,
  month,
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  label?: string;
  year: number;
  month: number;
}) {
  if (!active || !payload?.length) return null;
  const cur = payload.find((p) => p.dataKey === "current");
  const cmp = payload.find((p) => p.dataKey === "compare");
  const title = (() => {
    if (month === 0) {
      const idx = (MONTHS as readonly string[]).indexOf(label || "");
      if (idx >= 0) return `${MONTHS_FULL[idx]} ${year}`;
      return String(label);
    }
    const day = parseInt(String(label), 10);
    if (!Number.isNaN(day) && month > 0) return `${day} ${MONTHS_FULL[month - 1]} ${year}`;
    return String(label);
  })();
  return (
    <div className="chart-tooltip chart-tooltip--compare">
      <div className="chart-tooltip__title">{title}</div>
      <div className="chart-tooltip__compare-row">
        <span className="chart-tooltip__compare-current">{String(cur?.value ?? 0)}</span>
        <span className="chart-tooltip__compare-compare">{String(cmp?.value ?? 0)}</span>
      </div>
    </div>
  );
}
