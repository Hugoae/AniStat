import { anilistMediaUrl } from "../components/appUi/mediaDisplayHelpers";
import type { ActivityItem, AniListEntry } from "../types/domain";
import { buildActivityDeltaRows } from "./stats";

export type TopStudioCarouselMedia = {
  id: number;
  title: string;
  coverImageUrl: string | null;
  anilistUrl: string | null;
  userScore: number;
  averageScore: number;
};

export type AnimeTopStudioRow = {
  name: string;
  anilistStudioId: number | null;
  count: number;
  meanUserScore: number;
  minutesWatched: number;
  topMedia: TopStudioCarouselMedia[];
  carouselMedia: TopStudioCarouselMedia[];
};

export type MangaTopAuthorRow = {
  id: number;
  name: string;
  imageUrl: string | null;
  siteUrl: string | null;
  primaryRoleLabel: string;
  count: number;
  meanUserScore: number;
  chaptersRead: number;
  carouselMedia: TopStudioCarouselMedia[];
};

type StudioEdge = {
  isMain?: boolean | null;
  node?: {
    id?: number | null;
    name?: string | null;
    isAnimationStudio?: boolean | null;
  } | null;
};

function entryProgressTotal(entry: AniListEntry, kind: "anime" | "manga"): number {
  const progress = Number(entry.progress || 0);
  if (progress > 0) return progress;
  if (entry.status !== "COMPLETED") return 0;
  const fallback =
    kind === "anime" ? Number(entry.media?.episodes || 0) : Number(entry.media?.chapters || 0);
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

/**
 * AniList distingue main / non-main studio ; le main peut avoir `isAnimationStudio: false`.
 * On privilégie `isMain: true`, sinon les studios explicitement `isAnimationStudio`.
 */
function animationStudioNameToId(edges: StudioEdge[] | undefined): Map<string, number> {
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
    if (isMainEdge) {
      if (!main.has(name)) main.set(name, id);
    } else if (node.isAnimationStudio === true) {
      if (!other.has(name)) other.set(name, id);
    }
  }
  return new Map(main.size > 0 ? main : other);
}

function classifyAuthorRole(raw: string | null | undefined): string | null {
  const role = String(raw || "").trim().toLowerCase();
  if (!role) return null;
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
  return null;
}

const ROLE_PRIORITY: Record<string, number> = {
  Mangaka: 4,
  Scénariste: 3,
  Illustrateur: 2,
  "Créateur original": 1,
};

function sortCarouselMedia<T extends TopStudioCarouselMedia>(medias: Iterable<T>): T[] {
  return [...medias].sort((a, b) => {
    if (b.userScore !== a.userScore) return b.userScore - a.userScore;
    if (b.averageScore !== a.averageScore) return b.averageScore - a.averageScore;
    return a.title.localeCompare(b.title);
  });
}

export function computeAnimeTopStudios(
  entries: readonly AniListEntry[],
  periodActivities: readonly ActivityItem[],
  isAllTime: boolean
): AnimeTopStudioRow[] {
  type StudioRow = {
    anilistStudioId: number | null;
    count: number;
    scoreSum: number;
    scoreCount: number;
    minutesWatched: number;
    medias: Map<number, TopStudioCarouselMedia>;
  };

  const rows = new Map<string, StudioRow>();

  for (const entry of entries) {
    const edges = entry.media?.studios?.edges || [];
    const mediaId = Number(entry.media?.id || 0);
    if (!mediaId) continue;
    const coverImageUrl =
      String(entry.media?.coverImage?.large || entry.media?.coverImage?.medium || "").trim() ||
      null;
    const mediaTitle =
      String(entry.media?.title?.romaji || entry.media?.title?.english || "").trim() ||
      "Titre inconnu";
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
    const deltaRows = buildActivityDeltaRows(periodActivities, "anime");
    for (const { activity: a, delta } of deltaRows) {
      if (delta <= 0) continue;
      const mins = delta * (Number(a?.media?.duration || 24) || 24);
      const nameToIdM = animationStudioNameToId(a?.media?.studios?.edges || []);
      for (const name of nameToIdM.keys()) {
        const row = rows.get(name);
        if (row) row.minutesWatched += mins;
      }
    }
  }

  return [...rows.entries()]
    .map(([name, row]) => {
      const mediasSorted = sortCarouselMedia(row.medias.values());
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
}

export function computeMangaTopAuthors(
  entries: readonly AniListEntry[],
  periodActivities: readonly ActivityItem[],
  isAllTime: boolean
): MangaTopAuthorRow[] {
  type AuthorRow = {
    id: number;
    name: string;
    imageUrl: string | null;
    siteUrl: string | null;
    count: number;
    scoreSum: number;
    scoreCount: number;
    chaptersRead: number;
    roleLabelCounts: Map<string, number>;
    medias: Map<number, TopStudioCarouselMedia>;
  };

  const rows = new Map<number, AuthorRow>();

  for (const entry of entries) {
    const edges = entry.media?.staff?.edges || [];
    const mediaId = Number(entry.media?.id || 0);
    if (!mediaId) continue;
    const coverImageUrl =
      String(entry.media?.coverImage?.large || entry.media?.coverImage?.medium || "").trim() ||
      null;
    const mediaTitle =
      String(entry.media?.title?.romaji || entry.media?.title?.english || "").trim() ||
      "Titre inconnu";
    const userScore = Number(entry.score || 0);
    const averageScore = Number(entry.media?.averageScore || 0);
    const anilistUrl = anilistMediaUrl({ siteUrl: entry.media?.siteUrl, id: mediaId }, "MANGA");

    const roleByAuthorOnThisMedia = new Map<
      number,
      { name: string; imageUrl: string | null; siteUrl: string | null; roleLabel: string }
    >();
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
      const imageUrl = String(node?.image?.large || node?.image?.medium || "").trim() || null;
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
          medias: new Map<number, TopStudioCarouselMedia>(),
        } as AuthorRow);
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

  if (!isAllTime) {
    const authorsByMediaId = new Map<number, number[]>();
    for (const [authorId, row] of rows.entries()) {
      for (const mediaId of row.medias.keys()) {
        const list = authorsByMediaId.get(mediaId);
        if (list) list.push(authorId);
        else authorsByMediaId.set(mediaId, [authorId]);
      }
    }
    const deltaRows = buildActivityDeltaRows(periodActivities, "manga");
    for (const { activity: a, delta } of deltaRows) {
      if (delta <= 0) continue;
      const mediaId = Number(a?.media?.id || 0);
      if (!mediaId) continue;
      const authorIds = authorsByMediaId.get(mediaId);
      if (!authorIds) continue;
      for (const aid of authorIds) {
        const row = rows.get(aid);
        if (row) row.chaptersRead += delta;
      }
    }
  }

  return [...rows.values()]
    .map((row) => {
      const mediasSorted = sortCarouselMedia(row.medias.values());
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
}
