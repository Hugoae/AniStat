import type { ReactNode } from "react";

export type SectionTitleProps = {
  children: ReactNode;
  /** Niveau sémantique HTML (h2 par défaut). */
  as?: "h2" | "h3";
  /**
   * Taille visuelle.
   * - `"lg"` (14px) → titre de **section** (bloc de haut niveau dans l'onglet).
   * - `"md"` (13px) → titre de **chart-block** (sous-bloc, graphique unique).
   * Défaut : `"md"`.
   */
  size?: "lg" | "md";
  id?: string;
  /**
   * Élément(s) affichés à droite du titre sur la même ligne (bouton collapse,
   * StatLabelHint, mode toggle, etc.). Si présent, on enveloppe le titre dans
   * un wrapper flex `.chart-card__title-row`.
   */
  aside?: ReactNode;
  /**
   * Si `true`, applique `chart-card__title-row--with-hint` — le titre devient
   * `flex: 1 1 auto; min-width: 0;` pour que le hint reste collé à droite.
   */
  withHint?: boolean;
  /** Classe supplémentaire sur le heading. */
  className?: string;
  /** Classe supplémentaire sur le wrapper flex (si `aside` présent). */
  rowClassName?: string;
};

/**
 * Titre de section unifié.
 *
 * Remplace les `<h2 className="overview-block-title">` et `<h2 className="chart-card__title">`
 * disséminés dans le code pour garantir :
 *  - un markup cohérent (même wrapper `.chart-card__title-row` pour les asides),
 *  - un niveau sémantique contrôlé (h2/h3),
 *  - une API unique pour associer un id (aria-labelledby), un toggle, un hint.
 *
 * Les deux tailles (`"lg"`/`"md"`) sont volontairement conservées : elles
 * expriment la hiérarchie (section principale vs sous-bloc). Le style reste
 * géré par les classes CSS `.overview-block-title` et `.chart-card__title`
 * préservées pour compatibilité avec les règles contextuelles existantes.
 */
export function SectionTitle({
  children,
  as = "h2",
  size = "md",
  id,
  aside,
  withHint = false,
  className,
  rowClassName,
}: SectionTitleProps) {
  const Heading = as;
  const headingClass = [
    size === "lg" ? "overview-block-title" : "chart-card__title",
    className || "",
  ]
    .filter(Boolean)
    .join(" ");

  const heading = (
    <Heading id={id} className={headingClass}>
      {children}
    </Heading>
  );

  if (!aside) return heading;

  const rowClass = [
    "chart-card__title-row",
    withHint ? "chart-card__title-row--with-hint" : "",
    rowClassName || "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rowClass}>
      {heading}
      {aside}
    </div>
  );
}
