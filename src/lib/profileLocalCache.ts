import { fetchListActivitiesForYear, sleep } from "../api/anilistClient";

export const CACHE_PREFIX = "aniliststat:v3";
/** Dernier pseudo recherché avec succès — préremplit la barre au chargement suivant (sans fetch automatique). */
export const LAST_PROFILE_SEARCH_KEY = `${CACHE_PREFIX}:lastProfileSearch`;
export const LEGACY_CACHE_PREFIXES = ["aniliststat:v1", "aniliststat:v2"];
export const PROFILE_USER_TTL_MS = 24 * 60 * 60 * 1000;
export const PROFILE_LIST_TTL_MS = 6 * 60 * 60 * 1000;
export const PROFILE_SWR_STALE_MS = 15 * 60 * 1000;
export const ACTIVITY_SWR_STALE_MS = 10 * 60 * 1000;
export const ACTIVITY_CURRENT_YEAR_TTL_MS = 60 * 60 * 1000;
export const ACTIVITY_PAST_YEAR_TTL_MS = 24 * 60 * 60 * 1000;
export const ACTIVITY_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
export const ACTIVITY_MAX_AUTO_RETRY = 3;
export const CACHE_MAX_ENTRIES = 120;
export const IS_DEV_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";



export function devLog(...args) {
  if (IS_DEV_LOCAL) console.info("[AniListStat cache]", ...args);
}

export function safeReadCacheMeta(key, staleAfterMs = null) {
  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const expiresAt = Number(parsed.expiresAt || 0);
    if (expiresAt && Date.now() > expiresAt) {
      window.localStorage.removeItem(key);
      return null;
    }
    const now = Date.now();
    const writtenAt = Number(parsed.writtenAt || 0);
    const staleAt = staleAfterMs ? (writtenAt ? writtenAt + staleAfterMs : 0) : 0;
    const isStale = staleAt > 0 ? now > staleAt : false;
    parsed.lastAccessAt = now;
    window.localStorage.setItem(key, JSON.stringify(parsed));
    return {
      value: parsed.value ?? null,
      expiresAt,
      isStale,
      writtenAt: writtenAt || now,
      lastAccessAt: now,
    };
  } catch {
    return null;
  }
}

export function safeReadCache(key, staleAfterMs = null) {
  const meta = safeReadCacheMeta(key, staleAfterMs);
  return meta ? meta.value : null;
}

export function safeWriteCache(key, value, ttlMs) {
  try {
    const payload = {
      writtenAt: Date.now(),
      lastAccessAt: Date.now(),
      expiresAt: Date.now() + ttlMs,
      value,
    };
    window.localStorage.setItem(key, JSON.stringify(payload));
    runCacheLruCleanup();
  } catch {
    // Ignore quota/serialization errors to keep app functional.
  }
}

export function runCacheLruCleanup() {
  try {
    const entries = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (!key || !key.startsWith(CACHE_PREFIX)) continue;
      if (key.endsWith(":migration:done")) continue;
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw) continue;
        const parsed = JSON.parse(raw);
        const lastAccessAt = Number(parsed?.lastAccessAt || 0);
        const writtenAt = Number(parsed?.writtenAt || 0);
        entries.push({ key, ts: lastAccessAt || writtenAt || 0 });
      } catch {
        // ignore malformed cache row
      }
    }
    if (entries.length <= CACHE_MAX_ENTRIES) return;
    entries.sort((a, b) => a.ts - b.ts);
    const toDelete = entries.length - CACHE_MAX_ENTRIES;
    for (let i = 0; i < toDelete; i += 1) {
      window.localStorage.removeItem(entries[i].key);
    }
  } catch {
    // ignore cleanup failures
  }
}

export const normalizeName = (name) => String(name || "").trim().toLowerCase();

/** Filtre les pistes locales PROFILE_QUICK_SUGGESTIONS (sans API). */
export function filterQuickProfileSuggestions(inputRaw, list) {
  if (!list || list.length === 0) return [];
  const q = normalizeName(inputRaw);
  /* Sans saisie : pas de menu (évite des requêtes avatar sur tous les raccourcis au focus). */
  const rows = !q
    ? []
    : list.filter((p) => {
        const n = normalizeName(p.userName);
        const lbl = normalizeName(p.label || "");
        return n.startsWith(q) || n.includes(q) || (lbl && lbl.includes(q));
      });
  return rows.slice(0, 12);
}
export const profileUserCacheKey = (name) => `${CACHE_PREFIX}:profile:user:${normalizeName(name)}`;
/* Suffixe : invalider les listes mises en cache avant l’ajout de media.countryOfOrigin. */
export const profileAnimeCacheKey = (name) => `${CACHE_PREFIX}:profile:anime:${normalizeName(name)}:cov3`;
export const profileMangaCacheKey = (name) => `${CACHE_PREFIX}:profile:manga:${normalizeName(name)}:cov3`;
export const QUICKPICK_AVATAR_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const quickPickAvatarCacheKey = (name) => `${CACHE_PREFIX}:quickpick:avatar:${normalizeName(name)}`;

/** Avatar pour raccourcis : cache profil complet si déjà visité, sinon cache URL léger. */
export function readQuickPickAvatarStored(userName) {
  const key = normalizeName(userName);
  if (!key) return null;
  const prof = safeReadCache(profileUserCacheKey(key));
  const fromProf = prof?.avatar?.large || prof?.avatar?.medium;
  if (fromProf) return fromProf;
  const raw = safeReadCache(quickPickAvatarCacheKey(key));
  return typeof raw === "string" && /^https?:\/\//.test(raw) ? raw : null;
}
export const legacyProfileCacheKey = (name) => `${LEGACY_CACHE_PREFIXES[0]}:profile:${normalizeName(name)}`;
export const activityCacheKey = (userId, type, year) => `${CACHE_PREFIX}:acts:${userId}:${type}:${year}`;

export function getActivityTtlMs(yearValue) {
  const currentYear = new Date().getFullYear();
  return yearValue === currentYear ? ACTIVITY_CURRENT_YEAR_TTL_MS : ACTIVITY_PAST_YEAR_TTL_MS;
}

export function runCacheMigrationOnce() {
  const marker = `${CACHE_PREFIX}:migration:done`;
  try {
    if (window.localStorage.getItem(marker) === "1") return;
    for (let i = window.localStorage.length - 1; i >= 0; i -= 1) {
      const key = window.localStorage.key(i);
      if (!key) continue;
      if (LEGACY_CACHE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        window.localStorage.removeItem(key);
      }
    }
    window.localStorage.setItem(marker, "1");
  } catch {
    // Keep app functional even if migration cannot run.
  }
}

export async function fetchActivitiesWithRetry(userId, type, year, signal) {
  const maxExtraRetries = 2;
  let attempt = 0;
  while (true) {
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    try {
      return await fetchListActivitiesForYear(userId, type, year, { signal });
    } catch (err) {
      if (err?.name === "AbortError") throw err;
      const msg = String(err?.message || "");
      const retryable = msg.includes("Rate limit") || msg.includes("429");
      if (!retryable || attempt >= maxExtraRetries) throw err;
      attempt += 1;
      await sleep(1500 * Math.pow(2, attempt), signal);
    }
  }
}

export function readLastProfileSearchInput() {
  try {
    const raw = window.localStorage.getItem(LAST_PROFILE_SEARCH_KEY);
    return typeof raw === "string" && raw.trim() ? raw.trim() : "";
  } catch {
    return "";
  }
}

export function rememberLastProfileSearch(nameTrimmed) {
  try {
    if (nameTrimmed) window.localStorage.setItem(LAST_PROFILE_SEARCH_KEY, nameTrimmed);
  } catch {
    /* ignore */
  }
}
