import { useCallback, useEffect, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  fetchAL,
  sleep,
  USER_QUERY,
  MEDIA_LIST_QUERY,
} from "../api/anilistClient";
import {
  PROFILE_USER_TTL_MS,
  PROFILE_LIST_TTL_MS,
  PROFILE_SWR_STALE_MS,
  devLog,
  safeReadCacheMeta,
  safeReadCache,
  safeWriteCache,
  normalizeName,
  profileUserCacheKey,
  profileAnimeCacheKey,
  profileMangaCacheKey,
  legacyProfileCacheKey,
  rememberLastProfileSearch,
  readLastProfileSearchInput,
} from "../lib/profileLocalCache";
import {
  parseRouteFromHash,
  profileHashForUserName,
  initialLoadingFromHash,
} from "../lib/routing";
import type { ActivityCacheByYear, ActivityItem, AniListEntry, AniListUser } from "../types/domain";

type FetchDataOptions = { forceNetwork?: boolean; background?: boolean };

export type ProfileLoaderRefs = {
  profileInFlightRef: MutableRefObject<Map<string, Promise<unknown>>>;
  profileAbortRef: MutableRefObject<AbortController | null>;
  profileAbortKeyRef: MutableRefObject<string | null>;
  latestUserIdRef: MutableRefObject<number | null>;
  activeProfileIntentRef: MutableRefObject<string | null>;
  lastForegroundProfileKeyRef: MutableRefObject<string | null>;
  activityInFlightRef: MutableRefObject<Map<string, Promise<unknown>>>;
  activityCooldownRef: MutableRefObject<Map<string, number>>;
  activityRetryCountRef: MutableRefObject<Map<string, number>>;
  activityYearsInFlightRef: MutableRefObject<Set<number>>;
  activityMissLogRef: MutableRefObject<Set<string>>;
};

export type ProfileLoaderCrossSetters = {
  setTab: (v: string) => void;
  setYear: (y: number) => void;
  setMonth: (m: number) => void;
  setAnimeActivityCache: Dispatch<SetStateAction<ActivityCacheByYear>>;
  setMangaActivityCache: Dispatch<SetStateAction<ActivityCacheByYear>>;
  setLoadingActivities: (v: boolean) => void;
  setActivityWarning: (v: string | null) => void;
  setResourceStatus: Dispatch<SetStateAction<Record<string, unknown>>>;
  setResource: (key: string, status: string, error?: string | null) => void;
};

/**
 * Chargement du profil AniList (user + listes), routing par hash, reset accueil.
 * Les caches d’activités et la file d’activités sont réinitialisés via les setters passés (partagés avec useActivityYearsLoader).
 */
export function useProfileLoader(
  refs: ProfileLoaderRefs,
  cross: ProfileLoaderCrossSetters,
  metricInc: (field: string, amount?: number) => void,
  metricProfileFetchDuration: (ms: number) => void
) {
  const [inputVal, setInputVal] = useState(() =>
    parseRouteFromHash().type === "home" ? "" : readLastProfileSearchInput()
  );
  const [hashTick, setHashTick] = useState(0);
  const [loading, setLoading] = useState(initialLoadingFromHash);
  const [error, setError] = useState<unknown>(null);
  const [user, setUser] = useState<AniListUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [allAnime, setAllAnime] = useState<AniListEntry[]>([]);
  const [allManga, setAllManga] = useState<AniListEntry[]>([]);
  const [animeActivities, setAnimeActivities] = useState<ActivityItem[]>([]);
  const [mangaActivities, setMangaActivities] = useState<ActivityItem[]>([]);
  const [pendingProfileName, setPendingProfileName] = useState<string | null>(null);

  const {
    profileInFlightRef,
    profileAbortRef,
    profileAbortKeyRef,
    latestUserIdRef,
    activeProfileIntentRef,
    lastForegroundProfileKeyRef,
    activityInFlightRef,
    activityCooldownRef,
    activityRetryCountRef,
    activityYearsInFlightRef,
    activityMissLogRef,
  } = refs;

  const resetToHomeLanding = useCallback(() => {
    if (profileAbortRef.current) {
      try {
        profileAbortRef.current.abort();
      } catch {
        /* noop */
      }
    }
    activityInFlightRef.current.clear();
    activityCooldownRef.current.clear();
    activityRetryCountRef.current.clear();
    activityYearsInFlightRef.current.clear();
    activityMissLogRef.current.clear();
    latestUserIdRef.current = null;
    activeProfileIntentRef.current = null;
    lastForegroundProfileKeyRef.current = null;

    setUser(null);
    setLoaded(false);
    setLoading(false);
    setError(null);
    setPendingProfileName(null);
    setAllAnime([]);
    setAllManga([]);
    setAnimeActivities([]);
    setMangaActivities([]);
    cross.setAnimeActivityCache({});
    cross.setMangaActivityCache({});
    cross.setLoadingActivities(false);
    cross.setActivityWarning(null);
    cross.setTab("overview");
    cross.setYear(new Date().getFullYear());
    cross.setMonth(0);
    setInputVal("");
    cross.setResourceStatus({});
  }, [
    cross.setTab,
    cross.setYear,
    cross.setMonth,
    cross.setAnimeActivityCache,
    cross.setMangaActivityCache,
    cross.setLoadingActivities,
    cross.setActivityWarning,
    cross.setResourceStatus,
    profileAbortRef,
    activityInFlightRef,
    activityCooldownRef,
    activityRetryCountRef,
    activityYearsInFlightRef,
    activityMissLogRef,
    latestUserIdRef,
    activeProfileIntentRef,
    lastForegroundProfileKeyRef,
  ]);

  const fetchData = useCallback(
    async (name: string, options: FetchDataOptions = {}) => {
      const { forceNetwork = false, background = false } = options;
      const normalized = normalizeName(name);
      if (!normalized) {
        if (!background) {
          setLoading(false);
          setError(null);
        }
        return;
      }
      const profileKey = `profile:${normalized}`;
      if (!background) {
        activeProfileIntentRef.current = profileKey;
        const prevFg = lastForegroundProfileKeyRef.current;
        if (prevFg && prevFg !== profileKey) {
          const cy = new Date().getFullYear();
          cross.setYear(cy);
          cross.setMonth(0);
        }
      }
      const activeProfileKey = profileAbortKeyRef.current;
      const isUserSwitch = activeProfileKey && activeProfileKey !== profileKey;
      if (isUserSwitch && !background) {
        activityInFlightRef.current.clear();
        activityCooldownRef.current.clear();
        activityRetryCountRef.current.clear();
        activityYearsInFlightRef.current.clear();
        activityMissLogRef.current.clear();
        cross.setActivityWarning(null);
        cross.setLoadingActivities(false);
      }
      const cachedUserMeta = safeReadCacheMeta(profileUserCacheKey(normalized), PROFILE_SWR_STALE_MS);
      const cachedAnimeMeta = safeReadCacheMeta(profileAnimeCacheKey(normalized), PROFILE_SWR_STALE_MS);
      const cachedMangaMeta = safeReadCacheMeta(profileMangaCacheKey(normalized), PROFILE_SWR_STALE_MS);
      const legacyProfile = safeReadCache(legacyProfileCacheKey(normalized), PROFILE_SWR_STALE_MS);
      const isProfileStale = Boolean(
        cachedUserMeta?.isStale || cachedAnimeMeta?.isStale || cachedMangaMeta?.isStale
      );
      const cachedProfile =
        cachedUserMeta?.value && cachedAnimeMeta?.value && cachedMangaMeta?.value
          ? {
              user: cachedUserMeta.value,
              allAnime: cachedAnimeMeta.value,
              allManga: cachedMangaMeta.value,
            }
          : legacyProfile;

      if (cachedProfile && !forceNetwork) {
        devLog("profile hit", normalized);
        metricInc("cacheHit");
        cross.setResource(profileKey, "success");
        setError(null);
        setLoaded(false);
        const cp = cachedProfile as { user?: AniListUser; allAnime?: unknown; allManga?: unknown };
        latestUserIdRef.current = cp.user?.id ?? null;
        setUser(cp.user || null);
        setAllAnime(Array.isArray(cp.allAnime) ? cp.allAnime : []);
        setAllManga(Array.isArray(cp.allManga) ? cp.allManga : []);
        if (!background) {
          setAnimeActivities([]);
          setMangaActivities([]);
          cross.setAnimeActivityCache({});
          cross.setMangaActivityCache({});
        }
        setLoaded(true);
        setLoading(false);
        if (!background) {
          rememberLastProfileSearch(String(name).trim());
          setInputVal("");
        }
        if (isProfileStale && !background) {
          devLog("profile stale -> background refresh", normalized);
          fetchData(name, { forceNetwork: true, background: true });
        }
        if (!background) lastForegroundProfileKeyRef.current = profileKey;
        return;
      }

      devLog("profile miss", normalized);
      metricInc("cacheMiss");
      cross.setResource(profileKey, "loading");
      const existingReq = profileInFlightRef.current.get(profileKey);
      if (existingReq) {
        devLog("profile dedup", normalized);
        if (!background) setPendingProfileName(name.trim());
        try {
          const { ud, ad, md } = (await existingReq) as {
            ud: { User?: AniListUser };
            ad: { MediaListCollection?: { lists?: unknown[] } };
            md: { MediaListCollection?: { lists?: unknown[] } };
          };
          if (background && activeProfileIntentRef.current !== profileKey) {
            devLog("profile dedup background stale skip", normalized);
            return;
          }
          latestUserIdRef.current = ud.User?.id ?? null;
          setUser(ud.User);
          const aa = (ad.MediaListCollection?.lists || []).flatMap((l: { entries?: AniListEntry[]; name?: string; status?: string }) =>
            (l.entries || []).map((e) => ({ ...e, listName: l.name, listStatus: l.status }))
          );
          const am = (md.MediaListCollection?.lists || []).flatMap((l: { entries?: AniListEntry[]; name?: string; status?: string }) =>
            (l.entries || []).map((e) => ({ ...e, listName: l.name, listStatus: l.status }))
          );
          setAllAnime(aa);
          setAllManga(am);
          if (!background) {
            setAnimeActivities([]);
            setMangaActivities([]);
            cross.setAnimeActivityCache({});
            cross.setMangaActivityCache({});
          }
          setLoaded(true);
          cross.setResource(profileKey, "success");
          if (!background) {
            rememberLastProfileSearch(String(name).trim());
            setPendingProfileName(null);
            setInputVal("");
          }
          if (!background) lastForegroundProfileKeyRef.current = profileKey;
        } catch (err: unknown) {
          const e = err as { name?: string; message?: string };
          if (e?.name !== "AbortError") {
            setError(e.message || "Erreur lors du chargement");
            cross.setResource(profileKey, "error", e.message || "Erreur profil");
            if (!background) setPendingProfileName(null);
          }
        }
        return;
      }
      if (profileAbortRef.current && profileAbortKeyRef.current !== profileKey) profileAbortRef.current.abort();
      const abortController = new AbortController();
      profileAbortRef.current = abortController;
      profileAbortKeyRef.current = profileKey;
      if (!background) {
        setPendingProfileName(name.trim());
        setLoading(true);
        setError(null);
        setLoaded(false);
      } else {
        setError(null);
      }
      const startedAt = performance.now();
      try {
        const req = (async () => {
          const ud = await fetchAL(USER_QUERY, { name }, { signal: abortController.signal });
          if (!background && ud?.User && activeProfileIntentRef.current === profileKey) {
            setUser(ud.User);
            setPendingProfileName(null);
          }
          await sleep(200, abortController.signal);
          const ad = await fetchAL(
            MEDIA_LIST_QUERY,
            { userName: name, type: "ANIME" },
            { signal: abortController.signal }
          );
          await sleep(200, abortController.signal);
          const md = await fetchAL(
            MEDIA_LIST_QUERY,
            { userName: name, type: "MANGA" },
            { signal: abortController.signal }
          );
          return { ud, ad, md };
        })();
        profileInFlightRef.current.set(profileKey, req);
        const { ud, ad, md } = await req;
        if (background && activeProfileIntentRef.current !== profileKey) {
          devLog("profile background stale skip", normalized);
          return;
        }
        latestUserIdRef.current = (ud.User as AniListUser | undefined)?.id ?? null;
        setUser(ud.User);
        const aa = (ad.MediaListCollection?.lists || []).flatMap((l: { entries?: AniListEntry[]; name?: string; status?: string }) =>
          (l.entries || []).map((e) => ({ ...e, listName: l.name, listStatus: l.status }))
        );
        const am = (md.MediaListCollection?.lists || []).flatMap((l: { entries?: AniListEntry[]; name?: string; status?: string }) =>
          (l.entries || []).map((e) => ({ ...e, listName: l.name, listStatus: l.status }))
        );
        setAllAnime(aa);
        setAllManga(am);
        if (!background) {
          setAnimeActivities([]);
          setMangaActivities([]);
          cross.setAnimeActivityCache({});
          cross.setMangaActivityCache({});
        }
        setLoaded(true);
        if (!background) {
          rememberLastProfileSearch(String(name).trim());
          setInputVal("");
        }
        if (!background) lastForegroundProfileKeyRef.current = profileKey;
        safeWriteCache(profileUserCacheKey(normalized), ud.User, PROFILE_USER_TTL_MS);
        safeWriteCache(profileAnimeCacheKey(normalized), aa, PROFILE_LIST_TTL_MS);
        safeWriteCache(profileMangaCacheKey(normalized), am, PROFILE_LIST_TTL_MS);
        metricInc("cacheWrite", 3);
        devLog("profile write", normalized);
        cross.setResource(profileKey, "success");
        if (!background) setPendingProfileName(null);
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError") {
          devLog("profile aborted", normalized);
          return;
        }
        if (!background) {
          setError(e.message || "Erreur lors du chargement");
          setPendingProfileName(null);
        }
        cross.setResource(profileKey, "error", e.message || "Erreur profil");
      } finally {
        metricProfileFetchDuration(performance.now() - startedAt);
        if (profileAbortRef.current === abortController) {
          profileAbortRef.current = null;
          profileAbortKeyRef.current = null;
        }
        profileInFlightRef.current.delete(profileKey);
        if (!background) setLoading(false);
      }
    },
    [
      metricInc,
      metricProfileFetchDuration,
      profileInFlightRef,
      profileAbortRef,
      profileAbortKeyRef,
      latestUserIdRef,
      activeProfileIntentRef,
      lastForegroundProfileKeyRef,
      activityInFlightRef,
      activityCooldownRef,
      activityRetryCountRef,
      activityYearsInFlightRef,
      activityMissLogRef,
      cross.setResource,
      cross.setYear,
      cross.setMonth,
      cross.setAnimeActivityCache,
      cross.setMangaActivityCache,
      cross.setActivityWarning,
      cross.setLoadingActivities,
    ]
  );

  useEffect(() => {
    const onHash = () => setHashTick((x) => x + 1);
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  useEffect(() => {
    if (!loaded || !user?.name) return;
    const want = profileHashForUserName(user.name);
    if (want === window.location.hash) return;
    try {
      const path = `${window.location.pathname}${window.location.search}${want}`;
      window.history.replaceState(null, "", path);
    } catch {
      /* ignore */
    }
  }, [loaded, user]);

  useEffect(() => {
    const r = parseRouteFromHash();
    if (r.type === "home") {
      resetToHomeLanding();
      return;
    }
    if (r.type === "user" && r.name.trim()) {
      setInputVal(r.name);
      fetchData(r.name.trim());
    }
  }, [hashTick, fetchData, resetToHomeLanding]);

  useEffect(
    () => () => {
      if (profileAbortRef.current) profileAbortRef.current.abort();
    },
    [profileAbortRef]
  );

  return {
    inputVal,
    setInputVal,
    hashTick,
    loading,
    error,
    setError,
    user,
    loaded,
    allAnime,
    allManga,
    animeActivities,
    mangaActivities,
    setAnimeActivities,
    setMangaActivities,
    pendingProfileName,
    fetchData,
    resetToHomeLanding,
  };
}
