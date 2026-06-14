import type { ReactNode } from "react";
import { StatIcon } from "./StatPrimitives";

export type EmptyStateProps = {
  /** Nom d'icône StatIcon (ex. "star", "calendar", "book"…). Sans valeur, pas d'icône. */
  icon?: string;
  /** Message principal (court, clair). Obligatoire. */
  title: string;
  /** Texte secondaire optionnel pour nuancer ou expliquer. */
  description?: string;
  /** Call-to-action affiché sous le texte (bouton, lien…). */
  cta?: ReactNode;
  /**
   * Variante compacte (hauteur et padding réduits) pour les zones étroites
   * (encarts de liste, cases vides dans un carrousel…). Par défaut, la taille
   * standard remplit un emplacement de graphique (≈ 220 px min).
   */
  compact?: boolean;
  /** Classe supplémentaire. */
  className?: string;
};

/**
 * Empty state unifié avec illustration légère : icône stylisée dans un cercle
 * discret, titre, description optionnelle et CTA. Remplace les `<div>` ad-hoc
 * disséminés dans l'application pour que tous les « aucune donnée » aient
 * la même présence visuelle.
 */
export function EmptyState({ icon, title, description, cta, compact, className }: EmptyStateProps) {
  const classes = [
    "empty-state",
    compact ? "empty-state--compact" : "",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} role="status">
      {icon ? (
        <div className="empty-state__icon" aria-hidden>
          <StatIcon name={icon} />
        </div>
      ) : null}
      <div className="empty-state__text">
        <p className="empty-state__title">{title}</p>
        {description ? <p className="empty-state__description">{description}</p> : null}
      </div>
      {cta ? <div className="empty-state__cta">{cta}</div> : null}
    </div>
  );
}
