import { useEffect, useState } from "react";

/**
 * Rotation cyclique d'une liste de messages à intervalle régulier. Utilisé
 * pour narrer les chargements longs (fetch initial AniList) — on change
 * régulièrement le texte pour donner l'impression que quelque chose se passe,
 * même si la vraie progression n'est pas mesurable.
 *
 * Respecte `prefers-reduced-motion` : dans ce mode, la rotation est désactivée
 * et on reste sur le premier message (moins stimulant visuellement).
 *
 * @param messages Liste ordonnée des messages à afficher (min. 1).
 * @param intervalMs Délai en ms entre deux messages. Défaut 2200 ms (assez
 *   lent pour laisser le temps de lire, assez rapide pour montrer de la vie).
 */
export function useRotatingMessage(messages: string[], intervalMs: number = 2200) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (messages.length <= 1) return undefined;
    const mq = typeof window !== "undefined" && window.matchMedia
      ? window.matchMedia("(prefers-reduced-motion: reduce)")
      : null;
    if (mq?.matches) return undefined;
    const id = window.setInterval(() => {
      setIndex((i) => (i + 1) % messages.length);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [messages, intervalMs]);

  return {
    message: messages[index] ?? "",
    index,
  };
}
