import type { RefObject } from "react";
import { C } from "../config/constants";

export type ProfileHeaderQuickPick = {
  userName: string;
  label?: string;
  displayAvatar?: string | null;
};

type HeaderProfileUser = {
  name: string;
  avatar?: { large?: string | null; medium?: string | null } | null;
};

export type ProfileAppHeaderProps = {
  C: typeof C;
  headerBannerImage: string | null | undefined;
  headerSearchInputRef: RefObject<HTMLInputElement | null>;
  inputVal: string;
  setInputVal: (v: string) => void;
  setHeaderSearchFocused: (v: boolean) => void;
  showHeaderQuickPicks: boolean;
  headerQuickPickMatches: ProfileHeaderQuickPick[];
  pickQuickProfile: (name: string) => void;
  handleSubmit: () => void;
  showApiBadge: boolean;
  apiStatusBadge: { label: string; color: string };
  isDevLocal: boolean;
  showDevPanel: boolean;
  setShowDevPanel: (v: boolean | ((p: boolean) => boolean)) => void;
  headerUser: HeaderProfileUser | null;
  transitionActive: boolean;
  anilistProfileUrl: string | null;
  syncStatusLabel: string | null;
  syncRefreshing: boolean;
  onRefreshProfile: () => void;
};

export function ProfileAppHeader({
  C,
  headerBannerImage,
  headerSearchInputRef,
  inputVal,
  setInputVal,
  setHeaderSearchFocused,
  showHeaderQuickPicks,
  headerQuickPickMatches,
  pickQuickProfile,
  handleSubmit,
  showApiBadge,
  apiStatusBadge,
  isDevLocal,
  showDevPanel,
  setShowDevPanel,
  headerUser,
  transitionActive,
  anilistProfileUrl,
  syncStatusLabel,
  syncRefreshing,
  onRefreshProfile,
}: ProfileAppHeaderProps) {
  return (
    <div
      className={`header-surface ${headerBannerImage ? "header-surface--banner" : "header-surface--plain"}`}
      style={
        headerBannerImage
          ? {
              backgroundImage: `linear-gradient(to bottom, rgba(11,22,34,0.3), ${C.bg}), url(${headerBannerImage})`,
            }
          : undefined
      }
    >
      <div className="header-container">
        <div className="header-top-row">
          <a href="#/" className="header-brand header-brand--home" aria-label="AniList Stat — Accueil">
            <span className="header-brand-mark">
              <span className="header-brand-a">A</span>
              <span className="header-brand-s">S</span>
            </span>
          </a>
          <div className="header-search-wrap">
            <div className="header-search-group">
              <input
                ref={headerSearchInputRef}
                id="header-anilist-username"
                name="anilist-username"
                type="search"
                value={inputVal}
                onChange={(e) => setInputVal(e.target.value)}
                onFocus={() => setHeaderSearchFocused(true)}
                onBlur={() => {
                  window.setTimeout(() => setHeaderSearchFocused(false), 120);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && inputVal.trim()) {
                    if (showHeaderQuickPicks && headerQuickPickMatches.length > 0) {
                      e.preventDefault();
                      pickQuickProfile(headerQuickPickMatches[0].userName);
                      return;
                    }
                    handleSubmit();
                  }
                  if (e.key === "Escape") setHeaderSearchFocused(false);
                }}
                placeholder="Nom d'utilisateur AniList"
                autoComplete="off"
                aria-label="Rechercher un pseudo AniList"
                aria-autocomplete="list"
                aria-expanded={showHeaderQuickPicks}
                aria-controls="header-quick-picks"
                className="header-search-input"
              />
              <button
                type="button"
                className="header-search-submit"
                aria-label="Rechercher ce profil"
                disabled={!inputVal.trim()}
                onClick={handleSubmit}
              >
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="2.25"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20 16.65 16.65" />
                </svg>
              </button>
            </div>
            {showHeaderQuickPicks ? (
              <ul id="header-quick-picks" className="header-search-suggestions" role="listbox">
                {headerQuickPickMatches.map((p) => (
                  <li key={p.userName} role="presentation">
                    <button
                      type="button"
                      role="option"
                      className="header-search-suggestion-btn"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        pickQuickProfile(p.userName);
                      }}
                    >
                      {p.displayAvatar ? (
                        <img
                          className="header-search-suggestion-avatar"
                          src={p.displayAvatar}
                          alt=""
                        />
                      ) : (
                        <span className="header-search-suggestion-initial" aria-hidden>
                          {String(p.userName).trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                      <span className="header-search-suggestion-meta">
                        <span className="header-search-suggestion-user">{p.userName}</span>
                        {p.label ? (
                          <span className="header-search-suggestion-label">{p.label}</span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <a href="#/" className="header-home-link">
            Accueil
          </a>
          <div className="header-nav-fill" aria-hidden />
          {showApiBadge && (
            <div className="header-api-badge" style={{ color: apiStatusBadge.color }}>
              {apiStatusBadge.label}
            </div>
          )}
          {isDevLocal && (
            <button
              type="button"
              className="header-dev-toggle"
              onClick={() => setShowDevPanel((v) => !v)}
            >
              {showDevPanel ? "Masquer debug" : "Afficher debug"}
            </button>
          )}
        </div>

        {headerUser && (
          <div className="header-profile fade-in">
            {headerUser.avatar?.large || headerUser.avatar?.medium ? (
              <img
                className="header-profile-avatar header-profile-avatar--accent"
                src={headerUser.avatar.large || headerUser.avatar.medium || ""}
                alt=""
              />
            ) : (
              <span
                className="header-profile-avatar header-profile-avatar-placeholder header-profile-avatar--accent"
                aria-hidden
              >
                {String(headerUser.name).trim().charAt(0).toUpperCase() || "?"}
              </span>
            )}
            <div className="header-profile-text">
              <a
                className="header-profile-name-link"
                href={anilistProfileUrl ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
              >
                {headerUser.name}
              </a>
              {transitionActive ? (
                <div className="header-profile-meta header-profile-meta--pending">
                  Chargement du profil…
                </div>
              ) : null}
              {syncStatusLabel ? (
                <div className={`header-sync-row${syncRefreshing ? " header-sync-row--refreshing" : ""}`}>
                  <span className="header-sync-badge">
                    {syncRefreshing ? <span className="spinner spinner--sm" aria-hidden /> : null}
                    <span>{syncRefreshing ? "Mise à jour en fond…" : syncStatusLabel}</span>
                  </span>
                  <button
                    type="button"
                    className="header-sync-refresh-btn"
                    onClick={onRefreshProfile}
                    disabled={syncRefreshing}
                    aria-label="Rafraîchir les données AniList"
                    title="Rafraîchir les données AniList"
                  >
                    <svg
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.25"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="M21 12a9 9 0 0 1-15.4 6.36" />
                      <path d="M3 12A9 9 0 0 1 18.4 5.64" />
                      <path d="M18 2v4h-4" />
                      <path d="M6 22v-4h4" />
                    </svg>
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
