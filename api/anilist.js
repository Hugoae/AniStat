const crypto = require("crypto");

const ANILIST_GRAPHQL_URL = "https://graphql.anilist.co";
const CACHE_PREFIX = "anilist-proxy:v2";
const CACHE_TTL_DEFAULT_SECONDS = Number(process.env.ANILIST_SERVER_CACHE_TTL_SECONDS || 600);
const CACHE_TTL_USER_SECONDS = Number(process.env.ANILIST_SERVER_CACHE_TTL_USER_SECONDS || 900);
const CACHE_TTL_LIST_SECONDS = Number(process.env.ANILIST_SERVER_CACHE_TTL_LIST_SECONDS || 600);
const CACHE_TTL_ACTIVITY_SECONDS = Number(process.env.ANILIST_SERVER_CACHE_TTL_ACTIVITY_SECONDS || 120);
const CACHE_TTL_VOLATILE_SECONDS = Number(process.env.ANILIST_SERVER_CACHE_TTL_VOLATILE_SECONDS || 60);
const ENABLE_PROXY_LOGS = process.env.ANILIST_PROXY_LOGS === "1";

const UPSTASH_URL = process.env.UPSTASH_REDIS_REST_URL || "";
const UPSTASH_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || "";
const HAS_UPSTASH = Boolean(UPSTASH_URL && UPSTASH_TOKEN);

const memoryCache = new Map();
const proxyMetrics = {
  req: 0,
  hit: 0,
  miss: 0,
  bypass: 0,
  store: 0,
  upstreamErr: 0,
};

function parseBodySafe(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function makeCacheKey(bodyStr) {
  return `${CACHE_PREFIX}:${sha256(bodyStr)}`;
}

function isCacheableRequest(bodyObj) {
  if (!bodyObj || typeof bodyObj !== "object") return false;
  const query = String(bodyObj.query || "");
  if (!query.trim()) return false;
  return !query.trim().toLowerCase().startsWith("mutation");
}

function getCachePolicy(bodyObj) {
  if (!isCacheableRequest(bodyObj)) {
    return { cacheable: false, ttlSeconds: 0, label: "bypass-non-cacheable" };
  }

  const q = String(bodyObj.query || "").toLowerCase();
  const hasActivities = q.includes("activities(") || q.includes("listactivity");
  const hasMediaList = q.includes("medialistcollection");
  const hasUser = q.includes("user(");
  const hasPage = q.includes("page(");

  if (hasActivities) {
    return { cacheable: true, ttlSeconds: CACHE_TTL_ACTIVITY_SECONDS, label: "activity-short" };
  }
  if (hasMediaList) {
    return { cacheable: true, ttlSeconds: CACHE_TTL_LIST_SECONDS, label: "list-medium" };
  }
  if (hasUser) {
    return { cacheable: true, ttlSeconds: CACHE_TTL_USER_SECONDS, label: "user-medium" };
  }
  if (hasPage) {
    return { cacheable: true, ttlSeconds: CACHE_TTL_VOLATILE_SECONDS, label: "page-short" };
  }
  return { cacheable: true, ttlSeconds: CACHE_TTL_DEFAULT_SECONDS, label: "default" };
}

function maybeLogMetrics() {
  if (!ENABLE_PROXY_LOGS) return;
  if (proxyMetrics.req % 25 !== 0) return;
  const line = [
    "[anilist-proxy]",
    `req=${proxyMetrics.req}`,
    `hit=${proxyMetrics.hit}`,
    `miss=${proxyMetrics.miss}`,
    `bypass=${proxyMetrics.bypass}`,
    `store=${proxyMetrics.store}`,
    `upstreamErr=${proxyMetrics.upstreamErr}`,
  ].join(" ");
  // eslint-disable-next-line no-console
  console.log(line);
}

async function upstashGet(key) {
  const url = `${UPSTASH_URL}/get/${encodeURIComponent(key)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  if (!res.ok) return null;
  const json = await res.json();
  if (!json || json.result == null) return null;
  try {
    return JSON.parse(String(json.result));
  } catch {
    return null;
  }
}

async function upstashSetEx(key, ttlSeconds, payloadObj) {
  const url = `${UPSTASH_URL}/set/${encodeURIComponent(key)}/${encodeURIComponent(JSON.stringify(payloadObj))}?EX=${ttlSeconds}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${UPSTASH_TOKEN}` },
  });
  return res.ok;
}

function memoryGet(key) {
  const value = memoryCache.get(key);
  if (!value) return null;
  if (Date.now() > value.expiresAt) {
    memoryCache.delete(key);
    return null;
  }
  return value.payload;
}

function memorySet(key, ttlSeconds, payloadObj) {
  memoryCache.set(key, {
    expiresAt: Date.now() + ttlSeconds * 1000,
    payload: payloadObj,
  });
}

async function getCachedResponse(key) {
  if (HAS_UPSTASH) {
    try {
      return await upstashGet(key);
    } catch {
      return null;
    }
  }
  return memoryGet(key);
}

async function setCachedResponse(key, ttlSeconds, payloadObj) {
  if (HAS_UPSTASH) {
    try {
      await upstashSetEx(key, ttlSeconds, payloadObj);
      return;
    } catch {
      return;
    }
  }
  memorySet(key, ttlSeconds, payloadObj);
}

module.exports = async (req, res) => {
  proxyMetrics.req += 1;
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ errors: [{ message: "Method not allowed" }] });
  }

  const bodyStr = typeof req.body === "string" ? req.body : JSON.stringify(req.body ?? {});
  const bodyObj = parseBodySafe(bodyStr);
  const cachePolicy = getCachePolicy(bodyObj);
  const cacheable = cachePolicy.cacheable;
  const cacheKey = cacheable ? makeCacheKey(bodyStr) : null;

  if (cacheable && cacheKey) {
    const hit = await getCachedResponse(cacheKey);
    if (hit && typeof hit.status === "number" && typeof hit.text === "string") {
      proxyMetrics.hit += 1;
      maybeLogMetrics();
      res.status(hit.status);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.setHeader("X-Proxy-Cache", "HIT");
      res.setHeader("X-Proxy-Cache-Policy", cachePolicy.label);
      return res.send(hit.text);
    }
  }

  try {
    const upstream = await fetch(ANILIST_GRAPHQL_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: bodyStr,
    });
    const text = await upstream.text();
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    if (cacheable) {
      proxyMetrics.miss += 1;
      res.setHeader("X-Proxy-Cache", "MISS");
      res.setHeader("X-Proxy-Cache-Policy", cachePolicy.label);
    } else {
      proxyMetrics.bypass += 1;
      res.setHeader("X-Proxy-Cache", "BYPASS");
      res.setHeader("X-Proxy-Cache-Policy", cachePolicy.label);
    }

    // Forward useful rate-limit headers to the browser-side scheduler.
    const retryAfter = upstream.headers.get("Retry-After");
    const rateLimitReset = upstream.headers.get("X-RateLimit-Reset");
    const rateLimitRemaining = upstream.headers.get("X-RateLimit-Remaining");
    const rateLimitLimit = upstream.headers.get("X-RateLimit-Limit");
    if (retryAfter) res.setHeader("Retry-After", retryAfter);
    if (rateLimitReset) res.setHeader("X-RateLimit-Reset", rateLimitReset);
    if (rateLimitRemaining) res.setHeader("X-RateLimit-Remaining", rateLimitRemaining);
    if (rateLimitLimit) res.setHeader("X-RateLimit-Limit", rateLimitLimit);

    if (cacheable && cacheKey && upstream.status === 200) {
      const parsed = parseBodySafe(text);
      if (parsed && !parsed.errors) {
        await setCachedResponse(cacheKey, cachePolicy.ttlSeconds, { status: 200, text });
        proxyMetrics.store += 1;
      }
    }
    maybeLogMetrics();

    return res.send(text);
  } catch (e) {
    proxyMetrics.upstreamErr += 1;
    maybeLogMetrics();
    return res.status(502).json({
      errors: [{ message: e.message || "Proxy error" }],
    });
  }
};
