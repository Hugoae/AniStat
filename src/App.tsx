import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  C,
  MONTHS,
  MONTHS_FULL,
} from './config/constants';
import {
  dedupeEntriesByMedia,
  completedInYear,
  startedInYear,
  completedInMonth,
  startedInMonth,
  fmtMin,
  countActiveCalendarDays,
  getPeriodDayTotal,
  computePeriodDeltaFromActivities,
  computePeriodAnimeActivityTotals,
  computePeriodWatchMinutesByFormat,
  computePeriodWatchMinutesByCountry,
  computePeriodWatchEpisodesByFormat,
  computePeriodWatchEpisodesByCountry,
  computePeriodReadChaptersByFormat,
  computePeriodReadChaptersByCountry,
  computePeriodTopTags,
  computePeriodBiggestSession,
  computePeriodLongestStreak,
  findPeriodLongestCompleted,
  findPeriodHighestScore,
  findPeriodLowestScore,
  findPeriodFirstStarted,
  findPeriodLastStarted,
  findPeriodFirstActivity,
  findPeriodLastActivity,
  findPeriodFastestCompleted,
  computeMonthlyDeltasFromActivities,
  computeDailyDeltasInMonth,
  computeDailyDeltasInYear,
  getMediaIdsWithProgressInPeriod,
  getComparisonPeriodMeta,
  mergeActivitiesForDelta,
} from './lib/stats';
import {
  getRateLimitState,
  subscribeRateLimit,
  getProxyCacheStats,
  subscribeProxyCache,
  subscribeFetchLog,
  getFetchLog,
  resetFetchLog,
  type FetchLogEntry,
} from './api/anilistClient';
import { buildAnimeHalfScoreDistributionFullRange } from "./lib/animeScoreUtils";
import { compareEntriesByUserScoreThenAverage } from "./lib/compareEntries";
import {
  buildMediaBitsIndex,
  type ActivityMediaBits,
} from "./lib/activityEnrichment";
import { anilistMediaUrl } from "./components/appUi/mediaDisplayHelpers";
import { HomePage } from "./pages/HomePage";
import { OverviewTab } from "./pages/OverviewTab";
import { AnimeTab } from "./pages/AnimeTab";
import { MangaTab } from "./pages/MangaTab";
import { PeriodEmptyBanner } from "./pages/PeriodEmptyBanner";
import {
  IS_DEV_LOCAL,
} from "./lib/profileLocalCache";
import {
  parseRouteFromHash,
  profileHashForUserName,
} from "./lib/routing";
import { recordProfileFetch } from "./lib/profileFetchStats";
import { useProfileLoader } from "./hooks/useProfileLoader";
import { useActivityYearsLoader } from "./hooks/useActivityYearsLoader";
import { useActivityLoadingUi } from "./hooks/useActivityLoadingUi";
import { useHeaderQuickPicks } from "./hooks/useHeaderQuickPicks";
import { useOverviewTopScrollFades } from "./hooks/useOverviewTopScrollFades";
import { ProfileAppHeader } from "./components/ProfileAppHeader";
import { ProfileViewMain } from "./components/ProfileViewMain";
import { BackToTopButton } from "./components/BackToTopButton";
import type { ActivityCacheByYear, ActivityItem, AniListEntry, AniListUser } from "./types/domain";

const ALL_TIME_YEAR = 0;

function countActivityDays(activities: ActivityItem[]): number {
  const today = Date.now();
  const days = new Set<string>();
  activities.forEach((activity) => {
    const ts = Number(activity?.createdAt || 0);
    if (!ts) return;
    const ms = ts * 1000;
    if (ms > today) return;
    const d = new Date(ms);
    days.add(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
  });
  return days.size;
}

function getFirstActivityYear(activities: ActivityItem[]): number {
  let first = Number.POSITIVE_INFINITY;
  activities.forEach((activity) => {
    const ts = Number(activity?.createdAt || 0);
    if (ts > 0 && ts < first) first = ts;
  });
  return Number.isFinite(first) ? new Date(first * 1000).getFullYear() : new Date().getFullYear();
}

function mergeActivityRowsForPreview(rowsByYear: Array<ActivityItem[] | undefined>): ActivityItem[] {
  const seen = new Set<string>();
  const out: ActivityItem[] = [];
  rowsByYear.forEach((rows) => {
    (rows || []).forEach((item) => {
      if (!item) return;
      const key = item.id != null ? `id:${item.id}` : `t:${item.createdAt}:${item.media?.id}`;
      if (seen.has(key)) return;
      seen.add(key);
      out.push(item);
    });
  });
  return out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function entryProgressTotal(entry: AniListEntry, kind: "anime" | "manga"): number {
  const progress = Number(entry.progress || 0);
  if (progress > 0) return progress;
  if (entry.status !== "COMPLETED") return 0;
  const fallback = kind === "anime" ? Number(entry.media?.episodes || 0) : Number(entry.media?.chapters || 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

function formatSyncRelativeTime(iso: string | null): string | null {
  if (!iso) return null;
  const ts = new Date(iso).getTime();
  if (!Number.isFinite(ts)) return null;
  const diffMs = Math.max(0, Date.now() - ts);
  const minutes = Math.floor(diffMs / 60_000);
  if (minutes < 1) return "Synchronisé à l'instant";
  if (minutes < 60) return `Synchronisé il y a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Synchronisé il y a ${hours} h`;
  const days = Math.floor(hours / 24);
  return `Synchronisé il y a ${days} j`;
}

/**
 * Composant racine de l'application.
 *
 * Responsabilités, dans l'ordre où elles apparaissent dans le corps :
 *  1. État local de navigation (`tab`, `year`, `month`) et caches d'activités.
 *  2. Refs de coordination (requêtes en vol, cooldowns, user courant, etc.)
 *     partagés entre `useProfileLoader` et `useActivityYearsLoader` pour
 *     éviter des dépendances circulaires entre hooks.
 *  3. Effets globaux : migration du cache, scroll listener (bouton retour
 *     en haut), debug panel en développement.
 *  4. Chargement profil (`useProfileLoader`) et activités par année
 *     (`useActivityYearsLoader`), coordonnés via les refs du point 2.
 *  5. Calculs dérivés (memo) : entrées filtrées par période, moyennes,
 *     totaux, distributions par genre/format/tag, histogrammes…
 *  6. Préparation des « bundles » passés aux onglets (Overview, Anime,
 *     Manga) avec une API stable.
 *  7. Rendu : header, body (onglet actif) ou home landing.
 *
 * Note : ce fichier est volontairement gros — il concentre toute la
 * logique d'orchestration. Les détails métier sont délégués aux libs
 * (`lib/stats.ts`, `lib/animeScoreUtils.ts`, `lib/compareEntries.ts`…)
 * et aux hooks du dossier `hooks/`.
 */
function App() {
  /* ─── État local : navigation, sélection de période, caches d'activités ── */
  const [headerSearchFocused, setHeaderSearchFocused] = useState(false);
  const [quickPickResolvedAvatars, setQuickPickResolvedAvatars] = useState<Record<string, string | null | undefined>>({});
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(0);
  const [animeActivityCache, setAnimeActivityCache] = useState<ActivityCacheByYear>({});
  const [mangaActivityCache, setMangaActivityCache] = useState<ActivityCacheByYear>({});
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityLoadingMessage, setActivityLoadingMessage] = useState("Chargement des activites...");
  const [activityWarning, setActivityWarning] = useState<string | null>(null);
  const [resourceStatus, setResourceStatus] = useState<Record<string, unknown>>({});
  const [rateLimitState, setRateLimitState] = useState(() => getRateLimitState());
  const [proxyCacheStats, setProxyCacheStats] = useState(() => getProxyCacheStats());
  const [fetchLog, setFetchLog] = useState<readonly FetchLogEntry[]>(() => getFetchLog());
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [debugMetricsView, setDebugMetricsView] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const profileInFlightRef = useRef(new Map<string, Promise<unknown>>());
  const activityInFlightRef = useRef(new Map<string, Promise<ActivityItem[]>>());
  const profileAbortRef = useRef<AbortController | null>(null);
  const profileAbortKeyRef = useRef<string | null>(null);
  /** Réponses d’activités async plus anciennes qu’un changement de profil sont ignorées (évite mélange A/B). */
  const latestUserIdRef = useRef<number | null>(null);
  /** Profil que l’utilisateur consulte (requêtes !background). Les refresh stale en arrière-plan ne doivent pas l’écraser. */
  const activeProfileIntentRef = useRef<string | null>(null);
  /** Dernier profil chargé hors arrière-plan : pour réinitialiser période au changement d’utilisateur. */
  const lastForegroundProfileKeyRef = useRef<string | null>(null);
  const activityCooldownRef = useRef(new Map<string, number>());
  const activityRetryCountRef = useRef(new Map<string, number>());
  const activityYearsInFlightRef = useRef(new Set<number>());
  const activityMissLogRef = useRef(new Set<string>());
  /*
   * Index `mediaId → { duration, episodes, chapters, format, countryOfOrigin }`
   * construit à partir des listes chargées. Sert à enrichir les activités
   * (LIST_ACTIVITY_QUERY allégée à `media { id }` pour économiser le payload)
   * au moment du fetch. Tenu à jour via un `useEffect` qui écoute
   * `allAnime` + `allManga` ; la ref reste stable, seul le Map interne est
   * remplacé quand les listes changent.
   */
  const mediaBitsByIdRef = useRef<Map<number, ActivityMediaBits>>(new Map());
  const headerSearchInputRef = useRef(null);
  /*
   * Compteurs in-memory (non persistés) pour le debug panel local : hits /
   * miss du cache, nombre d'erreurs rate-limit, durée cumulée des fetchs
   * profil. Exposés via `window.AniListStatDebug.getMetrics()` en dev.
   */
  const metricsRef = useRef({
    cacheHit: 0,
    cacheMiss: 0,
    cacheWrite: 0,
    rateLimitErrors: 0,
    profileFetchCount: 0,
    profileFetchTotalMs: 0,
  });

  /* ─── Effets globaux (migration cache, scroll, debug logs) ──────────── */

  /**
   * Mémorise l'état courant (loading / success / error) d'une ressource
   * réseau indexée par clé. Agrège dans `resourceStatus` ; utilisé par le
   * panneau de debug et pour produire des logs en dev uniquement.
   */
  const setResource = useCallback((key, status, error = null) => {
    setResourceStatus((prev) => ({
      ...prev,
      [key]: {
        status,
        error,
        at: Date.now(),
      },
    }));
  }, []);

  useEffect(() => {
    const threshold = 420;
    const onScroll = () => {
      const y = window.scrollY ?? document.documentElement?.scrollTop ?? 0;
      setShowBackToTop(y > threshold);
    };
    onScroll();
    const scrollOpts: AddEventListenerOptions = { passive: true };
    window.addEventListener("scroll", onScroll, scrollOpts);
    return () => window.removeEventListener("scroll", onScroll, scrollOpts);
  }, []);

  const metricInc = useCallback((field, amount = 1) => {
    metricsRef.current[field] = (metricsRef.current[field] || 0) + amount;
  }, []);

  const metricProfileFetchDuration = useCallback((ms) => {
    metricsRef.current.profileFetchCount += 1;
    metricsRef.current.profileFetchTotalMs += ms;
    // Persisté pour alimenter l'ETA du loader principal au prochain démarrage
    // (cf. `LoadingBlock` sur la page « Préparation du tableau de bord »).
    recordProfileFetch(ms);
  }, []);

  /* ─── Chargement du profil (useProfileLoader) ─────────────────────────
   * Les refs ci-dessous sont partagées avec useActivityYearsLoader pour
   * que les deux hooks se coordonnent (annulation croisée, éviction du
   * cache d'activités lors d'un changement de profil, etc.). */
  const profileLoaderRefs = {
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
  };

  const profileCross = useMemo(
    () => ({
      setTab,
      setYear,
      setMonth,
      setAnimeActivityCache,
      setMangaActivityCache,
      setLoadingActivities,
      setActivityWarning,
      setResourceStatus,
      setResource,
    }),
    [
      setTab,
      setYear,
      setMonth,
      setAnimeActivityCache,
      setMangaActivityCache,
      setLoadingActivities,
      setActivityWarning,
      setResourceStatus,
      setResource,
    ]
  );

  const profile = useProfileLoader(profileLoaderRefs, profileCross, metricInc, metricProfileFetchDuration);

  /*
   * On ne destructure pas `animeActivities` / `mangaActivities` : on passe
   * directement par `animeActivityCache` / `mangaActivityCache` (cache par
   * année), alimentés par useActivityYearsLoader. Les setters sont exposés
   * pour qu'on puisse réinitialiser le cache du loader au changement de
   * profil.
   */
  const {
    inputVal,
    setInputVal,
    hashTick,
    loading,
    error,
    setError,
    apiDisabled,
    user,
    loaded,
    allAnime,
    allManga,
    setAnimeActivities,
    setMangaActivities,
    pendingProfileName,
    lastSupabaseSyncAt,
    backgroundRefreshing,
    refreshCurrentProfile,
  } = profile;

  const appUser = user as AniListUser | null;
  const isAllTime = year === ALL_TIME_YEAR;

  useEffect(() => {
    if (!IS_DEV_LOCAL) return;
    window.AniListStatDebug = {
      getMetrics: () => {
        const m = metricsRef.current;
        const avgProfileFetchMs = m.profileFetchCount > 0
          ? Math.round(m.profileFetchTotalMs / m.profileFetchCount)
          : 0;
        return { ...m, avgProfileFetchMs };
      },
      resetMetrics: () => {
        metricsRef.current = {
          cacheHit: 0,
          cacheMiss: 0,
          cacheWrite: 0,
          rateLimitErrors: 0,
          profileFetchCount: 0,
          profileFetchTotalMs: 0,
        };
      },
      getProxyCacheStats: () => getProxyCacheStats(),
    };
    return () => {
      delete window.AniListStatDebug;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = subscribeRateLimit((state) => setRateLimitState(state));
    return () => {
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    const unsubscribe = subscribeProxyCache((state) => setProxyCacheStats(state));
    return () => {
      unsubscribe();
    };
  }, []);
  useEffect(() => {
    /*
     * Le journal de requêtes alimente le panneau de debug : chaque appel
     * `fetchAL` y ajoute une ligne détaillée (durée, taille, cache proxy,
     * statut HTTP). On s'abonne tout le temps (poids négligeable : 80
     * entrées max en buffer circulaire).
     */
    const unsubscribe = subscribeFetchLog((log) => setFetchLog(log));
    return () => {
      unsubscribe();
    };
  }, []);

  /* ─── Activités : années à charger pour la période courante ───────────
   * On charge l'année sélectionnée + éventuellement l'année précédente
   * quand on affiche « toute l'année » ou janvier (le tooltip de
   * comparaison remonte jusqu'à N-1). Borne inférieure 1970 pour éviter
   * les dates invalides issues de données AniList corrompues. */
  const activityYearsScope = useMemo(() => {
    if (isAllTime) return [ALL_TIME_YEAR];
    const s = new Set([year]);
    if (month === 0 || month === 1) s.add(year - 1);
    return [...s].filter((y) => y >= 1970);
  }, [isAllTime, year, month]);

  const activityYearsPendingCount = useMemo(() => {
    if (!appUser?.id) return 0;
    return activityYearsScope.filter((y) => !animeActivityCache[y] || !mangaActivityCache[y]).length;
  }, [activityYearsScope, appUser?.id, animeActivityCache, mangaActivityCache]);

  const activityLoadDebug = useMemo(() => {
    if (!appUser?.id) return null;
    const years = activityYearsScope;
    let yearsComplete = 0;
    let animeRows = 0;
    let mangaRows = 0;
    for (const yy of years) {
      const a = animeActivityCache[yy];
      const m = mangaActivityCache[yy];
      if (a && m) yearsComplete += 1;
      if (Array.isArray(a)) animeRows += a.length;
      if (Array.isArray(m)) mangaRows += m.length;
    }
    return {
      yearsTotal: years.length,
      yearsComplete,
      yearsPending: years.length - yearsComplete,
      animeRows,
      mangaRows,
    };
  }, [appUser?.id, activityYearsScope, animeActivityCache, mangaActivityCache]);

  const { displayActivityLoadingMessage, activityEtaSeconds, activityEtaLabel } = useActivityLoadingUi({
    loadingActivities,
    activityLoadingMessage,
    userId: appUser?.id,
    activityYearsPendingCount,
  });

  const rateInfoLabel = useMemo(() => {
    const blockedMs = rateLimitState?.blockedForMs || 0;
    if (blockedMs > 5000) {
      const sec = Math.ceil(blockedMs / 1000);
      return `API en cooldown ~${sec}s`;
    }
    return null;
  }, [rateLimitState]);

  const apiStatusBadge = useMemo(() => {
    const blockedMs = rateLimitState?.blockedForMs || 0;
    const queued = rateLimitState?.queued || 0;
    const inFlight = rateLimitState?.inFlight || 0;
    if (blockedMs > 0) {
      return { label: `API en pause ${Math.ceil(blockedMs / 1000)}s`, color: C.orange };
    }
    if (queued > 0 || inFlight > 0) {
      return { label: `API chargee (${queued + inFlight})`, color: C.accent };
    }
    return { label: "API OK", color: C.green };
  }, [rateLimitState]);
  const showApiBadge = IS_DEV_LOCAL || (rateLimitState?.blockedForMs || 0) > 0;
  const syncStatusLabel = useMemo(
    () => formatSyncRelativeTime(lastSupabaseSyncAt),
    [lastSupabaseSyncAt]
  );

  useEffect(() => {
    if (!IS_DEV_LOCAL || !showDevPanel) return undefined;
    const update = () => {
      const getter = window.AniListStatDebug?.getMetrics;
      if (typeof getter === "function") setDebugMetricsView(getter());
    };
    update();
    const id = setInterval(update, 1200);
    return () => clearInterval(id);
  }, [showDevPanel]);

  /* Setter simple pour le sélecteur de période (chips + floating chip). */
  const changeYear = (y: number) => {
    setYear(y);
    if (y === ALL_TIME_YEAR) setMonth(0);
  };

  /**
   * Soumission du champ de recherche du header : on blurre l'input pour
   * fermer le dropdown de quick-picks, puis on met à jour le hash — le
   * `useProfileLoader` réagit au changement de hash pour lancer le fetch.
   */
  const handleSubmit = () => {
    const q = inputVal.trim();
    if (!q) return;
    headerSearchInputRef.current?.blur();
    setHeaderSearchFocused(false);
    window.location.hash = profileHashForUserName(q);
  };

  /*
   * Années navigables, dérivées des listes chargées : union de l'année
   * courante + toutes les années trouvées dans `updatedAt`, `startedAt`
   * ou `completedAt`, puis remplissage des trous (pour que le sélecteur
   * affiche une plage continue). Tri décroissant (plus récent en tête).
   */
  const years = useMemo((): number[] => {
    const nowYear = new Date().getFullYear();
    const ys = new Set<number>([nowYear]);
    [...allAnime, ...allManga].forEach((e) => {
      if (e.updatedAt) ys.add(new Date(e.updatedAt * 1000).getFullYear());
      if (e.startedAt?.year != null) ys.add(Number(e.startedAt.year));
      if (e.completedAt?.year != null) ys.add(Number(e.completedAt.year));
    });
    const arr = [...ys];
    if (arr.length === 0) return [nowYear];
    const minY = Math.min(...arr);
    const maxY = Math.max(...arr);
    const filled = new Set<number>();
    for (let y = minY; y <= maxY; y += 1) filled.add(y);
    return [...filled].sort((a, b) => b - a);
  }, [allAnime, allManga]);

  const provisionalAllTimeActivityCaches = useMemo(() => {
    if (!isAllTime) return null;
    if (animeActivityCache[ALL_TIME_YEAR] && mangaActivityCache[ALL_TIME_YEAR]) return null;
    const annualYears = years.filter(
      (y) => y >= 1970 && animeActivityCache[y]?.length && mangaActivityCache[y]?.length
    );
    if (annualYears.length === 0) return null;
    return {
      anime: mergeActivityRowsForPreview(annualYears.map((y) => animeActivityCache[y])),
      manga: mergeActivityRowsForPreview(annualYears.map((y) => mangaActivityCache[y])),
      years: annualYears,
    };
  }, [isAllTime, years, animeActivityCache, mangaActivityCache]);

  const effectiveAnimeActivityCache = useMemo(
    () =>
      provisionalAllTimeActivityCaches
        ? { ...animeActivityCache, [ALL_TIME_YEAR]: provisionalAllTimeActivityCaches.anime }
        : animeActivityCache,
    [animeActivityCache, provisionalAllTimeActivityCaches]
  );
  const effectiveMangaActivityCache = useMemo(
    () =>
      provisionalAllTimeActivityCaches
        ? { ...mangaActivityCache, [ALL_TIME_YEAR]: provisionalAllTimeActivityCaches.manga }
        : mangaActivityCache,
    [mangaActivityCache, provisionalAllTimeActivityCaches]
  );

  useEffect(() => {
    if (year !== ALL_TIME_YEAR && years.length && !years.includes(year)) {
      setYear(years[0]);
    }
  }, [years, year]);

  /*
   * Reconstruit l'index media quand les listes changent (profil rechargé,
   * listes hydratées depuis le cache, etc.). L'index est ensuite lu par
   * `useActivityYearsLoader` via `mediaBitsByIdRef` pour enrichir les
   * activités fetchées avec les champs nécessaires aux stats (durée, format,
   * pays…), sans avoir à les demander à chaque activité côté GraphQL.
   */
  useEffect(() => {
    mediaBitsByIdRef.current = buildMediaBitsIndex([allAnime, allManga]);
  }, [allAnime, allManga]);

  const activityLoaderRefs = {
    latestUserIdRef,
    activityInFlightRef,
    activityCooldownRef,
    activityRetryCountRef,
    activityYearsInFlightRef,
    activityMissLogRef,
    mediaBitsByIdRef,
  };

  const activityUserForLoader = appUser
    ? { id: appUser.id, name: appUser.name }
    : null;

  const { retryYearNow, handleRetryComparisonNow, refreshCurrentActivities } = useActivityYearsLoader({
    loaded,
    user: activityUserForLoader,
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
    refs: activityLoaderRefs,
  });
  const handleManualRefreshProfile = useCallback(() => {
    refreshCurrentProfile();
    refreshCurrentActivities();
  }, [refreshCurrentActivities, refreshCurrentProfile]);

  /* ─── Calculs dérivés de la période courante ──────────────────────────
   * Tout ce qui suit est recalculé quand `year`, `month`, ou les caches
   * d'activités changent. Le pattern est systématiquement : (1) fusionner
   * les activités utiles pour la période via `mergeActivitiesForDelta`,
   * (2) en tirer un set de médias « actifs sur la période », (3) filtrer
   * les entrées complètes sur cette base. On évite ainsi de recalculer
   * à chaque frame et on garantit une sémantique unique pour « sur cette
   * période ».
   */

  /* Activités pertinentes pour les totaux globaux (overview) : on garde
   * aussi l'année N-1 quand on compare. */
  const mergedAnimeForTotals = useMemo(
    () => mergeActivitiesForDelta(year, effectiveAnimeActivityCache),
    [year, effectiveAnimeActivityCache]
  );
  const mergedMangaForTotals = useMemo(
    () => mergeActivitiesForDelta(year, effectiveMangaActivityCache),
    [year, effectiveMangaActivityCache]
  );

  const animeMediaIdsWithProgress = useMemo(
    () => getMediaIdsWithProgressInPeriod(mergedAnimeForTotals, year, month, "anime"),
    [mergedAnimeForTotals, year, month]
  );
  const mangaMediaIdsWithProgress = useMemo(
    () => getMediaIdsWithProgressInPeriod(mergedMangaForTotals, year, month, "manga"),
    [mergedMangaForTotals, year, month]
  );

  /**
   * Prédicat unifié « cette entrée concerne-t-elle la période (y, m) ? ».
   * Retourne vrai si **au moins une** des conditions suivantes est remplie :
   *  - il y a eu de la progression (épisode / chapitre) durant la période
   *    — détecté via l'ensemble `activeIds` calculé à partir des activités ;
   *  - l'entrée a été **terminée** dans la période (mois = 0 = année entière) ;
   *  - l'entrée a été **démarrée** dans la période.
   *
   * Cela évite de rater les médias marqués « complétés » mais sans activity
   * détaillée, ou à l'inverse de compter des médias juste planifiés.
   */
  const isEntryInPeriod = useCallback((e, y, m, activeIds) => {
    if (y === ALL_TIME_YEAR) return e?.status !== "PLANNING";
    const mediaId = e?.media?.id;
    const hasProgressInPeriod = Boolean(mediaId && activeIds?.has(mediaId));
    const hasCompletedInPeriod = completedInYear(e, y) && (m === 0 || completedInMonth(e, y, m));
    const hasStartedInPeriod = startedInYear(e, y) && (m === 0 || startedInMonth(e, y, m));
    return hasProgressInPeriod || hasCompletedInPeriod || hasStartedInPeriod;
  }, []);

  const animeEntries = useMemo(() => {
    const filtered = allAnime.filter((e) => isEntryInPeriod(e, year, month, animeMediaIdsWithProgress));
    const out = dedupeEntriesByMedia(filtered);
    return out.items;
  }, [allAnime, animeMediaIdsWithProgress, isEntryInPeriod, year, month]);
  const mangaEntries = useMemo(() => {
    const filtered = allManga.filter((e) => isEntryInPeriod(e, year, month, mangaMediaIdsWithProgress));
    const out = dedupeEntriesByMedia(filtered);
    return out.items;
  }, [allManga, mangaMediaIdsWithProgress, isEntryInPeriod, year, month]);

  /** Onglets Anime / Manga : exclure le statut « planifié » (hors sens pour stats & listes). */
  const animeTabEntries = useMemo(
    () => animeEntries.filter((e) => e.status !== "PLANNING"),
    [animeEntries]
  );
  const mangaTabEntries = useMemo(
    () => mangaEntries.filter((e) => e.status !== "PLANNING"),
    [mangaEntries]
  );
  const animePlanningEntries = useMemo(() => {
    if (!isAllTime) return [];
    const out = dedupeEntriesByMedia(allAnime.filter((e) => e.status === "PLANNING"));
    return out.items;
  }, [allAnime, isAllTime]);
  const mangaPlanningEntries = useMemo(() => {
    if (!isAllTime) return [];
    const out = dedupeEntriesByMedia(allManga.filter((e) => e.status === "PLANNING"));
    return out.items;
  }, [allManga, isAllTime]);

  const animeTabMediaIds = useMemo(
    () =>
      new Set(
        animeTabEntries
          .map((e) => e.media?.id)
          .filter((id): id is number => typeof id === "number")
      ),
    [animeTabEntries]
  );
  const mangaTabMediaIds = useMemo(
    () =>
      new Set(
        mangaTabEntries
          .map((e) => e.media?.id)
          .filter((id): id is number => typeof id === "number")
      ),
    [mangaTabEntries]
  );

  const mergedAnimeForTabTotals = useMemo(
    () =>
      mergedAnimeForTotals.filter((a) => {
        const id = a.media?.id;
        return typeof id === "number" && animeTabMediaIds.has(id);
      }),
    [mergedAnimeForTotals, animeTabMediaIds]
  );
  const mergedMangaForTabTotals = useMemo(
    () =>
      mergedMangaForTotals.filter((a) => {
        const id = a.media?.id;
        return typeof id === "number" && mangaTabMediaIds.has(id);
      }),
    [mergedMangaForTotals, mangaTabMediaIds]
  );

  const animeTabActivityTotals = useMemo(
    () => computePeriodAnimeActivityTotals(mergedAnimeForTabTotals, year, month),
    [mergedAnimeForTabTotals, year, month]
  );
  const totalEpAnimeTab = useMemo(
    () =>
      isAllTime
        ? animeTabEntries.reduce((sum, entry) => sum + entryProgressTotal(entry, "anime"), 0)
        : animeTabActivityTotals.episodes,
    [animeTabActivityTotals.episodes, animeTabEntries, isAllTime]
  );
  const totalMinAnimeTab = useMemo(
    () =>
      isAllTime
        ? animeTabEntries.reduce((sum, entry) => {
            const episodes = entryProgressTotal(entry, "anime");
            const duration = Number(entry.media?.duration || 24) || 24;
            return sum + episodes * duration;
          }, 0)
        : animeTabActivityTotals.minutes,
    [animeTabActivityTotals.minutes, animeTabEntries, isAllTime]
  );
  const totalChMangaTab = useMemo(
    () =>
      isAllTime
        ? mangaTabEntries.reduce((sum, entry) => sum + entryProgressTotal(entry, "manga"), 0)
        : computePeriodDeltaFromActivities(mergedMangaForTabTotals, year, month, "manga"),
    [isAllTime, mangaTabEntries, mergedMangaForTabTotals, year, month]
  );

  const totalEp = totalEpAnimeTab;
  const totalCh = totalChMangaTab;
  const totalVol = useMemo(
    () => mangaTabEntries.reduce((s, e) => s + (e.progressVolumes || 0), 0),
    [mangaTabEntries]
  );
  const scoredATab = useMemo(() => animeTabEntries.filter((e) => e.score > 0), [animeTabEntries]);
  const scoredMTab = useMemo(() => mangaTabEntries.filter((e) => e.score > 0), [mangaTabEntries]);
  const avgATab = scoredATab.length
    ? (scoredATab.reduce((s, e) => s + e.score, 0) / scoredATab.length).toFixed(1)
    : "—";
  const avgA = avgATab;
  const avgM = scoredMTab.length
    ? (scoredMTab.reduce((s, e) => s + e.score, 0) / scoredMTab.length).toFixed(1)
    : "—";

  /**
   * Dispersion (σ) des écarts note perso − moyenne AniList du média (échelle /10).
   * Mesure pure de l'amplitude typique d'un écart, indépendante du sens. La direction
   * moyenne (sur-notation / sous-notation) est lisible dans le scatter « Ta note vs AniList ».
   */
  const animeVsCommunityScoreStdDev = useMemo(() => {
    const deltas = [];
    for (const e of animeTabEntries) {
      if (e.score <= 0) continue;
      const raw = Number(e.media?.averageScore);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const meanSiteOn10 = raw / 10;
      deltas.push(e.score - meanSiteOn10);
    }
    const n = deltas.length;
    if (n < 2) return "—";
    const meanDelta = deltas.reduce((s, d) => s + d, 0) / n;
    const variance = deltas.reduce((s, d) => s + (d - meanDelta) ** 2, 0) / (n - 1);
    return Math.sqrt(variance).toFixed(2);
  }, [animeTabEntries]);

  /**
   * Top tags AniList sur la période (anime).
   *
   * Approche choisie : on compte le nombre d'œuvres de la période portant chaque tag,
   * en filtrant par défaut les spoilers (media + génériques) et les tags adultes.
   * On garde aussi le `meanRank` pour départager les égalités et calibrer l'intensité visuelle.
   */
  const animeTopTagsData = useMemo(
    () => computePeriodTopTags(animeTabEntries),
    [animeTabEntries]
  );

  /** Top tags AniList sur la période (manga). Mêmes filtres par défaut que côté anime. */
  const mangaTopTagsData = useMemo(
    () => computePeriodTopTags(mangaTabEntries),
    [mangaTabEntries]
  );

  /** Genres (onglet Anime) : entrées anime de la période uniquement. */
  const animeGenrePeriodData = useMemo(() => {
    const genreCount: Record<string, number> = {};
    animeTabEntries.forEach((e) =>
      (e.media?.genres || []).forEach((g) => {
        genreCount[g] = (genreCount[g] || 0) + 1;
      })
    );
    return Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [animeTabEntries]);

  /** Répartition des scores : tranches 1 à 10 par pas de 0,5 (effectifs, y compris 0). */
  const animeScoreHalfDistributionRows = useMemo(() => {
    if (scoredATab.length === 0) return [];
    return buildAnimeHalfScoreDistributionFullRange(scoredATab);
  }, [scoredATab]);

  const animeEpisodesByFormatData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchEpisodesByFormat(mergedAnimeForTabTotals, year, month);
      const byFormat = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const key = entry.media?.format || "OTHER";
        byFormat.set(key, (byFormat.get(key) || 0) + entryProgressTotal(entry, "anime"));
      });
      return [...byFormat.entries()]
        .map(([name, episodes]) => ({ name, episodes }))
        .sort((a, b) => b.episodes - a.episodes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );
  const animeMinutesByFormatData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchMinutesByFormat(mergedAnimeForTabTotals, year, month);
      const byFormat = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const key = entry.media?.format || "OTHER";
        const minutes = entryProgressTotal(entry, "anime") * (Number(entry.media?.duration || 24) || 24);
        byFormat.set(key, (byFormat.get(key) || 0) + minutes);
      });
      return [...byFormat.entries()]
        .map(([name, minutes]) => ({ name, minutes }))
        .sort((a, b) => b.minutes - a.minutes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );
  const animeEpisodesByCountryData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchEpisodesByCountry(mergedAnimeForTabTotals, year, month);
      const byCountry = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const raw = String(entry.media?.countryOfOrigin || "").trim();
        const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
        byCountry.set(code, (byCountry.get(code) || 0) + entryProgressTotal(entry, "anime"));
      });
      return [...byCountry.entries()]
        .map(([code, episodes]) => ({ code, episodes }))
        .sort((a, b) => b.episodes - a.episodes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );
  const animeMinutesByCountryData = useMemo(
    () => {
      if (!isAllTime) return computePeriodWatchMinutesByCountry(mergedAnimeForTabTotals, year, month);
      const byCountry = new Map<string, number>();
      animeTabEntries.forEach((entry) => {
        const raw = String(entry.media?.countryOfOrigin || "").trim();
        const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
        const minutes = entryProgressTotal(entry, "anime") * (Number(entry.media?.duration || 24) || 24);
        byCountry.set(code, (byCountry.get(code) || 0) + minutes);
      });
      return [...byCountry.entries()]
        .map(([code, minutes]) => ({ code, minutes }))
        .sort((a, b) => b.minutes - a.minutes);
    },
    [animeTabEntries, isAllTime, mergedAnimeForTabTotals, year, month]
  );

  /** Genres (onglet Manga) : entrées manga de la période uniquement. */
  const mangaGenrePeriodData = useMemo(() => {
    const genreCount: Record<string, number> = {};
    mangaTabEntries.forEach((e) =>
      (e.media?.genres || []).forEach((g) => {
        genreCount[g] = (genreCount[g] || 0) + 1;
      })
    );
    return Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [mangaTabEntries]);

  /** Répartition des scores manga : tranches 1 à 10 par pas de 0,5 (effectifs, y compris 0). */
  const mangaScoreHalfDistributionRows = useMemo(() => {
    if (scoredMTab.length === 0) return [];
    return buildAnimeHalfScoreDistributionFullRange(scoredMTab);
  }, [scoredMTab]);

  const mangaChaptersByFormatData = useMemo(
    () => {
      if (!isAllTime) return computePeriodReadChaptersByFormat(mergedMangaForTabTotals, year, month);
      const byFormat = new Map<string, number>();
      mangaTabEntries.forEach((entry) => {
        const key = entry.media?.format || "OTHER";
        byFormat.set(key, (byFormat.get(key) || 0) + entryProgressTotal(entry, "manga"));
      });
      return [...byFormat.entries()]
        .map(([name, chapters]) => ({ name, chapters }))
        .sort((a, b) => b.chapters - a.chapters);
    },
    [isAllTime, mangaTabEntries, mergedMangaForTabTotals, year, month]
  );
  const mangaChaptersByCountryData = useMemo(
    () => {
      if (!isAllTime) return computePeriodReadChaptersByCountry(mergedMangaForTabTotals, year, month);
      const byCountry = new Map<string, number>();
      mangaTabEntries.forEach((entry) => {
        const raw = String(entry.media?.countryOfOrigin || "").trim();
        const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
        byCountry.set(code, (byCountry.get(code) || 0) + entryProgressTotal(entry, "manga"));
      });
      return [...byCountry.entries()]
        .map(([code, chapters]) => ({ code, chapters }))
        .sort((a, b) => b.chapters - a.chapters);
    },
    [isAllTime, mangaTabEntries, mergedMangaForTabTotals, year, month]
  );

  const mangaReleaseYearHistogram = useMemo(() => {
    const bins = new Map<number, number>();
    for (const entry of mangaTabEntries) {
      const rawYear = entry.media?.startDate?.year;
      const y = Number(rawYear);
      if (!Number.isFinite(y) || y < 1900) continue;
      bins.set(y, (bins.get(y) || 0) + 1);
    }
    return [...bins.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([yearLabel, count]) => ({ yearLabel: String(yearLabel), count }));
  }, [mangaTabEntries]);

  /* ─── Records / faits marquants ───────────────────────────────────────
   * Un « record » est un superlatif calculé sur la période (meilleur score,
   * plus longue œuvre terminée, plus grande session, plus longue série…).
   * On produit une structure uniforme `{ media, <metric> }` pour chaque
   * record, que la carrousel de records affiche dans un template commun.
   */

  /**
   * Transforme une entrée AniList en référence minimale (id, titre, cover)
   * pour l'affichage dans une card de record. Renvoie `null` si l'entrée
   * n'a pas d'id utilisable, auquel cas le record est ignoré.
   */
  const buildRecordMediaRef = useCallback((entry: AniListEntry | undefined | null) => {
    if (!entry?.media?.id) return null;
    const media = entry.media;
    const title = String(media.title?.english || media.title?.romaji || "Sans titre");
    return {
      id: media.id,
      title,
      coverImageUrl: media.coverImage?.large || media.coverImage?.medium || null,
      coverColor: media.coverImage?.color || null,
      anilistUrl: media.siteUrl || null,
    };
  }, []);

  const findBiggestOpinionGapRecord = useCallback(
    (entries: AniListEntry[]) => {
      let bestEntry: AniListEntry | null = null;
      let bestGap = 0;
      let bestUserScore = 0;
      let bestAverageScore = 0;
      for (const entry of entries) {
        const userScore = Number(entry.score || 0);
        const averageScore = Number(entry.media?.averageScore || 0) / 10;
        if (!Number.isFinite(userScore) || !Number.isFinite(averageScore) || userScore <= 0 || averageScore <= 0) {
          continue;
        }
        const gap = Math.abs(userScore - averageScore);
        if (gap > bestGap) {
          bestEntry = entry;
          bestGap = gap;
          bestUserScore = userScore;
          bestAverageScore = averageScore;
        }
      }
      if (!bestEntry || bestGap <= 0) return null;
      const media = buildRecordMediaRef(bestEntry);
      return media ? { media, gap: bestGap, userScore: bestUserScore, averageScore: bestAverageScore } : null;
    },
    [buildRecordMediaRef]
  );

  const findMostPromisingPlannedRecord = useCallback(
    (entries: AniListEntry[]) => {
      let bestEntry: AniListEntry | null = null;
      let bestAverageScore = 0;
      for (const entry of entries) {
        const averageScore = Number(entry.media?.averageScore || 0);
        if (!Number.isFinite(averageScore) || averageScore <= 0) continue;
        if (averageScore > bestAverageScore) {
          bestEntry = entry;
          bestAverageScore = averageScore;
        }
      }
      if (!bestEntry) return null;
      const media = buildRecordMediaRef(bestEntry);
      return media ? { media, averageScore: bestAverageScore / 10 } : null;
    },
    [buildRecordMediaRef]
  );

  const buildPeriodRecordsBundle = useCallback(
    (
      entries: AniListEntry[],
      activities: typeof mergedAnimeForTabTotals,
      kind: "anime" | "manga",
      planningEntries: AniListEntry[]
    ) => {
      const entryByMediaId = new Map<number, AniListEntry>();
      for (const entry of entries) {
        const mediaId = Number(entry?.media?.id || 0);
        if (mediaId > 0 && !entryByMediaId.has(mediaId)) entryByMediaId.set(mediaId, entry);
      }
      const biggest = computePeriodBiggestSession(activities, year, month, kind);
      const streak = computePeriodLongestStreak(activities, year, month);
      const longest = findPeriodLongestCompleted(entries, year, month, kind);
      const high = findPeriodHighestScore(entries);
      const low = findPeriodLowestScore(entries);
      const first = findPeriodFirstStarted(entries, year, month);
      const last = findPeriodLastStarted(entries, year, month);
      // Premier / dernier de la période « toutes activités confondues » :
      // on balaie les activités brutes, pas les entrées (une session de lecture
      // sur un manga déjà en cours compte, là où `firstStarted` ne retenait
      // que les nouvelles séries).
      const firstAct = findPeriodFirstActivity(activities, year, month);
      const lastAct = findPeriodLastActivity(activities, year, month);
      const fast = findPeriodFastestCompleted(entries, year, month);
      const opinionGap = findBiggestOpinionGapRecord(entries);
      const promisingPlanned = findMostPromisingPlannedRecord(planningEntries);
      const wrap = <T extends { entry: AniListEntry }>(r: T | null) => {
        if (!r) return null;
        const m = buildRecordMediaRef(r.entry);
        return m ? { ...r, media: m } : null;
      };
      // Les activités portent leur `media` au même format qu'une entry, mais
      // pas dans `r.entry` : on adapte en synthétisant une mini-entry pour
      // réutiliser `buildRecordMediaRef` sans duplication.
      const wrapActivity = <T extends { activity: ActivityItem }>(r: T | null) => {
        if (!r) return null;
        const mediaId = Number(r.activity.media?.id || 0);
        if (!mediaId) return null;
        const entry = entryByMediaId.get(mediaId);
        const activityMedia = r.activity.media;
        const media =
          entry?.media && (entry.media.title?.romaji || entry.media.title?.english || entry.media.coverImage?.large)
            ? entry.media
            : activityMedia;
        const m = buildRecordMediaRef({ id: mediaId, media } as AniListEntry);
        return m ? { ...r, media: m } : null;
      };
      const longestM = wrap(longest);
      const highM = wrap(high);
      const lowM = wrap(low);
      const firstM = wrap(first);
      const lastM = wrap(last);
      const firstActM = wrapActivity(firstAct);
      const lastActM = wrapActivity(lastAct);
      const fastM = wrap(fast);
      return {
        biggestSession: biggest,
        longestStreak: streak,
        longestCompleted: longestM ? { media: longestM.media, count: longestM.count } : null,
        highestScore: highM ? { media: highM.media, score: highM.score } : null,
        lowestScore: lowM ? { media: lowM.media, score: lowM.score } : null,
        firstStarted: firstM ? { media: firstM.media, dateLabel: firstM.dateLabel } : null,
        lastStarted: lastM ? { media: lastM.media, dateLabel: lastM.dateLabel } : null,
        firstActivity: firstActM ? { media: firstActM.media, dateLabel: firstActM.dateLabel } : null,
        lastActivity: lastActM ? { media: lastActM.media, dateLabel: lastActM.dateLabel } : null,
        fastestCompleted: fastM ? { media: fastM.media, days: fastM.days } : null,
        biggestOpinionGap: opinionGap,
        mostPromisingPlanned: promisingPlanned,
      };
    },
    [
      year,
      month,
      buildRecordMediaRef,
      findBiggestOpinionGapRecord,
      findMostPromisingPlannedRecord,
    ]
  );

  const animeRecordsData = useMemo(
    () => buildPeriodRecordsBundle(animeTabEntries, mergedAnimeForTabTotals, "anime", animePlanningEntries),
    [animeTabEntries, mergedAnimeForTabTotals, animePlanningEntries, buildPeriodRecordsBundle]
  );

  const mangaRecordsData = useMemo(
    () => buildPeriodRecordsBundle(mangaTabEntries, mergedMangaForTabTotals, "manga", mangaPlanningEntries),
    [mangaTabEntries, mergedMangaForTabTotals, mangaPlanningEntries, buildPeriodRecordsBundle]
  );

  /* ─── Top studios anime ───────────────────────────────────────────────
   * Agrégation du nombre d'épisodes regardés par studio d'animation sur
   * la période. AniList distingue main / non-main studio sur ses edges
   * mais taggue parfois incorrectement `isAnimationStudio: false` sur le
   * main studio. La logique locale ci-dessous privilégie `isMain: true`
   * quoi qu'il arrive pour rester proche de la vérité éditoriale. */
  const animeTopStudios = useMemo(() => {
    function animationStudioNameToId(
      edges:
        | Array<{
            isMain?: boolean | null;
            node?: {
              id?: number | null;
              name?: string | null;
              isAnimationStudio?: boolean | null;
            } | null;
          }>
        | undefined
    ): Map<string, number> {
      const main = new Map<string, number>();
      const other = new Map<string, number>();
      for (const edge of edges || []) {
        const node = edge?.node;
        if (!node) continue;
        const name = String(node.name || "").trim();
        if (!name) continue;
        const id = Number(node.id);
        if (!Number.isFinite(id)) continue;
        const isMainEdge = edge?.isMain === true;
        /*
         * AniList taggue parfois à tort le studio principal d'un anime avec
         * `isAnimationStudio: false` (ex. Lapin Track sur "Seihantai na Kimi to
         * Boku"). On accorde la confiance à `isMain: true` quoi qu'il arrive :
         * par convention AniList, le main studio d'un anime est le studio
         * d'animation principal. Les autres edges restent filtrés strictement
         * pour ne pas remonter des producteurs (Dentsu, Shueisha, AbemaTV…).
         */
        if (isMainEdge) {
          if (!main.has(name)) main.set(name, id);
        } else if (node.isAnimationStudio === true) {
          if (!other.has(name)) other.set(name, id);
        }
      }
      /*
       * Si au moins un main existe, on l'utilise seul ; sinon, on retombe sur
       * les autres studios d'animation déclarés comme tels par AniList.
       */
      return new Map(main.size > 0 ? main : other);
    }
    const progressRangeDelta = (raw: unknown) => {
      const txt = String(raw ?? "").trim();
      const m = txt.match(/(\d+)\s*-\s*(\d+)/);
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return Math.max(0, Math.abs(b - a) + 1);
    };
    const progressNumber = (raw: unknown) => {
      const nums = String(raw ?? "").match(/\d+/g);
      if (!nums || nums.length === 0) return 0;
      return Math.max(...nums.map((n) => Number(n) || 0));
    };
    const rows = new Map<
      string,
      {
        anilistStudioId: number | null;
        count: number;
        scoreSum: number;
        scoreCount: number;
        minutesWatched: number;
        medias: Map<
          number,
          {
            id: number;
            title: string;
            coverImageUrl: string | null;
            anilistUrl: string | null;
            userScore: number;
            averageScore: number;
          }
        >;
      }
    >();
    for (const entry of animeTabEntries) {
      const edges = entry.media?.studios?.edges || [];
      const mediaId = Number(entry.media?.id || 0);
      if (!mediaId) continue;
      const coverImageUrl =
        String(entry.media?.coverImage?.large || entry.media?.coverImage?.medium || "").trim() || null;
      const mediaTitle =
        String(entry.media?.title?.romaji || entry.media?.title?.english || "").trim() || "Titre inconnu";
      const userScore = Number(entry.score || 0);
      const averageScore = Number(entry.media?.averageScore || 0);
      const nameToId = animationStudioNameToId(edges);
      const anilistUrl = anilistMediaUrl({ siteUrl: entry.media?.siteUrl, id: mediaId }, "ANIME");
      for (const name of nameToId.keys()) {
        const sid = nameToId.get(name)!;
        const prev = rows.get(name) || {
          anilistStudioId: null,
          count: 0,
          scoreSum: 0,
          scoreCount: 0,
          minutesWatched: 0,
          medias: new Map(),
        };
        if (prev.anilistStudioId == null) prev.anilistStudioId = sid;
        prev.count += 1;
        if (userScore > 0) {
          prev.scoreSum += userScore;
          prev.scoreCount += 1;
        }
        if (isAllTime) {
          const episodes = entryProgressTotal(entry, "anime");
          const duration = Number(entry.media?.duration || 24) || 24;
          prev.minutesWatched += episodes * duration;
        }
        if (!prev.medias.has(mediaId)) {
          prev.medias.set(mediaId, {
            id: mediaId,
            title: mediaTitle,
            coverImageUrl,
            anilistUrl,
            userScore: Number.isFinite(userScore) ? userScore : 0,
            averageScore: Number.isFinite(averageScore) ? averageScore : 0,
          });
        }
        rows.set(name, prev);
      }
    }
    if (!isAllTime) {
      const chronological = [...mergedAnimeForTabTotals].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      const lastByMedia = new Map<number, number>();
      for (const a of chronological) {
        const mediaId = Number(a?.media?.id || 0);
        if (!mediaId) continue;
        const prev = lastByMedia.has(mediaId) ? (lastByMedia.get(mediaId) || 0) : 0;
        const parsed = progressNumber(a?.progress);
        let current = parsed;
        if (!current) {
          const status = String(a?.status || "").toUpperCase();
          if (status === "COMPLETED") {
            const cap = Number(a?.media?.episodes || 0);
            current = cap > 0 ? Math.max(prev, cap) : prev > 0 ? prev + 1 : 1;
          }
        }
        const explicitDelta = progressRangeDelta(a?.progress);
        const delta = explicitDelta != null ? explicitDelta : Math.max(0, current - prev);
        const mins = delta * (Number(a?.media?.duration || 24) || 24);
        const studioEdges = a?.media?.studios?.edges || [];
        const nameToIdM = animationStudioNameToId(studioEdges);
        for (const name of nameToIdM.keys()) {
          const row = rows.get(name);
          if (row) row.minutesWatched += mins;
        }
        lastByMedia.set(mediaId, current);
      }
    }
    return [...rows.entries()]
      .map(([name, row]) => {
        const mediasSorted = [...row.medias.values()]
          .sort((a, b) => {
            if (b.userScore !== a.userScore) return b.userScore - a.userScore;
            if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
            return a.title.localeCompare(b.title);
          });
        return {
          name,
          anilistStudioId: row.anilistStudioId,
          count: row.count,
          meanUserScore: row.scoreCount > 0 ? row.scoreSum / row.scoreCount : 0,
          minutesWatched: Math.max(0, Math.round(row.minutesWatched)),
          topMedia: mediasSorted.slice(0, 2),
          carouselMedia: mediasSorted.slice(0, 16),
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        if (b.meanUserScore !== a.meanUserScore) return b.meanUserScore - a.meanUserScore;
        if (b.minutesWatched !== a.minutesWatched) return b.minutesWatched - a.minutesWatched;
        return a.name.localeCompare(b.name);
      });
  }, [animeTabEntries, isAllTime, mergedAnimeForTabTotals]);

  /**
   * Top auteurs (manga) — pendant naturel du module « Studios » côté anime.
   *
   * On agrège par identifiant AniList du staff (plus stable que le nom, qui peut
   * varier selon la romanisation). Pour chaque auteur on conserve :
   * - `count` : nombre de manga uniques sur la période où il/elle est crédité·e ;
   * - `meanUserScore` : moyenne des notes utilisateur sur ces manga ;
   * - `chaptersRead` : somme des deltas de chapitres lus sur la période (équivalent
   *   du `minutesWatched` côté studios) ;
   * - `primaryRoleLabel` : libellé FR du rôle dominant (Mangaka, Scénariste,
   *   Illustrateur, Créateur original) ;
   * - `carouselMedia` : top 16 manga associés (triés note user puis communautaire).
   *
   * Les rôles non-créatifs (translator, editor, letterer, assistant, design…) sont
   * filtrés en amont pour ne pas polluer le classement avec des contributeurs
   * secondaires.
   */
  const mangaTopAuthors = useMemo(() => {
    /**
     * Classifie un rôle libre AniList en libellé FR. Renvoie `null` si le rôle
     * n'est pas considéré comme créatif (et doit être ignoré).
     */
    const classifyAuthorRole = (raw: string | null | undefined): string | null => {
      const role = String(raw || "").trim().toLowerCase();
      if (!role) return null;
      /* Exclusions : rôles techniques / d'édition. */
      if (
        role.includes("translator") ||
        role.includes("translation") ||
        role.includes("editor") ||
        role.includes("letterer") ||
        role.includes("lettering") ||
        role.includes("assistant") ||
        role.includes("design") ||
        role.includes("publisher") ||
        role.includes("publication")
      ) {
        return null;
      }
      const hasStory = role.includes("story") || role.includes("script") || role.includes("writer");
      const hasArt = role.includes("art") || role.includes("illustration") || role.includes("illustrator");
      if (hasStory && hasArt) return "Mangaka";
      if (role.includes("original creator") || role.includes("original story") || role.includes("creator")) {
        return "Créateur original";
      }
      if (hasStory) return "Scénariste";
      if (hasArt) return "Illustrateur";
      /* Autres rôles créatifs non reconnus : on les ignore pour limiter le bruit. */
      return null;
    };

    /** Priorité d'un libellé de rôle pour départager le rôle dominant d'un auteur. */
    const ROLE_PRIORITY: Record<string, number> = {
      Mangaka: 4,
      Scénariste: 3,
      Illustrateur: 2,
      "Créateur original": 1,
    };

    const progressRangeDelta = (raw: unknown): number | null => {
      const txt = String(raw ?? "").trim();
      const m = txt.match(/(\d+)\s*-\s*(\d+)/);
      if (!m) return null;
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return Math.max(0, Math.abs(b - a) + 1);
    };
    const progressNumber = (raw: unknown): number => {
      const nums = String(raw ?? "").match(/\d+/g);
      if (!nums || nums.length === 0) return 0;
      return Math.max(...nums.map((n) => Number(n) || 0));
    };

    type MediaRef = {
      id: number;
      title: string;
      coverImageUrl: string | null;
      anilistUrl: string | null;
      userScore: number;
      averageScore: number;
    };
    type AuthorRow = {
      id: number;
      name: string;
      imageUrl: string | null;
      siteUrl: string | null;
      count: number;
      scoreSum: number;
      scoreCount: number;
      chaptersRead: number;
      /** Histogramme des libellés de rôle observés pour cet auteur (toutes œuvres). */
      roleLabelCounts: Map<string, number>;
      medias: Map<number, MediaRef>;
    };

    const rows = new Map<number, AuthorRow>();

    for (const entry of mangaTabEntries) {
      const edges = entry.media?.staff?.edges || [];
      const mediaId = Number(entry.media?.id || 0);
      if (!mediaId) continue;
      const coverImageUrl =
        String(entry.media?.coverImage?.large || entry.media?.coverImage?.medium || "").trim() || null;
      const mediaTitle =
        String(entry.media?.title?.romaji || entry.media?.title?.english || "").trim() || "Titre inconnu";
      const userScore = Number(entry.score || 0);
      const averageScore = Number(entry.media?.averageScore || 0);
      const anilistUrl = anilistMediaUrl({ siteUrl: entry.media?.siteUrl, id: mediaId }, "MANGA");

      /*
       * Un même auteur peut apparaître plusieurs fois sur une œuvre (ex. crédité
       * en « Story » ET « Art »). On déduplique par auteur tout en conservant le
       * rôle « le plus fort » trouvé pour cette œuvre (Story+Art → Mangaka).
       */
      const roleByAuthorOnThisMedia = new Map<number, { name: string; imageUrl: string | null; siteUrl: string | null; roleLabel: string }>();
      for (const edge of edges) {
        const node = edge?.node;
        const id = Number(node?.id);
        if (!Number.isFinite(id) || id <= 0) continue;
        const roleLabel = classifyAuthorRole(edge?.role);
        if (!roleLabel) continue;
        const name = String(
          node?.name?.userPreferred || node?.name?.full || node?.name?.native || ""
        ).trim();
        if (!name) continue;
        const imageUrl =
          String(node?.image?.large || node?.image?.medium || "").trim() || null;
        const siteUrl = String(node?.siteUrl || "").trim() || null;
        const prev = roleByAuthorOnThisMedia.get(id);
        if (!prev || (ROLE_PRIORITY[roleLabel] || 0) > (ROLE_PRIORITY[prev.roleLabel] || 0)) {
          roleByAuthorOnThisMedia.set(id, { name, imageUrl, siteUrl, roleLabel });
        }
      }

      for (const [authorId, info] of roleByAuthorOnThisMedia.entries()) {
        const prev =
          rows.get(authorId) ||
          ({
            id: authorId,
            name: info.name,
            imageUrl: info.imageUrl,
            siteUrl: info.siteUrl,
            count: 0,
            scoreSum: 0,
            scoreCount: 0,
            chaptersRead: 0,
            roleLabelCounts: new Map<string, number>(),
            medias: new Map<number, MediaRef>(),
          } as AuthorRow);
        /* On garde le 1er nom/image/url rencontrés (stables tant que l'auteur reste). */
        if (!prev.imageUrl && info.imageUrl) prev.imageUrl = info.imageUrl;
        if (!prev.siteUrl && info.siteUrl) prev.siteUrl = info.siteUrl;
        prev.count += 1;
        if (userScore > 0) {
          prev.scoreSum += userScore;
          prev.scoreCount += 1;
        }
        if (isAllTime) {
          prev.chaptersRead += entryProgressTotal(entry, "manga");
        }
        prev.roleLabelCounts.set(
          info.roleLabel,
          (prev.roleLabelCounts.get(info.roleLabel) || 0) + 1
        );
        if (!prev.medias.has(mediaId)) {
          prev.medias.set(mediaId, {
            id: mediaId,
            title: mediaTitle,
            coverImageUrl,
            anilistUrl,
            userScore: Number.isFinite(userScore) ? userScore : 0,
            averageScore: Number.isFinite(averageScore) ? averageScore : 0,
          });
        }
        rows.set(authorId, prev);
      }
    }

    /*
     * Calcul des chapitres lus par auteur sur la période : on parcourt les
     * activités triées chronologiquement, on en déduit le delta par media, puis
     * on l'attribue à tous les auteurs créditeurs de ce media. Les activités
     * `LIST_ACTIVITY_QUERY` n'embarquent pas le staff, donc on récupère le
     * mapping media→auteurs depuis `rows.medias`.
     */
    if (!isAllTime) {
      const authorsByMediaId = new Map<number, number[]>();
      for (const [authorId, row] of rows.entries()) {
        for (const mediaId of row.medias.keys()) {
          const list = authorsByMediaId.get(mediaId);
          if (list) list.push(authorId);
          else authorsByMediaId.set(mediaId, [authorId]);
        }
      }
      const chronological = [...mergedMangaForTabTotals].sort(
        (a, b) => (a.createdAt || 0) - (b.createdAt || 0)
      );
      const lastByMedia = new Map<number, number>();
      for (const a of chronological) {
        const mediaId = Number(a?.media?.id || 0);
        if (!mediaId) continue;
        const prev = lastByMedia.get(mediaId) || 0;
        const parsed = progressNumber(a?.progress);
        let current = parsed;
        if (!current) {
          const status = String(a?.status || "").toUpperCase();
          if (status === "COMPLETED") {
            const cap = Number(a?.media?.chapters || 0);
            current = cap > 0 ? Math.max(prev, cap) : prev > 0 ? prev + 1 : 1;
          }
        }
        const explicitDelta = progressRangeDelta(a?.progress);
        const delta = explicitDelta != null ? explicitDelta : Math.max(0, current - prev);
        const authorIds = authorsByMediaId.get(mediaId);
        if (authorIds) {
          for (const aid of authorIds) {
            const row = rows.get(aid);
            if (row) row.chaptersRead += delta;
          }
        }
        lastByMedia.set(mediaId, current);
      }
    }

    return [...rows.values()]
      .map((row) => {
        const mediasSorted = [...row.medias.values()].sort((a, b) => {
          if (b.userScore !== a.userScore) return b.userScore - a.userScore;
          if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
          return a.title.localeCompare(b.title);
        });
        /* Rôle dominant : on prend le libellé le plus fréquent, départage par priorité. */
        let primaryRoleLabel = "";
        let bestCount = -1;
        let bestPriority = -1;
        for (const [label, c] of row.roleLabelCounts.entries()) {
          const pr = ROLE_PRIORITY[label] || 0;
          if (c > bestCount || (c === bestCount && pr > bestPriority)) {
            primaryRoleLabel = label;
            bestCount = c;
            bestPriority = pr;
          }
        }
        return {
          id: row.id,
          name: row.name,
          imageUrl: row.imageUrl,
          siteUrl: row.siteUrl,
          primaryRoleLabel,
          count: row.count,
          meanUserScore: row.scoreCount > 0 ? row.scoreSum / row.scoreCount : 0,
          chaptersRead: Math.max(0, Math.round(row.chaptersRead)),
          carouselMedia: mediasSorted.slice(0, 16),
        };
      })
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        if (b.meanUserScore !== a.meanUserScore) return b.meanUserScore - a.meanUserScore;
        if (b.chaptersRead !== a.chaptersRead) return b.chaptersRead - a.chaptersRead;
        return a.name.localeCompare(b.name);
      });
  }, [isAllTime, mangaTabEntries, mergedMangaForTabTotals]);

  const animeReleaseYearHistogram = useMemo(() => {
    const bins = new Map<number, number>();
    for (const entry of animeTabEntries) {
      const rawYear = entry.media?.seasonYear ?? entry.media?.startDate?.year;
      const y = Number(rawYear);
      if (!Number.isFinite(y) || y < 1900) continue;
      bins.set(y, (bins.get(y) || 0) + 1);
    }
    return [...bins.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([yearLabel, count]) => ({ yearLabel: String(yearLabel), count }));
  }, [animeTabEntries]);

  const animeSeasonHistogram = useMemo(() => {
    const labels: Record<string, string> = {
      WINTER: "Hiver",
      SPRING: "Printemps",
      SUMMER: "Été",
      FALL: "Automne",
    };
    const order = ["WINTER", "SPRING", "SUMMER", "FALL"] as const;
    const counts: Record<string, number> = {
      WINTER: 0,
      SPRING: 0,
      SUMMER: 0,
      FALL: 0,
      UNKNOWN: 0,
    };
    for (const e of animeTabEntries) {
      const s = String(e.media?.season || "").toUpperCase();
      if (s === "WINTER" || s === "SPRING" || s === "SUMMER" || s === "FALL") counts[s]++;
      else counts.UNKNOWN++;
    }
    const out: { key: string; name: string; count: number }[] = [];
    for (const k of order) {
      if (counts[k] > 0) out.push({ key: k, name: labels[k], count: counts[k] });
    }
    if (counts.UNKNOWN > 0) {
      out.push({ key: "UNKNOWN", name: "Non renseigné", count: counts.UNKNOWN });
    }
    return out;
  }, [animeTabEntries]);

  const allTimeActivityYears = useMemo(() => {
    if (!isAllTime) return [];
    const firstYear = getFirstActivityYear([...mergedAnimeForTotals, ...mergedMangaForTotals]);
    const currentYear = new Date().getFullYear();
    return Array.from({ length: currentYear - firstYear + 1 }, (_, i) => firstYear + i);
  }, [isAllTime, mergedAnimeForTotals, mergedMangaForTotals]);

  /* ─── Séries temporelles pour les graphiques « courbes N vs N-1 » ─────
   * Mois = 0 (toute l'année) : on affiche les 12 mois de l'année courante
   * comparés aux 12 mois de l'année précédente.
   * Mois > 0 : on descend au niveau quotidien (jour par jour) pour le
   * mois sélectionné vs même mois de l'année précédente. */
  const mangaChaptersChartData = useMemo(() => {
    if (isAllTime) {
      return allTimeActivityYears.map((activityYear) => ({
        label: String(activityYear),
        current: computePeriodDeltaFromActivities(mergedMangaForTabTotals, activityYear, 0, "manga"),
        compare: 0,
      }));
    }
    const { compareY, compareM } = getComparisonPeriodMeta(year, month);
    const mergedCur = mergeActivitiesForDelta(year, effectiveMangaActivityCache);
    const mergedComp = mergeActivitiesForDelta(compareY, effectiveMangaActivityCache);

    if (month === 0) {
      const curM = computeMonthlyDeltasFromActivities(mergedCur, year, "manga");
      const prevM = computeMonthlyDeltasFromActivities(mergedComp, compareY, "manga");
      return MONTHS.map((name, i) => ({
        label: name,
        current: curM[i + 1] || 0,
        compare: prevM[i + 1] || 0,
      }));
    }
    const curD = computeDailyDeltasInMonth(mergedCur, year, month, "manga");
    const compD = computeDailyDeltasInMonth(mergedComp, compareY, compareM, "manga");
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = i + 1;
      return {
        label: String(d),
        current: curD[d] || 0,
        compare: compD[d] || 0,
      };
    });
  }, [allTimeActivityYears, isAllTime, year, month, effectiveMangaActivityCache, mergedMangaForTabTotals]);

  const animeEpisodesChartData = useMemo(() => {
    if (isAllTime) {
      return allTimeActivityYears.map((activityYear) => ({
        label: String(activityYear),
        current: computePeriodAnimeActivityTotals(mergedAnimeForTabTotals, activityYear, 0).episodes,
        compare: 0,
      }));
    }
    const { compareY, compareM } = getComparisonPeriodMeta(year, month);
    const mergedCur = mergeActivitiesForDelta(year, effectiveAnimeActivityCache);
    const mergedComp = mergeActivitiesForDelta(compareY, effectiveAnimeActivityCache);

    if (month === 0) {
      const curM = computeMonthlyDeltasFromActivities(mergedCur, year, "anime");
      const prevM = computeMonthlyDeltasFromActivities(mergedComp, compareY, "anime");
      return MONTHS.map((name, i) => ({
        label: name,
        current: curM[i + 1] || 0,
        compare: prevM[i + 1] || 0,
      }));
    }
    const curD = computeDailyDeltasInMonth(mergedCur, year, month, "anime");
    const compD = computeDailyDeltasInMonth(mergedComp, compareY, compareM, "anime");
    const dim = new Date(year, month, 0).getDate();
    return Array.from({ length: dim }, (_, i) => {
      const d = i + 1;
      return {
        label: String(d),
        current: curD[d] || 0,
        compare: compD[d] || 0,
      };
    });
  }, [allTimeActivityYears, isAllTime, year, month, effectiveAnimeActivityCache, mergedAnimeForTabTotals]);

  const fmtData = useMemo(() => {
    const fmtCount: Record<string, number> = {};
    animeTabEntries.forEach((e) => {
      const f = e.media?.format || "OTHER";
      fmtCount[f] = (fmtCount[f] || 0) + 1;
    });
    return Object.entries(fmtCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [animeTabEntries]);

  const statusCntA = useMemo(() => {
    const counts: Record<string, number> = {};
    animeTabEntries.forEach((e) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    if (animePlanningEntries.length > 0) counts.PLANNING = animePlanningEntries.length;
    return counts;
  }, [animeTabEntries, animePlanningEntries]);
  const animeStatusEntriesOrdered = useMemo(() => {
    const order = ["COMPLETED", "CURRENT", "PAUSED", "DROPPED", "REPEATING", "PLANNING"];
    return Object.entries(statusCntA).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [statusCntA]);

  const animeCountryEntriesOrdered = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of animeTabEntries) {
      const raw = e.media?.countryOfOrigin;
      const code =
        raw != null && String(raw).trim() !== "" && /^[A-Za-z]{2}$/.test(String(raw).trim())
          ? String(raw).trim().toUpperCase()
          : "__UNKNOWN__";
      counts[code] = (counts[code] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [animeTabEntries]);
  const statusCntM = useMemo(() => {
    const counts: Record<string, number> = {};
    mangaTabEntries.forEach((e) => {
      counts[e.status] = (counts[e.status] || 0) + 1;
    });
    if (mangaPlanningEntries.length > 0) counts.PLANNING = mangaPlanningEntries.length;
    return counts;
  }, [mangaTabEntries, mangaPlanningEntries]);
  const mangaStatusEntriesOrdered = useMemo(() => {
    const order = ["COMPLETED", "CURRENT", "PAUSED", "DROPPED", "REPEATING", "PLANNING"];
    return Object.entries(statusCntM).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [statusCntM]);

  const mangaCountryEntriesOrdered = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of mangaTabEntries) {
      const raw = e.media?.countryOfOrigin;
      const code =
        raw != null && String(raw).trim() !== "" && /^[A-Za-z]{2}$/.test(String(raw).trim())
          ? String(raw).trim().toUpperCase()
          : "__UNKNOWN__";
      counts[code] = (counts[code] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [mangaTabEntries]);

  const mangaFmtData = useMemo(() => {
    const fmtCount: Record<string, number> = {};
    mangaTabEntries.forEach((e) => {
      const f = e.media?.format || "OTHER";
      fmtCount[f] = (fmtCount[f] || 0) + 1;
    });
    return Object.entries(fmtCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }));
  }, [mangaTabEntries]);

  /**
   * Dispersion (σ) des écarts note perso − moyenne AniList du média, côté manga.
   * Même logique que `animeVsCommunityScoreStdDev` : valeur pure de σ, sans signe.
   */
  const mangaVsCommunityScoreStdDev = useMemo(() => {
    const deltas: number[] = [];
    for (const e of mangaTabEntries) {
      if (e.score <= 0) continue;
      const raw = Number(e.media?.averageScore);
      if (!Number.isFinite(raw) || raw <= 0) continue;
      const meanSiteOn10 = raw / 10;
      deltas.push(e.score - meanSiteOn10);
    }
    const n = deltas.length;
    if (n < 2) return "—";
    const meanDelta = deltas.reduce((s, d) => s + d, 0) / n;
    const variance = deltas.reduce((s, d) => s + (d - meanDelta) ** 2, 0) / (n - 1);
    return Math.sqrt(variance).toFixed(2);
  }, [mangaTabEntries]);

  /* Tri unifié « note user desc → moyenne AniList desc → titre » pour que
   * les égalités entre deux œuvres à la même note perso soient tranchées
   * de façon stable et intuitive (priorité aux œuvres mieux notées par la
   * communauté). */
  const sortedATab = useMemo(
    () => [...animeTabEntries].sort(compareEntriesByUserScoreThenAverage),
    [animeTabEntries]
  );
  const sortedMTab = useMemo(
    () => [...mangaTabEntries].sort(compareEntriesByUserScoreThenAverage),
    [mangaTabEntries]
  );

  const topA = sortedATab;
  const topM = sortedMTab;

  /** Carrousel « Top 10 » affiché sur l'overview. 10 est un bon compromis
   * entre richesse et scroll horizontal gérable. */
  const overviewTopCount = 10;
  const overviewTopAnime = useMemo(() => topA.slice(0, overviewTopCount), [topA, overviewTopCount]);
  const overviewTopManga = useMemo(() => topM.slice(0, overviewTopCount), [topM, overviewTopCount]);
  const overviewTopPeriodTitle = isAllTime
    ? "All Time"
    : month === 0
      ? `${year}`
      : `${MONTHS_FULL[month - 1]} ${year}`;

  const {
    overviewMangaTopScrollRef,
    overviewAnimeTopScrollRef,
    overviewMangaTopFades,
    overviewAnimeTopFades,
  } = useOverviewTopScrollFades(
    tab,
    loaded,
    year,
    month,
    overviewTopManga.length,
    overviewTopAnime.length
  );

  const activeDaysCount = useMemo(
    () =>
      isAllTime
        ? countActivityDays([...mergedAnimeForTotals, ...mergedMangaForTotals])
        : countActiveCalendarDays(year, month, mergedAnimeForTotals, mergedMangaForTotals, animeEntries, mangaEntries),
    [isAllTime, year, month, mergedAnimeForTotals, mergedMangaForTotals, animeEntries, mangaEntries]
  );

  /**
   * Heatmap : déltas quotidiens sur l'année courante (clé `YYYY-MM-DD` → valeur).
   *
   * On expose 3 vues :
   * - anime seul (épisodes / jour)
   * - manga seul (chapitres / jour)
   * - combinée pour la vue d'ensemble : somme des deux (« actions / jour »).
   */
  const animeDailyTotalsForYear = useMemo(
    () => computeDailyDeltasInYear(mergedAnimeForTotals, year, "anime"),
    [mergedAnimeForTotals, year]
  );
  const mangaDailyTotalsForYear = useMemo(
    () => computeDailyDeltasInYear(mergedMangaForTotals, year, "manga"),
    [mergedMangaForTotals, year]
  );
  const overviewDailyTotalsForYear = useMemo(() => {
    const merged: Record<string, number> = {};
    for (const [iso, v] of Object.entries(animeDailyTotalsForYear)) {
      merged[iso] = (merged[iso] || 0) + (Number(v) || 0);
    }
    for (const [iso, v] of Object.entries(mangaDailyTotalsForYear)) {
      merged[iso] = (merged[iso] || 0) + (Number(v) || 0);
    }
    return merged;
  }, [animeDailyTotalsForYear, mangaDailyTotalsForYear]);
  const periodDayTotal = useMemo(
    () => (isAllTime ? activeDaysCount : getPeriodDayTotal(year, month)),
    [activeDaysCount, isAllTime, year, month]
  );

  const tabs = [
    {key:"overview",label:"Vue d'ensemble"},
    {key:"manga",label:`Manga (${mangaTabEntries.length})`},
    {key:"anime",label:`Anime (${animeTabEntries.length})`},
  ];

  const chartPeriodLegend = useMemo(() => getComparisonPeriodMeta(year, month), [year, month]);
  const compareAvailability = useMemo(() => {
    const compareY = chartPeriodLegend?.compareY;
    const compareMissing =
      compareY != null && (!animeActivityCache[compareY] || !mangaActivityCache[compareY]);
    const loadingComparison = Boolean(compareMissing && loadingActivities);
    return {
      missing: Boolean(compareMissing),
      compareY,
      loadingComparison,
      loadingLabel: compareY
        ? `Chargement des données pour la courbe de comparaison (${compareY})…`
        : "Chargement des données pour la courbe de comparaison…",
      idleLabel: compareY
        ? `Comparaison ${compareY} indisponible pour le moment`
        : "Comparaison indisponible pour le moment",
    };
  }, [animeActivityCache, chartPeriodLegend, loadingActivities, mangaActivityCache]);

  const hasDashboardData = Boolean(loaded && appUser?.id && Array.isArray(allAnime) && Array.isArray(allManga));
  const displayProfileLoading = loading && !hasDashboardData;

  const awaitingPrimaryYearActivities = useMemo(() => {
    if (!loaded || loading || !appUser?.id) return false;
    if (error) return false;
    const y = year;
    if (y === ALL_TIME_YEAR) {
      if (provisionalAllTimeActivityCaches) return false;
      return !(animeActivityCache[ALL_TIME_YEAR] && mangaActivityCache[ALL_TIME_YEAR]);
    }
    if (y < 1970) return false;
    const a = animeActivityCache[y];
    const m = mangaActivityCache[y];
    return !(a && m);
  }, [loaded, loading, appUser?.id, error, year, provisionalAllTimeActivityCaches, animeActivityCache, mangaActivityCache]);

  const awaitingAllTimeActivities = isAllTime && awaitingPrimaryYearActivities;

  const retryableYears = useMemo((): number[] => {
    if (!appUser?.id) return [];
    const prefix = `activity:${appUser.id}:`;
    const yearsSet = new Set<number>();
    Object.entries(resourceStatus).forEach(([k, meta]) => {
      const m = meta as { status?: string };
      if (!k.startsWith(prefix) || m?.status !== "error") return;
      const parts = k.split(":");
      const y = Number(parts[parts.length - 1]);
      if (!Number.isNaN(y) && y >= 1970) yearsSet.add(y);
    });
    return [...yearsSet].sort((a, b) => b - a);
  }, [resourceStatus, appUser?.id]);

  const {
    transitionActive,
    headerUser,
    headerBannerImage,
    anilistProfileUrl,
    headerQuickPickMatches,
    showHeaderQuickPicks,
  } = useHeaderQuickPicks({
    appUser,
    pendingProfileName,
    loading,
    inputVal,
    headerSearchFocused,
    quickPickResolvedAvatars,
    setQuickPickResolvedAvatars,
  });

  /**
   * Sélection d'un pseudo depuis la liste quick-picks (header) : on remplit
   * l'input pour que l'utilisateur voie ce qu'il a choisi, on ferme le
   * dropdown, puis on met à jour le hash — le `useProfileLoader` prend la
   * relève pour déclencher le fetch.
   */
  const pickQuickProfile = useCallback((name: string) => {
    const n = String(name || "").trim();
    if (!n) return;
    setInputVal(n);
    setHeaderSearchFocused(false);
    headerSearchInputRef.current?.blur();
    window.location.hash = profileHashForUserName(n);
  }, [setInputVal]);

  /* `hashTick` est incrémenté à chaque `hashchange` par `useProfileLoader` ;
   * on s'en sert comme dépendance pour recalculer la route sans écouter
   * `window.location` directement (évite la désynchronisation React).
   * `parseRouteFromHash` lit `window.location.hash`, donc la dep `hashTick`
   * est bien nécessaire côté comportement même si ESLint ne la voit pas. */
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const isLandingHome = useMemo(() => parseRouteFromHash().type === "home", [hashTick]);

  /** Le loader global ne doit bloquer que tant que le profil de base n'est pas affichable. */
  const primaryProfileLoader = useMemo(
    () =>
      displayProfileLoading ||
      (!isLandingHome && !hasDashboardData && error == null),
    [displayProfileLoading, hasDashboardData, isLandingHome, error]
  );

  return (
    <div className="app-root">

      {isLandingHome ? (
        <HomePage
          inputVal={inputVal}
          setInputVal={setInputVal}
          headerSearchInputRef={headerSearchInputRef}
          setHeaderSearchFocused={setHeaderSearchFocused}
          handleSubmit={handleSubmit}
          showHeaderQuickPicks={showHeaderQuickPicks}
          headerQuickPickMatches={headerQuickPickMatches}
          pickQuickProfile={pickQuickProfile}
        />
      ) : (
      <>
      <ProfileAppHeader
        C={C}
        headerBannerImage={headerBannerImage}
        headerSearchInputRef={headerSearchInputRef}
        inputVal={inputVal}
        setInputVal={setInputVal}
        setHeaderSearchFocused={setHeaderSearchFocused}
        showHeaderQuickPicks={showHeaderQuickPicks}
        headerQuickPickMatches={headerQuickPickMatches}
        pickQuickProfile={pickQuickProfile}
        handleSubmit={handleSubmit}
        showApiBadge={showApiBadge}
        apiStatusBadge={apiStatusBadge}
        isDevLocal={IS_DEV_LOCAL}
        showDevPanel={showDevPanel}
        setShowDevPanel={setShowDevPanel}
        headerUser={headerUser}
        transitionActive={transitionActive}
        anilistProfileUrl={anilistProfileUrl}
        syncStatusLabel={syncStatusLabel}
        syncRefreshing={backgroundRefreshing}
        onRefreshProfile={handleManualRefreshProfile}
      />

      <ProfileViewMain
        C={C}
        loaded={loaded}
        loading={displayProfileLoading}
        primaryProfileLoader={primaryProfileLoader}
        awaitingPrimaryYearActivities={awaitingPrimaryYearActivities}
        awaitingAllTimeActivities={awaitingAllTimeActivities}
        hasProvisionalAllTimeActivities={Boolean(provisionalAllTimeActivityCaches)}
        loadingActivities={loadingActivities}
        error={error != null ? String(error) : null}
        apiDisabled={apiDisabled}
        displayActivityLoadingMessage={displayActivityLoadingMessage}
        activityLoadingMessage={activityLoadingMessage}
        activityEtaSeconds={activityEtaSeconds}
        activityEtaLabel={activityEtaLabel}
        rateInfoLabel={rateInfoLabel}
        activityWarning={activityWarning != null ? String(activityWarning) : null}
        handleRetryComparisonNow={handleRetryComparisonNow}
        retryableYears={retryableYears}
        retryYearNow={retryYearNow}
        isDevLocal={IS_DEV_LOCAL}
        showDevPanel={showDevPanel}
        activityLoadDebug={activityLoadDebug}
        rateLimitState={rateLimitState}
        debugMetricsView={debugMetricsView}
        proxyCacheStats={proxyCacheStats}
        setDebugMetricsView={setDebugMetricsView}
        fetchLog={fetchLog}
        resetFetchLog={resetFetchLog}
        animeEntriesCount={allAnime.length}
        mangaEntriesCount={allManga.length}
        tabs={tabs}
        tab={tab}
        setTab={setTab}
        periodYears={years}
        periodYear={year}
        periodMonth={month}
        periodChangeYear={changeYear}
        periodSetMonth={setMonth}
      >
            <div key={tab} className="tab-transition-wrapper">
            {tab === "overview" && (
              <OverviewTab
                year={year}
                month={month}
                totalEp={totalEp}
                totalAnime={animeTabEntries.length}
                totalManga={mangaTabEntries.length}
                totalTimeLabel={fmtMin(totalMinAnimeTab)}
                avgA={avgA}
                animeVsCommunityScoreStdDev={animeVsCommunityScoreStdDev}
                totalCh={totalCh}
                avgM={avgM}
                mangaVsCommunityScoreStdDev={mangaVsCommunityScoreStdDev}
                activeDaysCount={activeDaysCount}
                periodDayTotal={periodDayTotal}
                chartPeriodLegend={chartPeriodLegend}
                compareAvailability={compareAvailability}
                mangaChaptersChartData={mangaChaptersChartData}
                animeEpisodesChartData={animeEpisodesChartData}
                overviewTopCount={overviewTopCount}
                overviewTopPeriodTitle={overviewTopPeriodTitle}
                overviewTopManga={overviewTopManga}
                overviewTopAnime={overviewTopAnime}
                overviewMangaTopFades={overviewMangaTopFades}
                overviewAnimeTopFades={overviewAnimeTopFades}
                overviewMangaTopScrollRef={overviewMangaTopScrollRef}
                overviewAnimeTopScrollRef={overviewAnimeTopScrollRef}
                overviewDailyTotalsForYear={overviewDailyTotalsForYear}
                animeDailyTotalsForYear={animeDailyTotalsForYear}
                mangaDailyTotalsForYear={mangaDailyTotalsForYear}
              />
            )}

            {tab === "anime" && (
              <AnimeTab
                year={year}
                month={month}
                setMonth={setMonth}
                animeEntriesLength={animeTabEntries.length}
                totalEp={totalEpAnimeTab}
                totalMin={totalMinAnimeTab}
                fmtMin={fmtMin}
                avgA={avgATab}
                animeVsCommunityScoreStdDev={animeVsCommunityScoreStdDev}
                animeStatusEntriesOrdered={animeStatusEntriesOrdered}
                animeCountryEntriesOrdered={animeCountryEntriesOrdered}
                fmtData={fmtData}
                animeTabEntries={animeTabEntries}
                animePlanningEntries={animePlanningEntries}
                animeScoreHalfDistributionRows={animeScoreHalfDistributionRows}
                animeGenrePeriodData={animeGenrePeriodData}
                animeTopTagsData={animeTopTagsData}
                animeEpisodesByFormatData={animeEpisodesByFormatData}
                animeMinutesByFormatData={animeMinutesByFormatData}
                animeEpisodesByCountryData={animeEpisodesByCountryData}
                animeMinutesByCountryData={animeMinutesByCountryData}
                animeTopStudios={animeTopStudios}
                animeReleaseYearHistogram={animeReleaseYearHistogram}
                animeSeasonHistogram={animeSeasonHistogram}
                animeRecords={animeRecordsData}
                animeDailyTotalsForYear={animeDailyTotalsForYear}
                animeListLayoutActive={tab === "anime" && loaded}
              />
            )}

            {tab === "manga" && (
              <MangaTab
                year={year}
                month={month}
                setMonth={setMonth}
                mangaEntriesLength={mangaTabEntries.length}
                totalCh={totalChMangaTab}
                totalVol={totalVol}
                avgM={avgM}
                mangaVsCommunityScoreStdDev={mangaVsCommunityScoreStdDev}
                mangaStatusEntriesOrdered={mangaStatusEntriesOrdered}
                mangaCountryEntriesOrdered={mangaCountryEntriesOrdered}
                mangaFmtData={mangaFmtData}
                mangaTabEntries={mangaTabEntries}
                mangaPlanningEntries={mangaPlanningEntries}
                mangaScoreHalfDistributionRows={mangaScoreHalfDistributionRows}
                mangaGenrePeriodData={mangaGenrePeriodData}
                mangaTopTagsData={mangaTopTagsData}
                mangaChaptersByFormatData={mangaChaptersByFormatData}
                mangaChaptersByCountryData={mangaChaptersByCountryData}
                mangaReleaseYearHistogram={mangaReleaseYearHistogram}
                mangaTopAuthors={mangaTopAuthors}
                mangaRecords={mangaRecordsData}
                mangaDailyTotalsForYear={mangaDailyTotalsForYear}
                mangaListLayoutActive={tab === "manga" && loaded}
              />
            )}
            </div>

            <PeriodEmptyBanner
              year={year}
              month={month}
              animeEntriesLength={animeTabEntries.length}
              mangaEntriesLength={mangaTabEntries.length}
            />
      </ProfileViewMain>

      </>
      )}

      <BackToTopButton visible={showBackToTop} />
    </div>
  );
}

export default App;
