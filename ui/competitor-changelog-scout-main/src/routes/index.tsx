import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Check, ExternalLink, Radar, ShieldCheck, FlaskConical, Minus, Sparkles, X,
  Clock, Globe, Activity, Hourglass, Terminal, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AskInsights } from "@/components/AskInsights";
import { isPending, verificationStatus } from "@/lib/review";
import { applyDemoDecision, isDemoPending, type DemoDecision, type SessionDemoDecisions } from "@/lib/demo-review";
import { DEMO_ENTRIES, DEMO_TEST_RESULTS } from "@/lib/demo-data";
import { Button } from "@/components/ui/button";

const DEFAULT_REFRESH_INTERVAL_MS = 15_000;
const configuredRefreshInterval = Number(import.meta.env["VITE_DASHBOARD_REFRESH_INTERVAL_MS"]);
const DASHBOARD_REFRESH_INTERVAL_MS = Number.isInteger(configuredRefreshInterval)
  && configuredRefreshInterval >= 5_000
  && configuredRefreshInterval <= 300_000
  ? configuredRefreshInterval
  : DEFAULT_REFRESH_INTERVAL_MS;

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Competitor Changelog Scout — Dashboard" },
      { name: "description", content: "Source-backed competitor updates, session-only demo review, and test execution status." },
      { property: "og:title", content: "Competitor Changelog Scout" },
      { property: "og:description", content: "Source-backed competitor updates, session-only demo review, and test execution status." },
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
    <span className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-mono text-[11px] uppercase tracking-wider ring-1", styles[status] ?? styles["uncertain"])}>
      <span className="size-1.5 rounded-full bg-current" />
      {status}
    </span>
  );
}

function SourceLink({ url }: { url: string }) {
  let host = url;
  try { host = new URL(url).hostname; } catch { /* keep raw */ }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-mono text-xs text-muted-foreground transition-colors hover:text-primary">
      <ExternalLink className="size-3" />
      {host}
    </a>
  );
}

function Dashboard() {
  const entriesQuery = useEntries();
  const testsQuery = useTestResults();
  const scanQuery = useLastScan();
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
  const [demoDecisions, setDemoDecisions] = useState<SessionDemoDecisions>({});
  const decidedIds = useRef(new Set<string>());
  const refreshFailed = entriesQuery.isError || testsQuery.isError || scanQuery.isError;

  useEffect(() => {
    if (!refreshFailed && entriesQuery.dataUpdatedAt && testsQuery.dataUpdatedAt && scanQuery.dataUpdatedAt) {
      setLastSuccessfulRefresh(new Date(Math.max(entriesQuery.dataUpdatedAt, testsQuery.dataUpdatedAt, scanQuery.dataUpdatedAt)));
    }
  }, [entriesQuery.dataUpdatedAt, testsQuery.dataUpdatedAt, scanQuery.dataUpdatedAt, refreshFailed]);

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
    const failed = results.flatMap((result, index) => result.status === "rejected" || result.value?.isError ? [labels[index]] : []);
    if (failed.length) {
      setRefreshMessage(`Refresh incomplete for ${failed.join(", ")}. Last successful refresh time was not changed.`);
    } else {
      const refreshedAt = new Date();
      setLastSuccessfulRefresh(refreshedAt);
      setRefreshMessage("Dashboard data refreshed.");
    }
    refreshingRef.current = false;
    setRefreshing(false);
  }
  const approved = useMemo(() => entries.filter((e) => e.approval_status === "approved"), [entries]);
  const demoPending = useMemo(() => DEMO_ENTRIES.filter((entry) => isDemoPending(entry, demoDecisions)), [demoDecisions]);
  const livePending = useMemo(() => liveEntries.filter(isPending), [liveEntries]);

  function decideForDemo(entry: Entry, decision: DemoDecision) {
    if (!DEMO_ENTRIES.some((demoEntry) => demoEntry.id === entry.id) || decidedIds.current.has(entry.id) || !isPending(entry)) return;
    decidedIds.current.add(entry.id);
    setDemoDecisions((current) => applyDemoDecision(current, entry.id, decision));
    toast.success(`${entry.display_feature_name}: ${decision.toUpperCase()} for this session only. No database change was made.`);
  }

  function resetDemoQueue() {
    decidedIds.current.clear();
    setDemoDecisions({});
    toast.success("Demo queue reset. All sample entries are pending again.");
  }

  const kpis = useMemo(() => {
    const latest = entries.map((e) => e.retrieved_at).sort().at(-1);
    return {
      lastEntry: timeAgo(latest),
      sources: new Set(entries.map((e) => e.competitor_name)).size,
      detected: entries.length,
      pending: livePending.length + demoPending.length,
    };
  }, [entries, livePending.length, demoPending.length]);

  return (
    <div className="min-h-screen pb-28">
      <header className="sticky top-0 z-20 border-b border-border bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-6">
          <div className="flex items-center gap-2.5">
            <div className="grid size-7 place-items-center rounded-md bg-primary/15 text-primary">
              <Radar className="size-4" />
            </div>
            <span className="font-semibold tracking-tight">Changelog Scout</span>
            <span className="hidden font-mono text-xs text-muted-foreground sm:inline">/ competitor intel</span>
          </div>
        <div className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
            <span className="size-2 rounded-full bg-muted-foreground" />
            <span className="font-mono text-xs text-secondary-foreground">Workflow status unverified</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        {(usingDemoEntries || usingDemoTests) && <aside className="mb-5 rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm" role="status">
          <strong>Local demo data is being shown for {[
            ...(usingDemoEntries ? ["dashboard entries"] : []),
            ...(usingDemoTests ? ["test scenarios"] : []),
          ].join(" and ")}.</strong>{" "}
          These samples are not live Supabase records or executed test results. Live data remains separate and will be shown when its request succeeds.
          <details className="mt-2 text-xs"><summary className="cursor-pointer">Why is live data unavailable?</summary>
            <ul className="mt-1 list-inside list-disc">
              {usingDemoEntries && <li>Entries: {entriesQuery.error instanceof Error ? entriesQuery.error.message : "Supabase request failed."}</li>}
              {usingDemoTests && <li>Test results: {testsQuery.error instanceof Error ? testsQuery.error.message : "Supabase request failed."}</li>}
            </ul>
          </details>
        </aside>}
        <section className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/90 px-4 py-3 shadow-sm sm:px-5" aria-live="polite">
          <div className="space-y-1 text-sm">
            <div className="text-foreground">
              Last dashboard refresh: {lastSuccessfulRefresh ? lastSuccessfulRefresh.toLocaleTimeString() : "not yet confirmed"}
            </div>
            <div className="text-xs text-muted-foreground">
              Last saved scan digest: {scanQuery.data?.run_date ? new Date(scanQuery.data.run_date).toLocaleString() : "no verified scan record"}
              {scanQuery.isError && " · scan history unavailable"}
            </div>
            {refreshFailed && <div className="text-xs text-destructive">Some live data is unavailable or stale; successful prior results are retained.</div>}
            {refreshMessage && <div className={cn("text-xs", refreshMessage.startsWith("Refresh failed") ? "text-destructive" : "text-success")}>{refreshMessage}</div>}
          </div>
          <Button type="button" variant="outline" onClick={refreshDashboard} disabled={refreshing}>
            <RefreshCw className={cn("mr-2 size-4", refreshing && "animate-spin")} />
            {refreshing ? "Refreshing…" : "Refresh dashboard"}
          </Button>
        </section>
        <KpiBar kpis={kpis} loading={isLoading} />

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList className="h-auto flex-wrap gap-1 rounded-xl border border-border bg-card/80 p-1">
            <TabsTrigger value="radar" className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><Radar className="size-3.5" />Radar Digest</TabsTrigger>
            <TabsTrigger value="gate" className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm">
              <ShieldCheck className="size-3.5" />Decision Gate
              {livePending.length + demoPending.length > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 font-mono text-[10px] text-destructive-foreground">{livePending.length + demoPending.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ask" className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><Sparkles className="size-3.5" />Ask Insights</TabsTrigger>
            <TabsTrigger value="tests" className="gap-1.5 rounded-lg px-3 py-2 data-[state=active]:bg-primary data-[state=active]:text-primary-foreground data-[state=active]:shadow-sm"><FlaskConical className="size-3.5" />Test Compliance</TabsTrigger>
          </TabsList>
          <TabsContent value="radar" className="mt-6">
            <RadarDigest entries={approved} loading={isLoading} error={error} isDemo={usingDemoEntries} />
          </TabsContent>
          <TabsContent value="gate" className="mt-6">
            <DecisionGate liveEntries={liveEntries} liveError={entriesQuery.error} liveLoading={entriesQuery.isLoading} demoDecisions={demoDecisions} onDemoDecision={decideForDemo} onResetDemo={resetDemoQueue} />
          </TabsContent>
          <TabsContent value="ask" className="mt-6"><AskInsights /></TabsContent>
          <TabsContent value="tests" className="mt-6"><TestCompliance data={testResults} isLoading={testsQuery.isLoading} error={testsQuery.error} isDemo={usingDemoTests} /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function KpiBar({ kpis, loading }: { kpis: { lastEntry: string; sources: number; detected: number; pending: number }; loading: boolean }) {
  const items = [
    { label: "Last Entry Detected", value: kpis.lastEntry, icon: Clock },
    { label: "Sources With Entries", value: kpis.sources, icon: Globe },
    { label: "Updates Detected", value: kpis.detected, icon: Activity },
    { label: "Pending Human Review", value: kpis.pending, icon: Hourglass, alert: kpis.pending > 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon, alert }) => (
        <div key={label} className={cn("rounded-xl border border-border bg-card/90 p-4 shadow-sm sm:p-5", alert && "kpi-alert")}>
          <div className="flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <Icon className={cn("size-3.5", alert && "text-destructive")} />
            {label}
          </div>
          <div className={cn("mt-2 text-2xl font-semibold tracking-tight", alert && "text-destructive")}>
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
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-36 rounded-xl" />)}
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <div className="rounded-xl border border-dashed border-border py-16 text-center text-sm text-muted-foreground">{text}</div>;
}

function RadarDigest({ entries, loading, error, isDemo }: { entries: Entry[]; loading: boolean; error: Error | null; isDemo: boolean }) {
  if (loading) return <GridSkeleton />;
  if (error && !entries.length) return <Empty text="Couldn't load digest. Please retry when the connection is available." />;
  if (!entries.length) return <Empty text="No approved updates yet." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((r) => (
        <article key={r.id} className="card-glow animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-3 p-5 duration-300 hover:border-primary/30">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{r.competitor_name}</span>
            <div className="flex items-center gap-2">{isDemo && <span className="rounded-full bg-warning/15 px-2 py-0.5 font-mono text-[10px] uppercase text-warning">Demo</span>}<StatusBadge status={r.status} /></div>
          </div>
          <h3 className="text-lg font-medium leading-snug">{r.display_feature_name}</h3>
          <VerificationBadge status={r.verify_status} />
          <div className="mt-auto pt-2"><SourceLink url={r.source_url} /></div>
        </article>
      ))}
    </div>
  );
}

/* ---------------------------- Decision Gate ---------------------------- */

function VerificationBadge({ status }: { status: string | null }) {
  const value = verificationStatus(status);
  return <span className={cn("inline-flex items-center gap-1.5 self-start rounded-md px-2 py-1 font-mono text-xs", value === "match" ? "bg-success/15 text-success" : value === "mismatch" ? "bg-destructive/15 text-destructive" : "bg-secondary text-muted-foreground")}><ShieldCheck className="size-3.5" />Verified: {value}</span>;
}

function reasoningTrace(e: Entry): string[] {
  const keyword: Record<string, string> = { shipped: "live / generally available", announced: "coming soon / waitlist", uncertain: "no reliable signal" };
  const lines = [
    `> Source: ${e.source_url}`,
    `> Extracted text: "${e.reason}"`,
  ];
  if (e.raw_feature_name !== e.display_feature_name) {
    lines.push(`> Alias lookup: "${e.raw_feature_name}" -> canonical "${e.display_feature_name}"`);
  }
  lines.push(
    `> Rule matched: ${keyword[e.status] ?? "unknown"}`,
    `> Classification: ${e.status.toUpperCase()}. Confidence: ${Math.round(e.confidence * 100)}%`,
  );
  return lines;
}

function DecisionGate({
  liveEntries,
  liveError,
  liveLoading,
  demoDecisions,
  onDemoDecision,
  onResetDemo,
}: {
  liveEntries: Entry[];
  liveError: Error | null;
  liveLoading: boolean;
  demoDecisions: SessionDemoDecisions;
  onDemoDecision: (entry: Entry, decision: DemoDecision) => void;
  onResetDemo: () => void;
}) {
  const pending = DEMO_ENTRIES.filter((entry) => isDemoPending(entry, demoDecisions));
  const reviewed = DEMO_ENTRIES.filter((entry) => demoDecisions[entry.id]);
  const liveReviewed = liveEntries.filter((entry) => entry.approval_status === "approved" || entry.approval_status === "rejected");
  const livePending = liveEntries.filter(isPending);

  return (
    <div className="space-y-5">
      <aside className="rounded-xl border border-warning/30 bg-warning/10 px-4 py-3 text-sm text-foreground" role="note">
        <strong className="font-semibold">Interactive local demo queue · session-only decisions.</strong>{" "}
        These seeded sample entries are separate from Supabase. Accept and Reject only update this page's local state, do not write to Supabase, and reset when the page is refreshed.
      </aside>

      <section aria-labelledby="pending-heading" className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <div><p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Local demo queue</p><h2 id="pending-heading" className="mt-1 text-xl font-semibold">Pending demo updates <span className="font-mono text-sm text-muted-foreground">{pending.length}</span></h2></div>
          <Button type="button" variant="outline" onClick={onResetDemo}><RefreshCw className="mr-2 size-4" />Reset demo</Button>
        </div>
        {!pending.length ? <Empty text="All demo entries have a decision. Reset demo to replay the queue." /> : pending.map((entry) => (
          <ReviewCard key={entry.id} entry={entry} onDecision={onDemoDecision} />
        ))}
      </section>

      {reviewed.length > 0 && <section aria-labelledby="reviewed-heading" className="space-y-4">
        <div><p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Session-only demo history</p><h2 id="reviewed-heading" className="mt-1 text-xl font-semibold">Demo decisions <span className="font-mono text-sm text-muted-foreground">{reviewed.length}</span></h2></div>
        <div className="grid gap-3 sm:grid-cols-2">{reviewed.map((entry) => {
          const demoDecision = demoDecisions[entry.id];
          const status = demoDecision;
          return <article key={entry.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{entry.competitor_name}</p><h3 className="mt-1 font-medium">{entry.display_feature_name}</h3></div><span className={cn("rounded-full px-2 py-1 font-mono text-[10px] uppercase", status === "accepted" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive")}>{status}</span></div>
          <p className="mt-2 text-xs text-muted-foreground">Session-only demo decision · not saved</p>
        </article>;
        })}</div>
      </section>}

      <section aria-labelledby="live-reviews-heading" className="space-y-4">
        <div><p className="font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Read-only backend records</p><h2 id="live-reviews-heading" className="mt-1 text-xl font-semibold">Live Supabase review data</h2></div>
        {liveLoading ? <GridSkeleton /> : liveError && !liveEntries.length ? <Empty text={`Live review records unavailable: ${liveError.message}`} /> : livePending.length + liveReviewed.length === 0 ? <Empty text="No live pending or reviewed records returned by Supabase." /> : <div className="grid gap-3 sm:grid-cols-2">{[...livePending, ...liveReviewed].map((entry) => <article key={entry.id} className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-start justify-between gap-3"><div><p className="font-mono text-xs uppercase tracking-wide text-muted-foreground">{entry.competitor_name}</p><h3 className="mt-1 font-medium">{entry.display_feature_name}</h3></div><span className="rounded-full bg-secondary px-2 py-1 font-mono text-[10px] uppercase">{entry.approval_status === "pending" ? "Pending · live" : entry.approval_status}</span></div>
          <div className="mt-2"><SourceLink url={entry.source_url} /></div>
        </article>)}</div>}
        {liveError && liveEntries.length > 0 && <p className="text-xs text-destructive">Live refresh failed; showing previously loaded Supabase records: {liveError.message}</p>}
      </section>
    </div>
  );
}

function ReviewCard({ entry, onDecision }: { entry: Entry; onDecision: (entry: Entry, decision: DemoDecision) => void }) {
  const pct = Math.round(entry.confidence * 100);
  const low = pct < 60;
  return (
    <article className={cn("card-glow flex flex-col gap-5 p-5 sm:p-6", low && "card-glow-rose")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><p className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{entry.competitor_name}</p><h3 className="mt-1 text-lg font-semibold">{entry.display_feature_name}</h3></div>
        <div className="flex flex-wrap items-center gap-2"><VerificationBadge status={entry.verify_status} /><StatusBadge status={entry.status} /></div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[.85fr_1.15fr]">
        <div className="rounded-lg border border-border bg-background/50 p-4">
          <div className="flex items-center justify-between text-xs"><span className="font-mono uppercase tracking-wider text-muted-foreground">Confidence</span><span className={cn("font-mono font-semibold", low ? "text-warning" : "text-primary")}>{pct}%</span></div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-secondary"><div className={cn("h-full rounded-full", low ? "bg-warning" : "bg-primary")} style={{ width: `${pct}%` }} /></div>
          <div className="mt-4"><SourceLink url={entry.source_url} /></div>
        </div>
        <div className="terminal">
          <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground"><Terminal className="size-3" /> Classification evidence</div>
          {reasoningTrace(entry).map((line, i) => <div key={i} className="break-words text-secondary-foreground">{line}</div>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        <span className="text-xs text-muted-foreground">Demo decision · only visible during this page session</span>
        <div className="flex gap-2">
          <Button type="button" variant="destructive" aria-label={`Reject ${entry.display_feature_name} from ${entry.competitor_name}`} onClick={() => onDecision(entry, "rejected")}><X />Reject</Button>
          <Button type="button" aria-label={`Accept ${entry.display_feature_name} from ${entry.competitor_name}`} onClick={() => onDecision(entry, "accepted")}><Check />Accept</Button>
        </div>
      </div>
    </article>
  );
}

/* --------------------------- Test Compliance --------------------------- */

function TestCompliance({ data, isLoading, error, isDemo }: { data: TestResult[] | undefined; isLoading: boolean; error: Error | null; isDemo: boolean }) {
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (error && !isDemo && !data) return <Empty text={`Live test_results query failed: ${error.message}`} />;
  if (!data?.length && !isDemo) return <Empty text="No test result records are available." />;
  const passed = data?.filter((t) => t.execution_status === "passed").length ?? 0;
  const notRun = data?.filter((t) => t.execution_status === "not_run").length ?? 0;
  const failed = data?.filter((t) => t.execution_status === "failed").length ?? 0;
  return (
    <div className="space-y-3">
      {isDemo && <aside className="rounded-lg border border-warning/30 bg-warning/10 px-4 py-3 text-sm" role="note"><strong>Local demo scenarios · NOT RUN.</strong> These are the existing test case descriptions for presentation only, not live database rows or test evidence. {error instanceof Error && <span>Live query error: {error.message}</span>}</aside>}
      {error && !isDemo && <p className="text-xs text-destructive">Showing last available live results; refresh failed: {error.message}</p>}
      <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">Official test cases</span>
        <span className="font-mono text-xs text-muted-foreground">{passed} passed · {notRun} not run · {failed} failed</span>
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
                  <span className={cn("font-mono text-xs uppercase", t.execution_status === "passed" ? "text-success" : t.execution_status === "failed" ? "text-destructive" : "text-muted-foreground")}>
                    {t.execution_status === "passed" ? <><Check className="inline size-4" /> Passed</> : t.execution_status === "failed" ? "Failed" : <><Minus className="inline size-4" /> Not run</>}
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
