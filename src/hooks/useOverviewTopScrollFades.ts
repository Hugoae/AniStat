import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

export type OverviewTopFades = { left: boolean; right: boolean };

/**
 * Gère le défilement horizontal des listes « top » de l’overview (dégradés gauche/droite).
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
