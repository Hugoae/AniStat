/** Route SPA : `#/` ou `#/home` = accueil ; `#/user/Pseudo` = stats (refresh = même URL). */
export function parseRouteFromHash() {
  try {
    const raw = window.location.hash.replace(/^#/, "").trim();
    if (!raw || raw === "/" || /^\/home\/?$/i.test(raw)) return { type: "home" };
    const path = raw.startsWith("/") ? raw.slice(1) : raw;
    const m = path.match(/^user\/(.+)$/i);
    if (m) {
      const name = decodeURIComponent(m[1].replace(/\/$/, ""));
      if (name.trim()) return { type: "user", name: name.trim() };
    }
    return { type: "home" };
  } catch {
    return { type: "home" };
  }
}

export function profileHashForUserName(name) {
  const n = String(name || "").trim();
  if (!n) return "#/";
  return `#/user/${encodeURIComponent(n)}`;
}

export function initialLoadingFromHash() {
  const r = parseRouteFromHash();
  return r.type === "user" && Boolean(r.name && r.name.trim());
}
