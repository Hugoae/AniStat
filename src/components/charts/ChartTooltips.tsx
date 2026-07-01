import { C, MONTHS, MONTHS_FULL } from "../../config/constants";

type TooltipPayloadEntry = {
  dataKey?: string | number;
  name?: string;
  value?: unknown;
  color?: string;
  payload?: unknown;
};

type GenreTooltipRow = {
  name?: string;
  count?: number;
  percent?: number;
  previousCount?: number;
  previousPercent?: number;
  deltaCount?: number;
  deltaPercent?: number;
};

function formatPercent(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0%";
  return `${n.toFixed(1)}%`;
}

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
    if (year === 0) return String(label);
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
        {year !== 0 ? (
          <span className="chart-tooltip__compare-compare">{String(cmp?.value ?? 0)}</span>
        ) : null}
      </div>
    </div>
  );
}

export function GenreRadarTooltip({
  active,
  payload,
  compareLabel,
  countLabel = "Titres",
}: {
  active?: boolean;
  payload?: TooltipPayloadEntry[];
  compareLabel?: string;
  countLabel?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload as GenreTooltipRow | undefined;
  if (!row) return null;

  return (
    <div className="chart-tooltip chart-tooltip--basic">
      <div className="chart-tooltip__label">{row.name}</div>
      <div style={{ color: C.accent }}>
        Cette période : {row.count || 0} {countLabel.toLowerCase()}, {formatPercent(row.percent)}
      </div>
      {compareLabel ? (
        <div style={{ color: C.purple }}>
          {compareLabel} : {row.previousCount || 0} {countLabel.toLowerCase()},{" "}
          {formatPercent(row.previousPercent)}
        </div>
      ) : null}
    </div>
  );
}
