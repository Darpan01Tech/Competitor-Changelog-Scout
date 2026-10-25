import { describe, expect, it, vi } from "vitest";
import {
  authenticateReviewer,
  createSupabaseReviewerAuthAdapter,
  extractFunctionErrorMessage,
  submitLiveDecision,
  type SupabaseReviewerClient,
  verifyReviewerAccess,
} from "@/lib/reviewer-auth";

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

describe("Supabase reviewer adapter & verification", () => {
  it("delegates signIn, verify, and signOut to the Supabase client", async () => {
    const mockClient: SupabaseReviewerClient = {
      auth: {
        signInWithPassword: vi.fn().mockResolvedValue({
          data: {
            session: { access_token: "jwt-token-123", user: { email: "reviewer@scout.internal" } },
          },
          error: null,
        }),
        signOut: vi.fn().mockResolvedValue({ error: null }),
      },
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { enabled: true, authorized: true },
          error: null,
        }),
      },
    };

    const adapter = createSupabaseReviewerAuthAdapter(mockClient);
    const signInResult = await adapter.signIn({
      email: " reviewer@scout.internal ",
      password: "secret",
    });
    expect(mockClient.auth.signInWithPassword).toHaveBeenCalledWith({
      email: "reviewer@scout.internal",
      password: "secret",
    });
    expect(signInResult.session?.access_token).toBe("jwt-token-123");

    const verified = await adapter.verify("jwt-token-123");
    expect(mockClient.functions.invoke).toHaveBeenCalledWith("review", {
      method: "GET",
      headers: { Authorization: "Bearer jwt-token-123" },
    });
    expect(verified).toBe(true);

    await adapter.signOut();
    expect(mockClient.auth.signOut).toHaveBeenCalled();
  });

  it("returns false from verifyReviewerAccess when Edge Function reports unauthorized", async () => {
    const mockClient = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: { enabled: true, authorized: false },
          error: null,
        }),
      },
    };

    const isAuthorized = await verifyReviewerAccess("non-reviewer-token", mockClient);
    expect(isAuthorized).toBe(false);
  });

  it("returns false from verifyReviewerAccess when Edge Function errors or network fails", async () => {
    const mockClient = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: new Error("Network error"),
        }),
      },
    };

    const isAuthorized = await verifyReviewerAccess("failing-token", mockClient);
    expect(isAuthorized).toBe(false);
  });
});

describe("Live review decision submission and server error extraction", () => {
  it("submits live decision successfully with server-verified reviewer token", async () => {
    const mockClient = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: {
            entry: {
              id: "00000000-0000-4000-8000-000000000001",
              approval_status: "approved",
              approved_by: "reviewer@scout.internal",
            },
          },
          error: null,
        }),
      },
    };

    const result = await submitLiveDecision(
      "00000000-0000-4000-8000-000000000001",
      "approved",
      mockClient,
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.entry).toEqual({
        id: "00000000-0000-4000-8000-000000000001",
        approval_status: "approved",
        approved_by: "reviewer@scout.internal",
      });
    }
  });

  it("extracts custom Edge Function error message for non-allowlisted 403 response", async () => {
    const forbiddenResponse = new Response(
      JSON.stringify({ error: "This account is not authorized to review entries." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
    const httpError = {
      name: "FunctionsHttpError",
      message: "Edge Function returned a non-2xx status code",
      context: forbiddenResponse,
    };

    const message = await extractFunctionErrorMessage(httpError);
    expect(message).toBe("This account is not authorized to review entries.");
  });

  it("extracts custom Edge Function error message for 409 conflict and 429 rate limit", async () => {
    const conflictResponse = new Response(
      JSON.stringify({ error: "This entry is no longer pending. Refresh the queue." }),
      { status: 409, headers: { "Content-Type": "application/json" } },
    );
    const conflictError = { context: conflictResponse };
    expect(await extractFunctionErrorMessage(conflictError)).toBe(
      "This entry is no longer pending. Refresh the queue.",
    );

    const rateLimitResponse = new Response(
      JSON.stringify({ error: "Too many review attempts. Try again shortly." }),
      { status: 429, headers: { "Content-Type": "application/json" } },
    );
    const rateLimitError = { context: rateLimitResponse };
    expect(await extractFunctionErrorMessage(rateLimitError)).toBe(
      "Too many review attempts. Try again shortly.",
    );
  });

  it("blocks a logged-in but non-allowlisted user from making live decisions", async () => {
    const forbiddenResponse = new Response(
      JSON.stringify({ error: "This account is not authorized to review entries." }),
      { status: 403, headers: { "Content-Type": "application/json" } },
    );
    const mockClient = {
      functions: {
        invoke: vi.fn().mockResolvedValue({
          data: null,
          error: {
            name: "FunctionsHttpError",
            message: "Edge Function returned a non-2xx status code",
            context: forbiddenResponse,
          },
        }),
      },
    };

    const result = await submitLiveDecision(
      "00000000-0000-4000-8000-000000000002",
      "rejected",
      mockClient,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("This account is not authorized to review entries.");
    }
  });
});
