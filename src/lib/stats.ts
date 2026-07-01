import { MONTHS } from '../config/constants';

  type GenrePercentRow = {
    name: string;
    count: number;
    percent: number;
  };

  type GenreComparisonRow = GenrePercentRow & {
    previousCount: number;
    previousPercent: number;
    deltaCount: number;
    deltaPercent: number;
  };

  const NOW_UNIX = () => Math.floor(Date.now() / 1000);

  const completedInYear = (e, y) => y === 0 ? Boolean(e.completedAt?.year) : e.completedAt?.year === y;
  const startedInYear = (e, y) => y === 0 ? Boolean(e.startedAt?.year) : e.startedAt?.year === y;
  const completedInMonth = (e, y, m) => e.completedAt?.year === y && e.completedAt?.month === m;
  const startedInMonth = (e, y, m) => e.startedAt?.year === y && e.startedAt?.month === m;

  function fmtMin(min) {
    if (!min || min <= 0) return "0h";
    const d = Math.floor(min / 1440);
    const h = Math.floor((min % 1440) / 60);
    const m = min % 60;
    /** Espaces insécables : évite « 5j 10h » / « 27m » sur deux lignes dans les cartes stats. */
    const nb = "\u00A0";
    if (d > 0) return `${d}j${nb}${h}h${nb}${m}m`;
    if (h > 0) return `${h}h${nb}${m}m`;
    return `${m}m`;
  }

  const getProgressNumber = (progressRaw) => {
    if (progressRaw === null || progressRaw === undefined) return 0;
    if (typeof progressRaw === "number" && Number.isFinite(progressRaw)) {
      return Math.max(0, Math.trunc(progressRaw));
    }
    const str = String(progressRaw).trim();
    /* AniList : « chapitre courant / total » — ne pas prendre Math.max de tous les chiffres (sinon 102 au lieu de 61). */
    const slashCurrent = str.match(/^(\d+)\s*\/\s*\d+/);
    if (slashCurrent) {
      const n = Number(slashCurrent[1]);
      return Number.isFinite(n) ? n : 0;
    }
    const nums = str.match(/\d+/g);
    if (!nums || nums.length === 0) return 0;
    return Math.max(...nums.map((n) => Number(n) || 0));
  };
  const RANGE_OVERLAP_DEDUP_WINDOW_SEC = 6 * 60 * 60;

  function isNearRangeCorrection(previousCreatedAt, createdAt) {
    const prevTs = Number(previousCreatedAt || 0);
    const curTs = Number(createdAt || 0);
    if (prevTs <= 0 || curTs <= 0) return false;
    return Math.max(0, curTs - prevTs) <= RANGE_OVERLAP_DEDUP_WINDOW_SEC;
  }

  const getProgressRangeDelta = (
    progressRaw,
    prev = 0,
    context = { previousCreatedAt: 0, createdAt: 0 }
  ) => {
    const raw = String(progressRaw ?? "").trim();
    if (!raw) return null;
    const m = raw.match(/(\d+)\s*-\s*(\d+)/);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    const start = Math.min(a, b);
    const end = Math.max(a, b);
    const previous = Number.isFinite(Number(prev)) ? Math.max(0, Number(prev)) : 0;
    const shouldDedupOverlap = isNearRangeCorrection(
      context?.previousCreatedAt,
      context?.createdAt
    );
    if (!shouldDedupOverlap) return Math.max(0, end - start + 1);
    const firstUnread = Math.max(start, previous + 1);
    return Math.max(0, end - firstUnread + 1);
  };

  const toFiniteNumber = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  /** Statut liste AniList sur une ListActivity (ex. COMPLETED). */
  function isCompletedListActivityStatus(statusRaw) {
    return String(statusRaw || "").toUpperCase() === "COMPLETED";
  }

  /**
   * Cible de progression quand l’activité est « completed » mais sans nombre exploitable dans `progress`
   * (cas fréquent : film / one-shot marqué terminé en une fois).
   */
  function inferCompletedCap(a, kind) {
    const media = a?.media || {};
    const fmt = String(media.format || "").toUpperCase();
    if (kind === "anime") {
      const ep = toFiniteNumber(media.episodes, 0);
      if (ep > 0) return ep;
      if (["MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC", "TV_SHORT"].includes(fmt)) return 1;
      return null;
    }
    const ch = toFiniteNumber(media.chapters, 0);
    if (ch > 0) return ch;
    return null;
  }

  /**
   * Progression « courante » après l’activité, pour en déduire un delta cohérent avec le précédent état.
   */
  function activityEffectiveProgress(a, prev, kind) {
    const parsed = getProgressNumber(a?.progress);
    if (parsed > 0) return parsed;
    if (!isCompletedListActivityStatus(a?.status)) return 0;
    const cap = inferCompletedCap(a, kind);
    if (cap != null) return Math.max(prev, cap);
    return prev > 0 ? prev + 1 : 1;
  }

  function buildActivityDeltaRows(activities, kind = "anime") {
    const chronological = [...(activities || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const lastProgressByMedia = new Map();
    const lastCreatedAtByMedia = new Map();
    const rows = [];

    chronological.forEach((a) => {
      const mediaId = a?.media?.id;
      const createdAt = Number(a?.createdAt || 0);
      if (!mediaId || !createdAt) return;
      const prev = lastProgressByMedia.has(mediaId) ? lastProgressByMedia.get(mediaId) : 0;
      const previousCreatedAt = lastCreatedAtByMedia.has(mediaId) ? lastCreatedAtByMedia.get(mediaId) : 0;
      const current = activityEffectiveProgress(a, prev, kind);
      const explicitDelta = getProgressRangeDelta(a?.progress, prev, { previousCreatedAt, createdAt });
      const delta = explicitDelta != null ? explicitDelta : Math.max(0, current - prev);
      const rule = explicitDelta != null ? "range" : "progress";
      rows.push({
        activity: a,
        mediaId,
        createdAt,
        prev,
        current,
        delta,
        rule,
      });
      lastProgressByMedia.set(mediaId, current);
      lastCreatedAtByMedia.set(mediaId, createdAt);
    });

    return rows;
  }

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
        status: a?.status != null ? String(a.status) : "",
        progress: getProgressNumber(a?.progress),
        media: {
          ...(a?.media || {}),
          id: mediaId,
          duration: toFiniteNumber(a?.media?.duration, 0),
          episodes: toFiniteNumber(a?.media?.episodes, 0),
          chapters: toFiniteNumber(a?.media?.chapters, 0),
          format: a?.media?.format != null ? String(a.media.format) : "",
          countryOfOrigin: a?.media?.countryOfOrigin != null ? String(a.media.countryOfOrigin) : "",
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
    if (year === 0) return true;
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
      if (selYear === 0) {
        const y = d.getFullYear();
        const mo = d.getMonth() + 1;
        const day = d.getDate();
        set.add(`${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
        return;
      }
      if (d.getFullYear() !== selYear) return;
      if (selMonth !== 0 && d.getMonth() + 1 !== selMonth) return;
      const mo = d.getMonth() + 1;
      const day = d.getDate();
      set.add(`${selYear}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
    };
    const addYmd = (y, mo, day) => {
      if (!y || !mo || !day) return;
      if (selYear === 0) {
        set.add(`${y}-${String(mo).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
        return;
      }
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
    if (year === 0) return 0;
    if (month === 0) {
      const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      return leap ? 366 : 365;
    }
    return new Date(year, month, 0).getDate();
  }

  function computePeriodDeltaFromActivities(activities, year, month, kind = "anime") {
    const rows = buildActivityDeltaRows(activities, kind);
    let total = 0;
    rows.forEach((row) => {
      if (isTsInPeriod(row.createdAt || 0, year, month)) total += row.delta;
    });
    return total;
  }

  function computePeriodAnimeActivityTotals(activities, year, month) {
    const rows = buildActivityDeltaRows(activities, "anime");
    let episodes = 0;
    let minutes = 0;
    rows.forEach((row) => {
      if (!isTsInPeriod(row.createdAt || 0, year, month)) return;
      episodes += row.delta;
      minutes += row.delta * (row.activity?.media?.duration || 24);
    });
    return { episodes, minutes };
  }

  /** Épisodes vus sur la période, agrégés par format (activités anime). */
  function computePeriodWatchEpisodesByFormat(activities, year, month) {
    const rows = buildActivityDeltaRows(activities, "anime");
    const byFormat = {};
    rows.forEach((row) => {
      if (!isTsInPeriod(row.createdAt || 0, year, month)) return;
      const fmt = row.activity?.media?.format || "OTHER";
      byFormat[fmt] = (byFormat[fmt] || 0) + row.delta;
    });

    return Object.entries(byFormat)
      .map(([name, episodes]) => ({ name, episodes: Number(episodes) || 0 }))
      .sort((x, y) => y.episodes - x.episodes);
  }

  /** Épisodes vus sur la période, agrégés par pays d'origine (activités anime). */
  function computePeriodWatchEpisodesByCountry(activities, year, month) {
    const rows = buildActivityDeltaRows(activities, "anime");
    const byCountry = {};
    rows.forEach((row) => {
      if (!isTsInPeriod(row.createdAt || 0, year, month)) return;
      const raw = String(row.activity?.media?.countryOfOrigin || "").trim();
      const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
      byCountry[code] = (byCountry[code] || 0) + row.delta;
    });

    return Object.entries(byCountry)
      .map(([code, episodes]) => ({ code, episodes: Number(episodes) || 0 }))
      .sort((x, y) => y.episodes - x.episodes);
  }

  /** Minutes visionnées sur la période, agrégées par format (activités anime). */
  function computePeriodWatchMinutesByFormat(activities, year, month) {
    const rows = buildActivityDeltaRows(activities, "anime");
    const byFormat = {};
    rows.forEach((row) => {
      if (!isTsInPeriod(row.createdAt || 0, year, month)) return;
      const fmt = row.activity?.media?.format || "OTHER";
      const mins = row.delta * (row.activity?.media?.duration || 24);
      byFormat[fmt] = (byFormat[fmt] || 0) + mins;
    });

    return Object.entries(byFormat)
      .map(([name, minutes]) => ({ name, minutes: Number(minutes) || 0 }))
      .sort((x, y) => y.minutes - x.minutes);
  }

/** Chapitres lus sur la période, agrégés par format (activités manga). */
function computePeriodReadChaptersByFormat(activities, year, month) {
  const rows = buildActivityDeltaRows(activities, "manga");
  const byFormat = {};
  rows.forEach((row) => {
    if (!isTsInPeriod(row.createdAt || 0, year, month)) return;
    const fmt = row.activity?.media?.format || "OTHER";
    byFormat[fmt] = (byFormat[fmt] || 0) + row.delta;
  });

  return Object.entries(byFormat)
    .map(([name, chapters]) => ({ name, chapters: Number(chapters) || 0 }))
    .sort((x, y) => y.chapters - x.chapters);
}

/** Chapitres lus sur la période, agrégés par pays d'origine (activités manga). */
function computePeriodReadChaptersByCountry(activities, year, month) {
  const rows = buildActivityDeltaRows(activities, "manga");
  const byCountry = {};
  rows.forEach((row) => {
    if (!isTsInPeriod(row.createdAt || 0, year, month)) return;
    const raw = String(row.activity?.media?.countryOfOrigin || "").trim();
    const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
    byCountry[code] = (byCountry[code] || 0) + row.delta;
  });

  return Object.entries(byCountry)
    .map(([code, chapters]) => ({ code, chapters: Number(chapters) || 0 }))
    .sort((x, y) => y.chapters - x.chapters);
}

/**
 * Top tags AniList pour les entrées d'une période (anime ou manga).
 *
 * - Compte le nombre d'entrées portant chaque tag.
 * - Calcule le rang moyen (force AniList) du tag sur ces entrées.
 * - Filtre par défaut les tags spoilers (media + génériques) et les tags adultes.
 * - Trie par fréquence puis par rang moyen.
 *
 * @param entries Tableau d'entrées AniList déjà filtrées sur la période voulue (ex. `animeTabEntries`).
 * @param options.excludeSpoilers true par défaut (cache `isMediaSpoiler` + `isGeneralSpoiler`).
 * @param options.excludeAdult true par défaut (cache `isAdult`).
 * @param options.minRank seuil minimum de `rank` pour qu'un tag soit comptabilisé sur l'entrée (0 par défaut).
 */
function computePeriodTopTags(
  entries,
  options: { excludeSpoilers?: boolean; excludeAdult?: boolean; minRank?: number } = {}
) {
  const excludeSpoilers = options.excludeSpoilers !== false;
  const excludeAdult = options.excludeAdult !== false;
  const minRank = Number.isFinite(options.minRank) ? Number(options.minRank) : 0;

  const counter = new Map();
  for (const entry of entries || []) {
    const tags = entry?.media?.tags;
    if (!Array.isArray(tags)) continue;
    /** Déduplique les tags répétés sur un même media (sécurité). */
    const seenForEntry = new Set();
    for (const tag of tags) {
      const name = tag?.name;
      if (!name || seenForEntry.has(name)) continue;
      if (excludeSpoilers && (tag.isMediaSpoiler || tag.isGeneralSpoiler)) continue;
      if (excludeAdult && tag.isAdult) continue;
      const rank = Number(tag.rank);
      if (Number.isFinite(rank) && rank < minRank) continue;
      seenForEntry.add(name);

      const prev = counter.get(name);
      if (prev) {
        prev.count += 1;
        if (Number.isFinite(rank)) {
          prev.rankSum += rank;
          prev.rankN += 1;
        }
      } else {
        counter.set(name, {
          count: 1,
          rankSum: Number.isFinite(rank) ? rank : 0,
          rankN: Number.isFinite(rank) ? 1 : 0,
          category: tag.category ?? null,
          isAdult: !!tag.isAdult,
        });
      }
    }
  }

  return [...counter.entries()]
    .map(([name, v]) => ({
      name,
      count: v.count,
      meanRank: v.rankN > 0 ? v.rankSum / v.rankN : 0,
      category: v.category,
      isAdult: v.isAdult,
    }))
    .sort(
      (a, b) => b.count - a.count || b.meanRank - a.meanRank || a.name.localeCompare(b.name)
    );
}

/** Minutes visionnées sur la période, agrégées par pays d'origine (activités anime). */
function computePeriodWatchMinutesByCountry(activities, year, month) {
  const rows = buildActivityDeltaRows(activities, "anime");
  const byCountry = {};
  rows.forEach((row) => {
    if (!isTsInPeriod(row.createdAt || 0, year, month)) return;
    const raw = String(row.activity?.media?.countryOfOrigin || "").trim();
    const code = /^[A-Za-z]{2}$/.test(raw) ? raw.toUpperCase() : "__UNKNOWN__";
    const mins = row.delta * (row.activity?.media?.duration || 24);
    byCountry[code] = (byCountry[code] || 0) + mins;
  });

  return Object.entries(byCountry)
    .map(([code, minutes]) => ({ code, minutes: Number(minutes) || 0 }))
    .sort((x, y) => y.minutes - x.minutes);
}

  function computeMonthlyDeltasFromActivities(activities, year, kind = "anime") {
    const rows = buildActivityDeltaRows(activities, kind);
    const monthly = {};
    rows.forEach((row) => {
      const d = new Date(row.createdAt * 1000);
      if (d.getFullYear() === year) {
        const m = d.getMonth() + 1;
        monthly[m] = (monthly[m] || 0) + row.delta;
      }
    });

    return monthly;
  }

  /**
   * Deltas quotidiens (épisodes / chapitres effectifs) sur toute une année,
   * indexés par chaîne ISO `YYYY-MM-DD` (heure locale, fuseau du navigateur).
   *
   * Sert notamment à alimenter la heatmap d'activité.
   */
  function computeDailyDeltasInYear(activities, year, kind = "anime") {
    const rows = buildActivityDeltaRows(activities, kind);
    /** @type {Record<string, number>} */
    const daily = {};

    rows.forEach((row) => {
      const d = new Date(row.createdAt * 1000);
      if (row.delta > 0 && d.getFullYear() === year) {
        const m = String(d.getMonth() + 1).padStart(2, "0");
        const day = String(d.getDate()).padStart(2, "0");
        const key = `${year}-${m}-${day}`;
        daily[key] = (daily[key] || 0) + row.delta;
      }
    });

    return daily;
  }

  function computeDailyDeltasInMonth(activities, year, month, kind = "anime") {
    const rows = buildActivityDeltaRows(activities, kind);
    const daily = {};

    rows.forEach((row) => {
      const d = new Date(row.createdAt * 1000);
      if (d.getFullYear() === year && d.getMonth() + 1 === month) {
        const day = d.getDate();
        daily[day] = (daily[day] || 0) + row.delta;
      }
    });

    return daily;
  }

  function getMediaIdsWithProgressInPeriod(activities, year, month, kind = "anime") {
    const rows = buildActivityDeltaRows(activities, kind);
    const mediaIds = new Set();

    rows.forEach((row) => {
      if (row.delta > 0 && isTsInPeriod(row.createdAt || 0, year, month)) {
        mediaIds.add(row.mediaId);
      }
    });

    return mediaIds;
  }

  /**
   * Genres les plus fréquents sur la période, dérivés des activités (delta > 0).
   * Chaque œuvre compte une fois, même si plusieurs épisodes/chapitres ont été
   * consommés durant la période. Les genres sont lus depuis `mediaLookup`
   * (liste utilisateur) quand disponible, sinon depuis `activity.media`.
   */
  function computePeriodGenreDistribution(
    activities,
    year,
    month,
    kind = "anime",
    mediaLookup: Map<number, { genres?: string[] | null }> | null = null
  ) {
    const rows = buildActivityDeltaRows(activities, kind);
    const seenMedia = new Set();
    const genreCount: Record<string, number> = {};

    rows.forEach((row) => {
      if (row.delta <= 0 || !isTsInPeriod(row.createdAt || 0, year, month)) return;
      if (seenMedia.has(row.mediaId)) return;
      seenMedia.add(row.mediaId);

      const fromLookup = mediaLookup?.get(row.mediaId)?.genres;
      const fromActivity = row.activity?.media?.genres;
      const genres = Array.isArray(fromLookup) && fromLookup.length > 0
        ? fromLookup
        : Array.isArray(fromActivity)
          ? fromActivity
          : [];

      genres.forEach((g) => {
        if (!g) return;
        genreCount[g] = (genreCount[g] || 0) + 1;
      });
    });

    return withGenrePercents(genreCount, seenMedia.size);
  }

  function withGenrePercents(genreCount: Record<string, number>, totalTitles: number): GenrePercentRow[] {
    const denominator = Math.max(0, Number(totalTitles) || 0);
    return Object.entries(genreCount)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({
        name,
        count,
        percent: denominator > 0 ? (Number(count) / denominator) * 100 : 0,
      }));
  }

  /** Genres agrégés sur un tableau d'entrées liste (période courante ou All Time). */
  function computeGenreDistributionFromEntries(entries) {
    const genreCount: Record<string, number> = {};
    const list = entries || [];
    list.forEach((e) =>
      (e.media?.genres || []).forEach((g) => {
        if (!g) return;
        genreCount[g] = (genreCount[g] || 0) + 1;
      })
    );
    return withGenrePercents(genreCount, list.length);
  }

  function mergeGenreDistributionComparison(
    currentRows: readonly GenrePercentRow[] | null | undefined,
    previousRows: readonly GenrePercentRow[] | null | undefined
  ): GenreComparisonRow[] {
    const currentByName = new Map((currentRows || []).map((row) => [row.name, row]));
    const previousByName = new Map((previousRows || []).map((row) => [row.name, row]));
    const names = new Set([...currentByName.keys(), ...previousByName.keys()]);

    return [...names]
      .map((name) => {
        const current = currentByName.get(name) || { name, count: 0, percent: 0 };
        const previous = previousByName.get(name) || { name, count: 0, percent: 0 };
        return {
          name,
          count: current.count,
          percent: current.percent || 0,
          previousCount: previous.count,
          previousPercent: previous.percent || 0,
          deltaCount: current.count - previous.count,
          deltaPercent: (current.percent || 0) - (previous.percent || 0),
        };
      })
      .sort((a, b) => b.count - a.count || b.previousCount - a.previousCount || a.name.localeCompare(b.name));
  }

  function computePeriodProgressByMedia(activities, year, month, kind = "anime") {
    const rows = buildActivityDeltaRows(activities, kind);
    const byMedia = new Map();

    rows.forEach((row) => {
      if (row.delta <= 0 || !isTsInPeriod(row.createdAt || 0, year, month)) return;
      byMedia.set(row.mediaId, (byMedia.get(row.mediaId) || 0) + row.delta);
    });

    return byMedia;
  }

  function getComparisonPeriodMeta(year, month) {
    if (year === 0) {
      return {
        compareY: null,
        compareM: null,
        legendCurrent: "All Time",
        legendCompare: "",
      };
    }
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

  function buildPeriodDeltaAudit(activities, year, month, kind = "anime") {
    const rows = buildActivityDeltaRows(activities, kind);
    const periodRows = rows.filter((row) => isTsInPeriod(row.createdAt || 0, year, month));
    return {
      kind,
      year,
      month,
      totalDelta: periodRows.reduce((sum, row) => sum + row.delta, 0),
      rows: periodRows.map((row) => ({
        activityId: row.activity?.id ?? null,
        mediaId: row.mediaId,
        createdAt: row.createdAt,
        progressRaw: row.activity?.progress ?? null,
        status: row.activity?.status ?? null,
        prev: row.prev,
        current: row.current,
        delta: row.delta,
        rule: row.rule,
      })),
    };
  }

  /* ----------------------------------------------------------------------- *
   * Records / faits marquants — helpers
   * ----------------------------------------------------------------------- */

  const FR_LONG_DATE_FMT = new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  function formatFrenchLongDate(year, month1Indexed, day) {
    if (!year || !month1Indexed || !day) return "";
    return FR_LONG_DATE_FMT.format(new Date(year, month1Indexed - 1, day));
  }

  function dayKeyFromTimestamp(ts) {
    const d = new Date(ts * 1000);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  function frenchLabelFromDayKey(key) {
    if (!key) return "";
    const [y, m, d] = key.split("-").map(Number);
    return formatFrenchLongDate(y, m, d);
  }

  /** Plus grosse session sur la période (somme des deltas par jour). */
  function computePeriodBiggestSession(activities, year, month, kind) {
    const rows = buildActivityDeltaRows(activities, kind);
    const byDay = new Map();

    rows.forEach((row) => {
      if (row.delta > 0 && isTsInPeriod(row.createdAt || 0, year, month)) {
        const key = dayKeyFromTimestamp(row.createdAt);
        byDay.set(key, (byDay.get(key) || 0) + row.delta);
      }
    });

    let bestKey = null;
    let bestCount = 0;
    for (const [k, v] of byDay.entries()) {
      if (v > bestCount) {
        bestCount = v;
        bestKey = k;
      }
    }
    if (!bestKey || bestCount <= 0) return null;
    return { count: bestCount, dayKey: bestKey, dateLabel: frenchLabelFromDayKey(bestKey) };
  }

  /** Plus longue série de jours consécutifs avec au moins une activité (dans la période). */
  function computePeriodLongestStreak(activities, year, month) {
    const days = new Set();
    activities.forEach((a) => {
      if (!isTsInPeriod(a.createdAt || 0, year, month)) return;
      days.add(dayKeyFromTimestamp(a.createdAt));
    });
    if (days.size === 0) return null;
    const sorted = [...days].sort();
    let bestLen = 1;
    let bestStart = sorted[0];
    let bestEnd = sorted[0];
    let curLen = 1;
    let curStart = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(`${sorted[i - 1]}T00:00:00`);
      const cur = new Date(`${sorted[i]}T00:00:00`);
      const diffDays = Math.round((cur.getTime() - prev.getTime()) / 86400000);
      if (diffDays === 1) {
        curLen++;
      } else {
        curLen = 1;
        curStart = sorted[i];
      }
      if (curLen > bestLen) {
        bestLen = curLen;
        bestStart = curStart;
        bestEnd = sorted[i];
      }
    }
    return {
      length: bestLen,
      startDateLabel: frenchLabelFromDayKey(bestStart),
      endDateLabel: frenchLabelFromDayKey(bestEnd),
    };
  }

  function fuzzyDateInPeriod(date, year, month) {
    if (!date?.year || !date?.month || !date?.day) return false;
    if (year === 0) return true;
    if (date.year !== year) return false;
    return month === 0 ? true : date.month === month;
  }

  function fuzzyDateKey(date) {
    if (!date?.year || !date?.month || !date?.day) return "";
    return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
  }

  /** Plus longue série complétée sur la période (max d'épisodes anime / chapitres manga). */
  function findPeriodLongestCompleted(entries, year, month, kind) {
    let best = null;
    let bestCount = -1;
    for (const e of entries) {
      if (e?.status !== "COMPLETED") continue;
      if (year !== 0 && !fuzzyDateInPeriod(e?.completedAt, year, month)) continue;
      const total =
        kind === "manga"
          ? Number(e?.media?.chapters || e?.progress || 0)
          : Number(e?.media?.episodes || e?.progress || 0);
      if (total > bestCount) {
        best = e;
        bestCount = total;
      }
    }
    if (!best || bestCount <= 0) return null;
    return { entry: best, count: bestCount };
  }

  /** Plus haute / plus basse note attribuée parmi les entrées de la période. */
  function findPeriodHighestScore(entries) {
    let best = null;
    let bestScore = -Infinity;
    for (const e of entries) {
      const s = Number(e?.score || 0);
      if (!Number.isFinite(s) || s <= 0) continue;
      if (s > bestScore) {
        best = e;
        bestScore = s;
      }
    }
    if (!best || !Number.isFinite(bestScore)) return null;
    return { entry: best, score: bestScore };
  }
  function findPeriodLowestScore(entries) {
    let best = null;
    let bestScore = Infinity;
    for (const e of entries) {
      const s = Number(e?.score || 0);
      if (!Number.isFinite(s) || s <= 0) continue;
      if (s < bestScore) {
        best = e;
        bestScore = s;
      }
    }
    if (!best || !Number.isFinite(bestScore)) return null;
    return { entry: best, score: bestScore };
  }

  /** Premier média de la période (= startedAt le plus ancien dans la période). */
  function findPeriodFirstStarted(entries, year, month) {
    let best = null;
    let bestKey = "9999-99-99";
    for (const e of entries) {
      if (!fuzzyDateInPeriod(e?.startedAt, year, month)) continue;
      const key = fuzzyDateKey(e.startedAt);
      if (key && key < bestKey) {
        bestKey = key;
        best = e;
      }
    }
    if (!best) return null;
    return { entry: best, dateLabel: frenchLabelFromDayKey(bestKey) };
  }

  /** Dernier média commencé de la période (= startedAt le plus récent dans la période). */
  function findPeriodLastStarted(entries, year, month) {
    let best = null;
    let bestKey = "0000-00-00";
    for (const e of entries) {
      if (!fuzzyDateInPeriod(e?.startedAt, year, month)) continue;
      const key = fuzzyDateKey(e.startedAt);
      if (key && key > bestKey) {
        bestKey = key;
        best = e;
      }
    }
    if (!best) return null;
    return { entry: best, dateLabel: frenchLabelFromDayKey(bestKey) };
  }

  /** Plus rapide à terminer parmi les entrées complétées dans la période. */
  /**
   * Entrées uniques (par media id) dont la date `startedAt` tombe dans la période.
   * Même fenêtre que `findPeriodFirstStarted` / `fuzzyDateInPeriod`.
   */
  function collectPeriodWorksStartedEntries(entries, year, month) {
    const byId = new Map();
    for (const e of entries || []) {
      if (!fuzzyDateInPeriod(e?.startedAt, year, month)) continue;
      const id = Number(e?.media?.id || 0);
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, e);
    }
    return [...byId.values()];
  }

  /**
   * Entrées uniques complétées dans la période (`status` + `completedAt`).
   */
  function collectPeriodWorksCompletedEntries(entries, year, month) {
    const byId = new Map();
    for (const e of entries || []) {
      if (String(e?.status || "").toUpperCase() !== "COMPLETED") continue;
      if (!fuzzyDateInPeriod(e?.completedAt, year, month)) continue;
      const id = Number(e?.media?.id || 0);
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, e);
    }
    return [...byId.values()];
  }

  /**
   * Jusqu’à `limit` titres pour vignettes : meilleures notes perso si au moins une note > 0,
   * sinon meilleures moyennes AniList (`averageScore` brut API, tri décroissant).
   */
  function pickSpotlightEntriesFromWorks(entries, limit = 3) {
    const list = [...(entries || [])];
    if (list.length === 0) return [];
    const hasUserScore = list.some((e) => Number(e?.score || 0) > 0);
    if (hasUserScore) {
      list.sort((a, b) => {
        const sb = Number(b?.score || 0);
        const sa = Number(a?.score || 0);
        if (sb !== sa) return sb - sa;
        return Number(b?.media?.averageScore || 0) - Number(a?.media?.averageScore || 0);
      });
    } else {
      list.sort(
        (a, b) => Number(b?.media?.averageScore || 0) - Number(a?.media?.averageScore || 0)
      );
    }
    return list.slice(0, Math.max(0, limit));
  }

  function findPeriodFastestCompleted(entries, year, month) {
    let best = null;
    let bestDays = Infinity;
    for (const e of entries) {
      if (e?.status !== "COMPLETED") continue;
      if (!fuzzyDateInPeriod(e?.completedAt, year, month)) continue;
      const s = e?.startedAt;
      if (!s?.year || !s?.month || !s?.day) continue;
      const sDate = new Date(s.year, s.month - 1, s.day);
      const cDate = new Date(e.completedAt.year, e.completedAt.month - 1, e.completedAt.day);
      const days = Math.round((cDate.getTime() - sDate.getTime()) / 86400000);
      if (!Number.isFinite(days) || days < 0) continue;
      if (days < bestDays) {
        best = e;
        bestDays = days;
      }
    }
    if (!best || !Number.isFinite(bestDays)) return null;
    return { entry: best, days: bestDays };
  }

  /**
   * Première activité de la période (tous types : épisode visionné, chapitre
   * lu, changement de statut). Contrairement à `findPeriodFirstStarted` qui
   * ne regarde que les séries *commencées* (date `startedAt` de l'entrée
   * utilisateur), on balaie ici l'ensemble des activités brutes et on garde
   * celle au `createdAt` le plus ancien. Utile pour savoir « par quoi tu as
   * démarré ta période » même quand il s'agissait de continuer une série
   * déjà en cours.
   */
  function findPeriodFirstActivity(activities, year, month) {
    let best = null;
    let bestTs = Number.POSITIVE_INFINITY;
    for (const a of activities) {
      const ts = a?.createdAt || 0;
      if (!ts || !a?.media?.id) continue;
      if (!isTsInPeriod(ts, year, month)) continue;
      if (ts < bestTs) {
        bestTs = ts;
        best = a;
      }
    }
    if (!best) return null;
    return {
      activity: best,
      dateLabel: frenchLabelFromDayKey(dayKeyFromTimestamp(bestTs)),
    };
  }

  /**
   * Dernière activité de la période : symétrique de `findPeriodFirstActivity`
   * (on garde le `createdAt` le plus récent). Permet d'afficher « la toute
   * dernière chose que tu as faite » sur la fenêtre sélectionnée, qu'il
   * s'agisse ou non d'un nouveau titre.
   */
  function findPeriodLastActivity(activities, year, month) {
    let best = null;
    let bestTs = 0;
    for (const a of activities) {
      const ts = a?.createdAt || 0;
      if (!ts || !a?.media?.id) continue;
      if (!isTsInPeriod(ts, year, month)) continue;
      if (ts > bestTs) {
        bestTs = ts;
        best = a;
      }
    }
    if (!best) return null;
    return {
      activity: best,
      dateLabel: frenchLabelFromDayKey(dayKeyFromTimestamp(bestTs)),
    };
  }

  function mergeActivitiesForDelta(anchorYear, cache) {
    if (anchorYear === 0) return [...(cache[0] || [])].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
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
export {
  normalizeListScoreToPoint10,
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
  collectPeriodWorksStartedEntries,
  collectPeriodWorksCompletedEntries,
  pickSpotlightEntriesFromWorks,
  computeMonthlyDeltasFromActivities,
  computeDailyDeltasInMonth,
  computeDailyDeltasInYear,
  getMediaIdsWithProgressInPeriod,
  computePeriodGenreDistribution,
  computeGenreDistributionFromEntries,
  mergeGenreDistributionComparison,
  computePeriodProgressByMedia,
  normalizeActivitiesWithDiagnostics,
  dedupeEntriesByMedia,
  getComparisonPeriodMeta,
  mergeActivitiesForDelta,
  buildPeriodDeltaAudit,
  buildActivityDeltaRows,
};
