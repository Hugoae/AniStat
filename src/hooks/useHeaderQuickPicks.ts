import { useEffect, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { fetchAL, USER_AVATAR_QUERY } from "../api/anilistClient";
import { PROFILE_QUICK_SUGGESTIONS } from "../config/constants";
import {
  QUICKPICK_AVATAR_TTL_MS,
  filterQuickProfileSuggestions,
  normalizeName,
  quickPickAvatarCacheKey,
  readQuickPickAvatarStored,
  safeWriteCache,
} from "../lib/profileLocalCache";
import type { AniListUser } from "../types/domain";
import type { UserAvatarQuery } from "../types/anilistGraphql";

/** Map pseudo-normalisé → URL d'avatar résolue (cache in-memory de la session). */
type QuickPickState = Record<string, string | null | undefined>;

type Params = {
  /** Profil AniList actuellement chargé (ou null tant qu'aucun profil n'est actif). */
  appUser: AniListUser | null;
  /** Pseudo en cours de chargement (différent d'`appUser.name` pendant la transition). */
  pendingProfileName: string | null;
  /** `true` si un fetch de profil est en cours. */
  loading: boolean;
  /** Contenu courant du champ de recherche. */
  inputVal: string;
  /** `true` quand l'input de recherche a le focus (pilote la visibilité de la liste). */
  headerSearchFocused: boolean;
  /** Cache in-memory des avatars résolus par le hook (plus rapide que localStorage). */
  quickPickResolvedAvatars: QuickPickState;
  setQuickPickResolvedAvatars: Dispatch<SetStateAction<QuickPickState>>;
};

/**
 * Hook qui pilote la liste d'auto-complétion « Quick Picks » du header et le
 * bloc profil en transition.
 *
 * Responsabilités :
 *  - **Transition visuelle** : pendant qu'un autre profil se charge, on
 *    affiche immédiatement le pseudo ciblé + son avatar (s'il est en cache),
 *    plutôt que de garder l'ancien profil ou d'afficher un placeholder vide.
 *    `transitionActive` indique si on est dans cet état intermédiaire.
 *  - **Filtrage des suggestions** : filtre `PROFILE_QUICK_SUGGESTIONS`
 *    (liste statique de profils favoris) en fonction du texte saisi, et
 *    enrichit chaque ligne avec un `displayAvatar` résolu dans cet ordre :
 *      1. avatar explicite fourni dans la liste,
 *      2. avatar du profil courant s'il correspond,
 *      3. cache localStorage (TTL 7 jours),
 *      4. cache in-memory (résolu dans la session courante),
 *      5. null (fallback vers un placeholder avec initiale).
 *  - **Résolution paresseuse des avatars** : quand la liste devient visible,
 *    on fetch les avatars manquants en parallèle, un par un, pour alimenter
 *    le cache sans exploser le rate-limit AniList. Les requêtes sont
 *    annulables (`AbortController`) si la liste se referme.
 */
export function useHeaderQuickPicks({
  appUser,
  pendingProfileName,
  loading,
  inputVal,
  headerSearchFocused,
  quickPickResolvedAvatars,
  setQuickPickResolvedAvatars,
}: Params) {
  const transitionActive = Boolean(
    pendingProfileName &&
      loading &&
      (!appUser || normalizeName(appUser.name) !== normalizeName(pendingProfileName))
  );

  const pendingAvatarUrl = transitionActive
    ? readQuickPickAvatarStored(pendingProfileName) ||
      quickPickResolvedAvatars[normalizeName(pendingProfileName)] ||
      null
    : null;

  const headerUser = transitionActive
    ? { name: pendingProfileName as string, avatar: { large: pendingAvatarUrl, medium: pendingAvatarUrl } }
    : appUser;
  const headerBannerImage = transitionActive ? null : appUser?.bannerImage;
  const anilistProfileUrl = headerUser
    ? `https://anilist.co/user/${encodeURIComponent(headerUser.name)}/`
    : null;

  const headerQuickPickMatches = useMemo(() => {
    const rows = filterQuickProfileSuggestions(inputVal, PROFILE_QUICK_SUGGESTIONS);
    return rows.map((p) => {
      const key = normalizeName(p.userName);
      return {
        ...p,
        displayAvatar:
          p.avatarUrl ||
          (appUser && normalizeName(appUser.name) === key ? appUser.avatar?.large || appUser.avatar?.medium : null) ||
          readQuickPickAvatarStored(p.userName) ||
          quickPickResolvedAvatars[key] ||
          null,
      };
    });
  }, [inputVal, appUser, quickPickResolvedAvatars]);
  const showHeaderQuickPicks = headerSearchFocused && headerQuickPickMatches.length > 0;

  useEffect(() => {
    if (!showHeaderQuickPicks) return undefined;
    const ac = new AbortController();
    const todo = headerQuickPickMatches.filter((p) => {
      if (!String(p.userName || "").trim()) return false;
      if (p.avatarUrl) return false;
      const key = normalizeName(p.userName);
      if (appUser && normalizeName(appUser.name) === key) return false;
      if (readQuickPickAvatarStored(p.userName)) return false;
      if (quickPickResolvedAvatars[key]) return false;
      return true;
    });
    if (todo.length === 0) return undefined;

    let cancelled = false;
    (async () => {
      for (const p of todo) {
        const name = p.userName;
        if (cancelled || ac.signal.aborted) return;
        try {
          const data = await fetchAL<UserAvatarQuery>(
            USER_AVATAR_QUERY,
            { name },
            { signal: ac.signal }
          );
          const url = data?.User?.avatar?.large || data?.User?.avatar?.medium || null;
          if (url && !cancelled) {
            const k = normalizeName(name);
            safeWriteCache(quickPickAvatarCacheKey(k), url, QUICKPICK_AVATAR_TTL_MS);
            setQuickPickResolvedAvatars((prev) => (prev[k] ? prev : { ...prev, [k]: url }));
          }
        } catch (e: unknown) {
          const err = e as { name?: string };
          if (err?.name === "AbortError") return;
        }
      }
    })();
    return () => {
      cancelled = true;
      ac.abort();
    };
  }, [showHeaderQuickPicks, headerQuickPickMatches, appUser, quickPickResolvedAvatars, setQuickPickResolvedAvatars]);

  return {
    transitionActive,
    headerUser,
    headerBannerImage,
    anilistProfileUrl,
    headerQuickPickMatches,
    showHeaderQuickPicks,
  };
}
