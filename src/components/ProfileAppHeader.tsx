import type { RefObject } from "react";
import { C, MONTHS } from "../config/constants";

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
  loaded: boolean;
  years: number[];
  year: number;
  month: number;
  changeYear: (y: number) => void;
  setMonth: (m: number) => void;
  headerUser: HeaderProfileUser | null;
  transitionActive: boolean;
  anilistProfileUrl: string | null;
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
  loaded,
  years,
  year,
  month,
  changeYear,
  setMonth,
  headerUser,
  transitionActive,
  anilistProfileUrl,
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

        {loaded && (
          <div className="period-panel">
            <div className="period-panel-title">Période d'analyse</div>
            <div className="period-pills period-pills--years">
              {years.map((y) => (
                <button
                  key={y}
                  type="button"
                  className={`period-pill ${y === year ? "active" : ""}`}
                  onClick={() => changeYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
            <div className="period-divider" />
            <div className="period-pills period-pills--months">
              <button
                type="button"
                className={`period-pill period-pill--wide ${month === 0 ? "active" : ""}`}
                onClick={() => setMonth(0)}
              >
                Toute l'année
              </button>
              {MONTHS.map((m, idx) => (
                <button
                  key={m}
                  type="button"
                  className={`period-pill ${month === idx + 1 ? "active" : ""}`}
                  onClick={() => setMonth(idx + 1)}
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
        )}

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
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
