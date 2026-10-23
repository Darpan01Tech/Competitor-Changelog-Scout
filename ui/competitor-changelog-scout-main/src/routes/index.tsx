import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Check, ExternalLink, Radar, ShieldCheck, FlaskConical, X, Minus, Sparkles,
  Clock, Globe, Activity, Hourglass, ArrowRight, Terminal,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { AskInsights } from "@/components/AskInsights";
import { Input } from "@/components/ui/input";
import { isPending, reviewUpdate, verificationStatus, type ReviewDecision } from "@/lib/review";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Competitor Changelog Scout — Dashboard" },
      { name: "description", content: "Radar digest, human approval gate, and test compliance for the competitor changelog agent." },
      { property: "og:title", content: "Competitor Changelog Scout" },
      { property: "og:description", content: "Radar digest, human approval gate, and test compliance for the competitor changelog agent." },
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
  approved: boolean;
  approval_status: string;
  approved_by: string | null;
  approved_at: string | null;
  verify_status: string | null;
};

async function fetchEntries(): Promise<Entry[]> {
  const { data, error } = await supabase
    .from("vw_weekly_digest")
    .select("id, competitor_name, display_feature_name, raw_feature_name, status, confidence, reason, source_url, retrieved_at, approved, approval_status, approved_by, approved_at, verify_status");
  if (error) throw error;
  return (data ?? []) as Entry[];
}

async function decideEntries(ids: string[], decision: ReviewDecision, reviewer: string) {
  const update = reviewUpdate(decision, reviewer);
  const { data, error } = await supabase.from("entries").update(update).in("id", ids).eq("approval_status", "pending").select("id");
  if (error) throw error;
  if ((data?.length ?? 0) !== ids.length) throw new Error("Some entries were already reviewed. Refresh the queue.");
  return update;
}

function useEntries() {
  const query = useQuery({ queryKey: ["entries"], queryFn: fetchEntries, refetchInterval: 15000 });
  const [entries, setEntries] = useState<Entry[]>([]);
  useEffect(() => {
    if (query.data) setEntries(query.data);
  }, [query.data]);
  return { entries, setEntries, isLoading: query.isLoading, error: query.error };
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
  const { entries, setEntries, isLoading, error } = useEntries();
  const [tab, setTab] = useState("radar");
  const approved = useMemo(() => entries.filter((e) => e.approved), [entries]);
  const pending = useMemo(() => entries.filter(isPending), [entries]);

  const kpis = useMemo(() => {
    const latest = entries.map((e) => e.retrieved_at).sort().at(-1);
    return {
      lastScan: timeAgo(latest),
      sources: new Set(entries.map((e) => e.competitor_name)).size,
      detected: entries.length,
      pending: pending.length,
    };
  }, [entries, pending.length]);

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
            <span className="pulse-dot size-2 rounded-full bg-success" />
            <span className="font-mono text-xs text-secondary-foreground">Agent Pulse · live</span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <KpiBar kpis={kpis} loading={isLoading} />

        <Tabs value={tab} onValueChange={setTab} className="mt-8">
          <TabsList className="h-auto flex-wrap bg-secondary">
            <TabsTrigger value="radar" className="gap-1.5"><Radar className="size-3.5" />Radar Digest</TabsTrigger>
            <TabsTrigger value="gate" className="gap-1.5">
              <ShieldCheck className="size-3.5" />Decision Gate
              {pending.length > 0 && (
                <span className="ml-1 rounded-full bg-destructive px-1.5 font-mono text-[10px] text-destructive-foreground">{pending.length}</span>
              )}
            </TabsTrigger>
            <TabsTrigger value="ask" className="gap-1.5"><Sparkles className="size-3.5" />Ask Insights</TabsTrigger>
            <TabsTrigger value="tests" className="gap-1.5"><FlaskConical className="size-3.5" />Test Compliance</TabsTrigger>
          </TabsList>
          <TabsContent value="radar" className="mt-6">
            <RadarDigest entries={approved} loading={isLoading} error={error} />
          </TabsContent>
          <TabsContent value="gate" className="mt-6">
            <DecisionGate entries={pending} setEntries={setEntries} loading={isLoading} error={error} active={tab === "gate"} />
          </TabsContent>
          <TabsContent value="ask" className="mt-6"><AskInsights /></TabsContent>
          <TabsContent value="tests" className="mt-6"><TestCompliance /></TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

function KpiBar({ kpis, loading }: { kpis: { lastScan: string; sources: number; detected: number; pending: number }; loading: boolean }) {
  const items = [
    { label: "Last Scan", value: kpis.lastScan, icon: Clock },
    { label: "Sources Monitored", value: kpis.sources, icon: Globe },
    { label: "Updates Detected", value: kpis.detected, icon: Activity },
    { label: "Pending Human Review", value: kpis.pending, icon: Hourglass, alert: kpis.pending > 0 },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {items.map(({ label, value, icon: Icon, alert }) => (
        <div key={label} className={cn("rounded-xl bg-card p-4", alert && "kpi-alert")}>
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

function RadarDigest({ entries, loading, error }: { entries: Entry[]; loading: boolean; error: Error | null }) {
  if (loading) return <GridSkeleton />;
  if (error) return <Empty text={`Couldn't load digest: ${error.message}`} />;
  if (!entries.length) return <Empty text="No approved updates yet." />;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {entries.map((r) => (
        <article key={r.id} className="card-glow animate-in fade-in slide-in-from-bottom-2 flex flex-col gap-3 p-5 duration-300 hover:border-primary/30">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{r.competitor_name}</span>
            <StatusBadge status={r.status} />
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
  entries, setEntries, loading, error, active,
}: {
  entries: Entry[];
  setEntries: React.Dispatch<React.SetStateAction<Entry[]>>;
  loading: boolean;
  error: Error | null;
  active: boolean;
}) {
  const [leaving, setLeaving] = useState<Record<string, "approve" | "reject">>({});
  const [busy, setBusy] = useState(false);
  const [reviewer, setReviewer] = useState("");

  // Animate out, then apply the state change.
  const animateOut = useCallback((ids: string[], kind: "approve" | "reject", apply: () => void) => {
    setLeaving((l) => ({ ...l, ...Object.fromEntries(ids.map((id) => [id, kind])) }));
    setTimeout(() => {
      apply();
      setLeaving((l) => {
        const n = { ...l };
        ids.forEach((id) => delete n[id]);
        return n;
      });
    }, 320);
  }, []);

  const decide = useCallback(async (ids: string[], decision: ReviewDecision) => {
    if (!ids.length || busy) return;
    setBusy(true);
    try {
      const update = await decideEntries(ids, decision, reviewer);
      animateOut(ids, decision === "approved" ? "approve" : "reject", () =>
        setEntries((all) => all.map((e) => (ids.includes(e.id) ? { ...e, ...update } : e))),
      );
      toast.success(`${ids.length} ${ids.length === 1 ? "entry" : "entries"} ${decision} & saved`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }, [busy, animateOut, setEntries, reviewer]);

  const approve = useCallback((ids: string[]) => decide(ids, "approved"), [decide]);
  const reject = useCallback((ids: string[]) => decide(ids, "rejected"), [decide]);

  // Keyboard shortcuts act on the first pending item.
  useEffect(() => {
    if (!active) return;
    const onKey = (ev: KeyboardEvent) => {
      const t = ev.target as HTMLElement;
      if (ev.metaKey || ev.ctrlKey || ev.altKey || t.closest("input, textarea, [contenteditable]")) return;
      const first = entries.find((e) => !leaving[e.id]);
      if (!first) return;
      const k = ev.key.toLowerCase();
      if (k === "a") void approve([first.id]);
      if (k === "r") void reject([first.id]);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [active, entries, leaving, approve, reject]);

  if (loading) return <GridSkeleton />;
  if (error) return <Empty text={`Couldn't load queue: ${error.message}`} />;
  if (!entries.length) return <Empty text="Queue clear. Nothing awaiting approval." />;

  const ids = entries.map((e) => e.id);

  return (
    <>
      <div className="mb-5 flex flex-col gap-2 sm:max-w-sm">
        <label htmlFor="reviewer-name" className="text-sm font-medium">Reviewer name</label>
        <Input id="reviewer-name" value={reviewer} onChange={(event) => setReviewer(event.target.value)} placeholder="Your name" autoComplete="name" disabled={busy} />
      </div>
      <div className="flex flex-col gap-5">
        {entries.map((r, idx) => {
          const pct = Math.round(r.confidence * 100);
          const low = pct < 60;
          const out = leaving[r.id];
          return (
            <article
              key={r.id}
              className={cn(
                "card-glow flex flex-col gap-5 p-6 transition-all duration-300",
                low && "card-glow-rose",
                out === "approve" && "pointer-events-none translate-x-12 opacity-0",
                out === "reject" && "pointer-events-none -translate-x-12 opacity-0",
              )}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold">{r.competitor_name}</h3>
                  {idx === 0 && <span className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">NEXT</span>}
                </div>
                <div className="flex flex-wrap items-center gap-2"><VerificationBadge status={r.verify_status} /><StatusBadge status={r.status} /></div>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <div>
                  <div className="mb-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">Diff</div>
                  <div className="grid grid-cols-[1fr_auto_1fr] items-stretch gap-2 font-mono text-sm">
                    <div className="rounded-md bg-destructive/10 px-3 py-2 text-destructive">
                      <div className="text-[10px] uppercase opacity-70">− Old</div>
                      <span className={cn(r.raw_feature_name !== r.display_feature_name && "line-through")}>{r.raw_feature_name}</span>
                    </div>
                    <ArrowRight className="size-4 self-center text-muted-foreground" />
                    <div className="rounded-md bg-primary/10 px-3 py-2 text-primary">
                      <div className="text-[10px] uppercase opacity-70">+ New</div>
                      {r.display_feature_name}
                    </div>
                  </div>
                  <div className="mt-4">
                    <div className="mb-1.5 flex justify-between font-mono text-xs">
                      <span className="text-muted-foreground">confidence</span>
                      <span className={low ? "text-destructive" : "text-primary"}>{pct}%</span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className={cn("h-full rounded-full", low ? "bg-destructive" : "bg-primary")} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                  <div className="mt-3"><SourceLink url={r.source_url} /></div>
                </div>

                <div className="terminal">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Terminal className="size-3" /> Agent Reasoning
                  </div>
                  {reasoningTrace(r).map((line, i, arr) => (
                    <div key={i} className={cn("break-words", i === arr.length - 1 ? "text-primary" : "text-secondary-foreground")}>{line}</div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Button size="lg" disabled={busy || !reviewer.trim()} onClick={() => void approve([r.id])}>
                  <Check />Approve &amp; Commit {idx === 0 && <kbd className="kbd">A</kbd>}
                </Button>
                <Button size="lg" variant="destructive" disabled={busy || !reviewer.trim()} onClick={() => void reject([r.id])}>
                  <X />Reject {idx === 0 && <kbd className="kbd">R</kbd>}
                </Button>
              </div>
            </article>
          );
        })}
      </div>

      {active && (
        <div className="fixed inset-x-0 bottom-6 z-30 flex justify-center px-4">
          <div className="bulk-bar animate-in fade-in slide-in-from-bottom-4 flex items-center gap-3 rounded-full py-2 pl-5 pr-2">
            <span className="font-mono text-xs text-muted-foreground">{entries.length} pending</span>
            <Button size="sm" className="rounded-full" disabled={busy || !reviewer.trim()} onClick={() => void approve(ids)}>
              <Check />Approve All
            </Button>
            <Button size="sm" variant="destructive" className="rounded-full" disabled={busy || !reviewer.trim()} onClick={() => void reject(ids)}>
              <X />Reject All
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

/* --------------------------- Test Compliance --------------------------- */

function TestCompliance() {
  const { data, isLoading, error } = useQuery({
    queryKey: ["test_results"],
    queryFn: async () => {
      const { data, error } = await supabase.from("test_results").select("id, scenario, expected_result, passed").order("id");
      if (error) throw error;
      return data ?? [];
    },
  });
  if (isLoading) return <Skeleton className="h-48 rounded-xl" />;
  if (error) return <Empty text={`Couldn't load tests: ${error.message}`} />;
  const passed = data?.filter((t) => t.passed).length ?? 0;
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <span className="text-sm font-medium">Official test cases</span>
        <span className="font-mono text-xs text-muted-foreground">{passed}/{data?.length ?? 0} passing</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
              <th className="px-4 py-2 font-normal">id</th>
              <th className="px-4 py-2 font-normal">scenario</th>
              <th className="px-4 py-2 font-normal">expected_result</th>
              <th className="px-4 py-2 text-center font-normal">passed</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0 hover:bg-accent/50">
                <td className="px-4 py-2 font-mono text-xs text-primary">{t.id}</td>
                <td className="px-4 py-2">{t.scenario}</td>
                <td className="px-4 py-2 text-muted-foreground">{t.expected_result}</td>
                <td className="px-4 py-2 text-center">
                  {t.passed ? <Check className="mx-auto size-4 text-success" /> : <Minus className="mx-auto size-4 text-muted-foreground" />}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
