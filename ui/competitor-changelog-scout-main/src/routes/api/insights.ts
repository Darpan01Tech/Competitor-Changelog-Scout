import { createFileRoute } from "@tanstack/react-router";
import { handleInsights } from "@/lib/ai/insights.server";

export const Route = createFileRoute("/api/insights")({
  server: { handlers: { POST: ({ request }) => handleInsights(request) } },
});
