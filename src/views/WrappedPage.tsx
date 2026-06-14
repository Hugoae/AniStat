import { useMemo, useRef, useState, type ReactNode } from "react";
import type { WrappedSummary, WrappedMedia } from "../lib/wrapped";

type WrappedPageProps = {
  summary: WrappedSummary;
};

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
    .replace(/[^a-z0-9_-]+/gi, "-")
    .replace(/^-+|-+$/g, "") || "anistat";
}

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

function WrappedBentoBox({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={["wrapped-bento-box", className].filter(Boolean).join(" ")}>
      <h3 className="wrapped-bento-box__title">{title}</h3>
      <div className="wrapped-bento-box__content">{children}</div>
    </div>
  );
}

function WrappedTopMediaList({ items, emptyLabel }: { items: WrappedMedia[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="wrapped-bento-box__empty">{emptyLabel}</p>;
  }
  return (
    <ol className="wrapped-bento-top-list">
      {items.map((media, index) => (
        <li key={media.id} className="wrapped-bento-top-list__item">
          <span className="wrapped-bento-top-list__rank">{index + 1}</span>
          {media.coverImageUrl ? (
            <img
              className="wrapped-bento-top-list__cover"
              src={media.coverImageUrl}
              alt={coverAlt(media.title)}
            />
          ) : (
            <div className="wrapped-bento-top-list__cover wrapped-bento-top-list__cover--empty" aria-hidden />
          )}
          <div className="wrapped-bento-top-list__meta">
            <span className="wrapped-bento-top-list__title">{media.title}</span>
            {media.score ? (
              <span className="wrapped-bento-top-list__score">{media.score}/10</span>
            ) : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

function buildTopMediaList(
  primary: WrappedMedia | null,
  pool: readonly WrappedMedia[],
  max: number
): WrappedMedia[] {
  const out: WrappedMedia[] = [];
  const seen = new Set<number>();
  if (primary) {
    out.push(primary);
    seen.add(primary.id);
  }
  for (const media of pool) {
    if (out.length >= max) break;
    if (seen.has(media.id)) continue;
    seen.add(media.id);
    out.push(media);
  }
  return out.slice(0, max);
}

export function WrappedPage({ summary }: WrappedPageProps) {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const topAnimeList = useMemo(
    () => buildTopMediaList(summary.topAnime, summary.covers, 5),
    [summary.topAnime, summary.covers]
  );
  const topMangaList = useMemo(
    () => buildTopMediaList(summary.topManga, summary.covers, 5),
    [summary.topManga, summary.covers]
  );

  const topStudioLabel = summary.topStudio
    ? `${summary.topStudio.name} · ${Math.round(summary.topStudio.minutesWatched / 60)} h`
    : "—";
  const topAuthorLabel = summary.topAuthor
    ? `${summary.topAuthor.name}${summary.topAuthor.role ? ` (${summary.topAuthor.role})` : ""}`
    : "—";

  const exportIntroCard = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      // Import à la demande : html-to-image n'est téléchargé qu'au moment de
      // l'export, pas inclus dans le bundle de l'onglet Wrapped.
      const { toPng } = await import("html-to-image");
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#0f1824",
      });
      downloadDataUrl(
        dataUrl,
        `anistat-wrapped-${safeFilePart(summary.userName)}-${summary.year}-intro.png`
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
          <WrappedBentoBox title="Anime Stats" className="wrapped-bento-box--anime-stats">
            <p className="wrapped-bento-stat">
              <strong>{Math.round(summary.totals.minutes / 60)} h</strong>
              <span>de visionnage</span>
            </p>
            <p className="wrapped-bento-stat">
              <strong>{summary.totals.episodes}</strong>
              <span>épisodes vus</span>
            </p>
            <p className="wrapped-bento-stat">
              <strong>{summary.totals.animeCount}</strong>
              <span>anime actifs</span>
            </p>
            <p className="wrapped-bento-meta">Studio · {topStudioLabel}</p>
          </WrappedBentoBox>

          <WrappedBentoBox title="Manga Stats" className="wrapped-bento-box--manga-stats">
            <p className="wrapped-bento-stat">
              <strong>{summary.totals.chapters}</strong>
              <span>chapitres lus</span>
            </p>
            <p className="wrapped-bento-stat">
              <strong>{summary.totals.mangaCount}</strong>
              <span>manga actifs</span>
            </p>
            <p className="wrapped-bento-stat">
              <strong>{summary.totals.activeDays}</strong>
              <span>jours actifs</span>
            </p>
            <p className="wrapped-bento-meta">Auteur · {topAuthorLabel}</p>
          </WrappedBentoBox>

          <WrappedBentoBox title="Top 5 Anime" className="wrapped-bento-box--top-anime">
            <WrappedTopMediaList items={topAnimeList} emptyLabel="Pas assez de notes anime." />
          </WrappedBentoBox>

          <WrappedBentoBox title="Graphiques / Radar" className="wrapped-bento-box--charts">
            <p className="wrapped-bento-meta">Genre dominant</p>
            <p className="wrapped-bento-highlight">
              {summary.topGenre?.name ?? "—"}
              {summary.topGenre ? ` (${summary.topGenre.count} titres)` : ""}
            </p>
            <p className="wrapped-bento-meta">Tag dominant</p>
            <p className="wrapped-bento-highlight">
              {summary.topTag?.name ?? "—"}
              {summary.topTag ? ` (${summary.topTag.count}×)` : ""}
            </p>
            <div className="wrapped-bento-chart-placeholder" aria-hidden />
          </WrappedBentoBox>

          <WrappedBentoBox title="Top 5 Manga" className="wrapped-bento-box--top-manga">
            <WrappedTopMediaList items={topMangaList} emptyLabel="Pas assez de notes manga." />
          </WrappedBentoBox>

          <WrappedBentoBox title="Awards / Fun Stats" className="wrapped-bento-box--awards">
            <ul className="wrapped-bento-awards">
              {summary.highlights.map((highlight) => (
                <li key={highlight.label} className="wrapped-bento-awards__item">
                  <span className="wrapped-bento-awards__label">{highlight.label}</span>
                  <strong className="wrapped-bento-awards__value">{highlight.value}</strong>
                  <small className="wrapped-bento-awards__detail">{highlight.detail}</small>
                </li>
              ))}
            </ul>
          </WrappedBentoBox>
        </div>
      </div>

      {exportError ? <p className="wrapped-export-error">Export PNG échoué : {exportError}</p> : null}
    </section>
  );
}
