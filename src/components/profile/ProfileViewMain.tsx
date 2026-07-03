import { useEffect, useMemo, useState, type ReactNode } from "react";
import { C } from "../../config/constants";
import { DevPanel, LoadingBlock, PeriodFloatingChip } from "../ui";
import type { FetchLogEntry } from "../../api/anilistClient";
import {
  getProfileFetchStats,
  subscribeProfileFetchStats,
  type ProfileFetchStats,
} from "../../lib/profileFetchStats";
import { useProfilePeriod } from "../../contexts/profilePeriodCore";
import { useT } from "../../i18n/I18n";

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

type DeltaAuditPayload = {
  anime: {
    totalDelta: number;
    rows: Array<{
      activityId: number | null;
      mediaId: number;
      createdAt: number;
      progressRaw: unknown;
      status: unknown;
      prev: number;
      current: number;
      delta: number;
      rule: string;
    }>;
  };
  manga: {
    totalDelta: number;
    rows: Array<{
      activityId: number | null;
      mediaId: number;
      createdAt: number;
      progressRaw: unknown;
      status: unknown;
      prev: number;
      current: number;
      delta: number;
      rule: string;
    }>;
  };
} | null;

export type ProfileTabDef = { key: string; label: string; className?: string };

export type ProfileViewMainProps = {
  C: typeof C;
  loaded: boolean;
  loading: boolean;
  /** Spinner principal : chargement profil, activités année, ou zone morte (ex. Strict Mode). */
  primaryProfileLoader: boolean;
  awaitingPrimaryYearActivities: boolean;
  awaitingAllTimeActivities?: boolean;
  hasProvisionalAllTimeActivities?: boolean;
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
  deltaAudit?: DeltaAuditPayload;
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
  children: ReactNode;
};

export function ProfileViewMain({
  loaded,
  loading,
  primaryProfileLoader,
  awaitingAllTimeActivities = false,
  hasProvisionalAllTimeActivities = false,
  loadingActivities,
  error,
  apiDisabled = false,
  displayActivityLoadingMessage,
  activityLoadingMessage,
  activityEtaSeconds,
  activityEtaLabel,
  rateInfoLabel,
  activityWarning,
  deltaAudit = null,
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
  children,
}: ProfileViewMainProps) {
  const { tab, setTab } = useProfilePeriod();
  const t = useT();
  /**
   * Messages narratifs pour le loader principal : un enchaînement court qui
   * raconte ce que fait l'app pendant les quelques secondes où on attend la
   * réponse d'AniList. Chaque message s'affiche ~2,2 s avant de passer au suivant.
   */
  const primaryLoadingMessages = useMemo(
    () => [
      t("Connexion à AniList…", "Connecting to AniList…"),
      t("Récupération de ton profil…", "Fetching your profile…"),
      t("On rassemble tes anime…", "Gathering your anime…"),
      t("On compile tes manga…", "Compiling your manga…"),
      t("Analyse de tes notes…", "Analyzing your scores…"),
      t("Préparation du tableau de bord…", "Preparing the dashboard…"),
    ],
    [t]
  );
  const allTimeLoadingMessages = useMemo(
    () => [
      t("Connexion à AniList…", "Connecting to AniList…"),
      t("Chargement complet de ton historique…", "Loading your full history…"),
      t("On parcourt toutes tes activités anime…", "Going through all your anime activity…"),
      t("On parcourt toutes tes activités manga…", "Going through all your manga activity…"),
      t("Compilation des statistiques All Time…", "Compiling All Time statistics…"),
      t("Préparation du tableau de bord…", "Preparing the dashboard…"),
    ],
    [t]
  );
  /**
   * Stats de session des derniers fetchs profil complets.
   * Sert à projeter un ETA « reste ~Xs » dans le loader
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
          messages={awaitingAllTimeActivities ? allTimeLoadingMessages : primaryLoadingMessages}
          caption={
            awaitingAllTimeActivities
              ? t(
                  "All Time peut être long : AniList envoie tout l'historique d'activités.",
                  "All Time can take a while: AniList sends the entire activity history."
                )
              : t(
                  "Première requête un peu longue ? AniList envoie toutes tes données d'un coup.",
                  "First request a bit slow? AniList sends all your data at once."
                )
          }
          estimatedMs={primaryLoaderEstimateMs}
        />
      )}

      {error && apiDisabled && (
        <div
          className="error-banner error-banner--api-disabled"
          role="status"
          aria-live="polite"
        >
          <strong className="error-banner__title">
            {t("AniList est momentanément indisponible", "AniList is temporarily unavailable")}
          </strong>
          <span className="error-banner__message">
            {t(
              "L'API d'AniList a répondu qu'elle était désactivée. Ce n'est pas un problème de ton côté : réessaie dans quelques minutes.",
              "The AniList API reported that it is disabled. This isn't a problem on your end: try again in a few minutes."
            )}
          </span>
        </div>
      )}

      {error && !apiDisabled && (
        <div className="error-banner" role="alert">
          {t("Erreur", "Error")} : {error}
        </div>
      )}

      {loaded && !loading && loadingActivities && (
        <div className="activity-loading-line">
          <span className="activity-loading-message-blink">
            {hasProvisionalAllTimeActivities
              ? t(
                  "All Time provisoire affiche : AniList consolide encore l'historique complet en arriere-plan",
                  "Showing provisional All Time: AniList is still consolidating the full history in the background"
                )
              : displayActivityLoadingMessage || activityLoadingMessage}
            {activityEtaLabel
              ? ` · ${t("reste", "left")} ~${activityEtaLabel}`
              : activityEtaSeconds === 0
                ? t(" — finalisation…", " — finalizing…")
                : ""}
            {rateInfoLabel ? ` · ${rateInfoLabel}` : ""}
          </span>
          <span className="spinner spinner--sm" aria-hidden="true" />
        </div>
      )}

      {loaded && !loading && activityWarning && !loadingActivities && (
        <div className="activity-warning-row">
          <div className="activity-warning-row__message">{activityWarning}</div>
          <button
            type="button"
            onClick={handleRetryComparisonNow}
            className="btn-outline btn-outline--accent"
          >
            {t("Reessayer la comparaison maintenant", "Retry comparison now")}
          </button>
          {retryableYears.map((yy) => (
            <button
              key={`retry-year-${yy}`}
              type="button"
              onClick={() => retryYearNow(yy)}
              className="btn-outline btn-outline--neutral"
            >
              {t("Reessayer", "Retry")} {yy}
            </button>
          ))}
        </div>
      )}

      {loaded && !loading && isDevLocal && showDevPanel && (
        <DevPanel
          rateLimitState={rateLimitState}
          proxyCacheStats={proxyCacheStats}
          debugMetricsView={debugMetricsView}
          activityLoadDebug={activityLoadDebug}
          animeEntriesCount={animeEntriesCount}
          mangaEntriesCount={mangaEntriesCount}
          fetchLog={fetchLog}
          deltaAudit={deltaAudit}
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

      {loaded && !loading && (
        <>
          <div className="profile-tabs">
            {tabs.map((t) => (
              <button
                key={t.key}
                type="button"
                className={`tab-btn${t.className ? ` ${t.className}` : ""}${tab === t.key ? " active" : ""}`}
                onClick={() => setTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          {tab !== "wrapped" ? <PeriodFloatingChip /> : null}
          {children}
        </>
      )}
    </div>
  );
}
