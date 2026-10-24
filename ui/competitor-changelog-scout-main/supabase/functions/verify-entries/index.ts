import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-scheduler-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const secret = Deno.env.get("SCOUT_CRON_SECRET");
  if (req.method !== "POST" || !secret || req.headers.get("x-scheduler-secret") !== secret)
    return Response.json({ error: "Unauthorized." }, { status: 401, headers: cors });
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key)
    return Response.json(
      { error: "Verification is not configured." },
      { status: 503, headers: cors },
    );
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await db
    .from("entries")
    .select(
      "id,status,approval_status,approved_by,approved_at,source_url,reason,entry_date,verify_status",
    )
    .in("approval_status", ["approved", "rejected"])
    .limit(500);
  if (error)
    return Response.json(
      { error: "Could not load decided entries." },
      { status: 500, headers: cors },
    );
  let checked = 0;
  for (const row of rows ?? []) {
    const problems: string[] = [];
    if (!row.approved_by) problems.push("approved_by missing");
    if (!row.approved_at) problems.push("approved_at missing");
    if (!row.source_url || !row.reason) problems.push("evidence missing");
    if (row.approval_status === "approved" && row.status !== "uncertain" && !row.entry_date)
      problems.push("dated evidence missing");
    const result = problems.length ? "mismatch" : "match";
    if (row.verify_status !== result) {
      const { error: updateError } = await db
        .from("entries")
        .update({ verify_status: result })
        .eq("id", row.id);
      if (updateError) console.error("[verify] record update failed", row.id);
    }
    checked++;
  }
  return Response.json({ checked }, { headers: cors });
});
