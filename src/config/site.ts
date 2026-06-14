/** Métadonnées publiques du site (SEO, favicon, logo). */
export const SITE = {
  name: "AniStat",
  title: "AniStat — Statistiques de profils AniList",
  description:
    "Visualisez l'activité, les tops et les graphiques d'un profil AniList public à un seul endroit.",
  locale: "fr_FR",
  themeColor: "#0b1622",
  /** URL canonique de production (ex. https://aniliststat.example). Utilisée pour og:url et JSON-LD. */
  url: import.meta.env.VITE_SITE_URL?.replace(/\/$/, "") ?? "",
  brand: {
    logo: "/brand/logo.svg",
    logoSquare: "/brand/logo-square.svg",
    logoSquare512: "/brand/logo-square-512.png",
    ogImage: "/brand/logo-square-512.png",
    appleTouchIcon: "/brand/apple-touch-icon.png",
    favicon512: "/brand/favicon-512.png",
  },
} as const;
