/** Fichiers servis depuis `public/studio-logos/` (voir `scripts/process-studio-logos.mjs`). */
const STUDIO_LOGOS_PUBLIC_PATH = "/studio-logos";

/**
 * Slug fichier = nom affiché AniList passé par la même règle que le script de traitement.
 * Ex. "Brain's Base" → "brains-base", "MAPPA" → "mappa"
 */
function studioNameToLogoSlug(name: string): string {
  const s = String(name || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/['''`´]/g, "")
    .toLowerCase()
    .trim();
  const slug = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "studio";
}

function studioNameToAltLogoSlug(name: string): string {
  const s = String(name || "")
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .trim();
  const slug = s.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return slug || "studio";
}

function localStudioLogoUrlForSlug(slug: string): string {
  return `${STUDIO_LOGOS_PUBLIC_PATH}/${slug}.png`;
}

type Manifest = { version?: number; slugs?: string[] };

let manifestSlugsPromise: Promise<Set<string>> | null = null;

function getStudioLogoSlugSet(): Promise<Set<string>> {
  if (!manifestSlugsPromise) {
    manifestSlugsPromise = (async () => {
      try {
        const res = await fetch(`${STUDIO_LOGOS_PUBLIC_PATH}/manifest.json`, { cache: "no-cache" });
        if (!res.ok) return new Set();
        const json = (await res.json()) as Manifest;
        const list = Array.isArray(json.slugs) ? json.slugs : [];
        return new Set(list.map((s) => String(s || "").toLowerCase()).filter(Boolean));
      } catch {
        return new Set();
      }
    })();
  }
  return manifestSlugsPromise;
}

/** URL logo local si présent dans le manifest, sinon null (Wikipedia / fallback). */
export async function resolveLocalStudioLogoUrl(studioName: string): Promise<string | null> {
  const primarySlug = studioNameToLogoSlug(studioName);
  const altSlug = studioNameToAltLogoSlug(studioName);
  const set = await getStudioLogoSlugSet();
  if (set.has(primarySlug)) return localStudioLogoUrlForSlug(primarySlug);
  if (altSlug !== primarySlug && set.has(altSlug)) return localStudioLogoUrlForSlug(altSlug);
  return null;
}
