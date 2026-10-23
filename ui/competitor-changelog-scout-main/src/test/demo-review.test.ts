import { describe, expect, it } from "vitest";
import { applyDemoDecision, isDemoPending } from "@/lib/demo-review";
import { DEMO_ENTRIES, DEMO_TEST_RESULTS } from "@/lib/demo-data";

describe("session-only Decision Gate demo", () => {
  it("provides at least three stable pending demo entries", () => {
    expect(DEMO_ENTRIES.filter((entry) => entry.approval_status === "pending")).toHaveLength(3);
    expect(new Set(DEMO_ENTRIES.map((entry) => entry.id)).size).toBe(DEMO_ENTRIES.length);
    expect(DEMO_ENTRIES.every((entry) => entry.id.startsWith("demo-"))).toBe(true);
  });

  it("keeps local demo test scenarios explicitly not run", () => {
    expect(DEMO_TEST_RESULTS.map((result) => result.id)).toEqual(["TC1", "TC2", "TC3", "TC4"]);
    expect(DEMO_TEST_RESULTS.every((result) => result.execution_status === "not_run" && !result.passed)).toBe(true);
  });

  it("moves an accepted item out of the pending queue", () => {
    const decisions = applyDemoDecision({}, "entry-1", "accepted");
    expect(decisions["entry-1"]).toBe("accepted");
    expect(isDemoPending({ id: "entry-1", approval_status: "pending" }, decisions)).toBe(false);
  });

  it("moves a rejected item out of the pending queue", () => {
    const decisions = applyDemoDecision({}, "entry-2", "rejected");
    expect(decisions["entry-2"]).toBe("rejected");
    expect(isDemoPending({ id: "entry-2", approval_status: "pending" }, decisions)).toBe(false);
  });

  it("does not overwrite a decision already made this session", () => {
    const accepted = applyDemoDecision({}, "entry-3", "accepted");
    expect(applyDemoDecision(accepted, "entry-3", "rejected")).toBe(accepted);
  });

  it("does not change a non-pending record", () => {
    expect(isDemoPending({ id: "entry-4", approval_status: "approved" }, {})).toBe(false);
  });
});
