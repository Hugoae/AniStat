import { useId, type ReactNode } from "react";
import { ChartCollapseToggle } from "./ChartCollapseToggle";
import { SectionTitle } from "./SectionTitle";
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
  // Le `titleRowClassName` par défaut inclut `chart-card__title-row` — on le
  // retire pour ne pas le doubler avec celui injecté par `SectionTitle`.
  const extraRowClass = titleRowClassName.replace(/(^|\s)chart-card__title-row(\s|$)/, " ").trim();

  return (
    <div className={blockClassName}>
      <SectionTitle
        withHint={withHint}
        rowClassName={extraRowClass || undefined}
        aside={
          <>
            <ChartCollapseToggle
              collapsed={collapsed}
              onToggle={toggle}
              chartTitle={title}
              controlsId={bodyId}
            />
            {titleAside}
          </>
        }
      >
        {title}
      </SectionTitle>
      <div
        className={`collapsible-chart-animator${collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
        aria-hidden={collapsed}
        {...(collapsed ? ({ inert: "" } as Record<string, string>) : {})}
      >
        <div id={bodyId} className="collapsible-chart-animator__inner">
          {children}
        </div>
      </div>
    </div>
  );
}
