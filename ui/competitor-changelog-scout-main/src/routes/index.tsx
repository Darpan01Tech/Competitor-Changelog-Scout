import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Check,
  ExternalLink,
  Radar,
  ShieldCheck,
  ShieldAlert,
  FlaskConical,
  Minus,
  Sparkles,
  X,
  Clock,
  Globe,
  Activity,
  Hourglass,
  Terminal,
  RefreshCw,
  RotateCcw,
  Lock,
  KeyRound,
  Loader2,
  LogOut,
  ChevronDown,
  ChevronUp,
  Info,
  Lightbulb,
  TrendingUp,
} from "lucide-react";
import {
  type ImpactAssessment,
  type PriorityLevel,
  assessImpact,
  enhanceAssessmentWithAI,
  IMPACT_PRIORITY_THRESHOLDS,
} from "@/lib/impact-radar";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AskInsights } from "@/components/AskInsights";
import { isPending, verificationStatus } from "@/lib/review";
import { DEMO_ENTRIES, DEMO_TEST_RESULTS } from "@/lib/demo-data";
import {
  type DemoDecision,
  type SessionDemoDecisions,
  applyDemoDecision,
  getDemoPendingCount,
  getDemoReviewedEntries,
  isDemoPending,
  resetDemoDecisions,
} from "@/lib/demo-review";
import {
  authenticateReviewer,
  createSupabaseReviewerAuthAdapter,
  submitLiveDecision,
  verifyReviewerAccess,
} from "@/lib/reviewer-auth";
import { Button } from "@/components/ui/button";

const DEFAULT_REFRESH_INTERVAL_MS = 15_000;
const configuredRefreshInterval = Number(import.meta.env["VITE_DASHBOARD_REFRESH_INTERVAL_MS"]);
const DASHBOARD_REFRESH_INTERVAL_MS =
  Number.isInteger(configuredRefreshInterval) &&
  configuredRefreshInterval >= 5_000 &&
  configuredRefreshInterval <= 300_000
    ? configuredRefreshInterval
    : DEFAULT_REFRESH_INTERVAL_MS;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Competitor Changelog Scout — Dashboard" },
      {
        name: "description",
        content:
          "Source-backed competitor updates, session-only demo review, and test execution status.",
      },
      { property: "og:title", content: "Competitor Changelog Scout" },
      {
        property: "og:description",
        content:
          "Source-backed competitor updates, session-only demo review, and test execution status.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Dashboard,
});

/* ------------------------------------------------------------------ */
/* Data layer — all entries live in ONE React state array.            */
/* `fetchEntries` is the single place that talks to the backend.      */
/* ------------------------------------------------------------------ */

export type Entry = {
  id: string;
  competitor_name: string;
  display_feature_name: string;
  raw_feature_name: string;
  status: "shipped" | "announced" | "uncertain";
  confidence: number;
  reason: string;
  source_url: string;
  retrieved_at: string;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  verify_status: string | null;
};

const EMPTY_ENTRIES: Entry[] = [];

async function fetchEntries(): Promise<Entry[]> {
  const { data, error } = await supabase
    .from("vw_weekly_digest")
    .select(
      "id, competitor_name, display_feature_name, raw_feature_name, status, confidence, reason, source_url, retrieved_at, approval_status, approved_by, approved_at, verify_status",
    );
  if (error) throw error;
  return (data ?? []) as Entry[];
}

function useEntries() {
  return useQuery({
    queryKey: ["entries"],
    queryFn: fetchEntries,
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

type TestResult = {
  id: string;
  scenario: string;
  expected_result: string;
  passed: boolean;
  execution_status: string;
};

type ScanRun = { run_date: string; status: string };

function useTestResults() {
  return useQuery({
    queryKey: ["test_results"],
    queryFn: async (): Promise<TestResult[]> => {
      const { data, error } = await supabase
        .from("test_results")
        .select("id, scenario, expected_result, passed, execution_status")
        .order("id");
      if (error) throw error;
      return data ?? [];
    },
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

function useLastScan() {
  return useQuery({
    queryKey: ["last_scan"],
    queryFn: async (): Promise<ScanRun | null> => {
      const { data, error } = await supabase
        .from("runs")
        .select("run_date, status")
        .eq("status", "waiting_approval")
        .order("run_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    refetchInterval: DASHBOARD_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: false,
  });
}

function timeAgo(iso?: string) {
  if (!iso) return "—";
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const h = Math.round(mins / 60);
  if (h < 48) return `${h} hr${h === 1 ? "" : "s"} ago`;
  return `${Math.round(h / 24)} days ago`;
}

/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    shipped: "bg-primary/15 text-primary ring-primary/30",
    announced: "bg-warning/15 text-warning ring-warning/30",
    uncertain: "bg-destructive/15 text-destructive ring-destructive/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ring-1",
        styles[status] ?? styles["uncertain"],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function SourceLink({ url }: { url: string }) {
  let host = url;
  try {
    host = new URL(url).hostname;
  } catch {
    /* keep raw */
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-primary"
    >
      <ExternalLink className="size-3" />
      {host}
    </a>
  );
}

type ReviewerAccount = {
  email: string | null;
  id: string;
};

function useReviewerSession() {
  const [sessionUser, setSessionUser] = useState<ReviewerAccount | null>(null);
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const syncSession = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session) {
        setSessionUser(null);
        setIsAuthorized(false);
        setAuthError(null);
        return false;
      }
      setSessionUser(
        session.user ? { email: session.user.email ?? null, id: session.user.id } : null,
      );
      const authorized = await verifyReviewerAccess(session.access_token);
      setIsAuthorized(authorized);
      if (!authorized) {
        setAuthError("This account is not authorized to review entries.");
      } else {
        setAuthError(null);
      }
      return authorized;
    } catch (err) {
      setIsAuthorized(false);
      setAuthError(err instanceof Error ? err.message : "Failed to verify session.");
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void syncSession();

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      if (newSession) {
        setSessionUser(
          newSession.user ? { email: newSession.user.email ?? null, id: newSession.user.id } : null,
        );
        void verifyReviewerAccess(newSession.access_token).then((authorized) => {
          setIsAuthorized(authorized);
          if (!authorized) {
            setAuthError("This account is not authorized to review entries.");
          } else {
            setAuthError(null);
          }
          setIsLoading(false);
        });
      } else {
        setSessionUser(null);
        setIsAuthorized(false);
        setAuthError(null);
        setIsLoading(false);
      }
    });

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, [syncSession]);

  const login = async (email: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    setAuthError(null);
    const adapter = createSupabaseReviewerAuthAdapter(supabase);
    const result = await authenticateReviewer(adapter, email, password);
    if (!result.ok) {
      setIsAuthorized(false);
      setIsLoading(false);
      if (result.reason === "invalid_credentials") {
        setAuthError("Invalid email or password. Please verify your reviewer credentials.");
      } else if (result.reason === "not_authorized") {
        setAuthError("This account is not authorized to review entries.");
      } else {
        setAuthError("Sign in failed. Please check credentials.");
      }
      return false;
    }
    setIsAuthorized(true);
    setAuthError(null);
    setIsLoading(false);
    return true;
  };

  const logout = async (): Promise<void> => {
    setIsLoading(true);
    setAuthError(null);
    await supabase.auth.signOut();
    setSessionUser(null);
    setIsAuthorized(false);
    setIsLoading(false);
  };

  return {
    user: sessionUser,
    isAuthorized,
    isLoading,
    authError,
    setAuthError,
    login,
    logout,
    syncSession,
  };
}

function Dashboard() {
  const reviewerAuth = useReviewerSession();
  const entriesQuery = useEntries();
  const testsQuery = useTestResults();
  const scanQuery = useLastScan();
  const queryClient = useQueryClient();
  const liveEntries = entriesQuery.data ?? EMPTY_ENTRIES;
  const usingDemoEntries = entriesQuery.isError && !entriesQuery.data;
  const usingDemoTests = testsQuery.isError && !testsQuery.data;
  const entries = usingDemoEntries ? DEMO_ENTRIES : liveEntries;
  const testResults = usingDemoTests ? DEMO_TEST_RESULTS : testsQuery.data;
  const isLoading = entriesQuery.isLoading;
  const error = entriesQuery.error;
  const [tab, setTab] = useState("radar");
  const [refreshing, setRefreshing] = useState(false);
  const refreshingRef = useRef(false);
  const [refreshMessage, setRefreshMessage] = useState("");
  const [lastSuccessfulRefresh, setLastSuccessfulRefresh] = useState<Date | null>(null);
  const refreshFailed = entriesQuery.isError || testsQuery.isError || scanQuery.isError;

  useEffect(() => {
    if (
      !refreshFailed &&
      entriesQuery.dataUpdatedAt &&
      testsQuery.dataUpdatedAt &&
      scanQuery.dataUpdatedAt
    ) {
      setLastSuccessfulRefresh(
        new Date(
          Math.max(entriesQuery.dataUpdatedAt, testsQuery.dataUpdatedAt, scanQuery.dataUpdatedAt),
        ),
      );
    }
  }, [
    entriesQuery.dataUpdatedAt,
    testsQuery.dataUpdatedAt,
    scanQuery.dataUpdatedAt,
    refreshFailed,
  ]);

  async function refreshDashboard() {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    setRefreshing(true);
    setRefreshMessage("");
    const results = await Promise.allSettled([
      entriesQuery.refetch({ throwOnError: true, cancelRefetch: false }),
      testsQuery.refetch({ throwOnError: true, cancelRefetch: false }),
      scanQuery.refetch({ throwOnError: true, cancelRefetch: false }),
    ]);
    const labels = ["competitor entries", "test results", "scan history"];
    const failed = results.flatMap((result, index) =>
      result.status === "rejected" || result.value?.isError ? [labels[index]] : [],
    );
    if (failed.length) {
      setRefreshMessage(
        `Refresh incomplete for ${failed.join(", ")}. Last successful refresh time was not changed.`,
      );
    } else {
      const refreshedAt = new Date();
      setLastSuccessfulRefresh(refreshedAt);
      setRefreshMessage("Dashboard data refreshed.");
    }
    refreshingRef.current = false;
    setRefreshing(false);
  }

  const [demoDecisions, setDemoDecisions] = useState<SessionDemoDecisions>({});
  const [demoMessage, setDemoMessage] = useState("");

  function handleDemoDecision(entry: Entry, decision: DemoDecision) {
    setDemoDecisions((prev) => applyDemoDecision(prev, entry.id, decision));
    setDemoMessage(`Demo update "${entry.display_feature_name}" marked as ${decision}.`);
  }

  function handleResetDemo() {
    setDemoDecisions(resetDemoDecisions());
    setDemoMessage("Demo review queue reset to 4 pending items.");
  }

  const demoPendingCount = useMemo(
    () => getDemoPendingCount(DEMO_ENTRIES, demoDecisions),
    [demoDecisions],
  );

  const approved = useMemo(() => {
    if (usingDemoEntries) {
      return entries.filter(
        (e) => e.approval_status === "approved" || demoDecisions[e.id] === "accepted",
      );
    }
    return entries.filter((e) => e.approval_status === "approved");
  }, [entries, usingDemoEntries, demoDecisions]);

  const livePending = useMemo(() => liveEntries.filter(isPending), [liveEntries]);

  const kpis = useMemo(() => {
    const latest = entries
      .map((e) => e.retrieved_at)
      .sort()
      .at(-1);
    return {
      lastEntry: timeAgo(latest),
      sources: new Set(entries.map((e) => e.competitor_name)).size,
      detected: entries.length,
      pending: usingDemoEntries ? demoPendingCount : livePending.length,
    };
  }, [entries, usingDemoEntries, demoPendingCount, livePending.length]);

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary">
              <Radar className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Changelog Scout</span>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
              / competitor intel
            </span>
          </div>
          <div className="flex items-center gap-2">
            {reviewerAuth.isAuthorized && reviewerAuth.user && (
              <span className="hidden items-center gap-1.5 rounded-full bg-primary/15 px-2.5 py-1 font-mono text-[11px] font-medium text-primary ring-1 ring-primary/30 sm:inline-flex">
                <ShieldCheck className="size-3.5" />
                Reviewer: {reviewerAuth.user.email}
              </span>
            )}
            <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
              <span className="size-2 rounded-full bg-muted-foreground" />
              <span className="font-mono text-xs text-secondary-foreground">
                Workflow status unverified
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {(usingDemoEntries || usingDemoTests) && (
          <aside
            className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
            role="status"
          >
            <strong>
              Local demo data is being shown for{" "}
              {[
                ...(usingDemoEntries ? ["dashboard entries"] : []),
                ...(usingDemoTests ? ["test scenarios"] : []),
              ].join(" and ")}
              .
            </strong>{" "}
            These samples are not live Supabase records or executed test results. Live data remains
            separate and will be shown when its request succeeds.
            <details className="mt-2 text-xs">
              <summary className="cursor-pointer">Why is live data unavailable?</summary>
              <ul className="mt-1 list-inside list-disc">
                {usingDemoEntries && (
                  <li>
                    Entries:{" "}
                    {entriesQuery.error instanceof Error
                      ? entriesQuery.error.message
                      : "Supabase request failed."}
                  </li>
                )}
                {usingDemoTests && (
                  <li>
                    Test results:{" "}
                    {testsQuery.error instanceof Error
                      ? testsQuery.error.message
                      : "Supabase request failed."}
                  </li>
                )}
              </ul>
            </details>
          </aside>
        )}
        <section
          className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/90 px-4 py-3 shadow-sm sm:px-5"
          aria-live="polite"
        >
          <div className="space-y-1 text-sm">
            <div className="text-foreground">
              Last dashboard refresh:{" "}
              {lastSuccessfulRefresh
                ? lastSuccessfulRefresh.toLocaleTimeString()
                : "not yet confirmed"}
            </div>
            <div className="text-xs text-muted-foreground">
              Last saved scan digest:{" "}
              {scanQuery.data?.run_date
                ? new Date(scanQuery.data.run_date).toLocaleString()
                : "no verified scan record"}
              {scanQuery.isError && " · scan history unavailable"}
            </div>
            {refreshFailed && (
              <div className="text-xs text-destructive">
                Some live data is unavailable or stale; successful prior results are retained.
              </div>
            )}
            {refreshMessage && (
              <div
                className={cn(
                  "text-xs",
                  refreshMessage.startsWith("Refresh failed") ? "text-destructive" : "text-success",
                )}
              >
                {refreshMessage}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={handleResetDemo}
              aria-label="Reset demo review queue to original 4 pending items"
            >
              <RotateCcw className="mr-2 size-4" />
              Reset demo queue
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={refreshDashboard}
              disabled={refreshing}
            >
              <RefreshCw className={cn("mr-2 size-4", refreshing && "animate-spin")} />
              {refreshing ? "Refreshing…" : "Refresh dashboard"}
            </Button>
          </div>
        </section>
        <KpiBar kpis={kpis} loading={isLoading} />

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList className="h-auto flex-wrap gap-1 rounded-xl border border-border bg-card/80 p-1">
            <TabsTrigger
              value="radar"
              className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              <Radar className="size-3.5" />
              Radar Digest
            </TabsTrigger>
            <TabsTrigger
              value="gate"
              className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              <ShieldCheck className="size-3.5" />
              Decision Gate
              {livePending.length > 0 && (
                <span
                  className="ml-1 rounded-full bg-destructive px-1.5 font-mono text-[10px] text-destructive-foreground"
                  title={`${livePending.length} live pending updates`}
                >
                  {livePending.length}
                </span>
              )}
              {demoPendingCount > 0 && (
                <span
                  className="ml-1 rounded-full bg-warning/20 px-1.5 font-mono text-[10px] text-warning ring-1 ring-warning/30"
                  title={`${demoPendingCount} demo pending updates`}
                >
                  {demoPendingCount} demo
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger
              value="ask"
              className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              <Sparkles className="size-3.5" />
              Ask Insights
            </TabsTrigger>
            <TabsTrigger
              value="tests"
              className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"
            >
              <FlaskConical className="size-3.5" />
              Test Compliance
            </TabsTrigger>
          </TabsList>
          <TabsContent value="radar" className="mt-6">
            <RadarDigest
              entries={approved}
              demoSamples={DEMO_ENTRIES}
              loading={isLoading}
              error={error}
              isDemo={usingDemoEntries}
              onNavigateToGate={() => setTab("gate")}
            />
          </TabsContent>
          <TabsContent value="gate" className="mt-6">
            <DecisionGate
              liveEntries={liveEntries}
              liveError={entriesQuery.error}
              liveLoading={entriesQuery.isLoading}
              onLiveRefresh={() => queryClient.invalidateQueries({ queryKey: ["entries"] })}
              demoDecisions={demoDecisions}
              onDemoDecision={handleDemoDecision}
              onResetDemo={handleResetDemo}
              demoMessage={demoMessage}
              reviewerAuth={reviewerAuth}
            />
          </TabsContent>
          <TabsContent value="ask" className="mt-6">
            <AskInsights />
          </TabsContent>
          <TabsContent value="tests" className="mt-6">
            <TestCompliance
              data={testResults}
              isLoading={testsQuery.isLoading}
              error={testsQuery.error}
              isDemo={usingDemoTests}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function KpiBar({
  kpis,
  loading,
}: {
  kpis: { lastEntry: string; sources: number; detected: number; pending: number };
  loading: boolean;
}) {
  const items = [
    { label: "Last Entry Detected", value: kpis.lastEntry, icon: Clock },
    { label: "Sources With Entries", value: kpis.sources, icon: Globe },
    { label: "Updates Detected", value: kpis.detected, icon: Activity },
    {
      label: "Pending Human Review",
      value: kpis.pending,
      icon: Hourglass,
      alert: kpis.pending > 0,
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon, alert }) => (
        <div
          key={label}
          className={cn(
            "rounded-xl border border-border bg-card/90 p-4 shadow-sm sm:p-5",
            alert && "kpi-alert",
          )}
        >
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <Icon className={cn("size-3.5", alert && "text-destructive")} />
            {label}
          </div>
          <div
            className={cn(
              "mt-2 text-2xl font-semibold tracking-tight",
              alert && "text-destructive",
            )}
          >
            {loading ? <Skeleton className="h-8 w-20" /> : value}
          </div>
        </div>
      ))}
    </div>
  );
}

function GridSkeleton() {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {[0, 1, 2].map((i) => (
        <Skeleton key={i} className="h-36 rounded-xl" />
      ))}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function PriorityPill({ priority }: { priority: PriorityLevel }) {
  const styles: Record<PriorityLevel, string> = {
    High: "bg-rose-500/15 text-rose-400 ring-rose-500/30",
    Medium: "bg-amber-500/15 text-amber-400 ring-amber-500/30",
    Low: "bg-blue-500/15 text-blue-400 ring-blue-500/30",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] font-semibold uppercase tracking-wider ring-1",
        styles[priority],
      )}
    >
      <span className="size-1.5 rounded-full bg-current" />
      {priority} Impact
    </span>
  );
}

function ActionCategoryBadge({ category }: { category: string }) {
  const styles: Record<string, string> = {
    "Compare with our product": "bg-primary/15 text-primary ring-primary/30",
    "Investigate further": "bg-warning/15 text-warning ring-warning/30",
    "Monitor future updates": "bg-secondary text-secondary-foreground ring-border",
    "Review roadmap relevance": "bg-purple-500/15 text-purple-400 ring-purple-500/30",
    "No immediate action": "bg-muted/30 text-muted-foreground ring-border",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-xs font-medium ring-1",
        styles[category] ?? "bg-secondary text-foreground ring-border",
      )}
    >
      <Lightbulb className="size-3.5 shrink-0" />
      {category}
    </span>
  );
}

function ImpactRadarCard({
  entry,
  isDemo,
  assessment,
  onEnrichWithAI,
  isAiLoading,
  aiError,
}: {
  entry: Entry;
  isDemo: boolean;
  assessment: ImpactAssessment;
  onEnrichWithAI: (entry: Entry) => void;
  isAiLoading: boolean;
  aiError?: string | null | undefined;
}) {
  const [showFactors, setShowFactors] = useState(false);
  const pct = assessment.score;
  const isHigh = assessment.priority === "High";
  const isMed = assessment.priority === "Medium";

  return (
    <article
      className={cn(
        "card-glow animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-4 p-5 duration-300 sm:p-6",
        isHigh && "hover:border-rose-500/40",
        isMed && "hover:border-amber-500/40",
      )}
    >
      {/* 1. Header: Competitor name, badges */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {entry.competitor_name}
          </span>
          {isDemo && (
            <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase text-warning ring-1 ring-warning/30">
              Demo sample
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={entry.verify_status} />
          <StatusBadge status={entry.status} />
        </div>
      </div>

      {/* Feature Title */}
      <div>
        <h3 className="text-lg font-semibold leading-snug">{entry.display_feature_name}</h3>
      </div>

      {/* 2. Impact Score Box & Progress Meter */}
      <div className="rounded-xl border border-border/80 bg-background/60 p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              Estimated Impact Score
            </span>
            <span
              className="cursor-help font-mono text-[11px] text-muted-foreground hover:text-foreground"
              title="Deterministic score (0–100) estimated from change significance, confidence, competitive relevance, and recency."
            >
              (Heuristic)
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-xl font-bold tracking-tight text-foreground">
              {pct}
              <span className="text-xs font-normal text-muted-foreground">/100</span>
            </span>
            <PriorityPill priority={assessment.priority} />
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={cn(
              "h-full rounded-full transition-all duration-500",
              isHigh ? "bg-rose-500" : isMed ? "bg-amber-500" : "bg-blue-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>

        {/* Factor Breakdown Toggle */}
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setShowFactors((prev) => !prev)}
            className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-foreground"
            aria-expanded={showFactors}
            aria-label="Toggle impact score factors breakdown"
          >
            {showFactors ? (
              <ChevronUp className="size-3.5" />
            ) : (
              <ChevronDown className="size-3.5" />
            )}
            <span>{showFactors ? "Hide score breakdown" : "View score factors"}</span>
          </button>

          {showFactors && (
            <div className="mt-3 space-y-2 border-t border-border/60 pt-3 text-xs">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="rounded bg-card/60 p-2">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-muted-foreground">Significance</span>
                    <span className="font-semibold text-foreground">
                      {assessment.factors.significance.score}/{assessment.factors.significance.max}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {assessment.factors.significance.description}
                  </p>
                </div>
                <div className="rounded bg-card/60 p-2">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-muted-foreground">Evidence & Confidence</span>
                    <span className="font-semibold text-foreground">
                      {assessment.factors.confidence.score}/{assessment.factors.confidence.max}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {assessment.factors.confidence.description}
                  </p>
                </div>
                <div className="rounded bg-card/60 p-2">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-muted-foreground">Competitive Relevance</span>
                    <span className="font-semibold text-foreground">
                      {assessment.factors.relevance.score}/{assessment.factors.relevance.max}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {assessment.factors.relevance.description}
                  </p>
                </div>
                <div className="rounded bg-card/60 p-2">
                  <div className="flex justify-between font-mono text-[11px]">
                    <span className="text-muted-foreground">Recency</span>
                    <span className="font-semibold text-foreground">
                      {assessment.factors.recency.score}/{assessment.factors.recency.max}
                    </span>
                  </div>
                  <p className="mt-0.5 text-muted-foreground">
                    {assessment.factors.recency.description}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 3. The Three Core Intelligence Questions */}
      <div className="space-y-3.5 text-sm">
        {/* Q1: What changed? */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <Info className="size-3.5 text-primary" />
            <span>What changed</span>
          </div>
          <p className="rounded-lg bg-card/50 p-2.5 text-xs leading-relaxed text-foreground/90">
            {assessment.whatChanged}
          </p>
        </div>

        {/* Q2: Why it matters */}
        <div className="space-y-1">
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <TrendingUp className="size-3.5 text-primary" />
            <span>Why it matters</span>
          </div>
          <p className="rounded-lg bg-card/50 p-2.5 text-xs leading-relaxed text-foreground/90">
            {assessment.whyItMatters}
          </p>
        </div>

        {/* Q3: Recommended next action */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <Lightbulb className="size-3.5 text-primary" />
            <span>Recommended action</span>
          </div>
          <div className="space-y-2 rounded-lg border border-border/80 bg-background/50 p-3">
            <div className="flex items-center gap-2">
              <ActionCategoryBadge category={assessment.recommendedAction.category} />
            </div>
            <p className="text-xs font-medium text-foreground">
              {assessment.recommendedAction.recommendation}
            </p>
            <p className="text-[11px] leading-normal text-muted-foreground">
              {assessment.recommendedAction.rationale}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Footer: Source Link & AI Deep Dive */}
      <div className="mt-auto border-t border-border pt-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <SourceLink url={entry.source_url} />

          <div className="flex items-center gap-2">
            {assessment.analysisType === "ai-assisted" ? (
              <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-2 py-0.5 font-mono text-[10px] text-primary">
                <Sparkles className="size-3" /> AI-assisted
              </span>
            ) : (
              <span className="font-mono text-[10px] text-muted-foreground">Rule-based</span>
            )}

            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isAiLoading}
              onClick={() => onEnrichWithAI(entry)}
              className="h-7 gap-1 px-2.5 text-xs"
              aria-label={`Enrich analysis for ${entry.display_feature_name} with AI`}
            >
              {isAiLoading ? (
                <Loader2 className="size-3 animate-spin" />
              ) : (
                <Sparkles className="size-3 text-primary" />
              )}
              {isAiLoading ? "Analyzing…" : "Deep dive with AI"}
            </Button>
          </div>
        </div>

        {aiError && (
          <p className="mt-2 text-xs text-warning" role="alert">
            {aiError}
          </p>
        )}
      </div>
    </article>
  );
}

function RadarDigest({
  entries,
  demoSamples,
  loading,
  error,
  isDemo,
  onNavigateToGate,
}: {
  entries: Entry[];
  demoSamples: Entry[];
  loading: boolean;
  error: Error | null;
  isDemo: boolean;
  onNavigateToGate?: () => void;
}) {
  const [viewMode, setViewMode] = useState<"digest" | "samples">(() =>
    isDemo && entries.length === 0 ? "samples" : "digest",
  );
  const [priorityFilter, setPriorityFilter] = useState<"all" | PriorityLevel>("all");
  const [enrichedMap, setEnrichedMap] = useState<Record<string, ImpactAssessment>>({});
  const [aiLoadingMap, setAiLoadingMap] = useState<Record<string, boolean>>({});
  const [aiErrorMap, setAiErrorMap] = useState<Record<string, string | null>>({});

  const activeEntries = isDemo && viewMode === "samples" ? demoSamples : entries;

  // Precompute assessments
  const assessedEntries = useMemo(() => {
    return activeEntries.map((entry) => {
      const assessment = enrichedMap[entry.id] ?? assessImpact(entry);
      return { entry, assessment };
    });
  }, [activeEntries, enrichedMap]);

  // Counts
  const counts = useMemo(() => {
    let high = 0;
    let medium = 0;
    let low = 0;
    for (const item of assessedEntries) {
      if (item.assessment.priority === "High") high++;
      else if (item.assessment.priority === "Medium") medium++;
      else low++;
    }
    return { all: assessedEntries.length, high, medium, low };
  }, [assessedEntries]);

  // Filtered
  const filteredEntries = useMemo(() => {
    if (priorityFilter === "all") return assessedEntries;
    return assessedEntries.filter((item) => item.assessment.priority === priorityFilter);
  }, [assessedEntries, priorityFilter]);

  const handleEnrichWithAI = async (entry: Entry) => {
    if (aiLoadingMap[entry.id]) return;
    setAiLoadingMap((prev) => ({ ...prev, [entry.id]: true }));
    setAiErrorMap((prev) => ({ ...prev, [entry.id]: null }));

    try {
      const baseAssessment = enrichedMap[entry.id] ?? assessImpact(entry);
      const enhanced = await enhanceAssessmentWithAI(baseAssessment, entry);
      if (enhanced.analysisType === "ai-assisted") {
        setEnrichedMap((prev) => ({ ...prev, [entry.id]: enhanced }));
      } else if (enhanced.aiUnavailableReason) {
        setAiErrorMap((prev) => ({
          ...prev,
          [entry.id]: `AI unavailable: ${enhanced.aiUnavailableReason}. Using rule-based assessment.`,
        }));
      }
    } catch (err) {
      setAiErrorMap((prev) => ({
        ...prev,
        [entry.id]: err instanceof Error ? err.message : "AI request failed.",
      }));
    } finally {
      setAiLoadingMap((prev) => ({ ...prev, [entry.id]: false }));
    }
  };

  if (loading) return <GridSkeleton />;
  if (error && !activeEntries.length) {
    return <Empty text="Couldn't load digest. Please retry when the connection is available." />;
  }

  return (
    <div className="space-y-6">
      {/* Impact Radar Header Panel */}
      <section
        aria-labelledby="impact-radar-heading"
        className="rounded-xl border border-border bg-card/90 p-5 shadow-sm sm:p-6"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded bg-primary/15 text-primary">
                <Radar className="size-3.5" />
              </span>
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Competitive Intelligence Layer
              </p>
              <span className="rounded-full bg-primary/15 px-2 py-0.5 font-mono text-[10px] uppercase text-primary ring-1 ring-primary/30">
                Impact Radar
              </span>
              {isDemo && (
                <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase text-warning ring-1 ring-warning/30">
                  Demo
                </span>
              )}
            </div>
            <h2 id="impact-radar-heading" className="text-xl font-semibold tracking-tight">
              Evidence-Backed Impact Radar
            </h2>
            <p className="max-w-2xl text-xs leading-relaxed text-muted-foreground">
              Transparent, deterministic estimated impact scores (0–100) evaluating change
              significance, evidence confidence, competitive relevance, and recency.
            </p>
          </div>

          {/* Mode switcher for demo */}
          {isDemo && (
            <div className="flex items-center rounded-lg border border-border bg-background p-1 text-xs">
              <button
                type="button"
                onClick={() => setViewMode("digest")}
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-[11px] transition-colors",
                  viewMode === "digest"
                    ? "bg-secondary font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Approved in Digest ({entries.length})
              </button>
              <button
                type="button"
                onClick={() => setViewMode("samples")}
                className={cn(
                  "rounded-md px-3 py-1 font-mono text-[11px] transition-colors",
                  viewMode === "samples"
                    ? "bg-secondary font-medium text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                All 4 Demo Samples
              </button>
            </div>
          )}
        </div>

        {/* Filter Bar */}
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-4">
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Filter:
            </span>
            <Button
              type="button"
              variant={priorityFilter === "all" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setPriorityFilter("all")}
              className="h-7 px-2.5 font-mono text-xs"
            >
              All ({counts.all})
            </Button>
            <Button
              type="button"
              variant={priorityFilter === "High" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setPriorityFilter("High")}
              className="h-7 gap-1.5 px-2.5 font-mono text-xs text-rose-400"
            >
              <span className="size-1.5 rounded-full bg-rose-500" />
              High ({counts.high})
            </Button>
            <Button
              type="button"
              variant={priorityFilter === "Medium" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setPriorityFilter("Medium")}
              className="h-7 gap-1.5 px-2.5 font-mono text-xs text-amber-400"
            >
              <span className="size-1.5 rounded-full bg-amber-500" />
              Medium ({counts.medium})
            </Button>
            <Button
              type="button"
              variant={priorityFilter === "Low" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setPriorityFilter("Low")}
              className="h-7 gap-1.5 px-2.5 font-mono text-xs text-blue-400"
            >
              <span className="size-1.5 rounded-full bg-blue-500" />
              Low ({counts.low})
            </Button>
          </div>

          <div className="font-mono text-[11px] text-muted-foreground">
            Priority: High ({IMPACT_PRIORITY_THRESHOLDS.HIGH_MIN}–100) · Medium (
            {IMPACT_PRIORITY_THRESHOLDS.MEDIUM_MIN}–{IMPACT_PRIORITY_THRESHOLDS.HIGH_MIN - 1}) · Low
            (0–
            {IMPACT_PRIORITY_THRESHOLDS.MEDIUM_MIN - 1})
          </div>
        </div>
      </section>

      {/* Grid of Impact Cards */}
      {filteredEntries.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border py-12 text-center">
          <p className="text-sm font-medium text-foreground">
            {isDemo && viewMode === "digest" && entries.length === 0
              ? "No updates approved in this session yet."
              : "No competitor updates match the current filter."}
          </p>
          {isDemo && viewMode === "digest" && entries.length === 0 && (
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setViewMode("samples")}
              >
                Explore 4 Demo Samples on Radar
              </Button>
              {onNavigateToGate && (
                <Button type="button" size="sm" onClick={onNavigateToGate}>
                  Go to Decision Gate to Accept Items
                </Button>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-1 lg:grid-cols-2">
          {filteredEntries.map(({ entry, assessment }) => (
            <ImpactRadarCard
              key={entry.id}
              entry={entry}
              isDemo={isDemo}
              assessment={assessment}
              onEnrichWithAI={handleEnrichWithAI}
              isAiLoading={Boolean(aiLoadingMap[entry.id])}
              aiError={aiErrorMap[entry.id]}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------------------- Decision Gate ---------------------------- */

function VerificationBadge({ status }: { status: string | null }) {
  const value = verificationStatus(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 font-mono text-xs",
        value === "match"
          ? "bg-success/15 text-success"
          : value === "mismatch"
            ? "bg-destructive/15 text-destructive"
            : "bg-secondary text-muted-foreground",
      )}
    >
      <ShieldCheck className="size-3.5" />
      Verified: {value}
    </span>
  );
}

function reasoningTrace(e: Entry): string[] {
  const keyword: Record<string, string> = {
    shipped: "live / generally available",
    announced: "coming soon / waitlist",
    uncertain: "no reliable signal",
  };
  const lines = [`> Source: ${e.source_url}`, `> Extracted text: "${e.reason}"`];
  if (e.raw_feature_name !== e.display_feature_name) {
    lines.push(`> Alias lookup: "${e.raw_feature_name}" -> canonical "${e.display_feature_name}"`);
  }
  lines.push(
    `> Rule matched: ${keyword[e.status] ?? "unknown"}`,
    `> Classification: ${e.status.toUpperCase()}. Confidence: ${Math.round(e.confidence * 100)}%`,
  );
  return lines;
}

function DemoReviewCard({
  entry,
  onDecision,
}: {
  entry: Entry;
  onDecision: (entry: Entry, decision: DemoDecision) => void;
}) {
  const pct = Math.round(entry.confidence * 100);
  const low = pct < 60;
  return (
    <article className={cn("card-glow flex flex-col gap-5 p-5 sm:p-6", low && "card-glow-rose")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
              {entry.competitor_name}
            </p>
            <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase text-warning ring-1 ring-warning/30">
              Demo sample
            </span>
          </div>
          <h3 className="mt-1 text-lg font-semibold">{entry.display_feature_name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={entry.verify_status} />
          <StatusBadge status={entry.status} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono uppercase tracking-wider text-muted-foreground">
              Confidence
            </span>
            <span className={cn("font-mono font-semibold", low ? "text-warning" : "text-primary")}>
              {pct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full", low ? "bg-warning" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-4">
            <SourceLink url={entry.source_url} />
          </div>
        </div>
        <div className="terminal">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Terminal className="size-3" /> Classification evidence
          </div>
          {reasoningTrace(entry).map((line, i) => (
            <div key={i} className="break-words text-secondary-foreground">
              {line}
            </div>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">
          Demo decision · session-only, never sent to Supabase
        </span>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="destructive"
            aria-label={`Reject ${entry.display_feature_name}`}
            onClick={() => onDecision(entry, "rejected")}
          >
            <X className="mr-1.5 size-4" /> Reject
          </Button>
          <Button
            type="button"
            aria-label={`Accept ${entry.display_feature_name}`}
            onClick={() => onDecision(entry, "accepted")}
          >
            <Check className="mr-1.5 size-4" /> Accept
          </Button>
        </div>
      </div>
    </article>
  );
}

function DecisionGate({
  liveEntries,
  liveError,
  liveLoading,
  onLiveRefresh,
  demoDecisions,
  onDemoDecision,
  onResetDemo,
  demoMessage,
  reviewerAuth,
}: {
  liveEntries: Entry[];
  liveError: Error | null;
  liveLoading: boolean;
  onLiveRefresh: () => void;
  demoDecisions: SessionDemoDecisions;
  onDemoDecision: (entry: Entry, decision: DemoDecision) => void;
  onResetDemo: () => void;
  demoMessage?: string;
  reviewerAuth: ReturnType<typeof useReviewerSession>;
}) {
  const demoPending = useMemo(
    () => DEMO_ENTRIES.filter((entry) => isDemoPending(entry, demoDecisions)),
    [demoDecisions],
  );
  const demoReviewed = useMemo(
    () => getDemoReviewedEntries(DEMO_ENTRIES, demoDecisions),
    [demoDecisions],
  );
  const liveReviewed = liveEntries.filter(
    (entry) => entry.approval_status === "approved" || entry.approval_status === "rejected",
  );
  const livePending = liveEntries.filter(isPending);

  return (
    <div className="space-y-8">
      {/* 1. Explicitly Labelled Demo Review Queue */}
      <section aria-labelledby="demo-queue-heading" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                Local Demo Queue
              </p>
              <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[10px] font-medium uppercase text-warning ring-1 ring-warning/30">
                Demo · In-Memory Only
              </span>
            </div>
            <h2 id="demo-queue-heading" className="mt-1 text-xl font-semibold">
              Pending demo updates{" "}
              <span className="font-mono text-sm text-muted-foreground">{demoPending.length}</span>
            </h2>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetDemo}
            aria-label="Reset demo review queue to original 4 pending items"
          >
            <RotateCcw className="mr-2 size-3.5" />
            Reset demo queue
          </Button>
        </div>

        {!demoPending.length ? (
          <Empty text="All 4 demo items have been reviewed this session. Click 'Reset demo queue' to replay the demo." />
        ) : (
          <div className="space-y-4">
            {demoPending.map((entry) => (
              <DemoReviewCard key={entry.id} entry={entry} onDecision={onDemoDecision} />
            ))}
          </div>
        )}
      </section>

      {/* 2. Demo Review Activity / History */}
      {demoReviewed.length > 0 && (
        <section aria-labelledby="demo-history-heading" className="space-y-4">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              Demo Review History
            </p>
            <h2 id="demo-history-heading" className="mt-1 text-xl font-semibold">
              Demo decisions{" "}
              <span className="font-mono text-sm text-muted-foreground">{demoReviewed.length}</span>
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {demoReviewed.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                        {entry.competitor_name}
                      </p>
                      <span className="rounded bg-warning/15 px-1.5 py-0.5 font-mono text-[9px] uppercase text-warning">
                        Demo
                      </span>
                    </div>
                    <h3 className="mt-1 font-medium">{entry.display_feature_name}</h3>
                  </div>
                  <span
                    className={cn(
                      "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold uppercase ring-1",
                      entry.decision === "accepted"
                        ? "bg-success/15 text-success ring-success/30"
                        : "bg-destructive/15 text-destructive ring-destructive/30",
                    )}
                  >
                    {entry.decision === "accepted" ? (
                      <Check className="size-3" />
                    ) : (
                      <X className="size-3" />
                    )}
                    {entry.decision}
                  </span>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Session-only demo decision · not persisted to Supabase
                </p>
                <div className="mt-2">
                  <SourceLink url={entry.source_url} />
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* 3. Live Supabase Review Queue */}
      <section
        aria-labelledby="live-pending-heading"
        className="space-y-4 border-t border-border pt-6"
      >
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Live Supabase Queue
          </p>
          <h2 id="live-pending-heading" className="mt-1 text-xl font-semibold">
            Pending live updates{" "}
            <span className="font-mono text-sm text-muted-foreground">{livePending.length}</span>
          </h2>
        </div>

        <aside
          className="rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-foreground"
          role="note"
        >
          <strong className="font-semibold">
            Live review actions require an authorized reviewer.
          </strong>{" "}
          Decisions are saved permanently to Supabase via the review Edge Function.
        </aside>

        <ReviewerAuthPanel
          isAuthorized={reviewerAuth.isAuthorized}
          isLoading={reviewerAuth.isLoading}
          user={reviewerAuth.user}
          authError={reviewerAuth.authError}
          onLogin={reviewerAuth.login}
          onLogout={reviewerAuth.logout}
        />

        {liveLoading ? (
          <GridSkeleton />
        ) : liveError && !liveEntries.length ? (
          <Empty text={`Live review queue unavailable: ${liveError.message}`} />
        ) : !livePending.length ? (
          <Empty text="No live pending updates are available for review." />
        ) : (
          <div className="space-y-4">
            {livePending.map((entry) => (
              <ReviewCard
                key={entry.id}
                entry={entry}
                isAuthorized={reviewerAuth.isAuthorized}
                authLoading={reviewerAuth.isLoading}
                user={reviewerAuth.user}
                onReviewed={onLiveRefresh}
              />
            ))}
          </div>
        )}
      </section>

      {/* 4. Live Supabase Review History */}
      <section aria-labelledby="live-reviews-heading" className="space-y-4">
        <div>
          <p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            Review history
          </p>
          <h2 id="live-reviews-heading" className="mt-1 text-xl font-semibold">
            Live Supabase review data
          </h2>
        </div>
        {liveLoading ? (
          <GridSkeleton />
        ) : liveError && !liveEntries.length ? (
          <Empty text={`Live review records unavailable: ${liveError.message}`} />
        ) : liveReviewed.length === 0 ? (
          <Empty text="No reviewed Supabase records returned." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            {liveReviewed.map((entry) => (
              <article key={entry.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">
                      {entry.competitor_name}
                    </p>
                    <h3 className="mt-1 font-medium">{entry.display_feature_name}</h3>
                  </div>
                  <span className="rounded-full bg-secondary px-2 py-1 font-mono text-[10px] uppercase">
                    {entry.approval_status === "pending" ? "Pending · live" : entry.approval_status}
                  </span>
                </div>
                <div className="mt-2">
                  <SourceLink url={entry.source_url} />
                </div>
              </article>
            ))}
          </div>
        )}
        {liveError && liveEntries.length > 0 && (
          <p className="text-xs text-destructive">
            Live refresh failed; showing previously loaded Supabase records: {liveError.message}
          </p>
        )}
      </section>
    </div>
  );
}

function ReviewerAuthPanel({
  isAuthorized,
  isLoading,
  user,
  authError,
  onLogin,
  onLogout,
}: {
  isAuthorized: boolean;
  isLoading: boolean;
  user: ReviewerAccount | null;
  authError: string | null;
  onLogin: (email: string, password: string) => Promise<boolean>;
  onLogout: () => Promise<void>;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    setSubmitting(true);
    setLocalError(null);
    try {
      const ok = await onLogin(email, password);
      if (ok) {
        setPassword("");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayedError = localError || authError;

  if (isLoading) {
    return (
      <aside
        className="flex items-center gap-3 rounded-xl border border-border bg-card/60 px-4 py-3 text-sm text-muted-foreground"
        role="status"
      >
        <Loader2 className="size-4 animate-spin text-primary" />
        <span>Verifying reviewer session…</span>
      </aside>
    );
  }

  if (user && isAuthorized) {
    return (
      <aside
        className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-sm text-foreground"
        role="status"
      >
        <div className="flex items-center gap-2.5">
          <div className="grid size-7 place-items-center rounded-md bg-primary/20 text-primary">
            <ShieldCheck className="size-4" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <strong className="font-semibold text-primary">Authorized reviewer session</strong>
              <span className="rounded bg-primary/20 px-1.5 py-0.5 font-mono text-[10px] text-primary">
                Live Decisions Active
              </span>
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Signed in as{" "}
              <span className="font-mono font-medium text-foreground">{user.email}</span> ·
              Server-verified reviewer pre-approval.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => void onLogout()}
          aria-label="Sign out of reviewer account"
        >
          <LogOut className="mr-1.5 size-3.5" />
          Sign out
        </Button>
      </aside>
    );
  }

  if (user && !isAuthorized) {
    return (
      <aside
        className="space-y-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-foreground"
        role="alert"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-destructive/20 text-destructive">
              <ShieldAlert className="size-4" />
            </div>
            <div>
              <strong className="font-semibold text-destructive">Account not authorized</strong>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Signed in as{" "}
                <span className="font-mono font-medium text-foreground">{user.email}</span>. This
                account is not in the reviewer allowlist.
              </p>
            </div>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void onLogout()}
            aria-label="Sign out of unauthorized account"
          >
            <LogOut className="mr-1.5 size-3.5" />
            Sign out
          </Button>
        </div>
        <p className="text-xs text-destructive">
          Live review actions require a server-verified, pre-approved reviewer identity. Decisions
          cannot be made with this account.
        </p>
      </aside>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-card/60 p-4 shadow-sm sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <KeyRound className="size-4 text-primary" />
          <h3 className="text-sm font-semibold text-foreground">Reviewer Sign-In</h3>
          <span className="rounded-full bg-secondary px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            Supabase Auth
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          Public dashboard & local demo queue work without login
        </span>
      </div>

      <form onSubmit={(e) => void handleSubmit(e)} className="mt-3 flex flex-wrap items-end gap-3">
        <label className="min-w-48 flex-1 text-xs text-muted-foreground">
          Reviewer Email
          <input
            id="reviewer-email-input"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            type="email"
            placeholder="reviewer@example.com"
            autoComplete="username"
            required
            value={email}
            disabled={submitting}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="min-w-48 flex-1 text-xs text-muted-foreground">
          Password
          <input
            id="reviewer-password-input"
            className="mt-1 h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            type="password"
            placeholder="••••••••"
            autoComplete="current-password"
            required
            value={password}
            disabled={submitting}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <Button type="submit" disabled={submitting} className="min-w-28">
          {submitting ? (
            <>
              <Loader2 className="mr-2 size-3.5 animate-spin" />
              Verifying…
            </>
          ) : (
            <>
              <ShieldCheck className="mr-2 size-3.5" />
              Sign in to review
            </>
          )}
        </Button>
      </form>

      {displayedError && (
        <div
          className="mt-3 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
          role="alert"
        >
          {displayedError}
        </div>
      )}
    </div>
  );
}

function LiveReviewActions({
  entry,
  isAuthorized,
  authLoading,
  user,
  onReviewed,
}: {
  entry: Entry;
  isAuthorized: boolean;
  authLoading: boolean;
  user: ReviewerAccount | null;
  onReviewed: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [decisionPending, setDecisionPending] = useState<"approved" | "rejected" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  const handleDecision = async (decision: "approved" | "rejected") => {
    setBusy(true);
    setDecisionPending(decision);
    setMessage(null);
    setIsError(false);

    try {
      const result = await submitLiveDecision(entry.id, decision);
      if (!result.ok) {
        setIsError(true);
        setMessage(result.error);
      } else {
        setIsError(false);
        setMessage(`Update marked as ${decision}.`);
        onReviewed();
      }
    } catch (err) {
      setIsError(true);
      setMessage(err instanceof Error ? err.message : "Failed to record decision.");
    } finally {
      setBusy(false);
      setDecisionPending(null);
    }
  };

  return (
    <div className="mt-4 border-t border-border pt-3">
      {authLoading ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin text-primary" />
          <span>Checking reviewer authorization…</span>
        </div>
      ) : isAuthorized ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="size-1.5 rounded-full bg-success" />
            <span>
              Authorized reviewer: <span className="font-mono text-foreground">{user?.email}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={busy}
              onClick={() => void handleDecision("rejected")}
              aria-label={`Reject live update ${entry.display_feature_name}`}
            >
              {busy && decisionPending === "rejected" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <X className="mr-1.5 size-3.5" />
              )}
              {busy && decisionPending === "rejected" ? "Rejecting…" : "Reject"}
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={busy}
              onClick={() => void handleDecision("approved")}
              aria-label={`Accept live update ${entry.display_feature_name}`}
            >
              {busy && decisionPending === "approved" ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Check className="mr-1.5 size-3.5" />
              )}
              {busy && decisionPending === "approved" ? "Accepting…" : "Accept"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <Lock className="size-3.5 text-muted-foreground" />
            {user ? (
              <span className="text-warning">
                Current account ({user.email}) is not authorized for live review
              </span>
            ) : (
              <span>Live decision gate requires authorized reviewer sign-in</span>
            )}
          </div>
          {!user && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 text-xs text-primary hover:text-primary/80"
              onClick={() => {
                document.getElementById("reviewer-email-input")?.focus();
              }}
            >
              Sign in above
            </Button>
          )}
        </div>
      )}

      {message && (
        <p
          className={cn("mt-2 text-xs font-medium", isError ? "text-destructive" : "text-success")}
          role="status"
        >
          {message}
        </p>
      )}
    </div>
  );
}

function ReviewCard({
  entry,
  isAuthorized,
  authLoading,
  user,
  onReviewed,
}: {
  entry: Entry;
  isAuthorized: boolean;
  authLoading: boolean;
  user: ReviewerAccount | null;
  onReviewed: () => void;
}) {
  const pct = Math.round(entry.confidence * 100);
  const low = pct < 60;
  return (
    <article className={cn("card-glow flex flex-col gap-5 p-5 sm:p-6", low && "card-glow-rose")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">
            {entry.competitor_name}
          </p>
          <h3 className="mt-1 text-lg font-semibold">{entry.display_feature_name}</h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={entry.verify_status} />
          <StatusBadge status={entry.status} />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between text-xs">
            <span className="font-mono uppercase tracking-wider text-muted-foreground">
              Confidence
            </span>
            <span className={cn("font-mono font-semibold", low ? "text-warning" : "text-primary")}>
              {pct}%
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary">
            <div
              className={cn("h-full rounded-full", low ? "bg-warning" : "bg-primary")}
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="mt-4">
            <SourceLink url={entry.source_url} />
          </div>
        </div>
        <div className="terminal">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            <Terminal className="size-3" /> Classification evidence
          </div>
          {reasoningTrace(entry).map((line, i) => (
            <div key={i} className="break-words text-secondary-foreground">
              {line}
            </div>
          ))}
        </div>
      </div>
      <LiveReviewActions
        entry={entry}
        isAuthorized={isAuthorized}
        authLoading={authLoading}
        user={user}
        onReviewed={onReviewed}
      />
    </article>
  );
}

/* --------------------------- Test Compliance --------------------------- */

function TestCompliance({
  data,
  isLoading,
  error,
  isDemo,
}: {
  data: TestResult[] | undefined;
  isLoading: boolean;
  error: Error | null;
  isDemo: boolean;
}) {
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (error && !isDemo && !data)
    return <Empty text={`Live test_results query failed: ${error.message}`} />;
  if (!data?.length && !isDemo) return <Empty text="No test result records are available." />;
  const passed = data?.filter((t) => t.execution_status === "passed").length ?? 0;
  const notRun = data?.filter((t) => t.execution_status === "not_run").length ?? 0;
  const failed = data?.filter((t) => t.execution_status === "failed").length ?? 0;
  return (
    <div className="space-y-3">
      {isDemo && (
        <aside
          className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm"
          role="note"
        >
          <strong>Local demo scenarios · NOT RUN.</strong> These are the existing test case
          descriptions for presentation only, not live database rows or test evidence.{" "}
          {error instanceof Error && <span>Live query error: {error.message}</span>}
        </aside>
      )}
      {error && !isDemo && (
        <p className="text-xs text-destructive">
          Showing last available live results; refresh failed: {error.message}
        </p>
      )}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="text-sm font-medium">Official test cases</span>
          <span className="font-mono text-xs text-muted-foreground">
            {passed} passed · {notRun} not run · {failed} failed
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-2 font-normal">id</th>
                <th className="px-4 py-2 font-normal">scenario</th>
                <th className="px-4 py-2 font-normal">expected_result</th>
                <th className="px-4 py-2 text-center font-normal">execution</th>
              </tr>
            </thead>
            <tbody>
              {data?.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                  <td className="px-4 py-2 font-mono text-xs text-primary">{t.id}</td>
                  <td className="px-4 py-2">{t.scenario}</td>
                  <td className="px-4 py-2 text-muted-foreground">{t.expected_result}</td>
                  <td className="px-4 py-2 text-center">
                    <span
                      className={cn(
                        "font-mono text-xs uppercase",
                        t.execution_status === "passed"
                          ? "text-success"
                          : t.execution_status === "failed"
                            ? "text-destructive"
                            : "text-muted-foreground",
                      )}
                    >
                      {t.execution_status === "passed" ? (
                        <>
                          <Check className="inline size-4" /> Passed
                        </>
                      ) : t.execution_status === "failed" ? (
                        "Failed"
                      ) : (
                        <>
                          <Minus className="inline size-4" /> Not run
                        </>
                      )}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
