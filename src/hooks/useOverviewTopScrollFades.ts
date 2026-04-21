import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type OverviewTopFades = { left: boolean; right: boolean };

/**
 * Gère l'état visuel des carrousels « top anime / top manga » de l'overview.
 *
 * Pour chaque carrousel, le hook :
 *  1. Expose un `ref` à attacher au conteneur scrollable.
 *  2. Calcule deux booléens `{ left, right }` qui servent à afficher ou
 *     masquer les dégradés latéraux (indication « il reste du contenu à
 *     gauche/droite »). La détection utilise un `slop` de 8 px pour ignorer
 *     les micro-décalages de rendu.
 *
 * Particularités de l'overview vs `useHorizontalScrollFades` :
 *  - On reset `scrollLeft = 0` à chaque changement de `tab`, `year`, `month`
 *    ou longueur de liste, via une cascade de `requestAnimationFrame`. Cela
 *    évite qu'un défilement hérité de la période précédente reste en place
 *    quand l'utilisateur change de sélection.
 *  - Un second passage à 80 ms recentre les listes une fois que les images
 *    de cover ont commencé leur fade-in (elles peuvent faire varier
 *    légèrement la hauteur/largeur dans les premiers frames).
 *  - `ResizeObserver` + event `scroll` + `resize` (fenêtre) : on rafraîchit
 *    les fades dès que le viewport ou le contenu change.
 */
export function useOverviewTopScrollFades(
  tab: string,
  loaded: boolean,
  year: number,
  month: number,
  overviewTopMangaLength: number,
  overviewTopAnimeLength: number
) {
  const overviewMangaTopScrollRef = useRef<HTMLDivElement | null>(null);
  const overviewAnimeTopScrollRef = useRef<HTMLDivElement | null>(null);
  const [overviewMangaTopFades, setOverviewMangaTopFades] = useState<OverviewTopFades>({
    left: false,
    right: false,
  });
  const [overviewAnimeTopFades, setOverviewAnimeTopFades] = useState<OverviewTopFades>({
    left: false,
    right: false,
  });

  const updateOverviewTopScrollFades = useCallback(() => {
    const apply = (
      el: HTMLDivElement | null,
      set: (v: OverviewTopFades) => void
    ) => {
      if (!el) {
        set({ left: false, right: false });
        return;
      }
      const maxScroll = Math.max(0, Math.round(el.scrollWidth - el.clientWidth));
      const hasOverflow = maxScroll > 2;
      const slop = 8;
      const showLeft = hasOverflow && el.scrollLeft > slop;
      const showRight = hasOverflow && el.scrollLeft + slop < maxScroll;
      set({ left: showLeft, right: showRight });
    };
    apply(overviewMangaTopScrollRef.current, setOverviewMangaTopFades);
    apply(overviewAnimeTopScrollRef.current, setOverviewAnimeTopFades);
  }, []);

  useLayoutEffect(() => {
    if (tab !== "overview") {
      setOverviewMangaTopFades({ left: false, right: false });
      setOverviewAnimeTopFades({ left: false, right: false });
      return;
    }
    const reset = () => {
      const m = overviewMangaTopScrollRef.current;
      const a = overviewAnimeTopScrollRef.current;
      if (m) m.scrollLeft = 0;
      if (a) a.scrollLeft = 0;
    };
    reset();
    const rafIds = { inner: 0 };
    const rafOuter = requestAnimationFrame(() => {
      reset();
      rafIds.inner = requestAnimationFrame(() => {
        reset();
        updateOverviewTopScrollFades();
      });
    });
    return () => {
      cancelAnimationFrame(rafOuter);
      cancelAnimationFrame(rafIds.inner);
    };
  }, [
    tab,
    year,
    month,
    loaded,
    overviewTopMangaLength,
    overviewTopAnimeLength,
    updateOverviewTopScrollFades,
  ]);

  useEffect(() => {
    if (tab !== "overview" || !loaded) return undefined;
    const forceStart = () => {
      const m = overviewMangaTopScrollRef.current;
      const a = overviewAnimeTopScrollRef.current;
      if (m) m.scrollLeft = 0;
      if (a) a.scrollLeft = 0;
      updateOverviewTopScrollFades();
    };
    const t0 = window.setTimeout(forceStart, 0);
    const t1 = window.setTimeout(forceStart, 80);
    return () => {
      window.clearTimeout(t0);
      window.clearTimeout(t1);
    };
  }, [
    tab,
    loaded,
    overviewTopMangaLength,
    overviewTopAnimeLength,
    updateOverviewTopScrollFades,
  ]);

  useEffect(() => {
    if (tab !== "overview") return undefined;
    const mEl = overviewMangaTopScrollRef.current;
    const aEl = overviewAnimeTopScrollRef.current;
    const onScrollOrResize = () => updateOverviewTopScrollFades();
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(onScrollOrResize)
        : null;
    const scrollOpts: AddEventListenerOptions = { passive: true };
    if (mEl) {
      mEl.addEventListener("scroll", onScrollOrResize, scrollOpts);
      ro?.observe(mEl);
    }
    if (aEl) {
      aEl.addEventListener("scroll", onScrollOrResize, scrollOpts);
      ro?.observe(aEl);
    }
    window.addEventListener("resize", onScrollOrResize);
    updateOverviewTopScrollFades();
    const t1 = window.setTimeout(updateOverviewTopScrollFades, 120);
    const t2 = window.setTimeout(updateOverviewTopScrollFades, 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      if (mEl) mEl.removeEventListener("scroll", onScrollOrResize);
      if (aEl) aEl.removeEventListener("scroll", onScrollOrResize);
      ro?.disconnect();
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [
    tab,
    updateOverviewTopScrollFades,
    overviewTopMangaLength,
    overviewTopAnimeLength,
  ]);

  return {
    overviewMangaTopScrollRef,
    overviewAnimeTopScrollRef,
    overviewMangaTopFades,
    overviewAnimeTopFades,
  };
}
