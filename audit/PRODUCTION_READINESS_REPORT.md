# Production Readiness Report

Audit date: 2026-10-23. Scope: repository evidence and static inspection; no application code, dependencies, schema, deployment, or infrastructure were changed. The only new files are the six audit deliverables in `audit/`.

This is the pre-fix audit baseline. For current code changes and post-fix verification, see [FINAL_FIX_REPORT.md](FINAL_FIX_REPORT.md).

## Executive summary

**Verdict: not ready for a reliable, publicly accessible production deployment.** This repository contains a plausible single-operator demo: an n8n workflow collects configured pages, classifies entries with an LLM and rule checks, writes to Supabase, and a TanStack Start dashboard displays entries for review. The central workflow has not been executed in this audit because there are no installed UI dependencies, Bun is unavailable, no n8n instance or provider credentials were supplied, and no database was accessible.

The most serious confirmed defect is in the documented fresh-install path: `schema.sql` removes `entries.approved`, then references it in the weekly view (and the trigger), which is incompatible with the new `approval_status` schema. The schema also seeds all four test cases as failing. The dashboard allows anonymous visitors to read all monitored records and approve or reject pending entries. The AI endpoint has no visible authentication or rate limit and calls a metered external provider. The n8n workflow fetches database-configured URLs without destination or redirect validation, and its exported activation flag is false.

The README's live Lovable link could not be reached through the available page inspection, so live availability, deployed version, public access, and runtime behavior are **not verified**. A configured address is not deployment evidence.

## Verified stack and application flow

- **Workflow:** n8n export, `n8n/competitor-changelog-scout.json`. Manual and 12-hour schedule triggers lead to feature/competitor reads, page fetch, HTML-to-text cleanup, LLM extraction/classification, deterministic rule overrides, Postgres inserts, compliance checks, and digest writes. A separate 15-minute verification chain and optional approval webhook are present. Export `active` is false.
- **Database:** Supabase PostgreSQL. `schema.sql` defines competitors, features, entries, runs, test results, indexes, a digest view, seed data, grants, and RLS policies. Drizzle migrations also exist under `ui/competitor-changelog-scout-main/drizzle/migrations/`; migration 0002 represents a different, approval-status-based view from the setup SQL.
- **Dashboard:** React 19, TypeScript, TanStack Start/Router, Vite, Tailwind, Supabase JS, React Query, and `react-markdown`, as declared in `ui/competitor-changelog-scout-main/package.json`. `src/routes/index.tsx` polls the digest every 15 seconds; it presents approved items, a pending review queue, AI insights, and test compliance. It does not implement competitor CRUD or start a scan.
- **AI:** n8n's Groq model node with a Google Gemini model node in the workflow; the dashboard's `/api/insights` route uses Lovable AI Gateway with `openai/gpt-6-astra` (`src/lib/ai/insights.server.ts`). These are separate AI flows. The README's Groq/Gemini description does not describe the dashboard insights provider.
- **Persistence and identity:** The current dashboard is effectively a shared public demo, not a multi-user application. `schema.sql` grants anonymous reads and limited anonymous updates. Authentication middleware exists for server functions, but the primary dashboard accesses Supabase directly with the publishable key. No user ownership column or per-user isolation is present.
- **Flow limitations:** The UI reads a database view, reviews pending rows, and sends approved records to the insights endpoint. The workflow owns collection. No UI action triggers a scan; the workflow must be manually run or active in n8n. `runs` stores a digest, but the dashboard does not read it for history.

## Feature audit

Status definitions: PASS = verified from code or executed evidence; PARTIAL = implemented with significant gaps; FAIL = code/config contradicts the claimed behavior; MISSING = absent from the repository; NOT VERIFIED = runtime evidence unavailable.

| Capability | Status | Evidence and notes |
|---|---|---|
| Add/edit/remove competitors in dashboard | MISSING | `src/routes/index.tsx` has no competitor management UI. Competitors are seeded in SQL and read by n8n. |
| URL validation/duplicate handling | FAIL | The workflow reads URL fields from `competitors` and passes them to HTTP Request without scheme/host validation. DB primary key constrains IDs, not duplicate URLs. |
| Collect pages | PARTIAL | Workflow fetch and extraction nodes exist; runtime, redirects, timeouts, page limits, and provider failures were not exercised. HTTP Request config has no explicit timeout or redirect destination guard. |
| RSS/Atom discovery or JS pages | MISSING | No feed parser or browser renderer found. README acknowledges JavaScript-rendered pages are unsupported. |
| Meaningful change detection | PARTIAL | `Build digest` compares current entries against previously approved entries by competitor and feature/title. It does not compare page snapshots or suppress noisy page changes. |
| Idempotence | PARTIAL | `entries.idempotency_key` is unique and Save entries skips conflicts. Key includes current status/date and can create another record as classification changes; concurrency was not verified. |
| AI extraction and rule enforcement | PARTIAL | Prompt requests structured JSON and treats page text as data; Code node overrides blog-shipped, missing dates, low confidence. Prompt injection resilience, response failures, quotas, and retries were not exercised. |
| Evidence traceability | PARTIAL | Entries preserve source URL, reason, retrieval timestamp, confidence; dashboard links to source. It does not show full captured evidence or description in the review view. |
| Human review | PARTIAL | Anonymous review form validates a nonblank name client-side and SQL requires nonblank reviewer and timestamp. No identity verification; anyone with public endpoint access can review. |
| Dashboard states and responsiveness | PARTIAL | Loading, empty, and error states exist; no browser accessibility/responsive test was run. Header says “Agent Pulse · live” without a runtime health check. |
| Test compliance | FAIL | Seeded `passed` fields are false. TC4 fixture file is a normal HTML document that describes a future 404; it does not itself return 404 when hosted as a file. |
| History and scheduling | PARTIAL | Workflow contains 12-hour and 15-minute schedule triggers, but export sets `active: false`; app dashboard does not show run history. |
| Accounts and data isolation | MISSING | No account ownership or tenant-level RLS; records are globally readable and review updates are globally possible. |
| Persistence across restarts | PARTIAL | Supabase is durable storage by design, but no live database/deployment was inspected. |
| AI insights UI | PARTIAL | `/api/insights` streams answers based on at most 200 approved rows; no auth/rate limit and evidence input is untrusted. ReactMarkdown is used without raw HTML plugin. |

## Findings

### P0 — Fresh-install schema is internally inconsistent

**Evidence:** `schema.sql` defines `entries` using `approval_status` and does not define an `approved` column; it later executes `ALTER TABLE entries DROP COLUMN IF EXISTS approved` (around line 116), then creates `vw_weekly_digest` selecting `e.approved` (around line 130) and a trigger assigning `NEW.approved` (around lines 66–80). A fresh execution therefore cannot create the view as written; insert trigger logic also targets a removed column. The companion migration `0002_approval_status_and_workflow_fields.sql` instead creates a view using `approval_status` fields. README instructs users to run `schema.sql`.

**Impact:** Fresh database setup fails before a functioning dashboard/workflow can be demonstrated. Existing databases may have different state, but that is not evidence that the documented setup works.

**Remediation:** Choose one schema source of truth; remove stale `approved` trigger/view references and reconcile SQL with migrations. Validate the entire setup from an empty Supabase project in a disposable environment and verify the workflow can insert and the dashboard can query/review.

### P1 — Public data and anonymous review are deliberate but unsafe for production

**Evidence:** `schema.sql` grants `SELECT` to `anon, authenticated` for competitor, entry, run, and test data and has `USING (true)` read policies. It grants anonymous updates to `approval_status`, `approved_by`, `approved_at`, with policy permitting pending-to-approved/rejected transitions. Dashboard updates use the publishable key directly (`src/routes/index.tsx`, `decideEntries`).

**Exploit/impact:** Any visitor with the public Supabase endpoint/key can enumerate the full competitor intelligence dataset and alter pending decisions while supplying any reviewer name. This is not account isolation or a trustworthy human approval gate.

**Remediation:** For production, add authenticated users and ownership/role checks, restrict row reads and review updates by authorization, and move privileged mutations to authenticated server-side handlers. If this remains a public hackathon demo, state this explicitly and use non-sensitive demo data.

### P1 — AI endpoint can be used to consume provider budget

**Evidence:** `src/routes/api/insights.ts` exposes POST `/api/insights`; `handleInsights` checks only for a nonempty question up to 1,000 chars, queries up to 200 approved rows, and streams a provider response using `LOVABLE_API_KEY`. No authentication, per-IP/user rate limit, concurrency limit, or request quota is visible.

**Exploit/impact:** An unauthenticated caller can repeatedly invoke paid AI processing. The endpoint returns friendly provider errors but does not cap spending or concurrent requests.

**Remediation:** Require authorized access or a controlled demo gate, add rate/concurrency limits and usage caps at the gateway/provider, bound evidence tokens/rows, and monitor spend. Set a provider-side budget alert before publishing.

### P1 — Workflow has SSRF exposure if a database-configured URL is changed

**Evidence:** `Sources` emits each `competitors.changelog_url` and `blog_url`; `Fetch page` uses `={{ $json.url }}` with no visible protocol/host/IP validation, and redirects are not revalidated in the workflow export. This is not directly exposed through current dashboard CRUD because that CRUD is absent, but any user/operator able to change a competitor row controls the fetch destination.

**Exploit/impact:** A malicious or compromised operator/database entry could target loopback, private network, link-local/cloud metadata, or redirect to internal services from the n8n host.

**Remediation:** Validate HTTPS and allowed domains before enqueueing; resolve and block private/reserved IPv4 and IPv6 at connection time, revalidate every redirect, defend against DNS rebinding, cap response bytes/time/redirects, and enforce network egress restrictions. Do not rely on hostname string checks alone.

### P1 — Untrusted page text enters an LLM prompt

**Evidence:** `Extract and classify` places `clean_text` in the same prompt as instructions. It says the page is data and to ignore embedded instructions, but no isolation or adversarial-content test is present. The Insights endpoint likewise inserts database-derived `reason`, labels, source URLs, and question into model input.

**Exploit/impact:** A page could include prompt injection that distorts extracted classifications or summaries. The current AI flows have no tool calls, so direct tool execution is not evidenced, but output integrity and unsupported claims remain at risk.

**Remediation:** Treat all page/database content as hostile data, isolate it from system instructions, apply schema validation and deterministic checks, preserve snippets/source evidence, and test malicious prompt strings. Avoid allowing model output to drive privileged writes without independent rules/human review.

### P1 — Demo fixture and compliance state overstate test readiness

**Evidence:** `schema.sql` seeds `test_results` with `passed = FALSE` for all cases. `tc4-missing.html` is checked into the repository and describes a page that “will vanish” but currently contains a valid HTML response; the README claims its hosted URL returns HTTP 404. TC4 workflow pass logic checks only `status === 'uncertain'`, so it can pass on an ordinary 200 page with no extracted entries.

**Impact:** A judge may see 0/4 test cases, while the test marked as 404 does not verify a 404 condition. Test compliance is not yet trustworthy.

**Remediation:** Make TC4 point to an actual controlled 404 endpoint and assert HTTP status as well as uncertainty; test TC1–TC3 deterministically with fixtures/mocks; record real run evidence only after execution; keep unrun cases visibly unverified.

### P1 — Workflow schedules are not active by default

**Evidence:** Export metadata at the end of `n8n/competitor-changelog-scout.json` has `"active": false`; workflow includes a 12-hour schedule trigger and a 15-minute verification trigger. README says schedule runs while n8n remains running.

**Impact:** Importing the JSON does not prove automatic checks will run. A judge/deployed app may appear stale unless the workflow is activated in a running n8n instance.

**Remediation:** Activate only after credentials and destination validation are configured. Add a documented manual run and health/last-run indicator; verify schedules in the actual n8n deployment.

### P2 — UI reports live agent pulse without verifying agent health

**Evidence:** Header in `src/routes/index.tsx` renders a constant “Agent Pulse · live”; no health endpoint or last workflow-run query drives it. KPI “Last Scan” is calculated from latest entry retrieval, not a scan/run record.

**Impact:** Stale data or a stopped workflow may be presented as live.

**Remediation:** Use real workflow run metadata/health; distinguish last successful scan from last entry update and show stale/error state.

### P2 — Docs, manifests, and migrations do not form one reproducible setup

**Evidence:** Root `package-lock.json` contains an empty packages map; UI has `package.json` and `bun.lock` but Bun is unavailable in this environment. UI has `.env` tracked by Git; inspected variable names are Supabase project ID, URL, and publishable key only (values were not displayed). No root build/deploy config or `.env.example` was found. README documents `schema.sql`, while UI migrations diverge in schema shape.

**Impact:** A new developer cannot follow one reproducible build/schema path from the repository alone. The tracked `.env` currently appears to contain publishable configuration, not a service-role/AI secret; continue to treat any future private key as secret and remove tracked local environment files.

**Remediation:** Choose Bun or npm and provide the matching lockfile/scripts; document migration sequence; add a placeholder-only `.env.example`; ensure `.env` is ignored and not committed; verify no private keys in Git history.

### P2 — Public approval webhook lacks visible authentication

**Evidence:** n8n webhook node `Approve entries` has `allowedOrigins: "*"`; its validation checks UUID and decision values but uses a default `demo-user` reviewer. Workflow writes directly through Postgres credentials. CORS origin restrictions alone are not caller authentication.

**Exploit/impact:** If activated and reachable, an attacker could submit approval requests for known entry UUIDs unless n8n instance/webhook authentication is configured externally; none is visible in this node configuration.

**Remediation:** Disable the optional webhook unless needed, or require a strong webhook secret/signature and pending-state transition checks; never treat CORS as authorization.

## Security and reliability assessment

- No SQL injection was confirmed in application routes. Workflow SQL interpolation uses validated UUIDs in the approval read-back query; source-driven DB operations otherwise use n8n Postgres node mappings. Review SQL escaping and parameterization in a live n8n version before enabling the optional webhook.
- The publishable Supabase key is expected in a browser client; no service-role key is referenced by client code. A tracked `.env` exists, but its variable names indicate only publishable configuration; values were deliberately not printed. `LOVABLE_API_KEY` is server-side in `insights.server.ts`.
- `src/start.ts` installs CSRF middleware for server functions. The direct Supabase PostgREST review operation is not that server-function path; the database grants/policies are its primary control.
- ReactMarkdown does not enable raw HTML rendering in `AskInsights.tsx`; this reduces one XSS path. Source links open a new tab with `rel="noreferrer"`; external URLs are sourced from database records.
- No authenticated account boundary, application rate limit, collector URL allowlist, request-size/response-size limit, or explicit scrape timeout was found in the relevant code/config.
- n8n retries are enabled on at least one node, but retry policy and duplicate/concurrency behavior were not executed. A uniqueness constraint prevents exact idempotency-key duplicates; collisions are skipped silently by configuration.
- No GitHub Actions/CI, Dockerfile, deployment manifest, or standalone worker process was found in the listed repository files. Supabase provides durable state; n8n needs a persistent reachable instance for schedules.
- This is a repository audit, not a guarantee of complete security. Actual hosted Supabase policies, n8n credentials/configuration, gateway budgets, and network egress were not inspectable.

## Deployment blockers and unknowns

1. Fix and validate fresh schema setup; reconcile it with migrations.
2. Decide whether this is intentionally a public shared demo or a real multi-user service; implement the corresponding authorization model.
3. Add AI request controls and SSRF protections before exposing the service publicly.
4. Activate and verify n8n schedules only after secure credential and network configuration.
5. Confirm the actual published URL, app configuration, database state, and all four test cases with live smoke checks.
6. Pick a single package manager and document exact reproducible setup commands.

## Readiness assessment

**Hackathon demo readiness: partial.** The UI and workflow artifacts are substantial and make an explainable demo possible with configured services. No proof of a passing end-to-end run is present in repository state. **Production readiness: not ready.** The database setup defect and public access/cost/SSRF risks must be resolved or explicitly constrained before reliable public operation.

## Evidence commands and limitations

- `git status --short --branch` → `## main...origin/main` (clean before audit files).
- `rg --files -g '!node_modules' -g '!dist' -g '!build'` → repository inventory; no Docker/CI deployment files surfaced.
- `node --version` → v24.20.0; `npm --version` → 11.19.0; `bun --version` → command unavailable.
- `Test-Path ui/competitor-changelog-scout-main/node_modules` → false. No package installation was performed.
- `git ls-files ui/competitor-changelog-scout-main/.env` → tracked local env file; values were not printed.
- Workflow JSON parsed using PowerShell `ConvertFrom-Json`; workflow export `active` is false.
- No database, n8n, provider, deployed endpoint, test, lint, or build command was run; dependencies and service credentials/runtime are absent. A web open attempt to the README's Lovable URL was inaccessible in the available browser tool, so deployment state remains NOT VERIFIED.
