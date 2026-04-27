import { useCallback, useEffect } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { sleep } from "../api/anilistClient";
import {
  ACTIVITY_SWR_STALE_MS,
  ACTIVITY_RATE_LIMIT_COOLDOWN_MS,
  ACTIVITY_MAX_AUTO_RETRY,
  devLog,
  safeReadCacheMeta,
  safeWriteCache,
  activityCacheKey,
  getActivityTtlMs,
  fetchActivitiesWithRetry,
} from "../lib/profileLocalCache";
import type { ActivityCacheByYear, ActivityItem, AniListUser } from "../types/domain";
import {
  enrichActivitiesWithMediaBits,
  type ActivityMediaBits,
} from "../lib/activityEnrichment";
import { recordActivityYearSample } from "../lib/activityFetchStats";

const ALL_TIME_YEAR = 0;
const isFetchableActivityYear = (value: number) => value === ALL_TIME_YEAR || value >= 1970;
const activityYearLabel = (value: number) => (value === ALL_TIME_YEAR ? "All Time" : String(value));

export type ActivityLoaderRefs = {
  latestUserIdRef: MutableRefObject<number | null>;
  activityInFlightRef: MutableRefObject<Map<string, Promise<ActivityItem[]>>>;
  activityCooldownRef: MutableRefObject<Map<string, number>>;
  activityRetryCountRef: MutableRefObject<Map<string, number>>;
  activityYearsInFlightRef: MutableRefObject<Set<number>>;
  activityMissLogRef: MutableRefObject<Set<string>>;
  /**
   * Index `mediaId → bits` mis à jour par le parent dès que les listes
   * anime/manga sont hydratées. Utilisé pour enrichir les activités fetchées
   * avec la payload allégée (`media { id }`). Si la ref est vide au moment
   * d'un fetch (fenêtre rare : fetch idle d'une année adjacente déclenché
   * avant que l'index soit reconstruit), les activités restent « slim » et
   * seront filtrées par le pipeline stats (pas de régression, juste un cache
   * moins informatif pour cette année-là — régénérable au prochain fetch).
   */
  mediaBitsByIdRef: MutableRefObject<Map<number, ActivityMediaBits>>;
};

export type ActivityYearsLoaderParams = {
  loaded: boolean;
  user: AniListUser | null;
  year: number;
  month: number;
  years: number[];
  animeActivityCache: ActivityCacheByYear;
  mangaActivityCache: ActivityCacheByYear;
  setAnimeActivityCache: Dispatch<SetStateAction<ActivityCacheByYear>>;
  setMangaActivityCache: Dispatch<SetStateAction<ActivityCacheByYear>>;
  setAnimeActivities: Dispatch<SetStateAction<ActivityItem[]>>;
  setMangaActivities: Dispatch<SetStateAction<ActivityItem[]>>;
  setLoadingActivities: Dispatch<SetStateAction<boolean>>;
  setActivityLoadingMessage: Dispatch<SetStateAction<string>>;
  setActivityWarning: Dispatch<SetStateAction<string | null>>;
  setError: Dispatch<SetStateAction<unknown>>;
  setResource: (key: string, status: string, error?: string | null) => void;
  metricInc: (field: string, amount?: number) => void;
  refs: ActivityLoaderRefs;
};

/**
 * Chargement orchestré des activités AniList par année (ep. vus, chapitres
 * lus) avec cache SWR, gestion du rate-limit et pré-chargement pour la
 * comparaison N-1.
 *
 * Contrat de base :
 *  - Pour chaque changement de période (`year`, `month`), on s'assure que
 *    l'année courante **et** l'année précédente (pour le mode « comparer »)
 *    sont présentes dans `animeActivityCache` / `mangaActivityCache`.
 *  - Les activités sont stockées par `(userId, ANIME_LIST|MANGA_LIST, year)`
 *    en localStorage (TTL variable : court pour l'année en cours, long pour
 *    les années closes via `getActivityTtlMs`).
 *  - Les données périmées (> `ACTIVITY_SWR_STALE_MS`) sont retournées
 *    immédiatement depuis le cache, puis rafraîchies en arrière-plan.
 *
 * Robustesse face au rate-limit AniList (lourd sur cet endpoint) :
 *  - `activityInFlightRef` : déduplication des requêtes concurrentes (même
 *    année pour le même profil → une seule requête partagée).
 *  - `activityCooldownRef` : après un 429, on interdit un retry pour
 *    `ACTIVITY_RATE_LIMIT_COOLDOWN_MS` afin d'éviter un ban temporaire.
 *  - `activityRetryCountRef` : jusqu'à `ACTIVITY_MAX_AUTO_RETRY` tentatives
 *    automatiques sur erreurs transitoires ; au-delà, on remonte l'erreur
 *    à l'utilisateur (banner d'avertissement).
 *  - `activityYearsInFlightRef` : empêche de reprogrammer un effet pour une
 *    année dont le fetch est déjà en vol.
 *  - `activityMissLogRef` : évite de repousser des warnings bruyants pour
 *    la même combinaison année × user déjà signalée.
 *
 * Toutes les écritures dans les setters sont guardées par un check
 * `latestUserIdRef.current !== uid` : si l'utilisateur a changé de profil
 * entre-temps, les réponses en vol sont ignorées pour ne pas polluer le
 * cache du nouveau profil avec des données de l'ancien.
 */
export function useActivityYearsLoader(p: ActivityYearsLoaderParams) {
  const {
    loaded,
    user,
    year,
    month,
    years,
    animeActivityCache,
    mangaActivityCache,
    setAnimeActivityCache,
    setMangaActivityCache,
    setAnimeActivities,
    setMangaActivities,
    setLoadingActivities,
    setActivityLoadingMessage,
    setActivityWarning,
    setError,
    setResource,
    metricInc,
    refs,
  } = p;

  const {
    latestUserIdRef,
    activityInFlightRef,
    activityCooldownRef,
    activityRetryCountRef,
    activityYearsInFlightRef,
    activityMissLogRef,
    mediaBitsByIdRef,
  } = refs;

  const prefetchYearActivities = useCallback(
    async (targetYear: number, ownerId: number) => {
      const uid = ownerId;
      if (!uid || !isFetchableActivityYear(targetYear)) return;
      const aKey = `activity:${uid}:ANIME_LIST:${targetYear}`;
      const mKey = `activity:${uid}:MANGA_LIST:${targetYear}`;
      try {
        const fetchOne = async (type: "ANIME_LIST" | "MANGA_LIST") => {
          const key = `activity:${uid}:${type}:${targetYear}`;
          let req = activityInFlightRef.current.get(key);
          if (!req) {
            setResource(key, "loading");
            req = fetchActivitiesWithRetry(uid, type, targetYear, undefined);
            activityInFlightRef.current.set(key, req);
          }
          try {
            return await req;
          } finally {
            activityInFlightRef.current.delete(key);
          }
        };
        const aActsRaw = await fetchOne("ANIME_LIST");
        const mActsRaw = await fetchOne("MANGA_LIST");
        if (latestUserIdRef.current !== uid) return;
        // Enrichit avec les métadonnées media (durée, format…) issues des
        // listes déjà chargées : la query a été allégée à `media { id }`.
        const mediaBits = mediaBitsByIdRef.current;
        const aActs = enrichActivitiesWithMediaBits(aActsRaw, mediaBits);
        const mActs = enrichActivitiesWithMediaBits(mActsRaw, mediaBits);
        setAnimeActivityCache((prev) => ({ ...prev, [targetYear]: aActs }));
        setMangaActivityCache((prev) => ({ ...prev, [targetYear]: mActs }));
        safeWriteCache(activityCacheKey(uid, "ANIME_LIST", targetYear), aActs, getActivityTtlMs(targetYear));
        safeWriteCache(activityCacheKey(uid, "MANGA_LIST", targetYear), mActs, getActivityTtlMs(targetYear));
        setResource(aKey, "success");
        setResource(mKey, "success");
        metricInc("cacheWrite", 2);
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError") return;
        if (latestUserIdRef.current !== uid) return;
        const msg = e?.message || "Erreur activite";
        setResource(aKey, "error", msg);
        setResource(mKey, "error", msg);
        if (String(msg).includes("Rate limit") || String(msg).includes("429")) metricInc("rateLimitErrors");
      }
    },
    [
      activityInFlightRef,
      latestUserIdRef,
      mediaBitsByIdRef,
      metricInc,
      setAnimeActivityCache,
      setMangaActivityCache,
      setResource,
    ]
  );

  const retryYearNow = useCallback(
    (targetYear: number) => {
      if (!user?.id) return;
      if (!isFetchableActivityYear(targetYear)) return;
      const aKey = `activity:${user.id}:ANIME_LIST:${targetYear}`;
      const mKey = `activity:${user.id}:MANGA_LIST:${targetYear}`;
      activityCooldownRef.current.delete(aKey);
      activityCooldownRef.current.delete(mKey);
      activityRetryCountRef.current.set(aKey, 0);
      activityRetryCountRef.current.set(mKey, 0);
      setActivityWarning(null);
      setMangaActivityCache((prev) => {
        if (!(targetYear in prev)) return prev;
        const next = { ...prev };
        delete next[targetYear];
        return next;
      });
      setAnimeActivityCache((prev) => {
        if (!(targetYear in prev)) return prev;
        const next = { ...prev };
        delete next[targetYear];
        return next;
      });
    },
    [
      user?.id,
      activityCooldownRef,
      activityRetryCountRef,
      setActivityWarning,
      setMangaActivityCache,
      setAnimeActivityCache,
    ]
  );

  const handleRetryComparisonNow = useCallback(() => {
    if (year === ALL_TIME_YEAR) return;
    const compareYear = month === 0 || month === 1 ? year - 1 : null;
    if (!compareYear || compareYear < 1970) return;
    retryYearNow(compareYear);
  }, [month, retryYearNow, year]);

  useEffect(() => {
    if (!loaded || !user?.id) return;
    const ownerId = user.id;

    const yearsNeeded = new Set([year]);
    if (year !== ALL_TIME_YEAR && (month === 0 || month === 1)) yearsNeeded.add(year - 1);
    const scopeYears = [...yearsNeeded].filter(isFetchableActivityYear);
    scopeYears.forEach((y) => {
      if (animeActivityCache[y] && mangaActivityCache[y]) {
        activityYearsInFlightRef.current.delete(y);
      }
    });
    const inFlightScopeYears = scopeYears.filter((y) => activityYearsInFlightRef.current.has(y));

    const missing: number[] = [];
    const staleYears = new Set<number>();
    let blockedByCooldown = 0;
    [...yearsNeeded].forEach((y) => {
      if (!isFetchableActivityYear(y)) return;
      const currentYear = new Date().getFullYear();
      // Current-year activities can change frequently during active reading/watching sessions.
      // Keep cache-as-fast-path, but force near-immediate background revalidation.
      const staleMs = y === currentYear ? 1 : ACTIVITY_SWR_STALE_MS;
      const hasAnimeMem = Boolean(animeActivityCache[y]?.length);
      const hasMangaMem = Boolean(mangaActivityCache[y]?.length);
      const cachedAnimeMeta = hasAnimeMem ? null : safeReadCacheMeta(activityCacheKey(ownerId, "ANIME_LIST", y), staleMs);
      const cachedMangaMeta = hasMangaMem ? null : safeReadCacheMeta(activityCacheKey(ownerId, "MANGA_LIST", y), staleMs);
      const cachedAnime = cachedAnimeMeta?.value ?? null;
      const cachedManga = cachedMangaMeta?.value ?? null;
      if (!hasAnimeMem) {
        if (cachedAnime) {
          devLog("activity hit", `ANIME_LIST:${y}`);
        } else {
          const missKey = `ANIME_LIST:${y}`;
          if (!activityMissLogRef.current.has(missKey)) {
            devLog("activity miss", missKey);
            activityMissLogRef.current.add(missKey);
          }
        }
      }
      if (!hasMangaMem) {
        if (cachedManga) {
          devLog("activity hit", `MANGA_LIST:${y}`);
        } else {
          const missKey = `MANGA_LIST:${y}`;
          if (!activityMissLogRef.current.has(missKey)) {
            devLog("activity miss", missKey);
            activityMissLogRef.current.add(missKey);
          }
        }
      }
      if (!hasAnimeMem) metricInc(cachedAnime ? "cacheHit" : "cacheMiss");
      if (!hasMangaMem) metricInc(cachedManga ? "cacheHit" : "cacheMiss");
      if ((cachedAnimeMeta?.isStale || cachedMangaMeta?.isStale) && (cachedAnime || cachedManga)) {
        staleYears.add(y);
      }
      if (hasAnimeMem || cachedAnime) setResource(`activity:${ownerId}:ANIME_LIST:${y}`, "success");
      if (hasMangaMem || cachedManga) setResource(`activity:${ownerId}:MANGA_LIST:${y}`, "success");
      if (!hasAnimeMem) {
        if (cachedAnime) {
          setAnimeActivityCache((prev) => {
            if (latestUserIdRef.current !== ownerId) return prev;
            return prev[y] ? prev : { ...prev, [y]: cachedAnime };
          });
        }
      }
      if (!hasMangaMem) {
        if (cachedManga) {
          setMangaActivityCache((prev) => {
            if (latestUserIdRef.current !== ownerId) return prev;
            return prev[y] ? prev : { ...prev, [y]: cachedManga };
          });
        }
      }
      const willHaveAnime = hasAnimeMem || Boolean(cachedAnime);
      const willHaveManga = hasMangaMem || Boolean(cachedManga);
      if (!willHaveAnime || !willHaveManga) {
        if (activityYearsInFlightRef.current.has(y)) return;
        const animeCoolKey = `activity:${ownerId}:ANIME_LIST:${y}`;
        const mangaCoolKey = `activity:${ownerId}:MANGA_LIST:${y}`;
        const now = Date.now();
        const animeCooldownUntil = activityCooldownRef.current.get(animeCoolKey) || 0;
        const mangaCooldownUntil = activityCooldownRef.current.get(mangaCoolKey) || 0;
        if (animeCooldownUntil > now || mangaCooldownUntil > now) {
          blockedByCooldown += 1;
          return;
        }
        missing.push(y);
      }
    });

    if (missing.length === 0) {
      if (
        latestUserIdRef.current === ownerId &&
        animeActivityCache[year] &&
        mangaActivityCache[year]
      ) {
        setAnimeActivities(animeActivityCache[year]);
        setMangaActivities(mangaActivityCache[year]);
      }
      if (inFlightScopeYears.length === 0) {
        setLoadingActivities(false);
      } else {
        setLoadingActivities(true);
        const inflightLabel = [...new Set(inFlightScopeYears)]
          .sort((a, b) => b - a)
          .map(activityYearLabel)
          .join(", ");
        setActivityLoadingMessage(`Chargement des activites ${inflightLabel}...`);
      }
      if (blockedByCooldown > 0) {
        setActivityWarning(
          "Certaines annees de comparaison sont temporairement en pause (rate limit). Reprise automatique apres cooldown."
        );
      } else {
        setActivityWarning(null);
      }
      if (staleYears.size > 0) {
        const staleLabel = [...staleYears].sort((a, b) => b - a).map(activityYearLabel).join(", ");
        setActivityWarning(`Actualisation en arriere-plan des activites ${staleLabel}...`);
        const idle = window.requestIdleCallback
          ? window.requestIdleCallback
          : (cb: () => void) => setTimeout(cb, 1200);
        idle(() => {
          staleYears.forEach((yy) => prefetchYearActivities(yy, ownerId));
        });
      }
      return;
    }

    missing.sort((a, b) => {
      if (a === year) return -1;
      if (b === year) return 1;
      return b - a;
    });

    const actionableMissing = missing.filter((yy) => !activityYearsInFlightRef.current.has(yy));
    const yearsForMessage = actionableMissing.length > 0 ? actionableMissing : missing;
    const compareYear = year === ALL_TIME_YEAR ? null : month === 0 || month === 1 ? year - 1 : null;
    const needsCurrent = missing.includes(year);
    const needsCompareOnly =
      !needsCurrent &&
      compareYear !== null &&
      yearsForMessage.length === 1 &&
      yearsForMessage[0] === compareYear;
    if (needsCompareOnly) {
      setActivityLoadingMessage(`Chargement de l'annee de comparaison ${compareYear}...`);
    } else {
      const yearsLabel = [...new Set(yearsForMessage)]
        .sort((a, b) => b - a)
        .map(activityYearLabel)
        .join(", ");
      if (yearsLabel) {
        setActivityLoadingMessage(
          year === ALL_TIME_YEAR
            ? "Consolidation All Time : fetch complet de l'historique AniList..."
            : `Chargement des activites ${yearsLabel}...`
        );
      } else {
        setActivityLoadingMessage("Chargement des activites...");
      }
    }

    if (actionableMissing.length === 0) {
      setLoadingActivities(inFlightScopeYears.length > 0 || missing.length > 0);
      return;
    }

    let cancelled = false;
    const activityAbortController = new AbortController();
    setError(null);
    setActivityWarning(null);
    setLoadingActivities(true);
    (async () => {
      try {
        for (const yf of actionableMissing) {
          if (cancelled) return;
          if (activityYearsInFlightRef.current.has(yf)) continue;
          activityYearsInFlightRef.current.add(yf);
          const yearStartedAt = Date.now();
          try {
            const fetchActivity = async (type: "ANIME_LIST" | "MANGA_LIST") => {
              const key = `activity:${ownerId}:${type}:${yf}`;
              setResource(key, "loading");
              let req = activityInFlightRef.current.get(key);
              if (!req) {
                req = fetchActivitiesWithRetry(ownerId, type, yf, activityAbortController.signal);
                activityInFlightRef.current.set(key, req);
              } else {
                devLog("activity dedup", `${type}:${yf}`);
              }
              try {
                const data = await req;
                if (latestUserIdRef.current !== ownerId) throw new DOMException("Aborted", "AbortError");
                setResource(key, "success");
                return data;
              } catch (err: unknown) {
                const er = err as { name?: string; message?: string };
                if (er?.name === "AbortError") throw err;
                if (latestUserIdRef.current !== ownerId) throw new DOMException("Aborted", "AbortError");
                setResource(key, "error", er.message || "Erreur activite");
                throw err;
              } finally {
                activityInFlightRef.current.delete(key);
              }
            };

            const aActsRaw = await fetchActivity("ANIME_LIST");
            await sleep(300, activityAbortController.signal);
            const mActsRaw = await fetchActivity("MANGA_LIST");
            if (cancelled) return;
            if (latestUserIdRef.current !== ownerId) continue;
            // Enrichit avec les métadonnées media (durée, format…) issues
            // des listes chargées en mémoire : la query a été allégée à
            // `media { id }` pour réduire le payload.
            const mediaBits = mediaBitsByIdRef.current;
            const aActs = enrichActivitiesWithMediaBits(aActsRaw, mediaBits);
            const mActs = enrichActivitiesWithMediaBits(mActsRaw, mediaBits);
            setAnimeActivityCache((prev) => ({ ...prev, [yf]: aActs }));
            setMangaActivityCache((prev) => ({ ...prev, [yf]: mActs }));
            safeWriteCache(activityCacheKey(ownerId, "ANIME_LIST", yf), aActs, getActivityTtlMs(yf));
            safeWriteCache(activityCacheKey(ownerId, "MANGA_LIST", yf), mActs, getActivityTtlMs(yf));
            metricInc("cacheWrite", 2);
            devLog("activity write", `ANIME_LIST:${yf}`);
            devLog("activity write", `MANGA_LIST:${yf}`);
            activityMissLogRef.current.delete(`ANIME_LIST:${yf}`);
            activityMissLogRef.current.delete(`MANGA_LIST:${yf}`);
            activityRetryCountRef.current.delete(`activity:${ownerId}:ANIME_LIST:${yf}`);
            activityRetryCountRef.current.delete(`activity:${ownerId}:MANGA_LIST:${yf}`);
            activityCooldownRef.current.delete(`activity:${ownerId}:ANIME_LIST:${yf}`);
            activityCooldownRef.current.delete(`activity:${ownerId}:MANGA_LIST:${yf}`);
            /*
             * Enregistre la durée observée pour cette année.
             * `pagesFetched` est approximé à partir du nombre d'items reçus
             * (50 par page AniList) : imprécis sur la dernière page mais
             * suffisant pour l'affichage DevPanel / les projections d'ETA.
             */
            const pagesFetched =
              Math.ceil(aActsRaw.length / 50) + Math.ceil(mActsRaw.length / 50);
            recordActivityYearSample(Date.now() - yearStartedAt, pagesFetched);
          } catch (err: unknown) {
            const er = err as { name?: string; message?: string };
            if (er?.name === "AbortError") return;
            if (!cancelled && latestUserIdRef.current === ownerId) {
              const message = er.message || "Erreur lors du chargement des activites";
              const isRateLimit = String(message).includes("Rate limit") || String(message).includes("429");
              if (isRateLimit) metricInc("rateLimitErrors");
              const animeFailKey = `activity:${ownerId}:ANIME_LIST:${yf}`;
              const mangaFailKey = `activity:${ownerId}:MANGA_LIST:${yf}`;
              if (isRateLimit) {
                const prevAnimeCount = activityRetryCountRef.current.get(animeFailKey) || 0;
                const prevMangaCount = activityRetryCountRef.current.get(mangaFailKey) || 0;
                const nextCount = Math.max(prevAnimeCount, prevMangaCount) + 1;
                activityRetryCountRef.current.set(animeFailKey, nextCount);
                activityRetryCountRef.current.set(mangaFailKey, nextCount);
                const cooldown = ACTIVITY_RATE_LIMIT_COOLDOWN_MS * nextCount;
                activityCooldownRef.current.set(animeFailKey, Date.now() + cooldown);
                activityCooldownRef.current.set(mangaFailKey, Date.now() + cooldown);
              }
              if (yf === year) {
                setError(message);
              } else {
                setActivityWarning(`Comparaison ${yf} indisponible pour le moment (${message}).`);
              }
              const retryCount = activityRetryCountRef.current.get(animeFailKey) || 0;
              if (isRateLimit && retryCount >= ACTIVITY_MAX_AUTO_RETRY) {
                setActivityWarning(
                  `Comparaison ${yf} en pause apres plusieurs rate limits. Reessaie en changeant de periode ou dans quelques minutes.`
                );
              }
            }
            continue;
          } finally {
            activityYearsInFlightRef.current.delete(yf);
          }
        }
      } finally {
        if (!cancelled) setLoadingActivities(false);
      }
    })();

    return () => {
      cancelled = true;
      activityAbortController.abort();
    };
  }, [
    loaded,
    user?.id,
    year,
    month,
    years,
    animeActivityCache,
    mangaActivityCache,
    mediaBitsByIdRef,
    metricInc,
    prefetchYearActivities,
    setResource,
    setAnimeActivityCache,
    setMangaActivityCache,
    setAnimeActivities,
    setMangaActivities,
    setLoadingActivities,
    setActivityLoadingMessage,
    setActivityWarning,
    setError,
    activityYearsInFlightRef,
    activityMissLogRef,
    activityCooldownRef,
    activityRetryCountRef,
    latestUserIdRef,
    activityInFlightRef,
  ]);

  useEffect(() => {
    if (!user?.id) return;
    if (latestUserIdRef.current !== user.id) return;
    if (animeActivityCache[year] && mangaActivityCache[year]) {
      setAnimeActivities(animeActivityCache[year]);
      setMangaActivities(mangaActivityCache[year]);
    }
  }, [year, animeActivityCache, mangaActivityCache, user?.id, latestUserIdRef, setAnimeActivities, setMangaActivities]);

  useEffect(() => {
    if (!user?.id || !loaded) return undefined;
    const ownerId = user.id;
    if (year === ALL_TIME_YEAR) return undefined;
    const candidates = [year - 1, year + 1].filter((y) => years.includes(y) && y >= 1970);
    if (candidates.length === 0) return undefined;
    const idle: (cb: () => void) => number = window.requestIdleCallback
      ? (cb) => window.requestIdleCallback(cb)
      : (cb) => window.setTimeout(cb, 1800);
    const cancelIdle: (id: number) => void = window.cancelIdleCallback
      ? (id) => window.cancelIdleCallback(id)
      : (id) => window.clearTimeout(id);
    const idleId = idle(() => {
      candidates.forEach((y) => {
        if (!animeActivityCache[y] || !mangaActivityCache[y]) prefetchYearActivities(y, ownerId);
      });
    });
    return () => cancelIdle(idleId);
  }, [
    animeActivityCache,
    loaded,
    mangaActivityCache,
    prefetchYearActivities,
    user?.id,
    year,
    years,
  ]);

  return {
    prefetchYearActivities,
    retryYearNow,
    handleRetryComparisonNow,
  };
}
