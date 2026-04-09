(() => {
  const { MONTHS } = window.AppConfig;
  const NOW_UNIX = () => Math.floor(Date.now() / 1000);

  const isInYear = (e, y) => e.updatedAt && new Date(e.updatedAt * 1000).getFullYear() === y;
  const isInMonth = (e, m) => {
    if (!e.updatedAt) return false;
    return new Date(e.updatedAt * 1000).getMonth() + 1 === m;
  };
  const completedInYear = (e, y) => e.completedAt?.year === y;
  const startedInYear = (e, y) => e.startedAt?.year === y;
  const completedInMonth = (e, y, m) => e.completedAt?.year === y && e.completedAt?.month === m;
  const startedInMonth = (e, y, m) => e.startedAt?.year === y && e.startedAt?.month === m;

  function fmtMin(min) {
    if (!min || min <= 0) return "0h";
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    if (d > 0) return `${d}j ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  const getProgressNumber = (progressRaw) => {
    if (progressRaw === null || progressRaw === undefined) return 0;
    const nums = String(progressRaw).match(/\d+/g);
    if (!nums || nums.length === 0) return 0;
    return Math.max(...nums.map((n) => Number(n) || 0));
  };

  const toFiniteNumber = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  /**
   * Ramène la note liste sur une échelle 0–10 (décimales possibles), quel que soit le barème AniList
   * de l’utilisateur (/100, /10, etc.) lorsque la valeur brute est encore sur /100 (ex. 80 → 8, 72 → 7,2).
   * Les notes déjà en /10 (≤10) ne sont pas modifiées.
   */
  function normalizeListScoreToPoint10(raw) {
    const n = Number(raw);
    if (!Number.isFinite(n) || n <= 0) return 0;
    if (n > 100) return Math.min(10, n / 10);
    if (n >= 11 && n <= 100) return n / 10;
    if (n > 10 && n < 11) return Math.min(10, n);
    return Math.min(10, n);
  }

  function clampYmd(raw, nowDate = new Date()) {
    const y = toFiniteNumber(raw?.year, 0);
    const m = toFiniteNumber(raw?.month, 0);
    const d = toFiniteNumber(raw?.day, 0);
    if (y <= 0 || y > 3000) return { year: null, month: null, day: null };
    if (m < 1 || m > 12) return { year: y, month: null, day: null };
    const maxDay = new Date(y, m, 0).getDate();
    if (d < 1 || d > maxDay) return { year: y, month: m, day: null };
    const dt = new Date(y, m - 1, d, 23, 59, 59, 999);
    if (dt.getTime() > nowDate.getTime()) return { year: null, month: null, day: null };
    return { year: y, month: m, day: d };
  }

  function normalizeEntry(entry, nowDate = new Date()) {
    const status = String(entry?.status || "").toUpperCase();
    const safeStatus = status || "PLANNING";
    const updatedAt = toFiniteNumber(entry?.updatedAt, 0);
    const safeUpdatedAt = updatedAt > NOW_UNIX() ? 0 : updatedAt;
    const normalized = {
      ...entry,
      id: toFiniteNumber(entry?.id, 0),
      status: safeStatus,
      score: normalizeListScoreToPoint10(toFiniteNumber(entry?.score, 0)),
      progress: toFiniteNumber(entry?.progress, 0),
      progressVolumes: toFiniteNumber(entry?.progressVolumes, 0),
      updatedAt: safeUpdatedAt,
      startedAt: clampYmd(entry?.startedAt, nowDate),
      completedAt: clampYmd(entry?.completedAt, nowDate),
      media: {
        ...(entry?.media || {}),
        id: toFiniteNumber(entry?.media?.id, 0),
        episodes: toFiniteNumber(entry?.media?.episodes, 0),
        chapters: toFiniteNumber(entry?.media?.chapters, 0),
        volumes: toFiniteNumber(entry?.media?.volumes, 0),
        duration: toFiniteNumber(entry?.media?.duration, 0),
      },
    };
    return normalized;
  }

  function normalizeEntries(entries, nowDate = new Date()) {
    if (!Array.isArray(entries)) return [];
    return entries.map((e) => normalizeEntry(e, nowDate)).filter((e) => e?.media?.id);
  }

  function normalizeActivitiesWithDiagnostics(activities, nowUnix = NOW_UNIX()) {
    const diagnostics = {
      futureActivitiesFiltered: 0,
      invalidActivityFiltered: 0,
    };
    if (!Array.isArray(activities)) return { items: [], diagnostics };
    const items = [];
    activities.forEach((a) => {
      const createdAt = toFiniteNumber(a?.createdAt, 0);
      const mediaId = toFiniteNumber(a?.media?.id, 0);
      if (!createdAt || !mediaId) {
        diagnostics.invalidActivityFiltered += 1;
        return;
      }
      if (createdAt > nowUnix) {
        diagnostics.futureActivitiesFiltered += 1;
        return;
      }
      items.push({
        ...a,
        id: toFiniteNumber(a?.id, 0),
        createdAt,
        progress: toFiniteNumber(a?.progress, 0),
        media: {
          ...(a?.media || {}),
          id: mediaId,
          duration: toFiniteNumber(a?.media?.duration, 0),
        },
      });
    });
    return { items, diagnostics };
  }

  function dedupeEntriesByMedia(entries) {
    const statusPriority = {
      CURRENT: 6,
      COMPLETED: 5,
      PAUSED: 4,
      DROPPED: 3,
      REPEATING: 2,
      PLANNING: 1,
    };
    const byMedia = new Map();
    let duplicatesCollapsed = 0;
    entries.forEach((entry) => {
      const mediaId = entry?.media?.id;
      if (!mediaId) return;
      const prev = byMedia.get(mediaId);
      if (!prev) {
        byMedia.set(mediaId, entry);
        return;
      }
      duplicatesCollapsed += 1;
      const prevStatus = statusPriority[prev.status] || 0;
      const curStatus = statusPriority[entry.status] || 0;
      if (curStatus > prevStatus) {
        byMedia.set(mediaId, entry);
        return;
      }
      if (curStatus < prevStatus) return;

      const prevUpdated = Number(prev.updatedAt || 0);
      const curUpdated = Number(entry.updatedAt || 0);
      if (curUpdated > prevUpdated) {
        byMedia.set(mediaId, entry);
        return;
      }
      if (curUpdated < prevUpdated) return;

      const prevProgress = Number(prev.progress || 0);
      const curProgress = Number(entry.progress || 0);
      if (curProgress > prevProgress) {
        byMedia.set(mediaId, entry);
        return;
      }
      if (curProgress < prevProgress) return;

      const prevScore = Number(prev.score || 0);
      const curScore = Number(entry.score || 0);
      if (curScore >= prevScore) byMedia.set(mediaId, entry);
    });
    return { items: [...byMedia.values()], diagnostics: { duplicatesCollapsed } };
  }

  function isTsInPeriod(ts, year, month) {
    if (!ts) return false;
    const d = new Date(ts * 1000);
    const inYear = d.getFullYear() === year;
    if (!inYear) return false;
    return month === 0 ? true : d.getMonth() + 1 === month;
  }

  function countActiveCalendarDays(selYear, selMonth, animeActs, mangaActs, animeEnt, mangaEnt) {
    const set = new Set();
    const addTs = (ts) => {
      if (!ts) return;
      const d = new Date(ts * 1000);
      if (d.getFullYear() !== selYear) return;
      if (selMonth !== 0 && d.getMonth() + 1 !== selMonth) return;
      const mo = d.getMonth() + 1;
      const day = d.getDate();
      set.add(`${selYear}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    };
    const addYmd = (y, mo, day) => {
      if (!y || !mo || !day) return;
      if (y !== selYear) return;
      if (selMonth !== 0 && mo !== selMonth) return;
      set.add(`${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    };

    [...animeActs, ...mangaActs].forEach((a) => addTs(a?.createdAt));
    [...animeEnt, ...mangaEnt].forEach((e) => {
      addTs(e.updatedAt);
      addYmd(e.completedAt?.year, e.completedAt?.month, e.completedAt?.day);
      addYmd(e.startedAt?.year, e.startedAt?.month, e.startedAt?.day);
    });
    return set.size;
  }

  function getPeriodDayTotal(year, month) {
    if (month === 0) {
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return leap ? 366 : 365;
    }
    return new Date(year, month, 0).getDate();
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

  function computeDailyDeltasInMonth(activities, year, month) {
    const chronological = [...activities].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const lastByMedia = new Map();
    const daily = {};

    chronological.forEach((a) => {
      const mediaId = a?.media?.id;
      if (!mediaId || !a.createdAt) return;
      const d = new Date(a.createdAt * 1000);
      const current = getProgressNumber(a.progress);
      const prev = lastByMedia.has(mediaId) ? lastByMedia.get(mediaId) : 0;
      const delta = Math.max(0, current - prev);
      lastByMedia.set(mediaId, current);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        daily[day] = (daily[day] || 0) + delta;
      }
    });

    return daily;
  }

  function getMediaIdsWithProgressInPeriod(activities, year, month) {
    const chronological = [...activities].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const lastByMedia = new Map();
    const mediaIds = new Set();

    chronological.forEach((a) => {
      const mediaId = a?.media?.id;
      if (!mediaId) return;
      const current = getProgressNumber(a.progress);
      const prev = lastByMedia.has(mediaId) ? lastByMedia.get(mediaId) : 0;
      const delta = Math.max(0, current - prev);
      if (delta > 0 && isTsInPeriod(a.createdAt || 0, year, month)) {
        mediaIds.add(mediaId);
      }
      lastByMedia.set(mediaId, current);
    });

    return mediaIds;
  }

  function getComparisonPeriodMeta(year, month) {
    if (month === 0) {
      return {
        compareY: year - 1,
        compareM: null,
        legendCurrent: String(year),
        legendCompare: String(year - 1),
      };
    }
    if (month === 1) {
      return {
        compareY: year - 1,
        compareM: 12,
        legendCurrent: `${MONTHS[0]} ${year}`,
        legendCompare: `Dec ${year - 1}`,
      };
    }
    return {
      compareY: year,
      compareM: month - 1,
      legendCurrent: `${MONTHS[month - 1]} ${year}`,
      legendCompare: `${MONTHS[month - 2]} ${year}`,
    };
  }

  function mergeActivitiesForDelta(anchorYear, cache) {
    const list = [...(cache[anchorYear - 1] || []), ...(cache[anchorYear] || [])];
    const seen = new Set();
    const out = [];
    list.forEach((x) => {
      if (!x) return;
      const k = x.id != null ? `id:${x.id}` : `t:${x.createdAt}:${x.media?.id}`;
      if (seen.has(k)) return;
      seen.add(k);
      out.push(x);
    });
    out.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    return out;
  }

  window.AppStats = {
    normalizeListScoreToPoint10,
    isInYear,
    isInMonth,
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
    normalizeEntry,
    normalizeEntries,
    normalizeActivitiesWithDiagnostics,
    dedupeEntriesByMedia,
    getComparisonPeriodMeta,
    mergeActivitiesForDelta,
  };
})();
