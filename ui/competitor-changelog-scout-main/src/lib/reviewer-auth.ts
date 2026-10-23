type SessionResult = { access_token: string } | null;

type ReviewerAuthAdapter = {
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
