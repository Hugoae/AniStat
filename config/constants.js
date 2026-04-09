(() => {
  const C = {
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
  };

  const PIE_COLORS = [
    C.accent, C.pink, C.purple, C.yellow, C.green, C.orange,
    "#5c6bc0", "#26a69a", "#ef5350", "#ab47bc"
  ];

  const MONTHS = ["Jan", "Fev", "Mar", "Avr", "Mai", "Jun", "Jul", "Aou", "Sep", "Oct", "Nov", "Dec"];
  const MONTHS_FULL = [
    "janvier", "février", "mars", "avril", "mai", "juin",
    "juillet", "août", "septembre", "octobre", "novembre", "décembre"
  ];

  const STATUS_LABELS = {
    COMPLETED: "Termine",
    CURRENT: "En cours",
    PAUSED: "En pause",
    DROPPED: "Abandonne",
    PLANNING: "Planifie",
    REPEATING: "Rewatch",
  };

  const STATUS_COLORS = {
    COMPLETED: C.green,
    CURRENT: C.accent,
    PAUSED: C.orange,
    DROPPED: C.red,
    PLANNING: C.textDim,
    REPEATING: C.purple,
  };

  /**
   * Raccourcis recherche : liste locale des pseudos (pas d’autocomplétition globale).
   * userName = pseudo AniList exact. label = libellé affiché (optionnel).
   * avatarUrl = image forcée (optionnel) ; sinon l’app charge l’avatar via une requête
   * GraphQL légère au focus du menu, ou réutilise le cache si le profil a déjà été ouvert.
   */
  const PROFILE_QUICK_SUGGESTIONS = [
    { userName: "Kirikou"},
    { userName: "LilTurcos"},
    { userName: "ArtusooDeLaNoche"},
    { userName: "Sofiane7"},
    // { userName: "UnAmi", label: "Prénom" },
    // { userName: "Autre", label: "", avatarUrl: "https://..." },
  ];

  window.AppConfig = {
    C,
    PIE_COLORS,
    MONTHS,
    MONTHS_FULL,
    STATUS_LABELS,
    STATUS_COLORS,
    PROFILE_QUICK_SUGGESTIONS,
  };
})();
