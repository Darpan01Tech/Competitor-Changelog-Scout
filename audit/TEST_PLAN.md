# Test Plan

## Current evidence and status

- Stabilization code now adds explicit test execution states, asserts TC4's observed status is HTTP 404, and disables anonymous review writes. The workflow's TC4 endpoint is intentionally blank; its live case remains NOT RUN until an operator configures a verified controlled 404 URL.
- Static Node checks executed during the fix sprint compiled all n8n Code node scripts, validated workflow connections, checked the host allowlist against a valid demo host/localhost/other host, and confirmed TC4 200/no-response -> NOT RUN and 404 + uncertain -> PASS.
- Source includes Vitest tests: `src/test/review.test.ts` (review payload/pending/verification helpers) and `src/test/app-routing.test.tsx` (root route match). They are not evidence of collector, database, AI, security, or full-user-flow behavior.
- `ui/competitor-changelog-scout-main/node_modules` is absent; Bun is not installed. Tests, lint, and build were **not run**. Do not report them as passing.
- No live Supabase/n8n/provider credentials or reachable deployment were available. Live smoke and AI/network scenarios are **NOT VERIFIED**.

## Commands (run from `ui/competitor-changelog-scout-main` after selecting/installing the documented package manager)

```powershell
bun install --frozen-lockfile
bun run test
bun run lint
bun run build
```

The UI contains `bun.lock` and has no `package-lock.json`; use Bun consistently. The unrelated empty root npm lockfile was removed during repository cleanup. Do not mix package managers in CI.

## Required deterministic tests

### Unit

- Classification rules: dated shipped changelog, announced marketing post, rename/alias mapping, low confidence, missing date, unknown status, unavailable source, malformed model JSON.
- Idempotency key stability for repeat unchanged checks and behavior when status/date changes.
- URL parser: HTTPS, credentials in URL, invalid schemes, IPv4/IPv6 loopback/private/link-local/reserved, encoded hosts, trailing dots, IDN, DNS answers that change.
- Reviewer payload and current tests in `src/test/review.test.ts`.
- Insights evidence limiting, question length validation, empty evidence, provider error mapping.

### Integration

- Apply schema/migrations to an empty disposable Postgres/Supabase instance; assert all tables, view, trigger, grants and policies exist.
- Run n8n workflow with mocked source HTTP, mocked LLM output and test Postgres. Assert TC1–TC4 outcomes, history, test evidence, digest, and duplicate behavior.
- Assert non-2xx, redirect-to-private-IP, timeout, oversized body, empty page, malformed HTML, provider 429/5xx and database outage fail safely.
- Assert public/unauthenticated readers and writers match the selected access model; attempt cross-user reads and review updates.
- Test concurrent/repeated workflow executions and row locking/upsert semantics.
- Test AI endpoint auth, request size, rate/concurrency limits, provider budget/error handling, abort behavior, and safe Markdown rendering.

### End-to-end / UX

1. Fresh DB and app load with no entries: clear empty state, no false “live” indication.
2. Add/configure a supported competitor (after CRUD exists), run one collection, inspect source and extracted result.
3. Approve/reject with verified identity; check audit fields and refreshed UI.
4. Run same content again: no duplicate; update fixture: changed/new evidence appears.
5. Ask insights about approved evidence; answer cites source and does not invent missing evidence.
6. Verify phone width, keyboard navigation, focus visibility, screen-reader labels, and error recovery.

### Security

- SSRF suite covers direct private targets, all redirects, DNS rebinding, IPv4-mapped IPv6 and metadata destinations; verify network egress blocks internal targets.
- Anonymous database enumeration/review attempts; CSRF/CORS checks for server routes; authorization and rate-limit bypass cases.
- Prompt-injection pages and poisoned stored text; no secret disclosure, unauthorized writes, or unsupported source claims.
- Inspect built browser bundles and logs for service-role/provider secrets; run dependency audit for chosen lockfile.

### Deployed smoke

- `GET /` returns expected app and HTTPS certificate.
- `POST /api/insights` without valid access is rejected once access control is implemented; oversized, malformed, repeated, and provider-down requests are bounded and useful.
- Confirm dashboard reads fresh Supabase rows; activate workflow and verify a recent run, persisted entry, and schedule recurrence.
- Roll back app version and restore database using documented process.

## Test status matrix

| Area | Current status | Evidence required to close |
|---|---|---|
| Review helpers | NOT RUN | Vitest command result |
| Route match | NOT RUN | Vitest command result |
| Build/lint | NOT RUN | Clean install CI output |
| Fresh schema/migrations | Static consistency checks pass; SQL not executed | Apply to disposable PostgreSQL/Supabase and verify insert/view behavior |
| n8n rules | Static Code-node checks pass; live TC1–TC4 NOT VERIFIED; TC4 NOT RUN by default | Executed workflow output and persisted test rows |
| Collector URL checks | Static allowlist checks pass; DNS/egress protection NOT VERIFIED | Verify n8n runtime redirects and host-level egress controls |
| AI unavailable/malformed response | NOT VERIFIED | Deterministic mocked integration results |
| Hosted smoke | NOT VERIFIED | Dated endpoint checks and screenshots/logs |

## Dashboard refresh verification

The dashboard's entry, compliance, and saved-digest React Query records poll at the configurable interval `VITE_DASHBOARD_REFRESH_INTERVAL_MS` (5000 to 300000 milliseconds; default 15000). Polling pauses in background tabs. Manual **Refresh dashboard** refetches those records without triggering a scan. Browser-level interaction and failure-retention behavior are not verified until UI tests/build can run.

## Session-only review demo adjustment (2026-10-23)

- The Decision Gate now exposes Accept and Reject buttons without reviewer sign-in or configuration fields.
- Each choice updates local page-session state, moves the card into Decision history, updates pending counts, and displays a toast. It does not call the review endpoint or persist to Supabase; decisions reset on refresh.
- For the hackathon demo, click Accept or Reject on a pending card, verify its status in Decision history and the pending count, and confirm the session-only notice. Do not describe this as a saved review.
- Current UI validation: `npm.cmd test` passed (6 files, 31 tests); `npm.cmd run build` passed with the existing large client chunk warning. `npm.cmd run lint` failed on repository-wide Prettier CRLF/formatting errors. Browser interaction was not run.

## Emergency repair validation (2026-10-23)

- `npm.cmd test`: passed, 7 files / 35 tests. `npm.cmd run build`: passed with the >500 kB client chunk warning. Direct `node_modules/.bin/tsc.exe --noEmit`: passed.
- `npm.cmd run lint`: failed on repository-wide Prettier/CRLF formatting errors (2,625 errors). ESLint on touched TypeScript with the Prettier rule disabled: passed.
- n8n workflow JSON parsed successfully (36 nodes); root `schema.sql` contains `execution_status`; four HTML fixtures remain present. `git diff --check` passed.
- Supabase reads and a valid AI provider response were not verified: this execution environment blocks outbound sockets. The local `.env` has the Supabase variable names configured but does not contain `LOVABLE_API_KEY`. The remote schema's migration state is unknown; no migration was run.
- The UI lockfile is `bun.lock`, but Bun is unavailable here. Existing installed dependencies were used through npm scripts; no package install or lockfile change was made.
- Decision Gate demo seed/reset and Test Compliance fallback are local UI behavior. Demo test rows remain NOT RUN and must not be reported as workflow execution evidence.
