ALTER TABLE public.entries DROP CONSTRAINT IF EXISTS entries_run_id_fkey;
ALTER TABLE public.entries
  ADD COLUMN IF NOT EXISTS run_id TEXT,
  ADD COLUMN IF NOT EXISTS test_case TEXT,
  ADD COLUMN IF NOT EXISTS matched_via TEXT,
  ADD COLUMN IF NOT EXISTS title TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS entry_date DATE;
ALTER TABLE public.entries ALTER COLUMN run_id TYPE TEXT USING run_id::text;

UPDATE public.entries
SET title = COALESCE((SELECT standard_name FROM public.features WHERE id = entries.feature_id), raw_feature_name)
WHERE title IS NULL;

ALTER TABLE public.entries ALTER COLUMN title SET NOT NULL;
ALTER TABLE public.entries ALTER COLUMN verify_status SET DEFAULT 'unverified';

DROP VIEW IF EXISTS public.vw_weekly_digest;
DROP POLICY IF EXISTS "public review pending" ON public.entries;
DROP POLICY IF EXISTS "public approve" ON public.entries;
REVOKE UPDATE ON public.entries FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (approval_status, approved_by, approved_at) ON public.entries FROM anon, authenticated;
ALTER TABLE public.entries DROP COLUMN IF EXISTS approved;
CREATE INDEX IF NOT EXISTS idx_entries_approval_date ON public.entries (approval_status, retrieved_at DESC);
GRANT UPDATE (approval_status, approved_by, approved_at) ON public.entries TO anon, authenticated;

CREATE POLICY "public review pending" ON public.entries
  FOR UPDATE TO anon, authenticated
  USING (approval_status = 'pending')
  WITH CHECK (
    approval_status IN ('approved', 'rejected')
    AND length(trim(approved_by)) > 0
    AND approved_at IS NOT NULL
  );

CREATE VIEW public.vw_weekly_digest WITH (security_invoker = on) AS
SELECT
  e.id,
  c.name AS competitor_name,
  COALESCE(f.standard_name, e.title, e.raw_feature_name) AS display_feature_name,
  e.raw_feature_name,
  e.feature_id AS mapped_feature_id,
  e.status,
  e.confidence,
  e.reason,
  e.source_url,
  e.source_type,
  e.retrieved_at,
  e.approval_status,
  e.approved_by,
  e.approved_at,
  e.verify_status,
  e.run_id,
  e.test_case,
  e.matched_via,
  e.title,
  e.description,
  e.entry_date
FROM public.entries e
JOIN public.competitors c ON e.competitor_id = c.id
LEFT JOIN public.features f ON e.feature_id = f.id
ORDER BY e.retrieved_at DESC;

GRANT SELECT ON public.vw_weekly_digest TO anon, authenticated, service_role;
