import { handleSyncAction } from "./lib/supabaseWriteCore.js";

const MAX_BODY_BYTES = 6 * 1024 * 1024;

function parseJsonBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }
  const raw = typeof req.body === "string" ? req.body : "";
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const contentLength = Number(req.headers["content-length"] || 0);
  if (contentLength > MAX_BODY_BYTES) {
    return res.status(413).json({ error: "Payload too large" });
  }

  const body = parseJsonBody(req);
  const action = body?.action;
  const payload = body?.payload;

  if (!action || typeof action !== "string") {
    return res.status(400).json({ error: "Missing action" });
  }

  try {
    await handleSyncAction(action, payload);
    return res.status(200).json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Sync failed";
    const isClient =
      message.startsWith("Invalid") ||
      message.startsWith("Unknown") ||
      message.startsWith("Too many");
    return res.status(isClient ? 400 : 500).json({ error: message });
  }
}
