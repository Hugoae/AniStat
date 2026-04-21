import type { ActivityItem, AniListEntry } from "../types/domain";

/**
 * Sous-ensemble minimal des champs `media` nécessaires au calcul des stats
 * d'activité (minutes regardées, chapitres lus, répartitions par format /
 * pays, détection des fins automatiques). Le reste des métadonnées d'un
 * media (titres, covers, studios, tags…) n'est PAS utilisé par les fonctions
 * de `lib/stats.ts` pour les activités, on ne le rejoint donc pas.
 */
export type ActivityMediaBits = {
  id: number;
  duration?: number | null;
  episodes?: number | null;
  chapters?: number | null;
  format?: string | null;
  countryOfOrigin?: string | null;
};

/**
 * Construit l'index `mediaId → ActivityMediaBits` à partir des entrées de
 * liste (anime + manga) déjà chargées. Les doublons par `id` sont résolus en
 * gardant la **dernière** valeur rencontrée (cas rare : anime partagé entre
 * custom lists). Le map est pensé pour être stable tant que les listes ne
 * changent pas, afin d'être utilisé depuis une `useRef` côté appelant.
 */
export function buildMediaBitsIndex(
  entries: readonly AniListEntry[][]
): Map<number, ActivityMediaBits> {
  const map = new Map<number, ActivityMediaBits>();
  for (const list of entries) {
    for (const entry of list) {
      const media = entry?.media;
      const id = typeof media?.id === "number" ? media.id : 0;
      if (!id) continue;
      map.set(id, {
        id,
        duration: media?.duration ?? null,
        episodes: media?.episodes ?? null,
        // `chapters` est fourni par le domain type via l'intersection de
        // `AniListMedia` avec `{ chapters?: number | null }` dans
        // `ActivityItem.media`. Côté AniListEntry on le récupère aussi via
        // MEDIA_LIST_QUERY.
        chapters:
          (media as { chapters?: number | null } | undefined)?.chapters ?? null,
        format: media?.format ?? null,
        countryOfOrigin: media?.countryOfOrigin ?? null,
      });
    }
  }
  return map;
}

/**
 * Enrichit une liste d'activités « slim » (payload réduit à `media { id }`)
 * avec les champs utiles du media trouvés dans `mediaById`.
 *
 * Pour chaque activité :
 *  - Si le media est connu dans l'index → `media` est **remplacé** par les
 *    bits. Cela garantit que les chiffres (durée, épisodes, chapitres) sont
 *    toujours alignés avec l'état courant de la liste de l'utilisateur, même
 *    si l'activité a été mise en cache avec un ancien état.
 *  - Sinon (orphelin : activité pointant vers un media supprimé ou non listé)
 *    → l'activité est retournée telle quelle. Le pipeline stats la filtrera
 *    automatiquement via la condition `mediaId && createdAt`.
 */
export function enrichActivitiesWithMediaBits<T extends ActivityItem>(
  activities: readonly T[],
  mediaById: Map<number, ActivityMediaBits>
): T[] {
  if (activities.length === 0) return [];
  return activities.map((a) => {
    const id = typeof a?.media?.id === "number" ? a.media.id : 0;
    if (!id) return a;
    const bits = mediaById.get(id);
    if (!bits) return a;
    return { ...a, media: { ...bits } } as T;
  });
}
