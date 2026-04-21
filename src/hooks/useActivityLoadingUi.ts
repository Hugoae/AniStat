import { useEffect, useRef, useState } from "react";
import { getRateLimitState } from "../api/anilistClient";
import {
  getActivityFetchStats,
  subscribeActivityFetchStats,
} from "../lib/activityFetchStats";

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
 * Nombre de requêtes estimées par année en l'absence de mesure observée
 * (anime + manga confondus). Calibré sur un profil « moyen » : ~3-4 pages
 * par type + une poignée de retry éventuels. Le hook converge vite vers la
 * valeur réelle dès qu'une année complète est mesurée (`recordActivityYearSample`).
 */
const FALLBACK_REQUESTS_PER_YEAR = 8;

/**
 * Marge de sécurité ajoutée à la durée moyenne observée pour l'estimation
 * initiale. On préfère annoncer « ~18 s » alors que ça se termine en 14 s
 * plutôt que l'inverse (impression d'être en retard → pire UX).
 */
const OBSERVED_SAFETY_FACTOR = 1.15;

/**
 * Formate une durée (ms) en une chaîne courte, lisible en français :
 *  - `< 60 s`  → "12 s"
 *  - `< 1 h`   → "1 min 20 s" ou "2 min" si pile sur la minute
 *  - `>= 1 h`  → "1 h 05"
 * On évite les zéros inutiles pour un ETA calme visuellement.
 */
function formatEtaDuration(ms: number): string {
  const totalSec = Math.max(0, Math.ceil(ms / 1000));
  if (totalSec < 60) return `${totalSec} s`;
  const minutes = Math.floor(totalSec / 60);
  const seconds = totalSec % 60;
  if (minutes < 60) {
    return seconds > 0 ? `${minutes} min ${seconds.toString().padStart(2, "0")}` : `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  return `${hours} h ${remMinutes.toString().padStart(2, "0")}`;
}

/**
 * UI state du chargement d'activités AniList :
 *
 *  - **displayActivityLoadingMessage** : variante « avec transition »
 *    (délai de 200 ms) du message courant, pour éviter le clignotement
 *    quand on enchaîne rapidement plusieurs phases de chargement.
 *
 *  - **activityEtaLabel** : estimation du temps restant **déjà formatée**
 *    (« 14 s », « 1 min 20 », ou `null` si aucune estimation pertinente).
 *    Le format exact est choisi ici pour que l'affichage reste cohérent
 *    entre les différents sites (banner principale, DevPanel, etc.) et
 *    que toute amélioration future (traduction, unités custom) soit
 *    centralisée.
 *
 *  - **activityEtaSeconds** : exposé pour conservation rétrocompatible
 *    (ancienne API). `null` ou `<=0` indique qu'aucune estimation n'est
 *    pertinente ; on bascule alors sur « finalisation… » côté consommateur.
 *
 * ### Stratégie d'estimation
 *
 * Le hook maintient un « budget » (durée totale attendue) recalculé à
 * chaque changement de phase (combinaison `userId × activityLoadingMessage`).
 * Il privilégie, dans l'ordre :
 *   1. Les **mesures réelles** déjà observées dans la session (via
 *      `getActivityFetchStats`) — convergence rapide : après 1 seule année
 *      chargée, on projette les suivantes avec précision ±15 %.
 *   2. Une **heuristique rate-limit** basée sur `getRateLimitState`
 *      (intervalle courant × requêtes attendues). Utilisée au tout premier
 *      chargement, avant d'avoir une mesure.
 *
 * Le budget « se rallonge » automatiquement s'il expire avant que le
 * chargement se termine (cas d'un rate-limit plus strict que prévu ou d'une
 * année anormalement volumineuse) : on évite de mentir à l'utilisateur en
 * descendant à 0 s indéfiniment.
 *
 * L'ETA est rafraîchi toutes les 500 ms pour un décompte fluide.
 */
export function useActivityLoadingUi({
  loadingActivities,
  activityLoadingMessage,
  userId,
  activityYearsPendingCount,
}: Params) {
  const [displayActivityLoadingMessage, setDisplayActivityLoadingMessage] =
    useState(activityLoadingMessage);
  const [activityEtaSeconds, setActivityEtaSeconds] = useState<number | null>(null);
  const [activityEtaLabel, setActivityEtaLabel] = useState<string | null>(null);
  const loadingMessageTransitionRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loadingActivitiesRef = useRef(false);
  const activityEtaPhaseRef = useRef("");
  const activityEtaEndAtRef = useRef(0);
  const activityEtaStartAtRef = useRef(0);
  const activityEtaIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  /** Incrémenté lorsqu'un nouvel échantillon est publié : force le recalcul du budget. */
  const statsVersionRef = useRef(0);

  useEffect(() => {
    loadingActivitiesRef.current = loadingActivities;
  }, [loadingActivities]);

  // Gestion du message affiché avec une courte fenêtre anti-clignotement.
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

  // Abonnement aux stats observées : chaque année complétée doit pouvoir
  // rafraîchir l'ETA pour les années encore en cours.
  useEffect(() => {
    const unsubscribe = subscribeActivityFetchStats(() => {
      statsVersionRef.current += 1;
      // On ne force pas un setState ici : le `tick` (intervalle) relira
      // les stats à son prochain rafraîchissement (≤ 500 ms). Cela évite
      // un re-render supplémentaire juste pour un changement d'estimation.
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (activityEtaIntervalRef.current) {
      clearInterval(activityEtaIntervalRef.current);
      activityEtaIntervalRef.current = null;
    }
    if (!loadingActivities) {
      activityEtaPhaseRef.current = "";
      activityEtaEndAtRef.current = 0;
      activityEtaStartAtRef.current = 0;
      setActivityEtaSeconds(null);
      setActivityEtaLabel(null);
      return;
    }

    /**
     * Calcule le budget initial pour la phase courante.
     * Renvoie `durée totale estimée (ms)` pour le chargement restant.
     */
    const computeInitialBudget = (): number => {
      const rs = getRateLimitState();
      const slotMs = rs.requestIntervalMs || 2200;
      const pendingYears = Math.max(1, activityYearsPendingCount);
      const blockedMs = rs.blockedForMs || 0;
      const stats = getActivityFetchStats();

      if (stats.avgYearDurationMs != null) {
        // On a déjà mesuré au moins une année : projection directe.
        // On prend la plus défavorable de (moyenne × facteur, maximum observé)
        // pour absorber la variance entre années (certaines bcp plus fournies).
        const safeAvg = stats.avgYearDurationMs * OBSERVED_SAFETY_FACTOR;
        const perYearMs = Math.max(safeAvg, stats.maxYearDurationMs ?? 0);
        return Math.max(8_000, blockedMs + perYearMs * pendingYears);
      }

      // Aucune mesure : heuristique rate-limit.
      // Chaque année = ~8 requêtes, chaque requête occupe 1 slot scheduler.
      const queueSlots = (rs.queued || 0) + (rs.inFlight || 0);
      const plannedRequests = pendingYears * FALLBACK_REQUESTS_PER_YEAR + queueSlots;
      return Math.max(10_000, blockedMs + plannedRequests * slotMs);
    };

    /**
     * Recalcule la durée restante. Le budget peut être revu à la hausse si
     * la phase dépasse l'estimation initiale (rate-limit imprévu, volume
     * exceptionnel). On bump alors de manière *mesurée* pour ne pas
     * osciller visuellement.
     */
    const tick = () => {
      if (!loadingActivitiesRef.current) return;
      const end = activityEtaEndAtRef.current;
      if (!end) return;
      let msLeft = end - Date.now();
      if (msLeft <= 0 && loadingActivitiesRef.current) {
        const rs = getRateLimitState();
        const slot = rs.requestIntervalMs || 2200;
        const stats = getActivityFetchStats();
        // Si on a des mesures, on bump d'un « petit morceau d'année » ;
        // sinon, on retombe sur l'heuristique historique (≥ 12 s).
        const baseBump = stats.avgYearDurationMs != null
          ? Math.max(6_000, stats.avgYearDurationMs * 0.35)
          : Math.max(12_000, 8 * slot);
        const bump = Math.max(baseBump, rs.blockedForMs || 0);
        activityEtaEndAtRef.current = Date.now() + bump;
        msLeft = bump;
      }
      const secondsLeft = Math.max(0, Math.ceil(msLeft / 1000));
      setActivityEtaSeconds(secondsLeft);
      setActivityEtaLabel(secondsLeft > 0 ? formatEtaDuration(msLeft) : null);
    };

    const phaseKey = `${userId ?? "0"}|${activityLoadingMessage}`;
    if (activityEtaPhaseRef.current !== phaseKey) {
      activityEtaPhaseRef.current = phaseKey;
      const budget = computeInitialBudget();
      activityEtaStartAtRef.current = Date.now();
      activityEtaEndAtRef.current = Date.now() + budget;
    }
    tick();
    activityEtaIntervalRef.current = setInterval(tick, 500);
    return () => {
      if (activityEtaIntervalRef.current) {
        clearInterval(activityEtaIntervalRef.current);
        activityEtaIntervalRef.current = null;
      }
    };
  }, [loadingActivities, activityLoadingMessage, userId, activityYearsPendingCount]);

  return { displayActivityLoadingMessage, activityEtaSeconds, activityEtaLabel };
}
