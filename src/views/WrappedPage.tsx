import { useRef, useState, type ReactNode } from "react";
import type {
  WrappedSummary,
  WrappedMedia,
  WrappedStatusSummary,
  WrappedTimelinePair,
  WrappedGenreRow,
} from "../lib/wrapped";
import { fmtMin } from "../lib/stats";
import { StatIcon } from "../components/ui/StatPrimitives";
import { C } from "../config/constants";
import { WrappedMonthlyCompareChart } from "../components/charts/WrappedActivityChart";
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type WrappedPageProps = {
  summary: WrappedSummary;
};

function formatScore(value: number | null): string {
  return value != null ? value.toFixed(1) : "—";
}

function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function safeFilePart(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/gi, "_")
    .replace(/^_+|_+$/g, "") || "anistat";
}

/** Ratio pour un rendu net sans agrandir la zone capturée. */
const WRAPPED_EXPORT_PIXEL_RATIO = 3;

function coverAlt(title: string): string {
  return `Cover ${title}`;
}

function WrappedProfileHeader({ summary }: { summary: WrappedSummary }) {
  return (
    <header className="wrapped-card__header">
      <div className="wrapped-card__banner">
        {summary.bannerImage ? (
          <img src={summary.bannerImage} alt="" className="wrapped-card__banner-img" />
        ) : (
          <div className="wrapped-card__banner-fallback" aria-hidden />
        )}
        <div className="wrapped-card__banner-fade" aria-hidden />
        <div className="wrapped-card__banner-overlay">
          <div className="wrapped-card__profile-block">
            {summary.avatarUrl ? (
              <img src={summary.avatarUrl} alt="" className="wrapped-card__avatar" />
            ) : (
              <div className="wrapped-card__avatar wrapped-card__avatar--fallback" aria-hidden />
            )}
            <span className="wrapped-card__username">{summary.userName}</span>
          </div>
          <p className="wrapped-card__signature">AniStat Wrapped {summary.year}</p>
        </div>
      </div>
    </header>
  );
}

function WrappedSectionTitle({ children }: { children: ReactNode }) {
  return <h3 className="wrapped-section-title">{children}</h3>;
}

function WrappedTopPanel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={["wrapped-bento-col", className].filter(Boolean).join(" ")}>
      <WrappedSectionTitle>{title}</WrappedSectionTitle>
      <div className="wrapped-bento-box wrapped-bento-box--panel">{children}</div>
    </div>
  );
}

function WrappedStat({
  icon,
  value,
  label,
  status,
  currentLabel,
}: {
  icon: string;
  value: ReactNode;
  label: string;
  status?: WrappedStatusSummary;
  currentLabel?: string;
}) {
  return (
    <div className="wrapped-overview-stat">
      <div className="wrapped-overview-stat__bubble">
        <StatIcon name={icon} />
      </div>
      <div className="wrapped-overview-stat__text">
        <div className="wrapped-overview-stat__value-row">
          <strong className="wrapped-overview-stat__value" style={{ color: C.accent }}>
            {value}
          </strong>
          {status ? (
            <span className="wrapped-status-row" aria-label={`${label} par statut`}>
              <span className="wrapped-status-chip wrapped-status-chip--completed">
                <span className="wrapped-status-chip__dot" aria-hidden />
                {status.completed} terminés
              </span>
              <span className="wrapped-status-chip wrapped-status-chip--current">
                <span className="wrapped-status-chip__dot" aria-hidden />
                {status.current} {currentLabel || "en cours"}
              </span>
              <span className="wrapped-status-chip wrapped-status-chip--dropped">
                <span className="wrapped-status-chip__dot" aria-hidden />
                {status.dropped} drop
              </span>
            </span>
          ) : null}
        </div>
        <span className="wrapped-overview-stat__label">{label}</span>
      </div>
    </div>
  );
}

/** Top 5 horizontal : rangs 1→5, grandes covers uniquement. */
function WrappedTopRow({ items, emptyLabel }: { items: WrappedMedia[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="wrapped-bento-box__empty">{emptyLabel}</p>;
  }
  return (
    <ol className="wrapped-top-row">
      {items.map((media, index) => (
        <li key={media.id} className="wrapped-top-row__item">
          <div className="wrapped-top-row__cover-wrap">
            <span className="wrapped-top-row__rank">{index + 1}</span>
            {media.coverImageUrl ? (
              <img
                className="wrapped-top-row__cover"
                src={media.coverImageUrl}
                alt={coverAlt(media.title)}
                title={media.title}
              />
            ) : (
              <div
                className="wrapped-top-row__cover wrapped-top-row__cover--empty"
                aria-hidden
                title={media.title}
              />
            )}
          </div>
        </li>
      ))}
    </ol>
  );
}

function WrappedTimelineCard({
  title,
  pair,
  emptyLabel,
}: {
  title: string;
  pair: WrappedTimelinePair;
  emptyLabel: string;
}) {
  const slots = [
    { key: "first", label: "Première", item: pair.first },
    { key: "last", label: "Dernière", item: pair.last },
  ] as const;

  if (!pair.first && !pair.last) {
    return (
      <div className="wrapped-timeline-block">
        <h4 className="wrapped-timeline-card__title">{title}</h4>
        <p className="wrapped-timeline-card__empty">{emptyLabel}</p>
      </div>
    );
  }

  return (
    <div className="wrapped-timeline-block">
      <h4 className="wrapped-timeline-card__title">{title}</h4>
      <div className="wrapped-timeline-card__covers">
        {slots.map(({ key, label, item }) => (
          <div key={key} className="wrapped-timeline-card__slot">
            <span className="wrapped-timeline-card__label">{label}</span>
            {item?.media.coverImageUrl ? (
              <img
                className="wrapped-timeline-card__cover"
                src={item.media.coverImageUrl}
                alt={coverAlt(item.media.title)}
                title={`${label} : ${item.media.title}`}
              />
            ) : (
              <div className="wrapped-timeline-card__cover wrapped-timeline-card__cover--empty" aria-hidden />
            )}
            <span className="wrapped-timeline-card__date">{item?.dateLabel ?? "—"}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WrappedGenreChart({ rows }: { rows: WrappedGenreRow[] }) {
  const radarRows = rows.slice(0, 10);
  return (
    <div className="wrapped-genre-block">
      <h4 className="wrapped-timeline-card__title">Genres</h4>
      <div className="wrapped-bento-box wrapped-bento-box--genre">
        <div className="wrapped-genre-radar" aria-label="Genres anime et manga combinés">
          {rows.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarRows} outerRadius="72%" margin={{ top: 4, right: 36, bottom: 4, left: 36 }}>
                <PolarGrid stroke={C.border} strokeOpacity={0.65} />
                <PolarAngleAxis
                  dataKey="name"
                  tick={{
                    fill: C.text,
                    fontSize: 8,
                    fontWeight: 500,
                  }}
                />
                <PolarRadiusAxis tick={false} axisLine={false} />
                <Radar
                  name="Genres"
                  dataKey="count"
                  stroke={C.accent}
                  fill={C.accent}
                  fillOpacity={0.2}
                  strokeWidth={2}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const row = payload[0]?.payload as WrappedGenreRow | undefined;
                    if (!row) return null;
                    return (
                      <div className="chart-tooltip chart-tooltip--basic">
                        <div className="chart-tooltip__label">{row.name}</div>
                        <div style={{ color: C.accent }}>
                          {row.count} titres, {row.percent.toFixed(1)}%
                        </div>
                      </div>
                    );
                  }}
                />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <p className="wrapped-timeline-card__empty">Aucun genre.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function WrappedPage({ summary }: WrappedPageProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const { totals } = summary;

  const exportIntroCard = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      // Import à la demande : html-to-image n'est téléchargé qu'au moment de
      // l'export, pas inclus dans le bundle de l'onglet Wrapped.
      const { toPng } = await import("html-to-image");
      const node = exportRef.current;
      // Laisse Recharts / images se stabiliser avant la capture.
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const width = node.offsetWidth;
      const height = node.offsetHeight;
      const dataUrl = await toPng(node, {
        width,
        height,
        pixelRatio: WRAPPED_EXPORT_PIXEL_RATIO,
        skipAutoScale: true,
        cacheBust: true,
        backgroundColor: "#0b1622",
      });
      downloadDataUrl(
        dataUrl,
        `anistat_wrapped_${safeFilePart(summary.userName)}_${summary.year}.png`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export impossible";
      setExportError(message);
    } finally {
      setExporting(false);
    }
  };

  if (summary.emptyReason) {
    return (
      <section className="wrapped-page wrapped-page--empty" aria-labelledby="wrapped-title">
        <div className="wrapped-empty-card">
          <p className="wrapped-kicker">AniStat Wrapped</p>
          <h1 id="wrapped-title">Pas encore assez de données pour {summary.year}</h1>
          <p>{summary.emptyReason}</p>
        </div>
      </section>
    );
  }

  return (
    <section className="wrapped-page" aria-labelledby="wrapped-title">
      <div className="wrapped-page__header">
        <div>
          <p className="wrapped-kicker">AniStat Wrapped</p>
          <h1 id="wrapped-title">Ton bilan {summary.year}</h1>
          <p className="wrapped-page__subtitle">Une carte partageable, générée à partir de ton historique AniList.</p>
        </div>
        <div className="wrapped-actions">
          <button className="wrapped-button" type="button" onClick={exportIntroCard} disabled={exporting}>
            {exporting ? "Export…" : "Télécharger PNG"}
          </button>
        </div>
      </div>

      <div ref={exportRef} className="wrapped-export-canvas">
        <WrappedProfileHeader summary={summary} />

        <div className="wrapped-bento-grid">
          <div className="wrapped-bento-col wrapped-bento-col--stats">
            <WrappedSectionTitle>Statistiques</WrappedSectionTitle>
            <div className="wrapped-overview-stats">
              <WrappedStat
                icon="book"
                value={totals.mangaCount}
                label="Manga"
                status={totals.mangaStatus}
                currentLabel="reading"
              />
              <WrappedStat icon="book" value={totals.chapters} label="Chapitres" />
              <WrappedStat icon="star" value={formatScore(totals.averageMangaScore)} label="Score manga" />
              <WrappedStat icon="calendar" value={totals.activeDays} label="Jours actifs" />
              <WrappedStat
                icon="tv"
                value={totals.animeCount}
                label="Animé"
                status={totals.animeStatus}
                currentLabel="watching"
              />
              <WrappedStat icon="play" value={totals.episodes} label="Épisodes" />
              <WrappedStat icon="star" value={formatScore(totals.averageAnimeScore)} label="Score anime" />
              <WrappedStat icon="clock" value={fmtMin(totals.minutes)} label="Temps total" />
            </div>
          </div>

          <div className="wrapped-bento-col wrapped-bento-col--timelines">
            <div className="wrapped-timeline-stack">
              <WrappedTimelineCard
                title="Activité de l'année"
                pair={summary.activityTimeline}
                emptyLabel="Aucune activité."
              />
              <WrappedTimelineCard
                title="Nouvelle série"
                pair={summary.newSeriesTimeline}
                emptyLabel="Aucune œuvre commencée."
              />
            </div>
            <WrappedGenreChart rows={summary.genreChartData} />
          </div>

          <WrappedTopPanel title="Top 5 Manga" className="wrapped-bento-col--top-manga">
            <WrappedTopRow items={summary.topMangaList} emptyLabel="Pas assez de manga notés." />
          </WrappedTopPanel>

          <div className="wrapped-bento-col wrapped-bento-col--manga-chart">
            <WrappedSectionTitle>Chapitres lus</WrappedSectionTitle>
            <div className="wrapped-bento-box wrapped-bento-box--chart">
              <WrappedMonthlyCompareChart
                data={summary.mangaChaptersChartData}
                year={summary.year}
                compareYear={summary.compareYear}
                unitLabel="chapitres"
              />
            </div>
          </div>

          <div className="wrapped-bento-col wrapped-bento-col--anime-chart">
            <WrappedSectionTitle>Épisodes regardés</WrappedSectionTitle>
            <div className="wrapped-bento-box wrapped-bento-box--chart">
              <WrappedMonthlyCompareChart
                data={summary.animeEpisodesChartData}
                year={summary.year}
                compareYear={summary.compareYear}
                unitLabel="épisodes"
              />
            </div>
          </div>

          <WrappedTopPanel title="Top 5 Anime" className="wrapped-bento-col--top-anime">
            <WrappedTopRow items={summary.topAnimeList} emptyLabel="Pas assez d'anime notés." />
          </WrappedTopPanel>
        </div>
      </div>

      {exportError ? <p className="wrapped-export-error">Export PNG échoué : {exportError}</p> : null}
    </section>
  );
}
