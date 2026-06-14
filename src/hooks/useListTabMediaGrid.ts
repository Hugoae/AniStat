import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  LIST_TAB_ANIME_CARD_WIDTH,
  LIST_TAB_ANIME_GRID_GAP,
  LIST_TAB_ANIME_VISIBLE_ROWS,
} from "../config/listConstants";
import {
  ANIME_GRID_SORT_DEFAULT,
  type AnimeGridSortKey,
  compareAnimeGridEntries,
  filterAnimeGridEntries,
  normalizeAnimeSearchText,
} from "../lib/animeGridQuery";
import type { AniListEntry } from "../types/domain";

type UseListTabMediaGridParams = {
  /** Entrées « normales » de la période (hors planifiés). */
  entries: AniListEntry[];
  /** Entrées planifiées (affichées en complément, All Time uniquement). */
  planningEntries: AniListEntry[];
  isAllTime: boolean;
  year: number;
  month: number;
  /** Évite de mesurer la grille quand l'onglet est masqué (largeur 0). */
  layoutActive: boolean;
};

/**
 * Pilote la grille média des onglets liste (Anime & Manga) : recherche, tri,
 * filtres de statut, révélation des planifiés, repli « voir plus / moins » et
 * mesure dynamique du nombre de colonnes. La logique est strictement identique
 * des deux côtés (le manga réutilise les comparateurs/filtres anime), d'où sa
 * factorisation ici.
 */
export function useListTabMediaGrid({
  entries,
  planningEntries,
  isAllTime,
  year,
  month,
  layoutActive,
}: UseListTabMediaGridParams) {
  const [listExpanded, setListExpanded] = useState(false);
  const [gridWidth, setGridWidth] = useState(0);
  const mediaGridRef = useRef<HTMLDivElement | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortKey, setSortKey] = useState<AnimeGridSortKey>(ANIME_GRID_SORT_DEFAULT);
  const [filterScoredOnly, setFilterScoredOnly] = useState(false);
  const [filterCompletedOnly, setFilterCompletedOnly] = useState(false);
  const [filterCurrentOnly, setFilterCurrentOnly] = useState(false);
  const [filterDroppedOnly, setFilterDroppedOnly] = useState(false);
  const [filterPlanningOnly, setFilterPlanningOnly] = useState(false);
  const [planningVisible, setPlanningVisible] = useState(false);

  const searchNormalized = useMemo(() => normalizeAnimeSearchText(searchQuery), [searchQuery]);
  const compareByAverageScoreDesc = useCallback((a: AniListEntry, b: AniListEntry) => {
    const avgA = Number(a.media?.averageScore) || 0;
    const avgB = Number(b.media?.averageScore) || 0;
    if (avgB !== avgA) return avgB - avgA;
    return compareAnimeGridEntries(a, b, "title-asc");
  }, []);

  const gridSorted = useMemo(
    () => {
      const normalBase = filterAnimeGridEntries(entries, {
        normalizedSearch: searchNormalized,
        scoredOnly: filterScoredOnly,
        completedOnly: !isAllTime && filterCompletedOnly,
      });
      if (!isAllTime) return [...normalBase].sort((a, b) => compareAnimeGridEntries(a, b, sortKey));
      const planningBase = filterAnimeGridEntries(planningEntries, {
        normalizedSearch: searchNormalized,
        scoredOnly: filterScoredOnly,
        completedOnly: false,
      }).sort(compareByAverageScoreDesc);
      const statusFilters = [
        filterCompletedOnly && "COMPLETED",
        filterCurrentOnly && "CURRENT",
        filterDroppedOnly && "DROPPED",
        filterPlanningOnly && "PLANNING",
      ].filter(Boolean);
      if (statusFilters.length > 0) {
        const selected = [...normalBase, ...planningBase].filter((entry) => statusFilters.includes(String(entry.status)));
        if (statusFilters.length === 1 && statusFilters[0] === "PLANNING") return selected.sort(compareByAverageScoreDesc);
        return selected.sort((a, b) => compareAnimeGridEntries(a, b, sortKey));
      }
      const normalSorted = [...normalBase].sort((a, b) => compareAnimeGridEntries(a, b, sortKey));
      return planningVisible ? [...normalSorted, ...planningBase] : normalSorted;
    },
    [
      entries,
      planningEntries,
      searchNormalized,
      filterScoredOnly,
      filterCompletedOnly,
      filterCurrentOnly,
      filterDroppedOnly,
      filterPlanningOnly,
      planningVisible,
      sortKey,
      compareByAverageScoreDesc,
      isAllTime,
    ]
  );

  const planningFilteredSorted = useMemo(
    () =>
      filterAnimeGridEntries(planningEntries, {
        normalizedSearch: searchNormalized,
        scoredOnly: filterScoredOnly,
        completedOnly: false,
      }).sort(compareByAverageScoreDesc),
    [planningEntries, searchNormalized, filterScoredOnly, compareByAverageScoreDesc]
  );

  /** Colonnes = cartes 155px + gap 14px (aligné sur .list-tab-media-grid). */
  const gridColumns = useMemo(() => {
    const w = gridWidth;
    if (!Number.isFinite(w) || w <= 0) return 1;
    const cell = LIST_TAB_ANIME_CARD_WIDTH + LIST_TAB_ANIME_GRID_GAP;
    return Math.max(1, Math.floor((w + LIST_TAB_ANIME_GRID_GAP) / cell));
  }, [gridWidth]);
  const listCollapsedMax = gridColumns * LIST_TAB_ANIME_VISIBLE_ROWS;
  const listHasStatusFilter =
    filterCompletedOnly || filterCurrentOnly || filterDroppedOnly || filterPlanningOnly;
  const listNeedsMoreLess =
    !listHasStatusFilter && !planningVisible && gridSorted.length > listCollapsedMax;
  const canRevealPlanning =
    isAllTime &&
    !listHasStatusFilter &&
    !planningVisible &&
    planningFilteredSorted.length > 0 &&
    (!listNeedsMoreLess || listExpanded);
  const listToShow = useMemo(() => {
    if (listHasStatusFilter) return gridSorted;
    if (planningVisible) return gridSorted;
    if (!listNeedsMoreLess || listExpanded) return gridSorted;
    return gridSorted.slice(0, listCollapsedMax);
  }, [gridSorted, listHasStatusFilter, planningVisible, listNeedsMoreLess, listExpanded, listCollapsedMax]);

  /*
   * Mesure dynamique de la largeur de la grille pour en déduire le nombre de
   * colonnes (aligné sur la grille CSS). Ne s'active que lorsque l'onglet est
   * visible (`layoutActive = true`) : mesurer une grille masquée renverrait 0
   * et casserait le calcul.
   */
  useLayoutEffect(() => {
    if (!layoutActive) return undefined;
    const el = mediaGridRef.current;
    if (!el) return undefined;
    const apply = () => {
      const w = el.clientWidth;
      if (typeof w === "number" && Number.isFinite(w)) setGridWidth(w);
    };
    apply();
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      const w = cr?.width;
      if (typeof w === "number" && Number.isFinite(w)) setGridWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [layoutActive, gridSorted.length]);

  /* Au changement de période, on remet tous les filtres et tris à zéro : sinon
   * l'utilisateur verrait une liste filtrée/triée avec une sélection qui n'a
   * pas de sens pour la nouvelle période. */
  useEffect(() => {
    setListExpanded(false);
    setSearchQuery("");
    setSortKey(ANIME_GRID_SORT_DEFAULT);
    setFilterScoredOnly(false);
    setFilterCompletedOnly(false);
    setFilterCurrentOnly(false);
    setFilterDroppedOnly(false);
    setFilterPlanningOnly(false);
    setPlanningVisible(false);
  }, [year, month]);

  const resetFilters = useCallback(() => {
    setSearchQuery("");
    setFilterScoredOnly(false);
    setFilterCompletedOnly(false);
    setFilterCurrentOnly(false);
    setFilterDroppedOnly(false);
    setFilterPlanningOnly(false);
    setPlanningVisible(false);
  }, []);

  return {
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
    listHasStatusFilter,
    listNeedsMoreLess,
    canRevealPlanning,
    listToShow,
    resetFilters,
  };
}
