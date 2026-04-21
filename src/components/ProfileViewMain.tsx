import { useEffect, useState, type ReactNode } from "react";
import { C } from "../config/constants";
import { DevPanel, LoadingBlock, PeriodFloatingChip } from "./AppUi";
import type { FetchLogEntry } from "../api/anilistClient";
import {
  getProfileFetchStats,
  subscribeProfileFetchStats,
  type ProfileFetchStats,
} from "../lib/profileFetchStats";

/**
 * Messages narratifs pour le loader principal : un enchaînement court qui
 * raconte ce que fait l'app pendant les quelques secondes où on attend la
 * réponse d'AniList. Chaque message s'affiche ~2,2 s avant de passer au suivant.
 */
const PRIMARY_LOADING_MESSAGES = [
  "Connexion à AniList…",
  "Récupération de ton profil…",
  "On rassemble tes anime…",
  "On compile tes manga…",
  "Analyse de tes notes…",
  "Préparation du tableau de bord…",
];

type ActivityLoadDebug = {
  yearsTotal: number;
  yearsComplete: number;
  yearsPending: number;
  animeRows: number;
  mangaRows: number;
};

type RateLimitStateSlice = {
  queued?: number;
  inFlight?: number;
  blockedForMs?: number;
  estimatedWaitMs?: number;
  rateLimit?: number | null;
  rateRemaining?: number | null;
  rateResetAt?: number | null;
  requestIntervalMs?: number;
};

type ProxyCacheStatsSlice = {
  hit?: number;
  miss?: number;
  bypass?: number;
  unknown?: number;
  policy?: Record<string, number>;
};

type DebugMetricsView = {
  cacheHit?: number;
  cacheMiss?: number;
  cacheWrite?: number;
  rateLimitErrors?: number;
  avgProfileFetchMs?: number;
  profileFetchCount?: number;
};

export type ProfileTabDef = { key: string; label: string };

export type ProfileViewMainProps = {
  C: typeof C;
  loaded: boolean;
  loading: boolean;
  /** Spinner principal : chargement profil, activités année, ou zone morte (ex. Strict Mode). */
  primaryProfileLoader: boolean;
  awaitingPrimaryYearActivities: boolean;
  loadingActivities: boolean;
  error: string | null;
  /**
   * `true` quand l'API AniList a répondu en 403 / indiqué que l'API est
   * désactivée. L'encart d'erreur bascule alors sur un ton neutre et un
   * message UX explicite (cause externe, réessaie plus tard).
   */
  apiDisabled?: boolean;
  displayActivityLoadingMessage: string;
  activityLoadingMessage: string;
  activityEtaSeconds: number | null;
  /**
   * Libellé d'ETA déjà formaté (« 14 s », « 1 min 20 »), préféré à
   * `activityEtaSeconds` quand il est non-null : il garantit une unité
   * cohérente (sec / min) et se base sur les mesures observées.
   */
  activityEtaLabel: string | null;
  rateInfoLabel: string | null;
  activityWarning: string | null;
  handleRetryComparisonNow: () => void;
  retryableYears: number[];
  retryYearNow: (yy: number) => void;
  isDevLocal: boolean;
  showDevPanel: boolean;
  activityLoadDebug: ActivityLoadDebug | null;
  rateLimitState: RateLimitStateSlice | null | undefined;
  debugMetricsView: DebugMetricsView | null;
  proxyCacheStats: ProxyCacheStatsSlice | null | undefined;
  setDebugMetricsView: (v: DebugMetricsView | null) => void;
  /** Journal des dernières requêtes GraphQL (dev panel). */
  fetchLog: readonly FetchLogEntry[];
  /** Remet à zéro uniquement le journal de requêtes. */
  resetFetchLog: () => void;
  /** Compteurs dérivés des listes chargées, surfacés dans le dev panel. */
  animeEntriesCount: number;
  mangaEntriesCount: number;
  tabs: ProfileTabDef[];
  tab: string;
  setTab: (k: string) => void;
  periodYears: number[];
  periodYear: number;
  periodMonth: number;
  periodChangeYear: (y: number) => void;
  periodSetMonth: (m: number) => void;
  children: ReactNode;
};

export function ProfileViewMain({
  loaded,
  loading,
  primaryProfileLoader,
  awaitingPrimaryYearActivities,
  loadingActivities,
  error,
  apiDisabled = false,
  displayActivityLoadingMessage,
  activityLoadingMessage,
  activityEtaSeconds,
  activityEtaLabel,
  rateInfoLabel,
  activityWarning,
  handleRetryComparisonNow,
  retryableYears,
  retryYearNow,
  isDevLocal,
  showDevPanel,
  activityLoadDebug,
  rateLimitState,
  debugMetricsView,
  proxyCacheStats,
  setDebugMetricsView,
  fetchLog,
  resetFetchLog,
  animeEntriesCount,
  mangaEntriesCount,
  tabs,
  tab,
  setTab,
  periodYears,
  periodYear,
  periodMonth,
  periodChangeYear,
  periodSetMonth,
  children,
}: ProfileViewMainProps) {
  /**
   * Stats historiques (persistées en localStorage) des derniers fetchs
   * profil complets. Sert à projeter un ETA « reste ~Xs » dans le loader
   * principal. On s'abonne aux mises à jour pour capturer le premier fetch
   * de la session sans avoir à remonter.
   */
  const [profileFetchStats, setProfileFetchStats] = useState<ProfileFetchStats>(() =>
    getProfileFetchStats()
  );
  useEffect(() => {
    const unsubscribe = subscribeProfileFetchStats(() => {
      setProfileFetchStats(getProfileFetchStats());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  // On prend la plus défavorable de (moyenne × 1.15, max observé) pour que
  // l'ETA ne mente pas quand certains fetchs historiques ont été plus lents.
  const primaryLoaderEstimateMs = (() => {
    const avg = profileFetchStats.avgMs;
    const max = profileFetchStats.maxMs;
    if (avg == null) return null;
    return Math.max(Math.round(avg * 1.15), max ?? 0);
  })();

  return (
    <div className="profile-view-main">
      {primaryProfileLoader && (
        <LoadingBlock
          messages={PRIMARY_LOADING_MESSAGES}
          caption="Première requête un peu longue ? AniList envoie toutes tes données d'un coup."
          estimatedMs={primaryLoaderEstimateMs}
        />
      )}

      {error && apiDisabled && (
        <div
          className="error-banner error-banner--api-disabled"
          role="status"
          aria-live="polite"
        >
          <strong className="error-banner__title">AniList est momentanément indisponible</strong>
          <span className="error-banner__message">
            L'API d'AniList a répondu qu'elle était désactivée. Ce n'est pas un
            problème de ton côté : réessaie dans quelques minutes.
          </span>
        </div>
      )}

      {error && !apiDisabled && (
        <div className="error-banner" role="alert">
          Erreur : {error}
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && loadingActivities && (
        <div className="activity-loading-line">
          <span className="activity-loading-message-blink">
            {displayActivityLoadingMessage || activityLoadingMessage}
            {activityEtaLabel
              ? ` · reste ~${activityEtaLabel}`
              : activityEtaSeconds === 0
                ? " — finalisation…"
                : ""}
            {rateInfoLabel ? ` · ${rateInfoLabel}` : ""}
          </span>
          <span className="spinner spinner--sm" aria-hidden="true" />
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && activityWarning && !loadingActivities && (
        <div className="activity-warning-row">
          <div className="activity-warning-row__message">{activityWarning}</div>
          <button
            type="button"
            onClick={handleRetryComparisonNow}
            className="btn-outline btn-outline--accent"
          >
            Reessayer la comparaison maintenant
          </button>
          {retryableYears.map((yy) => (
            <button
              key={`retry-year-${yy}`}
              type="button"
              onClick={() => retryYearNow(yy)}
              className="btn-outline btn-outline--neutral"
            >
              Reessayer {yy}
            </button>
          ))}
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && isDevLocal && showDevPanel && (
        <DevPanel
          rateLimitState={rateLimitState}
          proxyCacheStats={proxyCacheStats}
          debugMetricsView={debugMetricsView}
          activityLoadDebug={activityLoadDebug}
          animeEntriesCount={animeEntriesCount}
          mangaEntriesCount={mangaEntriesCount}
          fetchLog={fetchLog}
          onResetMetrics={() => {
            const reset = window.AniListStatDebug?.resetMetrics;
            if (typeof reset === "function") reset();
            const getter = window.AniListStatDebug?.getMetrics;
            if (typeof getter === "function") {
              setDebugMetricsView(getter() as DebugMetricsView);
            }
          }}
          onResetFetchLog={resetFetchLog}
        />
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && (
        <>
          <div className="profile-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab-btn ${tab === t.key ? "active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <PeriodFloatingChip
            years={periodYears}
            year={periodYear}
            month={periodMonth}
            changeYear={periodChangeYear}
            setMonth={periodSetMonth}
          />
          {children}
        </>
      )}
    </div>
  );
}
