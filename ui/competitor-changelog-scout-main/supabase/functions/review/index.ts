import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { ...cors, "Cache-Control": "no-store" } });
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (!["GET", "POST"].includes(req.method)) return json({ error: "Method not allowed." }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const anon = Deno.env.get("SUPABASE_ANON_KEY");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const reviewerId = Deno.env.get("DEMO_REVIEWER_USER_ID");
  const reviewerEmail = Deno.env.get("DEMO_REVIEWER_EMAIL")?.toLowerCase();
  if (!url || !anon || !service || !reviewerId || !reviewerEmail)
    return json({ error: "Reviewer decisions are not configured." }, 503);
  const token = req.headers.get("authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token || token.length > 8192)
    return json({ error: "Sign in with an authorized reviewer account." }, 401);
  const auth = createClient(url, anon, { auth: { persistSession: false } });
  const {
    data: { user },
    error,
  } = await auth.auth.getUser(token);
  const authorized =
    !error && user?.id === reviewerId && user.email?.toLowerCase() === reviewerEmail;
  if (req.method === "GET") return json({ enabled: true, authorized: Boolean(authorized) });
  if (!authorized || !user)
    return json({ error: "This account is not authorized to review entries." }, 403);
  let body: Record<string, unknown>;
  try {
    const raw = await req.text();
    if (raw.length > 2048) return json({ error: "Request is too large." }, 413);
    body = JSON.parse(raw);
  } catch {
    return json({ error: "Malformed JSON request." }, 400);
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      String(body.id ?? ""),
    )
  )
    return json({ error: "Invalid entry ID." }, 400);
  if (body.decision !== "approved" && body.decision !== "rejected")
    return json({ error: "Invalid decision." }, 400);
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const { data: withinLimit, error: limitError } = await admin.rpc("consume_review_rate_limit", {
    p_user_id: user.id,
    p_limit: 20,
    p_window_seconds: 60,
  });
  if (limitError) {
    console.error("[review] rate limit check failed", limitError.message);
    return json({ error: "Review service is unavailable." }, 503);
  }
  if (!withinLimit) return json({ error: "Too many review attempts. Try again shortly." }, 429);
  const { data, error: updateError } = await admin
    .from("entries")
    .update({
      approval_status: body.decision,
      approved_by: reviewerEmail,
      approved_at: new Date().toISOString(),
    })
    .eq("id", body.id)
    .eq("approval_status", "pending")
    .select("id,approval_status,approved_by,approved_at")
    .maybeSingle();
  if (updateError) {
    console.error("[review] update failed", updateError.message);
    return json({ error: "The decision could not be saved. Please retry." }, 500);
  }
  if (!data) return json({ error: "This entry is no longer pending. Refresh the queue." }, 409);
  return json({ entry: data });
});
