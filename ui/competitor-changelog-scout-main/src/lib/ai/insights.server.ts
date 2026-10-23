import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { createLovableAiGatewayRunIdFetch, getLovableAiGatewayRunId } from "./run-id.ts";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1";
const MODEL = "openai/gpt-6-astra";

const INSTRUCTIONS = `You are a competitive-intelligence analyst assistant.
You receive a list of APPROVED competitor updates (each with an [E#] id, competitor, feature, status, confidence, reason, source URL) and an analyst question.
Answer ONLY from the provided evidence. Structure your answer in Markdown:
## Answer — 2-4 sentence direct answer.
## Patterns — bullet list of patterns or trends you see (e.g. themes, shipped vs announced, competitor focus).
## Supporting evidence — bullets citing entries as [E#] with competitor, feature, and source URL.
If the evidence is insufficient, say so plainly and suggest what data would help. Never invent updates.`;

async function loadApproved() {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const sb = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false, autoRefreshToken: false, storage: undefined },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await sb
    .from("vw_weekly_digest")
    .select("competitor_name, display_feature_name, status, confidence, reason, source_url, retrieved_at")
    .eq("approved", true)
    .limit(200);
  if (error) throw new Error(error.message);
  return data ?? [];
}

export async function handleInsights(request: Request): Promise<Response> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) return Response.json({ error: "AI is not configured." }, { status: 500 });

  let question = "";
  try {
    const body = (await request.json()) as { question?: unknown };
    question = typeof body.question === "string" ? body.question.trim().slice(0, 1000) : "";
  } catch {
    /* fallthrough */
  }
  if (!question) return Response.json({ error: "Please enter a question." }, { status: 400 });

  let rows;
  try {
    rows = await loadApproved();
  } catch (e) {
    console.error("insights: load failed", e);
    return Response.json({ error: "Couldn't load approved updates." }, { status: 500 });
  }
  if (!rows.length) return Response.json({ error: "There are no approved updates to analyze yet." }, { status: 400 });

  const evidence = rows
    .map(
      (r, i) =>
        `[E${i + 1}] competitor=${r.competitor_name} | feature=${r.display_feature_name} | status=${r.status} | confidence=${r.confidence} | date=${r.retrieved_at} | reason=${r.reason} | source=${r.source_url}`,
    )
    .join("\n");

  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: GATEWAY_URL,
    apiKey,
    headers: { "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: runIdFetch.fetch,
  });

  const result = streamText({
    model: provider.responses(MODEL),
    instructions: INSTRUCTIONS,
    messages: [{ role: "user", content: `Approved updates:\n${evidence}\n\nAnalyst question: ${question}` }],
    abortSignal: request.signal,
    providerOptions: {
      openai: {
        forceReasoning: true,
        reasoningEffort: "medium",
        reasoningSummary: "auto",
        store: false,
        include: ["reasoning.encrypted_content"],
      },
    },
  });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const part of result.fullStream) {
          if (part.type === "text-delta") controller.enqueue(encoder.encode(part.text));
          else if (part.type === "error") {
            const err = part.error as { statusCode?: number; message?: string } | undefined;
            const msg =
              err?.statusCode === 402
                ? "AI credits are exhausted. Add credits in workspace billing to continue."
                : err?.statusCode === 429
                  ? "Too many requests right now. Please wait a moment and try again."
                  : "The AI couldn't complete this request.";
            console.error("insights: stream error", part.error);
            controller.enqueue(encoder.encode(`\n\n[[ERROR]]${msg}`));
          }
        }
      } catch (e) {
        if (!request.signal.aborted) {
          console.error("insights: failed", e);
          controller.enqueue(encoder.encode(`\n\n[[ERROR]]The AI couldn't complete this request.`));
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}
