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
-- 3. CHANGELOG ENTRIES TABLE
-- Stores AI-extracted updates, human approval state, and idempotency lock
-- ==========================================
CREATE TABLE IF NOT EXISTS entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    competitor_id TEXT NOT NULL REFERENCES competitors(id) ON DELETE CASCADE,
    feature_id TEXT REFERENCES features(id) ON DELETE SET NULL,
    raw_feature_name TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('shipped', 'announced', 'uncertain')),
    confidence NUMERIC(3, 2) NOT NULL DEFAULT 1.00 CHECK (confidence >= 0.00 AND confidence <= 1.00),
    reason TEXT NOT NULL,
    source_url TEXT NOT NULL,
    source_type TEXT NOT NULL CHECK (source_type IN ('changelog', 'blog', 'other')),
    retrieved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    approved BOOLEAN NOT NULL DEFAULT FALSE,
    -- Prevents duplicate entries on pipeline re-runs (Format: comp_id|raw_name|status|YYYY-MM-DD)
    idempotency_key TEXT UNIQUE NOT NULL
);

-- ==========================================
-- 4. PIPELINE RUNS & DIFF SNAPSHOTS TABLE
-- Tracks weekly executions and diff comparisons
-- ==========================================
CREATE TABLE IF NOT EXISTS runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    run_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    diff_summary JSONB NOT NULL DEFAULT '[]'::jsonb,
    status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('running', 'waiting_approval', 'completed', 'failed'))
);

-- ==========================================
-- 5. OFFICIAL TEST CASES VERIFICATION TABLE
-- Stores proof for TC1, TC2, TC3, and TC4 for the UI & Judges
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

-- ==========================================
-- 6. PERFORMANCE INDEXES
-- Speeds up dashboard filtering and alias lookups
-- ==========================================
CREATE INDEX IF NOT EXISTS idx_entries_approved_date ON entries (approved, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_entries_status ON entries (status);
CREATE INDEX IF NOT EXISTS idx_features_aliases ON features USING GIN (aliases);

-- ==========================================
-- 7. FRONTEND VIEW FOR PERSON 3 (WEEKLY DIGEST)
-- Joins competitor names and canonical feature names automatically
-- ==========================================
CREATE OR REPLACE VIEW vw_weekly_digest AS
SELECT 
    e.id,
    c.name AS competitor_name,
    COALESCE(f.standard_name, e.raw_feature_name) AS display_feature_name,
    e.raw_feature_name,
    e.feature_id AS mapped_feature_id,
    e.status,
    e.confidence,
    e.reason,
    e.source_url,
    e.source_type,
    e.retrieved_at,
    e.approved
FROM entries e
JOIN competitors c ON e.competitor_id = c.id
LEFT JOIN features f ON e.feature_id = f.id
ORDER BY e.retrieved_at DESC;

-- ==========================================
-- 8. SEED DATA (Competitors, Features, & Test Cases)
-- Pre-populates data so Person 1 & Person 3 can test immediately
-- ==========================================

-- Seed Competitors (Fixed: Added missing comma after comp_mock)
INSERT INTO competitors (id, name, changelog_url, blog_url) VALUES
    ('comp_linear', 'Linear', 'https://linear.app/changelog', 'https://linear.app/blog'),
    ('comp_mock', 'MockCorp (Test Suite)', 'https://dk01tech.github.io/Competitor-Changelog-Scout/tc1-new.html', 'https://dk01tech.github.io/Competitor-Changelog-Scout/tc2-announced.html'),
    ('comp_tc3', 'MockCorp Rebranding', 'https://dk01tech.github.io/Competitor-Changelog-Scout/tc3-renamed.html', NULL),
    ('comp_tc4', 'MockCorp Vanishing', 'https://dk01tech.github.io/Competitor-Changelog-Scout/tc4-missing.html', NULL)
ON CONFLICT (id) DO NOTHING;

-- Seed Canonical Features (Crucial for TC3 Renamed Feature Mapping)
INSERT INTO features (id, standard_name, aliases) VALUES
    ('feat_ai_reply', 'AI Smart Reply', ARRAY['Quick Reply', 'Smart Compose', 'Magic Drafts']),
    ('feat_csv_export', 'Advanced CSV Export', ARRAY['Data Export', 'Spreadsheet Download']),
    ('feat_ai_summary', 'AI Summaries', ARRAY['Thread Summarizer', 'Auto Summary'])
ON CONFLICT (id) DO NOTHING;

-- Seed the 4 Mandatory Hackathon Test Cases (Fixed: Explicit NULL for actual_result)
INSERT INTO test_results (id, scenario, input_url, expected_result, actual_result, evidence, passed) VALUES
    (
        'TC1', 
        'New feature in changelog', 
        'https://dk01tech.github.io/Competitor-Changelog-Scout/tc1-new.html', 
        'Status = shipped, dated row with source link', 
        NULL,
        'Changelog explicitly states: "Advanced CSV Export is now live and generally available."', 
        FALSE
    ),
    (
        'TC2', 
        'Feature in marketing post only', 
        'https://dk01tech.github.io/Competitor-Changelog-Scout/tc2-announced.html', 
        'Status = announced (not shipped)', 
        NULL,
        'Blog post states: "Sneak peek at AI Summaries coming in Q1 next year. Join the waitlist."', 
        FALSE
    ),
    (
        'TC3', 
        'Feature renamed', 
        'https://dk01tech.github.io/Competitor-Changelog-Scout/tc3-renamed.html', 
        'Mapped to existing row (feat_ai_reply)', 
        NULL,
        'Matched alias "Quick Reply" in features registry array.', 
        FALSE
    ),
    (
        'TC4', 
        'Changelog page removed (404)', 
        'https://dk01tech.github.io/Competitor-Changelog-Scout/tc4-missing.html', 
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
