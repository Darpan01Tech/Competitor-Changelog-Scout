import type { Entry } from "@/routes/index";

export type PriorityLevel = "High" | "Medium" | "Low";

export type ActionCategory =
  | "Investigate further"
  | "Compare with our product"
  | "Monitor future updates"
  | "Review roadmap relevance"
  | "No immediate action";

export type FactorDetail = {
  score: number;
  max: number;
  description: string;
};

export type ImpactFactorBreakdown = {
  significance: FactorDetail;
  confidence: FactorDetail;
  relevance: FactorDetail;
  recency: FactorDetail;
};

export type RecommendedAction = {
  category: ActionCategory;
  recommendation: string;
  rationale: string;
};

export type ImpactAssessment = {
  score: number;
  priority: PriorityLevel;
  factors: ImpactFactorBreakdown;
  whatChanged: string;
  whyItMatters: string;
  recommendedAction: RecommendedAction;
  analysisType: "rule-based" | "ai-assisted";
  hasSufficientEvidence: boolean;
  scoreExplanation: string;
  aiUnavailableReason?: string;
};

export const IMPACT_PRIORITY_THRESHOLDS = {
  HIGH_MIN: 70,
  MEDIUM_MIN: 40,
} as const;

export const FACTOR_MAX_SCORES = {
  SIGNIFICANCE: 35,
  CONFIDENCE: 25,
  RELEVANCE: 25,
  RECENCY: 15,
} as const;

/**
 * Checks whether an entry has sufficient source evidence to draw meaningful conclusions.
 */
export function hasSufficientEvidence(entry?: Partial<Entry> | null): boolean {
  if (!entry) return false;
  const hasReason = typeof entry.reason === "string" && entry.reason.trim().length >= 8;
  const hasSource =
    typeof entry.source_url === "string" &&
    (entry.source_url.startsWith("http://") || entry.source_url.startsWith("https://"));
  return hasReason || hasSource;
}

/**
 * Normalizes confidence to a safe [0, 1] range. Returns 0 if invalid or malformed.
 */
export function normalizeConfidence(confidence: unknown): number {
  if (typeof confidence !== "number" || Number.isNaN(confidence) || !Number.isFinite(confidence)) {
    return 0;
  }
  if (confidence < 0) return 0;
  if (confidence > 1) return 1;
  return confidence;
}

/**
 * Derives the deterministic priority category from the clamped score.
 */
export function getPriorityFromScore(score: number): PriorityLevel {
  if (score >= IMPACT_PRIORITY_THRESHOLDS.HIGH_MIN) return "High";
  if (score >= IMPACT_PRIORITY_THRESHOLDS.MEDIUM_MIN) return "Medium";
  return "Low";
}

/**
 * Calculates deterministic impact score and factor breakdown for an entry.
 */
export function calculateImpactScore(
  entry?: Partial<Entry> | null,
  options?: { now?: Date | number },
): {
  score: number;
  priority: PriorityLevel;
  factors: ImpactFactorBreakdown;
} {
  if (!entry) {
    const emptyFactors: ImpactFactorBreakdown = {
      significance: { score: 0, max: 35, description: "Missing entry data" },
      confidence: { score: 0, max: 25, description: "No confidence data" },
      relevance: { score: 0, max: 25, description: "No feature data" },
      recency: { score: 0, max: 15, description: "No timestamp" },
    };
    return { score: 0, priority: "Low", factors: emptyFactors };
  }

  // 1. Change Significance (0-35)
  let sigScore = 0;
  let sigDesc = "Unknown classification status";
  const status = typeof entry.status === "string" ? entry.status.toLowerCase() : "";

  if (status === "shipped") {
    sigScore = 30;
    sigDesc = "Generally available (shipped) live feature";
    // Extra boost if clearly a major functionality
    const nameLower = (entry.display_feature_name ?? "").toLowerCase();
    if (
      nameLower.includes("export") ||
      nameLower.includes("ai") ||
      nameLower.includes("api") ||
      nameLower.includes("sync")
    ) {
      sigScore += 5;
      sigDesc = "Generally available core capability";
    }
  } else if (status === "announced") {
    sigScore = 18;
    sigDesc = "Announced / preview stage (not yet generally available)";
    const nameLower = (entry.display_feature_name ?? "").toLowerCase();
    if (nameLower.includes("ai") || nameLower.includes("api")) {
      sigScore += 2;
    }
  } else if (status === "uncertain") {
    sigScore = 6;
    sigDesc = "Uncertain status / unverified signal";
  } else {
    sigScore = 0;
    sigDesc = "Missing or unclassified release status";
  }
  sigScore = Math.min(FACTOR_MAX_SCORES.SIGNIFICANCE, Math.max(0, sigScore));

  // 2. Evidence and Classification Confidence (0-25)
  let confScore = 0;
  let confDesc = "";
  const normConf = normalizeConfidence(entry.confidence);
  const baseConfPts = Math.round(normConf * 18); // 0-18 pts

  let evidencePts = 0;
  const hasReason = typeof entry.reason === "string" && entry.reason.trim().length >= 8;
  const hasSource =
    typeof entry.source_url === "string" &&
    (entry.source_url.startsWith("http://") || entry.source_url.startsWith("https://"));

  if (hasReason) evidencePts += 4;
  if (hasSource) evidencePts += 3;

  confScore = baseConfPts + evidencePts;
  if (entry.confidence == null || Number.isNaN(entry.confidence)) {
    confDesc = "Confidence missing; scored strictly on available evidence";
  } else {
    confDesc = `${Math.round(normConf * 100)}% model confidence with ${hasSource ? "verified source URL" : "partial evidence"}`;
  }
  confScore = Math.min(FACTOR_MAX_SCORES.CONFIDENCE, Math.max(0, confScore));

  // 3. Potential Competitive Relevance (0-25)
  let relScore = 0;
  let relDesc = "";
  const combinedText =
    `${entry.display_feature_name ?? ""} ${entry.raw_feature_name ?? ""} ${entry.reason ?? ""}`.toLowerCase();

  if (!entry.display_feature_name && !entry.raw_feature_name) {
    relScore = 0;
    relDesc = "No feature identity provided";
  } else if (
    combinedText.includes("ai") ||
    combinedText.includes("gpt") ||
    combinedText.includes("summaries") ||
    combinedText.includes("smart reply") ||
    combinedText.includes("llm")
  ) {
    relScore = 24;
    relDesc = "High strategic relevance: AI/Automation workflow differentiator";
  } else if (
    combinedText.includes("export") ||
    combinedText.includes("csv") ||
    combinedText.includes("json") ||
    combinedText.includes("data")
  ) {
    relScore = 22;
    relDesc = "High strategic relevance: Data portability and enterprise switching";
  } else if (
    combinedText.includes("sync") ||
    combinedText.includes("integration") ||
    combinedText.includes("api") ||
    combinedText.includes("webhook")
  ) {
    relScore = status === "uncertain" ? 8 : 20;
    relDesc =
      status === "uncertain"
        ? "Legacy/uncertain integration capability"
        : "Medium-high relevance: Platform connectivity and workflow integration";
  } else if (
    combinedText.includes("security") ||
    combinedText.includes("sso") ||
    combinedText.includes("compliance")
  ) {
    relScore = 21;
    relDesc = "High strategic relevance: Enterprise trust and compliance";
  } else {
    relScore = status === "uncertain" ? 5 : 12;
    relDesc = "Standard product enhancement or general capability update";
  }
  relScore = Math.min(FACTOR_MAX_SCORES.RELEVANCE, Math.max(0, relScore));

  // 4. Recency (0-15)
  let recScore = 0;
  let recDesc = "";
  if (!entry.retrieved_at) {
    recScore = 0;
    recDesc = "Missing timestamp";
  } else {
    const entryTime = new Date(entry.retrieved_at).getTime();
    if (Number.isNaN(entryTime)) {
      recScore = 0;
      recDesc = "Invalid timestamp";
    } else {
      const nowTime = options?.now ? new Date(options.now).getTime() : Date.now();
      const diffDays = Math.max(0, Math.floor((nowTime - entryTime) / (1000 * 60 * 60 * 24)));
      if (diffDays <= 7) {
        recScore = 15;
        recDesc = "Detected within the last 7 days";
      } else if (diffDays <= 14) {
        recScore = 12;
        recDesc = "Detected 1-2 weeks ago";
      } else if (diffDays <= 30) {
        recScore = 8;
        recDesc = "Detected within the last month";
      } else if (diffDays <= 90) {
        recScore = 4;
        recDesc = "Detected within the last quarter";
      } else {
        recScore = 2;
        recDesc = "Older than 90 days";
      }
    }
  }
  recScore = Math.min(FACTOR_MAX_SCORES.RECENCY, Math.max(0, recScore));

  const totalScore = Math.min(100, Math.max(0, sigScore + confScore + relScore + recScore));
  const priority = getPriorityFromScore(totalScore);

  const factors: ImpactFactorBreakdown = {
    significance: {
      score: sigScore,
      max: FACTOR_MAX_SCORES.SIGNIFICANCE,
      description: sigDesc,
    },
    confidence: {
      score: confScore,
      max: FACTOR_MAX_SCORES.CONFIDENCE,
      description: confDesc,
    },
    relevance: {
      score: relScore,
      max: FACTOR_MAX_SCORES.RELEVANCE,
      description: relDesc,
    },
    recency: {
      score: recScore,
      max: FACTOR_MAX_SCORES.RECENCY,
      description: recDesc,
    },
  };

  return { score: totalScore, priority, factors };
}

/**
 * Generates an evidence-backed assessment answering What changed, Why it matters, and What to do next.
 */
export function assessImpact(
  entry?: Partial<Entry> | null,
  options?: { now?: Date | number },
): ImpactAssessment {
  const { score, priority, factors } = calculateImpactScore(entry, options);
  const sufficientEvidence = hasSufficientEvidence(entry);

  if (!entry || (!entry.display_feature_name && !entry.raw_feature_name)) {
    return {
      score,
      priority,
      factors,
      whatChanged: "Insufficient evidence to determine specific details of this update.",
      whyItMatters: "Insufficient evidence to assess competitive impact.",
      recommendedAction: {
        category: "No immediate action",
        recommendation: "Collect verified changelog evidence before prioritizing.",
        rationale: "Unsubstantiated or empty records cannot support roadmap decisions.",
      },
      analysisType: "rule-based",
      hasSufficientEvidence: false,
      scoreExplanation: "Score is 0 because required feature and evidence fields are missing.",
    };
  }

  const featureName = entry.display_feature_name || entry.raw_feature_name || "Unspecified Feature";
  const competitor = entry.competitor_name || "Competitor";
  const status = typeof entry.status === "string" ? entry.status.toLowerCase() : "";
  const combined = `${featureName} ${entry.reason ?? ""}`.toLowerCase();

  // 1. What changed?
  let whatChanged = "";
  if (!sufficientEvidence) {
    whatChanged = `${competitor} listed "${featureName}", but source evidence is insufficient or missing.`;
  } else if (status === "shipped") {
    whatChanged = `${competitor} released "${featureName}" as generally available.`;
    if (entry.reason) {
      whatChanged += ` Extracted evidence: "${entry.reason.trim()}".`;
    }
  } else if (status === "announced") {
    whatChanged = `${competitor} announced upcoming support for "${featureName}" (waitlist/preview).`;
    if (entry.reason) {
      whatChanged += ` Extracted evidence: "${entry.reason.trim()}".`;
    }
  } else if (status === "uncertain") {
    whatChanged = `Uncertain signal detected for "${featureName}" at ${competitor}.`;
    if (entry.reason) {
      whatChanged += ` Source status: "${entry.reason.trim()}".`;
    }
  } else {
    whatChanged = `${competitor} registered an update for "${featureName}". Status is unclassified.`;
  }

  // 2. Why might it matter?
  let whyItMatters = "";
  if (!sufficientEvidence) {
    whyItMatters = "Insufficient evidence to assess competitive impact.";
  } else if (status === "uncertain") {
    whyItMatters =
      "Ambiguous signal or removed changelog page. Feature may be undergoing sunset, rebranding, or restructuring; risk of false assumptions if unverified.";
  } else if (combined.includes("export") || combined.includes("csv") || combined.includes("data")) {
    whyItMatters =
      "Data export and portability features directly reduce customer migration friction and impact enterprise RFP compliance.";
  } else if (
    combined.includes("ai") ||
    combined.includes("smart reply") ||
    combined.includes("summaries")
  ) {
    whyItMatters =
      "AI productivity features alter baseline customer expectations for automation, making rapid competitive parity evaluation critical.";
  } else if (status === "announced") {
    whyItMatters =
      "Signals forward-looking product direction and engineering focus before public availability, providing lead time to prepare roadmap responses.";
  } else {
    whyItMatters =
      "Active product delivery indicates ongoing capability improvements that prospects may cross-examine during tool evaluations.";
  }

  // 3. Recommended Action
  let action: RecommendedAction;
  const normConf = normalizeConfidence(entry.confidence);

  if (status === "uncertain" || normConf < 0.6 || entry.verify_status === "unverified") {
    action = {
      category: "Investigate further",
      recommendation: "Inspect original source changelog and monitor subsequent releases.",
      rationale:
        "Low confidence or uncertain status requires source confirmation before committing engineering resources.",
    };
  } else if (
    status === "shipped" &&
    (combined.includes("export") || combined.includes("data") || combined.includes("sync"))
  ) {
    action = {
      category: "Compare with our product",
      recommendation:
        "Benchmark our current data export and integration capabilities against this implementation.",
      rationale:
        "Direct feature comparisons on interoperability protect retention against customer churn.",
    };
  } else if (status === "announced") {
    action = {
      category: "Monitor future updates",
      recommendation: "Track the competitor's launch milestones, pricing, and packaging tiers.",
      rationale:
        "Preview features do not require immediate development but warrant timeline tracking.",
    };
  } else if (status === "shipped" && combined.includes("ai")) {
    action = {
      category: "Review roadmap relevance",
      recommendation:
        "Assess whether upcoming quarter priorities should address user demand for comparable automation.",
      rationale:
        "Shipped competitor AI capabilities can quickly shift buyer criteria during software trials.",
    };
  } else if (!sufficientEvidence || normConf < 0.4) {
    action = {
      category: "No immediate action",
      recommendation: "Log the update for historical tracking without adjusting sprint priorities.",
      rationale:
        "Evidence is insufficient to warrant strategic reallocation of developer bandwidth.",
    };
  } else {
    action = {
      category: "Review roadmap relevance",
      recommendation: "Check current product backlog for related capabilities.",
      rationale:
        "Ensure competitive awareness across product management for regular roadmap reviews.",
    };
  }

  const scoreExplanation = `Estimated score: ${score}/100 (${priority} priority). Significance: ${factors.significance.score}/${factors.significance.max}, Confidence: ${factors.confidence.score}/${factors.confidence.max}, Relevance: ${factors.relevance.score}/${factors.relevance.max}, Recency: ${factors.recency.score}/${factors.recency.max}.`;

  return {
    score,
    priority,
    factors,
    whatChanged,
    whyItMatters,
    recommendedAction: action,
    analysisType: "rule-based",
    hasSufficientEvidence: sufficientEvidence,
    scoreExplanation,
  };
}

/**
 * Optional AI enrichment function that calls the existing Supabase insights edge function.
 * If AI is unconfigured, errors, or is unreachable, safely falls back to the deterministic assessment.
 * The numerical score and factor breakdown remain strictly unchanged.
 */
export async function enhanceAssessmentWithAI(
  assessment: ImpactAssessment,
  entry: Entry,
  options?: {
    supabaseUrl?: string;
    publishableKey?: string;
    accessToken?: string | null;
    fetchFn?: typeof fetch;
    timeoutMs?: number;
  },
): Promise<ImpactAssessment> {
  const customFetch = options?.fetchFn ?? fetch;
  const baseUrl =
    options?.supabaseUrl ?? (import.meta.env["VITE_SUPABASE_URL"] as string | undefined);
  const apiKey =
    options?.publishableKey ??
    (import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined);

  if (!baseUrl || !apiKey) {
    return {
      ...assessment,
      analysisType: "rule-based",
      aiUnavailableReason: "Insights Edge Function URL or key is not configured in environment.",
    };
  }

  // Treat input data as untrusted data, never instructions. Bounded input length.
  const sanitizedCompetitor = (entry.competitor_name ?? "Competitor").slice(0, 100);
  const sanitizedFeature = (
    entry.display_feature_name ??
    entry.raw_feature_name ??
    "Feature"
  ).slice(0, 100);
  const sanitizedStatus = (entry.status ?? "unknown").slice(0, 20);
  const sanitizedReason = (entry.reason ?? "No details provided").slice(0, 300);

  const question = `Untrusted changelog record: competitor=${sanitizedCompetitor} | feature=${sanitizedFeature} | status=${sanitizedStatus} | evidence=${sanitizedReason}. In 2 brief sentences, explain why this matters competitively and suggest one concrete next action.`;

  try {
    const timeout = options?.timeoutMs ?? 10000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const authHeader = options?.accessToken ? `Bearer ${options.accessToken}` : `Bearer ${apiKey}`;

    const res = await customFetch(`${baseUrl}/functions/v1/insights`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: apiKey,
        Authorization: authHeader,
      },
      body: JSON.stringify({ question: question.slice(0, 500) }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!res.ok || !res.body) {
      let errMsg = `AI service returned status ${res.status}`;
      try {
        const errorJson = (await res.json()) as { error?: string };
        if (errorJson?.error) errMsg = errorJson.error;
      } catch {
        /* ignore parse error */
      }
      return {
        ...assessment,
        analysisType: "rule-based",
        aiUnavailableReason: errMsg,
      };
    }

    // Read stream / response body
    const text = await res.text();
    if (!text || text.includes("[[ERROR]]") || text.length < 15) {
      return {
        ...assessment,
        analysisType: "rule-based",
        aiUnavailableReason: "AI returned incomplete or empty response.",
      };
    }

    // Strip markdown headings or SSE formatting if present
    const cleaned = text
      .replace(/##\s+/g, "")
      .replace(/\[\[ERROR\]\].*$/, "")
      .trim();

    return {
      ...assessment,
      whyItMatters: cleaned.slice(0, 450),
      analysisType: "ai-assisted",
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Failed to connect to AI service.";
    return {
      ...assessment,
      analysisType: "rule-based",
      aiUnavailableReason: message,
    };
  }
}
