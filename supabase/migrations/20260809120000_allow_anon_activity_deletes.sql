-- Allow the public SPA to remove cached activity rows that AniList no longer
-- returns during a bounded manual reconciliation.

DROP POLICY IF EXISTS anon_delete_activities ON public.activities;
CREATE POLICY anon_delete_activities
  ON public.activities FOR DELETE TO anon USING (true);
