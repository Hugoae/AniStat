import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

function readRequestBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

/** Expose /api/supabase-sync in `vite dev` (same contract as Vercel serverless). */
function supabaseSyncDevMiddleware(env: Record<string, string>): Plugin {
  return {
    name: "supabase-sync-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = req.url?.split("?")[0];
        if (path !== "/api/supabase-sync" || req.method !== "POST") {
          next();
          return;
        }

        process.env.SUPABASE_URL = env.SUPABASE_URL || env.VITE_SUPABASE_URL || "";
        process.env.SUPABASE_SERVICE_ROLE_KEY = env.SUPABASE_SERVICE_ROLE_KEY || "";

        try {
          const raw = await readRequestBody(req);
          const body = JSON.parse(raw) as { action?: string; payload?: unknown };
          const { handleSyncAction } = await import("./api/lib/supabaseWriteCore.js");
          await handleSyncAction(body.action, body.payload);
          res.statusCode = 200;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ ok: true }));
        } catch (err) {
          const message = err instanceof Error ? err.message : "Sync failed";
          const isClient =
            message.startsWith("Invalid") ||
            message.startsWith("Unknown") ||
            message.startsWith("Too many") ||
            message.includes("Missing");
          res.statusCode = isClient ? 400 : 500;
          res.setHeader("Content-Type", "application/json");
          res.end(JSON.stringify({ error: message }));
        }
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");

  return {
    plugins: [react(), supabaseSyncDevMiddleware(env)],
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
