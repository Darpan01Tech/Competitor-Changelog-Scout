import { supabase } from "@/integrations/supabase/client";

export type SessionResult = { access_token: string } | null;

export type ReviewerAuthAdapter = {
  signIn: (credentials: { email: string; password: string }) => Promise<{
    session: SessionResult;
    error: unknown | null;
  }>;
  verify: (accessToken: string) => Promise<boolean>;
  signOut: () => Promise<unknown>;
};

export type ReviewerAuthResult =
  | { ok: true; accessToken: string }
  | { ok: false; reason: "invalid_credentials" | "not_authorized" };

export type ReviewerSupabaseClient = {
  auth: {
    signInWithPassword: (credentials: { email: string; password: string }) => Promise<{
      data: { session: SessionResult };
      error: unknown;
    }>;
    signOut: () => Promise<{ error: unknown }>;
  };
  functions: {
    invoke: <T = unknown>(
      functionName: string,
      options?: {
        method?: string;
        headers?: Record<string, string>;
        body?: unknown;
      },
    ) => Promise<{
      data: T | null;
      error: unknown;
    }>;
  };
};

export type SupabaseReviewerClient = ReviewerSupabaseClient;

export async function authenticateReviewer(
  adapter: ReviewerAuthAdapter,
  email: string,
  password: string,
): Promise<ReviewerAuthResult> {
  const { session, error } = await adapter.signIn({ email: email.trim(), password });
  if (error || !session?.access_token) return { ok: false, reason: "invalid_credentials" };

  if (!(await adapter.verify(session.access_token))) {
    await adapter.signOut();
    return { ok: false, reason: "not_authorized" };
  }
  return { ok: true, accessToken: session.access_token };
}

export function createSupabaseReviewerAuthAdapter(
  client: ReviewerSupabaseClient | typeof supabase = supabase,
): ReviewerAuthAdapter {
  return {
    signIn: async ({ email, password }) => {
      const { data, error } = await client.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      return {
        session: data.session ? { access_token: data.session.access_token } : null,
        error,
      };
    },
    verify: async (accessToken: string) => {
      return await verifyReviewerAccess(accessToken, client);
    },
    signOut: async () => {
      await client.auth.signOut();
    },
  };
}

export async function verifyReviewerAccess(
  accessToken?: string,
  client: Pick<ReviewerSupabaseClient, "functions"> | typeof supabase = supabase,
): Promise<boolean> {
  try {
    const options: { method: "GET"; headers?: Record<string, string> } = { method: "GET" };
    if (accessToken) {
      options.headers = { Authorization: `Bearer ${accessToken}` };
    }
    const { data, error } = await client.functions.invoke<{
      enabled?: boolean;
      authorized?: boolean;
    }>("review", options);

    if (error) {
      return false;
    }
    return data?.authorized === true;
  } catch {
    return false;
  }
}

export async function extractFunctionErrorMessage(error: unknown): Promise<string> {
  if (!error) return "An unexpected error occurred.";
  if (typeof error === "object" && error !== null) {
    const errObj = error as Record<string, unknown>;
    const context = errObj["context"];
    if (context && typeof context === "object") {
      const resp = context as Response;
      try {
        if (typeof resp.json === "function") {
          const cloned = typeof resp.clone === "function" ? resp.clone() : resp;
          const body = (await cloned.json()) as Record<string, unknown> | null;
          if (
            body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body["error"] === "string"
          ) {
            return body["error"];
          }
        }
      } catch {
        try {
          if (typeof resp.text === "function") {
            const cloned = typeof resp.clone === "function" ? resp.clone() : resp;
            const text = await cloned.text();
            if (text) return text;
          }
        } catch {
          // ignore text parse fallback error
        }
      }
    }
    const message = errObj["message"];
    if (typeof message === "string") {
      return message;
    }
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function submitLiveDecision(
  entryId: string,
  decision: "approved" | "rejected",
  client: Pick<ReviewerSupabaseClient, "functions"> | typeof supabase = supabase,
): Promise<{ ok: true; entry: unknown } | { ok: false; error: string }> {
  try {
    const { data, error } = await client.functions.invoke<{ entry: unknown }>("review", {
      body: { id: entryId, decision },
    });
    if (error) {
      const message = await extractFunctionErrorMessage(error);
      return { ok: false, error: message };
    }
    if (!data?.entry) {
      return { ok: false, error: "The decision could not be verified by the review service." };
    }
    return { ok: true, entry: data.entry };
  } catch (err) {
    const message = await extractFunctionErrorMessage(err);
    return { ok: false, error: message };
  }
}
