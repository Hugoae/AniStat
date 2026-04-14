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
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "var(--radius-control)", padding: "10px 14px", fontSize: 13, boxShadow: "var(--shadow-tooltip)" }}>
      <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      {payload.map((p, i) => (
        <div key={i} style={{ color: p.color || C.accent }}>{p.name}: {p.value}</div>
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
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 20, height: 3, background: C.accent, borderRadius: 1 }} />
        <span style={{ color: C.text }}>{legendCurrent}</span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
        <span style={{ width: 20, height: 3, background: "rgba(74, 93, 110, 0.42)", borderRadius: 1 }} />
        <span style={{ color: C.textDim }}>{legendCompare}</span>
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
      const idx = MONTHS.indexOf(label || "");
      if (idx >= 0) return `${MONTHS_FULL[idx]} ${year}`;
      return String(label);
    }
    const day = parseInt(String(label), 10);
    if (!Number.isNaN(day) && month > 0) return `${day} ${MONTHS_FULL[month - 1]} ${year}`;
    return String(label);
  })();
  return (
    <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "var(--radius-card)", padding: "12px 14px", boxShadow: "var(--shadow-tooltip)" }}>
      <div style={{ color: C.text, fontWeight: 700, marginBottom: 10, fontSize: 14 }}>{title}</div>
      <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
        <span style={{ color: C.accent, fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{cur?.value ?? 0}</span>
        <span style={{ color: "rgba(74, 93, 110, 0.78)", fontSize: 14, fontWeight: 600 }}>{cmp?.value ?? 0}</span>
      </div>
    </div>
  );
}
