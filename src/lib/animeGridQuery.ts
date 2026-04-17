import type { AniListEntry } from "../types/domain";

/** ▼ = ordre « naturel » décroissant (notes, dates récentes, progression…) ; ▲ = inverse. */
export type AnimeGridSortKey =
  | "score-desc"
  | "score-asc"
  | "title-desc"
  | "title-asc"
  | "release-desc"
  | "release-asc"
  | "progress-desc"
  | "progress-asc";

export const ANIME_GRID_SORT_DEFAULT: AnimeGridSortKey = "score-desc";

export function normalizeAnimeSearchText(s: string): string {
  return String(s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

export function entryMatchesAnimeSearch(entry: AniListEntry, normalizedQuery: string): boolean {
  if (!normalizedQuery) return true;
  const r = normalizeAnimeSearchText(entry.media?.title?.romaji || "");
  const e = normalizeAnimeSearchText(entry.media?.title?.english || "");
  return r.includes(normalizedQuery) || e.includes(normalizedQuery);
}

const SEASON_ORDER: Record<string, number> = { WINTER: 1, SPRING: 2, SUMMER: 3, FALL: 4 };

/** Plus la valeur est grande, plus la sortie est « récente » (année / saison / date). */
export function animeReleaseSortKey(entry: AniListEntry): number {
  const m = entry.media;
  const y = Number(m?.seasonYear ?? m?.startDate?.year ?? 0);
  const s = String(m?.season || "").toUpperCase();
  const so = SEASON_ORDER[s] || 0;
  const mo = Number(m?.startDate?.month ?? 0);
  const d = Number(m?.startDate?.day ?? 0);
  return y * 1_000_000 + so * 10_000 + mo * 100 + d;
}

function compareTitle(a: AniListEntry, b: AniListEntry): number {
  const ta = String(a.media?.title?.english || a.media?.title?.romaji || "").toLowerCase();
  const tb = String(b.media?.title?.english || b.media?.title?.romaji || "").toLowerCase();
  return ta.localeCompare(tb, "fr", { sensitivity: "base" });
}

export function compareAnimeGridEntries(a: AniListEntry, b: AniListEntry, sort: AnimeGridSortKey): number {
  const desc = sort.endsWith("-desc");

  switch (sort) {
    case "score-desc":
    case "score-asc": {
      const sa = Number(a.score) || 0;
      const sb = Number(b.score) || 0;
      let cmp = sb - sa;
      if (cmp !== 0) return desc ? cmp : -cmp;
      const aa = Number(a.media?.averageScore) || 0;
      const ab = Number(b.media?.averageScore) || 0;
      cmp = ab - aa;
      if (cmp !== 0) return desc ? cmp : -cmp;
      return compareTitle(a, b);
    }
    case "title-desc":
    case "title-asc": {
      const cmp = compareTitle(a, b);
      if (cmp !== 0) return desc ? -cmp : cmp;
      return 0;
    }
    case "release-desc":
    case "release-asc": {
      const ka = animeReleaseSortKey(a);
      const kb = animeReleaseSortKey(b);
      const cmp = kb - ka;
      if (cmp !== 0) return desc ? cmp : -cmp;
      return compareTitle(a, b);
    }
    case "progress-desc":
    case "progress-asc": {
      const pa = Number(a.progress) || 0;
      const pb = Number(b.progress) || 0;
      const cmp = pb - pa;
      if (cmp !== 0) return desc ? cmp : -cmp;
      return compareTitle(a, b);
    }
    default:
      return 0;
  }
}

export function filterAnimeGridEntries(
  entries: AniListEntry[],
  opts: { normalizedSearch: string; scoredOnly: boolean; completedOnly: boolean }
): AniListEntry[] {
  return entries.filter((e) => {
    if (opts.scoredOnly && !(Number(e.score) > 0)) return false;
    if (opts.completedOnly && e.status !== "COMPLETED") return false;
    if (!entryMatchesAnimeSearch(e, opts.normalizedSearch)) return false;
    return true;
  });
}
