import { useEffect, useRef, useState } from "react";
import { getRateLimitState } from "../api/anilistClient";

type Params = {
  /** `true` tant qu'au moins une année d'activités est en cours de chargement. */
  loadingActivities: boolean;
  /** Dernier message de phase produit par le loader (« Chargement 2024… »). */
  activityLoadingMessage: string;
  /** Id AniList du profil courant ; sert à détecter les changements de profil. */
  userId: number | null | undefined;
  /** Nombre d'années encore à charger dans la requête courante. */
  activityYearsPendingCount: number;
};

/**
 * UI state du chargement d'activités AniList :
 *  - **displayActivityLoadingMessage** : variante « avec transition »
 *    (délai de 200 ms) du message courant, pour éviter le clignotement
 *    quand on enchaîne rapidement plusieurs phases de chargement.
 *  - **activityEtaSeconds** : estimation grossière du temps restant, basée
 *    sur la politique de rate-limit AniList (`getRateLimitState`), le
 *    nombre d'années en attente et la file de requêtes. Recalculée à
 *    chaque changement de phase (profil × message) et mise à jour toutes
 *    les 500 ms pour afficher un décompte fluide (`~12s`, `~11s`, …).
 *
 * Les estimations se « rallongent » elles-mêmes si on dépasse l'ETA initial
 * (cas classique : rate-limit plus strict que prévu). On ne bloque jamais
 * l'utilisateur sur une promesse irréaliste : l'ETA est indicatif.
 */
export function useActivityLoadingUi({
  loadingActivities,
  activityLoadingMessage,
  userId,
  activityYearsPendingCount,
}: Params) {
  const [displayActivityLoadingMessage, setDisplayActivityLoadingMessage] = useState(activityLoadingMessage);
  const [activityEtaSeconds, setActivityEtaSeconds] = useState<number | null>(null);
  const loadingMessageTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingActivitiesRef = useRef(false);
  const activityEtaPhaseRef = useRef("");
  const activityEtaEndAtRef = useRef(0);
  const activityEtaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadingActivitiesRef.current = loadingActivities;
  }, [loadingActivities]);

  useEffect(() => {
    if (!loadingActivities) {
      if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
      loadingMessageTransitionRef.current = null;
      setDisplayActivityLoadingMessage(activityLoadingMessage);
      return;
    }
    if (displayActivityLoadingMessage === activityLoadingMessage) return;
    if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
    loadingMessageTransitionRef.current = setTimeout(() => {
      setDisplayActivityLoadingMessage(activityLoadingMessage);
      loadingMessageTransitionRef.current = null;
    }, 200);
  }, [activityLoadingMessage, displayActivityLoadingMessage, loadingActivities]);

  useEffect(
    () => () => {
      if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
    },
    []
  );

  useEffect(() => {
    if (activityEtaIntervalRef.current) {
      clearInterval(activityEtaIntervalRef.current);
      activityEtaIntervalRef.current = null;
    }
    if (!loadingActivities) {
      activityEtaPhaseRef.current = "";
      activityEtaEndAtRef.current = 0;
      setActivityEtaSeconds(null);
      return;
    }
    const phaseKey = `${userId ?? "0"}|${activityLoadingMessage}`;
    if (activityEtaPhaseRef.current !== phaseKey) {
      activityEtaPhaseRef.current = phaseKey;
      const rs = getRateLimitState();
      const slotMs = rs.requestIntervalMs || 2200;
      const pendingYears = Math.max(1, activityYearsPendingCount);
      const queueSlots = (rs.queued || 0) + (rs.inFlight || 0) * 2;
      const budgetMs = Math.max(
        10_000,
        (rs.blockedForMs || 0) + pendingYears * 12 * slotMs + queueSlots * slotMs + 4 * slotMs
      );
      activityEtaEndAtRef.current = Date.now() + budgetMs;
    }
    const tick = () => {
      if (!loadingActivitiesRef.current) return;
      const end = activityEtaEndAtRef.current;
      if (!end) return;
      let msLeft = end - Date.now();
      if (msLeft <= 0 && loadingActivitiesRef.current) {
        const rs = getRateLimitState();
        const slot = rs.requestIntervalMs || 2200;
        const bump = Math.max(12_000, (rs.blockedForMs || 0) + 8 * slot);
        activityEtaEndAtRef.current = Date.now() + bump;
        msLeft = bump;
      }
      setActivityEtaSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    };
    tick();
    activityEtaIntervalRef.current = setInterval(tick, 500);
    return () => {
      if (activityEtaIntervalRef.current) {
        clearInterval(activityEtaIntervalRef.current);
        activityEtaIntervalRef.current = null;
      }
    };
  }, [loadingActivities, activityLoadingMessage, userId, activityYearsPendingCount]);

  return { displayActivityLoadingMessage, activityEtaSeconds };
}
