-- Restore client-side writes: allow the anon role to INSERT/UPDATE on the
-- public AniList cache tables. The browser SPA writes directly with the public
-- anon key (no service_role / server endpoint). Data here is public AniList
-- stats, so anon writes are acceptable for this project.
--
-- Reverses 20260527120000_lock_anon_writes.sql.
-- Upsert (INSERT ... ON CONFLICT DO UPDATE) needs BOTH INSERT and UPDATE.

-- tracked_users (upsert) ----------------------------------------------------
DROP POLICY IF EXISTS anon_insert_tracked_users ON public.tracked_users;
CREATE POLICY anon_insert_tracked_users
  ON public.tracked_users FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS anon_update_tracked_users ON public.tracked_users;
CREATE POLICY anon_update_tracked_users
  ON public.tracked_users FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- media_list_snapshots (upsert) ---------------------------------------------
DROP POLICY IF EXISTS anon_insert_media_list_snapshots ON public.media_list_snapshots;
CREATE POLICY anon_insert_media_list_snapshots
  ON public.media_list_snapshots FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS anon_update_media_list_snapshots ON public.media_list_snapshots;
CREATE POLICY anon_update_media_list_snapshots
  ON public.media_list_snapshots FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- activities (upsert) -------------------------------------------------------
DROP POLICY IF EXISTS anon_insert_activities ON public.activities;
CREATE POLICY anon_insert_activities
  ON public.activities FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS anon_update_activities ON public.activities;
CREATE POLICY anon_update_activities
  ON public.activities FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- activity_sync_state (upsert) ----------------------------------------------
DROP POLICY IF EXISTS anon_insert_activity_sync_state ON public.activity_sync_state;
CREATE POLICY anon_insert_activity_sync_state
  ON public.activity_sync_state FOR INSERT TO anon WITH CHECK (true);

DROP POLICY IF EXISTS anon_update_activity_sync_state ON public.activity_sync_state;
CREATE POLICY anon_update_activity_sync_state
  ON public.activity_sync_state FOR UPDATE TO anon USING (true) WITH CHECK (true);

-- sync_runs (insert only) ---------------------------------------------------
DROP POLICY IF EXISTS anon_insert_sync_runs ON public.sync_runs;
CREATE POLICY anon_insert_sync_runs
  ON public.sync_runs FOR INSERT TO anon WITH CHECK (true);
