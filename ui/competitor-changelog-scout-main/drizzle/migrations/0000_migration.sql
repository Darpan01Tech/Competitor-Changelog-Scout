CREATE TABLE public.competitors (id TEXT PRIMARY KEY, name TEXT NOT NULL, changelog_url TEXT NOT NULL, blog_url TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE public.features (id TEXT PRIMARY KEY, standard_name TEXT NOT NULL, aliases TEXT[] NOT NULL DEFAULT '{}', created_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE TABLE public.entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competitor_id TEXT NOT NULL REFERENCES public.competitors(id) ON DELETE CASCADE,
  feature_id TEXT REFERENCES public.features(id) ON DELETE SET NULL,
  raw_feature_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('shipped','announced','uncertain')),
  confidence NUMERIC(3,2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0 AND confidence <= 1),
  reason TEXT NOT NULL, source_url TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK (source_type IN ('changelog','blog','other')),
  retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  approved BOOLEAN NOT NULL DEFAULT FALSE,
  idempotency_key TEXT UNIQUE NOT NULL);
CREATE TABLE public.runs (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(), diff_summary JSONB NOT NULL DEFAULT '[]'::jsonb, status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running','waiting_approval','completed','failed')));
CREATE TABLE public.test_results (id TEXT PRIMARY KEY CHECK (id IN ('TC1','TC2','TC3','TC4')), scenario TEXT NOT NULL, input_url TEXT NOT NULL, expected_result TEXT NOT NULL, actual_result TEXT, evidence TEXT, passed BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW());
CREATE INDEX idx_entries_approved_date ON public.entries (approved, retrieved_at DESC);
CREATE INDEX idx_entries_status ON public.entries (status);
CREATE INDEX idx_features_aliases ON public.features USING GIN (aliases);

CREATE VIEW public.vw_weekly_digest WITH (security_invoker = on) AS
SELECT e.id, c.name AS competitor_name, COALESCE(f.standard_name, e.raw_feature_name) AS display_feature_name,
  e.raw_feature_name, e.feature_id AS mapped_feature_id, e.status, e.confidence, e.reason, e.source_url, e.source_type, e.retrieved_at, e.approved
FROM public.entries e JOIN public.competitors c ON e.competitor_id = c.id LEFT JOIN public.features f ON e.feature_id = f.id
ORDER BY e.retrieved_at DESC;

GRANT SELECT ON public.competitors, public.features, public.entries, public.runs, public.test_results, public.vw_weekly_digest TO anon, authenticated;
GRANT UPDATE (approved) ON public.entries TO anon, authenticated;
GRANT ALL ON public.competitors, public.features, public.entries, public.runs, public.test_results TO service_role;
GRANT SELECT ON public.vw_weekly_digest TO service_role;

ALTER TABLE public.competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.test_results ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public read" ON public.competitors FOR SELECT USING (true);
CREATE POLICY "public read" ON public.features FOR SELECT USING (true);
CREATE POLICY "public read" ON public.entries FOR SELECT USING (true);
CREATE POLICY "public approve" ON public.entries FOR UPDATE USING (approved = false) WITH CHECK (approved = true);
CREATE POLICY "public read" ON public.runs FOR SELECT USING (true);
CREATE POLICY "public read" ON public.test_results FOR SELECT USING (true);

INSERT INTO public.competitors (id, name, changelog_url, blog_url) VALUES
 ('comp_linear','Linear','https://linear.app/changelog','https://linear.app/blog'),
 ('comp_mock','MockCorp (Test Suite)','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc1-new.html','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc2-announced.html'),
 ('comp_tc3','MockCorp Rebranding','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc3-renamed.html',NULL),
 ('comp_tc4','MockCorp Vanishing','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc4-missing.html',NULL);
INSERT INTO public.features (id, standard_name, aliases) VALUES
 ('feat_ai_reply','AI Smart Reply',ARRAY['Quick Reply','Smart Compose','Magic Drafts']),
 ('feat_csv_export','Advanced CSV Export',ARRAY['Data Export','Spreadsheet Download']),
 ('feat_ai_summary','AI Summaries',ARRAY['Thread Summarizer','Auto Summary']);
INSERT INTO public.test_results (id, scenario, input_url, expected_result, actual_result, evidence, passed) VALUES
 ('TC1','New feature in changelog','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc1-new.html','Status = shipped, dated row with source link',NULL,'Changelog explicitly states: "Advanced CSV Export is now live and generally available."',FALSE),
 ('TC2','Feature in marketing post only','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc2-announced.html','Status = announced (not shipped)',NULL,'Blog post states: "Sneak peek at AI Summaries coming in Q1 next year. Join the waitlist."',FALSE),
 ('TC3','Feature renamed','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc3-renamed.html','Mapped to existing row (feat_ai_reply)',NULL,'Matched alias "Quick Reply" in features registry array.',FALSE),
 ('TC4','Changelog page removed (404)','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc4-missing.html','Status = uncertain (never mark feature removed)',NULL,'HTTP 404 Not Found returned during scrape; logged as uncertain per safety guardrail.',FALSE);
INSERT INTO public.runs (status, diff_summary) VALUES ('completed','[{"test_case":"TC1","change":"New shipped feature: Advanced CSV Export"},{"test_case":"TC3","change":"Renamed Quick Reply -> AI Smart Reply"}]'::jsonb);
INSERT INTO public.entries (competitor_id, feature_id, raw_feature_name, status, confidence, reason, source_url, source_type, approved, idempotency_key) VALUES
 ('comp_mock','feat_csv_export','Advanced CSV Export','shipped',0.97,'Changelog states the feature is "now live and generally available".','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc1-new.html','changelog',TRUE,'comp_mock|Advanced CSV Export|shipped|seed'),
 ('comp_mock','feat_ai_summary','AI Summaries','announced',0.88,'Marketing post mentions a waitlist and Q1 timeline; no release evidence.','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc2-announced.html','blog',TRUE,'comp_mock|AI Summaries|announced|seed'),
 ('comp_tc3','feat_ai_reply','Quick Reply','shipped',0.81,'"Quick Reply" matched alias of AI Smart Reply in features registry.','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc3-renamed.html','changelog',FALSE,'comp_tc3|Quick Reply|shipped|seed'),
 ('comp_tc4',NULL,'Unknown (page missing)','uncertain',0.35,'HTTP 404 returned during scrape; logged as uncertain per safety guardrail.','https://darpan01tech.github.io/Competitor-Changelog-Scout/tc4-missing.html','changelog',FALSE,'comp_tc4|unknown|uncertain|seed');