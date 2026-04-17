export const C = {
  bg: "#0b1622",
  cardBg: "#151f2e",
  accent: "#3DB4F2",
  text: "#edf1f5",
  textMuted: "#8ba0b2",
  textDim: "#516170",
  border: "#1f2d3d",
  green: "#4caf50",
  orange: "#F27C3D",
  pink: "#F23D58",
  purple: "#F27C3D",
  yellow: "#F2D73D",
  red: "#F23D58",
} as const;

export const PIE_COLORS = [
  C.accent,
  C.red,
  C.yellow,
  C.orange,
  C.green,
  C.accent,
  C.red,
  C.yellow,
  C.orange,
  C.green,
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
