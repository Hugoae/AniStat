/**
 * Routage SPA basé sur l'History API (vraies URLs, pas de hash). Formats :
 *  - `/`                          → accueil
 *  - `/u/Pseudo`                  → dashboard (onglet overview)
 *  - `/u/Pseudo/anime`            → onglet anime
 *  - `/u/Pseudo/manga`            → onglet manga
 *  - `/u/Pseudo/wrapped`          → onglet wrapped
 *
 * La période est passée en query string (filtre, pas ressource) :
 *  - `/u/Pseudo/anime?year=2024`
 *  - `/u/Pseudo?year=2024&month=3`
 *  - `/u/Pseudo?year=0`           → all time
 *
 * Préfixe de langue optionnel (par défaut le français à la racine) :
 *  - `/en/u/Pseudo/anime`         → même route, interface anglaise
 *
 * Paramètres :
 *  - `tab`   : `overview` | `anime` | `manga` | `wrapped`
 *  - `year`  : `0` (= all time) ou année 4 chiffres entre 1970 et 2100
 *  - `month` : `0`..`12` (0 = toute l'année)
 *
 * Les paramètres absents/invalides retournent `null` (= « pas de surcharge
 * depuis l'URL », l'UI garde ses valeurs courantes). Les valeurs par défaut
 * (`tab=overview`, année courante, `month=0`, langue par défaut) ne sont pas
 * sérialisées pour garder des URLs propres et stables.
 *
 * Rétro-compatibilité : les anciens liens à hash (`#/user/Pseudo?...` et
 * `#/user/Pseudo/wrapped`) restent lisibles et sont réécrits en vraie URL au
 * chargement (voir `migrateLegacyHashUrl`).
 */

export type Lang = "fr" | "en";

export const DEFAULT_LANG: Lang = "fr";
const SUPPORTED_LANGS: ReadonlySet<string> = new Set(["fr", "en"]);

export type ParsedHomeRoute = { type: "home"; lang: Lang };

export type ParsedUserRoute = {
  type: "user";
  name: string;
  tab: string | null;
  year: number | null;
  month: number | null;
  lang: Lang;
};

export type ParsedRoute = ParsedHomeRoute | ParsedUserRoute;

const VALID_TABS: ReadonlySet<string> = new Set(["overview", "anime", "manga", "wrapped"]);
const DEFAULT_TAB = "overview";
const DEFAULT_MONTH = 0;
const ALL_TIME_YEAR = 0;
const MIN_YEAR = 1970;
const MAX_YEAR = 2100;

/** Événement custom émis après une navigation programmatique (push/replace). */
const ROUTE_EVENT = "anistat:route";

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

function safeDecodeName(raw: string): string {
  try {
    return decodeURIComponent(raw).trim();
  } catch {
    return raw.trim();
  }
}

/**
 * Cœur pur du parseur : à partir d'un `pathname` et d'une `search`, retourne la
 * route. Isolé de `window` pour être testable sans DOM.
 */
export function parseRouteFromParts(pathname: string, search: string): ParsedRoute {
  const segments = String(pathname || "")
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);

  let lang: Lang = DEFAULT_LANG;
  if (segments.length > 0 && SUPPORTED_LANGS.has(segments[0].toLowerCase())) {
    lang = segments.shift()!.toLowerCase() as Lang;
  }

  if (segments.length === 0) return { type: "home", lang };

  const head = segments[0].toLowerCase();
  // `u` (nouveau) et `user` (rétro-compat de l'ancien chemin) acceptés.
  if (head !== "u" && head !== "user") return { type: "home", lang };

  const rawName = segments[1];
  if (!rawName) return { type: "home", lang };

  const name = safeDecodeName(rawName);
  if (!name) return { type: "home", lang };

  // Onglet : segment 3 (`/u/Name/anime`) ou ancien `/user/Name/wrapped`.
  const tabFromPath = parseTabParam(segments[2] ?? null);

  const params = new URLSearchParams(search || "");
  const tabFromQuery = parseTabParam(params.get("tab"));

  return {
    type: "user",
    name,
    tab: tabFromPath ?? tabFromQuery,
    year: parseYearParam(params.get("year")),
    month: parseMonthParam(params.get("month")),
    lang,
  };
}

/** Lit la route depuis `window.location` (pathname + search). */
export function parseRoute(): ParsedRoute {
  try {
    return parseRouteFromParts(window.location.pathname, window.location.search);
  } catch {
    return { type: "home", lang: DEFAULT_LANG };
  }
}

export type BuildProfileOptions = {
  tab?: string | null;
  year?: number | null;
  month?: number | null;
  lang?: Lang;
};

/**
 * Construit une vraie URL (path + query) pour un profil. Les valeurs par
 * défaut ne sont pas sérialisées : `/u/Bob` = « overview, année courante,
 * toute l'année, langue par défaut ». On n'ajoute des params que pour les
 * écarts (autre onglet, autre année, mois précis, autre langue).
 */
export function buildProfilePath(name: string, options: BuildProfileOptions = {}): string {
  const n = String(name || "").trim();
  if (!n) return buildHomePath(options.lang);

  const parts: string[] = [];
  const lang = options.lang ?? DEFAULT_LANG;
  if (lang !== DEFAULT_LANG && SUPPORTED_LANGS.has(lang)) parts.push(lang);
  parts.push("u", encodeURIComponent(n));

  if (options.tab && VALID_TABS.has(options.tab) && options.tab !== DEFAULT_TAB) {
    parts.push(options.tab);
  }

  const params = new URLSearchParams();
  if (options.year != null) {
    const currentYear = new Date().getFullYear();
    if (options.year !== currentYear) params.set("year", String(options.year));
  }
  if (options.month != null && options.month !== DEFAULT_MONTH) {
    params.set("month", String(options.month));
  }

  const path = `/${parts.join("/")}`;
  const q = params.toString();
  return q ? `${path}?${q}` : path;
}

export function buildHomePath(lang: Lang = DEFAULT_LANG): string {
  return lang !== DEFAULT_LANG && SUPPORTED_LANGS.has(lang) ? `/${lang}` : "/";
}

/** Raccourci : URL par défaut d'un profil (reset onglet/période). */
export function profilePathForUserName(name: string, lang: Lang = DEFAULT_LANG): string {
  return buildProfilePath(name, { lang });
}

/** Navigation client (History API) suivie d'un événement pour les abonnés. */
export function navigateToPath(path: string, options: { replace?: boolean } = {}): void {
  try {
    const current = `${window.location.pathname}${window.location.search}`;
    if (path === current) return;
    if (options.replace) window.history.replaceState(null, "", path);
    else window.history.pushState(null, "", path);
    window.dispatchEvent(new Event(ROUTE_EVENT));
  } catch {
    /* ignore */
  }
}

/**
 * Abonnement aux changements de route : `popstate` (retour/avance navigateur)
 * + notre événement custom émis par `navigateToPath`.
 */
export function subscribeRoute(callback: () => void): () => void {
  window.addEventListener("popstate", callback);
  window.addEventListener(ROUTE_EVENT, callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener(ROUTE_EVENT, callback);
  };
}

export function initialLoadingFromRoute(): boolean {
  const r = parseRoute();
  return r.type === "user" && Boolean(r.name && r.name.trim());
}

const LANG_STORAGE_KEY = "anistat:lang";

export function readStoredLang(): Lang | null {
  try {
    const v = window.localStorage.getItem(LANG_STORAGE_KEY);
    return v === "en" || v === "fr" ? v : null;
  } catch {
    return null;
  }
}

export function storeLang(lang: Lang): void {
  try {
    window.localStorage.setItem(LANG_STORAGE_KEY, lang);
  } catch {
    /* ignore */
  }
}

/** Construit l'URL de la route COURANTE dans une autre langue (pour le switch). */
export function buildLangSwitchPath(lang: Lang): string {
  const r = parseRoute();
  if (r.type === "user") {
    return buildProfilePath(r.name, { tab: r.tab, year: r.year, month: r.month, lang });
  }
  return buildHomePath(lang);
}

/** Variante d'une route (path courant) dans une langue donnée, pour hreflang. */
export function buildAlternateLangPath(lang: Lang): string {
  return buildLangSwitchPath(lang);
}

/**
 * Au démarrage, applique la préférence de langue si l'URL n'a pas déjà de
 * préfixe : préférence stockée en priorité, sinon détection via
 * `navigator.language`. Réécrit l'URL via `replaceState` (avant le rendu).
 */
export function applyInitialLangPreference(): void {
  try {
    const r = parseRoute();
    if (r.lang !== DEFAULT_LANG) return; // URL déjà explicite (ex. /en/...)
    const stored = readStoredLang();
    const detected = (navigator.language || "").toLowerCase().startsWith("en") ? "en" : "fr";
    const wanted: Lang = stored ?? (detected as Lang);
    if (wanted === DEFAULT_LANG) return;
    const target =
      r.type === "user"
        ? buildProfilePath(r.name, { tab: r.tab, year: r.year, month: r.month, lang: wanted })
        : buildHomePath(wanted);
    window.history.replaceState(null, "", target);
  } catch {
    /* ignore */
  }
}

/**
 * Parse un ancien lien à hash (`#/user/Pseudo?...`, `#/user/Pseudo/wrapped`,
 * `#/u/Pseudo`, `#/` , `#/home`). Retourne `null` si le hash ne ressemble pas
 * à une ancienne route AniStat (on ne touche alors pas à l'URL).
 */
export function parseLegacyHash(hash: string): ParsedRoute | null {
  const raw = String(hash || "").replace(/^#/, "").trim();
  if (!raw) return null;
  if (raw === "/" || /^\/home\/?$/i.test(raw)) return { type: "home", lang: DEFAULT_LANG };

  const queryIdx = raw.indexOf("?");
  const pathPart = queryIdx >= 0 ? raw.slice(0, queryIdx) : raw;
  const queryPart = queryIdx >= 0 ? raw.slice(queryIdx + 1) : "";

  const path = pathPart.startsWith("/") ? pathPart.slice(1) : pathPart;
  const m = path.match(/^(?:user|u)\/(.+?)(?:\/(wrapped))?\/?$/i);
  if (!m) return null;

  const name = safeDecodeName(m[1].replace(/\/$/, ""));
  if (!name) return null;

  const legacyWrapped = m[2]?.toLowerCase() === "wrapped";
  const params = new URLSearchParams(queryPart);
  const tabFromQuery = parseTabParam(params.get("tab"));

  return {
    type: "user",
    name,
    tab: tabFromQuery ?? (legacyWrapped ? "wrapped" : null),
    year: parseYearParam(params.get("year")),
    month: parseMonthParam(params.get("month")),
    lang: DEFAULT_LANG,
  };
}

/**
 * Au démarrage, réécrit un ancien lien à hash en vraie URL (via
 * `history.replaceState`, sans rechargement). No-op si l'URL est déjà propre.
 */
export function migrateLegacyHashUrl(): void {
  try {
    const hash = window.location.hash;
    if (!hash || hash.length < 2) return;
    const legacy = parseLegacyHash(hash);
    if (!legacy) return;
    const target =
      legacy.type === "user"
        ? buildProfilePath(legacy.name, { tab: legacy.tab, year: legacy.year, month: legacy.month })
        : buildHomePath();
    window.history.replaceState(null, "", target);
  } catch {
    /* ignore */
  }
}
