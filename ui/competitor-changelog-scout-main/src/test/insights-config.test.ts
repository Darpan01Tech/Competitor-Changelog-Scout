import { afterEach, describe, expect, it, vi } from "vitest";
import { handleInsights } from "@/lib/ai/insights.server";

afterEach(() => vi.unstubAllEnvs());

function request() {
  return new Request("https://app.test/api/insights", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question: "What changed?" }),
  });
}

describe("Ask Insights configuration feedback", () => {
  it("names the missing server-only AI key", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "");
    const response = await handleInsights(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "AI is not configured. Set the server-side LOVABLE_API_KEY to enable Ask Insights.",
    });
  });

  it("names missing server-side Supabase read settings", async () => {
    vi.stubEnv("LOVABLE_API_KEY", "test-only-provider-key");
    vi.stubEnv("SUPABASE_URL", "");
    vi.stubEnv("SUPABASE_PUBLISHABLE_KEY", "");
    const response = await handleInsights(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: "Ask Insights needs server-side SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY to load approved evidence.",
    });
  });
});
