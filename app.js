const { useState, useEffect, useCallback, useMemo } = React;
const {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, AreaChart, Area
} = Recharts;

const ANILIST_URL = "https://graphql.anilist.co";

const C = {
  bg: "#0b1622", cardBg: "#151f2e", accent: "#3db4f2",
  text: "#edf1f5", textMuted: "#8ba0b2", textDim: "#516170",
  border: "#1f2d3d", green: "#4caf50", orange: "#fb8c00",
  pink: "#e85d75", purple: "#c063e0", yellow: "#f7c948", red: "#e53935",
};

const PIE_COLORS = [C.accent, C.pink, C.purple, C.yellow, C.green, C.orange, "#5c6bc0", "#26a69a", "#ef5350", "#ab47bc"];

const MEDIA_LIST_QUERY = `
query ($userName: String!, $type: MediaType!) {
  MediaListCollection(userName: $userName, type: $type) {
    lists {
      name
      status
      entries {
        id
        status
        score(format: POINT_10)
        progress
        progressVolumes
        startedAt { year month day }
        completedAt { year month day }
        updatedAt
        media {
          id
          title { romaji english }
          coverImage { large medium color }
          episodes
          chapters
          volumes
          duration
          format
          genres
          averageScore
          status
        }
      }
    }
  }
}`;

const USER_QUERY = `
query ($name: String!) {
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

const LIST_ACTIVITY_QUERY = `
query ($userId: Int!, $type: ActivityType!, $page: Int!, $perPage: Int!) {
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
          duration
        }
      }
    }
  }
}`;

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function fetchAL(query, variables, retries = 1) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(ANILIST_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, variables }),
      });

      if (!res.ok) {
        const isRetryable = res.status === 429 || res.status >= 500;
        if (isRetryable && attempt < retries) {
          await sleep(350 * (attempt + 1));
          continue;
        }
        throw new Error(res.status === 429 ? "Rate limit AniList atteint, réessaie dans quelques secondes." : `HTTP ${res.status}`);
      }

      const json = await res.json();
      if (json.errors) throw new Error(json.errors.map(e => e.message).join(", "));
      return json.data;
    } catch (err) {
      lastErr = err;
      if (attempt < retries) await sleep(350 * (attempt + 1));
    }
  }
  throw lastErr || new Error("Erreur réseau AniList");
}

const isInYear = (e, y) => e.updatedAt && new Date(e.updatedAt * 1000).getFullYear() === y;
const isInMonth = (e, m) => {
  if (!e.updatedAt) return false;
  return new Date(e.updatedAt * 1000).getMonth() + 1 === m;
};
const completedInYear = (e, y) => e.completedAt?.year === y;
const startedInYear = (e, y) => e.startedAt?.year === y;
const completedInMonth = (e, m) => e.completedAt?.month === m;
const startedInMonth = (e, m) => e.startedAt?.month === m;

function fmtMin(min) {
  if (!min || min <= 0) return "0h";
  const d = Math.floor(min / 1440), h = Math.floor((min % 1440) / 60), m = min % 60;
  if (d > 0) return `${d}j ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const MONTHS = ["Jan","Fév","Mar","Avr","Mai","Jun","Jul","Aoû","Sep","Oct","Nov","Déc"];
const STATUS_LABELS = {
  COMPLETED:"Terminé", CURRENT:"En cours", PAUSED:"En pause",
  DROPPED:"Abandonné", PLANNING:"Planifié", REPEATING:"Rewatch"
};
const STATUS_COLORS = {
  COMPLETED: C.green, CURRENT: C.accent, PAUSED: C.orange,
  DROPPED: C.red, PLANNING: C.textDim, REPEATING: C.purple,
};

const getProgressNumber = (progressRaw) => {
  if (progressRaw === null || progressRaw === undefined) return 0;
  const nums = String(progressRaw).match(/\d+/g);
  if (!nums || nums.length === 0) return 0;
  return Math.max(...nums.map(n => Number(n) || 0));
};

const getStartEndTsForYear = (y) => {
  const start = new Date(y, 0, 1, 0, 0, 0, 0).getTime() / 1000;
  const end = new Date(y + 1, 0, 1, 0, 0, 0, 0).getTime() / 1000;
  return { start, end };
};

async function fetchListActivitiesForYear(userId, type, year) {
  const { start } = getStartEndTsForYear(year);
  const perPage = 50;
  let page = 1;
  let hasNextPage = true;
  const all = [];
  while (hasNextPage) {
    const data = await fetchAL(LIST_ACTIVITY_QUERY, { userId, type, page, perPage });
    const block = data?.Page;
    const items = block?.activities || [];
    all.push(...items.filter(Boolean));
    hasNextPage = Boolean(block?.pageInfo?.hasNextPage);
    const oldestInPage = items.reduce((minTs, item) => Math.min(minTs, item?.createdAt || Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
    if (oldestInPage < start) break;
    page += 1;
    // Safety cap + tiny delay to stay under AniList limits.
    if (page > 12) break;
    await sleep(120);
  }
  return all;
}

function computeYearlyDeltasFromActivities(activities, year) {
  const { start, end } = getStartEndTsForYear(year);
  const chronological = [...activities].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const lastByMedia = new Map();
  let total = 0;

  chronological.forEach((a) => {
    const mediaId = a?.media?.id;
    if (!mediaId) return;
    const current = getProgressNumber(a.progress);
    const prev = lastByMedia.has(mediaId) ? lastByMedia.get(mediaId) : 0;
    const delta = Math.max(0, current - prev);
    const ts = a.createdAt || 0;
    if (ts >= start && ts < end) total += delta;
    lastByMedia.set(mediaId, current);
  });

  return total;
}

function computeYearlyAnimeActivityTotals(activities, year) {
  const { start, end } = getStartEndTsForYear(year);
  const chronological = [...activities].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const lastByMedia = new Map();
  let episodes = 0;
  let minutes = 0;

  chronological.forEach((a) => {
    const mediaId = a?.media?.id;
    if (!mediaId) return;
    const current = getProgressNumber(a.progress);
    const prev = lastByMedia.has(mediaId) ? lastByMedia.get(mediaId) : 0;
    const delta = Math.max(0, current - prev);
    const ts = a.createdAt || 0;
    if (ts >= start && ts < end) {
      episodes += delta;
      minutes += delta * (a?.media?.duration || 24);
    }
    lastByMedia.set(mediaId, current);
  });

  return { episodes, minutes };
}

function isTsInPeriod(ts, year, month) {
  if (!ts) return false;
  const d = new Date(ts * 1000);
  const inYear = d.getFullYear() === year;
  if (!inYear) return false;
  return month === 0 ? true : d.getMonth() + 1 === month;
}

function computePeriodDeltaFromActivities(activities, year, month) {
  const chronological = [...activities].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const lastByMedia = new Map();
  let total = 0;

  chronological.forEach((a) => {
    const mediaId = a?.media?.id;
    if (!mediaId) return;
    const current = getProgressNumber(a.progress);
    const prev = lastByMedia.has(mediaId) ? lastByMedia.get(mediaId) : 0;
    const delta = Math.max(0, current - prev);
    if (isTsInPeriod(a.createdAt || 0, year, month)) total += delta;
    lastByMedia.set(mediaId, current);
  });

  return total;
}

function computePeriodAnimeActivityTotals(activities, year, month) {
  const chronological = [...activities].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const lastByMedia = new Map();
  let episodes = 0;
  let minutes = 0;

  chronological.forEach((a) => {
    const mediaId = a?.media?.id;
    if (!mediaId) return;
    const current = getProgressNumber(a.progress);
    const prev = lastByMedia.has(mediaId) ? lastByMedia.get(mediaId) : 0;
    const delta = Math.max(0, current - prev);
    if (isTsInPeriod(a.createdAt || 0, year, month)) {
      episodes += delta;
      minutes += delta * (a?.media?.duration || 24);
    }
    lastByMedia.set(mediaId, current);
  });

  return { episodes, minutes };
}

function computeMonthlyDeltasFromActivities(activities, year) {
  const chronological = [...activities].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const lastByMedia = new Map();
  const monthly = {};

  chronological.forEach((a) => {
    const mediaId = a?.media?.id;
    if (!mediaId || !a.createdAt) return;
    const current = getProgressNumber(a.progress);
    const prev = lastByMedia.has(mediaId) ? lastByMedia.get(mediaId) : 0;
    const delta = Math.max(0, current - prev);
    const d = new Date(a.createdAt * 1000);
    if (d.getFullYear() === year) {
      const m = d.getMonth() + 1;
      monthly[m] = (monthly[m] || 0) + delta;
    }
    lastByMedia.set(mediaId, current);
  });

  return monthly;
}

function StatCard({ label, value, sub, icon }) {
  return (
    <div className="stat-card">
      <div style={{fontSize:11, color:C.textMuted, textTransform:"uppercase", letterSpacing:1.2, fontWeight:600}}>
        {icon && <span style={{marginRight:6}}>{icon}</span>}{label}
      </div>
      <div style={{fontSize:28, fontWeight:700, color:C.text, lineHeight:1.2}}>{value}</div>
      {sub && <div style={{fontSize:12, color:C.textDim, marginTop:2}}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, children, style }) {
  return (
    <div className="chart-card" style={style}>
      <div style={{fontSize:13, fontWeight:600, color:C.textMuted, marginBottom:16, textTransform:"uppercase", letterSpacing:0.8}}>{title}</div>
      {children}
    </div>
  );
}

function MediaCard({ entry, type }) {
  const m = entry.media;
  const title = m.title.english || m.title.romaji;
  const prog = type === "ANIME"
    ? `${entry.progress||0}/${m.episodes||"?"} ep`
    : `${entry.progress||0}/${m.chapters||"?"} ch`;
  return (
    <div className="media-card">
      <div style={{position:"relative", width:"100%", height:210, overflow:"hidden"}}>
        <img src={m.coverImage?.large||m.coverImage?.medium} alt={title}
          style={{width:"100%",height:"100%",objectFit:"cover"}} />
        <div style={{
          position:"absolute",top:8,left:8,
          background:STATUS_COLORS[entry.status]||C.accent,
          color:"#fff",fontSize:10,fontWeight:700,
          padding:"3px 8px",borderRadius:4,
          textTransform:"uppercase",letterSpacing:0.5
        }}>{STATUS_LABELS[entry.status]||entry.status}</div>
        {entry.score > 0 && (
          <div style={{
            position:"absolute",bottom:8,right:8,
            background:"rgba(0,0,0,0.75)",backdropFilter:"blur(4px)",
            color:C.yellow,fontSize:13,fontWeight:700,
            padding:"3px 8px",borderRadius:4
          }}>★ {entry.score}</div>
        )}
      </div>
      <div style={{padding:"10px 10px 12px"}}>
        <div style={{
          fontSize:13,fontWeight:600,color:C.text,
          overflow:"hidden",textOverflow:"ellipsis",
          display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",
          lineHeight:1.3,minHeight:34
        }}>{title}</div>
        <div style={{fontSize:11,color:C.textMuted,marginTop:6}}>{prog}</div>
      </div>
    </div>
  );
}

function CTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{background:C.cardBg, border:`1px solid ${C.border}`, borderRadius:8, padding:"10px 14px", fontSize:13}}>
      <div style={{color:C.text,fontWeight:600,marginBottom:4}}>{label}</div>
      {payload.map((p,i) => (
        <div key={i} style={{color:p.color||C.accent}}>{p.name}: {p.value}</div>
      ))}
    </div>
  );
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

  const fetchData = useCallback(async (name) => {
    setLoading(true); setError(null); setLoaded(false);
    try {
      const [ud, ad, md] = await Promise.all([
        fetchAL(USER_QUERY, { name }),
        fetchAL(MEDIA_LIST_QUERY, { userName: name, type: "ANIME" }),
        fetchAL(MEDIA_LIST_QUERY, { userName: name, type: "MANGA" }),
      ]);
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
    } catch (err) {
      setError(err.message || "Erreur lors du chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchData("Kirikou"); }, []);

  const changeYear = (y) => setYear(y);

  const handleSubmit = () => {
    if (inputVal.trim()) fetchData(inputVal.trim());
  };

  useEffect(() => {
    if (!user?.id || !year) return;
    const cachedA = animeActivityCache[year];
    const cachedM = mangaActivityCache[year];
    if (cachedA && cachedM) {
      setAnimeActivities(cachedA);
      setMangaActivities(cachedM);
      return;
    }

    let cancelled = false;
    setError(null);
    setLoadingActivities(true);
    (async () => {
      try {
        const aActs = await fetchListActivitiesForYear(user.id, "ANIME_LIST", year);
        await sleep(250);
        const mActs = await fetchListActivitiesForYear(user.id, "MANGA_LIST", year);
        if (cancelled) return;
        setAnimeActivityCache(prev => ({ ...prev, [year]: aActs }));
        setMangaActivityCache(prev => ({ ...prev, [year]: mActs }));
        setAnimeActivities(aActs);
        setMangaActivities(mActs);
      } catch (err) {
        if (!cancelled) setError(err.message || "Erreur lors du chargement des activités");
      } finally {
        if (!cancelled) setLoadingActivities(false);
      }
    })();

    return () => { cancelled = true; };
  }, [user?.id, year, animeActivityCache, mangaActivityCache]);

  const years = useMemo(() => {
    const nowYear = new Date().getFullYear();
    const ys = new Set([nowYear]);
    [...allAnime, ...allManga].forEach((e) => {
      if (e.updatedAt) ys.add(new Date(e.updatedAt * 1000).getFullYear());
      if (e.startedAt?.year) ys.add(e.startedAt.year);
      if (e.completedAt?.year) ys.add(e.completedAt.year);
    });
    return [...ys].sort((a, b) => b - a);
  }, [allAnime, allManga]);

  useEffect(() => {
    if (years.length && !years.includes(year)) {
      setYear(years[0]);
    }
  }, [years, year]);

  const isEntryInPeriod = useCallback((e, y, m) => {
    const inYear =
      isInYear(e, y) ||
      completedInYear(e, y) ||
      startedInYear(e, y);
    if (!inYear) return false;
    if (m === 0) return true;
    return isInMonth(e, m) || completedInMonth(e, m) || startedInMonth(e, m);
  }, []);

  const animeEntries = useMemo(
    () => allAnime.filter(e => isEntryInPeriod(e, year, month)),
    [allAnime, isEntryInPeriod, year, month]
  );
  const mangaEntries = useMemo(
    () => allManga.filter(e => isEntryInPeriod(e, year, month)),
    [allManga, isEntryInPeriod, year, month]
  );

  // Computed
  const animeCompleted = useMemo(
    () => animeEntries.filter(e => completedInYear(e, year) && (month === 0 || completedInMonth(e, month))),
    [animeEntries, year, month]
  );
  const mangaCompleted = useMemo(
    () => mangaEntries.filter(e => completedInYear(e, year) && (month === 0 || completedInMonth(e, month))),
    [mangaEntries, year, month]
  );
  const animeActivityTotals = useMemo(
    () => computePeriodAnimeActivityTotals(animeActivities, year, month),
    [animeActivities, year, month]
  );
  const totalEp = animeActivityTotals.episodes;
  const totalMin = animeActivityTotals.minutes;
  const totalCh = useMemo(
    () => computePeriodDeltaFromActivities(mangaActivities, year, month),
    [mangaActivities, year, month]
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

  const monthlyData = useMemo(() => {
    const animeMonthly = computeMonthlyDeltasFromActivities(animeActivities, year);
    const mangaMonthly = computeMonthlyDeltasFromActivities(mangaActivities, year);
    return Array.from({length:12},(_,i)=>({
      month:MONTHS[i], Anime:animeMonthly[i+1]||0, Manga:mangaMonthly[i+1]||0,
    }));
  }, [animeActivities, mangaActivities, year]);

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

  const tabs = [
    {key:"overview",label:"Vue d'ensemble"},
    {key:"anime",label:`Anime (${animeEntries.length})`},
    {key:"manga",label:`Manga (${mangaEntries.length})`},
    {key:"charts",label:"Graphiques"},
  ];

  const periodLabel = month === 0 ? `${year}` : `${MONTHS[month - 1]} ${year}`;

  return (
    <div style={{background:C.bg, minHeight:"100vh", color:C.text, fontFamily:"'Overpass',sans-serif"}}>

      {/* HEADER */}
      <div style={{
        background: user?.bannerImage
          ? `linear-gradient(to bottom, rgba(11,22,34,0.3), ${C.bg}), url(${user.bannerImage}) center/cover`
          : `linear-gradient(135deg, #151f2e, ${C.bg})`,
        padding:"32px 24px 24px", borderBottom:`1px solid ${C.border}`,
      }}>
        <div style={{maxWidth:1100,margin:"0 auto"}}>
          {/* Search */}
          <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:24,flexWrap:"wrap"}}>
            <div style={{fontSize:24,fontWeight:900,color:C.accent,letterSpacing:-0.5,flexShrink:0}}>AL</div>
            <div style={{display:"flex",flex:"1 1 300px",maxWidth:400}}>
              <input value={inputVal} onChange={e=>setInputVal(e.target.value)}
                onKeyDown={e=>e.key==="Enter"&&handleSubmit()}
                placeholder="Nom d'utilisateur AniList"
                style={{
                  flex:1,background:C.cardBg,border:`1px solid ${C.border}`,
                  borderRight:"none",borderRadius:"8px 0 0 8px",
                  padding:"10px 14px",color:C.text,fontSize:14,fontFamily:"inherit",
                }} />
              <button onClick={handleSubmit} style={{
                background:C.accent,color:"#fff",border:"none",
                borderRadius:"0 8px 8px 0",padding:"10px 20px",
                fontWeight:700,fontSize:14,fontFamily:"inherit",
              }}>Charger</button>
            </div>
            {/* Year selector */}
            <div style={{display:"flex",gap:6,marginLeft:"auto",flexWrap:"wrap",justifyContent:"flex-end"}}>
              {years.map(y => (
                <button key={y} className={`year-btn ${y===year?"active":""}`}
                  onClick={()=>changeYear(y)}>{y}</button>
              ))}
            </div>
            {/* Month selector */}
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              <button className={`year-btn ${month===0?"active":""}`} onClick={() => setMonth(0)}>Toute l'année</button>
              {MONTHS.map((m, idx) => (
                <button key={m} className={`year-btn ${month===idx+1?"active":""}`} onClick={() => setMonth(idx+1)}>{m}</button>
              ))}
            </div>
          </div>
          {/* User */}
          {user && (
            <div className="fade-in" style={{display:"flex",alignItems:"center",gap:16}}>
              <img src={user.avatar?.large||user.avatar?.medium} alt={user.name}
                style={{width:64,height:64,borderRadius:12,border:`2px solid ${C.accent}`}} />
              <div>
                <div style={{fontSize:24,fontWeight:800}}>{user.name}</div>
                <div style={{fontSize:13,color:C.textMuted,marginTop:2}}>Activité anime & manga — {periodLabel}</div>
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
          <div style={{marginTop:24,color:C.textMuted,fontSize:13}}>
            Chargement des activités détaillées ({periodLabel})...
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
                  <StatCard icon="🎬" label="Anime" value={animeEntries.length} sub={`${animeCompleted.length} terminé(s)`} />
                  <StatCard icon="📺" label="Épisodes" value={totalEp} sub={`≈ ${fmtMin(totalMin)}`} />
                  <StatCard icon="⭐" label="Score anime" value={avgA} sub={`sur ${scoredA.length} notés`} />
                  <StatCard icon="📖" label="Manga" value={mangaEntries.length} sub={`${mangaCompleted.length} terminé(s)`} />
                  <StatCard icon="📄" label="Chapitres" value={totalCh} sub={`${totalVol} volumes`} />
                  <StatCard icon="⭐" label="Score manga" value={avgM} sub={`sur ${scoredM.length} notés`} />
                </div>

                <div className="fade-in fade-in-delay-1">
                  <ChartCard title="Activité mensuelle">
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={monthlyData}>
                        <defs>
                          <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={C.accent} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={C.accent} stopOpacity={0}/>
                          </linearGradient>
                          <linearGradient id="gM" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor={C.pink} stopOpacity={0.3}/>
                            <stop offset="95%" stopColor={C.pink} stopOpacity={0}/>
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="month" tick={{fill:C.textDim,fontSize:12}} axisLine={false} tickLine={false}/>
                        <YAxis tick={{fill:C.textDim,fontSize:12}} axisLine={false} tickLine={false} allowDecimals={false}/>
                        <Tooltip content={<CTooltip/>}/>
                        <Area type="monotone" dataKey="Anime" stroke={C.accent} fill="url(#gA)" strokeWidth={2}/>
                        <Area type="monotone" dataKey="Manga" stroke={C.pink} fill="url(#gM)" strokeWidth={2}/>
                      </AreaChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>

                {sortedA.length > 0 && (
                  <div className="fade-in fade-in-delay-2">
                    <div style={{fontSize:14,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>
                      Top Anime {periodLabel}
                    </div>
                    <div style={{display:"flex",gap:14,overflowX:"auto",paddingBottom:8}}>
                      {sortedA.slice(0,10).map(e => <MediaCard key={e.id} entry={e} type="ANIME"/>)}
                    </div>
                  </div>
                )}
                {sortedM.length > 0 && (
                  <div className="fade-in fade-in-delay-3">
                    <div style={{fontSize:14,fontWeight:600,color:C.textMuted,textTransform:"uppercase",letterSpacing:0.8,marginBottom:14}}>
                      Top Manga {periodLabel}
                    </div>
                    <div style={{display:"flex",gap:14,overflowX:"auto",paddingBottom:8}}>
                      {sortedM.slice(0,10).map(e => <MediaCard key={e.id} entry={e} type="MANGA"/>)}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ANIME TAB */}
            {tab==="anime" && (
              <div style={{display:"flex",flexDirection:"column",gap:20}}>
                <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit, minmax(170px, 1fr))",gap:14}}>
                  <StatCard icon="🎬" label="Total anime" value={animeEntries.length}/>
                  <StatCard icon="✅" label="Terminés" value={animeCompleted.length}/>
                  <StatCard icon="📺" label="Épisodes" value={totalEp}/>
                  <StatCard icon="⏱️" label="Temps" value={fmtMin(totalMin)}/>
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
                  <StatCard icon="📖" label="Total manga" value={mangaEntries.length}/>
                  <StatCard icon="✅" label="Terminés" value={mangaCompleted.length}/>
                  <StatCard icon="📄" label="Chapitres" value={totalCh}/>
                  <StatCard icon="📚" label="Volumes" value={totalVol}/>
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
