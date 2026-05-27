import { createClient } from "@supabase/supabase-js";

const ACTIVITY_UPSERT_CHUNK_SIZE = 500;
const MAX_ACTIVITIES_PER_REQUEST = 500;
const MAX_LIST_ENTRIES = 30_000;

const MEDIA_TYPES = new Set(["ANIME", "MANGA"]);
const ACTIVITY_TYPES = new Set(["ANIME_LIST", "MANGA_LIST"]);
const SYNC_RUN_KINDS = new Set(["delta", "manual"]);
const SYNC_RUN_STATUSES = new Set(["success", "error"]);

function getAdminClient() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !key) {
    throw new Error(
      "Supabase admin credentials missing (SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY)."
    );
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

function assertPositiveInt(value, label) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || Math.floor(n) !== n) {
    throw new Error(`Invalid ${label}`);
  }
  return n;
}

function chunkArray(rows, size) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function activityCreatedAtIso(createdAtUnix) {
  return new Date(createdAtUnix * 1000).toISOString();
}

function maxUpdatedAt(entries) {
  const max = entries.reduce((acc, entry) => {
    const updatedAt = Number(entry?.updatedAt || 0);
    return Number.isFinite(updatedAt) && updatedAt > acc ? updatedAt : acc;
  }, 0);
  return max > 0 ? max : null;
}

function mediaListSourceVersion(type) {
  return type === "ANIME" ? "anime_cov5" : "manga_cov3";
}

function mapActivitiesToRows(userId, activityType, activities) {
  return activities
    .map((activity) => {
      const id = Number(activity?.id || 0);
      const createdAtUnix = Number(activity?.createdAt || 0);
      if (!Number.isFinite(id) || id <= 0) return null;
      if (!Number.isFinite(createdAtUnix) || createdAtUnix <= 0) return null;
      return {
        id,
        anilist_user_id: userId,
        activity_type: activityType,
        media_id: activity.media?.id ?? null,
        created_at_unix: createdAtUnix,
        created_at_ts: activityCreatedAtIso(createdAtUnix),
        status: activity.status ?? null,
        progress: activity.progress == null ? null : String(activity.progress),
        payload_jsonb: activity,
        fetched_at: new Date().toISOString(),
      };
    })
    .filter(Boolean);
}

async function upsertUser(payload) {
  const user = payload?.user;
  if (!user || typeof user !== "object") throw new Error("Invalid user payload");
  const userId = assertPositiveInt(user.id, "user.id");
  const name = String(user.name || "").trim();
  if (!name) throw new Error("Invalid user.name");

  const supabase = getAdminClient();
  const { error } = await supabase.from("tracked_users").upsert(
    {
      anilist_user_id: userId,
      anilist_name: name,
      avatar_url: user.avatar?.large || user.avatar?.medium || null,
      banner_image: user.bannerImage || null,
      sync_status: "ready",
      last_profile_sync_at: new Date().toISOString(),
    },
    { onConflict: "anilist_user_id" }
  );
  if (error) throw error;
}

async function saveMediaListSnapshot(payload) {
  const userId = assertPositiveInt(payload?.userId, "userId");
  const type = payload?.type;
  if (!MEDIA_TYPES.has(type)) throw new Error("Invalid media list type");
  const entries = payload?.entries;
  if (!Array.isArray(entries)) throw new Error("Invalid entries");
  if (entries.length > MAX_LIST_ENTRIES) {
    throw new Error(`Too many list entries (max ${MAX_LIST_ENTRIES})`);
  }

  const supabase = getAdminClient();
  const { error } = await supabase.from("media_list_snapshots").upsert(
    {
      anilist_user_id: userId,
      media_type: type,
      payload_jsonb: entries,
      source_query_version: mediaListSourceVersion(type),
      fetched_at: new Date().toISOString(),
      entry_count: entries.length,
      max_updated_at: maxUpdatedAt(entries),
    },
    { onConflict: "anilist_user_id,media_type" }
  );
  if (error) throw error;
}

async function saveActivities(payload) {
  const userId = assertPositiveInt(payload?.userId, "userId");
  const activityType = payload?.activityType;
  if (!ACTIVITY_TYPES.has(activityType)) throw new Error("Invalid activityType");
  const activities = payload?.activities;
  if (!Array.isArray(activities)) throw new Error("Invalid activities");
  if (activities.length > MAX_ACTIVITIES_PER_REQUEST) {
    throw new Error(`Too many activities per request (max ${MAX_ACTIVITIES_PER_REQUEST})`);
  }

  const rows = mapActivitiesToRows(userId, activityType, activities);
  if (rows.length === 0) return;

  const supabase = getAdminClient();
  for (const chunk of chunkArray(rows, ACTIVITY_UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase.from("activities").upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }
}

async function updateActivitySyncState(payload) {
  const userId = assertPositiveInt(payload?.userId, "userId");
  const activityType = payload?.activityType;
  if (!ACTIVITY_TYPES.has(activityType)) throw new Error("Invalid activityType");
  const activities = payload?.activities;
  if (!Array.isArray(activities)) throw new Error("Invalid activities");

  const valid = activities
    .map((activity) => ({
      id: Number(activity?.id || 0),
      createdAtUnix: Number(activity?.createdAt || 0),
    }))
    .filter(
      (activity) =>
        Number.isFinite(activity.id) &&
        activity.id > 0 &&
        Number.isFinite(activity.createdAtUnix) &&
        activity.createdAtUnix > 0
    );

  if (valid.length === 0) return;

  const latest = valid.reduce((best, activity) => {
    if (activity.createdAtUnix > best.createdAtUnix) return activity;
    if (activity.createdAtUnix === best.createdAtUnix && activity.id > best.id) return activity;
    return best;
  }, valid[0]);
  const oldest = valid.reduce((best, activity) =>
    activity.createdAtUnix < best.createdAtUnix ? activity : best
  , valid[0]);

  const supabase = getAdminClient();
  const { error } = await supabase.from("activity_sync_state").upsert(
    {
      anilist_user_id: userId,
      activity_type: activityType,
      latest_activity_id: latest.id,
      latest_created_at_unix: latest.createdAtUnix,
      oldest_created_at_unix: oldest.createdAtUnix,
      last_delta_sync_at: new Date().toISOString(),
      last_error: null,
    },
    { onConflict: "anilist_user_id,activity_type" }
  );
  if (error) throw error;
}

async function recordSyncRun(payload) {
  const userId = assertPositiveInt(payload?.userId, "userId");
  const kind = payload?.kind;
  const status = payload?.status;
  if (!SYNC_RUN_KINDS.has(kind)) throw new Error("Invalid sync run kind");
  if (!SYNC_RUN_STATUSES.has(status)) throw new Error("Invalid sync run status");

  const finishedAt = new Date().toISOString();
  const supabase = getAdminClient();
  const { error } = await supabase.from("sync_runs").insert({
    anilist_user_id: userId,
    kind,
    status,
    started_at: finishedAt,
    finished_at: finishedAt,
    pages_fetched: Number(payload?.pagesFetched) || 0,
    rows_upserted: Number(payload?.rowsUpserted) || 0,
    error_message: payload?.errorMessage ?? null,
    metadata: payload?.metadata && typeof payload.metadata === "object" ? payload.metadata : {},
  });
  if (error) throw error;
}

const HANDLERS = {
  upsertUser,
  saveMediaListSnapshot,
  saveActivities,
  updateActivitySyncState,
  recordSyncRun,
};

/**
 * @param {string} action
 * @param {unknown} payload
 */
export async function handleSyncAction(action, payload) {
  const handler = HANDLERS[action];
  if (!handler) throw new Error(`Unknown sync action: ${action}`);
  await handler(payload);
}
