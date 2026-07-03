import type { CSSProperties } from "react";
import { LIST_TAB_ANIME_GRID_GAP } from "../../config/listConstants";
import { type AnimeGridSortKey } from "../../lib/animeGridQuery";
import type { useListTabMediaGrid } from "../../hooks/useListTabMediaGrid";
import { MediaCard } from "./MediaCard";
import { EmptyState } from "./EmptyState";
import { useT } from "../../i18n/I18n";

type ListTabMediaGridProps = {
  /** État + données dérivées renvoyés par `useListTabMediaGrid`. */
  grid: ReturnType<typeof useListTabMediaGrid>;
  /** Préfixe d'identifiants DOM/ARIA propre à l'onglet ("anime" | "manga"). */
  idPrefix: string;
  mediaType: "ANIME" | "MANGA";
  /** Nombre d'entrées « normales » (pour la condition d'état vide). */
  entriesLength: number;
  /** Nombre d'entrées planifiées (pour la condition d'état vide). */
  planningLength: number;
  isAllTime: boolean;
  /** Progression sur la période, par id de média (badge des cartes). */
  periodProgressByMedia: Map<number, number>;
};

/**
 * Barre d'outils (recherche, filtres de statut, tri) + grille de cartes média
 * + boutons « voir plus / moins » des onglets liste. Strictement identique côté
 * anime et manga (seuls les identifiants et le type de média varient), d'où sa
 * factorisation. L'état est piloté par `useListTabMediaGrid`.
 */
export function ListTabMediaGrid({
  grid,
  idPrefix,
  mediaType,
  entriesLength,
  planningLength,
  isAllTime,
  periodProgressByMedia,
}: ListTabMediaGridProps) {
  const t = useT();
  const {
    mediaGridRef,
    searchQuery,
    setSearchQuery,
    sortKey,
    setSortKey,
    filterScoredOnly,
    setFilterScoredOnly,
    filterCompletedOnly,
    setFilterCompletedOnly,
    filterCurrentOnly,
    setFilterCurrentOnly,
    filterDroppedOnly,
    setFilterDroppedOnly,
    filterPlanningOnly,
    setFilterPlanningOnly,
    planningVisible,
    setPlanningVisible,
    listExpanded,
    setListExpanded,
    gridColumns,
    gridSorted,
    listNeedsMoreLess,
    canRevealPlanning,
    listToShow,
    resetFilters,
  } = grid;

  return (
    <div id={`${idPrefix}-liste`} className="list-tab-anime-list list-tab-anchor">
      <div className="list-tab-anime-grid-toolbar" role="search">
        <div className="list-tab-anime-grid-toolbar__inner">
          <div className="list-tab-anime-grid-toolbar__search-block">
            <span className="list-tab-anime-grid-toolbar__eyebrow" id={`${idPrefix}-grid-search-label`}>
              {t("Recherche", "Search")}
            </span>
            <div className="list-tab-anime-grid-toolbar__search-shell">
              <input
                type="search"
                id={`${idPrefix}-grid-search`}
                name={`${idPrefix}-grid-search`}
                className="list-tab-anime-grid-toolbar__input"
                value={searchQuery}
                onChange={(ev) => setSearchQuery(ev.target.value)}
                placeholder={t("Romaji ou anglais…", "Romaji or English…")}
                autoComplete="off"
                spellCheck={false}
                aria-labelledby={`${idPrefix}-grid-search-label`}
              />
            </div>
          </div>
          <div className="list-tab-anime-grid-toolbar__filter-group">
            <span className="list-tab-anime-grid-toolbar__eyebrow">{t("Filtres", "Filters")}</span>
            <div className="list-tab-anime-grid-toolbar__toggles" role="group" aria-label={t("Filtres liste", "List filters")}>
              <button
                type="button"
                className={`list-tab-anime-grid-toolbar__toggle${filterScoredOnly ? " is-active" : ""}`}
                aria-pressed={filterScoredOnly}
                title={t("Afficher uniquement les titres avec une note", "Show only titles with a score")}
                onClick={() => setFilterScoredOnly((v) => !v)}
              >
                {t("Notés", "Scored")}
                {filterScoredOnly ? (
                  <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
              <button
                type="button"
                className={`list-tab-anime-grid-toolbar__toggle${filterCompletedOnly ? " is-active" : ""}`}
                aria-pressed={filterCompletedOnly}
                title={t("Afficher uniquement les titres au statut terminé", "Show only completed titles")}
                onClick={() => setFilterCompletedOnly((v) => !v)}
              >
                {t("Terminés", "Completed")}
                {filterCompletedOnly ? (
                  <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                    ✓
                  </span>
                ) : null}
              </button>
              {isAllTime ? (
                <>
                  <button
                    type="button"
                    className={`list-tab-anime-grid-toolbar__toggle${filterCurrentOnly ? " is-active" : ""}`}
                    aria-pressed={filterCurrentOnly}
                    title={t("Afficher uniquement les titres en cours", "Show only in-progress titles")}
                    onClick={() => setFilterCurrentOnly((v) => !v)}
                  >
                    {t("En cours", "In progress")}
                    {filterCurrentOnly ? (
                      <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`list-tab-anime-grid-toolbar__toggle${filterDroppedOnly ? " is-active" : ""}`}
                    aria-pressed={filterDroppedOnly}
                    title={t("Afficher uniquement les titres abandonnés", "Show only dropped titles")}
                    onClick={() => setFilterDroppedOnly((v) => !v)}
                  >
                    {t("Abandonnés", "Dropped")}
                    {filterDroppedOnly ? (
                      <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                  <button
                    type="button"
                    className={`list-tab-anime-grid-toolbar__toggle${filterPlanningOnly ? " is-active" : ""}`}
                    aria-pressed={filterPlanningOnly}
                    title={t("Afficher uniquement les titres planifiés", "Show only planned titles")}
                    onClick={() => {
                      setPlanningVisible(false);
                      setFilterPlanningOnly((v) => !v);
                    }}
                  >
                    {t("Planifiés", "Planned")}
                    {filterPlanningOnly ? (
                      <span className="list-tab-anime-grid-toolbar__toggle-check" aria-hidden>
                        ✓
                      </span>
                    ) : null}
                  </button>
                </>
              ) : null}
            </div>
          </div>
          <div className="list-tab-anime-grid-toolbar__sort">
            <span className="list-tab-anime-grid-toolbar__eyebrow" id={`${idPrefix}-grid-sort-label`}>
              {t("Trier par", "Sort by")}
            </span>
            <div className="list-tab-anime-grid-toolbar__select-shell">
              <select
                id={`${idPrefix}-grid-sort`}
                name={`${idPrefix}-grid-sort`}
                className="list-tab-anime-grid-toolbar__select"
                value={sortKey}
                onChange={(ev) => setSortKey(ev.target.value as AnimeGridSortKey)}
                aria-labelledby={`${idPrefix}-grid-sort-label`}
              >
                <option value="score-desc">{t("Vos notes ▼", "Your scores ▼")}</option>
                <option value="score-asc">{t("Vos notes ▲", "Your scores ▲")}</option>
                <option value="title-desc">{t("Titre ▼", "Title ▼")}</option>
                <option value="title-asc">{t("Titre ▲", "Title ▲")}</option>
                <option value="release-desc">{t("Sortie ▼", "Release ▼")}</option>
                <option value="release-asc">{t("Sortie ▲", "Release ▲")}</option>
                <option value="progress-desc">{t("Progression ▼", "Progress ▼")}</option>
                <option value="progress-asc">{t("Progression ▲", "Progress ▲")}</option>
              </select>
            </div>
          </div>
        </div>
      </div>
      {(entriesLength > 0 || planningLength > 0) && gridSorted.length === 0 ? (
        <EmptyState
          compact
          icon="flag"
          title={t("Aucun titre ne correspond aux filtres.", "No title matches the filters.")}
          cta={
            <button type="button" className="list-tab-empty-cta" onClick={resetFilters}>
              {t("Réinitialiser filtres", "Reset filters")}
            </button>
          }
        />
      ) : null}
      <div
        ref={mediaGridRef}
        className="list-tab-media-grid stagger-reveal"
        style={
          {
            "--anime-grid-cols": gridColumns,
            "--anime-grid-gap": `${LIST_TAB_ANIME_GRID_GAP}px`,
          } as CSSProperties
        }
      >
        {listToShow.map((e) => (
          <MediaCard
            key={e.id}
            entry={e}
            type={mediaType}
            deferCover
            periodProgress={periodProgressByMedia.get(e.media?.id || 0) || 0}
          />
        ))}
      </div>
      {(listNeedsMoreLess && !listExpanded) || canRevealPlanning ? (
        <button
          type="button"
          className="list-tab-anime-more-btn"
          onClick={() => {
            if (listNeedsMoreLess && !listExpanded) setListExpanded(true);
            else setPlanningVisible(true);
          }}
          aria-expanded={canRevealPlanning ? planningVisible : false}
        >
          <span>{canRevealPlanning ? t("Voir œuvres planifiées", "Show planned works") : t("Voir plus", "Show more")}</span>
          <svg
            className="list-tab-anime-more-btn__icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" />
          </svg>
        </button>
      ) : null}
      {((listNeedsMoreLess && listExpanded && !canRevealPlanning) || planningVisible) ? (
        <button
          type="button"
          className="list-tab-anime-more-btn list-tab-anime-more-btn--collapse"
          onClick={() => {
            setPlanningVisible(false);
            setListExpanded(false);
          }}
          aria-expanded={true}
        >
          <span>{t("Voir moins", "Show less")}</span>
          <svg
            className="list-tab-anime-more-btn__icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <path d="M18 15l-6-6-6 6" />
          </svg>
        </button>
      ) : null}
    </div>
  );
}
