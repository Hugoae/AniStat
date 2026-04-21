/**
 * Statistiques observées lors des chargements d'années d'activité AniList.
 *
 * Objectif : offrir une estimation réaliste du temps restant (ETA) affiché
 * pendant qu'on charge l'année de comparaison ou d'autres années manquantes.
 *
 * Le `fetch log` d'`anilistClient` capture chaque page (`ListActivities`)
 * individuellement, mais une année = plusieurs pages anime + plusieurs pages
 * manga, entrecoupées d'attentes scheduler. Seul le loader connaît les
 * frontières « début → fin d'une année ». On expose donc une API simple
 * qu'il appelle à la complétion de chaque année pour alimenter une mémoire
 * glissante.
 *
 * Les dernières `MAX_SAMPLES` mesures sont conservées. Les consommateurs
 * (UI de chargement, DevPanel) s'abonnent aux changements pour rafraîchir
 * leurs estimations à chaque complétion.
 */

/**
 * Mesure pour une année chargée. `pagesFetched` est indicatif (ne compte
 * pas toutes les combinaisons type × page) et sert surtout au DevPanel.
 */
export type ActivityYearSample = {
  /** Temps total (ms) entre le début du fetch et la dernière réponse. */
  durationMs: number;
  /** Nombre approximatif de pages récupérées (anime + manga confondus). */
  pagesFetched: number;
  /** Horodatage de l'échantillon, utile pour afficher une fraîcheur. */
  recordedAt: number;
};

export type ActivityFetchStats = {
  /**
   * Moyenne des durées par année observées dans la session courante.
   * `null` tant qu'aucune année complète n'a été mesurée.
   */
  avgYearDurationMs: number | null;
  /** Maximum observé : utile pour dimensionner un ETA « sûr ». */
  maxYearDurationMs: number | null;
  /** Nombre d'années mesurées dans la session. */
  samples: number;
  /** Dernière durée observée, pour une projection « année suivante ». */
  lastYearDurationMs: number | null;
};

const MAX_SAMPLES = 8;

const samples: ActivityYearSample[] = [];
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* listener failure ne doit pas propager */
    }
  });
}

/**
 * Publie la mesure d'une année entièrement chargée (anime + manga).
 * Les mesures très courtes (< 200 ms — typiquement un hit de cache
 * local qui n'a pas déclenché de requête réseau) sont ignorées pour
 * ne pas biaiser l'ETA vers des valeurs irréalistes.
 */
export function recordActivityYearSample(durationMs: number, pagesFetched: number): void {
  if (!Number.isFinite(durationMs) || durationMs < 200) return;
  samples.push({
    durationMs,
    pagesFetched: Math.max(0, Math.floor(pagesFetched)),
    recordedAt: Date.now(),
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
  notify();
}

export function getActivityFetchStats(): ActivityFetchStats {
  if (samples.length === 0) {
    return {
      avgYearDurationMs: null,
      maxYearDurationMs: null,
      samples: 0,
      lastYearDurationMs: null,
    };
  }
  let sum = 0;
  let max = 0;
  for (const s of samples) {
    sum += s.durationMs;
    if (s.durationMs > max) max = s.durationMs;
  }
  return {
    avgYearDurationMs: sum / samples.length,
    maxYearDurationMs: max,
    samples: samples.length,
    lastYearDurationMs: samples[samples.length - 1]?.durationMs ?? null,
  };
}

export function subscribeActivityFetchStats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetActivityFetchStats(): void {
  samples.length = 0;
  notify();
}
