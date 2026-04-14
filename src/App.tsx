import { useState, useEffect, useLayoutEffect, useCallback, useMemo, useRef } from 'react';
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
  computeMonthlyDeltasFromActivities,
  computeDailyDeltasInMonth,
  getMediaIdsWithProgressInPeriod,
  getComparisonPeriodMeta,
  mergeActivitiesForDelta,
} from './lib/stats';
import {
  getRateLimitState,
  subscribeRateLimit,
  getProxyCacheStats,
  subscribeProxyCache,
} from './api/anilistClient';
import {
  LIST_TAB_ANIME_CARD_WIDTH,
  LIST_TAB_ANIME_GRID_GAP,
  LIST_TAB_ANIME_VISIBLE_ROWS,
} from "./app/listConstants";
import { buildAnimeHalfScoreDistributionFullRange } from "./lib/animeScoreUtils";
import { compareEntriesByUserScoreThenAverage } from "./lib/compareEntries";
import { HomePage } from "./pages/HomePage";
import { OverviewTab } from "./pages/OverviewTab";
import { AnimeTab } from "./pages/AnimeTab";
import { MangaTab } from "./pages/MangaTab";
import { PeriodEmptyBanner } from "./pages/PeriodEmptyBanner";
import {
  IS_DEV_LOCAL,
  devLog,
  runCacheMigrationOnce,
} from "./lib/profileLocalCache";
import {
  parseRouteFromHash,
  profileHashForUserName,
} from "./lib/routing";
import { useProfileLoader } from "./hooks/useProfileLoader";
import { useActivityYearsLoader } from "./hooks/useActivityYearsLoader";
import { useActivityLoadingUi } from "./hooks/useActivityLoadingUi";
import { useHeaderQuickPicks } from "./hooks/useHeaderQuickPicks";
import { useOverviewTopScrollFades } from "./hooks/useOverviewTopScrollFades";
import { ProfileAppHeader } from "./components/ProfileAppHeader";
import { ProfileViewMain } from "./components/ProfileViewMain";
import { BackToTopButton } from "./components/BackToTopButton";
import type { ActivityCacheByYear, AniListUser } from "./types/domain";

function App() {
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
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [debugMetricsView, setDebugMetricsView] = useState(null);
  const [showBackToTop, setShowBackToTop] = useState(false);
  const [animeListExpanded, setAnimeListExpanded] = useState(false);
  const [animeListGridWidth, setAnimeListGridWidth] = useState(0);
  const animeMediaGridRef = useRef(null);
  const profileInFlightRef = useRef(new Map<string, Promise<unknown>>());
  const activityInFlightRef = useRef(new Map<string, Promise<unknown>>());
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
  const headerSearchInputRef = useRef(null);
  const metricsRef = useRef({
    cacheHit: 0,
    cacheMiss: 0,
    cacheWrite: 0,
    rateLimitErrors: 0,
    profileFetchCount: 0,
    profileFetchTotalMs: 0,
  });

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
    runCacheMigrationOnce();
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

  useEffect(() => {
    if (!IS_DEV_LOCAL) return;
    const entries = Object.entries(resourceStatus);
    if (entries.length === 0) return;
    const last = entries[entries.length - 1];
    if (!last) return;
    const [key, meta] = last as [string, { status?: string; error?: string }];
    devLog("resource", key, meta.status, meta.error || "");
  }, [resourceStatus]);

  const metricInc = useCallback((field, amount = 1) => {
    metricsRef.current[field] = (metricsRef.current[field] || 0) + amount;
  }, []);

  const metricProfileFetchDuration = useCallback((ms) => {
    metricsRef.current.profileFetchCount += 1;
    metricsRef.current.profileFetchTotalMs += ms;
  }, []);

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

  const {
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
  } = profile;

  const appUser = user as AniListUser | null;

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

  const activityYearsScope = useMemo(() => {
    const s = new Set([year]);
    if (month === 0 || month === 1) s.add(year - 1);
    return [...s].filter((y) => y >= 1970);
  }, [year, month]);

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

  const { displayActivityLoadingMessage, activityEtaSeconds } = useActivityLoadingUi({
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

  const changeYear = (y: number) => setYear(y);

  const handleSubmit = () => {
    const q = inputVal.trim();
    if (!q) return;
    headerSearchInputRef.current?.blur();
    setHeaderSearchFocused(false);
    window.location.hash = profileHashForUserName(q);
  };

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

  useEffect(() => {
    if (years.length && !years.includes(year)) {
      setYear(years[0]);
    }
  }, [years, year]);

  const activityLoaderRefs = {
    latestUserIdRef,
    activityInFlightRef,
    activityCooldownRef,
    activityRetryCountRef,
    activityYearsInFlightRef,
    activityMissLogRef,
  };

  const activityUserForLoader = appUser
    ? { id: appUser.id, name: appUser.name }
    : null;

  const { retryYearNow, handleRetryComparisonNow } = useActivityYearsLoader({
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

  const mergedAnimeForTotals = useMemo(
    () => mergeActivitiesForDelta(year, animeActivityCache),
    [year, animeActivityCache]
  );
  const mergedMangaForTotals = useMemo(
    () => mergeActivitiesForDelta(year, mangaActivityCache),
    [year, mangaActivityCache]
  );

  const animeMediaIdsWithProgress = useMemo(
    () => getMediaIdsWithProgressInPeriod(mergedAnimeForTotals, year, month, "anime"),
    [mergedAnimeForTotals, year, month]
  );
  const mangaMediaIdsWithProgress = useMemo(
    () => getMediaIdsWithProgressInPeriod(mergedMangaForTotals, year, month, "manga"),
    [mergedMangaForTotals, year, month]
  );

  const isEntryInPeriod = useCallback((e, y, m, activeIds) => {
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

  // Computed
  const mangaCompleted = useMemo(
    () => mangaEntries.filter(e => completedInYear(e, year) && (month === 0 || completedInMonth(e, year, month))),
    [mangaEntries, year, month]
  );
  const animeActivityTotals = useMemo(
    () => computePeriodAnimeActivityTotals(mergedAnimeForTotals, year, month),
    [mergedAnimeForTotals, year, month]
  );
  const totalEp = animeActivityTotals.episodes;
  const totalMin = animeActivityTotals.minutes;
  const totalCh = useMemo(
    () => computePeriodDeltaFromActivities(mergedMangaForTotals, year, month, "manga"),
    [mergedMangaForTotals, year, month]
  );
  const totalVol = useMemo(() => mangaEntries.reduce((s,e) => s + (e.progressVolumes||0), 0), [mangaEntries]);
  const scoredA = useMemo(() => animeEntries.filter(e => e.score > 0), [animeEntries]);
  const scoredM = useMemo(() => mangaEntries.filter(e => e.score > 0), [mangaEntries]);
  const avgA = scoredA.length ? (scoredA.reduce((s,e)=>s+e.score,0)/scoredA.length).toFixed(1) : "—";
  const avgM = scoredM.length ? (scoredM.reduce((s,e)=>s+e.score,0)/scoredM.length).toFixed(1) : "—";

  /**
   * Écart-type (σ) des écarts note perso − moyenne AniList du média (échelle /10).
   * Préfixe + ou − selon la moyenne des écarts : tendance à noter au-dessus ou en dessous du site.
   */
  const animeVsCommunityScoreStdDev = useMemo(() => {
    const deltas = [];
    for (const e of animeEntries) {
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
    const sigma = Math.sqrt(variance);
    const sign = meanDelta >= 0 ? "+" : "\u2212";
    return `${sign}${sigma.toFixed(2)}`;
  }, [animeEntries]);

  /** Genres (onglet Anime) : entrées anime de la période uniquement. */
  const animeGenrePeriodData = useMemo(() => {
    const genreCount: Record<string, number> = {};
    animeEntries.forEach((e) =>
      (e.media?.genres || []).forEach((g) => {
        genreCount[g] = (genreCount[g] || 0) + 1;
      })
    );
    return Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));
  }, [animeEntries]);

  /** Répartition des scores : tranches 1 à 10 par pas de 0,5 (effectifs, y compris 0). */
  const animeScoreHalfDistributionRows = useMemo(() => {
    if (scoredA.length === 0) return [];
    return buildAnimeHalfScoreDistributionFullRange(scoredA);
  }, [scoredA]);

  const mangaChaptersChartData = useMemo(() => {
    const { compareY, compareM } = getComparisonPeriodMeta(year, month);
    const mergedCur = mergeActivitiesForDelta(year, mangaActivityCache);
    const mergedComp = mergeActivitiesForDelta(compareY, mangaActivityCache);

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
  }, [year, month, mangaActivityCache]);

  const animeEpisodesChartData = useMemo(() => {
    const { compareY, compareM } = getComparisonPeriodMeta(year, month);
    const mergedCur = mergeActivitiesForDelta(year, animeActivityCache);
    const mergedComp = mergeActivitiesForDelta(compareY, animeActivityCache);

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
  }, [year, month, animeActivityCache]);

  const fmtData = useMemo(() => {
    const fmtCount: Record<string, number> = {};
    animeEntries.forEach(e => { const f=e.media?.format||"OTHER"; fmtCount[f]=(fmtCount[f]||0)+1; });
    return Object.entries(fmtCount).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
  }, [animeEntries]);

  const statusCntA = useMemo(() => {
    const counts: Record<string, number> = {};
    animeEntries.forEach(e => { counts[e.status]=(counts[e.status]||0)+1; });
    return counts;
  }, [animeEntries]);
  const animeStatusEntriesOrdered = useMemo(() => {
    const order = ["COMPLETED", "CURRENT", "PLANNING", "PAUSED", "DROPPED", "REPEATING"];
    return Object.entries(statusCntA).sort(
      (a, b) => order.indexOf(a[0]) - order.indexOf(b[0])
    );
  }, [statusCntA]);

  const animeCountryEntriesOrdered = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const e of animeEntries) {
      const raw = e.media?.countryOfOrigin;
      const code =
        raw != null && String(raw).trim() !== "" && /^[A-Za-z]{2}$/.test(String(raw).trim())
          ? String(raw).trim().toUpperCase()
          : "__UNKNOWN__";
      counts[code] = (counts[code] || 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [animeEntries]);
  const statusCntM = useMemo(() => {
    const counts = {};
    mangaEntries.forEach(e => { counts[e.status]=(counts[e.status]||0)+1; });
    return counts;
  }, [mangaEntries]);

  const sortedA = useMemo(
    () => [...animeEntries].sort(compareEntriesByUserScoreThenAverage),
    [animeEntries]
  );
  const sortedM = useMemo(
    () => [...mangaEntries].sort(compareEntriesByUserScoreThenAverage),
    [mangaEntries]
  );

  const animeListGridColumns = useMemo(() => {
    const w = animeListGridWidth;
    if (!Number.isFinite(w) || w <= 0) return 1;
    return Math.max(
      1,
      Math.floor((w + LIST_TAB_ANIME_GRID_GAP) / (LIST_TAB_ANIME_CARD_WIDTH + LIST_TAB_ANIME_GRID_GAP))
    );
  }, [animeListGridWidth]);

  const animeListCollapsedMax = animeListGridColumns * LIST_TAB_ANIME_VISIBLE_ROWS;
  const animeListNeedsMoreLess = sortedA.length > animeListCollapsedMax;
  const animeListToShow = useMemo(() => {
    if (!animeListNeedsMoreLess || animeListExpanded) return sortedA;
    return sortedA.slice(0, animeListCollapsedMax);
  }, [sortedA, animeListNeedsMoreLess, animeListExpanded, animeListCollapsedMax]);

  useLayoutEffect(() => {
    if (tab !== "anime" || !loaded) return undefined;
    const el = animeMediaGridRef.current;
    if (!el) return undefined;
    const apply = () => {
      const w = el.clientWidth;
      if (typeof w === "number" && Number.isFinite(w)) setAnimeListGridWidth(w);
    };
    apply();
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0]?.contentRect;
      const w = cr?.width;
      if (typeof w === "number" && Number.isFinite(w)) setAnimeListGridWidth(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [tab, loaded, sortedA.length]);

  useEffect(() => {
    setAnimeListExpanded(false);
  }, [year, month, tab, appUser?.id]);

  const topA = useMemo(
    () => sortedA.filter((e) => e.status !== "PLANNING"),
    [sortedA]
  );
  const topM = useMemo(
    () => sortedM.filter((e) => e.status !== "PLANNING"),
    [sortedM]
  );

  const overviewTopCount = 10;
  const overviewTopAnime = useMemo(() => topA.slice(0, overviewTopCount), [topA, overviewTopCount]);
  const overviewTopManga = useMemo(() => topM.slice(0, overviewTopCount), [topM, overviewTopCount]);
  const overviewTopPeriodTitle = month === 0 ? `${year}` : `${MONTHS_FULL[month - 1]} ${year}`;

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
    () => countActiveCalendarDays(year, month, mergedAnimeForTotals, mergedMangaForTotals, animeEntries, mangaEntries),
    [year, month, mergedAnimeForTotals, mergedMangaForTotals, animeEntries, mangaEntries]
  );
  const periodDayTotal = useMemo(() => getPeriodDayTotal(year, month), [year, month]);

  const tabs = [
    {key:"overview",label:"Vue d'ensemble"},
    {key:"anime",label:`Anime (${animeEntries.length})`},
    {key:"manga",label:`Manga (${mangaEntries.length})`},
  ];

  const chartPeriodLegend = useMemo(() => getComparisonPeriodMeta(year, month), [year, month]);
  const compareAvailability = useMemo(() => {
    const compareY = chartPeriodLegend?.compareY;
    const compareMissing = compareY && (!animeActivityCache[compareY] || !mangaActivityCache[compareY]);
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

  /** Tant que l’année sélectionnée n’a pas ses listes d’activités (anime + manga), on garde l’écran de chargement principal. */
  const awaitingPrimaryYearActivities = useMemo(() => {
    if (!loaded || loading || !appUser?.id) return false;
    if (error) return false;
    const y = year;
    if (y < 1970) return false;
    const a = animeActivityCache[y];
    const m = mangaActivityCache[y];
    return !(a && m);
  }, [loaded, loading, appUser?.id, error, year, animeActivityCache, mangaActivityCache]);

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

  const pickQuickProfile = useCallback((name) => {
    const n = String(name || "").trim();
    if (!n) return;
    setInputVal(n);
    setHeaderSearchFocused(false);
    headerSearchInputRef.current?.blur();
    window.location.hash = profileHashForUserName(n);
  }, []);

  const isLandingHome = useMemo(() => parseRouteFromHash().type === "home", [hashTick]);

  return (
    <div style={{background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'Overpass',sans-serif"}}>

      {isLandingHome ? (
        <HomePage
          C={C}
          inputVal={inputVal}
          setInputVal={setInputVal}
          headerSearchInputRef={headerSearchInputRef}
          headerSearchFocused={headerSearchFocused}
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
        loaded={loaded}
        years={years}
        year={year}
        month={month}
        changeYear={changeYear}
        setMonth={setMonth}
        headerUser={headerUser}
        transitionActive={transitionActive}
        anilistProfileUrl={anilistProfileUrl}
      />

      <ProfileViewMain
        C={C}
        loaded={loaded}
        loading={loading}
        awaitingPrimaryYearActivities={awaitingPrimaryYearActivities}
        loadingActivities={loadingActivities}
        error={error != null ? String(error) : null}
        displayActivityLoadingMessage={displayActivityLoadingMessage}
        activityLoadingMessage={activityLoadingMessage}
        activityEtaSeconds={activityEtaSeconds}
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
        tabs={tabs}
        tab={tab}
        setTab={setTab}
      >
            {tab === "overview" && (
              <OverviewTab
                year={year}
                month={month}
                totalEp={totalEp}
                avgA={avgA}
                totalCh={totalCh}
                avgM={avgM}
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
              />
            )}

            {tab === "anime" && (
              <AnimeTab
                year={year}
                month={month}
                setMonth={setMonth}
                animeEntriesLength={animeEntries.length}
                totalEp={totalEp}
                totalMin={totalMin}
                fmtMin={fmtMin}
                avgA={avgA}
                animeVsCommunityScoreStdDev={animeVsCommunityScoreStdDev}
                animeStatusEntriesOrdered={animeStatusEntriesOrdered}
                animeCountryEntriesOrdered={animeCountryEntriesOrdered}
                fmtData={fmtData}
                animeListToShow={animeListToShow}
                animeListNeedsMoreLess={animeListNeedsMoreLess}
                animeListExpanded={animeListExpanded}
                setAnimeListExpanded={setAnimeListExpanded}
                animeMediaGridRef={animeMediaGridRef}
                animeScoreHalfDistributionRows={animeScoreHalfDistributionRows}
                animeGenrePeriodData={animeGenrePeriodData}
              />
            )}

            {tab === "manga" && (
              <MangaTab
                mangaEntriesLength={mangaEntries.length}
                mangaCompletedLength={mangaCompleted.length}
                totalCh={totalCh}
                totalVol={totalVol}
                statusCntM={statusCntM}
                sortedM={sortedM}
              />
            )}

            <PeriodEmptyBanner
              year={year}
              month={month}
              animeEntriesLength={animeEntries.length}
              mangaEntriesLength={mangaEntries.length}
            />
      </ProfileViewMain>

      </>
      )}

      <BackToTopButton visible={showBackToTop} />
    </div>
  );
}

export default App;
