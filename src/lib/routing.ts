/**
 * Routage SPA basé sur le hash. Formats supportés :
 *  - `#/` ou `#/home`            → accueil
 *  - `#/user/Pseudo`             → dashboard
 *
 * En plus du chemin, des « deep links » sont supportés via une query string
 * placée après le hash, par exemple :
 *  - `#/user/Pseudo?tab=anime&year=2024`
 *  - `#/user/Pseudo?tab=overview&year=2024&month=3`
 *  - `#/user/Pseudo?tab=wrapped&year=2024`
 *
 * Ancien format (rétrocompatibilité en lecture) :
 *  - `#/user/Pseudo/wrapped?year=2024` → interprété comme `?tab=wrapped`
 *
 * Paramètres :
 *  - `tab`   : `overview` | `anime` | `manga` | `wrapped`
 *  - `year`  : `0` (= all time) ou année 4 chiffres entre 1970 et 2100
 *  - `month` : `0`..`12` (0 = toute l'année)
 *
 * Les paramètres absents/invalides retournent `null`, ce qui signifie « pas
 * de surcharge depuis l'URL » et laisse l'UI utiliser ses valeurs par
 * défaut courantes. Les valeurs "par défaut" (`tab=overview`, année
 * courante, `month=0`) ne sont pas écrites dans l'URL pour la garder
 * lisible et stable.
 */

export type ParsedHomeRoute = { type: "home" };

export type ParsedUserRoute = {
  type: "user";
  name: string;
  tab: string | null;
  year: number | null;
  month: number | null;
};

export type ParsedRoute = ParsedHomeRoute | ParsedUserRoute;

const VALID_TABS: ReadonlySet<string> = new Set(["overview", "anime", "manga", "wrapped"]);
const DEFAULT_TAB = "overview";
const DEFAULT_MONTH = 0;
const ALL_TIME_YEAR = 0;
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

function parseTabParam(raw: string | null): string | null {
  if (!raw) return null;
  const lower = raw.toLowerCase();
  return VALID_TABS.has(lower) ? lower : null;
}

function parseYearParam(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n === ALL_TIME_YEAR) return ALL_TIME_YEAR;
  if (n >= MIN_YEAR && n <= MAX_YEAR) return n;
  return null;
}

function parseMonthParam(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return null;
  if (n < 0 || n > 12) return null;
  return n;
}

export function parseRouteFromHash(): ParsedRoute {
  try {
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw || raw === "/" || /^\/home\/?$/i.test(raw)) return { type: "home" };

    const queryIdx = raw.indexOf("?");
    const pathPart = queryIdx >= 0 ? raw.slice(0, queryIdx) : raw;
    const queryPart = queryIdx >= 0 ? raw.slice(queryIdx + 1) : "";

    const path = pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;
    const m = path.match(/^user\/(.+?)(?:\/(wrapped))?\/?$/i);
    if (!m) return { type: "home" };

    const name = decodeURIComponent(m[1].replace(/\/$/, "")).trim();
    if (!name) return { type: "home" };

    const legacyWrapped = m[2]?.toLowerCase() === "wrapped";
    const params = new URLSearchParams(queryPart);
    const tabFromQuery = parseTabParam(params.get("tab"));

    return {
      type: "user",
      name,
      tab: tabFromQuery ?? (legacyWrapped ? "wrapped" : null),
      year: parseYearParam(params.get("year")),
      month: parseMonthParam(params.get("month")),
    };
  } catch {
    return { type: "home" };
  }
}

export type BuildHashOptions = {
  tab?: string | null;
  year?: number | null;
  month?: number | null;
};

/**
 * Construit un hash complet pour un profil. Les valeurs par défaut ne sont
 * pas sérialisées dans la query string : on garde `#/user/Bob` pour
 * « onglet overview, année courante, toute l'année » et on n'ajoute des
 * params que pour les écarts (autre onglet, autre année, mois précis).
 */
export function buildProfileHash(name: string, options: BuildHashOptions = {}): string {
  const n = String(name || "").trim();
  if (!n) return "#/";

  const base = `#/user/${encodeURIComponent(n)}`;
  const params = new URLSearchParams();

  if (options.tab && VALID_TABS.has(options.tab) && options.tab !== DEFAULT_TAB) {
    params.set("tab", options.tab);
  }

  if (options.year != null) {
    const currentYear = new Date().getFullYear();
    if (options.year !== currentYear) {
      params.set("year", String(options.year));
    }
  }

  if (options.month != null && options.month !== DEFAULT_MONTH) {
    params.set("month", String(options.month));
  }

  const q = params.toString();
  return q ? `${base}?${q}` : base;
}

export function profileHashForUserName(name: string): string {
  return buildProfileHash(name);
}

export function initialLoadingFromHash(): boolean {
  const r = parseRouteFromHash();
  return r.type === "user" && Boolean(r.name && r.name.trim());
}
