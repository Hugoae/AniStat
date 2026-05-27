-- AniStat Supabase schema.
--
-- Access model:
-- - anon can SELECT public stats/cache tables (public AniList dashboards)
-- - writes are performed by /api/supabase-sync with SUPABASE_SERVICE_ROLE_KEY

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.tracked_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anilist_user_id bigint NOT NULL UNIQUE,
  anilist_name text NOT NULL UNIQUE,
  avatar_url text,
  banner_image text,
  sync_status text NOT NULL DEFAULT 'pending'
    CHECK (sync_status = ANY (ARRAY[
      'pending',
      'initial_syncing',
      'ready',
      'delta_syncing',
      'error'
    ]::text[])),
  last_profile_sync_at timestamptz,
  last_full_activity_sync_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  anilist_name_lower text GENERATED ALWAYS AS (lower(anilist_name)) STORED
);

CREATE TABLE IF NOT EXISTS public.media_list_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anilist_user_id bigint NOT NULL
    REFERENCES public.tracked_users(anilist_user_id) ON DELETE CASCADE,
  media_type text NOT NULL
    CHECK (media_type = ANY (ARRAY['ANIME', 'MANGA']::text[])),
  payload_jsonb jsonb NOT NULL DEFAULT '[]'::jsonb,
  source_query_version text NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  entry_count integer NOT NULL DEFAULT 0 CHECK (entry_count >= 0),
  max_updated_at bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (anilist_user_id, media_type)
);

CREATE TABLE IF NOT EXISTS public.activities (
  id bigint PRIMARY KEY,
  anilist_user_id bigint NOT NULL
    REFERENCES public.tracked_users(anilist_user_id) ON DELETE CASCADE,
  activity_type text NOT NULL
    CHECK (activity_type = ANY (ARRAY['ANIME_LIST', 'MANGA_LIST']::text[])),
  media_id bigint,
  created_at_unix bigint NOT NULL,
  created_at_ts timestamptz NOT NULL,
  status text,
  progress text,
  payload_jsonb jsonb NOT NULL DEFAULT '{}'::jsonb,
  fetched_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.activity_sync_state (
  anilist_user_id bigint NOT NULL
    REFERENCES public.tracked_users(anilist_user_id) ON DELETE CASCADE,
  activity_type text NOT NULL
    CHECK (activity_type = ANY (ARRAY['ANIME_LIST', 'MANGA_LIST']::text[])),
  latest_activity_id bigint,
  latest_created_at_unix bigint,
  oldest_created_at_unix bigint,
  full_sync_completed boolean NOT NULL DEFAULT false,
  last_delta_sync_at timestamptz,
  last_full_sync_at timestamptz,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (anilist_user_id, activity_type)
);

CREATE TABLE IF NOT EXISTS public.sync_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  anilist_user_id bigint
    REFERENCES public.tracked_users(anilist_user_id) ON DELETE CASCADE,
  kind text NOT NULL
    CHECK (kind = ANY (ARRAY[
      'initial_full',
      'delta',
      'media_list_refresh',
      'manual'
    ]::text[])),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status = ANY (ARRAY[
      'queued',
      'running',
      'success',
      'error',
      'cancelled'
    ]::text[])),
  started_at timestamptz,
  finished_at timestamptz,
  pages_fetched integer NOT NULL DEFAULT 0 CHECK (pages_fetched >= 0),
  rows_upserted integer NOT NULL DEFAULT 0 CHECK (rows_upserted >= 0),
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tracked_users_anilist_name_lower_stored_idx
  ON public.tracked_users (anilist_name_lower);
CREATE INDEX IF NOT EXISTS tracked_users_sync_status_idx
  ON public.tracked_users (sync_status);

CREATE INDEX IF NOT EXISTS media_list_snapshots_user_type_idx
  ON public.media_list_snapshots (anilist_user_id, media_type);
CREATE INDEX IF NOT EXISTS media_list_snapshots_fetched_at_idx
  ON public.media_list_snapshots (fetched_at DESC);
CREATE INDEX IF NOT EXISTS media_list_snapshots_payload_gin_idx
  ON public.media_list_snapshots USING gin (payload_jsonb);

CREATE INDEX IF NOT EXISTS activities_user_created_desc_idx
  ON public.activities (anilist_user_id, created_at_unix DESC);
CREATE INDEX IF NOT EXISTS activities_user_type_created_desc_idx
  ON public.activities (anilist_user_id, activity_type, created_at_unix DESC);
CREATE INDEX IF NOT EXISTS activities_user_type_media_idx
  ON public.activities (anilist_user_id, activity_type, media_id);
CREATE INDEX IF NOT EXISTS activities_media_id_idx
  ON public.activities (media_id);
CREATE INDEX IF NOT EXISTS activities_payload_gin_idx
  ON public.activities USING gin (payload_jsonb);

CREATE INDEX IF NOT EXISTS activity_sync_state_completed_idx
  ON public.activity_sync_state (full_sync_completed);
CREATE INDEX IF NOT EXISTS activity_sync_state_last_delta_idx
  ON public.activity_sync_state (last_delta_sync_at DESC);

CREATE INDEX IF NOT EXISTS sync_runs_user_created_desc_idx
  ON public.sync_runs (anilist_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS sync_runs_kind_idx
  ON public.sync_runs (kind);
CREATE INDEX IF NOT EXISTS sync_runs_status_idx
  ON public.sync_runs (status);

DROP TRIGGER IF EXISTS set_tracked_users_updated_at ON public.tracked_users;
CREATE TRIGGER set_tracked_users_updated_at
  BEFORE UPDATE ON public.tracked_users
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_media_list_snapshots_updated_at ON public.media_list_snapshots;
CREATE TRIGGER set_media_list_snapshots_updated_at
  BEFORE UPDATE ON public.media_list_snapshots
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS set_activity_sync_state_updated_at ON public.activity_sync_state;
CREATE TRIGGER set_activity_sync_state_updated_at
  BEFORE UPDATE ON public.activity_sync_state
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.tracked_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_list_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sync_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'tracked_users'
      AND policyname = 'anon_select_tracked_users'
  ) THEN
    CREATE POLICY anon_select_tracked_users
      ON public.tracked_users
      FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'media_list_snapshots'
      AND policyname = 'anon_select_media_list_snapshots'
  ) THEN
    CREATE POLICY anon_select_media_list_snapshots
      ON public.media_list_snapshots
      FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activities'
      AND policyname = 'anon_select_activities'
  ) THEN
    CREATE POLICY anon_select_activities
      ON public.activities
      FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'activity_sync_state'
      AND policyname = 'anon_select_activity_sync_state'
  ) THEN
    CREATE POLICY anon_select_activity_sync_state
      ON public.activity_sync_state
      FOR SELECT
      TO anon
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'sync_runs'
      AND policyname = 'anon_select_sync_runs'
  ) THEN
    CREATE POLICY anon_select_sync_runs
      ON public.sync_runs
      FOR SELECT
      TO anon
      USING (true);
  END IF;
END;
$$;
