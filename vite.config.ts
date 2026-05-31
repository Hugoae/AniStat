import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  return {
    plugins: [react()],
    build: {
      /*
       * Code-splitting manuel du bundle. L'objectif est de sortir les libs
       * lourdes et peu couplées du chunk principal pour améliorer le cache
       * long terme et paralléliser le téléchargement.
       *
       * - `recharts` représente à lui seul ≈ 75 % de l'ancien chunk principal ;
       *   on l'isole dans `vendor-recharts` (≈ 590 kB, ≈ 162 kB gzip).
       * - React est laissé dans le chunk applicatif : Vite l'inline via son
       *   plugin officiel, le forcer dans un chunk séparé ne rend qu'un
       *   fichier vide (≈ 40 octets).
       *
       * `chunkSizeWarningLimit` est remonté à 650 kB : le chunk Recharts
       * reste gros par nature (c'est une lib de dataviz complète), le
       * warning par défaut à 500 kB n'apporte plus d'info utile ici.
       */
      chunkSizeWarningLimit: 650,
      rollupOptions: {
        output: {
          manualChunks: {
            "vendor-recharts": ["recharts"],
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
