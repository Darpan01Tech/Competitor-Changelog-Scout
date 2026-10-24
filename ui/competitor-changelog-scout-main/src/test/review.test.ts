import { describe, expect, it } from "vitest";
import { isPending, reviewUpdate, verificationStatus } from "@/lib/review";

describe("Entry review rules", () => {
  const now = new Date("2026-10-23T05:57:00.000Z");
  it("approves using the approval status and reviewer audit columns", () => {
    expect(reviewUpdate("approved", " Amey ", now)).toEqual({
      approval_status: "approved",
      approved_by: "Amey",
      approved_at: "2026-10-23T05:57:00.000Z",
    });
  });
  it("rejects using the approval status and reviewer audit columns", () => {
    expect(reviewUpdate("rejected", "Amey", now)).toEqual({
      approval_status: "rejected",
      approved_by: "Amey",
      approved_at: "2026-10-23T05:57:00.000Z",
    });
  });
  it("requires the reviewer name", () => {
    expect(() => reviewUpdate("approved", "  ", now)).toThrow();
  });
  it("only queues pending rows", () => {
    expect(
      ["pending", "approved", "rejected"].filter((approval_status) =>
        isPending({ approval_status }),
      ),
    ).toEqual(["pending"]);
  });
  it("displays workflow verification and defaults to unverified", () => {
    expect(["match", "mismatch", "unverified", null].map(verificationStatus)).toEqual([
      "match",
      "mismatch",
      "unverified",
      "unverified",
    ]);
  });
});
