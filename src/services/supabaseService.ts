import { supabase } from "../lib/supabaseClient";
import type { ActivityItem, AniListEntry, AniListUser } from "../types/domain";

type MediaListSnapshotType = "ANIME" | "MANGA";
type ActivitySnapshotType = "ANIME_LIST" | "MANGA_LIST";
type SyncRunKind = "delta" | "manual";
type SyncRunStatus = "success" | "error";

const ACTIVITY_UPSERT_CHUNK_SIZE = 500;
const ACTIVITY_SELECT_PAGE_SIZE = 1000;

export type SupabaseProfileBundle = {
  user: AniListUser;
  allAnime: AniListEntry[];
  allManga: AniListEntry[];
  syncedAt: string | null;
};

function maxUpdatedAt(entries: readonly AniListEntry[]): number | null {
  const max = entries.reduce((acc, entry) => {
    const updatedAt = Number(entry?.updatedAt || 0);
    return Number.isFinite(updatedAt) && updatedAt > acc ? updatedAt : acc;
  }, 0);
  return max > 0 ? max : null;
}

function mediaListSourceVersion(type: MediaListSnapshotType): string {
  return type === "ANIME" ? "anime_cov5" : "manga_cov3";
}

function chunkArray<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

function activityCreatedAtIso(createdAtUnix: number): string {
  return new Date(createdAtUnix * 1000).toISOString();
}

function getYearBoundsIso(year: number): { startIso: string; endIso: string } {
  return {
    startIso: new Date(year, 0, 1, 0, 0, 0, 0).toISOString(),
    endIso: new Date(year + 1, 0, 1, 0, 0, 0, 0).toISOString(),
  };
}

export async function getUserAndLists(username: string): Promise<SupabaseProfileBundle | null> {
  const normalized = String(username || "").trim();
  if (!normalized) return null;

  const { data: userRow, error: userError } = await supabase
    .from("tracked_users")
    .select("anilist_user_id, anilist_name, avatar_url, banner_image, updated_at")
    .ilike("anilist_name", normalized)
    .limit(1)
    .maybeSingle();

  if (userError) throw userError;
  if (!userRow) return null;

  const { data: snapshots, error: snapshotsError } = await supabase
    .from("media_list_snapshots")
    .select("media_type, payload_jsonb, fetched_at, updated_at")
    .eq("anilist_user_id", userRow.anilist_user_id)
    .in("media_type", ["ANIME", "MANGA"]);

  if (snapshotsError) throw snapshotsError;

  const animeSnapshot = snapshots?.find((row) => row.media_type === "ANIME");
  const mangaSnapshot = snapshots?.find((row) => row.media_type === "MANGA");
  if (!animeSnapshot || !mangaSnapshot) return null;
  const syncedAt =
    [animeSnapshot.updated_at, mangaSnapshot.updated_at, userRow.updated_at]
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return {
    user: {
      id: Number(userRow.anilist_user_id),
      name: String(userRow.anilist_name || normalized),
      avatar: {
        large: userRow.avatar_url ?? null,
        medium: userRow.avatar_url ?? null,
      },
      bannerImage: userRow.banner_image ?? null,
    },
    allAnime: Array.isArray(animeSnapshot.payload_jsonb)
      ? (animeSnapshot.payload_jsonb as AniListEntry[])
      : [],
    allManga: Array.isArray(mangaSnapshot.payload_jsonb)
      ? (mangaSnapshot.payload_jsonb as AniListEntry[])
      : [],
    syncedAt,
  };
}

export async function getActivities(
  userId: number,
  activityType: ActivitySnapshotType,
  year: number
): Promise<ActivityItem[]> {
  const rows: Array<{ payload_jsonb: unknown }> = [];
  const yearBounds = year > 0 ? getYearBoundsIso(year) : null;

  for (let from = 0; ; from += ACTIVITY_SELECT_PAGE_SIZE) {
    let query = supabase
      .from("activities")
      .select("payload_jsonb")
      .eq("anilist_user_id", userId)
      .eq("activity_type", activityType)
      .order("created_at_unix", { ascending: false })
      .range(from, from + ACTIVITY_SELECT_PAGE_SIZE - 1);

    if (yearBounds) {
      query = query
        .gte("created_at_ts", yearBounds.startIso)
        .lt("created_at_ts", yearBounds.endIso);
    }

    const { data, error } = await query;
    if (error) throw error;
    rows.push(...((data ?? []) as Array<{ payload_jsonb: unknown }>));
    if (!data || data.length < ACTIVITY_SELECT_PAGE_SIZE) break;
  }

  return rows
    .map((row) => row.payload_jsonb)
    .filter((payload): payload is ActivityItem => Boolean(payload && typeof payload === "object"));
}

export async function getLatestActivityId(
  userId: number,
  activityType: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("activities")
    .select("id")
    .eq("anilist_user_id", userId)
    .eq("activity_type", activityType)
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  const id = Number(data?.id || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

export async function upsertUser(user: AniListUser): Promise<void> {
  const { error } = await supabase
    .from("tracked_users")
    .upsert(
      {
        anilist_user_id: user.id,
        anilist_name: user.name,
        avatar_url: user.avatar?.large || user.avatar?.medium || null,
        banner_image: user.bannerImage || null,
        sync_status: "ready",
        last_profile_sync_at: new Date().toISOString(),
      },
      { onConflict: "anilist_user_id" }
    );

  if (error) throw error;
}

export async function saveMediaListSnapshot(
  userId: number,
  type: MediaListSnapshotType,
  entries: AniListEntry[]
): Promise<void> {
  const { error } = await supabase
    .from("media_list_snapshots")
    .upsert(
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

export async function saveActivities(
  userId: number,
  activityType: ActivitySnapshotType,
  activities: ActivityItem[]
): Promise<void> {
  const rows = activities
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
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return;

  for (const chunk of chunkArray(rows, ACTIVITY_UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from("activities")
      .upsert(chunk, { onConflict: "id" });
    if (error) throw error;
  }
}

export async function updateActivitySyncState(
  userId: number,
  activityType: ActivitySnapshotType,
  activities: ActivityItem[]
): Promise<void> {
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

  const { error } = await supabase
    .from("activity_sync_state")
    .upsert(
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

export async function recordSyncRun(args: {
  userId: number;
  kind: SyncRunKind;
  status: SyncRunStatus;
  pagesFetched?: number;
  rowsUpserted?: number;
  errorMessage?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const finishedAt = new Date().toISOString();
  const { error } = await supabase
    .from("sync_runs")
    .insert({
      anilist_user_id: args.userId,
      kind: args.kind,
      status: args.status,
      started_at: finishedAt,
      finished_at: finishedAt,
      pages_fetched: args.pagesFetched ?? 0,
      rows_upserted: args.rowsUpserted ?? 0,
      error_message: args.errorMessage ?? null,
      metadata: args.metadata ?? {},
    });

  if (error) throw error;
}
