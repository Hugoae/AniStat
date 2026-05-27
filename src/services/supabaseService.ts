import { postSupabaseSyncAction } from "../api/supabaseSyncClient";
import { supabase } from "../lib/supabaseClient";
import type { ActivityItem, AniListEntry, AniListUser } from "../types/domain";

type MediaListSnapshotType = "ANIME" | "MANGA";
type ActivitySnapshotType = "ANIME_LIST" | "MANGA_LIST";
type SyncRunKind = "delta" | "manual";
type SyncRunStatus = "success" | "error";

const ACTIVITY_SELECT_PAGE_SIZE = 1000;
const ACTIVITY_UPSERT_CHUNK_SIZE = 500;

export type SupabaseProfileBundle = {
  user: AniListUser;
  allAnime: AniListEntry[];
  allManga: AniListEntry[];
  syncedAt: string | null;
};

function getYearBoundsUnix(year: number): { startUnix: number; endUnix: number } {
  return {
    startUnix: Math.floor(new Date(year, 0, 1, 0, 0, 0, 0).getTime() / 1000),
    endUnix: Math.floor(new Date(year + 1, 0, 1, 0, 0, 0, 0).getTime() / 1000),
  };
}

export async function getUserAndLists(username: string): Promise<SupabaseProfileBundle | null> {
  const normalized = String(username || "").trim();
  if (!normalized) return null;
  const normalizedLower = normalized.toLowerCase();

  const { data: userRow, error: userError } = await supabase
    .from("tracked_users")
    .select("anilist_user_id, anilist_name, avatar_url, banner_image, updated_at")
    .eq("anilist_name_lower", normalizedLower)
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
  const yearBounds = year > 0 ? getYearBoundsUnix(year) : null;

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
        .gte("created_at_unix", yearBounds.startUnix)
        .lt("created_at_unix", yearBounds.endUnix);
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
  await postSupabaseSyncAction("upsertUser", { user });
}

export async function saveMediaListSnapshot(
  userId: number,
  type: MediaListSnapshotType,
  entries: AniListEntry[]
): Promise<void> {
  await postSupabaseSyncAction("saveMediaListSnapshot", { userId, type, entries });
}

function chunkArray<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    chunks.push(rows.slice(i, i + size));
  }
  return chunks;
}

export async function saveActivities(
  userId: number,
  activityType: ActivitySnapshotType,
  activities: ActivityItem[]
): Promise<void> {
  if (activities.length === 0) return;
  for (const chunk of chunkArray(activities, ACTIVITY_UPSERT_CHUNK_SIZE)) {
    await postSupabaseSyncAction("saveActivities", { userId, activityType, activities: chunk });
  }
}

export async function updateActivitySyncState(
  userId: number,
  activityType: ActivitySnapshotType,
  activities: ActivityItem[]
): Promise<void> {
  await postSupabaseSyncAction("updateActivitySyncState", {
    userId,
    activityType,
    activities,
  });
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
  await postSupabaseSyncAction("recordSyncRun", {
    userId: args.userId,
    kind: args.kind,
    status: args.status,
    pagesFetched: args.pagesFetched ?? 0,
    rowsUpserted: args.rowsUpserted ?? 0,
    errorMessage: args.errorMessage ?? null,
    metadata: args.metadata ?? {},
  });
}
