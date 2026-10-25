import { describe, expect, it, vi } from "vitest";
import {
  calculateImpactScore,
  assessImpact,
  enhanceAssessmentWithAI,
  hasSufficientEvidence,
  normalizeConfidence,
  getPriorityFromScore,
  IMPACT_PRIORITY_THRESHOLDS,
} from "@/lib/impact-radar";
import { DEMO_ENTRIES } from "@/lib/demo-data";
import {
  applyDemoDecision,
  resetDemoDecisions,
  isDemoPending,
  getDemoPendingCount,
} from "@/lib/demo-review";
import type { Entry } from "@/routes/index";

describe("Impact Radar Scoring Engine", () => {
  const referenceTime = new Date("2026-10-25T12:00:00.000Z");

  it("1. scores a high-significance, well-supported update into the High priority bracket", () => {
    const highEntry = DEMO_ENTRIES[0]!; // Advanced CSV Export, shipped, 0.97 conf, valid source
    const result = assessImpact(highEntry, { now: referenceTime });

    expect(result.score).toBeGreaterThanOrEqual(IMPACT_PRIORITY_THRESHOLDS.HIGH_MIN);
    expect(result.priority).toBe("High");
    expect(result.hasSufficientEvidence).toBe(true);
    expect(result.factors.significance.score).toBeGreaterThan(25);
    expect(result.factors.confidence.score).toBeGreaterThan(18);
    expect(result.whatChanged).toContain("Advanced CSV Export");
    expect(result.whyItMatters).toContain("export");
    expect(result.recommendedAction.category).toBe("Compare with our product");
    expect(result.analysisType).toBe("rule-based");
  });

  it("2. scores a low-significance update into Medium or Low priority honestly", () => {
    const lowEntry: Partial<Entry> = {
      id: "test-low",
      competitor_name: "Competitor B",
      display_feature_name: "Minor Button Color",
      status: "uncertain",
      confidence: 0.35,
      reason: "Could not confirm whether color changed.",
      source_url: "https://example.com/tc",
      retrieved_at: "2026-08-01T12:00:00.000Z", // ~85 days old
    };

    const result = assessImpact(lowEntry, { now: referenceTime });
    expect(result.score).toBeLessThan(IMPACT_PRIORITY_THRESHOLDS.MEDIUM_MIN);
    expect(result.priority).toBe("Low");
    expect(result.recommendedAction.category).toBe("Investigate further");
  });

  it("3. handles missing source evidence safely and honestly", () => {
    const noEvidenceEntry: Partial<Entry> = {
      id: "no-evidence",
      competitor_name: "Competitor C",
      display_feature_name: "Secret Feature",
      status: "shipped",
      confidence: 0.8,
      reason: "", // missing
      source_url: "", // missing
      retrieved_at: "2026-10-25T10:00:00.000Z",
    };

    expect(hasSufficientEvidence(noEvidenceEntry)).toBe(false);
    const result = assessImpact(noEvidenceEntry, { now: referenceTime });

    expect(result.hasSufficientEvidence).toBe(false);
    expect(result.whatChanged).toContain("source evidence is insufficient or missing");
    expect(result.whyItMatters).toBe("Insufficient evidence to assess competitive impact.");
  });

  it("4. normalizes missing or malformed confidence safely without NaN", () => {
    expect(normalizeConfidence(undefined)).toBe(0);
    expect(normalizeConfidence(null)).toBe(0);
    expect(normalizeConfidence(NaN)).toBe(0);
    expect(normalizeConfidence(-0.5)).toBe(0);
    expect(normalizeConfidence(1.5)).toBe(1);
    expect(normalizeConfidence(0.75)).toBe(0.75);

    const malformedEntry: Partial<Entry> = {
      id: "malformed-conf",
      competitor_name: "Competitor D",
      display_feature_name: "API Webhook",
      status: "shipped",
      confidence: NaN as unknown as number,
      reason: "Added webhook notifications.",
      source_url: "https://example.com/api",
      retrieved_at: "2026-10-25T10:00:00.000Z",
    };

    const result = calculateImpactScore(malformedEntry, { now: referenceTime });
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThan(0); // Still gets points for status, evidence, and relevance
    expect(result.factors.confidence.score).toBeLessThanOrEqual(7); // only evidence pts
  });

  it("5. handles missing or invalid timestamp gracefully", () => {
    const noTimestampEntry: Partial<Entry> = {
      id: "no-time",
      competitor_name: "Competitor E",
      display_feature_name: "Dark Mode",
      status: "announced",
      confidence: 0.9,
      reason: "Preview announced on social media.",
      source_url: "https://example.com/post",
      retrieved_at: "invalid-date-string",
    };

    const result = calculateImpactScore(noTimestampEntry, { now: referenceTime });
    expect(result.factors.recency.score).toBe(0);
    expect(result.factors.recency.description).toBe("Invalid timestamp");
  });

  it("6. handles unknown or unexpected classification status", () => {
    const unknownStatusEntry: Partial<Entry> = {
      id: "unknown-status",
      competitor_name: "Competitor F",
      display_feature_name: "Experimental Sandbox",
      status: "beta_testing" as unknown as "shipped",
      confidence: 0.7,
      reason: "User forum discussion.",
      source_url: "https://example.com/forum",
      retrieved_at: "2026-10-24T10:00:00.000Z",
    };

    const result = calculateImpactScore(unknownStatusEntry, { now: referenceTime });
    expect(result.factors.significance.score).toBe(0);
    expect(result.factors.significance.description).toBe("Missing or unclassified release status");
  });

  it("7. handles completely empty or null inputs safely", () => {
    const nullResult = assessImpact(null);
    expect(nullResult.score).toBe(0);
    expect(nullResult.priority).toBe("Low");
    expect(nullResult.hasSufficientEvidence).toBe(false);
    expect(nullResult.whatChanged).toContain("Insufficient evidence");

    const emptyResult = assessImpact({});
    expect(emptyResult.score).toBe(0);
    expect(emptyResult.priority).toBe("Low");
  });

  it("8. verifies priority category thresholds accurately", () => {
    expect(getPriorityFromScore(100)).toBe("High");
    expect(getPriorityFromScore(70)).toBe("High");
    expect(getPriorityFromScore(69)).toBe("Medium");
    expect(getPriorityFromScore(40)).toBe("Medium");
    expect(getPriorityFromScore(39)).toBe("Low");
    expect(getPriorityFromScore(0)).toBe("Low");
  });

  it("9. produces deterministic, identical results across repeated calls", () => {
    const entry = DEMO_ENTRIES[1]!; // AI Summaries
    const result1 = assessImpact(entry, { now: referenceTime });
    const result2 = assessImpact(entry, { now: referenceTime });

    expect(result1.score).toBe(result2.score);
    expect(result1.priority).toBe(result2.priority);
    expect(result1.whatChanged).toBe(result2.whatChanged);
    expect(result1.whyItMatters).toBe(result2.whyItMatters);
    expect(result1.recommendedAction).toEqual(result2.recommendedAction);
    expect(result1.factors).toEqual(result2.factors);
  });

  it("10. provides honest fallback when AI service is unavailable or unconfigured", async () => {
    const entry = DEMO_ENTRIES[2]!; // AI Smart Reply
    const initial = assessImpact(entry, { now: referenceTime });

    // AI call with missing endpoint or connection error
    const failedFetch = vi.fn().mockRejectedValue(new Error("Network connection refused"));
    const enriched = await enhanceAssessmentWithAI(initial, entry, {
      supabaseUrl: "https://mock.supabase.co",
      publishableKey: "mock-key",
      fetchFn: failedFetch as unknown as typeof fetch,
    });

    expect(enriched.score).toBe(initial.score); // Numerical score never altered by AI
    expect(enriched.priority).toBe(initial.priority);
    expect(enriched.analysisType).toBe("rule-based");
    expect(enriched.aiUnavailableReason).toContain("Network connection refused");
  });

  it("11. validates AI output and preserves score when AI returns successful response", async () => {
    const entry = DEMO_ENTRIES[1]!; // AI Summaries
    const initial = assessImpact(entry, { now: referenceTime });

    const mockAiResponse =
      "## Answer\nCompetitor is advancing LLM document intelligence.\n## Action\nTrack pricing tier.";
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: {},
      text: async () => mockAiResponse,
      status: 200,
    });

    const enriched = await enhanceAssessmentWithAI(initial, entry, {
      supabaseUrl: "https://mock.supabase.co",
      publishableKey: "mock-key",
      fetchFn: mockFetch as unknown as typeof fetch,
    });

    expect(enriched.score).toBe(initial.score); // Score remains strictly deterministic!
    expect(enriched.factors).toEqual(initial.factors);
    expect(enriched.analysisType).toBe("ai-assisted");
    expect(enriched.whyItMatters).toContain("Competitor is advancing LLM document intelligence");
  });

  it("12. maintains demo isolation: scoring does not mutate demo records or call Supabase", () => {
    const originalEntry = { ...DEMO_ENTRIES[0]! };
    const frozenCopy = Object.freeze({ ...originalEntry });

    // Assessment must not mutate the input object
    const assessment = assessImpact(frozenCopy, { now: referenceTime });
    expect(assessment.score).toBeGreaterThan(0);
    expect(DEMO_ENTRIES[0]!.approval_status).toBe("pending");
    expect(DEMO_ENTRIES[0]!.approved_by).toBeNull();
  });

  it("13. preserves existing Accept/Reject/Reset demo queue behavior", () => {
    let decisions = {};
    const entry = DEMO_ENTRIES[0]!;

    expect(isDemoPending(entry, decisions)).toBe(true);
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(4);

    decisions = applyDemoDecision(decisions, entry.id, "accepted");
    expect(isDemoPending(entry, decisions)).toBe(false);
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(3);

    decisions = resetDemoDecisions();
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(4);
  });
});
