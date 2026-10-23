import { useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Sparkles, Square, ArrowUp } from "lucide-react";
import { Button } from "@/components/ui/button";

const SUGGESTIONS = [
  "Which competitors are investing in AI features?",
  "What has shipped vs. only been announced?",
  "Summarize the main product themes this week.",
];

export function AskInsights() {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  async function ask(q: string) {
    const text = q.trim();
    if (!text || loading) return;
    setQuestion(text);
    setAnswer("");
    setError(null);
    setLoading(true);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const res = await fetch("/api/insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const j = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(j.error ?? "Request failed.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let acc = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        acc += dec.decode(value, { stream: true });
        const idx = acc.indexOf("[[ERROR]]");
        if (idx >= 0) {
          setAnswer(acc.slice(0, idx).trim());
          setError(acc.slice(idx + 9));
        } else setAnswer(acc);
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      setLoading(false);
      abortRef.current = null;
    }
  }

  return (
    <div className="space-y-5">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void ask(question);
        }}
        className="card-glow flex items-end gap-3 p-3"
      >
        <Sparkles className="mb-2.5 ml-1 size-4 shrink-0 text-primary" />
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void ask(question);
            }
          }}
          rows={2}
          placeholder="Ask about approved competitor updates…"
          className="flex-1 resize-none bg-transparent py-1.5 text-sm outline-none placeholder:text-muted-foreground"
        />
        {loading ? (
          <Button type="button" size="icon" variant="secondary" onClick={() => abortRef.current?.abort()} aria-label="Stop">
            <Square />
          </Button>
        ) : (
          <Button type="submit" size="icon" disabled={!question.trim()} aria-label="Ask">
            <ArrowUp />
          </Button>
        )}
      </form>

      {!answer && !loading && !error && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => void ask(s)}
              className="rounded-full bg-secondary px-3 py-1.5 text-xs text-secondary-foreground transition-colors hover:bg-accent hover:text-primary"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {(answer || loading) && (
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="mb-3 flex items-center gap-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">
            <Sparkles className="size-3 text-primary" />
            AI analysis {loading && <span className="pulse-dot size-1.5 rounded-full bg-primary" />}
          </div>
          {answer ? (
            <div className="prose-insights text-sm leading-relaxed">
              <ReactMarkdown>{answer}</ReactMarkdown>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Analyzing approved updates…</p>
          )}
        </div>
      )}

      {error && <div className="rounded-lg bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</div>}
    </div>
  );
}
