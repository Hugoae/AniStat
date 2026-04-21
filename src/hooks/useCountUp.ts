import { useEffect, useRef, useState } from "react";

/** Easing "ease-out cubic" — démarre vite puis ralentit, donne un ressenti naturel. */
function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Anime un nombre vers `target` sur `durationMs`. Au premier rendu, part de 0
 * pour un effet « count-up » classique ; ensuite, tweene entre l'ancienne et
 * la nouvelle valeur à chaque changement (utile quand la période change et que
 * les chiffres des StatCards se recalculent).
 *
 * Respecte `prefers-reduced-motion: reduce` : dans ce cas, la valeur saute
 * immédiatement à la cible sans animation.
 */
export function useCountUp(
  target: number,
  options?: { durationMs?: number }
): number {
  const duration = options?.durationMs ?? 900;
  const [display, setDisplay] = useState<number>(() => {
    if (typeof window === "undefined") return target;
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    return prefersReduced ? target : 0;
  });
  const previousRef = useRef<number>(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    if (prefersReduced) {
      setDisplay(target);
      previousRef.current = target;
      return undefined;
    }

    const from = previousRef.current;
    if (from === target) {
      setDisplay(target);
      return undefined;
    }

    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    const startTime = performance.now();

    const tick = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, elapsed / duration);
      const eased = easeOutCubic(t);
      const current = from + (target - from) * eased;
      setDisplay(current);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
        previousRef.current = target;
      }
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      // Si on quitte avant la fin, on sauvegarde la dernière valeur affichée
      // pour ne pas repartir brutalement de 0 au prochain update.
      previousRef.current = target;
    };
  }, [target, duration]);

  return display;
}
