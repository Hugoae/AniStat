import { useEffect, type Dispatch, type RefObject, type SetStateAction } from "react";
import { C } from "../config/constants";

export type HomeQuickPickRow = {
  userName: string;
  label?: string;
  displayAvatar?: string | null;
  avatarUrl?: string;
};

export type HomeLandingProps = {
  C: typeof C;
  inputVal: string;
  setInputVal: Dispatch<SetStateAction<string>>;
  headerSearchInputRef: RefObject<HTMLInputElement | null>;
  headerSearchFocused: boolean;
  setHeaderSearchFocused: Dispatch<SetStateAction<boolean>>;
  handleSubmit: () => void;
  showHeaderQuickPicks: boolean;
  headerQuickPickMatches: HomeQuickPickRow[];
  pickQuickProfile: (userName: string) => void;
};

/** Page d’accueil plein écran : décor, titre et recherche. */
export function HomeLanding({
  C,
  inputVal,
  setInputVal,
  headerSearchInputRef,
  headerSearchFocused,
  setHeaderSearchFocused,
  handleSubmit,
  showHeaderQuickPicks,
  headerQuickPickMatches,
  pickQuickProfile,
}: HomeLandingProps) {
  useEffect(() => {
    const id = window.requestAnimationFrame(() => {
      try {
        headerSearchInputRef.current?.focus({ preventScroll: true });
      } catch {
        headerSearchInputRef.current?.focus();
      }
    });
    return () => window.cancelAnimationFrame(id);
  }, [headerSearchInputRef]);

  return (
    <div className="home-landing">
      <div className="home-landing__bg" aria-hidden>
        <div className="home-landing__rings" />
        <div className="home-landing__glow home-landing__glow--1" />
        <div className="home-landing__glow home-landing__glow--2" />
      </div>

      <div className="home-landing__inner">
        <div className="home-landing__brand-row">
          <span className="home-landing__brand-mark" aria-hidden>
            <span className="header-brand-a">A</span>
            <span className="header-brand-s">S</span>
          </span>
          <span className="home-landing__brand-text">AniList Stat</span>
        </div>

        <header className="home-landing__hero">
          <h1 className="home-landing__title">Vos statistiques AniList</h1>
          <p className="home-landing__subtitle">
            Visualisez l&apos;activité, les tops et les graphiques d&apos;un profil public à un seul endroit
          </p>
        </header>

        <div className="home-landing__search-block">
          <div className="header-search-wrap home-landing__search-wrap">
            <div className="header-search-group">
              <input
                ref={headerSearchInputRef}
                id="landing-anilist-username"
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
                placeholder="Rechercher un pseudo AniList…"
                autoComplete="off"
                aria-label="Rechercher un pseudo AniList"
                aria-autocomplete="list"
                aria-expanded={showHeaderQuickPicks}
                aria-controls="landing-quick-picks"
                className="home-landing__search-input"
              />
              <button
                type="button"
                className="header-search-submit home-landing__search-submit"
                aria-label="Rechercher ce profil"
                disabled={!inputVal.trim()}
                onClick={handleSubmit}
              >
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <circle cx="11" cy="11" r="7" />
                  <path d="M20 20 16.65 16.65" />
                </svg>
              </button>
            </div>
            {showHeaderQuickPicks ? (
              <ul id="landing-quick-picks" className="header-search-suggestions" role="listbox">
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
                        <img className="header-search-suggestion-avatar" src={p.displayAvatar} alt="" />
                      ) : (
                        <span className="header-search-suggestion-initial" aria-hidden>
                          {String(p.userName).trim().charAt(0).toUpperCase() || "?"}
                        </span>
                      )}
                      <span className="header-search-suggestion-meta">
                        <span className="header-search-suggestion-user">{p.userName}</span>
                        {p.label ? <span className="header-search-suggestion-label">{p.label}</span> : null}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <p className="home-landing__search-hint">Profils publics uniquement · données fournies par AniList</p>
        </div>
      </div>
    </div>
  );
}

