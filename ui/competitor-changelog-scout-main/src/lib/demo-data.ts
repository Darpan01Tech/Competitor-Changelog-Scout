import type { Entry } from "@/routes/index";

const fixtureBase = "https://darpan01tech.github.io/Competitor-Changelog-Scout";
const retrievedAt = "2026-10-22T12:00:00.000Z";

/** Stable, local-only records for a repeatable dashboard demonstration. */
export const DEMO_ENTRIES: Entry[] = [
  {
    id: "demo-pending-csv-export",
    competitor_name: "Demo · MockCorp",
    display_feature_name: "Advanced CSV Export",
    raw_feature_name: "Advanced CSV Export",
    status: "shipped",
    confidence: 0.97,
    reason: 'The fixture states the feature is "now live and generally available".',
    source_url: `${fixtureBase}/tc1-new.html`,
    retrieved_at: retrievedAt,
    approval_status: "pending",
    approved_by: null,
    approved_at: null,
    verify_status: "match",
  },
  {
    id: "demo-pending-ai-summaries",
    competitor_name: "Demo · MockCorp",
    display_feature_name: "AI Summaries",
    raw_feature_name: "AI Summaries",
    status: "announced",
    confidence: 0.88,
    reason: 'The fixture describes a "sneak peek" and asks readers to join a waitlist.',
    source_url: `${fixtureBase}/tc2-announced.html`,
    retrieved_at: retrievedAt,
    approval_status: "pending",
    approved_by: null,
    approved_at: null,
    verify_status: "match",
  },
  {
    id: "demo-pending-smart-reply",
    competitor_name: "Demo · MockCorp Rebranding",
    display_feature_name: "AI Smart Reply",
    raw_feature_name: "Quick Reply",
    status: "shipped",
    confidence: 0.82,
    reason: 'The fixture says "Quick Reply is now AI Smart Reply", matching a tracked alias.',
    source_url: `${fixtureBase}/tc3-renamed.html`,
    retrieved_at: retrievedAt,
    approval_status: "pending",
    approved_by: null,
    approved_at: null,
    verify_status: "match",
  },
  {
    id: "demo-pending-legacy-sync",
    competitor_name: "Demo · MockCorp Vanishing",
    display_feature_name: "Legacy Sync Service",
    raw_feature_name: "Legacy Sync Service",
    status: "uncertain",
    confidence: 0.52,
    reason:
      "The fixture changelog page was removed (404); feature preserved with uncertain status.",
    source_url: `${fixtureBase}/tc4-missing.html`,
    retrieved_at: retrievedAt,
    approval_status: "pending",
    approved_by: null,
    approved_at: null,
    verify_status: "unverified",
  },
];

export const DEMO_TEST_RESULTS = [
  {
    id: "TC1",
    scenario: "New feature in changelog",
    expected_result: "Status = shipped, dated row with source link",
    passed: false,
    execution_status: "not_run",
  },
  {
    id: "TC2",
    scenario: "Feature in marketing post only",
    expected_result: "Status = announced (not shipped)",
    passed: false,
    execution_status: "not_run",
  },
  {
    id: "TC3",
    scenario: "Feature renamed",
    expected_result: "Mapped to existing row (feat_ai_reply)",
    passed: false,
    execution_status: "not_run",
  },
  {
    id: "TC4",
    scenario: "Changelog page removed (404)",
    expected_result: "Status = uncertain (never mark feature removed)",
    passed: false,
    execution_status: "not_run",
  },
];
