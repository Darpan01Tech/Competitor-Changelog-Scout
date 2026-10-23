-- Make seeded compliance rows explicitly unrun and prevent anonymous review writes.
ALTER TABLE public.test_results
  ADD COLUMN execution_status TEXT NOT NULL DEFAULT 'not_run'
  CHECK (execution_status IN ('not_run', 'passed', 'failed'));

UPDATE public.test_results
SET execution_status = 'not_run',
    passed = FALSE;

DROP POLICY IF EXISTS "public review pending" ON public.entries;
DROP VIEW IF EXISTS public.vw_weekly_digest;
REVOKE UPDATE ON public.entries FROM PUBLIC, anon, authenticated;
REVOKE UPDATE (approval_status, approved_by, approved_at) ON public.entries FROM PUBLIC, anon, authenticated;

-- Remove only the exact synthetic demo records inserted by migration 0000.
DELETE FROM public.entries
WHERE idempotency_key IN (
  'comp_mock|Advanced CSV Export|shipped|seed',
  'comp_mock|AI Summaries|announced|seed',
  'comp_tc3|Quick Reply|shipped|seed',
  'comp_tc4|unknown|uncertain|seed'
);
DELETE FROM public.runs
WHERE status = 'completed'
  AND diff_summary = jsonb_build_array(
    jsonb_build_object('test_case', 'TC1', 'change', 'New shipped feature: Advanced CSV Export'),
    jsonb_build_object('test_case', 'TC3', 'change', 'Renamed Quick Reply -> AI Smart Reply')
  );

-- 0002 retained the legacy boolean in its digest view. Approval status is canonical.
ALTER TABLE public.entries DROP COLUMN IF EXISTS approved;
CREATE INDEX IF NOT EXISTS idx_entries_approval_date ON public.entries (approval_status, retrieved_at DESC);

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
