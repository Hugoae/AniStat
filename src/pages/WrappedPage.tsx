import { useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import type { WrappedSummary } from "../lib/wrapped";

type WrappedPageProps = {
  summary: WrappedSummary;
  dashboardHref: string;
};

type WrappedSlide = {
  key: string;
  eyebrow: string;
  title: string;
  kicker: string;
  body: string;
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

function WrappedMediaSpotlight({
  label,
  media,
}: {
  label: string;
  media: WrappedSummary["topAnime"];
}) {
  if (!media) return null;
  return (
    <div className="wrapped-media-spotlight">
      {media.coverImageUrl ? (
        <img className="wrapped-media-spotlight__cover" src={media.coverImageUrl} alt={coverAlt(media.title)} />
      ) : (
        <div className="wrapped-media-spotlight__cover wrapped-media-spotlight__cover--empty" aria-hidden />
      )}
      <div>
        <div className="wrapped-media-spotlight__label">{label}</div>
        <div className="wrapped-media-spotlight__title">{media.title}</div>
        {media.score ? <div className="wrapped-media-spotlight__score">Note {media.score}/10</div> : null}
      </div>
    </div>
  );
}

export function WrappedPage({ summary, dashboardHref }: WrappedPageProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const exportRef = useRef<HTMLDivElement | null>(null);

  const slides = useMemo<WrappedSlide[]>(() => {
    const topStudio = summary.topStudio
      ? `${summary.topStudio.name} domine ton année anime avec ${Math.round(summary.topStudio.minutesWatched / 60)} h.`
      : "Aucun studio dominant net cette année.";
    const topAuthor = summary.topAuthor
      ? `${summary.topAuthor.name}${summary.topAuthor.role ? ` (${summary.topAuthor.role})` : ""} ressort côté manga.`
      : "Aucun auteur dominant net cette année.";
    return [
      {
        key: "intro",
        eyebrow: `${summary.userName} · ${summary.year}`,
        title: "Ton année AniStat",
        kicker: `${summary.totals.animeCount + summary.totals.mangaCount} œuvres actives`,
        body: `${summary.totals.activeDays} jours actifs, ${summary.totals.episodes} épisodes et ${summary.totals.chapters} chapitres dans le rétro.`,
      },
      {
        key: "anime",
        eyebrow: "Anime",
        title: `${Math.round(summary.totals.minutes / 60)} heures devant l'écran`,
        kicker: `${summary.totals.episodes} épisodes vus`,
        body: topStudio,
      },
      {
        key: "manga",
        eyebrow: "Manga",
        title: `${summary.totals.chapters} chapitres lus`,
        kicker: `${summary.totals.mangaCount} manga actifs`,
        body: topAuthor,
      },
      {
        key: "taste",
        eyebrow: "Signature de goût",
        title: summary.topGenre?.name || summary.topTag?.name || "Un profil éclectique",
        kicker: summary.topTag ? `Tag dominant : ${summary.topTag.name}` : "Aucun tag dominant",
        body: summary.topGenre
          ? `${summary.topGenre.count} œuvres de ton année portent ce genre.`
          : "Tes goûts sont trop dispersés pour laisser un seul genre gagner.",
      },
      {
        key: "highlights",
        eyebrow: "Moments forts",
        title: summary.highlights[3]?.value || summary.highlights[0]?.value || "Année consolidée",
        kicker: summary.highlights[3]?.label || summary.highlights[0]?.label || "Highlight",
        body: summary.highlights.map((h) => `${h.label}: ${h.value}`).join(" · "),
      },
      {
        key: "favorites",
        eyebrow: "Têtes d'affiche",
        title: summary.topAnime?.title || summary.topManga?.title || "Tes favoris",
        kicker: "Top scores personnels",
        body: [summary.topAnime?.title, summary.topManga?.title].filter(Boolean).join(" · ") || "Pas assez de notes cette année.",
      },
    ];
  }, [summary]);

  const activeSlide = slides[activeIndex] ?? slides[0];

  const exportActiveSlide = async () => {
    if (!exportRef.current) return;
    setExporting(true);
    setExportError(null);
    try {
      const dataUrl = await toPng(exportRef.current, {
        pixelRatio: 2,
        cacheBust: true,
        backgroundColor: "#0b1622",
      });
      downloadDataUrl(
        dataUrl,
        `anistat-wrapped-${safeFilePart(summary.userName)}-${summary.year}-${activeSlide.key}.png`
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
          <a className="wrapped-button wrapped-button--secondary" href={dashboardHref}>
            Retour au dashboard
          </a>
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
          <a className="wrapped-button wrapped-button--secondary" href={dashboardHref}>
            Dashboard
          </a>
          <button className="wrapped-button" type="button" onClick={exportActiveSlide} disabled={exporting}>
            {exporting ? "Export…" : "Télécharger PNG"}
          </button>
        </div>
      </div>

      <div className="wrapped-layout">
        <div
          ref={exportRef}
          className="wrapped-card"
          style={
            summary.bannerImage
              ? {
                  backgroundImage: `linear-gradient(135deg, rgba(11,22,34,0.92), rgba(11,22,34,0.62)), url(${summary.bannerImage})`,
                }
              : undefined
          }
        >
          <div className="wrapped-card__topline">
            <span>AniStat Wrapped</span>
            <span>{summary.year}</span>
          </div>
          <div className="wrapped-profile-line">
            {summary.avatarUrl ? <img src={summary.avatarUrl} alt="" className="wrapped-profile-line__avatar" /> : null}
            <span>{summary.userName}</span>
          </div>
          <p className="wrapped-card__eyebrow">{activeSlide.eyebrow}</p>
          <h2>{activeSlide.title}</h2>
          <p className="wrapped-card__kicker">{activeSlide.kicker}</p>
          <p className="wrapped-card__body">{activeSlide.body}</p>

          <div className="wrapped-metric-grid">
            {summary.highlights.slice(0, 4).map((highlight) => (
              <div key={highlight.label} className="wrapped-metric">
                <span>{highlight.label}</span>
                <strong>{highlight.value}</strong>
                <small>{highlight.detail}</small>
              </div>
            ))}
          </div>

          <div className="wrapped-media-row">
            <WrappedMediaSpotlight label="Anime favori" media={summary.topAnime} />
            <WrappedMediaSpotlight label="Manga favori" media={summary.topManga} />
          </div>

          {summary.covers.length > 0 ? (
            <div className="wrapped-cover-strip" aria-label="Covers marquantes">
              {summary.covers.slice(0, 6).map((media) =>
                media.coverImageUrl ? (
                  <img key={media.id} src={media.coverImageUrl} alt={coverAlt(media.title)} />
                ) : null
              )}
            </div>
          ) : null}
        </div>

        <div className="wrapped-slide-list" aria-label="Slides Wrapped">
          {slides.map((slide, idx) => (
            <button
              key={slide.key}
              type="button"
              className={`wrapped-slide-pill${idx === activeIndex ? " wrapped-slide-pill--active" : ""}`}
              onClick={() => setActiveIndex(idx)}
            >
              <span>{String(idx + 1).padStart(2, "0")}</span>
              {slide.eyebrow}
            </button>
          ))}
        </div>
      </div>

      {exportError ? <p className="wrapped-export-error">Export PNG échoué : {exportError}</p> : null}
    </section>
  );
}
