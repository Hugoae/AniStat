import { useId, useMemo, useState, type ReactNode } from "react";
import { ChartCard } from "./AppUi";
import { ChartCollapseToggle } from "./appUi/ChartCollapseToggle";
import { StatLabelHint } from "./appUi/StatPrimitives";
import { useCollapsedChart } from "../hooks/useCollapsedChart";
import { C } from "../config/constants";

export type TopTagsRow = {
  name: string;
  count: number;
  meanRank: number;
  category?: string | null;
  isAdult?: boolean;
};

export type TopTagsCardProps = {
  tags: TopTagsRow[];
  kind: "anime" | "manga";
  /** Bouton CTA affiché sous le message vide (ex. "Voir toute l'année"). */
  emptyExtra?: ReactNode;
  /** Identifiant stable pour mémoriser l'état « masqué ». Si absent, pas de bouton de collapse. */
  collapseId?: string;
  /** Nombre de tags affichés par défaut. Au-delà, un bouton « Voir plus » dévoile la suite. */
  initialVisible?: number;
  className?: string;
};

const DEFAULT_INITIAL_VISIBLE = 24;

/** URL de recherche AniList préfiltrée par tag (s'ouvre dans un nouvel onglet). */
function buildAnilistTagSearchUrl(kind: "anime" | "manga", tagName: string): string {
  const segment = kind === "manga" ? "manga" : "anime";
  /** AniList attend le nom du tag tel quel dans `includedTags[]`, encodé URL. */
  return `https://anilist.co/search/${segment}?includedTags[]=${encodeURIComponent(tagName)}`;
}

/** Convertit la fréquence relative d'un tag en intensité visuelle (0..1). */
function intensityForCount(count: number, maxCount: number): number {
  if (maxCount <= 1) return 1;
  const t = (count - 1) / (maxCount - 1);
  return Math.max(0.32, Math.min(1, t));
}

export function TopTagsCard({
  tags,
  kind,
  emptyExtra,
  collapseId,
  initialVisible = DEFAULT_INITIAL_VISIBLE,
  className,
}: TopTagsCardProps) {
  const collapseState = useCollapsedChart(collapseId || "");
  const collapsed = collapseId ? collapseState.collapsed : false;
  const groupId = useId();
  const bodyId = `${groupId}-body`;

  const [expanded, setExpanded] = useState(false);

  const visibleTags = useMemo(
    () => (expanded ? tags : tags.slice(0, initialVisible)),
    [tags, expanded, initialVisible]
  );
  const maxCount = tags[0]?.count ?? 1;
  const remaining = Math.max(0, tags.length - initialVisible);

  const noun = kind === "manga" ? "manga" : "anime";

  const titleHint =
    kind === "manga"
      ? "Tags AniList agrégés sur les manga de la période. Beaucoup plus granulaires que les genres, ils révèlent les motifs récurrents (« Time Loop », « Female Protagonist », « Cooking »…). Le nombre indique combien de manga de la période portent ce tag. Spoilers et tags adultes filtrés par défaut."
      : "Tags AniList agrégés sur les anime de la période. Beaucoup plus granulaires que les genres, ils révèlent les motifs récurrents (« Time Loop », « Female Protagonist », « Anti-Hero »…). Le nombre indique combien d'anime de la période portent ce tag. Spoilers et tags adultes filtrés par défaut.";

  return (
    <div className={`list-tab-anime-chart-block${className ? ` ${className}` : ""}`}>
      <div className="chart-card__title-row list-tab-anime-chart-block__title-row">
        <h2 className="chart-card__title">Top tags</h2>
        {collapseId ? (
          <ChartCollapseToggle
            collapsed={collapsed}
            onToggle={collapseState.toggle}
            chartTitle="Top tags"
            controlsId={bodyId}
          />
        ) : null}
        <StatLabelHint text={titleHint} />
      </div>
      {collapsed ? null : (
        <div id={collapseId ? bodyId : undefined}>
          <ChartCard
            noTitle
            screenReaderSummary={`Top tags AniList sur la période. ${tags.length} tags distincts identifiés sur les ${noun} de cette période.`}
          >
            {tags.length === 0 ? (
              <div
                className={`list-tab-anime-charts__empty${emptyExtra ? " list-tab-anime-charts__empty--with-cta" : ""}`}
              >
                <span style={{ color: C.textMuted }}>
                  Aucun tag AniList disponible pour les {noun} de cette période.
                </span>
                {emptyExtra}
              </div>
            ) : (
              <div className="top-tags">
                <ul className="top-tags__list">
                  {visibleTags.map((tag) => {
                    const intensity = intensityForCount(tag.count, maxCount);
                    const meanRankRounded = Math.round(tag.meanRank);
                    const tooltipParts = [
                      `${tag.count} ${noun}${tag.count > 1 ? "s" : ""} portant ce tag`,
                    ];
                    if (tag.meanRank > 0) {
                      tooltipParts.push(`Force moyenne AniList : ${meanRankRounded}/100`);
                    }
                    if (tag.category) tooltipParts.push(`Catégorie : ${tag.category}`);
                    return (
                      <li key={tag.name} className="top-tags__item">
                        <a
                          href={buildAnilistTagSearchUrl(kind, tag.name)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="top-tags__pill"
                          title={tooltipParts.join("\n")}
                          style={{
                            ["--top-tag-intensity" as string]: intensity.toFixed(3),
                          }}
                        >
                          <span className="top-tags__pill-name">{tag.name}</span>
                          <span className="top-tags__pill-count">{tag.count}</span>
                        </a>
                      </li>
                    );
                  })}
                </ul>
                {remaining > 0 ? (
                  <div className="top-tags__more">
                    <button
                      type="button"
                      className="top-tags__more-btn"
                      onClick={() => setExpanded((v) => !v)}
                      aria-expanded={expanded}
                    >
                      {expanded ? "Voir moins" : `Voir ${remaining} tags de plus`}
                    </button>
                  </div>
                ) : null}
              </div>
            )}
          </ChartCard>
        </div>
      )}
    </div>
  );
}
