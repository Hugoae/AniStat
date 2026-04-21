/**
 * Mémoire persistée des derniers chargements complets de profil AniList.
 *
 * Objectif : alimenter un ETA fiable pour le « loader principal »
 * (`LoadingBlock` avec la narration « Connexion à AniList… »), basé sur
 * ce que prend **réellement** un fetch complet (profil + listes
 * anime/manga) pour CE profil / CET appareil.
 *
 * Les durées sont conservées dans `localStorage` (5 derniers échantillons
 * glissants) pour qu'une information pertinente survive au rechargement
 * de page. En l'absence de `localStorage` disponible (mode privé, iframe
 * restreinte), on retombe silencieusement sur une mémoire in-memory.
 */

const STORAGE_KEY = "als:profileFetchStats:v1";
const MAX_SAMPLES = 5;
/** En-dessous de ce seuil, on considère qu'on a servi principalement du cache
 *  et on n'enregistre pas — ce serait sous-estimer un vrai premier fetch. */
const MIN_SAMPLE_MS = 1_500;

type StoredState = {
  samples: number[];
};

const inMemory: StoredState = { samples: [] };
let loaded = false;
const listeners = new Set<() => void>();

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

function load(): StoredState {
  if (loaded) return inMemory;
  loaded = true;
  const storage = safeStorage();
  if (!storage) return inMemory;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return inMemory;
    const parsed = JSON.parse(raw) as Partial<StoredState>;
    if (Array.isArray(parsed.samples)) {
      inMemory.samples = parsed.samples.filter(
        (n): n is number => typeof n === "number" && Number.isFinite(n) && n > 0
      );
    }
  } catch {
    /* lecture corrompue : on repart sur un état vide */
  }
  return inMemory;
}

function persist(): void {
  const storage = safeStorage();
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(inMemory));
  } catch {
    /* quota atteint ou autre : on accepte la perte silencieuse */
  }
}

function notify(): void {
  listeners.forEach((l) => {
    try {
      l();
    } catch {
      /* défaillance listener ne doit pas bloquer les autres */
    }
  });
}

export type ProfileFetchStats = {
  /**
   * Durée moyenne observée pour un fetch profil complet.
   * `null` tant qu'aucun échantillon suffisamment long n'a été enregistré.
   */
  avgMs: number | null;
  /** Maximum observé, utile pour dimensionner l'ETA au « pire » cas. */
  maxMs: number | null;
  /** Dernière mesure, projection naturelle pour le prochain fetch. */
  lastMs: number | null;
  /** Nombre d'échantillons retenus. */
  samples: number;
};

/**
 * Enregistre la durée d'un fetch profil complet. Les fetchs très courts
 * (typiquement < 1,5 s) sont ignorés : ils correspondent à des hits de
 * cache local qui fausseraient l'estimation pour un vrai premier chargement.
 */
export function recordProfileFetch(durationMs: number): void {
  if (!Number.isFinite(durationMs) || durationMs < MIN_SAMPLE_MS) return;
  const state = load();
  state.samples.push(Math.round(durationMs));
  if (state.samples.length > MAX_SAMPLES) {
    state.samples.splice(0, state.samples.length - MAX_SAMPLES);
  }
  persist();
  notify();
}

export function getProfileFetchStats(): ProfileFetchStats {
  const state = load();
  if (state.samples.length === 0) {
    return { avgMs: null, maxMs: null, lastMs: null, samples: 0 };
  }
  const total = state.samples.reduce((sum, ms) => sum + ms, 0);
  const max = state.samples.reduce((m, ms) => (ms > m ? ms : m), 0);
  return {
    avgMs: Math.round(total / state.samples.length),
    maxMs: max,
    lastMs: state.samples[state.samples.length - 1] ?? null,
    samples: state.samples.length,
  };
}

export function subscribeProfileFetchStats(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function resetProfileFetchStats(): void {
  load();
  inMemory.samples = [];
  persist();
  notify();
}
