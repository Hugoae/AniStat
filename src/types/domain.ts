export type AniListUser = {
  id: number;
  name: string;
  bannerImage?: string | null;
  avatar?: { large?: string | null; medium?: string | null };
};

export type AniListMedia = {
  id: number;
  title?: { romaji?: string | null; english?: string | null };
  coverImage?: { large?: string | null; medium?: string | null; color?: string | null };
  format?: string | null;
  duration?: number | null;
  episodes?: number | null;
  siteUrl?: string | null;
  averageScore?: number | null;
  genres?: string[];
  countryOfOrigin?: string | null;
  /** Saison de diffusion (AniList) : WINTER, SPRING, SUMMER, FALL */
  season?: string | null;
  seasonYear?: number | null;
  startDate?: { year?: number | null; month?: number | null; day?: number | null };
  studios?: {
    edges?: Array<{
      isMain?: boolean | null;
      node?: {
        id?: number | null;
        name?: string | null;
        isAnimationStudio?: boolean | null;
      } | null;
    }>;
  };
};

export type AniListEntry = {
  id: number;
  status?: string;
  score?: number;
  progress?: number;
  progressVolumes?: number;
  updatedAt?: number;
  startedAt?: { year?: number | null; month?: number | null; day?: number | null };
  completedAt?: { year?: number | null; month?: number | null; day?: number | null };
  media?: AniListMedia;
  listName?: string;
  listStatus?: string;
};

export type ActivityItem = {
  createdAt?: number;
  progress?: string | null;
  status?: string | null;
  media?: AniListMedia & { episodes?: number | null; chapters?: number | null };
};

export type ActivityCacheByYear = Record<number, ActivityItem[]>;
