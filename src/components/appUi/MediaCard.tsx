import { useEffect, useRef, useState } from "react";
import { C, STATUS_COLORS, STATUS_LABELS } from "../../config/constants";
import {
  anilistMediaUrl,
  formatMediaListScore,
  mediaCountryOriginMeta,
  mediaFormatShortLabel,
} from "./mediaDisplayHelpers";
import { MediaOriginFlagSvg } from "./MediaOriginFlagSvg";

/** Shape used by MediaCard (GraphQL list entry + media fields). */
type MediaCardEntry = {
  status?: string;
  score?: number;
  progress?: number;
  media?: {
    id?: number;
    title?: { english?: string | null; romaji?: string | null };
    countryOfOrigin?: string | null;
    format?: string | null;
    siteUrl?: string | null;
    episodes?: number | null;
    chapters?: number | null;
    coverImage?: { large?: string | null; medium?: string | null };
  };
};

export function MediaCard({
  entry,
  type,
  deferCover = false,
}: {
  entry: MediaCardEntry;
  type: string;
  /** N’affiche la jaquette qu’à l’approche du viewport (grilles longues). */
  deferCover?: boolean;
}) {
  const m = entry.media;
  if (!m) return null;
  const title = m.title?.english || m.title?.romaji || "";
  const coverWrapRef = useRef<HTMLDivElement | null>(null);
  const [coverVisible, setCoverVisible] = useState(!deferCover);
  useEffect(() => {
    if (!deferCover || coverVisible) return;
    const el = coverWrapRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (ents) => {
        if (ents.some((e) => e.isIntersecting)) setCoverVisible(true);
      },
      { root: null, rootMargin: "140px 0px", threshold: 0.01 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [deferCover, coverVisible]);
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
      <div
        ref={coverWrapRef}
        style={{ position: "relative", width: "100%", height: 210, overflow: "hidden" }}
      >
        {coverVisible ? (
          <img
            src={m.coverImage?.large || m.coverImage?.medium || undefined}
            alt={title}
            loading="lazy"
            decoding="async"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            className="media-card-cover-placeholder"
            aria-hidden
            style={{
              width: "100%",
              height: "100%",
              background:
                "linear-gradient(140deg, rgba(30, 44, 62, 0.55) 0%, rgba(15, 22, 34, 0.85) 100%)",
            }}
          />
        )}
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
              background: STATUS_COLORS[entry.status || ""] || C.accent,
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
            {STATUS_LABELS[entry.status || ""] || entry.status}
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
