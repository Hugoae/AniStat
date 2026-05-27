-- Variant A: public read (anon SELECT), writes only via service_role (API route).
-- Apply after deploying /api/supabase-sync with SUPABASE_SERVICE_ROLE_KEY.

DROP POLICY IF EXISTS anon_write_activities ON public.activities;
DROP POLICY IF EXISTS anon_write_activity_sync_state ON public.activity_sync_state;
DROP POLICY IF EXISTS anon_write_media_list_snapshots ON public.media_list_snapshots;
DROP POLICY IF EXISTS anon_write_sync_runs ON public.sync_runs;
DROP POLICY IF EXISTS anon_write_tracked_users ON public.tracked_users;
