import type { ReactNode } from "react";
import { C } from "../config/constants";
import { LoadingBlock, PeriodFloatingChip } from "./AppUi";

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
};

type ProxyCacheStatsSlice = {
  hit?: number;
  miss?: number;
  bypass?: number;
};

type DebugMetricsView = {
  cacheHit?: number;
  cacheMiss?: number;
  cacheWrite?: number;
  rateLimitErrors?: number;
  avgProfileFetchMs?: number;
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
  displayActivityLoadingMessage: string;
  activityLoadingMessage: string;
  activityEtaSeconds: number | null;
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
  displayActivityLoadingMessage,
  activityLoadingMessage,
  activityEtaSeconds,
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
  return (
    <div className="profile-view-main">
      {primaryProfileLoader && (
        <LoadingBlock
          messages={PRIMARY_LOADING_MESSAGES}
          caption="Première requête un peu longue ? AniList envoie toutes tes données d'un coup."
        />
      )}

      {error && (
        <div className="error-banner">
          Erreur : {error}
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && loadingActivities && (
        <div className="activity-loading-line">
          <span className="activity-loading-message-blink">
            {displayActivityLoadingMessage || activityLoadingMessage}
            {activityEtaSeconds != null && activityEtaSeconds > 0
              ? ` ~${activityEtaSeconds}s`
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
        <div className="dev-panel">
          <div className="dev-panel__row">
            <strong className="dev-panel__heading">
              Activités (période & graphiques)
            </strong>
            {activityLoadDebug ? (
              <>
                <span>
                  Années ciblées :{" "}
                  <span className="dev-panel__value">{activityLoadDebug.yearsTotal}</span>
                </span>
                <span>
                  Chargées :{" "}
                  <span className="dev-panel__value--success">{activityLoadDebug.yearsComplete}</span>
                </span>
                <span>
                  Restantes :{" "}
                  <span
                    className={
                      activityLoadDebug.yearsPending
                        ? "dev-panel__value--warning"
                        : "dev-panel__value"
                    }
                  >
                    {activityLoadDebug.yearsPending}
                  </span>
                </span>
                <span>
                  Entrées anime en cache :{" "}
                  <span className="dev-panel__value">
                    {activityLoadDebug.animeRows.toLocaleString("fr-FR")}
                  </span>
                </span>
                <span>
                  Entrées manga en cache :{" "}
                  <span className="dev-panel__value">
                    {activityLoadDebug.mangaRows.toLocaleString("fr-FR")}
                  </span>
                </span>
                <span>
                  File requêtes AniList :{" "}
                  <span className="dev-panel__value">{rateLimitState?.queued ?? 0}</span> en attente,{" "}
                  <span className="dev-panel__value">{rateLimitState?.inFlight ?? 0}</span> en cours
                </span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
          <div className="dev-panel__row dev-panel__row--secondary">
            <strong className="dev-panel__heading dev-panel__heading--dim">
              Cache profil & proxy (détail)
            </strong>
            <span>
              profil hit/miss/write : {debugMetricsView?.cacheHit ?? 0} / {debugMetricsView?.cacheMiss ?? 0} /{" "}
              {debugMetricsView?.cacheWrite ?? 0}
            </span>
            <span>rate-limit : {debugMetricsView?.rateLimitErrors ?? 0}</span>
            <span>profil fetch moy. : {debugMetricsView?.avgProfileFetchMs ?? 0} ms</span>
            <span>
              proxy hit/miss/bypass : {proxyCacheStats?.hit ?? 0} / {proxyCacheStats?.miss ?? 0} /{" "}
              {proxyCacheStats?.bypass ?? 0}
            </span>
          </div>
          <button
            type="button"
            onClick={() => {
              const reset = window.AniListStatDebug?.resetMetrics;
              if (typeof reset === "function") reset();
              const getter = window.AniListStatDebug?.getMetrics;
              if (typeof getter === "function") {
                setDebugMetricsView(getter() as DebugMetricsView);
              }
            }}
            className="btn-outline btn-outline--accent btn-outline--compact dev-panel__reset"
          >
            Reset metrics
          </button>
        </div>
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
