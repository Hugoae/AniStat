import { useState, useEffect, useCallback, useMemo, useRef, lazy, Suspense } from 'react';
import {
  C,
  MONTHS_FULL,
  ALL_TIME_YEAR,
} from './config/constants';
import { countActivityDays, mergeActivityRowsForPreview } from "./lib/activityPreview";
import { getFirstKnownUserYear } from "./lib/accountYears";
import { formatSyncAbsoluteDate } from "./lib/dateLabels";
import {
  dedupeEntriesByMedia,
  completedInYear,
  startedInYear,
  completedInMonth,
  startedInMonth,
  fmtMin,
  countActiveCalendarDays,
  getPeriodDayTotal,
  computeDailyDeltasInYear,
  getMediaIdsWithProgressInPeriod,
  getComparisonPeriodMeta,
  mergeActivitiesForDelta,
  buildPeriodDeltaAudit,
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
import { compareEntriesByUserScoreThenAverage } from "./lib/compareEntries";
import {
  buildMediaBitsIndex,
  type ActivityMediaBits,
} from "./lib/activityEnrichment";
import { HomePage } from "./views/HomePage";
import { PeriodEmptyBanner } from "./views/PeriodEmptyBanner";
import { LoadingBlock } from "./components/ui/LoadingBlock";
import {
  IS_DEV_LOCAL,
} from "./lib/profileLocalCache";
import {
  buildProfileHash,
  parseRouteFromHash,
  profileHashForUserName,
} from "./lib/routing";
import { buildWrappedSummary } from "./lib/wrapped";
import { buildOverviewRecentActivities } from "./lib/overviewRecentActivities";
import { usePersistenceStatus, clearPersistenceError } from "./lib/persistenceStatus";
import { recordProfileFetch } from "./lib/profileFetchStats";
import { useProfileLoader } from "./hooks/useProfileLoader";
import { useProfileRecords } from "./hooks/useProfileRecords";
import { useAnimeTabData } from "./hooks/useAnimeTabData";
import { useMangaTabData } from "./hooks/useMangaTabData";
import { useOverviewData } from "./hooks/useOverviewData";
import { useActivityYearsLoader } from "./hooks/useActivityYearsLoader";
import { useActivityLoadingUi } from "./hooks/useActivityLoadingUi";
import { useHeaderQuickPicks } from "./hooks/useHeaderQuickPicks";
import { useOverviewTopScrollFades } from "./hooks/useOverviewTopScrollFades";
import {
  buildOverviewCompareOptions,
  getOverviewEffectiveCompareOptionId,
  resolveOverviewCompareSelection,
} from "./lib/overviewCompare";
import { ProfileAppHeader } from "./components/profile/ProfileAppHeader";
import { ProfileViewMain } from "./components/profile/ProfileViewMain";
import { SiteFooter } from "./components/SiteFooter";
import { BackToTopButton } from "./components/BackToTopButton";
import { ProfilePeriodProvider } from "./contexts/ProfilePeriodContext";
import type { ProfilePeriodValue } from "./contexts/profilePeriodCore";
import type { ActivityCacheByYear, ActivityItem, AniListUser } from "./types/domain";

/*
 * Onglets de profil chargés à la demande (React.lazy) : ils embarquent recharts
 * (~160 ko gzip). Les sortir du bundle d'entrée évite de télécharger la lib de
 * graphiques tant qu'aucun profil n'est ouvert — la page d'accueil reste légère.
 */
const OverviewTab = lazy(() => import("./views/OverviewTab").then((m) => ({ default: m.OverviewTab })));
const AnimeTab = lazy(() => import("./views/AnimeTab").then((m) => ({ default: m.AnimeTab })));
const MangaTab = lazy(() => import("./views/MangaTab").then((m) => ({ default: m.MangaTab })));
const WrappedPage = lazy(() => import("./views/WrappedPage").then((m) => ({ default: m.WrappedPage })));

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

  /* ─── Deep links : URL → state ────────────────────────────────────────
   * À chaque `hashchange` (incrémente `hashTick`), on relit la route et on
   * applique tab / year / month s'ils sont explicitement présents dans la
   * query string. Les valeurs absentes (`null`) laissent l'état courant
   * intact — typique d'une navigation utilisateur basique `#/user/Bob`
   * qui ne doit pas écraser une période choisie auparavant pendant la même
   * session si la logique amont l'a déjà réinitialisée.
   *
   * On garde un ref `hashTickAppliedRef` pour ne pas re-appliquer les
   * valeurs URL après un changement de state local (ce qui créerait des
   * boucles ou des écrasements indésirables). */
  const hashTickAppliedRef = useRef<number | null>(null);
  useEffect(() => {
    if (hashTickAppliedRef.current === hashTick) return;
    hashTickAppliedRef.current = hashTick;
    const r = parseRouteFromHash();
    if (r.type !== "user") return;
    if (r.tab) setTab(r.tab);
    if (r.year != null) setYear(r.year);
    if (r.month != null) setMonth(r.month);
  }, [hashTick]);

  /* ─── Deep links : state → URL ────────────────────────────────────────
   * Quand tab / year / month changent côté UI (chip de période, onglets,
   * etc.), on réécrit la query string du hash via `history.replaceState`.
   * `replaceState` ne déclenche pas `hashchange`, donc pas de boucle.
   *
   * On utilise `parseRouteFromHash()` au lieu de `currentRoute` (mémoïsé
   * via `hashTick`) parce que la donnée importante ici est la route
   * actuelle telle que stockée dans l'URL, pas un snapshot React. */
  useEffect(() => {
    const r = parseRouteFromHash();
    if (r.type !== "user") return;
    const want = buildProfileHash(r.name, { tab, year, month });
    if (window.location.hash === want) return;
    try {
      const path = `${window.location.pathname}${window.location.search}${want}`;
      window.history.replaceState(null, "", path);
    } catch {
      /* ignore */
    }
  }, [tab, year, month, hashTick]);

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
    () => formatSyncAbsoluteDate(lastSupabaseSyncAt),
    [lastSupabaseSyncAt]
  );
  const persistenceStatus = usePersistenceStatus();

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

  /* Setter unique pour le sélecteur de période (chips + floating chip).
   * Mémoïsé pour rester identique entre renders : `periodValue` (voir plus
   * bas) en dépend, et toute nouvelle identité ferait re-render tous les
   * consommateurs du contexte. */
  const changeYear = useCallback((y: number) => {
    setYear(y);
    if (y === ALL_TIME_YEAR) setMonth(0);
  }, []);

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
  const mediaBitsForStats = useMemo(
    () => buildMediaBitsIndex([allAnime, allManga]),
    [allAnime, allManga]
  );

  useEffect(() => {
    mediaBitsByIdRef.current = mediaBitsForStats;
  }, [mediaBitsForStats]);

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

  const { retryYearNow, handleRetryComparisonNow, refreshCurrentActivities, hydrateMissingYearsFromSupabase } =
    useActivityYearsLoader({
    loaded,
    user: activityUserForLoader,
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
  const genreComparisonPeriod = useMemo(() => getComparisonPeriodMeta(year, month), [year, month]);
  const genreCompareYear = genreComparisonPeriod.compareY ?? -1;
  const genreCompareMonth = genreComparisonPeriod.compareM ?? 0;
  const mergedAnimeForGenreComparison = useMemo(
    () => (genreCompareYear >= 1970 ? mergeActivitiesForDelta(genreCompareYear, effectiveAnimeActivityCache) : []),
    [effectiveAnimeActivityCache, genreCompareYear]
  );
  const mergedMangaForGenreComparison = useMemo(
    () => (genreCompareYear >= 1970 ? mergeActivitiesForDelta(genreCompareYear, effectiveMangaActivityCache) : []),
    [effectiveMangaActivityCache, genreCompareYear]
  );
  const animeGenreComparisonMediaIds = useMemo(
    () =>
      genreCompareYear >= 1970
        ? getMediaIdsWithProgressInPeriod(mergedAnimeForGenreComparison, genreCompareYear, genreCompareMonth, "anime")
        : new Set(),
    [genreCompareMonth, genreCompareYear, mergedAnimeForGenreComparison]
  );
  const mangaGenreComparisonMediaIds = useMemo(
    () =>
      genreCompareYear >= 1970
        ? getMediaIdsWithProgressInPeriod(mergedMangaForGenreComparison, genreCompareYear, genreCompareMonth, "manga")
        : new Set(),
    [genreCompareMonth, genreCompareYear, mergedMangaForGenreComparison]
  );
  const animeGenreComparisonTabEntries = useMemo(() => {
    if (genreCompareYear < 1970) return [];
    const filtered = allAnime.filter((e) =>
      isEntryInPeriod(e, genreCompareYear, genreCompareMonth, animeGenreComparisonMediaIds)
    );
    return dedupeEntriesByMedia(filtered).items.filter((e) => e.status !== "PLANNING");
  }, [allAnime, animeGenreComparisonMediaIds, genreCompareMonth, genreCompareYear, isEntryInPeriod]);
  const mangaGenreComparisonTabEntries = useMemo(() => {
    if (genreCompareYear < 1970) return [];
    const filtered = allManga.filter((e) =>
      isEntryInPeriod(e, genreCompareYear, genreCompareMonth, mangaGenreComparisonMediaIds)
    );
    return dedupeEntriesByMedia(filtered).items.filter((e) => e.status !== "PLANNING");
  }, [allManga, genreCompareMonth, genreCompareYear, isEntryInPeriod, mangaGenreComparisonMediaIds]);
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

  const {
    animePeriodProgressByMedia,
    totalEpAnimeTab,
    totalMinAnimeTab,
    avgA,
    animeVsCommunityScoreStdDev,
    animeTopTagsData,
    animeGenrePeriodData,
    animeScoreHalfDistributionRows,
    animeEpisodesByFormatData,
    animeMinutesByFormatData,
    animeEpisodesByCountryData,
    animeMinutesByCountryData,
    animeTopStudios,
    animeReleaseYearHistogram,
    animeSeasonHistogram,
  } = useAnimeTabData({
    animeTabEntries,
    animeComparisonTabEntries: animeGenreComparisonTabEntries,
    mergedAnimeForTabTotals,
    isAllTime,
    year,
    month,
  });

  const {
    mangaPeriodProgressByMedia,
    totalChMangaTab,
    totalVol,
    avgM,
    mangaTopTagsData,
    mangaGenrePeriodData,
    mangaScoreHalfDistributionRows,
    mangaChaptersByFormatData,
    mangaChaptersByCountryData,
    mangaReleaseYearHistogram,
    mangaTopAuthors,
  } = useMangaTabData({
    mangaTabEntries,
    mangaComparisonTabEntries: mangaGenreComparisonTabEntries,
    mergedMangaForTabTotals,
    isAllTime,
    year,
    month,
  });

  const totalEp = totalEpAnimeTab;
  const totalCh = totalChMangaTab;
  const avgATab = avgA;

  const deltaAudit = useMemo(() => {
    if (!IS_DEV_LOCAL) return null;
    return {
      anime: buildPeriodDeltaAudit(mergedAnimeForTabTotals, year, month, "anime"),
      manga: buildPeriodDeltaAudit(mergedMangaForTabTotals, year, month, "manga"),
    };
  }, [mergedAnimeForTabTotals, mergedMangaForTabTotals, month, year]);

  /* ─── Records / faits marquants ───────────────────────────────────────
   * Un « record » est un superlatif calculé sur la période (meilleur score,
   * plus longue œuvre terminée, plus grande session, plus longue série…).
   * On produit une structure uniforme `{ media, <metric> }` pour chaque
   * record, que la carrousel de records affiche dans un template commun.
   */
  const { animeRecordsData, mangaRecordsData } = useProfileRecords({
    year,
    month,
    animeTabEntries,
    mergedAnimeForTabTotals,
    animePlanningEntries,
    mangaTabEntries,
    mergedMangaForTabTotals,
    mangaPlanningEntries,
  });

  const overviewCompareFirstAvailableYear = useMemo(
    () =>
      getFirstKnownUserYear(
        appUser,
        [...mergedAnimeForTotals, ...mergedMangaForTotals],
        [...allAnime, ...allManga]
      ),
    [appUser, mergedAnimeForTotals, mergedMangaForTotals, allAnime, allManga]
  );
  const overviewCompareOptions = useMemo(
    () => buildOverviewCompareOptions(year, month, overviewCompareFirstAvailableYear),
    [year, month, overviewCompareFirstAvailableYear]
  );
  const [overviewCompareOptionId, setOverviewCompareOptionId] = useState<string | null>(null);
  useEffect(() => {
    setOverviewCompareOptionId(null);
  }, [year, month]);

  const resolvedOverviewCompare = useMemo(
    () => resolveOverviewCompareSelection(year, month, overviewCompareOptionId, overviewCompareOptions),
    [year, month, overviewCompareOptionId, overviewCompareOptions]
  );
  const overviewCompareSelectValue = useMemo(
    () => getOverviewEffectiveCompareOptionId(year, month, overviewCompareOptionId, overviewCompareOptions),
    [year, month, overviewCompareOptionId, overviewCompareOptions]
  );
  const overviewCompareSelectOptions = useMemo(
    () => overviewCompareOptions.map((o) => ({ value: o.id, label: o.label })),
    [overviewCompareOptions]
  );

  const [overviewCompareBusy, setOverviewCompareBusy] = useState(false);
  useEffect(() => {
    if (year === ALL_TIME_YEAR) {
      setOverviewCompareBusy(false);
      return;
    }
    const cy = resolvedOverviewCompare.compareY;
    if (cy < 1970) {
      setOverviewCompareBusy(false);
      return;
    }
    const needsPair = cy > 1970;
    const missing =
      animeActivityCache[cy] === undefined ||
      mangaActivityCache[cy] === undefined ||
      (needsPair &&
        (animeActivityCache[cy - 1] === undefined || mangaActivityCache[cy - 1] === undefined));
    if (!missing) {
      setOverviewCompareBusy(false);
      return;
    }
    const years = needsPair ? [cy - 1, cy] : [cy];
    let cancelled = false;
    setOverviewCompareBusy(true);
    void hydrateMissingYearsFromSupabase(years).finally(() => {
      if (!cancelled) setOverviewCompareBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [
    year,
    resolvedOverviewCompare.compareY,
    hydrateMissingYearsFromSupabase,
    animeActivityCache,
    mangaActivityCache,
  ]);

  const {
    mangaChaptersChartData,
    animeEpisodesChartData,
    overviewCompareHasAnyData,
    fmtData,
    animeStatusEntriesOrdered,
    animeCountryEntriesOrdered,
    mangaStatusEntriesOrdered,
    mangaCountryEntriesOrdered,
    mangaFmtData,
  } = useOverviewData({
    isAllTime,
    year,
    month,
    mergedAnimeForTotals,
    mergedMangaForTotals,
    mergedAnimeForTabTotals,
    mergedMangaForTabTotals,
    effectiveAnimeActivityCache,
    effectiveMangaActivityCache,
    resolvedOverviewCompare,
    animeTabEntries,
    mangaTabEntries,
    animePlanningEntries,
    mangaPlanningEntries,
  });

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

  const overviewRecentActivities = useMemo(
    () =>
      buildOverviewRecentActivities({
        animeActivities: mergedAnimeForTotals,
        mangaActivities: mergedMangaForTotals,
        allAnime,
        allManga,
        year,
        month,
        limit: 30,
      }),
    [mergedAnimeForTotals, mergedMangaForTotals, allAnime, allManga, year, month]
  );

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
    { key: "overview", label: "Vue d'ensemble" },
    { key: "manga", label: `Manga (${mangaTabEntries.length})` },
    { key: "anime", label: `Anime (${animeTabEntries.length})` },
    { key: "wrapped", label: "Wrapped", className: "tab-btn--wrapped" },
  ];

  const chartPeriodLegend = useMemo(() => getComparisonPeriodMeta(year, month), [year, month]);
  const compareAvailability = useMemo(() => {
    if (year === ALL_TIME_YEAR) {
      return {
        missing: false,
        compareY: null as number | null,
        loadingComparison: false,
        loadingLabel: "",
        idleLabel: "",
      };
    }
    const cy = resolvedOverviewCompare.compareY;
    const label = resolvedOverviewCompare.legendCompare;
    const needsPair = cy >= 1970 && cy > 1970;
    const compareMissing =
      cy >= 1970 &&
      (!animeActivityCache[cy] ||
        !mangaActivityCache[cy] ||
        (needsPair &&
          (!animeActivityCache[cy - 1] || !mangaActivityCache[cy - 1])));
    const loadingComparison = Boolean(compareMissing && (loadingActivities || overviewCompareBusy));
    return {
      missing: Boolean(compareMissing),
      compareY: cy >= 1970 ? cy : null,
      loadingComparison,
      loadingLabel: label
        ? `Chargement des données pour la comparaison (${label})…`
        : "Chargement des données pour la comparaison…",
      idleLabel: label
        ? `Données « ${label} » indisponibles pour le moment (vérifiez la synchro Supabase).`
        : "Comparaison indisponible pour le moment",
    };
  }, [
    year,
    resolvedOverviewCompare,
    animeActivityCache,
    mangaActivityCache,
    loadingActivities,
    overviewCompareBusy,
  ]);

  const handleRetryComparisonNowDynamic = useCallback(() => {
    if (year === ALL_TIME_YEAR) {
      handleRetryComparisonNow();
      return;
    }
    const cy = resolvedOverviewCompare.compareY;
    if (cy >= 1970) {
      if (cy > 1970) retryYearNow(cy - 1);
      retryYearNow(cy);
      void hydrateMissingYearsFromSupabase(cy > 1970 ? [cy - 1, cy] : [cy]);
      return;
    }
    handleRetryComparisonNow();
  }, [
    year,
    resolvedOverviewCompare.compareY,
    retryYearNow,
    handleRetryComparisonNow,
    hydrateMissingYearsFromSupabase,
  ]);

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
  const currentRoute = useMemo(() => parseRouteFromHash(), [hashTick]);
  const isLandingHome = currentRoute.type === "home";

  /* Valeur agrégée du contexte de période. Memoïsée pour que l'identité
   * reste stable tant que rien ne change : sans ça, on recréerait l'objet
   * à chaque render et tous les consommateurs (`PeriodFloatingChip`,
   * `OverviewTab`, `AnimeTab`, `MangaTab`) re-rendraient inutilement.
   * Les setters React (`setTab`, `setMonth`) sont stables, mais
   * `changeYear` est défini en clôture sur `setYear`/`setMonth` ; il est
   * stable lui aussi tant que les setters ne changent pas. */
  const periodValue = useMemo<ProfilePeriodValue>(
    () => ({
      tab,
      year,
      month,
      years,
      isAllTime,
      setTab,
      changeYear,
      setMonth,
    }),
    [tab, year, month, years, isAllTime, changeYear]
  );

  const wrappedYear = new Date().getFullYear();
  const wrappedSummary = useMemo(
    () =>
      buildWrappedSummary({
        user: appUser,
        year: wrappedYear,
        allAnime,
        allManga,
        animeActivityCache: effectiveAnimeActivityCache,
        mangaActivityCache: effectiveMangaActivityCache,
      }),
    [appUser, wrappedYear, allAnime, allManga, effectiveAnimeActivityCache, effectiveMangaActivityCache]
  );

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

      {persistenceStatus.lastError && (
        <div className="persistence-error-banner" role="alert">
          <span className="persistence-error-banner__text">
            Échec de sauvegarde Supabase : tes données ne sont pas enregistrées
            (un rafraîchissement reviendra à l'état précédent).{" "}
            <span className="persistence-error-banner__detail">
              {persistenceStatus.lastError}
            </span>
          </span>
          <button
            type="button"
            className="persistence-error-banner__close"
            onClick={clearPersistenceError}
            aria-label="Fermer l'alerte"
          >
            ×
          </button>
        </div>
      )}

      <ProfilePeriodProvider value={periodValue}>
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
        deltaAudit={deltaAudit}
        handleRetryComparisonNow={handleRetryComparisonNowDynamic}
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
      >
            <div key={tab} className="tab-transition-wrapper">
            <Suspense fallback={<LoadingBlock caption="Chargement de l'onglet…" />}>
            {tab === "overview" && (
              <OverviewTab
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
                chartLegendCurrent={chartPeriodLegend.legendCurrent}
                overviewCompareSelectValue={overviewCompareSelectValue}
                overviewCompareSelectOptions={overviewCompareSelectOptions}
                onOverviewCompareChange={setOverviewCompareOptionId}
                overviewCompareLineDimmed={compareAvailability.missing}
                overviewCompareEmptyLabel={
                  !compareAvailability.missing && !overviewCompareHasAnyData
                    ? "Aucune donnée pour cette période"
                    : null
                }
                compareAvailability={compareAvailability}
                mangaChaptersChartData={mangaChaptersChartData}
                animeEpisodesChartData={animeEpisodesChartData}
                overviewTopCount={overviewTopCount}
                overviewTopPeriodTitle={overviewTopPeriodTitle}
                overviewTopManga={overviewTopManga}
                overviewTopAnime={overviewTopAnime}
                overviewAnimePeriodProgressByMedia={animePeriodProgressByMedia}
                overviewMangaPeriodProgressByMedia={mangaPeriodProgressByMedia}
                overviewMangaTopFades={overviewMangaTopFades}
                overviewAnimeTopFades={overviewAnimeTopFades}
                overviewMangaTopScrollRef={overviewMangaTopScrollRef}
                overviewAnimeTopScrollRef={overviewAnimeTopScrollRef}
                overviewDailyTotalsForYear={overviewDailyTotalsForYear}
                animeDailyTotalsForYear={animeDailyTotalsForYear}
                mangaDailyTotalsForYear={mangaDailyTotalsForYear}
                overviewRecentActivities={overviewRecentActivities}
              />
            )}

            {tab === "wrapped" && <WrappedPage summary={wrappedSummary} />}

            {tab === "anime" && (
              <AnimeTab
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
                animePeriodProgressByMedia={animePeriodProgressByMedia}
              />
            )}

            {tab === "manga" && (
              <MangaTab
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
                mangaPeriodProgressByMedia={mangaPeriodProgressByMedia}
              />
            )}
            </Suspense>
            </div>

            {tab !== "wrapped" ? (
              <PeriodEmptyBanner
                year={year}
                month={month}
                animeEntriesLength={animeTabEntries.length}
                mangaEntriesLength={mangaTabEntries.length}
                loadingActivities={loadingActivities}
                comparisonYearMissing={compareAvailability.missing}
                hasProfileData={Boolean(appUser?.id)}
              />
            ) : null}
      </ProfileViewMain>
      </ProfilePeriodProvider>

      <SiteFooter />

      </>
      )}

      <BackToTopButton visible={showBackToTop} />
    </div>
  );
}

export default App;
