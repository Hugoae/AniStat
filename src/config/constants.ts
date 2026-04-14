export const C = {
  bg: "#0b1622",
  cardBg: "#151f2e",
  accent: "#3db4f2",
  text: "#edf1f5",
  textMuted: "#8ba0b2",
  textDim: "#516170",
  border: "#1f2d3d",
  green: "#4caf50",
  orange: "#fb8c00",
  pink: "#e85d75",
  purple: "#c063e0",
  yellow: "#f7c948",
  red: "#e53935",
} as const;

export const PIE_COLORS = [
  C.accent,
  C.pink,
  C.purple,
  C.yellow,
  C.green,
  C.orange,
  "#5c6bc0",
  "#26a69a",
  "#ef5350",
  "#ab47bc",
];

export const MONTHS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"] as const;

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

export const STATUS_LABELS: Record<string, string> = {
  COMPLETED: "Termine",
  CURRENT: "En cours",
  PAUSED: "En pause",
  DROPPED: "Abandonne",
  PLANNING: "Planifie",
  REPEATING: "Rewatch",
};

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
