-- Optimize read paths used by src/services/supabaseService.ts.
--
-- User lookups are case-insensitive but exact. Exposing a stored lowercase
-- column lets PostgREST use a normal btree equality filter instead of ILIKE.
ALTER TABLE public.tracked_users
  ADD COLUMN IF NOT EXISTS anilist_name_lower text
  GENERATED ALWAYS AS (lower(anilist_name)) STORED;

CREATE INDEX IF NOT EXISTS tracked_users_anilist_name_lower_stored_idx
  ON public.tracked_users (anilist_name_lower);

-- Activity year reads now filter on created_at_unix, which is already covered
-- by activities_user_type_created_desc_idx:
--   (anilist_user_id, activity_type, created_at_unix DESC)
