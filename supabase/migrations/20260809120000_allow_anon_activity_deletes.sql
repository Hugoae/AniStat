-- Allow the anon SPA to delete stale activity rows during manual refresh
-- reconciliation (activities removed on AniList must disappear locally too).

DROP POLICY IF EXISTS anon_delete_activities ON public.activities;
CREATE POLICY anon_delete_activities
  ON public.activities FOR DELETE TO anon USING (true);
