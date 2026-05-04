import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import {
  fetchAL,
  USER_QUERY,
  MEDIA_LIST_QUERY,
  MEDIA_LIST_QUERY_MANGA,
  AniListApiDisabledError,
} from "../api/anilistClient";
import {
  devLog,
  normalizeName,
} from "../lib/profileLocalCache";
import {
  parseRouteFromHash,
  profileHashForUserName,
  initialLoadingFromHash,
} from "../lib/routing";
import type { ActivityCacheByYear, ActivityItem, AniListEntry, AniListUser } from "../types/domain";
import type {
  MediaListQuery,
  MediaListMangaQuery,
  UserProfileQuery,
} from "../types/anilistGraphql";
import {
  getUserAndLists,
  saveMediaListSnapshot,
  upsertUser,
} from "../services/supabaseService";

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

function resetActivityCaches(
  cross: Pick<ProfileLoaderCrossSetters, "setAnimeActivityCache" | "setMangaActivityCache">
) {
  cross.setAnimeActivityCache({});
  cross.setMangaActivityCache({});
}

function archiveUserToSupabase(user: AniListUser | null | undefined) {
  if (!user?.id) return;
  void (async () => {
    try {
      await upsertUser(user);
    } catch (err: unknown) {
      const e = err as { message?: string };
      devLog("supabase user archive failed", e?.message || err);
    }
  })();
}

function archiveMediaListsToSupabase(
  userId: number | null | undefined,
  animeEntries: AniListEntry[],
  mangaEntries: AniListEntry[]
) {
  if (!userId) return;
  void (async () => {
    try {
      await Promise.all([
        saveMediaListSnapshot(userId, "ANIME", animeEntries),
        saveMediaListSnapshot(userId, "MANGA", mangaEntries),
      ]);
    } catch (err: unknown) {
      const e = err as { message?: string };
      devLog("supabase media list archive failed", e?.message || err);
    }
  })();
}

function beginBackgroundRefresh(
  countRef: MutableRefObject<number>,
  setRefreshing: (value: boolean) => void
) {
  countRef.current += 1;
  setRefreshing(true);
}

function endBackgroundRefresh(
  countRef: MutableRefObject<number>,
  setRefreshing: (value: boolean) => void
) {
  countRef.current = Math.max(0, countRef.current - 1);
  if (countRef.current === 0) setRefreshing(false);
}

/**
 * Gestionnaire central du cycle de vie d'un profil AniList.
 *
 * Ce hook orchestre :
 *  1. **Routing** — lecture de la route hash (`#/u/<name>` ou racine), écoute
 *     des `hashchange` pour recharger un profil, bascule vers l'accueil
 *     quand la route redevient vide.
 *  2. **Fetch du profil** — requête `USER_QUERY` puis pagination anime/manga
 *     (`MEDIA_LIST_QUERY`, `MEDIA_LIST_QUERY_MANGA`). Exposé via
 *     `{ user, allAnime, allManga }`.
 *  3. **Primary cache Supabase** — lecture immédiate depuis la base ; aucun
 *     refresh AniList automatique (uniquement via le bouton d'actualisation).
 *  4. **Mode invité** — si Supabase ne connaît pas encore le profil, AniList
 *     reste le fallback bloquant initial, puis le résultat est archivé.
 *  5. **Dédoublonnage des requêtes** — `profileInFlightRef` évite deux fetchs
 *     concurrents pour le même pseudo. Les changements de profil annulent
 *     l'ancien via `AbortController`.
 *  6. **Coordination avec `useActivityYearsLoader`** — au changement de
 *     profil, le cache d'activités et ses files internes sont réinitialisés
 *     via les setters/refs passés en paramètres. Les activités sont ensuite
 *     relues depuis Supabase par `useActivityYearsLoader`.
 *  7. **Ciblage UI avant résolution** — `pendingProfileName` permet à la
 *     barre de header de montrer « tu vas arriver sur X » pendant le fetch,
 *     même si `user` est encore l'ancien profil.
 *
 * Les options de `fetchData` (`forceNetwork`, `background`) contrôlent si
 * l'on contourne le cache (bouton « recharger ») et si le fetch doit
 * s'effectuer silencieusement (refresh SWR qui ne doit pas remplacer le
 * profil actif quand l'utilisateur en consulte un autre en parallèle).
 */
export function useProfileLoader(
  refs: ProfileLoaderRefs,
  cross: ProfileLoaderCrossSetters,
  metricInc: (field: string, amount?: number) => void,
  metricProfileFetchDuration: (ms: number) => void
) {
  const [inputVal, setInputVal] = useState("");
  const [hashTick, setHashTick] = useState(0);
  const [loading, setLoading] = useState(initialLoadingFromHash);
  const [error, setError] = useState<unknown>(null);
  /*
   * Drapeau distinct pour la situation « API AniList désactivée côté serveur »
   * (HTTP 403 ou message GraphQL dédié). On garde `error` pour les messages
   * d'erreur classiques ; ce flag active un encart UX spécifique (ton neutre,
   * message rassurant, pas de prompt « réessaie » agressif).
   */
  const [apiDisabled, setApiDisabled] = useState(false);
  const [user, setUser] = useState<AniListUser | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [allAnime, setAllAnime] = useState<AniListEntry[]>([]);
  const [allManga, setAllManga] = useState<AniListEntry[]>([]);
  const [animeActivities, setAnimeActivities] = useState<ActivityItem[]>([]);
  const [mangaActivities, setMangaActivities] = useState<ActivityItem[]>([]);
  const [pendingProfileName, setPendingProfileName] = useState<string | null>(null);
  const [lastSupabaseSyncAt, setLastSupabaseSyncAt] = useState<string | null>(null);
  const [backgroundRefreshing, setBackgroundRefreshing] = useState(false);
  const backgroundRefreshCountRef = useRef(0);

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
    setApiDisabled(false);
    setPendingProfileName(null);
    setAllAnime([]);
    setAllManga([]);
    setAnimeActivities([]);
    setMangaActivities([]);
    setLastSupabaseSyncAt(null);
    setBackgroundRefreshing(false);
    backgroundRefreshCountRef.current = 0;
    cross.setAnimeActivityCache({});
    cross.setMangaActivityCache({});
    cross.setLoadingActivities(false);
    cross.setActivityWarning(null);
    cross.setTab("overview");
    cross.setYear(new Date().getFullYear());
    cross.setMonth(0);
    setInputVal("");
    cross.setResourceStatus({});
    /* `cross` est un sac de setters passé en prop (objet recréé à chaque
     * render du parent). Le référencer entier ferait recréer la callback à
     * chaque render, ce qu'on veut éviter. Les setters React/refs sont
     * stables par contrat, on peut donc les lister individuellement sans
     * craindre de références périmées. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

      if (!forceNetwork && !background) {
        try {
          const supabaseProfile = await getUserAndLists(name);
          if (supabaseProfile && activeProfileIntentRef.current === profileKey) {
            devLog("profile supabase hit", normalized);
            metricInc("cacheHit");
            cross.setResource(profileKey, "success");
            setError(null);
            setApiDisabled(false);
            latestUserIdRef.current = supabaseProfile.user.id;
            setUser(supabaseProfile.user);
            setAllAnime(supabaseProfile.allAnime);
            setAllManga(supabaseProfile.allManga);
            setLastSupabaseSyncAt(supabaseProfile.syncedAt);
            setAnimeActivities([]);
            setMangaActivities([]);
            cross.setAnimeActivityCache({});
            cross.setMangaActivityCache({});
            cross.setLoadingActivities(false);
            setLoaded(true);
            setLoading(false);
            setPendingProfileName(null);
            setInputVal("");
            lastForegroundProfileKeyRef.current = profileKey;
            return;
          }
        } catch (err: unknown) {
          const e = err as { message?: string };
          devLog("profile supabase read failed", e?.message || err);
        }
      }

      if (background) {
        devLog("profile background refresh", normalized);
      } else {
        devLog("profile miss", normalized);
        metricInc("cacheMiss");
        cross.setResource(profileKey, "loading");
      }
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
          archiveUserToSupabase(ud.User);
          const aa = (ad.MediaListCollection?.lists || []).flatMap((l: { entries?: AniListEntry[]; name?: string; status?: string }) =>
            (l.entries || []).map((e) => ({ ...e, listName: l.name, listStatus: l.status }))
          );
          const am = (md.MediaListCollection?.lists || []).flatMap((l: { entries?: AniListEntry[]; name?: string; status?: string }) =>
            (l.entries || []).map((e) => ({ ...e, listName: l.name, listStatus: l.status }))
          );
          setAllAnime(aa);
          setAllManga(am);
          setLastSupabaseSyncAt(new Date().toISOString());
          archiveMediaListsToSupabase(ud.User?.id, aa, am);
          if (!background) {
            setAnimeActivities([]);
            setMangaActivities([]);
            resetActivityCaches(cross);
          }
          setLoaded(true);
          cross.setResource(profileKey, "success");
          if (!background) {
            setPendingProfileName(null);
            setInputVal("");
          }
          if (!background) lastForegroundProfileKeyRef.current = profileKey;
        } catch (err: unknown) {
          const e = err as { name?: string; message?: string };
          if (e?.name !== "AbortError") {
            if (err instanceof AniListApiDisabledError) setApiDisabled(true);
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
        setApiDisabled(false);
        setLoaded(false);
      } else {
        setError(null);
        setApiDisabled(false);
        beginBackgroundRefresh(backgroundRefreshCountRef, setBackgroundRefreshing);
      }
      const startedAt = performance.now();
      try {
        /*
         * Pipeline de chargement initial en deux étapes :
         *  1. `USER_QUERY` seul : dès que la réponse arrive, on peut peindre
         *     l'avatar + le pseudo dans le header (transition visuelle avant
         *     que les grosses listes n'arrivent).
         *  2. `MEDIA_LIST_QUERY` (ANIME) + `MEDIA_LIST_QUERY_MANGA` (MANGA)
         *     lancées en parallèle via `Promise.all`. Le scheduler interne
         *     (`REQUEST_INTERVAL_MS`) va quand même les espacer pour respecter
         *     le rate-limit AniList, mais on évite les `sleep(200)` manuels
         *     qui étaient redondants avec cet espacement. Le résultat est
         *     identique côté rate-limit et ~400 ms plus rapide côté UX.
         *
         * Si l'une des deux listes échoue (`Promise.all` rejette à la première
         * erreur), on remonte l'erreur globalement comme avant : les deux
         * onglets (anime / manga) ont besoin d'être chargés ensemble pour
         * que la vue Overview ait du sens.
         */
        const req = (async () => {
          const ud = await fetchAL<UserProfileQuery>(USER_QUERY, { name }, { signal: abortController.signal });
          if (!background && ud?.User && activeProfileIntentRef.current === profileKey) {
            // Les types AniList (codegen) et le domaine applicatif partagent
            // la même forme ; on cast vers le type domaine qui est le contrat
            // stable utilisé dans le reste de l'app.
            const fetchedUser = ud.User as unknown as AniListUser;
            setUser(fetchedUser);
            archiveUserToSupabase(fetchedUser);
            setPendingProfileName(null);
          }
          const [ad, md] = await Promise.all([
            fetchAL<MediaListQuery>(
              MEDIA_LIST_QUERY,
              { userName: name, type: "ANIME" },
              { signal: abortController.signal }
            ),
            fetchAL<MediaListMangaQuery>(
              MEDIA_LIST_QUERY_MANGA,
              { userName: name, type: "MANGA" },
              { signal: abortController.signal }
            ),
          ]);
          return { ud, ad, md };
        })();
        profileInFlightRef.current.set(profileKey, req);
        const { ud, ad, md } = await req;
        if (background && activeProfileIntentRef.current !== profileKey) {
          devLog("profile background stale skip", normalized);
          return;
        }
        const userObj = (ud?.User ?? null) as AniListUser | null;
        latestUserIdRef.current = userObj?.id ?? null;
        setUser(userObj);
        const aa = (ad?.MediaListCollection?.lists || []).flatMap((l) =>
          ((l.entries || []) as unknown as AniListEntry[]).map((e) => ({
            ...e,
            listName: l.name ?? undefined,
            listStatus: l.status ?? undefined,
          }))
        );
        const am = (md?.MediaListCollection?.lists || []).flatMap((l) =>
          ((l.entries || []) as unknown as AniListEntry[]).map((e) => ({
            ...e,
            listName: l.name ?? undefined,
            listStatus: l.status ?? undefined,
          }))
        );
        setAllAnime(aa);
        setAllManga(am);
        setLastSupabaseSyncAt(new Date().toISOString());
        if (background) archiveUserToSupabase(userObj);
        archiveMediaListsToSupabase(userObj?.id, aa, am);
        if (!background) {
          setAnimeActivities([]);
          setMangaActivities([]);
          resetActivityCaches(cross);
        }
        setLoaded(true);
        if (!background) {
          setInputVal("");
        }
        if (!background) lastForegroundProfileKeyRef.current = profileKey;
        cross.setResource(profileKey, "success");
        if (!background) setPendingProfileName(null);
      } catch (err: unknown) {
        const e = err as { name?: string; message?: string };
        if (e?.name === "AbortError") {
          devLog("profile aborted", normalized);
          return;
        }
        if (!background) {
          if (err instanceof AniListApiDisabledError) setApiDisabled(true);
          setError(e.message || "Erreur lors du chargement");
          setPendingProfileName(null);
          cross.setResource(profileKey, "error", e.message || "Erreur profil");
        } else {
          devLog("profile background refresh failed", normalized, e.message || err);
        }
      } finally {
        metricProfileFetchDuration(performance.now() - startedAt);
        if (profileAbortRef.current === abortController) {
          profileAbortRef.current = null;
          profileAbortKeyRef.current = null;
        }
        profileInFlightRef.current.delete(profileKey);
        if (!background) setLoading(false);
        else endBackgroundRefresh(backgroundRefreshCountRef, setBackgroundRefreshing);
      }
    },
    /* Mêmes considérations que pour le reset plus haut : on liste les
     * setters de `cross` individuellement plutôt que l'objet entier, pour
     * éviter de re-créer `fetchData` à chaque render du parent. */
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  const refreshCurrentProfile = useCallback(() => {
    const name = user?.name || pendingProfileName || inputVal;
    const trimmed = String(name || "").trim();
    if (!trimmed) return;
    void fetchData(trimmed, { forceNetwork: true, background: true });
  }, [fetchData, inputVal, pendingProfileName, user?.name]);

  return {
    inputVal,
    setInputVal,
    hashTick,
    loading,
    error,
    setError,
    apiDisabled,
    setApiDisabled,
    user,
    loaded,
    allAnime,
    allManga,
    animeActivities,
    mangaActivities,
    setAnimeActivities,
    setMangaActivities,
    pendingProfileName,
    lastSupabaseSyncAt,
    backgroundRefreshing,
    refreshCurrentProfile,
    fetchData,
    resetToHomeLanding,
  };
}
