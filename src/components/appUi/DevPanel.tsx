import { useEffect, useMemo, useState } from "react";
import type { FetchLogEntry } from "../../api/anilistClient";
import {
  getActivityFetchStats,
  subscribeActivityFetchStats,
  type ActivityFetchStats,
} from "../../lib/activityFetchStats";

/**
 * Panneau de debug affiché en développement local (gated par `IS_DEV_LOCAL`
 * côté appelant). Il regroupe toutes les informations techniques utiles
 * pour comprendre le comportement du fetcher AniList :
 *
 *  - État en direct du rate-limit (limite observée, intervalle dynamique,
 *    file d'attente du scheduler, blocages).
 *  - Volume de données actuellement chargées en mémoire.
 *  - Efficacité du cache Supabase / mémoire et du cache proxy
 *    (Vercel / Upstash).
 *  - Journal détaillé des dernières requêtes : durée, taille du payload,
 *    statut HTTP, cache HIT/MISS, variables passées.
 *
 * Chaque ligne est accompagnée d'un `title` explicatif au survol pour que
 * la lecture ne dépende pas de la connaissance interne du code.
 */

export type DevPanelRateLimitState = {
  queued?: number;
  inFlight?: number;
  blockedForMs?: number;
  estimatedWaitMs?: number;
  rateLimit?: number | null;
  rateRemaining?: number | null;
  rateResetAt?: number | null;
  requestIntervalMs?: number;
};

export type DevPanelProxyCacheStats = {
  hit?: number;
  miss?: number;
  bypass?: number;
  unknown?: number;
  policy?: Record<string, number>;
};

export type DevPanelDebugMetrics = {
  cacheHit?: number;
  cacheMiss?: number;
  cacheWrite?: number;
  rateLimitErrors?: number;
  avgProfileFetchMs?: number;
  profileFetchCount?: number;
};

export type DevPanelActivityLoad = {
  yearsTotal: number;
  yearsComplete: number;
  yearsPending: number;
  animeRows: number;
  mangaRows: number;
};

export type DevPanelProps = {
  rateLimitState: DevPanelRateLimitState | null | undefined;
  proxyCacheStats: DevPanelProxyCacheStats | null | undefined;
  debugMetricsView: DevPanelDebugMetrics | null | undefined;
  activityLoadDebug: DevPanelActivityLoad | null;
  animeEntriesCount: number;
  mangaEntriesCount: number;
  fetchLog: readonly FetchLogEntry[];
  onResetMetrics: () => void;
  onResetFetchLog: () => void;
};

/** Format heure « HH:MM:SS » à partir d'un timestamp epoch ms. */
function formatTimeOfDay(ms: number): string {
  const d = new Date(ms);
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

/** Format lisible d'une durée en ms : 450 ms, 1,2 s, 12,0 s. */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  const secs = ms / 1000;
  return `${secs.toFixed(secs >= 10 ? 0 : 1)} s`;
}

/** Taille lisible (o, ko, Mo) à partir d'un nombre d'octets. */
function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes === undefined) return "—";
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} ko`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} Mo`;
}

/** Pourcentage entier (sans décimale) ou « — » si dénominateur nul. */
function formatPercent(num: number, denom: number): string {
  if (!denom) return "—";
  return `${Math.round((num / denom) * 100)} %`;
}

export function DevPanel({
  rateLimitState,
  proxyCacheStats,
  debugMetricsView,
  activityLoadDebug,
  animeEntriesCount,
  mangaEntriesCount,
  fetchLog,
  onResetMetrics,
  onResetFetchLog,
}: DevPanelProps) {
  /**
   * Statistiques observées par `activityFetchStats` : durée moyenne /
   * maximale / dernière mesure pour une année d'activité chargée. Mis à
   * jour à chaque nouvel échantillon (cf. `recordActivityYearSample`).
   */
  const [activityStats, setActivityStats] = useState<ActivityFetchStats>(() =>
    getActivityFetchStats()
  );
  useEffect(() => {
    const unsubscribe = subscribeActivityFetchStats(() => {
      setActivityStats(getActivityFetchStats());
    });
    return () => {
      unsubscribe();
    };
  }, []);

  /**
   * Agrégats dérivés du journal de requêtes : nombre total, durée moyenne,
   * durée maximale, volume total transféré, taux d'échec. Recalculés en
   * mémo sur la dépendance `fetchLog` (évite de refaire la passe à chaque
   * render si seul l'état du scheduler change).
   */
  const fetchLogAggregates = useMemo(() => {
    if (!fetchLog || fetchLog.length === 0) {
      return { count: 0, avgMs: 0, maxMs: 0, totalBytes: 0, errors: 0, aborted: 0 };
    }
    let totalMs = 0;
    let maxMs = 0;
    let totalBytes = 0;
    let errors = 0;
    let aborted = 0;
    for (const entry of fetchLog) {
      totalMs += entry.durationMs;
      if (entry.durationMs > maxMs) maxMs = entry.durationMs;
      if (entry.responseBytes) totalBytes += entry.responseBytes;
      if (entry.outcome === "error") errors += 1;
      else if (entry.outcome === "aborted") aborted += 1;
    }
    return {
      count: fetchLog.length,
      avgMs: totalMs / fetchLog.length,
      maxMs,
      totalBytes,
      errors,
      aborted,
    };
  }, [fetchLog]);

  /*
   * Tri du journal du plus récent au plus ancien : on lit toujours les
   * dernières opérations en premier quand on inspecte un bug en cours.
   */
  const fetchLogReversed = useMemo(
    () => [...fetchLog].reverse(),
    [fetchLog]
  );

  const blockedForMs = rateLimitState?.blockedForMs ?? 0;
  const queued = rateLimitState?.queued ?? 0;
  const inFlight = rateLimitState?.inFlight ?? 0;
  const rateLimit = rateLimitState?.rateLimit;
  const rateRemaining = rateLimitState?.rateRemaining;
  const requestIntervalMs = rateLimitState?.requestIntervalMs;

  const proxyHit = proxyCacheStats?.hit ?? 0;
  const proxyMiss = proxyCacheStats?.miss ?? 0;
  const proxyBypass = proxyCacheStats?.bypass ?? 0;
  const proxyTotal = proxyHit + proxyMiss + proxyBypass;

  const cacheHit = debugMetricsView?.cacheHit ?? 0;
  const cacheMiss = debugMetricsView?.cacheMiss ?? 0;
  const cacheWrite = debugMetricsView?.cacheWrite ?? 0;
  const cacheTotal = cacheHit + cacheMiss;

  return (
    <div className="dev-panel">
      <header className="dev-panel__header">
        <strong className="dev-panel__title">Panneau debug</strong>
        <div className="dev-panel__header-actions">
          <button
            type="button"
            onClick={onResetMetrics}
            className="btn-outline btn-outline--neutral btn-outline--compact"
            title="Remet à zéro les compteurs cumulés (cache hit/miss/write, rate-limit, durée moyenne)."
          >
            Reset compteurs
          </button>
          <button
            type="button"
            onClick={onResetFetchLog}
            className="btn-outline btn-outline--neutral btn-outline--compact"
            title="Vide le journal des dernières requêtes."
          >
            Vider journal
          </button>
        </div>
      </header>

      {/* Section 1 : état live du scheduler / rate-limit */}
      <section className="dev-panel__section">
        <h4 className="dev-panel__section-title">État AniList (temps réel)</h4>
        <dl className="dev-panel__grid">
          <div
            className="dev-panel__kv"
            title="Limite officielle annoncée par AniList dans le header X-RateLimit-Limit (30/min en API dégradée, 90/min en mode normal)."
          >
            <dt>Limite observée</dt>
            <dd>
              {rateLimit != null ? (
                <span className="dev-panel__value">{rateLimit} req/min</span>
              ) : (
                <span className="dev-panel__value--dim">inconnue</span>
              )}
            </dd>
          </div>
          <div
            className="dev-panel__kv"
            title="Intervalle minimal entre deux requêtes AniList, calculé dynamiquement à partir de la limite observée. Plus la limite est haute, plus l'intervalle diminue."
          >
            <dt>Intervalle courant</dt>
            <dd>
              <span className="dev-panel__value">
                {requestIntervalMs != null ? `${requestIntervalMs} ms` : "—"}
              </span>
            </dd>
          </div>
          <div
            className="dev-panel__kv"
            title="Requêtes dans ce batch AniList qui n'ont pas encore été envoyées (elles attendent que l'intervalle minimum soit écoulé)."
          >
            <dt>File d'attente</dt>
            <dd>
              <span className={queued > 0 ? "dev-panel__value--warning" : "dev-panel__value"}>
                {queued}
              </span>{" "}
              en attente ·{" "}
              <span className="dev-panel__value">{inFlight}</span> en cours
            </dd>
          </div>
          <div
            className="dev-panel__kv"
            title="Requêtes restantes autorisées dans la fenêtre glissante courante (header X-RateLimit-Remaining). 0 déclenche un blocage jusqu'au reset."
          >
            <dt>Quota restant</dt>
            <dd>
              {rateRemaining != null ? (
                <span
                  className={
                    rateRemaining <= 3
                      ? "dev-panel__value--warning"
                      : "dev-panel__value"
                  }
                >
                  {rateRemaining}
                </span>
              ) : (
                <span className="dev-panel__value--dim">—</span>
              )}
            </dd>
          </div>
          <div
            className="dev-panel__kv"
            title="Si AniList a renvoyé un 429 ou remaining=0, on bloque le scheduler jusqu'à cette échéance. 0 ms = pas de blocage en cours."
          >
            <dt>Blocage scheduler</dt>
            <dd>
              <span
                className={
                  blockedForMs > 0 ? "dev-panel__value--warning" : "dev-panel__value--success"
                }
              >
                {blockedForMs > 0 ? formatDuration(blockedForMs) : "aucun"}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {/* Section 2 : données chargées en mémoire */}
      <section className="dev-panel__section">
        <h4 className="dev-panel__section-title">Données en mémoire</h4>
        <dl className="dev-panel__grid">
          <div
            className="dev-panel__kv"
            title="Nombre total d'entrées anime (toutes listes confondues) chargées en RAM pour ce profil."
          >
            <dt>Anime chargés</dt>
            <dd>
              <span className="dev-panel__value">
                {animeEntriesCount.toLocaleString("fr-FR")}
              </span>
            </dd>
          </div>
          <div
            className="dev-panel__kv"
            title="Nombre total d'entrées manga (toutes listes confondues) chargées en RAM pour ce profil."
          >
            <dt>Manga chargés</dt>
            <dd>
              <span className="dev-panel__value">
                {mangaEntriesCount.toLocaleString("fr-FR")}
              </span>
            </dd>
          </div>
          {activityLoadDebug ? (
            <>
              <div
                className="dev-panel__kv"
                title="Années d'activités nécessaires pour la période sélectionnée (année courante + année précédente pour les comparaisons)."
              >
                <dt>Années activités</dt>
                <dd>
                  <span className="dev-panel__value--success">
                    {activityLoadDebug.yearsComplete}
                  </span>
                  {" / "}
                  <span className="dev-panel__value">{activityLoadDebug.yearsTotal}</span>
                  {activityLoadDebug.yearsPending > 0 && (
                    <>
                      {" · "}
                      <span className="dev-panel__value--warning">
                        {activityLoadDebug.yearsPending} en attente
                      </span>
                    </>
                  )}
                </dd>
              </div>
              <div
                className="dev-panel__kv"
                title="Nombre d'activités individuelles (épisodes marqués, chapitres lus, changements de statut) en cache pour la période chargée."
              >
                <dt>Activités anime</dt>
                <dd>
                  <span className="dev-panel__value">
                    {activityLoadDebug.animeRows.toLocaleString("fr-FR")}
                  </span>
                </dd>
              </div>
              <div
                className="dev-panel__kv"
                title="Idem pour les activités manga (chapitres lus, volumes complétés…)."
              >
                <dt>Activités manga</dt>
                <dd>
                  <span className="dev-panel__value">
                    {activityLoadDebug.mangaRows.toLocaleString("fr-FR")}
                  </span>
                </dd>
              </div>
            </>
          ) : null}
          <div
            className="dev-panel__kv"
            title="Durée moyenne observée pour charger une année entière d'activités (anime + manga) lors de la session courante. Cette valeur alimente l'ETA affiché pendant le chargement."
          >
            <dt>Temps / année (moy.)</dt>
            <dd>
              {activityStats.avgYearDurationMs != null ? (
                <>
                  <span className="dev-panel__value">
                    {formatDuration(activityStats.avgYearDurationMs)}
                  </span>
                  {activityStats.maxYearDurationMs != null &&
                  activityStats.maxYearDurationMs > activityStats.avgYearDurationMs ? (
                    <span className="dev-panel__value--dim">
                      {" "}
                      (max {formatDuration(activityStats.maxYearDurationMs)})
                    </span>
                  ) : null}
                  <span className="dev-panel__value--dim">
                    {" · "}
                    {activityStats.samples} échantillon
                    {activityStats.samples > 1 ? "s" : ""}
                  </span>
                </>
              ) : (
                <span className="dev-panel__value--dim">
                  —{" "}
                  <span title="Aucune année n'a encore été chargée dans la session. L'ETA affiché se base sur l'heuristique rate-limit.">
                    pas encore mesuré
                  </span>
                </span>
              )}
            </dd>
          </div>
          {activityStats.lastYearDurationMs != null && (
            <div
              className="dev-panel__kv"
              title="Durée de la dernière année chargée. Utile pour voir si les chargements accélèrent (cache proxy chaud) ou ralentissent (rate-limit qui se resserre)."
            >
              <dt>Dernière année chargée</dt>
              <dd>
                <span className="dev-panel__value">
                  {formatDuration(activityStats.lastYearDurationMs)}
                </span>
              </dd>
            </div>
          )}
        </dl>
      </section>

      {/* Section 3 : cache applicatif */}
      <section className="dev-panel__section">
        <h4 className="dev-panel__section-title">Cache Supabase / mémoire</h4>
        <dl className="dev-panel__grid">
          <div
            className="dev-panel__kv"
            title="Nombre d'accès servis depuis Supabase ou la mémoire de session, de miss nécessitant AniList, et d'écritures vers la source de vérité."
          >
            <dt>Hit / Miss / Write</dt>
            <dd>
              <span className="dev-panel__value--success">{cacheHit}</span>
              {" / "}
              <span className="dev-panel__value">{cacheMiss}</span>
              {" / "}
              <span className="dev-panel__value">{cacheWrite}</span>
              {cacheTotal > 0 && (
                <span className="dev-panel__value--dim">
                  {" "}
                  (hit rate : {formatPercent(cacheHit, cacheTotal)})
                </span>
              )}
            </dd>
          </div>
          <div
            className="dev-panel__kv"
            title="Temps moyen pour récupérer un profil complet (USER_QUERY + MEDIA_LIST ANIME + MEDIA_LIST MANGA) depuis qu'on a lancé le fetch jusqu'à la réponse."
          >
            <dt>Durée moyenne fetch profil</dt>
            <dd>
              <span className="dev-panel__value">
                {formatDuration(debugMetricsView?.avgProfileFetchMs ?? 0)}
              </span>
              {debugMetricsView?.profileFetchCount ? (
                <span className="dev-panel__value--dim">
                  {" "}
                  sur {debugMetricsView.profileFetchCount} fetch
                  {debugMetricsView.profileFetchCount > 1 ? "s" : ""}
                </span>
              ) : null}
            </dd>
          </div>
          <div
            className="dev-panel__kv"
            title="Nombre de requêtes qui ont été rejetées ou reportées à cause d'un 429 (rate-limit AniList) depuis le dernier reset."
          >
            <dt>Erreurs rate-limit</dt>
            <dd>
              <span
                className={
                  (debugMetricsView?.rateLimitErrors ?? 0) > 0
                    ? "dev-panel__value--warning"
                    : "dev-panel__value--success"
                }
              >
                {debugMetricsView?.rateLimitErrors ?? 0}
              </span>
            </dd>
          </div>
        </dl>
      </section>

      {/* Section 4 : cache proxy Vercel */}
      <section className="dev-panel__section">
        <h4 className="dev-panel__section-title">Cache proxy (Vercel + Upstash)</h4>
        <dl className="dev-panel__grid">
          <div
            className="dev-panel__kv"
            title="HIT : servi par le proxy sans appeler AniList. MISS : requête transmise à AniList puis mise en cache. BYPASS : requête non cacheable (mutation ou payload inconnu)."
          >
            <dt>HIT / MISS / BYPASS</dt>
            <dd>
              <span className="dev-panel__value--success">{proxyHit}</span>
              {" / "}
              <span className="dev-panel__value">{proxyMiss}</span>
              {" / "}
              <span className="dev-panel__value--dim">{proxyBypass}</span>
              {proxyTotal > 0 && (
                <span className="dev-panel__value--dim">
                  {" "}
                  (hit rate : {formatPercent(proxyHit, proxyTotal)})
                </span>
              )}
            </dd>
          </div>
          {proxyCacheStats?.policy && Object.keys(proxyCacheStats.policy).length > 0 ? (
            <div
              className="dev-panel__kv"
              title="Répartition des requêtes par politique de cache côté proxy (user-medium = 15 min, list-medium = 10 min, activity-short = 2 min, etc.)."
            >
              <dt>Politiques</dt>
              <dd>
                {Object.entries(proxyCacheStats.policy)
                  .sort((a, b) => b[1] - a[1])
                  .map(([label, count], idx, arr) => (
                    <span key={label}>
                      <span className="dev-panel__value">{label}</span>
                      {" : "}
                      <span className="dev-panel__value">{count}</span>
                      {idx < arr.length - 1 ? " · " : ""}
                    </span>
                  ))}
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      {/* Section 5 : journal des requêtes */}
      <section className="dev-panel__section">
        <h4 className="dev-panel__section-title">
          Journal des requêtes
          <span className="dev-panel__section-hint">
            — durée, taille et cache de chaque appel GraphQL (les {fetchLog.length} dernier
            {fetchLog.length > 1 ? "s" : ""})
          </span>
        </h4>

        {fetchLogAggregates.count > 0 ? (
          <>
            <div className="dev-panel__summary">
              <span
                title="Nombre total de requêtes enregistrées dans le journal (buffer circulaire de 80 max)."
              >
                <strong>{fetchLogAggregates.count}</strong> requête
                {fetchLogAggregates.count > 1 ? "s" : ""}
              </span>
              <span title="Durée moyenne d'une requête, incluant l'attente dans le scheduler.">
                moy. <strong>{formatDuration(fetchLogAggregates.avgMs)}</strong>
              </span>
              <span title="Durée de la requête la plus lente du journal.">
                max <strong>{formatDuration(fetchLogAggregates.maxMs)}</strong>
              </span>
              <span title="Volume total des réponses brutes (JSON) reçues d'AniList.">
                total téléchargé <strong>{formatBytes(fetchLogAggregates.totalBytes)}</strong>
              </span>
              {fetchLogAggregates.errors > 0 ? (
                <span
                  className="dev-panel__value--warning"
                  title="Nombre de requêtes qui se sont terminées en erreur (hors 429 qui sont retentées automatiquement)."
                >
                  erreurs <strong>{fetchLogAggregates.errors}</strong>
                </span>
              ) : null}
              {fetchLogAggregates.aborted > 0 ? (
                <span
                  className="dev-panel__value--dim"
                  title="Requêtes annulées par un AbortController (changement de profil, démontage du composant…). Comportement normal."
                >
                  annulées <strong>{fetchLogAggregates.aborted}</strong>
                </span>
              ) : null}
            </div>

            <div className="dev-panel__tablewrap" role="region" aria-label="Journal des requêtes">
              <table className="dev-panel__table">
                <thead>
                  <tr>
                    <th title="Heure d'émission de la requête (heure locale).">Heure</th>
                    <th title="Nom de l'opération GraphQL (ex. UserProfile, MediaList, ListActivities).">
                      Opération
                    </th>
                    <th title="Variables passées à la query (tronquées si trop longues).">Variables</th>
                    <th title="Durée totale jusqu'à la réception de la réponse complète.">Durée</th>
                    <th title="Taille du body JSON reçu du proxy.">Taille</th>
                    <th title="HIT = servi par le cache proxy ; MISS = requête transmise à AniList ; BYPASS = non cacheable.">
                      Cache
                    </th>
                    <th title="Statut HTTP (200 = OK, 429 = rate-limit, 5xx = serveur AniList en erreur).">
                      Statut
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {fetchLogReversed.map((entry) => {
                    const rowClass =
                      entry.outcome === "error"
                        ? "dev-panel__table-row--error"
                        : entry.outcome === "aborted"
                          ? "dev-panel__table-row--aborted"
                          : "";
                    const cacheClass =
                      entry.proxyCache === "HIT"
                        ? "dev-panel__value--success"
                        : entry.proxyCache === "MISS"
                          ? "dev-panel__value"
                          : "dev-panel__value--dim";
                    const durationClass =
                      entry.durationMs >= 5000
                        ? "dev-panel__value--warning"
                        : entry.durationMs >= 2000
                          ? "dev-panel__value"
                          : "dev-panel__value--success";
                    return (
                      <tr key={entry.id} className={rowClass}>
                        <td className="dev-panel__table-cell--time">
                          {formatTimeOfDay(entry.startedAt)}
                        </td>
                        <td>
                          <span className="dev-panel__value">{entry.operationName}</span>
                          {entry.retries > 0 ? (
                            <span
                              className="dev-panel__value--warning"
                              title={`${entry.retries} tentative(s) supplémentaire(s) avant succès/échec.`}
                            >
                              {" "}
                              ×{entry.retries + 1}
                            </span>
                          ) : null}
                        </td>
                        <td
                          className="dev-panel__table-cell--vars"
                          title={entry.variablesSummary}
                        >
                          {entry.variablesSummary}
                        </td>
                        <td>
                          <span className={durationClass}>
                            {formatDuration(entry.durationMs)}
                          </span>
                        </td>
                        <td>{formatBytes(entry.responseBytes)}</td>
                        <td>
                          <span className={cacheClass}>{entry.proxyCache ?? "—"}</span>
                          {entry.proxyPolicy ? (
                            <span
                              className="dev-panel__value--dim"
                              title={`Politique de cache appliquée par le proxy : ${entry.proxyPolicy}`}
                            >
                              {" "}
                              ({entry.proxyPolicy})
                            </span>
                          ) : null}
                        </td>
                        <td>
                          {entry.outcome === "success" ? (
                            <span className="dev-panel__value--success">
                              {entry.httpStatus ?? "200"}
                            </span>
                          ) : entry.outcome === "aborted" ? (
                            <span
                              className="dev-panel__value--dim"
                              title="Requête annulée par l'utilisateur ou un changement de profil."
                            >
                              annulée
                            </span>
                          ) : (
                            <span
                              className="dev-panel__value--warning"
                              title={entry.errorMessage ?? "Erreur inconnue"}
                            >
                              {entry.httpStatus ?? "err"}
                            </span>
                          )}
                          {entry.rateLimitRemaining != null ? (
                            <span
                              className="dev-panel__value--dim"
                              title="Valeur du header X-RateLimit-Remaining à l'instant de cette réponse."
                            >
                              {" · "}q{entry.rateLimitRemaining}
                            </span>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : (
          <p className="dev-panel__empty">
            Aucune requête enregistrée pour le moment. Le journal se remplit au fil des fetchs.
          </p>
        )}
      </section>
    </div>
  );
}
