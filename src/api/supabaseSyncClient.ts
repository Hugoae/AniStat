const SYNC_API_PATH = "/api/supabase-sync";

type SyncAction =
  | "upsertUser"
  | "saveMediaListSnapshot"
  | "saveActivities"
  | "updateActivitySyncState"
  | "recordSyncRun";

export async function postSupabaseSyncAction(
  action: SyncAction,
  payload: unknown
): Promise<void> {
  const res = await fetch(SYNC_API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });

  if (res.ok) return;

  let message = `Supabase sync failed (${res.status})`;
  try {
    const body = (await res.json()) as { error?: string };
    if (body?.error) message = body.error;
  } catch {
    /* ignore */
  }
  throw new Error(message);
}
