import type { ReactNode } from "react";
import { useHorizontalScrollFades } from "../../hooks/useHorizontalScrollFades";
import { useCollapsedChart } from "../../hooks/useCollapsedChart";
import { ChartCollapseToggle } from "./ChartCollapseToggle";
import { CarouselNavButtons } from "./CarouselNavButtons";
import { SectionTitle } from "./SectionTitle";

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
      <SectionTitle
        size="lg"
        id={titleId}
        rowClassName="list-tab-records-section__title-row"
        aside={
          collapseId ? (
            <ChartCollapseToggle
              collapsed={collapsed}
              onToggle={collapseState.toggle}
              chartTitle={title}
              controlsId={bodyId}
            />
          ) : null
        }
      >
        {title}
      </SectionTitle>
      <div
        className={`collapsible-chart-animator${collapsed ? " collapsible-chart-animator--collapsed" : ""}`}
        aria-hidden={collapsed}
      >
        <div id={collapseId ? bodyId : undefined} className="collapsible-chart-animator__inner">
          {cards.length > 0 ? (
            <div className={wrapClasses}>
              <div ref={scrollRef} className="list-tab-records-carousel stagger-reveal" role="list">
                {cards}
              </div>
              <CarouselNavButtons
                scrollRef={scrollRef}
                canScrollLeft={fades.left}
                canScrollRight={fades.right}
                ariaLabelBase={title}
              />
            </div>
          ) : (
            <div className="list-tab-records-empty">{emptyMessage}</div>
          )}
        </div>
      </div>
    </section>
  );
}
