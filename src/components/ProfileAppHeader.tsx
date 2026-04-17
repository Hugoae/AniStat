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
      <div style={{ maxWidth: 1100, margin: "0 auto" }}>
        <div className="header-top-row">
          <a href="#/" className="header-brand header-brand--home" aria-label="AniList Stat — Accueil">
            <span className="header-brand-mark">
              <span className="header-brand-a">A</span>
              <span className="header-brand-s" style={{ color: C.accent }}>
                S
              </span>
            </span>
          </a>
          <div className="header-search-wrap">
            <div className="header-search-group">
              <input
                ref={headerSearchInputRef}
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
                aria-autocomplete="list"
                aria-expanded={showHeaderQuickPicks}
                aria-controls="header-quick-picks"
                style={{
                  flex: 1,
                  background: C.cardBg,
                  border: `1px solid ${C.border}`,
                  borderRight: "none",
                  borderRadius: "var(--radius-control) 0 0 var(--radius-control)",
                  padding: "10px 14px",
                  color: C.text,
                  fontSize: 14,
                  fontFamily: "inherit",
                }}
              />
              <button
                type="button"
                className="header-search-submit"
                aria-label="Rechercher ce profil"
                disabled={!inputVal.trim()}
                onClick={handleSubmit}
                style={{
                  background: C.accent,
                  color: "#fff",
                  border: `1px solid ${C.accent}`,
                  borderLeft: "none",
                  borderRadius: "0 var(--radius-control) var(--radius-control) 0",
                  padding: "10px 14px",
                  minWidth: 48,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontFamily: "inherit",
                }}
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
            <div
              style={{
                background: "rgba(255,255,255,0.03)",
                border: `1px solid ${C.border}`,
                borderRadius: "var(--radius-full)",
                padding: "6px 10px",
                fontSize: 12,
                color: apiStatusBadge.color,
                fontWeight: 700,
              }}
            >
              {apiStatusBadge.label}
            </div>
          )}
          {isDevLocal && (
            <button
              type="button"
              onClick={() => setShowDevPanel((v) => !v)}
              style={{
                background: "transparent",
                border: `1px solid ${C.border}`,
                color: C.textMuted,
                borderRadius: "var(--radius-control)",
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
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
                className="header-profile-avatar"
                src={headerUser.avatar.large || headerUser.avatar.medium || ""}
                alt=""
                style={{ border: `2px solid ${C.accent}` }}
              />
            ) : (
              <span
                className="header-profile-avatar header-profile-avatar-placeholder"
                style={{ border: `2px solid ${C.accent}` }}
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
