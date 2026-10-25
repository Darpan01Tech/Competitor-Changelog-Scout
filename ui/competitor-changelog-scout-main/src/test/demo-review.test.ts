import { describe, expect, it, vi } from "vitest";
import {
  applyDemoDecision,
  getDemoPendingCount,
  getDemoReviewedEntries,
  isDemoPending,
  resetDemoDecisions,
} from "@/lib/demo-review";
import { DEMO_ENTRIES, DEMO_TEST_RESULTS } from "@/lib/demo-data";
import { supabase } from "@/integrations/supabase/client";

describe("session-only Decision Gate demo", () => {
  it("provides exactly four stable pending demo entries initially", () => {
    expect(DEMO_ENTRIES).toHaveLength(4);
    expect(DEMO_ENTRIES.filter((entry) => entry.approval_status === "pending")).toHaveLength(4);
    expect(new Set(DEMO_ENTRIES.map((entry) => entry.id)).size).toBe(4);
    expect(DEMO_ENTRIES.every((entry) => entry.id.startsWith("demo-"))).toBe(true);

    const expectedFeatures = [
      "Advanced CSV Export",
      "AI Summaries",
      "AI Smart Reply",
      "Legacy Sync Service",
    ];
    expect(DEMO_ENTRIES.map((entry) => entry.display_feature_name)).toEqual(expectedFeatures);
  });

  it("keeps local demo test scenarios explicitly not run", () => {
    expect(DEMO_TEST_RESULTS.map((result) => result.id)).toEqual(["TC1", "TC2", "TC3", "TC4"]);
    expect(
      DEMO_TEST_RESULTS.every((result) => result.execution_status === "not_run" && !result.passed),
    ).toBe(true);
  });

  it("moves an accepted item out of the pending queue and adds it to reviewed entries", () => {
    const entry = DEMO_ENTRIES[0]!;
    const decisions = applyDemoDecision({}, entry.id, "accepted");
    expect(decisions[entry.id]).toBe("accepted");
    expect(isDemoPending(entry, decisions)).toBe(false);

    const reviewed = getDemoReviewedEntries(DEMO_ENTRIES, decisions);
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]?.id).toBe(entry.id);
    expect(reviewed[0]?.decision).toBe("accepted");
  });

  it("moves a rejected item out of the pending queue and adds it to reviewed entries", () => {
    const entry = DEMO_ENTRIES[1]!;
    const decisions = applyDemoDecision({}, entry.id, "rejected");
    expect(decisions[entry.id]).toBe("rejected");
    expect(isDemoPending(entry, decisions)).toBe(false);

    const reviewed = getDemoReviewedEntries(DEMO_ENTRIES, decisions);
    expect(reviewed).toHaveLength(1);
    expect(reviewed[0]?.id).toBe(entry.id);
    expect(reviewed[0]?.decision).toBe("rejected");
  });

  it("does not overwrite a decision already made this session", () => {
    const entry = DEMO_ENTRIES[2]!;
    const accepted = applyDemoDecision({}, entry.id, "accepted");
    expect(applyDemoDecision(accepted, entry.id, "rejected")).toBe(accepted);
  });

  it("does not change a non-pending record", () => {
    expect(isDemoPending({ id: "entry-non-pending", approval_status: "approved" }, {})).toBe(false);
  });

  it("tracks pending counts accurately across sequential accept and reject actions", () => {
    let decisions = {};
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(4);

    // Accept first item -> pending decreases to 3
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[0]!.id, "accepted");
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(3);

    // Reject second item -> pending decreases to 2
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[1]!.id, "rejected");
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(2);

    // Accept third item -> pending decreases to 1
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[2]!.id, "accepted");
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(1);

    // Reject fourth item -> pending reaches 0
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[3]!.id, "rejected");
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(0);

    const reviewed = getDemoReviewedEntries(DEMO_ENTRIES, decisions);
    expect(reviewed).toHaveLength(4);
    expect(reviewed.map((r) => r.decision)).toEqual([
      "accepted",
      "rejected",
      "accepted",
      "rejected",
    ]);
  });

  it("supports repeated reset restoring all four items to pending and clearing reviewed activity", () => {
    // Phase 1: Review all 4 items
    let decisions = {};
    for (const entry of DEMO_ENTRIES) {
      decisions = applyDemoDecision(decisions, entry.id, "accepted");
    }
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(0);
    expect(getDemoReviewedEntries(DEMO_ENTRIES, decisions)).toHaveLength(4);

    // Reset 1
    decisions = resetDemoDecisions();
    expect(decisions).toEqual({});
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(4);
    expect(getDemoReviewedEntries(DEMO_ENTRIES, decisions)).toHaveLength(0);
    expect(DEMO_ENTRIES.every((entry) => isDemoPending(entry, decisions))).toBe(true);

    // Phase 2: Make different decisions
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[0]!.id, "rejected");
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[1]!.id, "accepted");
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(2);
    expect(getDemoReviewedEntries(DEMO_ENTRIES, decisions)).toHaveLength(2);

    // Reset 2
    decisions = resetDemoDecisions();
    expect(decisions).toEqual({});
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(4);
    expect(getDemoReviewedEntries(DEMO_ENTRIES, decisions)).toHaveLength(0);

    // Reset 3 (repeated reset when already empty is idempotent)
    decisions = resetDemoDecisions();
    expect(decisions).toEqual({});
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(4);
  });

  it("guarantees demo decisions and resets remain completely isolated from Supabase writes", () => {
    const fromSpy = vi.spyOn(supabase, "from");
    const invokeSpy = vi.spyOn(supabase.functions, "invoke");
    const authSignInSpy = vi.spyOn(supabase.auth, "signInWithPassword");
    const authSignOutSpy = vi.spyOn(supabase.auth, "signOut");

    // Perform full demo lifecycle: accept, reject, count, reset
    let decisions = {};
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[0]!.id, "accepted");
    decisions = applyDemoDecision(decisions, DEMO_ENTRIES[1]!.id, "rejected");
    const pendingCount = getDemoPendingCount(DEMO_ENTRIES, decisions);
    expect(pendingCount).toBe(2);

    const reviewed = getDemoReviewedEntries(DEMO_ENTRIES, decisions);
    expect(reviewed).toHaveLength(2);

    decisions = resetDemoDecisions();
    expect(getDemoPendingCount(DEMO_ENTRIES, decisions)).toBe(4);

    // Supabase APIs must never be touched by demo review actions
    expect(fromSpy).not.toHaveBeenCalled();
    expect(invokeSpy).not.toHaveBeenCalled();
    expect(authSignInSpy).not.toHaveBeenCalled();
    expect(authSignOutSpy).not.toHaveBeenCalled();

    // Verify all demo item IDs are isolated demo identifiers
    expect(DEMO_ENTRIES.every((e) => e.id.startsWith("demo-"))).toBe(true);

    fromSpy.mockRestore();
    invokeSpy.mockRestore();
    authSignInSpy.mockRestore();
    authSignOutSpy.mockRestore();
  });
});
