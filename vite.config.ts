import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
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
});
