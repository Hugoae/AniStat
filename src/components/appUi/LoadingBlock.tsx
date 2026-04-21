import type { ReactNode } from "react";
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
  /** Node supplémentaire (ex. lien « annuler ») affichée en bas du bloc. */
  footer?: ReactNode;
};

/**
 * Bloc de chargement principal narratif : spinner + messages tournants + caption.
 * Chaque message est remonté avec un `key` pour relancer l'animation de fade-in
 * (`.loading-block__message`) et donner une sensation de progression.
 */
export function LoadingBlock({
  messages,
  caption,
  intervalMs = 2200,
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
      {footer ? <div className="loading-block__footer">{footer}</div> : null}
    </div>
  );
}
