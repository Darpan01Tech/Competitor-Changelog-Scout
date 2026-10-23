-- Enable UUID generation extension
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ==========================================
-- 1. COMPETITORS TABLE
-- Stores tracked competitors and target URLs
-- ==========================================
CREATE TABLE IF NOT EXISTS competitors (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    changelog_url TEXT NOT NULL,
    blog_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 2. FEATURES REGISTRY TABLE
-- Stores canonical feature names and aliases for TC3 (Renamed Feature mapping)
-- ==========================================
CREATE TABLE IF NOT EXISTS features (
    id TEXT PRIMARY KEY,
    standard_name TEXT NOT NULL,
    aliases TEXT[] NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ==========================================
-- 3. PIPELINE RUNS & DIFF SNAPSHOTS TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    diff_summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'waiting_approval', 'completed', 'failed'))
);

-- ==========================================
-- 4. CHANGELOG ENTRIES TABLE
-- ==========================================
CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    feature_id TEXT REFERENCES features(id) ON DELETE SET NULL,
    -- n8n execution IDs are strings and are also embedded in digest snapshots.
    run_id TEXT,
    test_case TEXT,
    matched_via TEXT,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    entry_date DATE,
    raw_feature_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('shipped', 'announced', 'uncertain')),
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),
    reason TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('changelog', 'blog', 'other')),
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected')),
    approved_by TEXT,
    approved_at TIMESTAMPTZ,
    verify_status TEXT NOT NULL DEFAULT 'unverified' CHECK (verify_status IN ('unverified', 'match', 'mismatch')),
    idempotency_key TEXT UNIQUE NOT NULL
);

-- ==========================================
-- 5. OFFICIAL TEST CASES VERIFICATION TABLE
-- Stores proof for TC1, TC2, TC3, and TC4 for the UI
-- ==========================================
CREATE TABLE IF NOT EXISTS test_results (
    id TEXT PRIMARY KEY CHECK (id IN ('TC1', 'TC2', 'TC3', 'TC4')),
    scenario TEXT NOT NULL,
    input_url TEXT NOT NULL,
    expected_result TEXT NOT NULL,
    actual_result TEXT,
    evidence TEXT,
    passed BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Bring installations from the earlier boolean-based schema up to date.
DROP VIEW IF EXISTS vw_weekly_digest;
DROP POLICY IF EXISTS "public approve" ON entries;
DROP POLICY IF EXISTS "public review pending" ON entries;
ALTER TABLE entries DROP CONSTRAINT IF EXISTS entries_run_id_fkey;
ALTER TABLE entries
    ADD COLUMN IF NOT EXISTS run_id TEXT,
    ADD COLUMN IF NOT EXISTS test_case TEXT,
    ADD COLUMN IF NOT EXISTS matched_via TEXT,
    ADD COLUMN IF NOT EXISTS title TEXT,
    ADD COLUMN IF NOT EXISTS description TEXT NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS entry_date DATE;
ALTER TABLE entries ALTER COLUMN run_id TYPE TEXT USING run_id::text;
UPDATE entries
SET title = COALESCE((SELECT standard_name FROM features WHERE id = entries.feature_id), raw_feature_name)
WHERE title IS NULL;
ALTER TABLE entries ALTER COLUMN title SET NOT NULL;
UPDATE entries SET verify_status = 'unverified' WHERE verify_status IS NULL;
ALTER TABLE entries ALTER COLUMN verify_status SET DEFAULT 'unverified';
ALTER TABLE entries ALTER COLUMN verify_status SET NOT NULL;
ALTER TABLE entries DROP COLUMN IF EXISTS approved;

-- ==========================================
-- 6. PERFORMANCE INDEXES
-- Speeds up dashboard filtering and alias lookups
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_entries_approval_date ON entries (approval_status, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries (status);
CREATE INDEX IF NOT EXISTS idx_features_aliases ON features USING GIN (aliases);

-- ==========================================
-- 7. FRONTEND VIEW (WEEKLY DIGEST)
-- ==========================================
CREATE VIEW vw_weekly_digest WITH (security_invoker = on) AS
SELECT 
    e.id,
    e.run_id,
    e.test_case,
    e.retrieved_at,
    e.entry_date,
    COALESCE(f.standard_name, e.title, e.raw_feature_name) AS display_feature_name,
    e.matched_via,
    c.name AS competitor_name,
    e.raw_feature_name,
    e.status,
    e.confidence,
    e.reason,
    e.source_url,
    e.source_type,
    e.approval_status,
    e.approved_by,
    e.approved_at,
    e.verify_status
FROM entries e
JOIN competitors c ON e.competitor_id = c.id
LEFT JOIN features f ON e.feature_id = f.id
ORDER BY e.retrieved_at DESC;

-- ==========================================
-- 8. SEED DATA (Competitors, Features, & Test Cases)
-- Pre-populates data
-- ==========================================

-- Seed Competitors
INSERT INTO competitors (id, name, changelog_url, blog_url) VALUES
    ('comp_linear', 'Linear', 'https://linear.app/changelog', 'https://linear.app/blog'),
    ('comp_mock', 'MockCorp (Test Suite)', 'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc1-new.html', 'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc2-announced.html'),
    ('comp_tc3', 'MockCorp Rebranding', 'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc3-renamed.html', NULL),
    ('comp_tc4', 'MockCorp Vanishing', 'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc4-missing.html', NULL)
ON CONFLICT (id) DO NOTHING;

-- Seed Canonical Features (Crucial for TC3 Renamed Feature Mapping)
INSERT INTO features (id, standard_name, aliases) VALUES
    ('feat_ai_reply', 'AI Smart Reply', ARRAY['Quick Reply', 'Smart Compose', 'Magic Drafts']),
    ('feat_csv_export', 'Advanced CSV Export', ARRAY['Data Export', 'Spreadsheet Download']),
    ('feat_ai_summary', 'AI Summaries', ARRAY['Thread Summarizer', 'Auto Summary'])
ON CONFLICT (id) DO NOTHING;

-- Seed the 4 Mandatory Test Cases
INSERT INTO test_results (id, scenario, input_url, expected_result, actual_result, evidence, passed) VALUES
    (
        'TC1', 
        'New feature in changelog', 
        'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc1-new.html', 
        'Status = shipped, dated row with source link', 
        NULL,
        'Changelog explicitly states: "Advanced CSV Export is now live and generally available."', 
        FALSE
    ),
    (
        'TC2', 
        'Feature in marketing post only', 
        'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc2-announced.html', 
        'Status = announced (not shipped)', 
        NULL,
        'Blog post states: "Sneak peek at AI Summaries coming in Q1 next year. Join the waitlist."', 
        FALSE
    ),
    (
        'TC3', 
        'Feature renamed', 
        'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc3-renamed.html', 
        'Mapped to existing row (feat_ai_reply)', 
        NULL,
        'Matched alias "Quick Reply" in features registry array.', 
        FALSE
    ),
    (
        'TC4', 
        'Changelog page removed (404)', 
        'https://darpan01tech.github.io/Competitor-Changelog-Scout/tc4-missing.html', 
        'Status = uncertain (never mark feature removed)', 
        NULL,
        'HTTP 404 Not Found returned during scrape; logged as uncertain per safety guardrail.', 
        FALSE
    )
ON CONFLICT (id) DO NOTHING;

INSERT INTO runs (status, diff_summary) VALUES (
    'completed',
    '[{"test_case": "TC1", "change": "New shipped feature: Advanced CSV Export"}, {"test_case": "TC3", "change": "Renamed Quick Reply -> AI Smart Reply"}]'::jsonb
);

-- Dashboard access: public read access, with review updates limited to audit fields.
ALTER TABLE competitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE features ENABLE ROW LEVEL SECURITY;
ALTER TABLE entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE test_results ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON competitors, features, entries, runs, test_results, vw_weekly_digest TO anon, authenticated;
REVOKE UPDATE ON entries FROM PUBLIC, anon, authenticated;
GRANT UPDATE (approval_status, approved_by, approved_at) ON entries TO anon, authenticated;
GRANT ALL ON competitors, features, entries, runs, test_results TO service_role;
GRANT SELECT ON vw_weekly_digest TO service_role;

DROP POLICY IF EXISTS "public read competitors" ON competitors;
CREATE POLICY "public read competitors" ON competitors FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read features" ON features;
CREATE POLICY "public read features" ON features FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read entries" ON entries;
CREATE POLICY "public read entries" ON entries FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public review pending" ON entries;
CREATE POLICY "public review pending" ON entries FOR UPDATE TO anon, authenticated
    USING (approval_status = 'pending')
    WITH CHECK (
        approval_status IN ('approved', 'rejected')
        AND length(trim(approved_by)) > 0
        AND approved_at IS NOT NULL
    );
DROP POLICY IF EXISTS "public read runs" ON runs;
CREATE POLICY "public read runs" ON runs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "public read test results" ON test_results;
CREATE POLICY "public read test results" ON test_results FOR SELECT TO anon, authenticated USING (true);
