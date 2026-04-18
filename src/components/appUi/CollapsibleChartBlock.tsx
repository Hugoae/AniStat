import { useId, type ReactNode } from "react";
import { ChartCollapseToggle } from "./ChartCollapseToggle";
import { useCollapsedChart } from "../../hooks/useCollapsedChart";

export type CollapsibleChartBlockProps = {
  /** Identifiant stable utilisé pour mémoriser l'état « masqué » dans localStorage. */
  id: string;
  title: string;
  /** Élément(s) optionnels affichés dans la ligne de titre, à droite du titre (ex. StatLabelHint). */
  titleAside?: ReactNode;
  /** Classe CSS du conteneur racine. Par défaut, équivalent d'un chart-block standard. */
  blockClassName?: string;
  /** Classes CSS de la ligne de titre. La classe `chart-card__title-row--with-hint` est ajoutée automatiquement si `withHint` est `true`. */
  titleRowClassName?: string;
  /** Si `true`, ajoute `chart-card__title-row--with-hint` (titre = `flex: 1 1 auto`). */
  withHint?: boolean;
  children: ReactNode;
};

/**
 * Bloc « graphique » avec titre cliquable pour masquer / afficher le contenu.
 * Encapsule le bouton chevron, la persistance, et le rendu conditionnel.
 */
export function CollapsibleChartBlock({
  id,
  title,
  titleAside,
  blockClassName = "list-tab-anime-chart-block",
  titleRowClassName = "chart-card__title-row list-tab-anime-chart-block__title-row",
  withHint = false,
  children,
}: CollapsibleChartBlockProps) {
  const { collapsed, toggle } = useCollapsedChart(id);
  const reactId = useId();
  const bodyId = `${reactId}-body`;
  const finalTitleRowClass = `${titleRowClassName}${withHint ? " chart-card__title-row--with-hint" : ""}`;

  return (
    <div className={blockClassName}>
      <div className={finalTitleRowClass}>
        <h2 className="chart-card__title">{title}</h2>
        <ChartCollapseToggle
          collapsed={collapsed}
          onToggle={toggle}
          chartTitle={title}
          controlsId={bodyId}
        />
        {titleAside}
      </div>
      {collapsed ? null : <div id={bodyId}>{children}</div>}
    </div>
  );
}
