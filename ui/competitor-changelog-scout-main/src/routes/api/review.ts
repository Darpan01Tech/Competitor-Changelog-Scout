import { createFileRoute } from "@tanstack/react-router";
import { isUuid, reviewConfiguration, reviewConfigurationIssues } from "@/lib/review.server";

const json = (body: unknown, status = 200) =>
  Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}

const recentReviews = new Map<string, number[]>();

function withinReviewLimit(userId: string) {
  const now = Date.now();
  const recent = (recentReviews.get(userId) ?? []).filter((time) => now - time < 60_000);
  if (recent.length >= 20) return false;
  recent.push(now);
  recentReviews.set(userId, recent);
  return true;
}

export async function handleReviewPost(request: Request) {
  if (!sameOrigin(request))
    return json({ error: "Same-origin review requests are required." }, 403);
  if (!request.headers.get("content-type")?.toLowerCase().includes("application/json")) {
    return json({ error: "Expected a JSON request." }, 415);
  }

  const config = reviewConfiguration();
  if (!config) return json({ error: "Reviewer decisions are not configured." }, 503);

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 8192)
    return json({ error: "Sign in with the demo reviewer account." }, 401);

  let body: unknown;
  try {
    const raw = await request.text();
    if (raw.length > 2048) return json({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Malformed JSON request." }, 400);
  }

  if (!body || typeof body !== "object")
    return json({ error: "Invalid review request." }, 400);
  const { id, decision } = body as Record<string, unknown>;
  if (typeof id !== "string" || !isUuid(id)) return json({ error: "Invalid entry ID." }, 400);
  if (decision !== "approved" && decision !== "rejected")
    return json({ error: "Invalid decision." }, 400);

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
  const user = authData?.user;
  if (
    authError ||
    !user ||
    user.id !== config.userId ||
    user.email?.toLowerCase() !== config.email.toLowerCase()
  ) {
    return json({ error: "This account is not authorized to review entries." }, 403);
  }
  if (!withinReviewLimit(user.id))
    return json({ error: "Too many review attempts. Try again shortly." }, 429);

  const { data, error } = await supabaseAdmin
    .from("entries")
    .update({
      approval_status: decision,
      approved_by: config.email,
      approved_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("approval_status", "pending")
    .select("id, approval_status, approved_by, approved_at")
    .maybeSingle();

  if (error) {
    console.error("[review] decision persistence failed", error.message);
    return json({ error: "The decision could not be saved. Please retry." }, 500);
  }
  if (!data) return json({ error: "This entry is no longer pending. Refresh the queue." }, 409);
  return json({ entry: data });
}

export async function handleReviewGet(request: Request) {
  const config = reviewConfiguration();
  if (!config) return json({ enabled: false, authorized: false, missing: reviewConfigurationIssues() });

  const token = request.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 8192) return json({ enabled: true, authorized: false });

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  const user = data?.user;
  const authorized = Boolean(
    !error && user && user.id === config.userId &&
    user.email?.toLowerCase() === config.email.toLowerCase(),
  );
  return json({ enabled: true, authorized });
}

export const Route = createFileRoute("/api/review")({
  server: {
    handlers: {
      GET: ({ request }) => handleReviewGet(request),
      POST: ({ request }) => handleReviewPost(request),
    },
  },
});
