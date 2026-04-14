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

type QuickPickState = Record<string, string | null | undefined>;

type Params = {
  appUser: AniListUser | null;
  pendingProfileName: string | null;
  loading: boolean;
  inputVal: string;
  headerSearchFocused: boolean;
  quickPickResolvedAvatars: QuickPickState;
  setQuickPickResolvedAvatars: Dispatch<SetStateAction<QuickPickState>>;
};

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
          const data = await fetchAL(USER_AVATAR_QUERY, { name }, { signal: ac.signal });
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
