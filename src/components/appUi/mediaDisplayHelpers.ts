/** MediaFormat AniList → libellé court pour capsule sur la jaquette */
const MEDIA_FORMAT_LABELS: Record<string, string> = {
  TV: "TV",
  TV_SHORT: "TV Short",
  MOVIE: "Movie",
  SPECIAL: "Special",
  OVA: "OVA",
  ONA: "ONA",
  MUSIC: "Music",
  MANGA: "Manga",
  NOVEL: "Light novel",
  ONE_SHOT: "One shot",
};

export function mediaFormatShortLabel(formatRaw: unknown): string | null {
  if (formatRaw == null || formatRaw === "") return null;
  const key = String(formatRaw).toUpperCase().trim();
  if (!key) return null;
  if (MEDIA_FORMAT_LABELS[key]) return MEDIA_FORMAT_LABELS[key];
  return key.replace(/_/g, " ").toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

let regionNamesFr: Intl.DisplayNames | null = null;

function countryCodeLabelFr(iso2: unknown): string {
  const code = String(iso2 || "").toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(code)) return code || "";
  try {
    if (!regionNamesFr && typeof Intl !== "undefined" && typeof Intl.DisplayNames === "function") {
      regionNamesFr = new Intl.DisplayNames(["fr"], { type: "region" });
    }
    const name = regionNamesFr?.of(code);
    return name || code;
  } catch {
    return code;
  }
}

export function mediaCountryOriginMeta(countryCode: unknown): { code: string; label: string } | null {
  const upper = String(countryCode || "").toUpperCase().trim();
  if (!/^[A-Z]{2}$/.test(upper)) return null;
  return { code: upper, label: countryCodeLabelFr(upper) };
}

export function anilistMediaUrl(
  media: { siteUrl?: string | null; id?: number } | null | undefined,
  type: string
): string | null {
  const u = media?.siteUrl;
  if (u && typeof u === "string" && /^https?:\/\//i.test(u)) return u;
  const id = media?.id;
  if (!id) return null;
  return type === "ANIME" ? `https://anilist.co/anime/${id}/` : `https://anilist.co/manga/${id}/`;
}

/** Note liste (POINT_10_DECIMAL) : une décimale si besoin, entier sinon. */
export function formatMediaListScore(raw: unknown): string {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return "";
  const r = Math.round(n * 10) / 10;
  if (r % 1 === 0) return String(Math.trunc(r));
  return r.toFixed(1);
}

/** Étoile à 5 branches : une pointe vers `pointAngleRad` (0 = une pointe vers le haut). */
export function pentagramPath(cx: number, cy: number, outerR: number, pointAngleRad: number): string {
  const inner = outerR * 0.38196601125;
  let d = "";
  for (let i = 0; i < 5; i++) {
    const aOut = pointAngleRad - Math.PI / 2 + (i * 2 * Math.PI) / 5;
    const aIn = aOut + Math.PI / 5;
    const ox = cx + outerR * Math.cos(aOut);
    const oy = cy + outerR * Math.sin(aOut);
    const ix = cx + inner * Math.cos(aIn);
    const iy = cy + inner * Math.sin(aIn);
    d += i === 0 ? `M${ox},${oy}` : `L${ox},${oy}`;
    d += `L${ix},${iy}`;
  }
  return `${d}Z`;
}

/** Angle pour qu’une pointe de l’étoile pointe vers (tx, ty) depuis (cx, cy). */
export function starPointAngleToward(cx: number, cy: number, tx: number, ty: number): number {
  return Math.atan2(ty - cy, tx - cx) + Math.PI / 2;
}
