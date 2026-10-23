import { describe, expect, it } from "vitest";
import { isUuid, reviewConfiguration, reviewConfigurationIssues } from "@/lib/review.server";

const configured = {
  DEMO_REVIEWER_EMAIL: "reviewer@example.test",
  DEMO_REVIEWER_PASSWORD: "demo-only-password",
  DEMO_REVIEWER_USER_ID: "8d312f15-5c74-4b02-993e-e550dcb13358",
  SUPABASE_URL: "https://project.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "server-only-test-key",
};

describe("server-side reviewer configuration", () => {
  it("fails closed when any required setting is missing", () => {
    for (const key of Object.keys(configured)) {
      const incomplete: Record<string, string | undefined> = { ...configured };
      delete incomplete[key];
      expect(reviewConfiguration(incomplete)).toBeNull();
    }
  });

  it("rejects an invalid allowlisted reviewer ID", () => {
    expect(
      reviewConfiguration({ ...configured, DEMO_REVIEWER_USER_ID: "not-a-user-id" }),
    ).toBeNull();
  });

  it("returns only a complete server configuration", () => {
    expect(reviewConfiguration(configured)).toEqual({
      email: "reviewer@example.test",
      password: "demo-only-password",
      userId: "8d312f15-5c74-4b02-993e-e550dcb13358",
    });
  });

  it("reports missing variable names without exposing their values", () => {
    expect(reviewConfigurationIssues({})).toEqual([
      "DEMO_REVIEWER_EMAIL",
      "DEMO_REVIEWER_PASSWORD",
      "DEMO_REVIEWER_USER_ID",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]);
    expect(reviewConfigurationIssues(configured)).toEqual([]);
  });
});

describe("review entry IDs", () => {
  it("accepts UUIDs and rejects malformed identifiers", () => {
    expect(isUuid("8d312f15-5c74-4b02-993e-e550dcb13358")).toBe(true);
    expect(isUuid("entry-1")).toBe(false);
  });
});
