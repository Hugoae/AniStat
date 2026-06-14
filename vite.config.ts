import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

function resolveSiteUrl(env: Record<string, string>): string {
  const fromEnv = env.VITE_SITE_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  const vercel = env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, "")}`;
  return "";
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const siteUrl = resolveSiteUrl(env);

  return {
    plugins: [
      react(),
      {
        name: "html-site-url",
        transformIndexHtml(html) {
          return html.replaceAll("%VITE_SITE_URL%", siteUrl);
        },
      },
    ],
    define: {
      "import.meta.env.VITE_SITE_URL": JSON.stringify(siteUrl),
    },
    build: {
      /*
       * Code-splitting manuel du bundle. Objectif : sortir les libs lourdes du
       * chunk d'entrée pour améliorer le cache long terme et différer leur
       * téléchargement.
       *
       * - `vendor-react` isole React/React-DOM. C'est indispensable ici : sans
       *   ce chunk, Rollup co-localise React DANS `vendor-recharts` (recharts
       *   dépend de React). Comme l'entrée a besoin de React, elle importerait
       *   alors statiquement `vendor-recharts` et chargerait recharts (~162 kB
       *   gzip) dès la page d'accueil. En isolant React, `vendor-recharts`
       *   redevient purement asynchrone : il n'est chargé qu'à l'ouverture d'un
       *   onglet de profil (charts montés en lazy via React.lazy).
       * - `vendor-recharts` isole recharts (≈ 590 kB, ≈ 162 kB gzip), la lib de
       *   dataviz, pour un cache stable indépendant des mises à jour applicatives.
       *
       * `chunkSizeWarningLimit` est remonté à 650 kB : le chunk recharts reste
       * gros par nature, le warning par défaut à 500 kB n'apporte plus d'info ici.
       */
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          /*
           * Forme fonction (et non objet) : indispensable pour router React
           * AVANT recharts. Avec la forme tableau, Rollup co-localise React
           * dans `vendor-recharts` (recharts en dépend) et l'entrée, qui a
           * besoin de React, importe alors recharts de façon statique → tout
           * recharts se charge dès l'accueil. En forçant React vers
           * `vendor-react`, recharts ne contient plus React et `vendor-recharts`
           * redevient purement asynchrone (chargé à l'ouverture d'un onglet).
           */
          manualChunks(id) {
            if (!id.includes("node_modules")) return undefined;
            if (
              id.includes("/react-dom/") ||
              id.includes("/react/") ||
              id.includes("/scheduler/")
            ) {
              return "vendor-react";
            }
            if (
              id.includes("/recharts/") ||
              id.includes("/recharts-scale/") ||
              id.includes("/victory-vendor/") ||
              id.includes("/d3-")
            ) {
              return "vendor-recharts";
            }
            return undefined;
          },
        },
      },
    },
    server: {
      host: "127.0.0.1",
      port: 5173,
      proxy: {
        "/api/anilist": {
          target: "https://graphql.anilist.co",
          changeOrigin: true,
          secure: true,
          rewrite: () => "/",
        },
      },
    },
    preview: {
      host: "127.0.0.1",
      port: 4173,
      proxy: {
        "/api/anilist": {
          target: "https://graphql.anilist.co",
          changeOrigin: true,
          secure: true,
          rewrite: () => "/",
        },
      },
    },
  };
});
