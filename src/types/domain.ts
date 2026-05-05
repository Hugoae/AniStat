export type AniListUser = {
  id: number;
  name: string;
  /** Timestamp Unix de création du compte AniList, si disponible. */
  createdAt?: number | null;
  bannerImage?: string | null;
  avatar?: { large?: string | null; medium?: string | null };
};

/** Tag AniList rattaché à un media (vocabulaire bien plus granulaire que les genres). */
export type AniListMediaTag = {
  /** Identifiant numérique stable du tag (utile pour la déduplication). */
  id?: number | null;
  name: string;
  /** Catégorie « parente » (ex. « Theme-Other », « Setting-Universe »…). */
  category?: string | null;
  /** Force du tag pour ce media (0 → 100). Renseignée par les votes communautaires AniList. */
  rank?: number | null;
  /** Tag spoiler spécifique au media (à exclure par défaut). */
  isMediaSpoiler?: boolean | null;
  /** Tag spoiler générique (à exclure par défaut). */
  isGeneralSpoiler?: boolean | null;
  /** Tag réservé au contenu adulte. */
  isAdult?: boolean | null;
};

export type AniListMedia = {
  id: number;
  title?: { romaji?: string | null; english?: string | null };
  coverImage?: { large?: string | null; medium?: string | null; color?: string | null };
  format?: string | null;
  duration?: number | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  siteUrl?: string | null;
  averageScore?: number | null;
  genres?: string[];
  tags?: AniListMediaTag[];
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
  /**
   * Personnel créditeur du media (mangakas, scénaristes, illustrateurs, etc.).
   * Renseigné uniquement pour les manga (cf. `MEDIA_LIST_QUERY_MANGA`).
   */
  staff?: {
    edges?: Array<{
      /** Texte libre du rôle ("Story", "Art", "Story & Art", "Original Creator"…). */
      role?: string | null;
      node?: {
        id?: number | null;
        name?: {
          full?: string | null;
          native?: string | null;
          userPreferred?: string | null;
        } | null;
        image?: { large?: string | null; medium?: string | null } | null;
        siteUrl?: string | null;
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
  id?: number;
  createdAt?: number;
  progress?: string | null;
  status?: string | null;
  media?: AniListMedia & { episodes?: number | null; chapters?: number | null };
};

export type ActivityCacheByYear = Record<number, ActivityItem[]>;

/** Référence légère vers un média pour les modules « records / podiums ». */
export type RecordMediaRef = {
  id: number;
  title: string;
  coverImageUrl: string | null;
  coverColor: string | null;
  anilistUrl: string | null;
};

/** Bundle de records / faits marquants pour un onglet (anime ou manga). */
export type PeriodRecordsBundle = {
  biggestSession: { count: number; dateLabel: string } | null;
  longestStreak: { length: number; startDateLabel: string; endDateLabel: string } | null;
  longestCompleted: { media: RecordMediaRef; count: number } | null;
  highestScore: { media: RecordMediaRef; score: number } | null;
  lowestScore: { media: RecordMediaRef; score: number } | null;
  firstStarted: { media: RecordMediaRef; dateLabel: string } | null;
  lastStarted: { media: RecordMediaRef; dateLabel: string } | null;
  /** Toute première activité de la période (progrès ou changement de statut). */
  firstActivity: { media: RecordMediaRef; dateLabel: string } | null;
  /** Toute dernière activité de la période (progrès ou changement de statut). */
  lastActivity: { media: RecordMediaRef; dateLabel: string } | null;
  fastestCompleted: { media: RecordMediaRef; days: number } | null;
  biggestOpinionGap: { media: RecordMediaRef; gap: number; userScore: number; averageScore: number } | null;
  mostPromisingPlanned: { media: RecordMediaRef; averageScore: number } | null;
  /** Nombre d’œuvres distinctes dont `startedAt` est dans la période + jusqu’à 3 covers (tri notes / moyenne). */
  worksStartedInPeriod: { count: number; spotlight: RecordMediaRef[] } | null;
  /** Nombre d’œuvres complétées dans la période + jusqu’à 3 covers. */
  worksCompletedInPeriod: { count: number; spotlight: RecordMediaRef[] } | null;
};
