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
  periodProgress = 0,
}: {
  entry: MediaCardEntry;
  type: string;
  /** N’affiche la jaquette qu’à l’approche du viewport (grilles longues). */
  deferCover?: boolean;
  periodProgress?: number;
}) {
  /*
   * Tous les hooks doivent être appelés de manière inconditionnelle avant
   * tout early-return : React se base sur l'ordre d'appel stable des hooks
   * pour rattacher leur état entre les renders. On reporte donc le
   * `return null` après les hooks, en gérant le cas `m === undefined`
   * localement dans l'effet.
   */
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

  const m = entry.media;
  if (!m) return null;
  const title = m.title?.english || m.title?.romaji || "";
  const originMeta = mediaCountryOriginMeta(m?.countryOfOrigin);
  const listUrl = anilistMediaUrl(m, type);
  const progressCur = entry.progress || 0;
  const progressTotal =
    type === "ANIME" ? (m.episodes || "?") : (m.chapters || "?");
  const prog =
    type === "ANIME"
      ? `${progressCur} / ${progressTotal} épisodes`
      : `${progressCur} / ${progressTotal} chapitres`;
  const periodProgressRounded = Math.max(0, Math.trunc(Number(periodProgress) || 0));
  const periodProgressLabel =
    type === "ANIME"
      ? `+${periodProgressRounded} épisode${periodProgressRounded > 1 ? "s" : ""}`
      : `+${periodProgressRounded} chapitre${periodProgressRounded > 1 ? "s" : ""}`;
  const scoreLabel = formatMediaListScore(entry.score);
  const formatLabel = mediaFormatShortLabel(m.format);

  const cardInner = (
    <div className="media-card">
      <div ref={coverWrapRef} className="media-card-cover">
        {coverVisible ? (
          <img
            src={m.coverImage?.large || m.coverImage?.medium || undefined}
            alt={title}
            loading="lazy"
            decoding="async"
            className="media-card-cover__img"
          />
        ) : (
          <div className="media-card-cover__placeholder" aria-hidden />
        )}
        <div className="media-card-pills-top">
          <div
            className="media-card-pill media-card-pill--status"
            style={{ background: STATUS_COLORS[entry.status || ""] || C.accent }}
          >
            {STATUS_LABELS[entry.status || ""] || entry.status}
          </div>
          {originMeta ? (
            <div
              title={originMeta.label}
              aria-label={`Pays d'origine : ${originMeta.label}`}
              className="media-card-pill media-card-pill--origin"
            >
              <MediaOriginFlagSvg code={originMeta.code} width={20} height={14} />
            </div>
          ) : null}
        </div>
        {(formatLabel || scoreLabel) ? (
          <div className="media-card-pills-bottom">
            {formatLabel ? (
              <div
                className="media-card-pill media-card-pill--format"
                title={formatLabel}
              >
                {formatLabel}
              </div>
            ) : null}
            {scoreLabel ? (
              <div className="media-card-pill media-card-pill--score">★ {scoreLabel}</div>
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="media-card-body">
        <div className="media-card-title">{title}</div>
        {periodProgressRounded > 0 ? (
          <div className="media-card-period-progress">{periodProgressLabel}</div>
        ) : null}
        <div className="media-card-progress">{prog}</div>
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
