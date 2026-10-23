import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(),
  update: vi.fn(),
  eq: vi.fn(),
  select: vi.fn(),
  maybeSingle: vi.fn(),
}));

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({ update: mocks.update })),
  },
}));

import { handleReviewGet, handleReviewPost } from "@/routes/api/review";

const envKeys = [
  "DEMO_REVIEWER_EMAIL",
  "DEMO_REVIEWER_PASSWORD",
  "DEMO_REVIEWER_USER_ID",
  "SUPABASE_URL",
  "SUPABASE_SERVICE_ROLE_KEY",
] as const;
const savedEnv = Object.fromEntries(envKeys.map((key) => [key, process.env[key]]));
const reviewerId = "8d312f15-5c74-4b02-993e-e550dcb13358";
const entryId = "2f0316e9-ff4d-45f2-90c5-9b9eb74c00a2";

function request(body: unknown, token = "valid-token") {
  return new Request("https://app.test/api/review", {
    method: "POST",
    headers: {
      Origin: "https://app.test",
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
}

describe("protected review API", () => {
  beforeEach(() => {
    process.env["DEMO_REVIEWER_EMAIL"] = "reviewer@example.test";
    process.env["DEMO_REVIEWER_PASSWORD"] = "demo-only-password";
    process.env["DEMO_REVIEWER_USER_ID"] = reviewerId;
    process.env["SUPABASE_URL"] = "https://project.supabase.co";
    process.env["SUPABASE_SERVICE_ROLE_KEY"] = "server-only-test-key";

    mocks.getUser.mockReset();
    mocks.update.mockReset().mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReset().mockReturnValue({ eq: mocks.eq, select: mocks.select });
    mocks.select.mockReset().mockReturnValue({ maybeSingle: mocks.maybeSingle });
    mocks.maybeSingle.mockReset();
  });

  afterEach(() => {
    for (const key of envKeys) {
      const value = savedEnv[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("rejects missing server configuration", async () => {
    delete process.env["DEMO_REVIEWER_USER_ID"];
    const response = await handleReviewPost(request({ id: entryId, decision: "approved" }));
    expect(response.status).toBe(503);
  });

  it("reports missing configuration without exposing credentials", async () => {
    delete process.env["DEMO_REVIEWER_PASSWORD"];
    const response = await handleReviewGet(new Request("https://app.test/api/review"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      enabled: false,
      authorized: false,
      missing: ["DEMO_REVIEWER_PASSWORD"],
    });
  });

  it("validates a Supabase session without returning configured credentials", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: reviewerId, email: "reviewer@example.test" } },
      error: null,
    });
    const response = await handleReviewGet(new Request("https://app.test/api/review", {
      headers: { Authorization: "Bearer valid-token" },
    }));
    expect(await response.json()).toEqual({ enabled: true, authorized: true });
  });

  it("rejects requests without a verified access token", async () => {
    const response = await handleReviewPost(request({ id: entryId, decision: "approved" }, ""));
    expect(response.status).toBe(401);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it.each([
    [{ id: "bad-id", decision: "approved" }, 400],
    [{ id: entryId, decision: "pending" }, 400],
  ])("rejects malformed IDs and invalid decisions", async (body, expectedStatus) => {
    const response = await handleReviewPost(request(body));
    expect(response.status).toBe(expectedStatus);
    expect(mocks.getUser).not.toHaveBeenCalled();
  });

  it("rejects an authenticated user outside the reviewer allowlist", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: "ba2f90f6-9708-4bca-b5c2-864c16bc04ce", email: "other@example.test" } },
      error: null,
    });
    const response = await handleReviewPost(request({ id: entryId, decision: "approved" }));
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects expired or invalid sessions", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null }, error: new Error("invalid token") });
    const response = await handleReviewPost(request({ id: entryId, decision: "approved" }));
    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it.each(["approved", "rejected"] as const)("persists a pending → %s transition and reviewer metadata", async (decision) => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: reviewerId, email: "reviewer@example.test" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({
      data: { id: entryId, approval_status: decision, approved_by: "reviewer@example.test", approved_at: "2026-10-23T00:00:00.000Z" },
      error: null,
    });

    const response = await handleReviewPost(request({ id: entryId, decision }));
    expect(response.status).toBe(200);
    expect(mocks.update).toHaveBeenCalledWith(expect.objectContaining({
      approval_status: decision,
      approved_by: "reviewer@example.test",
      approved_at: expect.any(String),
    }));
    expect(mocks.eq).toHaveBeenNthCalledWith(1, "id", entryId);
    expect(mocks.eq).toHaveBeenNthCalledWith(2, "approval_status", "pending");
    expect((await response.json()).entry.approval_status).toBe(decision);
  });

  it("does not transition an entry that is no longer pending", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: reviewerId, email: "reviewer@example.test" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: null });
    const response = await handleReviewPost(request({ id: entryId, decision: "approved" }));
    expect(response.status).toBe(409);
  });

  it("returns a server error without false success when the database update fails", async () => {
    mocks.getUser.mockResolvedValue({
      data: { user: { id: reviewerId, email: "reviewer@example.test" } },
      error: null,
    });
    mocks.maybeSingle.mockResolvedValue({ data: null, error: new Error("database unavailable") });
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await handleReviewPost(request({ id: entryId, decision: "approved" }));
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({ error: "The decision could not be saved. Please retry." });
    errorSpy.mockRestore();
  });

  it("rejects cross-origin mutations", async () => {
    const crossOrigin = new Request("https://app.test/api/review", {
      method: "POST",
      headers: { Origin: "https://attacker.test", "Content-Type": "application/json" },
      body: JSON.stringify({ id: entryId, decision: "approved" }),
    });
    expect((await handleReviewPost(crossOrigin)).status).toBe(403);
  });
});
