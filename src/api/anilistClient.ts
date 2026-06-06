import { gql } from "./gql";
import type { ListActivitiesQuery } from "../types/anilistGraphql";

/** Élément d'activité retourné par `fetchListActivitiesForYear`. */
export type ListActivityItem = NonNullable<
  NonNullable<NonNullable<ListActivitiesQuery["Page"]>["activities"]>[number]
>;

const ANILIST_URL = "/api/anilist";
const AL_MAX_RETRIES = 2;

/**
 * Intervalle minimal entre deux requêtes AniList (rate-limit côté client).
 *
 * AniList publie depuis 2024 une limite officielle de 30 req/min pour l'API v2
 * (« API dégradée »). Elle peut remonter à 90 req/min si la v2 revient à son
 * fonctionnement historique. Plutôt que de figer l'intervalle à ~2 200 ms,
 * on le recalcule dynamiquement à partir du header `X-RateLimit-Limit` observé :
 *
 *   limit = 30/min  → ~2 200 ms (marge pour ~27 req/min, valeur historique)
 *   limit = 60/min  → ~1 100 ms (≈ 54 req/min, marge 10 %)
 *   limit ≥ 90/min  →   ~750 ms (≈ 80 req/min, marge 11 %)
 *   inconnu         → ~2 200 ms (fallback conservateur : évite tout 429 tant
 *                                 que la réponse initiale n'a pas été reçue)
 *
 * Les bornes conservent une marge explicite pour absorber les rafales internes
 * du scheduler (Promise.all), et `applyRateHeaders` reste la source de vérité
 * pour les blocages durs (429 / remaining == 0).
 */
const REQUEST_INTERVAL_FALLBACK_MS = 2200;

function computeRequestIntervalMs(limitPerMinute: number | null): number {
  if (limitPerMinute === null || !Number.isFinite(limitPerMinute) || limitPerMinute <= 0) {
    return REQUEST_INTERVAL_FALLBACK_MS;
  }
  if (limitPerMinute >= 90) return 750;
  if (limitPerMinute >= 60) return 1100;
  if (limitPerMinute >= 30) return REQUEST_INTERVAL_FALLBACK_MS;
  // Limite annoncée très basse (<30/min) : on se cale dessus avec 20 % de marge.
  return Math.max(REQUEST_INTERVAL_FALLBACK_MS, Math.ceil((60_000 / limitPerMinute) * 1.2));
}

function currentRequestIntervalMs(): number {
  return computeRequestIntervalMs(scheduler.rateLimit);
}

/**
 * Erreur spécifique levée quand AniList indique que son API v2 est désactivée
 * (HTTP 403 ou message GraphQL dédié). Remonte un message UX clair et évite
 * les retries automatiques qui ne feraient qu'aggraver la situation.
 */
export class AniListApiDisabledError extends Error {
  readonly code = "ANILIST_API_DISABLED";
  constructor(message?: string) {
    super(
      message ||
        "L'API AniList est actuellement désactivée. Réessaie plus tard — aucune action de ta part n'est requise."
    );
    this.name = "AniListApiDisabledError";
  }
}

/**
 * Liste des entrées anime de l'utilisateur.
 *
 * Les champs demandés sont volontairement un sur-ensemble strict de ce que
 * consomme l'UI (cf. audit `stats.ts`, `App.tsx`, `MediaCard.tsx`, …).
 * On a retiré les champs propres au manga (`chapters`, `volumes`) et
 * `media.status` (jamais lu), afin d'alléger le payload et d'améliorer les
 * temps de réponse AniList ainsi que la taille du cache proxy Upstash.
 */
export const MEDIA_LIST_QUERY = gql`
query MediaList($userName: String!, $type: MediaType!) {
  MediaListCollection(userName: $userName, type: $type) {
    lists {
      name
      status
      entries {
        id
        status
        score(format: POINT_10_DECIMAL)
        progress
        startedAt { year month day }
        completedAt { year month day }
        updatedAt
        media {
          id
          title { romaji english }
          coverImage { large medium color }
          countryOfOrigin
          season
          seasonYear
          startDate { year month day }
          episodes
          duration
          format
          genres
          tags {
            id
            name
            category
            rank
            isMediaSpoiler
            isGeneralSpoiler
            isAdult
          }
          averageScore
          siteUrl
          studios {
            edges {
              isMain
              node { id name isAnimationStudio }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Variante pour la liste manga : on récupère en plus les `staff` du media (auteurs,
 * scénaristes, illustrateurs…). Spécifique au manga pour ne pas alourdir le payload
 * anime (qui inclurait sinon doubleurs, réalisateurs, etc.).
 * `perPage: 8` couvre largement les contributeurs principaux (mangaka, story/art).
 *
 * Les champs propres à l'anime (`episodes`, `duration`, `season`, `seasonYear`)
 * et `media.status` ont été retirés : aucun consommateur manga ne les lit, et
 * leur absence réduit sensiblement la taille du payload sur des bibliothèques
 * volumineuses.
 */
export const MEDIA_LIST_QUERY_MANGA = gql`
query MediaListManga($userName: String!, $type: MediaType!) {
  MediaListCollection(userName: $userName, type: $type) {
    lists {
      name
      status
      entries {
        id
        status
        score(format: POINT_10_DECIMAL)
        progress
        progressVolumes
        startedAt { year month day }
        completedAt { year month day }
        updatedAt
        media {
          id
          title { romaji english }
          coverImage { large medium color }
          countryOfOrigin
          startDate { year month day }
          chapters
          volumes
          format
          genres
          tags {
            id
            name
            category
            rank
            isMediaSpoiler
            isGeneralSpoiler
            isAdult
          }
          averageScore
          siteUrl
          studios {
            edges {
              isMain
              node { id name isAnimationStudio }
            }
          }
          staff(sort: RELEVANCE, perPage: 8) {
            edges {
              role
              node {
                id
                name { full native userPreferred }
                image { large medium }
                siteUrl
              }
            }
          }
        }
      }
    }
  }
}`;

/**
 * Profil utilisateur minimal utilisé par le header et la page d'accueil.
 *
 * Le bloc `statistics { anime { … } manga { … } }` historiquement présent a
 * été retiré : aucune surface UI ne consomme ces agrégats (toutes les
 * statistiques sont recalculées localement à partir de `MediaListCollection`,
 * ce qui permet d'appliquer filtres et périodes).
 */
export const USER_QUERY = gql`
query UserProfile($name: String!) {
  User(name: $name) {
    id
    name
    createdAt
    avatar { large medium }
    bannerImage
  }
}`;

/**
 * Version allégée : on ne récupère que l'identifiant du media pour chaque
 * activité. Les métadonnées (durée, épisodes, chapitres, format, pays, genres,
 * titre, cover, studios, etc.) sont déjà présentes dans `MediaListCollection` chargé
 * au login, et jointes côté client via `mediaByIdRef` dans useActivityYearsLoader.
 *
 * Gain : ~70-80 % du payload des activités retiré (1 activité = ~60 octets au
 * lieu de ~400+ pour un media complet avec tags/studios). Sur un user avec
 * 3 000 activités, on économise ~1 Mo par chargement + autant dans le cache
 * proxy Upstash.
 *
 * Limite : les activités qui pointent vers un media absent de la liste de
 * l'utilisateur (média supprimé d'AniList, activité héritée) restent avec un
 * objet `{ id }` seul. Elles ne participent pas aux stats dérivées (le pipeline
 * les filtre via `normalizeActivitiesWithDiagnostics`) mais n'empêchent pas
 * les calculs sur les autres activités.
 */
export const LIST_ACTIVITY_QUERY = gql`
query ListActivities($userId: Int!, $type: ActivityType!, $page: Int!, $perPage: Int!) {
  Page(page: $page, perPage: $perPage) {
    pageInfo {
      currentPage
      hasNextPage
    }
    activities(userId: $userId, type: $type, sort: ID_DESC) {
      ... on ListActivity {
        id
        status
        progress
        createdAt
        media { id }
      }
    }
  }
}`;

export const sleep = (ms: number, signal?: AbortSignal): Promise<void> =>
  new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const id = setTimeout(resolve, ms);
    if (signal) {
      signal.addEventListener(
        "abort",
        () => {
          clearTimeout(id);
          reject(new DOMException("Aborted", "AbortError"));
        },
        { once: true }
      );
    }
  });

/** État du scheduler interne exposé aux listeners. */
export type RateLimitStateSnapshot = {
  queued: number;
  inFlight: number;
  blockedForMs: number;
  estimatedWaitMs: number;
  rateLimit: number | null;
  rateRemaining: number | null;
  rateResetAt: number | null;
  requestIntervalMs: number;
};

/** Statistiques d'efficacité du cache proxy (HIT/MISS/BYPASS par politique). */
export type ProxyCacheSnapshot = {
  hit: number;
  miss: number;
  bypass: number;
  unknown: number;
  policy: Record<string, number>;
};

/**
 * Journal circulaire des requêtes GraphQL exécutées via `fetchAL`.
 *
 * Chaque entrée capture les informations utiles au debug :
 *  - `operationName` : nom extrait du `query NomOp(...)` (ou `"anonymous"`).
 *  - `variablesSummary` : représentation courte des variables utiles
 *    (ex. `userId=123, type=ANIME_LIST, page=2`), tronquée pour rester lisible.
 *  - `durationMs` : temps total, incluant l'attente dans le scheduler
 *    (pertinent pour diagnostiquer un rate-limit en amont).
 *  - `responseBytes` : taille de la réponse brute reçue (utile pour voir
 *    l'effet de l'optimisation D / des slims de payload).
 *  - `httpStatus` : code HTTP renvoyé par le proxy.
 *  - `proxyCache` : HIT / MISS / BYPASS annoncé par le proxy (header
 *    `X-Proxy-Cache`). `null` si aucune info.
 *  - `outcome` : `success` / `error` / `aborted`.
 *  - `retries` : nombre de tentatives internes à ce `fetchAL` (429, 5xx).
 *  - `rateLimitRemaining` : valeur du header `X-RateLimit-Remaining` à
 *    l'instant de la réponse (permet de voir quand on approche la limite).
 */
export type FetchLogEntry = {
  id: number;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  operationName: string;
  variablesSummary: string;
  responseBytes: number | null;
  httpStatus: number | null;
  proxyCache: "HIT" | "MISS" | "BYPASS" | "UNKNOWN" | null;
  proxyPolicy: string | null;
  outcome: "success" | "error" | "aborted";
  errorMessage: string | null;
  retries: number;
  rateLimitRemaining: number | null;
};

type ScheduledTask = (signal?: AbortSignal) => Promise<Response>;
type ScheduledItem = {
  task: ScheduledTask;
  resolve: (value: Response) => void;
  reject: (reason?: unknown) => void;
  signal?: AbortSignal;
};

type Scheduler = {
  queue: ScheduledItem[];
  running: boolean;
  inFlight: number;
  lastRunAt: number;
  blockedUntil: number;
  rateLimit: number | null;
  rateRemaining: number | null;
  rateResetAt: number | null;
  listeners: Set<(state: RateLimitStateSnapshot) => void>;
};

type ProxyCache = {
  hit: number;
  miss: number;
  bypass: number;
  unknown: number;
  policy: Record<string, number>;
  listeners: Set<(state: ProxyCacheSnapshot) => void>;
};

const scheduler: Scheduler = {
  queue: [],
  running: false,
  inFlight: 0,
  lastRunAt: 0,
  blockedUntil: 0,
  rateLimit: null,
  rateRemaining: null,
  rateResetAt: null,
  listeners: new Set(),
};
/**
 * Buffer circulaire du journal de requêtes (cf. `FetchLogEntry`).
 * Capé à `FETCH_LOG_CAPACITY` pour éviter toute fuite mémoire sur les
 * sessions longues ; les entrées les plus anciennes sont évincées en FIFO.
 */
const FETCH_LOG_CAPACITY = 80;
let fetchLogSeq = 0;
const fetchLog: FetchLogEntry[] = [];
const fetchLogListeners: Set<(log: readonly FetchLogEntry[]) => void> = new Set();

function pushFetchLog(entry: FetchLogEntry) {
  fetchLog.push(entry);
  if (fetchLog.length > FETCH_LOG_CAPACITY) fetchLog.shift();
  const snapshot: readonly FetchLogEntry[] = fetchLog.slice();
  fetchLogListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      /* listeners défensifs : on ne veut pas casser le transport */
    }
  });
}

export function getFetchLog(): readonly FetchLogEntry[] {
  return fetchLog.slice();
}

export function subscribeFetchLog(
  listener: (log: readonly FetchLogEntry[]) => void
): () => void {
  fetchLogListeners.add(listener);
  listener(fetchLog.slice());
  return () => {
    fetchLogListeners.delete(listener);
  };
}

export function resetFetchLog(): void {
  fetchLog.length = 0;
  fetchLogSeq = 0;
  const snapshot: readonly FetchLogEntry[] = fetchLog.slice();
  fetchLogListeners.forEach((listener) => {
    try {
      listener(snapshot);
    } catch {
      /* idem */
    }
  });
}

/**
 * Extrait le nom d'opération d'une requête GraphQL (ex. `query UserProfile(...)`
 * → `"UserProfile"`). Retombe sur `"anonymous"` pour les queries sans nom.
 * Volontairement tolérant aux espaces/retours à la ligne introduits par `gql`.
 */
function parseOperationName(query: string): string {
  const match = query.match(/^\s*(?:query|mutation|subscription)\s+(\w+)/);
  return match ? match[1] : "anonymous";
}

/**
 * Formate un objet de variables en chaîne courte (`k=v, k2=v2…`) adaptée
 * au panneau de debug. Les valeurs > 24 caractères sont tronquées, les
 * objets/arrays sont représentés par leur taille plutôt que leur contenu
 * pour éviter de polluer la ligne.
 */
function formatVariablesSummary(variables: Record<string, unknown>): string {
  const entries = Object.entries(variables);
  if (entries.length === 0) return "—";
  const parts: string[] = [];
  for (const [k, v] of entries) {
    let repr: string;
    if (v === null || v === undefined) repr = String(v);
    else if (Array.isArray(v)) repr = `Array(${v.length})`;
    else if (typeof v === "object") repr = `Object(${Object.keys(v).length})`;
    else repr = String(v);
    if (repr.length > 24) repr = `${repr.slice(0, 21)}…`;
    parts.push(`${k}=${repr}`);
  }
  const joined = parts.join(", ");
  return joined.length > 120 ? `${joined.slice(0, 117)}…` : joined;
}

const proxyCache: ProxyCache = {
  hit: 0,
  miss: 0,
  bypass: 0,
  unknown: 0,
  policy: {},
  listeners: new Set(),
};

export function getRateLimitState() {
  const now = Date.now();
  const blockedForMs = Math.max(0, scheduler.blockedUntil - now);
  const intervalMs = currentRequestIntervalMs();
  const queueDelayMs = scheduler.queue.length * intervalMs;
  const estimatedWaitMs = blockedForMs + queueDelayMs + (scheduler.inFlight > 0 ? intervalMs : 0);
  return {
    queued: scheduler.queue.length,
    inFlight: scheduler.inFlight,
    blockedForMs,
    estimatedWaitMs,
    rateLimit: scheduler.rateLimit,
    rateRemaining: scheduler.rateRemaining,
    rateResetAt: scheduler.rateResetAt,
    requestIntervalMs: intervalMs,
  };
}

function emitRateLimitState() {
  const state = getRateLimitState();
  scheduler.listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // Ignore listeners errors to keep transport resilient.
    }
  });
}

export function subscribeRateLimit(listener: (state: RateLimitStateSnapshot) => void) {
  scheduler.listeners.add(listener);
  listener(getRateLimitState());
  return () => scheduler.listeners.delete(listener);
}

export function getProxyCacheStats() {
  return {
    hit: proxyCache.hit,
    miss: proxyCache.miss,
    bypass: proxyCache.bypass,
    unknown: proxyCache.unknown,
    policy: { ...proxyCache.policy },
  };
}

function emitProxyCacheStats() {
  const state = getProxyCacheStats();
  proxyCache.listeners.forEach((listener) => {
    try {
      listener(state);
    } catch {
      // Keep transport resilient even with bad listeners.
    }
  });
}

export function subscribeProxyCache(listener: (state: ProxyCacheSnapshot) => void) {
  proxyCache.listeners.add(listener);
  listener(getProxyCacheStats());
  return () => proxyCache.listeners.delete(listener);
}

function applyProxyHeaders(res: Response) {
  const proxyState = String(res.headers.get("X-Proxy-Cache") || "").toUpperCase();
  const policy = String(res.headers.get("X-Proxy-Cache-Policy") || "unknown");
  if (proxyState === "HIT") proxyCache.hit += 1;
  else if (proxyState === "MISS") proxyCache.miss += 1;
  else if (proxyState === "BYPASS") proxyCache.bypass += 1;
  else proxyCache.unknown += 1;
  proxyCache.policy[policy] = (proxyCache.policy[policy] || 0) + 1;
  emitProxyCacheStats();
}

function parseHeaderInt(res: Response, name: string): number | null {
  const raw = res.headers.get(name);
  if (!raw) return null;
  const n = parseInt(raw, 10);
  return Number.isNaN(n) ? null : n;
}

function applyRateHeaders(res: Response) {
  const limit = parseHeaderInt(res, "X-RateLimit-Limit");
  const remaining = parseHeaderInt(res, "X-RateLimit-Remaining");
  const resetUnix = parseHeaderInt(res, "X-RateLimit-Reset");
  const retryAfter = parseHeaderInt(res, "Retry-After");
  const now = Date.now();

  if (limit !== null) scheduler.rateLimit = limit;
  if (remaining !== null) scheduler.rateRemaining = remaining;
  if (resetUnix !== null) {
    // Proxy providers may emit reset in seconds or milliseconds.
    // Normalize to epoch ms and drop absurd future values.
    const resetCandidateMs = resetUnix > 1_000_000_000_000 ? resetUnix : resetUnix * 1000;
    const maxReasonableFutureMs = now + 365 * 24 * 60 * 60 * 1000;
    scheduler.rateResetAt =
      resetCandidateMs > 0 && resetCandidateMs <= maxReasonableFutureMs ? resetCandidateMs : null;
  }

  const retryAfterUntil = retryAfter !== null ? now + retryAfter * 1000 : 0;
  const resetUntil = scheduler.rateResetAt || 0;
  if (res.status === 429 || (remaining !== null && remaining <= 0)) {
    scheduler.blockedUntil = Math.max(scheduler.blockedUntil, retryAfterUntil, resetUntil);
  }

  emitRateLimitState();
}

function enqueueScheduled(task: ScheduledTask, signal?: AbortSignal): Promise<Response> {
  return new Promise<Response>((resolve, reject) => {
    const item: ScheduledItem = { task, resolve, reject, signal };
    scheduler.queue.push(item);
    emitRateLimitState();
    runScheduler();
  });
}

async function runScheduler() {
  if (scheduler.running) return;
  scheduler.running = true;
  try {
    while (scheduler.queue.length > 0) {
      const item = scheduler.queue.shift();
      emitRateLimitState();
      if (!item) continue;
      if (item.signal?.aborted) {
        item.reject(new DOMException("Aborted", "AbortError"));
        continue;
      }

      const now = Date.now();
      const waitBlockedMs = Math.max(0, scheduler.blockedUntil - now);
      const waitIntervalMs = Math.max(0, scheduler.lastRunAt + currentRequestIntervalMs() - now);
      const waitMs = Math.max(waitBlockedMs, waitIntervalMs);
      if (waitMs > 0) {
        try {
          await sleep(waitMs, item.signal);
        } catch (err) {
          item.reject(err);
          continue;
        }
      }

      if (item.signal?.aborted) {
        item.reject(new DOMException("Aborted", "AbortError"));
        continue;
      }

      scheduler.inFlight += 1;
      scheduler.lastRunAt = Date.now();
      emitRateLimitState();
      try {
        const result = await item.task(item.signal);
        item.resolve(result);
      } catch (err) {
        item.reject(err);
      } finally {
        scheduler.inFlight = Math.max(0, scheduler.inFlight - 1);
        emitRateLimitState();
      }
    }
  } finally {
    scheduler.running = false;
    emitRateLimitState();
  }
}

function alBackoffMs(attempt: number, res: Response | null): number {
  let ms = Math.min(12000, 450 * Math.pow(2, attempt));
  if (res) {
    const ra = res.headers.get("Retry-After");
    if (ra) {
      const sec = parseInt(ra, 10);
      if (!Number.isNaN(sec)) ms = Math.max(ms, sec * 1000);
    }
  }
  return ms;
}

export type FetchALOptions = { maxRetries?: number; signal?: AbortSignal };

/**
 * Exécute une query GraphQL AniList avec rate-limit / retry / cache coordonnés.
 *
 * Le paramètre générique `T` permet aux appelants de taper la réponse à partir
 * des types générés par graphql-codegen (`src/types/anilistGraphql.ts`) :
 *
 * ```ts
 * import type { UserProfileQuery } from "../types/anilistGraphql";
 * const data = await fetchAL<UserProfileQuery>(USER_QUERY, { name });
 * ```
 *
 * On garde `Promise<T>` plutôt que `Promise<T | null>` car `json.data` peut
 * être `null` uniquement en cas d'erreur GraphQL, auquel cas on jette.
 */
export async function fetchAL<T = unknown>(
  query: string,
  variables: Record<string, unknown>,
  options: FetchALOptions = {}
): Promise<T> {
  const { maxRetries = AL_MAX_RETRIES, signal } = options;
  const operationName = parseOperationName(query);
  const variablesSummary = formatVariablesSummary(variables);
  const startedAt = Date.now();
  let retries = 0;
  let lastNetworkErr: unknown = null;

  /**
   * Publie une entrée dans le journal de requêtes. On centralise ici pour
   * garantir qu'une seule ligne est émise par appel `fetchAL`, quelle que
   * soit l'issue (succès, erreur réseau, GraphQL, abort).
   */
  const logFetch = (
    outcome: FetchLogEntry["outcome"],
    res: Response | null,
    errorMessage: string | null,
    responseBytes: number | null
  ): void => {
    const finishedAt = Date.now();
    const proxyCacheHeader = res
      ? String(res.headers.get("X-Proxy-Cache") || "").toUpperCase()
      : "";
    const proxyCacheValue: FetchLogEntry["proxyCache"] =
      proxyCacheHeader === "HIT" ||
      proxyCacheHeader === "MISS" ||
      proxyCacheHeader === "BYPASS" ||
      proxyCacheHeader === "UNKNOWN"
        ? (proxyCacheHeader as FetchLogEntry["proxyCache"])
        : res
          ? "UNKNOWN"
          : null;
    const proxyPolicy = res ? res.headers.get("X-Proxy-Cache-Policy") || null : null;
    const rateRemaining = res ? parseHeaderInt(res, "X-RateLimit-Remaining") : null;
    fetchLogSeq += 1;
    pushFetchLog({
      id: fetchLogSeq,
      startedAt,
      finishedAt,
      durationMs: finishedAt - startedAt,
      operationName,
      variablesSummary,
      responseBytes,
      httpStatus: res ? res.status : null,
      proxyCache: proxyCacheValue,
      proxyPolicy,
      outcome,
      errorMessage,
      retries,
      rateLimitRemaining: rateRemaining,
    });
  };

  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (attempt > 0) retries = attempt;
    if (signal?.aborted) {
      logFetch("aborted", null, "AbortError", null);
      throw new DOMException("Aborted", "AbortError");
    }
    let res: Response;
    try {
      res = await enqueueScheduled(
        (taskSignal) =>
          fetch(ANILIST_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json", Accept: "application/json" },
            body: JSON.stringify({ query, variables }),
            signal: taskSignal,
          }),
        signal
      );
      applyRateHeaders(res);
      applyProxyHeaders(res);
    } catch (e: unknown) {
      const err = e as { name?: string; message?: string };
      if (err?.name === "AbortError") {
        logFetch("aborted", null, err?.message || "AbortError", null);
        throw e;
      }
      lastNetworkErr = e;
      if (attempt >= maxRetries) {
        const msg = "Erreur reseau AniList (connexion ou proxy /api/anilist).";
        logFetch("error", null, err?.message || msg, null);
        throw new Error(msg, { cause: e });
      }
      await sleep(alBackoffMs(attempt, null), signal);
      continue;
    }

    if (!res.ok) {
      if (res.status === 429 && attempt < maxRetries) {
        const waitMs = Math.max(1000, scheduler.blockedUntil - Date.now());
        await sleep(waitMs, signal);
        continue;
      }
      /*
       * AniList renvoie un 403 (parfois 401) lorsque son API v2 est
       * temporairement désactivée ou mise en maintenance côté serveur. Aucun
       * retry ne va débloquer la situation : on remonte une erreur typée
       * pour permettre à l'UI d'afficher un message dédié.
       */
      if (res.status === 403 || res.status === 401) {
        logFetch("error", res, "AniList API disabled", null);
        throw new AniListApiDisabledError();
      }
      const retryable = res.status >= 500 && attempt < maxRetries;
      if (retryable) {
        await sleep(alBackoffMs(attempt, res), signal);
        continue;
      }
      const msg =
        res.status === 429
          ? "Rate limit AniList atteint, reessaie apres la fenetre de cooldown."
          : `HTTP ${res.status}`;
      logFetch("error", res, msg, null);
      throw new Error(msg);
    }

    /*
     * On lit la réponse en `text()` avant de parser : ça permet de mesurer
     * précisément la taille du payload (utile pour le dev panel) sans
     * impacter les performances de manière significative. Le parse JSON
     * reste manuel et gère proprement un corps invalide.
     */
    let rawText: string;
    try {
      rawText = await res.text();
    } catch {
      logFetch("error", res, "Reponse AniList invalide (lecture)", null);
      throw new Error("Reponse AniList invalide");
    }
    const responseBytes = rawText ? new Blob([rawText]).size : 0;
    let json: { data?: unknown; errors?: Array<{ message: string }> };
    try {
      json = rawText ? JSON.parse(rawText) : { data: null };
    } catch {
      logFetch("error", res, "Reponse AniList invalide (JSON)", responseBytes);
      throw new Error("Reponse AniList invalide");
    }
    if (json.errors) {
      const messages = json.errors.map((e) => e.message);
      /*
       * Certaines bascules côté AniList répondent en HTTP 200 avec un payload
       * GraphQL `{ errors: [{ message: "This API has been disabled" }] }`.
       * On détecte cette forme-là pour rattacher le même chemin UX que le 403.
       */
      const disabled = messages.some((m) =>
        /api\s+(?:has\s+been\s+)?disabled/i.test(String(m))
      );
      const combined = messages.join(", ");
      logFetch("error", res, combined, responseBytes);
      if (disabled) throw new AniListApiDisabledError(combined);
      throw new Error(combined);
    }
    logFetch("success", res, null, responseBytes);
    return json.data as T;
  }
  logFetch("error", null, "Erreur reseau AniList", null);
  throw lastNetworkErr || new Error("Erreur reseau AniList");
}

/**
 * Récupère en une seule requête les avatars de plusieurs utilisateurs AniList,
 * en utilisant les alias GraphQL (`u0: User(name: $n0) { … }`).
 *
 * Avantages par rapport à N requêtes séquentielles :
 *  - Un seul slot consommé dans le rate-limiter scheduler.
 *  - Un seul aller-retour réseau + proxy cache (le hash du body reste stable
 *    tant que la liste de noms triée ne change pas).
 *  - Latence utilisateur quasi équivalente à un avatar unique.
 *
 * Les doublons sont déduits, les noms vides ignorés, et l'ordre des paramètres
 * est trié pour que le cache proxy soit mutualisé entre appelants qui
 * demandent le même ensemble de noms.
 *
 * Retourne une map `pseudo → { large, medium } | null`. Les utilisateurs
 * inexistants renvoient `null` sans faire échouer les autres alias.
 */
export async function fetchUsersAvatarsBatch(
  names: readonly string[],
  options: FetchALOptions = {}
): Promise<Record<string, { large: string | null; medium: string | null } | null>> {
  const unique = Array.from(
    new Set(names.map((n) => String(n || "").trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));
  if (unique.length === 0) return {};

  const varDecls = unique.map((_, i) => `$n${i}: String!`).join(", ");
  const selections = unique
    .map((_, i) => `  u${i}: User(name: $n${i}) { name avatar { large medium } }`)
    .join("\n");
  const query = `query BatchUserAvatars(${varDecls}) {\n${selections}\n}`;

  const variables: Record<string, string> = {};
  unique.forEach((n, i) => {
    variables[`n${i}`] = n;
  });

  type AvatarNode = {
    name?: string;
    avatar?: { large?: string | null; medium?: string | null } | null;
  } | null;
  const data = await fetchAL<Record<string, AvatarNode>>(query, variables, options);

  const result: Record<string, { large: string | null; medium: string | null } | null> = {};
  unique.forEach((name, i) => {
    const node = data?.[`u${i}`] ?? null;
    if (!node || !node.avatar) {
      result[name] = null;
      return;
    }
    result[name] = {
      large: node.avatar.large ?? null,
      medium: node.avatar.medium ?? null,
    };
  });
  return result;
}

const getStartEndTsForYear = (y: number) => {
  const start = new Date(y, 0, 1, 0, 0, 0, 0).getTime() / 1000;
  const end = new Date(y + 1, 0, 1, 0, 0, 0, 0).getTime() / 1000;
  return { start, end };
};

export type FetchActivitiesOptions = {
  signal?: AbortSignal;
  pageMaxRetries?: number;
  sinceId?: number | null;
};

export async function fetchListActivitiesForYear(
  userId: number,
  type: "ANIME_LIST" | "MANGA_LIST",
  year: number,
  options: FetchActivitiesOptions = {}
): Promise<ListActivityItem[]> {
  const { signal, pageMaxRetries = 2, sinceId = null } = options;
  const stopAtId = Number(sinceId || 0);
  const allTime = year === 0;
  const { start } = allTime ? { start: 0 } : getStartEndTsForYear(year);
  const perPage = 50;
  let page = 1;
  let hasNextPage = true;
  const all: ListActivityItem[] = [];
  while (hasNextPage) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const data = await fetchAL<ListActivitiesQuery>(
      LIST_ACTIVITY_QUERY,
      { userId, type, page, perPage },
      { signal, maxRetries: pageMaxRetries }
    );
    const block = data?.Page;
    const items = (block?.activities || []).filter(
      (it): it is ListActivityItem => it != null
    );
    const freshItems =
      stopAtId > 0
        ? items.filter((item) => !("id" in item) || Number(item.id || 0) > stopAtId)
        : items;
    all.push(...freshItems);
    hasNextPage = Boolean(block?.pageInfo?.hasNextPage);
    if (stopAtId > 0 && items.some((item) => "id" in item && Number(item.id || 0) <= stopAtId)) {
      break;
    }
    const oldestInPage = items.reduce(
      (minTs: number, item) =>
        Math.min(
          minTs,
          "createdAt" in item && typeof item.createdAt === "number"
            ? item.createdAt
            : Number.MAX_SAFE_INTEGER
        ),
      Number.MAX_SAFE_INTEGER
    );
    if (!allTime && oldestInPage < start) break;
    page += 1;
    if (page > (allTime ? 400 : 80)) break;
    await sleep(280, signal);
  }
  return all;
}
