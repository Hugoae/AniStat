import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

export type HorizontalScrollFades = { left: boolean; right: boolean };

/**
 * Suit la position de scroll horizontal d'un élément et expose deux booléens
 * `{ left, right }` qui indiquent si du contenu reste à révéler de chaque côté.
 *
 * Pattern identique à `useOverviewTopScrollFades`, mais générique : on passe
 * une liste de dépendances qui doivent réinitialiser le scroll à 0 quand
 * elles changent (changement de période, de source, etc.).
 */
export function useHorizontalScrollFades(
  active: boolean,
  resetDeps: ReadonlyArray<unknown>
) {
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [fades, setFades] = useState<HorizontalScrollFades>({ left: false, right: false });

  const update = useCallback(() => {
    const el = scrollRef.current;
    if (!el) {
      setFades({ left: false, right: false });
      return;
    }
    const maxScroll = Math.max(0, Math.round(el.scrollWidth - el.clientWidth));
    const hasOverflow = maxScroll > 2;
    const slop = 8;
    const showLeft = hasOverflow && el.scrollLeft > slop;
    const showRight = hasOverflow && el.scrollLeft + slop < maxScroll;
    setFades({ left: showLeft, right: showRight });
  }, []);

  useLayoutEffect(() => {
    if (!active) {
      setFades({ left: false, right: false });
      return;
    }
    const reset = () => {
      const el = scrollRef.current;
      if (el) el.scrollLeft = 0;
    };
    reset();
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      reset();
      inner = requestAnimationFrame(() => {
        reset();
        update();
      });
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, update, ...resetDeps]);

  useEffect(() => {
    if (!active) return undefined;
    const el = scrollRef.current;
    if (!el) {
      update();
      return undefined;
    }
    const onChange = () => update();
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(onChange) : null;
    el.addEventListener("scroll", onChange, { passive: true });
    ro?.observe(el);
    window.addEventListener("resize", onChange);
    update();
    const t1 = window.setTimeout(update, 120);
    const t2 = window.setTimeout(update, 500);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
      el.removeEventListener("scroll", onChange);
      ro?.disconnect();
      window.removeEventListener("resize", onChange);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, update, ...resetDeps]);

  return { scrollRef, fades };
}
