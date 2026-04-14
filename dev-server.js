/**
 * Serveur statique + proxy POST /api/anilist → AniList (Node sans Vite).
 * Pour le développement de l’UI : préférer `npm run dev` (Vite, proxy intégré).
 */
const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const { URL } = require("url");

const HOST = "127.0.0.1";
const PORT = Number(process.env.PORT || 5500);
const ROOT = __dirname;
const ANILIST_API = "https://graphql.anilist.co";

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  res.end(JSON.stringify(payload));
}

function pipeAniList(req, res, body) {
  const upstream = new URL(ANILIST_API);
  const proxyReq = https.request(
    {
      protocol: upstream.protocol,
      hostname: upstream.hostname,
      port: upstream.port || 443,
      path: upstream.pathname,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 20000,
    },
    (proxyRes) => {
      const chunks = [];
      proxyRes.on("data", (chunk) => chunks.push(chunk));
      proxyRes.on("end", () => {
        const responseBody = Buffer.concat(chunks);
        res.writeHead(proxyRes.statusCode || 502, {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
        });
        res.end(responseBody);
      });
    }
  );

  proxyReq.on("timeout", () => {
    proxyReq.destroy(new Error("AniList timeout"));
  });
  proxyReq.on("error", (err) => {
    sendJson(res, 502, { errors: [{ message: `Proxy error: ${err.message}` }] });
  });

  proxyReq.write(body);
  proxyReq.end();
}

function serveStatic(req, res, pathname) {
  const requested = pathname === "/" ? "/index.html" : pathname;
  const safePath = path.normalize(decodeURIComponent(requested)).replace(/^(\.\.[/\\])+/, "");
  const filePath = path.join(ROOT, safePath);

  if (!filePath.startsWith(ROOT)) {
    sendJson(res, 403, { error: "Forbidden" });
    return;
  }

  fs.stat(filePath, (statErr, stats) => {
    if (statErr || !stats.isFile()) {
      sendJson(res, 404, { error: "File not found" });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === "/api/anilist") {
    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 1024 * 1024) {
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        JSON.parse(body);
      } catch {
        sendJson(res, 400, { error: "Invalid JSON body" });
        return;
      }
      pipeAniList(req, res, body);
    });
    req.on("error", () => {
      sendJson(res, 400, { error: "Invalid request body" });
    });
    return;
  }

  serveStatic(req, res, url.pathname);
});

server.listen(PORT, HOST, () => {
  console.log(`AniList dashboard server running at http://${HOST}:${PORT}`);
});
