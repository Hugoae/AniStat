import { useCallback, useEffect, useRef } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { devLog, fetchActivitiesWithRetry } from "../lib/profileLocalCache";
import type { ActivityCacheByYear, ActivityItem, AniListUser } from "../types/domain";
import {
  enrichActivitiesWithMediaBits,
  type ActivityMediaBits,
} from "../lib/activityEnrichment";
import {
  getActivities,
  getLatestActivityId,
  recordSyncRun,
  saveActivities,
  updateActivitySyncState,
} from "../services/supabaseService";

const ALL_TIME_YEAR = 0;
const isFetchableActivityYear = (value: number) => value === ALL_TIME_YEAR || value >= 1970;
const activityYearLabel = (value: number) => (value === ALL_TIME_YEAR ? "All Time" : String(value));
type ActivitySnapshotType = "ANIME_LIST" | "MANGA_LIST";

function archiveActivitiesToSupabase(
  userId: number,
  activityType: ActivitySnapshotType,
  activities: ActivityItem[]
) {
  if (!userId || activities.length === 0) return;
  void (async () => {
    try {
      await saveActivities(userId, activityType, activities);
      await updateActivitySyncState(userId, activityType, activities);
      devLog("supabase activities archive", `${activityType}:${activities.length}`);
    } catch (err: unknown) {
      const e = err as { message?: string };
      devLog("supabase activities archive failed", activityType, e?.message || err);
    }
  })();
}

const supabaseActivityKey = (userId: number, activityType: ActivitySnapshotType, year: number) =>
  `${userId}:${activityType}:${year}`;
const shouldAutoRefreshYear = (targetYear: number) =>
  targetYear === ALL_TIME_YEAR || targetYear >= new Date().getFullYear();

function mergeActivityRows(newRows: ActivityItem[], existingRows: ActivityItem[]): ActivityItem[] {
  const seen = new Set<string>();
  const merged: ActivityItem[] = [];
  [...newRows, ...existingRows].forEach((row) => {
    if (!row) return;
    const key = row.id != null ? `id:${row.id}` : `fallback:${row.createdAt}:${row.media?.id}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(row);
  });
  return merged.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
}

function archiveSyncRunToSupabase(args: {
  userId: number;
  year: number;
  kind: "delta" | "manual";
  status: "success" | "error";
  rowsUpserted?: number;
  pagesFetched?: number;
  errorMessage?: string | null;
}) {
  void (async () => {
    try {
      await recordSyncRun({
        userId: args.userId,
        kind: args.kind,
        status: args.status,
        rowsUpserted: args.rowsUpserted ?? 0,
        pagesFetched: args.pagesFetched ?? 0,
        errorMessage: args.errorMessage ?? null,
        metadata: { year: args.year, source: "useActivityYearsLoader" },
      });
    } catch {
      // Sync logs are diagnostic only and must never affect rendering.
    }
  })();
}

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
  animeActivityCache: ActivityCacheByYear;
  mangaActivityCache: ActivityCacheByYear;
  setAnimeActivityCache: Dispatch<SetStateAction<ActivityCacheByYear>>;
  setMangaActivityCache: Dispatch<SetStateAction<ActivityCacheByYear>>;
  setAnimeActivities: Dispatch<SetStateAction<ActivityItem[]>>;
  setMangaActivities: Dispatch<SetStateAction<ActivityItem[]>>;
  setLoadingActivities: Dispatch<SetStateAction<boolean>>;
  setActivityLoadingMessage: Dispatch<SetStateAction<string>>;
  setActivityWarning: Dispatch<SetStateAction<string | null>>;
  setResource: (key: string, status: string, error?: string | null) => void;
  metricInc: (field: string, amount?: number) => void;
  refs: ActivityLoaderRefs;
};

/**
 * Chargement des activités par année : **lecture Supabase par défaut** (année
 * courante + N-1 pour la comparaison), commit atomique dans le cache React,
 * puis **aucun** fetch AniList automatique. Seul `refreshCurrentActivities`
 * (bouton header) déclenche un delta / resync AniList + persistance Supabase.
 *
 * `activityInFlightRef` déduplique les requêtes AniList manuelles sur la
 * même clé année × type. Les écritures sont ignorées si
 * `latestUserIdRef.current !== uid` (changement de profil).
 */
export function useActivityYearsLoader(p: ActivityYearsLoaderParams) {
  const {
    loaded,
    user,
    year,
    month,
    animeActivityCache,
    mangaActivityCache,
    setAnimeActivityCache,
    setMangaActivityCache,
    setAnimeActivities,
    setMangaActivities,
    setLoadingActivities,
    setActivityLoadingMessage,
    setActivityWarning,
    setResource,
    metricInc,
    refs,
  } = p;

  const {
    latestUserIdRef,
    activityInFlightRef,
    activityCooldownRef,
    activityRetryCountRef,
    mediaBitsByIdRef,
  } = refs;
  const supabaseActivityHydrationRef = useRef<Set<string>>(new Set());

  const prefetchYearActivities = useCallback(
    async (targetYear: number, ownerId: number, options: { force?: boolean } = {}) => {
      const uid = ownerId;
      if (!uid || !isFetchableActivityYear(targetYear)) return;
      if (!options.force && !shouldAutoRefreshYear(targetYear)) return;
      const aKey = `activity:${uid}:ANIME_LIST:${targetYear}`;
      const mKey = `activity:${uid}:MANGA_LIST:${targetYear}`;
      const shouldLogSyncRun = options.force || targetYear === new Date().getFullYear();
      const shouldUseDelta = targetYear === new Date().getFullYear();
      let pagesFetchedForLog = 0;
      let rowsUpsertedForLog = 0;
      try {
        const fetchOne = async (type: "ANIME_LIST" | "MANGA_LIST") => {
          const key = `activity:${uid}:${type}:${targetYear}`;
          let req = activityInFlightRef.current.get(key);
          if (!req) {
            setResource(key, "loading");
            const sinceId = shouldUseDelta ? await getLatestActivityId(uid, type) : null;
            req = fetchActivitiesWithRetry(uid, type, targetYear, undefined, { sinceId });
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
        const existingAnime =
          shouldUseDelta
            ? animeActivityCache[targetYear] || (await getActivities(uid, "ANIME_LIST", targetYear))
            : animeActivityCache[targetYear] || [];
        const existingManga =
          shouldUseDelta
            ? mangaActivityCache[targetYear] || (await getActivities(uid, "MANGA_LIST", targetYear))
            : mangaActivityCache[targetYear] || [];
        const nextAnime = shouldUseDelta ? mergeActivityRows(aActs, existingAnime) : aActs;
        const nextManga = shouldUseDelta ? mergeActivityRows(mActs, existingManga) : mActs;
        archiveActivitiesToSupabase(uid, "ANIME_LIST", aActs);
        archiveActivitiesToSupabase(uid, "MANGA_LIST", mActs);
        setAnimeActivityCache((prev) => ({ ...prev, [targetYear]: nextAnime }));
        setMangaActivityCache((prev) => ({ ...prev, [targetYear]: nextManga }));
        setResource(aKey, "success");
        setResource(mKey, "success");
        metricInc("cacheWrite", 2);
        pagesFetchedForLog = Math.ceil(aActsRaw.length / 50) + Math.ceil(mActsRaw.length / 50);
        rowsUpsertedForLog = aActs.length + mActs.length;
        if (shouldLogSyncRun) {
          archiveSyncRunToSupabase({
            userId: uid,
            year: targetYear,
            kind: options.force ? "manual" : "delta",
            status: "success",
            pagesFetched: pagesFetchedForLog,
            rowsUpserted: rowsUpsertedForLog,
          });
        }
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError") return;
        if (latestUserIdRef.current !== uid) return;
        const msg = e?.message || "Erreur activite";
        setResource(aKey, "error", msg);
        setResource(mKey, "error", msg);
        if (String(msg).includes("Rate limit") || String(msg).includes("429")) metricInc("rateLimitErrors");
        if (shouldLogSyncRun) {
          archiveSyncRunToSupabase({
            userId: uid,
            year: targetYear,
            kind: options.force ? "manual" : "delta",
            status: "error",
            pagesFetched: pagesFetchedForLog,
            rowsUpserted: rowsUpsertedForLog,
            errorMessage: msg,
          });
        }
      }
    },
    [
      activityInFlightRef,
      animeActivityCache,
      latestUserIdRef,
      mangaActivityCache,
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
    if (!loaded || !user?.id) return undefined;
    const ownerId = user.id;
    const hydrationSet = supabaseActivityHydrationRef.current;
    const yearsNeeded = new Set([year]);
    if (year !== ALL_TIME_YEAR && (month === 0 || month === 1)) yearsNeeded.add(year - 1);
    const scopeYears = [...yearsNeeded].filter(isFetchableActivityYear);
    const targets: Array<{ type: ActivitySnapshotType; year: number }> = [];

    scopeYears.forEach((scopeYear) => {
      if (animeActivityCache[scopeYear] === undefined) {
        const key = supabaseActivityKey(ownerId, "ANIME_LIST", scopeYear);
        if (!hydrationSet.has(key)) {
          hydrationSet.add(key);
          targets.push({ type: "ANIME_LIST", year: scopeYear });
        }
      }
      if (mangaActivityCache[scopeYear] === undefined) {
        const key = supabaseActivityKey(ownerId, "MANGA_LIST", scopeYear);
        if (!hydrationSet.has(key)) {
          hydrationSet.add(key);
          targets.push({ type: "MANGA_LIST", year: scopeYear });
        }
      }
    });

    if (targets.length === 0) return undefined;

    let cancelled = false;
    const targetsSnapshot = [...targets];

    (async () => {
      const resultByKey = new Map<string, ActivityItem[]>();
      await Promise.allSettled(
        targetsSnapshot.map(async (target) => {
          const dedupeKey = `${target.type}:${target.year}`;
          try {
            const rowsRaw = await getActivities(ownerId, target.type, target.year);
            if (cancelled || latestUserIdRef.current !== ownerId) return;
            const rows = enrichActivitiesWithMediaBits(rowsRaw, mediaBitsByIdRef.current);
            resultByKey.set(dedupeKey, rows);
          } catch (err: unknown) {
            const e = err as { message?: string };
            devLog("activity supabase read failed", target.type, activityYearLabel(target.year), e?.message || err);
            resultByKey.set(dedupeKey, []);
          }
        })
      );

      const releaseHydrationKeys = () => {
        for (const t of targetsSnapshot) {
          hydrationSet.delete(supabaseActivityKey(ownerId, t.type, t.year));
        }
      };

      if (cancelled || latestUserIdRef.current !== ownerId) {
        releaseHydrationKeys();
        return;
      }

      const hydratedAnime = new Map<number, ActivityItem[]>();
      const hydratedManga = new Map<number, ActivityItem[]>();
      for (const t of targetsSnapshot) {
        const k = `${t.type}:${t.year}`;
        const rows = resultByKey.get(k) ?? [];
        if (t.type === "ANIME_LIST") hydratedAnime.set(t.year, rows);
        else hydratedManga.set(t.year, rows);
      }

      setAnimeActivityCache((prev) => {
        const next = { ...prev };
        for (const [y, rows] of hydratedAnime) {
          if (next[y] === undefined) next[y] = rows;
        }
        return next;
      });
      setMangaActivityCache((prev) => {
        const next = { ...prev };
        for (const [y, rows] of hydratedManga) {
          if (next[y] === undefined) next[y] = rows;
        }
        return next;
      });
      releaseHydrationKeys();
    })();

    return () => {
      cancelled = true;
      for (const t of targetsSnapshot) {
        hydrationSet.delete(supabaseActivityKey(ownerId, t.type, t.year));
      }
    };
  }, [
    animeActivityCache,
    loaded,
    mangaActivityCache,
    mediaBitsByIdRef,
    month,
    latestUserIdRef,
    setAnimeActivityCache,
    setMangaActivityCache,
    user?.id,
    year,
  ]);

  useEffect(() => {
    if (!loaded || !user?.id) return;
    const ownerId = user.id;

    const yearsNeeded = new Set([year]);
    if (year !== ALL_TIME_YEAR && (month === 0 || month === 1)) yearsNeeded.add(year - 1);
    const scopeYears = [...yearsNeeded].filter(isFetchableActivityYear);

    scopeYears.forEach((y) => {
      if (animeActivityCache[y] !== undefined && mangaActivityCache[y] !== undefined) {
        setResource(`activity:${ownerId}:ANIME_LIST:${y}`, "success");
        setResource(`activity:${ownerId}:MANGA_LIST:${y}`, "success");
      }
    });

    const hydrating = scopeYears.some(
      (y) =>
        (animeActivityCache[y] === undefined || mangaActivityCache[y] === undefined) &&
        (supabaseActivityHydrationRef.current.has(supabaseActivityKey(ownerId, "ANIME_LIST", y)) ||
          supabaseActivityHydrationRef.current.has(supabaseActivityKey(ownerId, "MANGA_LIST", y)))
    );

    if (hydrating) {
      setActivityLoadingMessage("Lecture des activites depuis Supabase…");
      setLoadingActivities(true);
      setActivityWarning(null);
      return;
    }

    setLoadingActivities(false);
    setActivityWarning(null);
  }, [
    loaded,
    user?.id,
    year,
    month,
    animeActivityCache,
    mangaActivityCache,
    setResource,
    setLoadingActivities,
    setActivityLoadingMessage,
    setActivityWarning,
  ]);

  useEffect(() => {
    if (!user?.id) return;
    if (latestUserIdRef.current !== user.id) return;
    if (animeActivityCache[year] !== undefined && mangaActivityCache[year] !== undefined) {
      setAnimeActivities(animeActivityCache[year]);
      setMangaActivities(mangaActivityCache[year]);
    }
  }, [year, animeActivityCache, mangaActivityCache, user?.id, latestUserIdRef, setAnimeActivities, setMangaActivities]);

  const refreshCurrentActivities = useCallback(async () => {
    if (!user?.id || !loaded) return;
    const ownerId = user.id;
    if (!isFetchableActivityYear(year)) return;
    const compareY =
      year !== ALL_TIME_YEAR && (month === 0 || month === 1) ? year - 1 : null;
    if (compareY != null && compareY >= 1970) {
      await prefetchYearActivities(compareY, ownerId, { force: true });
    }
    await prefetchYearActivities(year, ownerId, { force: true });
  }, [loaded, month, prefetchYearActivities, user?.id, year]);

  return {
    prefetchYearActivities,
    retryYearNow,
    handleRetryComparisonNow,
    refreshCurrentActivities,
  };
}
