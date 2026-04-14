import type { ReactNode } from "react";
import { C } from "../config/constants";

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
  children: ReactNode;
};

export function ProfileViewMain({
  C,
  loaded,
  loading,
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
  children,
}: ProfileViewMainProps) {
  return (
    <div style={{ maxWidth: 1100, margin: "0 auto", padding: "0 24px 60px" }}>
      {(loading || awaitingPrimaryYearActivities) && (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 80,
            minHeight: "min(60vh, 480px)",
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              border: `3px solid ${C.border}`,
              borderTop: `3px solid ${C.accent}`,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <div style={{ color: C.textMuted, marginTop: 16, fontSize: 14 }}>
            Chargement des données AniList...
          </div>
        </div>
      )}

      {error && (
        <div
          style={{
            background: "rgba(229,57,53,0.1)",
            border: `1px solid ${C.red}`,
            borderRadius: "var(--radius-card)",
            padding: "16px 20px",
            marginTop: 24,
            color: C.red,
            fontSize: 14,
            boxShadow: "var(--shadow-card)",
          }}
        >
          Erreur : {error}
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && loadingActivities && (
        <div
          style={{
            marginTop: 24,
            color: C.textMuted,
            fontSize: 13,
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <span className="activity-loading-message-blink">
            {displayActivityLoadingMessage || activityLoadingMessage}
            {activityEtaSeconds != null && activityEtaSeconds > 0
              ? ` ~${activityEtaSeconds}s`
              : activityEtaSeconds === 0
                ? " — finalisation…"
                : ""}
            {rateInfoLabel ? ` · ${rateInfoLabel}` : ""}
          </span>
          <span
            aria-hidden="true"
            style={{
              width: 14,
              height: 14,
              border: `2px solid ${C.border}`,
              borderTop: `2px solid ${C.accent}`,
              borderRadius: "50%",
              animation: "spin 0.8s linear infinite",
            }}
          />
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && activityWarning && !loadingActivities && (
        <div style={{ marginTop: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ color: C.orange, fontSize: 12 }}>{activityWarning}</div>
          <button
            type="button"
            onClick={handleRetryComparisonNow}
            style={{
              background: "transparent",
              color: C.accent,
              border: `1px solid ${C.accent}`,
              borderRadius: "var(--radius-control)",
              padding: "6px 10px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reessayer la comparaison maintenant
          </button>
          {retryableYears.map((yy) => (
            <button
              key={`retry-year-${yy}`}
              type="button"
              onClick={() => retryYearNow(yy)}
              style={{
                background: "transparent",
                color: C.text,
                border: `1px solid ${C.border}`,
                borderRadius: "var(--radius-control)",
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              Reessayer {yy}
            </button>
          ))}
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && isDevLocal && showDevPanel && (
        <div
          style={{
            marginTop: 12,
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: "var(--radius-card)",
            padding: "10px 12px",
            fontSize: 12,
            color: C.textMuted,
            display: "flex",
            flexDirection: "column",
            gap: 10,
            boxShadow: "var(--shadow-card)",
          }}
        >
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", alignItems: "baseline" }}>
            <strong
              style={{
                color: C.text,
                width: "100%",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
              Activités (période & graphiques)
            </strong>
            {activityLoadDebug ? (
              <>
                <span>
                  Années ciblées :{" "}
                  <span style={{ color: C.text }}>{activityLoadDebug.yearsTotal}</span>
                </span>
                <span>
                  Chargées :{" "}
                  <span style={{ color: C.green }}>{activityLoadDebug.yearsComplete}</span>
                </span>
                <span>
                  Restantes :{" "}
                  <span
                    style={{
                      color: activityLoadDebug.yearsPending ? C.orange : C.text,
                    }}
                  >
                    {activityLoadDebug.yearsPending}
                  </span>
                </span>
                <span>
                  Entrées anime en cache :{" "}
                  <span style={{ color: C.text }}>
                    {activityLoadDebug.animeRows.toLocaleString("fr-FR")}
                  </span>
                </span>
                <span>
                  Entrées manga en cache :{" "}
                  <span style={{ color: C.text }}>
                    {activityLoadDebug.mangaRows.toLocaleString("fr-FR")}
                  </span>
                </span>
                <span>
                  File requêtes AniList :{" "}
                  <span style={{ color: C.text }}>{rateLimitState?.queued ?? 0}</span> en attente,{" "}
                  <span style={{ color: C.text }}>{rateLimitState?.inFlight ?? 0}</span> en cours
                </span>
              </>
            ) : (
              <span>—</span>
            )}
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px 16px", fontSize: 11, opacity: 0.92 }}>
            <strong
              style={{
                color: C.textDim,
                width: "100%",
                fontSize: 11,
                letterSpacing: "0.06em",
                textTransform: "uppercase",
              }}
            >
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
            style={{
              alignSelf: "flex-end",
              background: "transparent",
              color: C.accent,
              border: `1px solid ${C.accent}`,
              borderRadius: "var(--radius-chip)",
              padding: "4px 8px",
              fontSize: 11,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Reset metrics
          </button>
        </div>
      )}

      {loaded && !loading && !awaitingPrimaryYearActivities && (
        <>
          <div
            style={{
              display: "flex",
              gap: 4,
              marginTop: 24,
              marginBottom: 24,
              borderBottom: `1px solid ${C.border}`,
              overflowX: "auto",
            }}
          >
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
          {children}
        </>
      )}
    </div>
  );
}
