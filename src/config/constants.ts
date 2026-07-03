export const C = {
  bg: "#0b1622",
  cardBg: "#151f2e",
  accent: "#3DB4F2",
  text: "#edf1f5",
  textMuted: "#8ba0b2",
  textDim: "#516170",
  border: "#1f2d3d",
  green: "#4CAF50",
  orange: "#F27C3D",
  pink: "#F472B6",
  purple: "#A78BFA",
  yellow: "#F2D73D",
  red: "#F23D58",
  teal: "#2DD4BF",
  indigo: "#6366F1",
} as const;

/** Année sentinelle représentant la période « depuis toujours » (tout l'historique). */
export const ALL_TIME_YEAR = 0;

export const PIE_COLORS = [
  C.accent,
  C.orange,
  C.green,
  C.purple,
  C.yellow,
  C.pink,
  C.teal,
  C.red,
  C.indigo,
];

export const MONTHS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"] as const;

export const MONTHS_EN = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

export const MONTHS_FULL = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
] as const;

export const MONTHS_FULL_EN = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Mapping abréviation FR -> EN, pour localiser un label mois déjà généré. */
const FR_TO_EN_MONTH_ABBR: Record<string, string> = {
  Jan: "Jan",
  Fev: "Feb",
  Mar: "Mar",
  Avr: "Apr",
  Mai: "May",
  Jun: "Jun",
  Jul: "Jul",
  Aou: "Aug",
  Sep: "Sep",
  Oct: "Oct",
  Nov: "Nov",
  Dec: "Dec",
};

export type AppLang = "fr" | "en";

export function monthsShort(lang: AppLang): readonly string[] {
  return lang === "en" ? MONTHS_EN : MONTHS;
}

export function monthsFull(lang: AppLang): readonly string[] {
  return lang === "en" ? MONTHS_FULL_EN : MONTHS_FULL;
}

/** Localise une abréviation de mois déjà générée en FR (ex. axes de graphes). */
export function localizeMonthAbbr(abbr: string, lang: AppLang): string {
  if (lang !== "en") return abbr;
  return FR_TO_EN_MONTH_ABBR[abbr] ?? abbr;
}

export const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Termine",
  CURRENT: "En cours",
  PAUSED: "En pause",
  DROPPED: "Abandonne",
  PLANNING: "Planifie",
  REPEATING: "Rewatch",
};

export const STATUS_LABELS_EN: Record<string, string> = {
  COMPLETED: "Completed",
  CURRENT: "In progress",
  PAUSED: "On hold",
  DROPPED: "Dropped",
  PLANNING: "Planned",
  REPEATING: "Rewatch",
};

export function statusLabel(status: string, lang: AppLang): string {
  const map = lang === "en" ? STATUS_LABELS_EN : STATUS_LABELS;
  return map[status] ?? STATUS_LABELS[status] ?? status;
}

export const STATUS_COLORS: Record<string, string> = {
  COMPLETED: C.green,
  CURRENT: C.accent,
  PAUSED: C.orange,
  DROPPED: C.red,
  PLANNING: C.textDim,
  REPEATING: C.purple,
};

export type QuickProfileSuggestion = {
  userName: string;
  label?: string;
  avatarUrl?: string;
};

/**
 * Raccourcis recherche : liste locale des pseudos (pas d'autocomplétition globale).
 */
export const PROFILE_QUICK_SUGGESTIONS: QuickProfileSuggestion[] = [
  { userName: "Kirikou" },
  { userName: "LilTurcos" },
  { userName: "ArtusooDeLaNoche" },
  { userName: "Sofiane7" },
];
