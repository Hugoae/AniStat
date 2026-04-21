import { useEffect, useState, type ReactNode } from "react";
import { useRotatingMessage } from "../../hooks/useRotatingMessage";

export type LoadingBlockProps = {
  /**
   * Liste de messages cycliques affichés sous le spinner. Au moins un. Si un
   * seul est fourni, il est affiché fixe. Sinon, ils tournent régulièrement
   * pour narrer le chargement (« Connexion… » → « Récupération… » → …).
   */
  messages?: string[];
  /** Libellé stable affiché sous les messages (ex. « Chargement des données AniList »). */
  caption?: string;
  /** Intervalle en ms entre deux messages. Défaut 2200 ms. */
  intervalMs?: number;
  /**
   * Quand fourni et > 0, active un compteur « reste ~Xs » calé sur la durée
   * indiquée. Le compteur est rafraîchi toutes les 500 ms ; s'il expire
   * avant la fin du chargement, on bascule sur « chargement depuis Ys… »
   * pour éviter de rester bloqué à 0.
   */
  estimatedMs?: number | null;
  /** Node supplémentaire (ex. lien « annuler ») affichée en bas du bloc. */
  footer?: ReactNode;
};

/** Format court et lisible d'une durée (ms) en français. */
function formatShortDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  if (totalSec < 60) return `${totalSec} s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  return seconds > 0 ? `${minutes} min ${seconds.toString().padStart(2, "0")}` : `${minutes} min`;
}

/**
 * Compteur « reste ~Xs / depuis Ys » pour un chargement en cours.
 * - Si aucune estimation fournie, n'affiche que le temps écoulé passé
 *   un court délai de grâce (évite de clignoter pour les chargements
 *   rapides servis via cache local).
 * - Si estimation fournie, affiche le temps restant projeté, puis
 *   bascule sur le temps écoulé une fois l'ETA expiré.
 */
function LoadingBlockCountdown({ estimatedMs }: { estimatedMs: number | null | undefined }) {
  // On garde le timestamp de démarrage en state (initialisé une seule fois)
  // plutôt qu'en ref : la lecture « pendant le render » est légale, et la
  // valeur reste stable entre les rerenders du tick.
  const [startedAt] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(id);
  }, []);

  const elapsedMs = now - startedAt;
  const hasEstimate = typeof estimatedMs === "number" && estimatedMs > 0;
  const remainingMs = hasEstimate ? (estimatedMs as number) - elapsedMs : 0;

  // Délai de grâce pour ne rien afficher sur les chargements très courts
  // (ex. cache chaud : la page se peint en < 1 s, un compteur serait du bruit).
  if (!hasEstimate && elapsedMs < 1_500) return null;

  const label = hasEstimate && remainingMs > 500
    ? `reste ~${formatShortDuration(remainingMs)}`
    : `chargement depuis ${formatShortDuration(elapsedMs)}…`;

  return (
    <div className="loading-block__countdown" aria-live="off">
      {label}
    </div>
  );
}

/**
 * Bloc de chargement principal narratif : spinner + messages tournants + caption.
 * Chaque message est remonté avec un `key` pour relancer l'animation de fade-in
 * (`.loading-block__message`) et donner une sensation de progression.
 *
 * Quand un `estimatedMs` est fourni (ex. basé sur les précédents chargements
 * mesurés dans `profileFetchStats`), on affiche en plus un compteur discret
 * « reste ~Xs » / « chargement depuis Ys… » pour rassurer l'utilisateur.
 */
export function LoadingBlock({
  messages,
  caption,
  intervalMs = 2200,
  estimatedMs,
  footer,
}: LoadingBlockProps) {
  const safeMessages = messages && messages.length > 0 ? messages : [caption ?? "Chargement…"];
  const { message, index } = useRotatingMessage(safeMessages, intervalMs);

  return (
    <div className="loading-block" role="status" aria-live="polite">
      <div className="spinner spinner--lg" aria-hidden="true" />
      <div className="loading-block__message-wrap">
        <div key={index} className="loading-block__message">
          {message}
        </div>
      </div>
      {caption ? <div className="loading-block__caption">{caption}</div> : null}
      <LoadingBlockCountdown estimatedMs={estimatedMs} />
      {footer ? <div className="loading-block__footer">{footer}</div> : null}
    </div>
  );
}
