import type { ReactNode } from "react";
import { StatIcon, StatLabelHint } from "./StatPrimitives";
import { C } from "../../config/constants";

export type RecordCardMedia = {
  title: string;
  coverImageUrl?: string | null;
  coverColor?: string | null;
  anilistUrl?: string | null;
  meta?: ReactNode;
};

export type RecordCardProps = {
  label: string;
  value: ReactNode;
  /** Petit texte sous la valeur (ex. date, contexte). */
  sub?: ReactNode;
  /** Référence à un média (titre cliquable + miniature de cover). */
  media?: RecordCardMedia;
  icon?: string;
  labelHint?: string;
  /** Classe CSS additionnelle. */
  className?: string;
};

export function RecordCard({ label, value, sub, media, icon = "trophy", labelHint, className }: RecordCardProps) {
  /*
   * Titre du média : lien cliquable si `anilistUrl` est fourni, sinon simple
   * span. Calculé en valeur (pas en composant interne) pour éviter que React
   * recrée un nouveau type de composant à chaque render — ce qui invaliderait
   * l'état interne et les refs à chaque update.
   */
  const titleNode: ReactNode = media?.anilistUrl ? (
    <a
      href={media.anilistUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="record-card__media-title record-card__media-title--link"
    >
      {media.title}
    </a>
  ) : (
    <span className="record-card__media-title">{media?.title}</span>
  );

  return (
    <article className={`record-card${className ? ` ${className}` : ""}`}>
      <div className="record-card__top">
        <div className="record-card__bubble">
          <StatIcon name={icon} />
        </div>
        <div className="record-card__heading">
          <div className="record-card__value" style={{ color: C.accent }}>
            {value}
          </div>
          <div className={`record-card__label${labelHint ? " record-card__label--with-hint" : ""}`}>
            <span className="record-card__label-text">{label}</span>
            {labelHint ? <StatLabelHint text={labelHint} /> : null}
          </div>
        </div>
      </div>

      {media ? (
        <div className="record-card__media">
          <div
            className="record-card__thumb-wrap"
            style={media.coverColor ? { background: media.coverColor } : undefined}
          >
            {media.coverImageUrl ? (
              <img
                src={media.coverImageUrl}
                alt=""
                className="record-card__thumb"
                loading="lazy"
                decoding="async"
              />
            ) : null}
          </div>
          <div className="record-card__media-text">
            {titleNode}
            {media.meta ? <div className="record-card__media-meta">{media.meta}</div> : null}
          </div>
        </div>
      ) : sub ? (
        <div className="record-card__sub">{sub}</div>
      ) : null}
    </article>
  );
}
