const { useState, useEffect, useCallback, useMemo, useRef } = React;
const {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, LineChart, Line, LabelList,
} = Recharts;

const { C, PIE_COLORS, MONTHS, STATUS_LABELS, STATUS_COLORS } = window.AppConfig;
const {
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
} = window.AppStats;
const {
  fetchAL,
  fetchListActivitiesForYear,
  sleep,
  getRateLimitState,
  subscribeRateLimit,
  getProxyCacheStats,
  subscribeProxyCache,
  USER_QUERY,
  MEDIA_LIST_QUERY,
} = window.AppApi;
const { StatCard, ChartCard, MediaCard, CTooltip, PeriodCompareLegend, CompareLineTooltip } = window.AppUi;

const CACHE_PREFIX = "aniliststat:v3";
const LEGACY_CACHE_PREFIXES = ["aniliststat:v1", "aniliststat:v2"];
const PROFILE_USER_TTL_MS = 24 * 60 * 60 * 1000;
const PROFILE_LIST_TTL_MS = 6 * 60 * 60 * 1000;
const PROFILE_SWR_STALE_MS = 15 * 60 * 1000;
const ACTIVITY_SWR_STALE_MS = 10 * 60 * 1000;
const ACTIVITY_CURRENT_YEAR_TTL_MS = 60 * 60 * 1000;
const ACTIVITY_PAST_YEAR_TTL_MS = 24 * 60 * 60 * 1000;
const ACTIVITY_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;
const ACTIVITY_MAX_AUTO_RETRY = 3;
const CACHE_MAX_ENTRIES = 120;
const IS_DEV_LOCAL = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

/** Évite un second fetch du profil par défaut (ex. remontage React StrictMode en dev). */
let defaultProfileBootstrapDone = false;

if (window.location.hostname === "localhost") {
  const target = new URL(window.location.href);
  target.hostname = "127.0.0.1";
  window.location.replace(target.toString());
}

function devLog(...args) {
  if (IS_DEV_LOCAL) console.info("[AniListStat cache]", ...args);
}

function safeReadCacheMeta(key, staleAfterMs = null) {
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

function safeReadCache(key, staleAfterMs = null) {
  const meta = safeReadCacheMeta(key, staleAfterMs);
  return meta ? meta.value : null;
}

function safeWriteCache(key, value, ttlMs) {
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

function runCacheLruCleanup() {
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

const normalizeName = (name) => String(name || "").trim().toLowerCase();
const profileUserCacheKey = (name) => `${CACHE_PREFIX}:profile:user:${normalizeName(name)}`;
const profileAnimeCacheKey = (name) => `${CACHE_PREFIX}:profile:anime:${normalizeName(name)}`;
const profileMangaCacheKey = (name) => `${CACHE_PREFIX}:profile:manga:${normalizeName(name)}`;
const legacyProfileCacheKey = (name) => `${LEGACY_CACHE_PREFIXES[0]}:profile:${normalizeName(name)}`;
const activityCacheKey = (userId, type, year) => `${CACHE_PREFIX}:acts:${userId}:${type}:${year}`;

function getActivityTtlMs(yearValue) {
  const currentYear = new Date().getFullYear();
  return yearValue === currentYear ? ACTIVITY_CURRENT_YEAR_TTL_MS : ACTIVITY_PAST_YEAR_TTL_MS;
}

function runCacheMigrationOnce() {
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

async function fetchActivitiesWithRetry(userId, type, year, signal) {
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

function App() {
  const [inputVal, setInputVal] = useState("Kirikou");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState("overview");
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(0);
  const [loaded, setLoaded] = useState(false);
  const [allAnime, setAllAnime] = useState([]);
  const [allManga, setAllManga] = useState([]);
  const [animeActivities, setAnimeActivities] = useState([]);
  const [mangaActivities, setMangaActivities] = useState([]);
  const [animeActivityCache, setAnimeActivityCache] = useState({});
  const [mangaActivityCache, setMangaActivityCache] = useState({});
  const [loadingActivities, setLoadingActivities] = useState(false);
  const [activityLoadingMessage, setActivityLoadingMessage] = useState("Chargement des activites...");
  const [displayActivityLoadingMessage, setDisplayActivityLoadingMessage] = useState("Chargement des activites...");
  const [activityWarning, setActivityWarning] = useState(null);
  const [resourceStatus, setResourceStatus] = useState({});
  const [rateLimitState, setRateLimitState] = useState(() => getRateLimitState());
  const [proxyCacheStats, setProxyCacheStats] = useState(() => getProxyCacheStats());
  const [showDevPanel, setShowDevPanel] = useState(false);
  const [debugMetricsView, setDebugMetricsView] = useState(null);
  const profileInFlightRef = useRef(new Map());
  const activityInFlightRef = useRef(new Map());
  const profileAbortRef = useRef(null);
  const profileAbortKeyRef = useRef(null);
  /** Réponses d’activités async plus anciennes qu’un changement de profil sont ignorées (évite mélange A/B). */
  const latestUserIdRef = useRef(null);
  /** Profil que l’utilisateur consulte (requêtes !background). Les refresh stale en arrière-plan ne doivent pas l’écraser. */
  const activeProfileIntentRef = useRef(null);
  const activityCooldownRef = useRef(new Map());
  const activityRetryCountRef = useRef(new Map());
  const activityYearsInFlightRef = useRef(new Set());
  const activityMissLogRef = useRef(new Set());
  const loadingMessageTransitionRef = useRef(null);
  const loadingActivitiesRef = useRef(false);
  const activityYearsPendingCountRef = useRef(0);
  const activityEtaPhaseRef = useRef("");
  const activityEtaEndAtRef = useRef(0);
  const activityEtaIntervalRef = useRef(null);
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
    if (!IS_DEV_LOCAL) return;
    const entries = Object.entries(resourceStatus);
    if (entries.length === 0) return;
    const last = entries[entries.length - 1];
    if (!last) return;
    const [key, meta] = last;
    devLog("resource", key, meta.status, meta.error || "");
  }, [resourceStatus]);

  const metricInc = useCallback((field, amount = 1) => {
    metricsRef.current[field] = (metricsRef.current[field] || 0) + amount;
  }, []);

  const metricProfileFetchDuration = useCallback((ms) => {
    metricsRef.current.profileFetchCount += 1;
    metricsRef.current.profileFetchTotalMs += ms;
  }, []);

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
    return () => unsubscribe();
  }, []);
  useEffect(() => {
    const unsubscribe = subscribeProxyCache((state) => setProxyCacheStats(state));
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    loadingActivitiesRef.current = loadingActivities;
  }, [loadingActivities]);

  useEffect(() => {
    if (!loadingActivities) {
      if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
      loadingMessageTransitionRef.current = null;
      setDisplayActivityLoadingMessage(activityLoadingMessage);
      return;
    }
    if (displayActivityLoadingMessage === activityLoadingMessage) return;
    if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
    loadingMessageTransitionRef.current = setTimeout(() => {
      setDisplayActivityLoadingMessage(activityLoadingMessage);
      loadingMessageTransitionRef.current = null;
    }, 200);
  }, [activityLoadingMessage, displayActivityLoadingMessage, loadingActivities]);

  useEffect(() => () => {
    if (loadingMessageTransitionRef.current) clearTimeout(loadingMessageTransitionRef.current);
  }, []);

  const activityYearsScope = useMemo(() => {
    const s = new Set([year]);
    if (month === 0 || month === 1) s.add(year - 1);
    return [...s].filter((y) => y >= 1970);
  }, [year, month]);

  const activityYearsPendingCount = useMemo(() => {
    if (!user?.id) return 0;
    return activityYearsScope.filter((y) => !animeActivityCache[y] || !mangaActivityCache[y]).length;
  }, [activityYearsScope, user?.id, animeActivityCache, mangaActivityCache]);

  activityYearsPendingCountRef.current = activityYearsPendingCount;

  const activityLoadDebug = useMemo(() => {
    if (!user?.id) return null;
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
  }, [user?.id, activityYearsScope, animeActivityCache, mangaActivityCache]);

  /** Compte à rebours estimé stable par « phase » (message + user), évite les oscillations du scheduler. */
  const [activityEtaSeconds, setActivityEtaSeconds] = useState(null);
  useEffect(() => {
    if (activityEtaIntervalRef.current) {
      clearInterval(activityEtaIntervalRef.current);
      activityEtaIntervalRef.current = null;
    }
    if (!loadingActivities) {
      activityEtaPhaseRef.current = "";
      activityEtaEndAtRef.current = 0;
      setActivityEtaSeconds(null);
      return;
    }
    const phaseKey = `${user?.id ?? "0"}|${activityLoadingMessage}`;
    if (activityEtaPhaseRef.current !== phaseKey) {
      activityEtaPhaseRef.current = phaseKey;
      const rs = getRateLimitState();
      const slotMs = rs.requestIntervalMs || 2200;
      const pendingYears = Math.max(1, activityYearsPendingCountRef.current);
      /** Marge large : ~12 requêtes planifiées / an (pagination) + marge + file actuelle */
      const queueSlots = (rs.queued || 0) + (rs.inFlight || 0) * 2;
      const budgetMs = Math.max(
        10_000,
        (rs.blockedForMs || 0) + pendingYears * 12 * slotMs + queueSlots * slotMs + 4 * slotMs
      );
      activityEtaEndAtRef.current = Date.now() + budgetMs;
    }
    const tick = () => {
      if (!loadingActivitiesRef.current) return;
      const end = activityEtaEndAtRef.current;
      if (!end) return;
      let msLeft = end - Date.now();
      if (msLeft <= 0 && loadingActivitiesRef.current) {
        const rs = getRateLimitState();
        const slot = rs.requestIntervalMs || 2200;
        const bump = Math.max(12_000, (rs.blockedForMs || 0) + 8 * slot);
        activityEtaEndAtRef.current = Date.now() + bump;
        msLeft = bump;
      }
      setActivityEtaSeconds(Math.max(0, Math.ceil(msLeft / 1000)));
    };
    tick();
    activityEtaIntervalRef.current = setInterval(tick, 500);
    return () => {
      if (activityEtaIntervalRef.current) {
        clearInterval(activityEtaIntervalRef.current);
        activityEtaIntervalRef.current = null;
      }
    };
  }, [loadingActivities, activityLoadingMessage, user?.id]);

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

  const fetchData = useCallback(async (name, options = {}) => {
    const { forceNetwork = false, background = false } = options;
    const normalized = normalizeName(name);
    const profileKey = `profile:${normalized}`;
    if (!background) {
      activeProfileIntentRef.current = profileKey;
    }
    const activeProfileKey = profileAbortKeyRef.current;
    const isUserSwitch = activeProfileKey && activeProfileKey !== profileKey;
    if (isUserSwitch && !background) {
      activityInFlightRef.current.clear();
      activityCooldownRef.current.clear();
      activityRetryCountRef.current.clear();
      activityYearsInFlightRef.current.clear();
      activityMissLogRef.current.clear();
      setActivityWarning(null);
      setLoadingActivities(false);
    }
    const cachedUserMeta = safeReadCacheMeta(profileUserCacheKey(normalized), PROFILE_SWR_STALE_MS);
    const cachedAnimeMeta = safeReadCacheMeta(profileAnimeCacheKey(normalized), PROFILE_SWR_STALE_MS);
    const cachedMangaMeta = safeReadCacheMeta(profileMangaCacheKey(normalized), PROFILE_SWR_STALE_MS);
    const legacyProfile = safeReadCache(legacyProfileCacheKey(normalized), PROFILE_SWR_STALE_MS);
    const isProfileStale = Boolean(
      cachedUserMeta?.isStale || cachedAnimeMeta?.isStale || cachedMangaMeta?.isStale
    );
    const cachedProfile = (cachedUserMeta?.value && cachedAnimeMeta?.value && cachedMangaMeta?.value)
      ? { user: cachedUserMeta.value, allAnime: cachedAnimeMeta.value, allManga: cachedMangaMeta.value }
      : legacyProfile;

    if (cachedProfile && !forceNetwork) {
      devLog("profile hit", normalized);
      metricInc("cacheHit");
      setResource(profileKey, "success");
      setError(null);
      setLoaded(false);
      latestUserIdRef.current = cachedProfile.user?.id ?? null;
      setUser(cachedProfile.user || null);
      setAllAnime(Array.isArray(cachedProfile.allAnime) ? cachedProfile.allAnime : []);
      setAllManga(Array.isArray(cachedProfile.allManga) ? cachedProfile.allManga : []);
      if (!background) {
        setAnimeActivities([]);
        setMangaActivities([]);
        setAnimeActivityCache({});
        setMangaActivityCache({});
      }
      setLoaded(true);
      setLoading(false);
      if (!background) setInputVal("");
      if (isProfileStale && !background) {
        devLog("profile stale -> background refresh", normalized);
        fetchData(name, { forceNetwork: true, background: true });
      }
      return;
    }

    devLog("profile miss", normalized);
    metricInc("cacheMiss");
    setResource(profileKey, "loading");
    const existingReq = profileInFlightRef.current.get(profileKey);
    if (existingReq) {
      devLog("profile dedup", normalized);
      try {
        const { ud, ad, md } = await existingReq;
        if (background && activeProfileIntentRef.current !== profileKey) {
          devLog("profile dedup background stale skip", normalized);
          return;
        }
        latestUserIdRef.current = ud.User?.id ?? null;
        setUser(ud.User);
        const aa = (ad.MediaListCollection?.lists||[]).flatMap(l => (l.entries||[]).map(e => ({...e, listName:l.name, listStatus:l.status})));
        const am = (md.MediaListCollection?.lists||[]).flatMap(l => (l.entries||[]).map(e => ({...e, listName:l.name, listStatus:l.status})));
        setAllAnime(aa);
        setAllManga(am);
        setAnimeActivities([]);
        setMangaActivities([]);
        setAnimeActivityCache({});
        setMangaActivityCache({});
        setLoaded(true);
        setResource(profileKey, "success");
        if (!background) setInputVal("");
      } catch (err) {
        if (err?.name !== "AbortError") {
          setError(err.message || "Erreur lors du chargement");
          setResource(profileKey, "error", err.message || "Erreur profil");
        }
      }
      return;
    }
    if (profileAbortRef.current && profileAbortKeyRef.current !== profileKey) profileAbortRef.current.abort();
    const abortController = new AbortController();
    profileAbortRef.current = abortController;
    profileAbortKeyRef.current = profileKey;
    if (!background) {
      setLoading(true); setError(null); setLoaded(false);
    } else {
      setError(null);
    }
    const startedAt = performance.now();
    try {
      const req = (async () => {
        const ud = await fetchAL(USER_QUERY, { name }, { signal: abortController.signal });
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
      latestUserIdRef.current = ud.User?.id ?? null;
      setUser(ud.User);
      const aa = (ad.MediaListCollection?.lists||[]).flatMap(l => (l.entries||[]).map(e => ({...e, listName:l.name, listStatus:l.status})));
      const am = (md.MediaListCollection?.lists||[]).flatMap(l => (l.entries||[]).map(e => ({...e, listName:l.name, listStatus:l.status})));
      setAllAnime(aa);
      setAllManga(am);
      if (!background) {
        setAnimeActivities([]);
        setMangaActivities([]);
        setAnimeActivityCache({});
        setMangaActivityCache({});
      }
      setLoaded(true);
      if (!background) setInputVal("");
      safeWriteCache(profileUserCacheKey(normalized), ud.User, PROFILE_USER_TTL_MS);
      safeWriteCache(profileAnimeCacheKey(normalized), aa, PROFILE_LIST_TTL_MS);
      safeWriteCache(profileMangaCacheKey(normalized), am, PROFILE_LIST_TTL_MS);
      metricInc("cacheWrite", 3);
      devLog("profile write", normalized);
      setResource(profileKey, "success");
    } catch (err) {
      if (err?.name === "AbortError") {
        devLog("profile aborted", normalized);
        return;
      }
      if (!background) {
        setError(err.message || "Erreur lors du chargement");
      }
      setResource(profileKey, "error", err.message || "Erreur profil");
    } finally {
      metricProfileFetchDuration(performance.now() - startedAt);
      if (profileAbortRef.current === abortController) {
        profileAbortRef.current = null;
        profileAbortKeyRef.current = null;
      }
      profileInFlightRef.current.delete(profileKey);
      if (!background) setLoading(false);
    }
  }, [metricInc, metricProfileFetchDuration, setResource, setInputVal]);

  useEffect(() => {
    if (defaultProfileBootstrapDone) return;
    defaultProfileBootstrapDone = true;
    fetchData("Kirikou");
  }, [fetchData]);
  useEffect(() => () => {
    if (profileAbortRef.current) profileAbortRef.current.abort();
  }, []);

  const changeYear = (y) => setYear(y);

  const handleSubmit = () => {
    if (inputVal.trim()) fetchData(inputVal.trim());
  };

  const retryYearNow = useCallback((targetYear) => {
    if (!user?.id) return;
    if (!targetYear || targetYear < 1970) return;
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
  }, [user?.id]);

  const handleRetryComparisonNow = useCallback(() => {
    const compareYear = (month === 0 || month === 1) ? year - 1 : null;
    if (!compareYear || compareYear < 1970) return;
    retryYearNow(compareYear);
  }, [month, retryYearNow, year]);

  const prefetchYearActivities = useCallback(async (targetYear, ownerId) => {
    const uid = ownerId;
    if (!uid || !targetYear || targetYear < 1970) return;
    const aKey = `activity:${uid}:ANIME_LIST:${targetYear}`;
    const mKey = `activity:${uid}:MANGA_LIST:${targetYear}`;
    try {
      const fetchOne = async (type) => {
        const key = `activity:${uid}:${type}:${targetYear}`;
        let req = activityInFlightRef.current.get(key);
        if (!req) {
          setResource(key, "loading");
          req = fetchActivitiesWithRetry(uid, type, targetYear);
          activityInFlightRef.current.set(key, req);
        }
        try {
          return await req;
        } finally {
          activityInFlightRef.current.delete(key);
        }
      };
      const aActs = await fetchOne("ANIME_LIST");
      const mActs = await fetchOne("MANGA_LIST");
      if (latestUserIdRef.current !== uid) return;
      setAnimeActivityCache((prev) => ({ ...prev, [targetYear]: aActs }));
      setMangaActivityCache((prev) => ({ ...prev, [targetYear]: mActs }));
      safeWriteCache(activityCacheKey(uid, "ANIME_LIST", targetYear), aActs, getActivityTtlMs(targetYear));
      safeWriteCache(activityCacheKey(uid, "MANGA_LIST", targetYear), mActs, getActivityTtlMs(targetYear));
      setResource(aKey, "success");
      setResource(mKey, "success");
      metricInc("cacheWrite", 2);
    } catch (err) {
      if (err?.name === "AbortError") return;
      if (latestUserIdRef.current !== uid) return;
      const msg = err?.message || "Erreur activite";
      setResource(aKey, "error", msg);
      setResource(mKey, "error", msg);
      if (String(msg).includes("Rate limit") || String(msg).includes("429")) metricInc("rateLimitErrors");
    }
  }, [metricInc, setResource]);

  useEffect(() => {
    if (!user?.id || !year) return;
    const ownerId = user.id;

    const yearsNeeded = new Set([year]);
    if (month === 0 || month === 1) yearsNeeded.add(year - 1);
    const scopeYears = [...yearsNeeded].filter((y) => y >= 1970);
    /** Retire les drapeaux « en cours » si le cache a déjà les 2 listes (évite loading bloqué après abort / course async). */
    scopeYears.forEach((y) => {
      if (animeActivityCache[y] && mangaActivityCache[y]) {
        activityYearsInFlightRef.current.delete(y);
      }
    });
    const inFlightScopeYears = scopeYears.filter((y) => activityYearsInFlightRef.current.has(y));

    const missing = [];
    const staleYears = new Set();
    let blockedByCooldown = 0;
    [...yearsNeeded].forEach((y) => {
      if (y < 1970) return;
      const hasAnimeMem = Boolean(animeActivityCache[y]);
      const hasMangaMem = Boolean(mangaActivityCache[y]);
      const cachedAnimeMeta = hasAnimeMem ? null : safeReadCacheMeta(activityCacheKey(ownerId, "ANIME_LIST", y), ACTIVITY_SWR_STALE_MS);
      const cachedMangaMeta = hasMangaMem ? null : safeReadCacheMeta(activityCacheKey(ownerId, "MANGA_LIST", y), ACTIVITY_SWR_STALE_MS);
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
        const inflightLabel = [...new Set(inFlightScopeYears)].sort((a, b) => b - a).join(", ");
        setActivityLoadingMessage(`Chargement des activites ${inflightLabel}...`);
      }
      if (blockedByCooldown > 0) {
        setActivityWarning("Certaines annees de comparaison sont temporairement en pause (rate limit). Reprise automatique apres cooldown.");
      } else {
        setActivityWarning(null);
      }
      if (staleYears.size > 0) {
        const staleLabel = [...staleYears].sort((a, b) => b - a).join(", ");
        setActivityWarning(`Actualisation en arriere-plan des activites ${staleLabel}...`);
        const idle = window.requestIdleCallback
          ? window.requestIdleCallback
          : (cb) => setTimeout(cb, 1200);
        idle(() => {
          staleYears.forEach((y) => prefetchYearActivities(y, ownerId));
        });
      }
      return;
    }

    missing.sort((a, b) => {
      if (a === year) return -1;
      if (b === year) return 1;
      return b - a;
    });

    const actionableMissing = missing.filter((y) => !activityYearsInFlightRef.current.has(y));
    const yearsForMessage = actionableMissing.length > 0 ? actionableMissing : missing;
    const compareYear = (month === 0 || month === 1) ? year - 1 : null;
    const needsCurrent = missing.includes(year);
    const needsCompareOnly =
      !needsCurrent &&
      compareYear !== null &&
      yearsForMessage.length === 1 &&
      yearsForMessage[0] === compareYear;
    if (needsCompareOnly) {
      setActivityLoadingMessage(`Chargement de l'annee de comparaison ${compareYear}...`);
    } else {
      const yearsLabel = [...new Set(yearsForMessage)].sort((a, b) => b - a).join(", ");
      if (yearsLabel) {
        setActivityLoadingMessage(`Chargement des activites ${yearsLabel}...`);
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
          try {
            const fetchActivity = async (type) => {
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
              } catch (err) {
                if (err?.name === "AbortError") throw err;
                if (latestUserIdRef.current !== ownerId) throw new DOMException("Aborted", "AbortError");
                setResource(key, "error", err.message || "Erreur activite");
                throw err;
              } finally {
                activityInFlightRef.current.delete(key);
              }
            };

            const aActs = await fetchActivity("ANIME_LIST");
            await sleep(300, activityAbortController.signal);
            const mActs = await fetchActivity("MANGA_LIST");
            if (cancelled) return;
            if (latestUserIdRef.current !== ownerId) continue;
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
          } catch (err) {
            if (err?.name === "AbortError") return;
            if (!cancelled && latestUserIdRef.current === ownerId) {
              const message = err.message || "Erreur lors du chargement des activites";
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
                setActivityWarning(`Comparaison ${yf} en pause apres plusieurs rate limits. Reessaie en changeant de periode ou dans quelques minutes.`);
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
  }, [user?.id, year, month, animeActivityCache, mangaActivityCache, metricInc, prefetchYearActivities, setResource]);

  useEffect(() => {
    if (!user?.id) return;
    if (latestUserIdRef.current !== user.id) return;
    if (animeActivityCache[year] && mangaActivityCache[year]) {
      setAnimeActivities(animeActivityCache[year]);
      setMangaActivities(mangaActivityCache[year]);
    }
  }, [year, animeActivityCache, mangaActivityCache, user?.id]);

  const years = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const ys = new Set([nowYear]);
    [...allAnime, ...allManga].forEach((e) => {
      if (e.updatedAt) ys.add(new Date(e.updatedAt * 1000).getFullYear());
      if (e.startedAt?.year) ys.add(e.startedAt.year);
      if (e.completedAt?.year) ys.add(e.completedAt.year);
    });
    const arr = [...ys];
    if (arr.length === 0) return [nowYear];
    const minY = Math.min(...arr);
    const maxY = Math.max(...arr);
    const filled = new Set();
    for (let y = minY; y <= maxY; y += 1) filled.add(y);
    return [...filled].sort((a, b) => b - a);
  }, [allAnime, allManga]);

  useEffect(() => {
    if (years.length && !years.includes(year)) {
      setYear(years[0]);
    }
  }, [years, year]);

  useEffect(() => {
    if (!user?.id || !loaded) return undefined;
    const ownerId = user.id;
    const candidates = [year - 1, year + 1].filter((y) => years.includes(y) && y >= 1970);
    if (candidates.length === 0) return undefined;
    const idle = window.requestIdleCallback
      ? window.requestIdleCallback
      : (cb) => setTimeout(cb, 1800);
    const cancelIdle = window.cancelIdleCallback
      ? window.cancelIdleCallback
      : (id) => clearTimeout(id);
    const idleId = idle(() => {
      candidates.forEach((y) => {
        if (!animeActivityCache[y] || !mangaActivityCache[y]) prefetchYearActivities(y, ownerId);
      });
    });
    return () => cancelIdle(idleId);
  }, [animeActivityCache, loaded, mangaActivityCache, prefetchYearActivities, user?.id, year, years]);

  const mergedAnimeForTotals = useMemo(
    () => mergeActivitiesForDelta(year, animeActivityCache),
    [year, animeActivityCache]
  );
  const mergedMangaForTotals = useMemo(
    () => mergeActivitiesForDelta(year, mangaActivityCache),
    [year, mangaActivityCache]
  );

  const animeMediaIdsWithProgress = useMemo(
    () => getMediaIdsWithProgressInPeriod(mergedAnimeForTotals, year, month),
    [mergedAnimeForTotals, year, month]
  );
  const mangaMediaIdsWithProgress = useMemo(
    () => getMediaIdsWithProgressInPeriod(mergedMangaForTotals, year, month),
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
  const animeCompleted = useMemo(
    () => animeEntries.filter(e => completedInYear(e, year) && (month === 0 || completedInMonth(e, year, month))),
    [animeEntries, year, month]
  );
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
    () => computePeriodDeltaFromActivities(mergedMangaForTotals, year, month),
    [mergedMangaForTotals, year, month]
  );
  const totalVol = useMemo(() => mangaEntries.reduce((s,e) => s + (e.progressVolumes||0), 0), [mangaEntries]);
  const scoredA = useMemo(() => animeEntries.filter(e => e.score > 0), [animeEntries]);
  const scoredM = useMemo(() => mangaEntries.filter(e => e.score > 0), [mangaEntries]);
  const avgA = scoredA.length ? (scoredA.reduce((s,e)=>s+e.score,0)/scoredA.length).toFixed(1) : "—";
  const avgM = scoredM.length ? (scoredM.reduce((s,e)=>s+e.score,0)/scoredM.length).toFixed(1) : "—";

  const genreData = useMemo(() => {
    const genreCount = {};
    [...animeEntries,...mangaEntries].forEach(e => (e.media?.genres||[]).forEach(g => { genreCount[g]=(genreCount[g]||0)+1; }));
    return Object.entries(genreCount).sort((a,b)=>b[1]-a[1]).slice(0,10).map(([name,count])=>({name,count}));
  }, [animeEntries, mangaEntries]);

  const scoreData = useMemo(() => {
    const scoreDist = {};
    [...scoredA,...scoredM].forEach(e => { const s=Math.round(e.score); scoreDist[s]=(scoreDist[s]||0)+1; });
    return Array.from({length:10},(_,i)=>({score:`${i+1}`,count:scoreDist[i+1]||0}));
  }, [scoredA, scoredM]);

  const mangaChaptersChartData = useMemo(() => {
    const { compareY, compareM } = getComparisonPeriodMeta(year, month);
    const mergedCur = mergeActivitiesForDelta(year, mangaActivityCache);
    const mergedComp = mergeActivitiesForDelta(compareY, mangaActivityCache);

    if (month === 0) {
      const curM = computeMonthlyDeltasFromActivities(mergedCur, year);
      const prevM = computeMonthlyDeltasFromActivities(mergedComp, compareY);
      return MONTHS.map((name, i) => ({
        label: name,
        current: curM[i + 1] || 0,
        compare: prevM[i + 1] || 0,
      }));
    }
    const curD = computeDailyDeltasInMonth(mergedCur, year, month);
    const compD = computeDailyDeltasInMonth(mergedComp, compareY, compareM);
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
      const curM = computeMonthlyDeltasFromActivities(mergedCur, year);
      const prevM = computeMonthlyDeltasFromActivities(mergedComp, compareY);
      return MONTHS.map((name, i) => ({
        label: name,
        current: curM[i + 1] || 0,
        compare: prevM[i + 1] || 0,
      }));
    }
    const curD = computeDailyDeltasInMonth(mergedCur, year, month);
    const compD = computeDailyDeltasInMonth(mergedComp, compareY, compareM);
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
    const fmtCount = {};
    animeEntries.forEach(e => { const f=e.media?.format||"OTHER"; fmtCount[f]=(fmtCount[f]||0)+1; });
    return Object.entries(fmtCount).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));
  }, [animeEntries]);

  const statusCntA = useMemo(() => {
    const counts = {};
    animeEntries.forEach(e => { counts[e.status]=(counts[e.status]||0)+1; });
    return counts;
  }, [animeEntries]);
  const statusCntM = useMemo(() => {
    const counts = {};
    mangaEntries.forEach(e => { counts[e.status]=(counts[e.status]||0)+1; });
    return counts;
  }, [mangaEntries]);

  const sortedA = useMemo(
    () => [...animeEntries].sort((a,b)=>(b.score||0)-(a.score||0)||(b.progress||0)-(a.progress||0)),
    [animeEntries]
  );
  const sortedM = useMemo(
    () => [...mangaEntries].sort((a,b)=>(b.score||0)-(a.score||0)||(b.progress||0)-(a.progress||0)),
    [mangaEntries]
  );

  const topA = useMemo(
    () => sortedA.filter((e) => e.status !== "PLANNING"),
    [sortedA]
  );
  const topM = useMemo(
    () => sortedM.filter((e) => e.status !== "PLANNING"),
    [sortedM]
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
    {key:"charts",label:"Graphiques"},
  ];

  const periodLabel = month === 0 ? `${year}` : `${MONTHS[month - 1]} ${year}`;
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
  const retryableYears = useMemo(() => {
    if (!user?.id) return [];
    const prefix = `activity:${user.id}:`;
    const yearsSet = new Set();
    Object.entries(resourceStatus).forEach(([k, meta]) => {
      if (!k.startsWith(prefix) || meta?.status !== "error") return;
      const parts = k.split(":");
      const y = Number(parts[parts.length - 1]);
      if (!Number.isNaN(y) && y >= 1970) yearsSet.add(y);
    });
    return [...yearsSet].sort((a, b) => b - a);
  }, [resourceStatus, user?.id]);

  const anilistProfileUrl = user
    ? `https://anilist.co/user/${encodeURIComponent(user.name)}/`
    : null;
  const profileEpisodesAll = user?.statistics?.anime?.episodesWatched ?? 0;
  const profileChaptersAll = user?.statistics?.manga?.chaptersRead ?? 0;
  const profileEpisodesFmt = profileEpisodesAll.toLocaleString("fr-FR");
  const profileChaptersFmt = profileChaptersAll.toLocaleString("fr-FR");

  return (
    <div style={{background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'Overpass',sans-serif"}}>

      {/* HEADER */}
      <div
        className={`header-surface ${user?.bannerImage ? "header-surface--banner" : "header-surface--plain"}`}
        style={
          user?.bannerImage
            ? { backgroundImage: `linear-gradient(to bottom, rgba(11,22,34,0.3), ${C.bg}), url(${user.bannerImage})` }
            : undefined
        }
      >
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          <div className="header-top-row">
            <div className="header-brand" aria-label="AniList Stat">
              <span className="header-brand-mark">
                <span className="header-brand-a">A</span>
                <span className="header-brand-s" style={{color:C.accent}}>S</span>
              </span>
            </div>
            <div className="header-search-group">
              <input value={inputVal} onChange={e=>setInputVal(e.target.value)}
                onKeyDown={(e)=>{ if (e.key === "Enter" && inputVal.trim()) handleSubmit(); }}
                placeholder="Nom d'utilisateur AniList"
                style={{
                  flex:1,background:C.cardBg,border:`1px solid ${C.border}`,
                  borderRight:"none",borderRadius:"8px 0 0 8px",
                  padding:"10px 14px",color:C.text,fontSize:14,fontFamily:"inherit",
                }} />
              <button
                type="button"
                className="header-search-submit"
                aria-label="Rechercher ce profil"
                disabled={!inputVal.trim()}
                onClick={handleSubmit}
                style={{
                  background:C.accent,color:"#fff",border:`1px solid ${C.accent}`,
                  borderLeft:"none",borderRadius:"0 8px 8px 0",
                  padding:"10px 14px",minWidth:48,
                  display:"inline-flex",alignItems:"center",justifyContent:"center",
                  fontFamily:"inherit",
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20 16.65 16.65" />
                </svg>
              </button>
            </div>
            <div className="header-nav-fill" aria-hidden />
            {showApiBadge && (
              <div style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${C.border}`,
                borderRadius: 999,
                padding: "6px 10px",
                fontSize: 12,
                color: apiStatusBadge.color,
                fontWeight: 700
              }}>
                {apiStatusBadge.label}
              </div>
            )}
            {IS_DEV_LOCAL && (
              <button
                type="button"
                onClick={() => setShowDevPanel((v) => !v)}
                style={{
                  background: "transparent",
                  border: `1px solid ${C.border}`,
                  color: C.textMuted,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                {showDevPanel ? "Masquer debug" : "Afficher debug"}
              </button>
            )}
          </div>

          <div className="period-panel">
            <div className="period-panel-title">Période d'analyse</div>
            <div className="period-pills period-pills--years">
              {years.map(y => (
                <button key={y} type="button" className={`period-pill ${y===year?"active":""}`}
                  onClick={()=>changeYear(y)}>{y}</button>
              ))}
            </div>
            <div className="period-divider" />
            <div className="period-pills period-pills--months">
              <button type="button" className={`period-pill period-pill--wide ${month===0?"active":""}`} onClick={() => setMonth(0)}>Toute l'année</button>
              {MONTHS.map((m, idx) => (
                <button key={m} type="button" className={`period-pill ${month===idx+1?"active":""}`} onClick={() => setMonth(idx+1)}>{m}</button>
              ))}
            </div>
          </div>

          {user && (
              <div className="header-profile fade-in">
                <img
                  className="header-profile-avatar"
                  src={user.avatar?.large||user.avatar?.medium}
                  alt=""
                  style={{border:`2px solid ${C.accent}`}}
                />
                <div className="header-profile-text">
                  <a
                    className="header-profile-name-link"
                    href={anilistProfileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {user.name}
                  </a>
                  <div
                    className="header-profile-meta"
                    aria-label={`${profileEpisodesFmt} épisodes vus et ${profileChaptersFmt} chapitres lus au total sur AniList`}
                  >
                    <div className="header-profile-stat-block">
                      <span className="header-profile-stat-value">{profileEpisodesFmt}</span>
                      <span className="header-profile-stat-caption">Épisodes vus</span>
                    </div>
                    <div className="header-profile-meta-rule" aria-hidden />
                    <div className="header-profile-stat-block">
                      <span className="header-profile-stat-value">{profileChaptersFmt}</span>
                      <span className="header-profile-stat-caption">Chapitres lus</span>
                    </div>
                  </div>
                </div>
              </div>
          )}
        </div>
      </div>

      {/* MAIN */}
      <div style={{maxWidth:1100,margin:"0 auto",padding:"0 24px 60px"}}>
        {loading && (
          <div style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",padding:80}}>
            <div style={{width:48,height:48,border:`3px solid ${C.border}`,borderTop:`3px solid ${C.accent}`,borderRadius:"50%",animation:"spin 0.8s linear infinite"}} />
            <div style={{color:C.textMuted,marginTop:16,fontSize:14}}>Chargement des données AniList...</div>
          </div>
        )}

        {error && (
          <div style={{background:"rgba(229,57,53,0.1)",border:`1px solid ${C.red}`,borderRadius:10,padding:"16px 20px",marginTop:24,color:C.red,fontSize:14}}>
            Erreur : {error}
          </div>
        )}

        {loaded && !loading && loadingActivities && (
          <div style={{marginTop:24,color:C.textMuted,fontSize:13,display:"inline-flex",alignItems:"center",gap:10}}>
            <span>
              {displayActivityLoadingMessage || activityLoadingMessage}
              {activityEtaSeconds != null && activityEtaSeconds > 0
                ? ` — temps restant estimé ~${activityEtaSeconds}s`
                : activityEtaSeconds === 0
                  ? " — finalisation…"
                  : ""}
              {rateInfoLabel ? ` · ${rateInfoLabel}` : ""}
            </span>
            <span
              aria-hidden="true"
              style={{
                width: 14,
                height: 14,
                border: `2px solid ${C.border}`,
                borderTop: `2px solid ${C.accent}`,
                borderRadius: "50%",
                animation: "spin 0.8s linear infinite"
              }}
            />
          </div>
        )}

        {loaded && !loading && activityWarning && !loadingActivities && (
          <div style={{marginTop:12,display:"flex",alignItems:"center",gap:12,flexWrap:"wrap"}}>
            <div style={{color:C.orange,fontSize:12}}>
              {activityWarning}
            </div>
            <button
              type="button"
              onClick={handleRetryComparisonNow}
              style={{
                background: "transparent",
                color: C.accent,
                border: `1px solid ${C.accent}`,
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Reessayer la comparaison maintenant
            </button>
            {retryableYears.map((yy) => (
              <button
                key={`retry-year-${yy}`}
                type="button"
                onClick={() => retryYearNow(yy)}
                style={{
                  background: "transparent",
                  color: C.text,
                  border: `1px solid ${C.border}`,
                  borderRadius: 8,
                  padding: "6px 10px",
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: "pointer"
                }}
              >
                Reessayer {yy}
              </button>
            ))}
          </div>
        )}

        {loaded && !loading && IS_DEV_LOCAL && showDevPanel && (
          <div style={{marginTop:12,background:C.cardBg,border:`1px solid ${C.border}`,borderRadius:8,padding:"10px 12px",fontSize:12,color:C.textMuted,display:"flex",flexDirection:"column",gap:10}}>
            <div style={{display:"flex",flexWrap:"wrap",gap:"10px 16px",alignItems:"baseline"}}>
              <strong style={{color:C.text,width:"100%",fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase"}}>Activités (période & graphiques)</strong>
              {activityLoadDebug ? (
                <>
                  <span>Années ciblées : <span style={{color:C.text}}>{activityLoadDebug.yearsTotal}</span></span>
                  <span>Chargées : <span style={{color:C.green}}>{activityLoadDebug.yearsComplete}</span></span>
                  <span>Restantes : <span style={{color: activityLoadDebug.yearsPending ? C.orange : C.text}}>{activityLoadDebug.yearsPending}</span></span>
                  <span>Entrées anime en cache : <span style={{color:C.text}}>{activityLoadDebug.animeRows.toLocaleString("fr-FR")}</span></span>
                  <span>Entrées manga en cache : <span style={{color:C.text}}>{activityLoadDebug.mangaRows.toLocaleString("fr-FR")}</span></span>
                  <span>File requêtes AniList : <span style={{color:C.text}}>{rateLimitState?.queued ?? 0}</span> en attente, <span style={{color:C.text}}>{rateLimitState?.inFlight ?? 0}</span> en cours</span>
                </>
              ) : (
                <span>—</span>
              )}
            </div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"10px 16px",fontSize:11,opacity:0.92}}>
              <strong style={{color:C.textDim,width:"100%",fontSize:11,letterSpacing:"0.06em",textTransform:"uppercase"}}>Cache profil & proxy (détail)</strong>
              <span>profil hit/miss/write : {debugMetricsView?.cacheHit ?? 0} / {debugMetricsView?.cacheMiss ?? 0} / {debugMetricsView?.cacheWrite ?? 0}</span>
              <span>rate-limit : {debugMetricsView?.rateLimitErrors ?? 0}</span>
              <span>profil fetch moy. : {debugMetricsView?.avgProfileFetchMs ?? 0} ms</span>
              <span>proxy hit/miss/bypass : {proxyCacheStats?.hit ?? 0} / {proxyCacheStats?.miss ?? 0} / {proxyCacheStats?.bypass ?? 0}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                const reset = window.AniListStatDebug?.resetMetrics;
                if (typeof reset === "function") reset();
                const getter = window.AniListStatDebug?.getMetrics;
                if (typeof getter === "function") setDebugMetricsView(getter());
              }}
              style={{
                alignSelf: "flex-end",
                background: "transparent",
                color: C.accent,
                border: `1px solid ${C.accent}`,
                borderRadius: 6,
                padding: "4px 8px",
                fontSize: 11,
                fontWeight: 700,
                cursor: "pointer"
              }}
            >
              Reset metrics
            </button>
          </div>
        )}

        {loaded && !loading && (
          <>
            {/* TABS */}
            <div style={{display:"flex",gap:4,marginTop:24,marginBottom:24,borderBottom:`1px solid ${C.border}`,overflowX:"auto"}}>
              {tabs.map(t => (
                <button key={t.key} className={`tab-btn ${tab===t.key?"active":""}`}
                  onClick={()=>setTab(t.key)}>{t.label}</button>
              ))}
            </div>

            {/* OVERVIEW */}
            {tab==="overview" && (
              <div style={{display:"flex",flexDirection:"column",gap:24}}>
                <div className="fade-in" style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))",gap:14}}>
                  <StatCard label="Épisodes" value={totalEp} sub={`≈ ${fmtMin(totalMin)}`} />
                  <StatCard label="Score anime" value={avgA} sub={`sur ${scoredA.length} notés`} />
                  <StatCard label="Chapitres" value={totalCh} sub={`${totalVol} volumes`} />
                  <StatCard label="Score manga" value={avgM} sub={`sur ${scoredM.length} notés`} />
                  <StatCard label="Jours actifs" value={`${activeDaysCount} / ${periodDayTotal}`} sub="jours uniques avec activité sur la période" />
                </div>

                <div className="fade-in fade-in-delay-1" style={{display:"flex",flexDirection:"column",gap:20}}>
                  <ChartCard title="Chapitres lus">
                    <PeriodCompareLegend
                      legendCurrent={chartPeriodLegend.legendCurrent}
                      legendCompare={chartPeriodLegend.legendCompare}
                    />
                    {compareAvailability.missing && (
                      <div
                        className={compareAvailability.loadingComparison ? "compare-chart-loading-hint" : ""}
                        style={{
                          color: compareAvailability.loadingComparison ? C.textMuted : C.orange,
                          fontSize: 12,
                          marginBottom: 8
                        }}
                      >
                        {compareAvailability.loadingComparison
                          ? compareAvailability.loadingLabel
                          : compareAvailability.idleLabel}
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={mangaChaptersChartData} margin={{ top: 26, right: 10, left: 0, bottom: 4 }}>
                        <XAxis dataKey="label" tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} interval={month === 0 ? 0 : "preserveStartEnd"} />
                        <YAxis tick={{ fill: C.textDim, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                        <Tooltip content={(props) => <CompareLineTooltip {...props} year={year} month={month} />} />
                        <Line
                          type="monotone"
                          dataKey="current"
                          stroke={C.accent}
                          strokeWidth={2}
                          dot={{
                            r: 5,
                            fill: "rgba(61, 180, 242, 0.72)",
                            stroke: "rgba(11, 22, 34, 0.45)",
                            strokeWidth: 1,
                          }}
                          activeDot={{ r: 6, fill: "rgba(61, 180, 242, 0.9)" }}
                          isAnimationActive={false}
                        >
                          <LabelList
                            dataKey="current"
                            position="top"
                            offset={8}
                            fill="#edf1f5"
                            fontSize={month === 0 ? 11 : 10}
                            fontWeight={600}
                            formatter={(v) => (v != null && Number(v) > 0 ? String(v) : "")}
                          />
                        </Line>
                        <Line
                          type="monotone"
                          dataKey="compare"
                          stroke="#4a5d6e"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: "#5a6d7e" }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                  <ChartCard title="Épisodes vus">
                    <PeriodCompareLegend
                      legendCurrent={chartPeriodLegend.legendCurrent}
                      legendCompare={chartPeriodLegend.legendCompare}
                    />
                    {compareAvailability.missing && (
                      <div
                        className={compareAvailability.loadingComparison ? "compare-chart-loading-hint" : ""}
                        style={{
                          color: compareAvailability.loadingComparison ? C.textMuted : C.orange,
                          fontSize: 12,
                          marginBottom: 8
                        }}
                      >
                        {compareAvailability.loadingComparison
                          ? compareAvailability.loadingLabel
                          : compareAvailability.idleLabel}
                      </div>
                    )}
                    <ResponsiveContainer width="100%" height={240}>
                      <LineChart data={animeEpisodesChartData} margin={{ top: 26, right: 10, left: 0, bottom: 4 }}>
                        <XAxis dataKey="label" tick={{ fill: C.textDim, fontSize: 11 }} axisLine={false} tickLine={false} interval={month === 0 ? 0 : "preserveStartEnd"} />
                        <YAxis tick={{ fill: C.textDim, fontSize: 12 }} axisLine={false} tickLine={false} allowDecimals={false} width={36} />
                        <Tooltip content={(props) => <CompareLineTooltip {...props} year={year} month={month} />} />
                        <Line
                          type="monotone"
                          dataKey="current"
                          stroke={C.accent}
                          strokeWidth={2}
                          dot={{
                            r: 5,
                            fill: "rgba(61, 180, 242, 0.72)",
                            stroke: "rgba(11, 22, 34, 0.45)",
                            strokeWidth: 1,
                          }}
                          activeDot={{ r: 6, fill: "rgba(61, 180, 242, 0.9)" }}
                          isAnimationActive={false}
                        >
                          <LabelList
                            dataKey="current"
                            position="top"
                            offset={8}
                            fill="#edf1f5"
                            fontSize={month === 0 ? 11 : 10}
                            fontWeight={600}
                            formatter={(v) => (v != null && Number(v) > 0 ? String(v) : "")}
                          />
                        </Line>
                        <Line
                          type="monotone"
                          dataKey="compare"
                          stroke="#4a5d6e"
                          strokeWidth={2}
                          dot={false}
                          activeDot={{ r: 4, fill: "#5a6d7e" }}
                          isAnimationActive={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {topA.length > 0 && (
                  <div className="fade-in fade-in-delay-2">
                    <div style={{fontSize:14,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>
                      Top Anime {periodLabel}
                    </div>
                    <div style={{display:"flex",gap:14,overflowX:"auto",paddingBottom:8}}>
                      {topA.slice(0,10).map(e => <MediaCard key={e.id} entry={e} type="ANIME"/>)}
                    </div>
                  </div>
                )}
                {topM.length > 0 && (
                  <div className="fade-in fade-in-delay-3">
                    <div style={{fontSize:14,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>
                      Top Manga {periodLabel}
                    </div>
                    <div style={{display:"flex",gap:14,overflowX:"auto",paddingBottom:8}}>
                      {topM.slice(0,10).map(e => <MediaCard key={e.id} entry={e} type="MANGA"/>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ANIME TAB */}
            {tab==="anime" && (
              <div style={{display:"flex",flexDirection:"column",gap:20}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))",gap:14}}>
                  <StatCard label="Total anime" value={animeEntries.length}/>
                  <StatCard label="Terminés" value={animeCompleted.length}/>
                  <StatCard label="Épisodes" value={totalEp}/>
                  <StatCard label="Temps" value={fmtMin(totalMin)}/>
                </div>
                <ChartCard title="Par statut">
                  <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                    {Object.entries(statusCntA).map(([s,c]) => (
                      <div key={s} style={{background:C.bg,borderRadius:8,padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:20,fontWeight:700,color:STATUS_COLORS[s]||C.accent}}>{c}</span>
                        <span style={{fontSize:13,color:C.textMuted}}>{STATUS_LABELS[s]||s}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>
                <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                  {sortedA.map(e => <MediaCard key={e.id} entry={e} type="ANIME"/>)}
                </div>
              </div>
            )}

            {/* MANGA TAB */}
            {tab==="manga" && (
              <div style={{display:"flex",flexDirection:"column",gap:20}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))",gap:14}}>
                  <StatCard label="Total manga" value={mangaEntries.length}/>
                  <StatCard label="Terminés" value={mangaCompleted.length}/>
                  <StatCard label="Chapitres" value={totalCh}/>
                  <StatCard label="Volumes" value={totalVol}/>
                </div>
                <ChartCard title="Par statut">
                  <div style={{display:"flex",flexWrap:"wrap",gap:12}}>
                    {Object.entries(statusCntM).map(([s,c]) => (
                      <div key={s} style={{background:C.bg,borderRadius:8,padding:"10px 16px",display:"flex",alignItems:"center",gap:8}}>
                        <span style={{fontSize:20,fontWeight:700,color:STATUS_COLORS[s]||C.pink}}>{c}</span>
                        <span style={{fontSize:13,color:C.textMuted}}>{STATUS_LABELS[s]||s}</span>
                      </div>
                    ))}
                  </div>
                </ChartCard>
                <div style={{display:"flex",gap:14,flexWrap:"wrap"}}>
                  {sortedM.map(e => <MediaCard key={e.id} entry={e} type="MANGA"/>)}
                </div>
              </div>
            )}

            {/* CHARTS TAB */}
            {tab==="charts" && (
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(440px, 1fr))",gap:20}}>
                <ChartCard title="Genres les plus regardés/lus">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={genreData} layout="vertical" margin={{left:80}}>
                      <XAxis type="number" tick={{fill:C.textDim,fontSize:12}} axisLine={false} tickLine={false}/>
                      <YAxis type="category" dataKey="name" tick={{fill:C.textMuted,fontSize:12}} axisLine={false} tickLine={false} width={80}/>
                      <Tooltip content={<CTooltip/>}/>
                      <Bar dataKey="count" name="Entrées" radius={[0,4,4,0]} fill={C.accent}/>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Distribution des scores">
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={scoreData}>
                      <XAxis dataKey="score" tick={{fill:C.textDim,fontSize:12}} axisLine={false} tickLine={false}/>
                      <YAxis tick={{fill:C.textDim,fontSize:12}} axisLine={false} tickLine={false} allowDecimals={false}/>
                      <Tooltip content={<CTooltip/>}/>
                      <Bar dataKey="count" name="Entrées" radius={[4,4,0,0]}>
                        {scoreData.map((_,i) => (
                          <Cell key={i} fill={i<4?C.red:i<6?C.orange:i<8?C.yellow:C.green}/>
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </ChartCard>

                <ChartCard title="Formats anime">
                  <ResponsiveContainer width="100%" height={280}>
                    <PieChart>
                      <Pie data={fmtData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} innerRadius={55} paddingAngle={3} strokeWidth={0}>
                        {fmtData.map((_,i) => <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}/>)}
                      </Pie>
                      <Tooltip content={<CTooltip/>}/>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{display:"flex",flexWrap:"wrap",gap:8,justifyContent:"center",marginTop:8}}>
                    {fmtData.map((f,i) => (
                      <div key={f.name} style={{display:"flex",alignItems:"center",gap:4,fontSize:12,color:C.textMuted}}>
                        <div style={{width:10,height:10,borderRadius:2,background:PIE_COLORS[i%PIE_COLORS.length]}}/>
                        {f.name} ({f.value})
                      </div>
                    ))}
                  </div>
                </ChartCard>

                <ChartCard title="Genres (radar)">
                  <ResponsiveContainer width="100%" height={300}>
                    <RadarChart data={genreData.slice(0,8)}>
                      <PolarGrid stroke={C.border}/>
                      <PolarAngleAxis dataKey="name" tick={{fill:C.textMuted,fontSize:11}}/>
                      <PolarRadiusAxis tick={false} axisLine={false}/>
                      <Radar name="Entrées" dataKey="count" stroke={C.accent} fill={C.accent} fillOpacity={0.25} strokeWidth={2}/>
                    </RadarChart>
                  </ResponsiveContainer>
                </ChartCard>

                {user?.statistics && (
                  <ChartCard title="Stats globales du profil (all-time)" style={{gridColumn:"1 / -1"}}>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(150px, 1fr))",gap:16}}>
                      {[
                        {v:user.statistics.anime.count, l:"Anime total", c:C.accent},
                        {v:user.statistics.anime.episodesWatched, l:"Épisodes total", c:C.accent},
                        {v:fmtMin(user.statistics.anime.minutesWatched), l:"Temps total", c:C.accent},
                        {v:user.statistics.manga.count, l:"Manga total", c:C.pink},
                        {v:user.statistics.manga.chaptersRead, l:"Chapitres total", c:C.pink},
                        {v:user.statistics.manga.volumesRead, l:"Volumes total", c:C.pink},
                      ].map((s,i) => (
                        <div key={i} style={{textAlign:"center",padding:16,background:C.bg,borderRadius:10}}>
                          <div style={{fontSize:26,fontWeight:800,color:s.c}}>{s.v}</div>
                          <div style={{fontSize:12,color:C.textMuted,marginTop:4}}>{s.l}</div>
                        </div>
                      ))}
                    </div>
                  </ChartCard>
                )}
              </div>
            )}

            {animeEntries.length===0 && mangaEntries.length===0 && (
              <div style={{textAlign:"center",padding:60,color:C.textMuted}}>
                <div style={{fontSize:48,marginBottom:16}}>📭</div>
                <div style={{fontSize:16}}>Aucune activité trouvée pour {periodLabel}</div>
                <div style={{fontSize:13,marginTop:8,color:C.textDim}}>
                  Vérifie que le profil est public et que des entrées ont été mises à jour cette année.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

const rootEl = document.getElementById("root");
if (ReactDOM.createRoot) {
  ReactDOM.createRoot(rootEl).render(<App/>);
} else {
  ReactDOM.render(<App/>, rootEl);
}
