import type { ReactNode } from "react";
import { useHorizontalScrollFades } from "../../hooks/useHorizontalScrollFades";
import { useCollapsedChart } from "../../hooks/useCollapsedChart";
import { ChartCollapseToggle } from "./ChartCollapseToggle";

export type RecordsCarouselSectionProps = {
  sectionId: string;
  titleId: string;
  title: string;
  cards: ReactNode[];
  emptyMessage?: string;
  /** Identifiant stable pour mémoriser l'état « masqué ». Si absent, pas de bouton de collapse. */
  collapseId?: string;
};

export function RecordsCarouselSection({
  sectionId,
  titleId,
  title,
  cards,
  emptyMessage = "Aucun fait marquant à signaler pour cette période.",
  collapseId,
}: RecordsCarouselSectionProps) {
  const collapseState = useCollapsedChart(collapseId || "");
  const collapsed = collapseId ? collapseState.collapsed : false;

  const { scrollRef, fades } = useHorizontalScrollFades(!collapsed, [cards.length, collapsed]);

  const wrapClasses = [
    "list-tab-records-carousel-wrap",
    fades.left ? "list-tab-records-carousel-wrap--fade-start" : "",
    fades.right ? "list-tab-records-carousel-wrap--fade-end" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const bodyId = `${sectionId}-body`;

  return (
    <section
      id={sectionId}
      className="fade-in list-tab-records-section list-tab-anchor"
      aria-labelledby={titleId}
    >
      <div className="list-tab-records-section__title-row">
        <h2 id={titleId} className="overview-block-title">
          {title}
        </h2>
        {collapseId ? (
          <ChartCollapseToggle
            collapsed={collapsed}
            onToggle={collapseState.toggle}
            chartTitle={title}
            controlsId={bodyId}
          />
        ) : null}
      </div>
      {collapsed ? null : (
        <div id={collapseId ? bodyId : undefined}>
          {cards.length > 0 ? (
            <div className={wrapClasses}>
              <div ref={scrollRef} className="list-tab-records-carousel" role="list">
                {cards}
              </div>
            </div>
          ) : (
            <div className="list-tab-records-empty">{emptyMessage}</div>
          )}
        </div>
      )}
    </section>
  );
}
