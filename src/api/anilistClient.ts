import { gql } from "./gql";
import type { ListActivitiesQuery } from "../types/anilistGraphql";

/** Élément d'activité retourné par `fetchListActivitiesForYear`. */
export type ListActivityItem = NonNullable<
  NonNullable<NonNullable<ListActivitiesQuery["Page"]>["activities"]>[number]
>;

const ANILIST_URL = "/api/anilist";
const AL_MAX_RETRIES = 2;
const REQUEST_INTERVAL_MS = 2200; // ~27 req/min, leaves safety margin under 30/min degraded limit.

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
        progressVolumes
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
          chapters
          volumes
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
          status
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
          season
          seasonYear
          startDate { year month day }
          episodes
          chapters
          volumes
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
          status
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

export const USER_QUERY = gql`
query UserProfile($name: String!) {
  User(name: $name) {
    id
    name
    avatar { large medium }
    bannerImage
    statistics {
      anime { count meanScore minutesWatched episodesWatched }
      manga { count meanScore chaptersRead volumesRead }
    }
  }
}`;

/** Requête légère pour avatars du menu raccourcis (évite de retélécharger stats + listes). */
export const USER_AVATAR_QUERY = gql`
query UserAvatar($name: String!) {
  User(name: $name) {
    name
    avatar { large medium }
  }
}`;

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
        media {
          id
          title { romaji english }
          coverImage { large medium }
          duration
          format
          countryOfOrigin
          episodes
          chapters
          averageScore
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
  const queueDelayMs = scheduler.queue.length * REQUEST_INTERVAL_MS;
  const estimatedWaitMs = blockedForMs + queueDelayMs + (scheduler.inFlight > 0 ? REQUEST_INTERVAL_MS : 0);
  return {
    queued: scheduler.queue.length,
    inFlight: scheduler.inFlight,
    blockedForMs,
    estimatedWaitMs,
    rateLimit: scheduler.rateLimit,
    rateRemaining: scheduler.rateRemaining,
    rateResetAt: scheduler.rateResetAt,
    requestIntervalMs: REQUEST_INTERVAL_MS,
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
      const waitIntervalMs = Math.max(0, scheduler.lastRunAt + REQUEST_INTERVAL_MS - now);
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
  let lastNetworkErr: unknown = null;
  for (let attempt = 0; attempt <= maxRetries; attempt += 1) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
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
      const err = e as { name?: string };
      if (err?.name === "AbortError") throw e;
      lastNetworkErr = e;
      if (attempt >= maxRetries) {
        throw new Error("Erreur reseau AniList (connexion ou proxy /api/anilist).", { cause: e });
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
      const retryable = res.status >= 500 && attempt < maxRetries;
      if (retryable) {
        await sleep(alBackoffMs(attempt, res), signal);
        continue;
      }
      throw new Error(
        res.status === 429
          ? "Rate limit AniList atteint, reessaie apres la fenetre de cooldown."
          : `HTTP ${res.status}`
      );
    }

    let json: { data?: unknown; errors?: Array<{ message: string }> };
    try {
      json = await res.json();
    } catch {
      throw new Error("Reponse AniList invalide");
    }
    if (json.errors) throw new Error(json.errors.map((e) => e.message).join(", "));
    return json.data as T;
  }
  throw lastNetworkErr || new Error("Erreur reseau AniList");
}

const getStartEndTsForYear = (y: number) => {
  const start = new Date(y, 0, 1, 0, 0, 0, 0).getTime() / 1000;
  const end = new Date(y + 1, 0, 1, 0, 0, 0, 0).getTime() / 1000;
  return { start, end };
};

export type FetchActivitiesOptions = { signal?: AbortSignal; pageMaxRetries?: number };

export async function fetchListActivitiesForYear(
  userId: number,
  type: "ANIME_LIST" | "MANGA_LIST",
  year: number,
  options: FetchActivitiesOptions = {}
): Promise<ListActivityItem[]> {
  const { signal, pageMaxRetries = 2 } = options;
  const { start } = getStartEndTsForYear(year);
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
    all.push(...items);
    hasNextPage = Boolean(block?.pageInfo?.hasNextPage);
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
    if (oldestInPage < start) break;
    page += 1;
    if (page > 80) break;
    await sleep(280, signal);
  }
  return all;
}
