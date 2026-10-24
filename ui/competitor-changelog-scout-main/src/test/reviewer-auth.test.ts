import { describe, expect, it, vi } from "vitest";
import { authenticateReviewer } from "@/lib/reviewer-auth";

describe("demo reviewer sign-in", () => {
  it("accepts valid Supabase credentials after server authorization", async () => {
    const adapter = {
      signIn: vi
        .fn()
        .mockResolvedValue({ session: { access_token: "verified-token" }, error: null }),
      verify: vi.fn().mockResolvedValue(true),
      signOut: vi.fn(),
    };
    await expect(
      authenticateReviewer(adapter, " reviewer@example.test ", "password"),
    ).resolves.toEqual({ ok: true, accessToken: "verified-token" });
    expect(adapter.signIn).toHaveBeenCalledWith({
      email: "reviewer@example.test",
      password: "password",
    });
    expect(adapter.verify).toHaveBeenCalledWith("verified-token");
    expect(adapter.signOut).not.toHaveBeenCalled();
  });

  it("rejects invalid Supabase credentials without requesting reviewer authorization", async () => {
    const adapter = {
      signIn: vi.fn().mockResolvedValue({ session: null, error: new Error("invalid credentials") }),
      verify: vi.fn(),
      signOut: vi.fn(),
    };
    await expect(authenticateReviewer(adapter, "reviewer@example.test", "wrong")).resolves.toEqual({
      ok: false,
      reason: "invalid_credentials",
    });
    expect(adapter.verify).not.toHaveBeenCalled();
  });

  it("signs out an authenticated Supabase user who is outside the reviewer allowlist", async () => {
    const adapter = {
      signIn: vi
        .fn()
        .mockResolvedValue({ session: { access_token: "other-user-token" }, error: null }),
      verify: vi.fn().mockResolvedValue(false),
      signOut: vi.fn().mockResolvedValue(undefined),
    };
    await expect(authenticateReviewer(adapter, "other@example.test", "password")).resolves.toEqual({
      ok: false,
      reason: "not_authorized",
    });
    expect(adapter.signOut).toHaveBeenCalledOnce();
  });
});
