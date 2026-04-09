(() => {
  const { C, STATUS_COLORS, STATUS_LABELS, MONTHS, MONTHS_FULL } = window.AppConfig;

  function StatCard({ label, value, sub }) {
    return (
      <div className="stat-card">
        <div style={{ fontSize: 11, color: C.textMuted, textTransform: "uppercase", letterSpacing: 1.2, fontWeight: 600 }}>
          {label}
        </div>
        <div style={{ fontSize: 28, fontWeight: 700, color: C.text, lineHeight: 1.2 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: C.textDim, marginTop: 2 }}>{sub}</div>}
      </div>
    );
  }

  function ChartCard({ title, children, style }) {
    return (
      <div className="chart-card" style={style}>
        <div style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.8 }}>{title}</div>
        {children}
      </div>
    );
  }

  function MediaCard({ entry, type }) {
    const m = entry.media;
    const title = m.title.english || m.title.romaji;
    const prog = type === "ANIME"
      ? `${entry.progress || 0}/${m.episodes || "?"} ep`
      : `${entry.progress || 0}/${m.chapters || "?"} ch`;
    return (
      <div className="media-card">
        <div style={{ position: "relative", width: "100%", height: 210, overflow: "hidden" }}>
          <img src={m.coverImage?.large || m.coverImage?.medium} alt={title}
            style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{
            position: "absolute", top: 8, left: 8,
            background: STATUS_COLORS[entry.status] || C.accent,
            color: "#fff", fontSize: 10, fontWeight: 700,
            padding: "3px 8px", borderRadius: 4,
            textTransform: "uppercase", letterSpacing: 0.5
          }}>{STATUS_LABELS[entry.status] || entry.status}</div>
          {entry.score > 0 && (
            <div style={{
              position: "absolute", bottom: 8, right: 8,
              background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
              color: C.yellow, fontSize: 13, fontWeight: 700,
              padding: "3px 8px", borderRadius: 4
            }}>★ {entry.score}</div>
          )}
        </div>
        <div style={{ padding: "10px 10px 12px" }}>
          <div style={{
            fontSize: 13, fontWeight: 600, color: C.text,
            overflow: "hidden", textOverflow: "ellipsis",
            display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical",
            lineHeight: 1.3, minHeight: 34
          }}>{title}</div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 6 }}>{prog}</div>
        </div>
      </div>
    );
  }

  function CTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
        <div style={{ color: C.text, fontWeight: 600, marginBottom: 4 }}>{label}</div>
        {payload.map((p, i) => (
          <div key={i} style={{ color: p.color || C.accent }}>{p.name}: {p.value}</div>
        ))}
      </div>
    );
  }

  function PeriodCompareLegend({ legendCurrent, legendCompare }) {
    return (
      <div style={{ display: "flex", flexWrap: "wrap", gap: 20, marginBottom: 12, alignItems: "center", fontSize: 13, fontWeight: 600 }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 20, height: 3, background: C.accent, borderRadius: 1 }} />
          <span style={{ color: C.text }}>{legendCurrent}</span>
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 20, height: 3, background: "#4a5d6e", borderRadius: 1 }} />
          <span style={{ color: C.textDim }}>{legendCompare}</span>
        </span>
      </div>
    );
  }

  function CompareLineTooltip({ active, payload, label, year, month }) {
    if (!active || !payload?.length) return null;
    const cur = payload.find((p) => p.dataKey === "current");
    const cmp = payload.find((p) => p.dataKey === "compare");
    const title = (() => {
      if (month === 0) {
        const idx = MONTHS.indexOf(label);
        if (idx >= 0) return `${MONTHS_FULL[idx]} ${year}`;
        return String(label);
      }
      const day = parseInt(label, 10);
      if (!Number.isNaN(day) && month > 0) return `${day} ${MONTHS_FULL[month - 1]} ${year}`;
      return String(label);
    })();
    return (
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: 10, padding: "12px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.35)" }}>
        <div style={{ color: C.text, fontWeight: 700, marginBottom: 10, fontSize: 14 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ color: C.accent, fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{cur?.value ?? 0}</span>
          <span style={{ color: "#4a5d6e", fontSize: 14, fontWeight: 600 }}>{cmp?.value ?? 0}</span>
        </div>
      </div>
    );
  }

  window.AppUi = { StatCard, ChartCard, MediaCard, CTooltip, PeriodCompareLegend, CompareLineTooltip };
})();
