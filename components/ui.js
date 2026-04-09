(() => {
  const { C, STATUS_COLORS, STATUS_LABELS, MONTHS, MONTHS_FULL } = window.AppConfig;

  /** MediaFormat AniList → libellé court pour capsule sur la jaquette */
  const MEDIA_FORMAT_LABELS = {
    TV: "TV",
    TV_SHORT: "TV Short",
    MOVIE: "Movie",
    SPECIAL: "Special",
    OVA: "OVA",
    ONA: "ONA",
    MUSIC: "Music",
    MANGA: "Manga",
    NOVEL: "Light novel",
    ONE_SHOT: "One shot",
  };

  function mediaFormatShortLabel(formatRaw) {
    if (formatRaw == null || formatRaw === "") return null;
    const key = String(formatRaw).toUpperCase().trim();
    if (!key) return null;
    if (MEDIA_FORMAT_LABELS[key]) return MEDIA_FORMAT_LABELS[key];
    return key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
  }

  let regionNamesFr = null;
  function countryCodeLabelFr(iso2) {
    const code = String(iso2 || "").toUpperCase().trim();
    if (!/^[A-Z]{2}$/.test(code)) return code || "";
    try {
      if (!regionNamesFr && typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
        regionNamesFr = new Intl.DisplayNames(["fr"], { type: "region" });
      }
      const name = regionNamesFr?.of(code);
      return name || code;
    } catch {
      return code;
    }
  }

  function mediaCountryOriginMeta(countryCode) {
    const upper = String(countryCode || "").toUpperCase().trim();
    if (!/^[A-Z]{2}$/.test(upper)) return null;
    return { code: upper, label: countryCodeLabelFr(upper) };
  }

  function anilistMediaUrl(media, type) {
    const u = media?.siteUrl;
    if (u && typeof u === "string" && /^https?:\/\//i.test(u)) return u;
    const id = media?.id;
    if (!id) return null;
    return type === "ANIME" ? `https://anilist.co/anime/${id}/` : `https://anilist.co/manga/${id}/`;
  }

  /** Note liste (POINT_10_DECIMAL) : une décimale si besoin, entier sinon. */
  function formatMediaListScore(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return "";
    const r = Math.round(n * 10) / 10;
    if (r % 1 === 0) return String(Math.trunc(r));
    return r.toFixed(1);
  }

  /** Étoile à 5 branches : une pointe vers `pointAngleRad` (0 = une pointe vers le haut). */
  function pentagramPath(cx, cy, outerR, pointAngleRad) {
    const inner = outerR * 0.38196601125;
    let d = "";
    for (let i = 0; i < 5; i++) {
      const aOut = pointAngleRad - Math.PI / 2 + (i * 2 * Math.PI) / 5;
      const aIn = aOut + Math.PI / 5;
      const ox = cx + outerR * Math.cos(aOut);
      const oy = cy + outerR * Math.sin(aOut);
      const ix = cx + inner * Math.cos(aIn);
      const iy = cy + inner * Math.sin(aIn);
      d += i === 0 ? `M${ox},${oy}` : `L${ox},${oy}`;
      d += `L${ix},${iy}`;
    }
    return `${d}Z`;
  }

  /** Angle pour qu’une pointe de l’étoile pointe vers (tx, ty) depuis (cx, cy). */
  function starPointAngleToward(cx, cy, tx, ty) {
    return Math.atan2(ty - cy, tx - cx) + Math.PI / 2;
  }

  /** Drapeaux SVG locaux (lisibles partout, hors-ligne). Autres ISO2 : pastille code. */
  function MediaOriginFlagSvg({ code, width = 20, height = 14 }) {
    const w = width;
    const h = height;
    const upper = String(code || "").toUpperCase();
    switch (upper) {
      case "JP":
        return (
          <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
            <rect width="20" height="14" fill="#fff" />
            <circle cx="10" cy="7" r="4.2" fill="#bc002d" />
          </svg>
        );
      case "KR": {
        /* Taegeukgi : rouge au nord, bleu au sud (rotation -90° du tracé yin-yang classique qui sinon remplit est/ouest). */
        return (
          <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
            <rect width="20" height="14" fill="#fff" />
            <g transform="translate(10,7) rotate(-90)">
              <path
                fill="#cd2e3a"
                d="M0,-3 a3,3 0,0,1,0,6 a1.5,1.5 0,0,1,0,-3 a1.5,1.5 0,0,0,0,-3"
              />
              <path
                fill="#0047a0"
                d="M0,3 a3,3 0,0,1,0,-6 a1.5,1.5 0,0,1,0,3 a1.5,1.5 0,0,0,0,3"
              />
            </g>
            <g stroke="#111" strokeWidth="0.38" strokeLinecap="round">
              {/* Geon ☰ — haut gauche : trois traits pleins */}
              <line x1="1.25" y1="1.35" x2="4.05" y2="1.35" />
              <line x1="1.25" y1="2.2" x2="4.05" y2="2.2" />
              <line x1="1.25" y1="3.05" x2="4.05" y2="3.05" />
              {/* Gam ☵ — haut droit : milieu plein, haut et bas brisés */}
              <line x1="15.95" y1="1.35" x2="16.85" y2="1.35" />
              <line x1="17.15" y1="1.35" x2="18.75" y2="1.35" />
              <line x1="15.95" y1="2.2" x2="18.75" y2="2.2" />
              <line x1="15.95" y1="3.05" x2="16.85" y2="3.05" />
              <line x1="17.15" y1="3.05" x2="18.75" y2="3.05" />
              {/* Ri ☲ — bas gauche : milieu brisé, haut et bas pleins */}
              <line x1="1.25" y1="10.95" x2="4.05" y2="10.95" />
              <line x1="1.25" y1="11.8" x2="2.05" y2="11.8" />
              <line x1="3.25" y1="11.8" x2="4.05" y2="11.8" />
              <line x1="1.25" y1="12.65" x2="4.05" y2="12.65" />
              {/* Gon ☷ — bas droit : trois traits brisés */}
              <line x1="15.95" y1="10.95" x2="16.85" y2="10.95" />
              <line x1="17.15" y1="10.95" x2="18.75" y2="10.95" />
              <line x1="15.95" y1="11.8" x2="16.85" y2="11.8" />
              <line x1="17.15" y1="11.8" x2="18.75" y2="11.8" />
              <line x1="15.95" y1="12.65" x2="16.85" y2="12.65" />
              <line x1="17.15" y1="12.65" x2="18.75" y2="12.65" />
            </g>
          </svg>
        );
      }
      case "CN": {
        const bx = 3.85;
        const by = 3.05;
        const br = 1.12;
        const sr = 0.38;
        const sm = [
          { x: 7.65, y: 1.65 },
          { x: 9.15, y: 3.15 },
          { x: 9.15, y: 4.85 },
          { x: 7.65, y: 6.2 },
        ];
        return (
          <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
            <rect width="20" height="14" fill="#de2910" />
            <path fill="#ffde00" d={pentagramPath(bx, by, br, 0)} />
            <path fill="#ffde00" d={pentagramPath(sm[0].x, sm[0].y, sr, starPointAngleToward(sm[0].x, sm[0].y, bx, by))} />
            <path fill="#ffde00" d={pentagramPath(sm[1].x, sm[1].y, sr, starPointAngleToward(sm[1].x, sm[1].y, bx, by))} />
            <path fill="#ffde00" d={pentagramPath(sm[2].x, sm[2].y, sr, starPointAngleToward(sm[2].x, sm[2].y, bx, by))} />
            <path fill="#ffde00" d={pentagramPath(sm[3].x, sm[3].y, sr, starPointAngleToward(sm[3].x, sm[3].y, bx, by))} />
          </svg>
        );
      }
      case "TW": {
        const tcx = 5;
        const tcy = 3.5;
        const rDisk = 1.12;
        const rRayIn = 1.38;
        const rRayOut = 2.76;
        let rayD = "";
        for (let k = 0; k < 12; k++) {
          const t = -Math.PI / 2 + (k * Math.PI) / 6;
          const t1 = t - Math.PI / 12;
          const t2 = t + Math.PI / 12;
          const x1i = tcx + rRayIn * Math.cos(t1);
          const y1i = tcy + rRayIn * Math.sin(t1);
          const x1o = tcx + rRayOut * Math.cos(t1);
          const y1o = tcy + rRayOut * Math.sin(t1);
          const x2o = tcx + rRayOut * Math.cos(t2);
          const y2o = tcy + rRayOut * Math.sin(t2);
          const x2i = tcx + rRayIn * Math.cos(t2);
          const y2i = tcy + rRayIn * Math.sin(t2);
          rayD += `M${x1i},${y1i}L${x1o},${y1o}L${x2o},${y2o}L${x2i},${y2i}Z`;
        }
        return (
          <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
            <rect width="20" height="14" fill="#fe0000" />
            <rect width="10" height="7" x="0" y="0" fill="#000095" />
            <path fill="#fff" d={rayD} />
            <circle cx={tcx} cy={tcy} r={rDisk} fill="#fff" />
          </svg>
        );
      }
      default:
        return (
          <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
            <rect width="20" height="14" rx="3" fill="#1f2d3d" />
            <text
              x="10"
              y="9.5"
              textAnchor="middle"
              fill="#8ba0b2"
              fontSize="5.5"
              fontWeight="800"
              fontFamily="system-ui, 'Segoe UI', sans-serif"
            >
              {upper}
            </text>
          </svg>
        );
    }
  }

  function StatIcon({ name }) {
    const s = { width: 20, height: 20, display: "block" };
    switch (name) {
      case "play":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
            <path d="M8 5v14l11-7L8 5z" />
          </svg>
        );
      case "tv":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="2" y="7" width="20" height="13" rx="2" />
            <path d="M17 2l-5 5-5-5" />
          </svg>
        );
      case "percent":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
            <path d="M19 5L5 19M9 9h.01M15 15h.01" />
          </svg>
        );
      case "star":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
            <path d="M12 2.5l2.6 5.3 5.8.8-4.2 4.1 1 5.7L12 15.8 6.8 18.4l1-5.7-4.2-4.1 5.8-.8L12 2.5z" />
          </svg>
        );
      case "book":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M4 19.5A2.5 2.5 0 016.5 17H20" />
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" />
          </svg>
        );
      case "calendar":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <path d="M16 2v4M8 2v4M3 10h18" />
          </svg>
        );
      case "check":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M20 6L9 17l-5-5" />
          </svg>
        );
      case "clock":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <circle cx="12" cy="12" r="9" />
            <path d="M12 7v5l3 2" />
          </svg>
        );
      case "stack":
        return (
          <svg viewBox="0 0 24 24" style={s} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2L2 7l10 5 10-5-10-5z" />
            <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
          </svg>
        );
      case "dot":
      default:
        return (
          <svg viewBox="0 0 24 24" style={s} fill="currentColor" aria-hidden>
            <circle cx="12" cy="12" r="3" />
          </svg>
        );
    }
  }

  /** label + value + icon (style proche profil AniList). La prop sub est ignorée (rétrocompat). */
  function StatCard({ label, value, icon = "dot", sub }) {
    return (
      <div className="stat-stat-al">
        <div className="stat-stat-al__bubble">
          <StatIcon name={icon} />
        </div>
        <div className="stat-stat-al__text">
          <div className="stat-stat-al__value" style={{ color: C.accent }}>{value}</div>
          <div className="stat-stat-al__label">{label}</div>
        </div>
      </div>
    );
  }

  function ChartCard({ title, children, style, noTitle, className }) {
    const showInnerTitle = !noTitle && title;
    const base = `chart-card${noTitle ? " chart-card--no-heading" : ""}`;
    const cls = className ? `${base} ${className}` : base;
    return (
      <div className={cls} style={style}>
        {showInnerTitle ? (
          <div style={{ fontSize: 13, fontWeight: 600, color: C.textMuted, marginBottom: 16, textTransform: "uppercase", letterSpacing: 0.8 }}>{title}</div>
        ) : null}
        {children}
      </div>
    );
  }

  function MediaCard({ entry, type }) {
    const m = entry.media;
    const title = m.title.english || m.title.romaji;
    const originMeta = mediaCountryOriginMeta(m?.countryOfOrigin);
    const listUrl = anilistMediaUrl(m, type);
    const progressCur = entry.progress || 0;
    const progressTotal =
      type === "ANIME" ? (m.episodes || "?") : (m.chapters || "?");
    const prog =
      type === "ANIME"
        ? `${progressCur} / ${progressTotal} épisodes`
        : `${progressCur} / ${progressTotal} chapitres`;
    const scoreLabel = formatMediaListScore(entry.score);
    const formatLabel = mediaFormatShortLabel(m.format);
    const pillSm = {
      fontSize: 10,
      fontWeight: 700,
      padding: "3px 8px",
      borderRadius: "var(--radius-chip)",
      letterSpacing: 0.5,
    };

    const cardInner = (
      <div className="media-card">
        <div style={{ position: "relative", width: "100%", height: 210, overflow: "hidden" }}>
          <img
            src={m.coverImage?.large || m.coverImage?.medium}
            alt={title}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
          <div
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              right: 8,
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              zIndex: 1,
            }}
          >
            <div
              style={{
                flexShrink: 0,
                background: STATUS_COLORS[entry.status] || C.accent,
                color: "#fff",
                fontSize: 10,
                fontWeight: 700,
                padding: "3px 8px",
                borderRadius: "var(--radius-chip)",
                textTransform: "uppercase",
                letterSpacing: 0.5,
                textShadow: "0 1px 2px rgba(0,0,0,0.88), 0 0 10px rgba(0,0,0,0.35)",
              }}
            >
              {STATUS_LABELS[entry.status] || entry.status}
            </div>
            {originMeta ? (
              <div
                title={originMeta.label}
                aria-label={`Pays d'origine : ${originMeta.label}`}
                style={{
                  flexShrink: 0,
                  padding: "2px 3px",
                  borderRadius: "var(--radius-chip)",
                  background: "rgba(11, 22, 34, 0.88)",
                  border: "1px solid rgba(139, 160, 178, 0.4)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  boxShadow: "0 2px 8px rgba(0,0,0,0.28)",
                  lineHeight: 0,
                  filter: "drop-shadow(0 1px 2px rgba(0,0,0,0.5))",
                }}
              >
                <MediaOriginFlagSvg code={originMeta.code} width={20} height={14} />
              </div>
            ) : null}
          </div>
          {(formatLabel || scoreLabel) ? (
            <div
              style={{
                position: "absolute",
                bottom: 8,
                right: 8,
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 6,
                maxWidth: "calc(100% - 16px)",
              }}
            >
              {formatLabel ? (
                <div
                  style={{
                    ...pillSm,
                    background: "rgba(11, 22, 34, 0.88)",
                    border: "1px solid rgba(139, 160, 178, 0.42)",
                    color: "#d8e4ef",
                    textTransform: "uppercase",
                  }}
                  title={formatLabel}
                >
                  {formatLabel}
                </div>
              ) : null}
              {scoreLabel ? (
                <div style={{
                  background: "rgba(0,0,0,0.75)", backdropFilter: "blur(4px)",
                  color: C.yellow, fontSize: 13, fontWeight: 700,
                  padding: "3px 8px", borderRadius: "var(--radius-chip)",
                }}>★ {scoreLabel}</div>
              ) : null}
            </div>
          ) : null}
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

    if (listUrl) {
      return (
        <a
          href={listUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="media-card-link"
          aria-label={`${title} sur AniList`}
        >
          {cardInner}
        </a>
      );
    }
    return cardInner;
  }

  function CTooltip({ active, payload, label }) {
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

  function PeriodCompareLegend({ legendCurrent, legendCompare, className, style }) {
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
      <div style={{ background: C.cardBg, border: `1px solid ${C.border}`, borderRadius: "var(--radius-card)", padding: "12px 14px", boxShadow: "var(--shadow-tooltip)" }}>
        <div style={{ color: C.text, fontWeight: 700, marginBottom: 10, fontSize: 14 }}>{title}</div>
        <div style={{ display: "flex", alignItems: "baseline", gap: 14 }}>
          <span style={{ color: C.accent, fontSize: 17, fontWeight: 800, lineHeight: 1 }}>{cur?.value ?? 0}</span>
          <span style={{ color: "rgba(74, 93, 110, 0.78)", fontSize: 14, fontWeight: 600 }}>{cmp?.value ?? 0}</span>
        </div>
      </div>
    );
  }

  window.AppUi = { StatCard, ChartCard, MediaCard, CTooltip, PeriodCompareLegend, CompareLineTooltip };
})();
