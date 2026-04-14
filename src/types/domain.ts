export type AniListUser = {
  id: number;
  name: string;
  bannerImage?: string | null;
  avatar?: { large?: string | null; medium?: string | null };
};

export type AniListMedia = {
  id: number;
  format?: string | null;
  averageScore?: number | null;
  genres?: string[];
  countryOfOrigin?: string | null;
};

export type AniListEntry = {
  id: number;
  status?: string;
  score?: number;
  progressVolumes?: number;
  updatedAt?: number;
  startedAt?: { year?: number | null };
  completedAt?: { year?: number | null };
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
