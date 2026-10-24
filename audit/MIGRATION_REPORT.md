# Vite SPA and Supabase migration report

This report describes the current repository state. Older audit notes in this directory record the earlier deployment and are retained as historical evidence.

## Architecture

**Before:** React was bundled through a Lovable Vite wrapper around TanStack Start. Nitro hosted server routes for Insights and review; browser auth could broker sessions through the Lovable preview; Insights used the Lovable AI Gateway. The n8n workflow was an inactive export.

**Now:** React 19, Vite 8, Tailwind 4, and TanStack Router build a static SPA into `ui/competitor-changelog-scout-main/dist`. Supabase provides PostgreSQL, Auth, RLS, Edge Functions, `pg_cron`, and `pg_net`. No production Node server is built. `public/_redirects` supplies an SPA fallback on compatible static hosts; other hosts need the equivalent `/* -> /index.html` rewrite.

## Edge Functions

- `insights`: reads approved digest rows, calls Groq `qwen/qwen3.8-27b`, and streams the response to the existing UI. Questions are capped at 500 characters; the RPC-backed rate limit is 12 requests per hashed client address per minute.
- `review`: validates the Supabase Auth token and the configured reviewer UUID/email, applies only a pending-to-approved/rejected transition, records reviewer metadata, and limits attempts to 20 per user per minute.
- `scan-competitors`: scheduled collector using the workflow's Groq primary (`qwen/qwen3.8-27b`), one bounded retry, and optional Gemini fallback (`gemini-3.8-flash`); fetches only explicitly allowlisted HTTPS hosts without redirects, caps response size and request time, applies status/date/confidence rules, upserts through the existing idempotency key, and writes TC1–TC4 results plus a digest.
- `verify-entries`: scheduled read/check/update of verification status for decided rows.

The dashboard’s current Accept/Reject sample controls remain session-only and are not wired to persisted review. The protected function is available for a later authenticated review UI integration.

## Schema and schedules

No remote database operation was performed. The additive migration `ui/competitor-changelog-scout-main/supabase/migrations/202610240001_schedule_collector.sql` creates service-only rate-limit tables and RPCs and optionally schedules 12-hour scans and 15-minute verification through Vault, `pg_cron`, and `pg_net`. It does not drop or recreate application tables. Review and approve it against the target Supabase project after backup. Add `SCOUT_SCAN_FUNCTION_URL` and `SCOUT_CRON_SECRET` to Supabase Vault before applying it to install schedules.

## Configuration

Frontend build variables: `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, and optionally `VITE_DASHBOARD_REFRESH_INTERVAL_MS`.

Supabase Function secrets: `GROQ_API_KEY`, optional `GEMINI_API_KEY`, `SCOUT_CRON_SECRET`, `SCOUT_ALLOWED_HOSTS` (exact comma-separated hostnames), `DEMO_REVIEWER_EMAIL`, and `DEMO_REVIEWER_USER_ID`. Supabase normally supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. The service-role key stays server-side.

## Local verification

From `ui/competitor-changelog-scout-main`:

- `npm run build` — passed; static files emitted to `dist/`.
- `npm run typecheck` — passed.
- `npm run lint -- --quiet` — passed.
- `npm test` — passed; 4 test files and 15 tests.
- `npm ci --dry-run --offline --ignore-scripts --no-audit --no-fund` — passed; package manifest and npm lockfile are in sync.

The Deno and Supabase CLIs are not installed in this workspace, and no Supabase project/provider credentials were supplied. Edge Function deployment, remote migrations, schedules, authenticated reviewer writes, provider streaming, and hosted/browser smoke tests therefore remain unverified manual steps.

## Removed files

Removed Lovable/Start-only metadata, preview auth, middleware, server clients, server bootstrap, API route handlers, Lovable error telemetry, and server-only AI/review modules. The old Bun lock/config and Drizzle config were removed; `schema.sql` and existing Drizzle schema/migration source files remain as database history/reference. The prior endpoint-specific server tests were removed; browser review behavior and app routing continue to be covered by the remaining Vitest suite.

## Reference scan

No Lovable package, runtime import, gateway URL, preview auth code, environment variable, or old `/api/insights`/`api/review` call remains in active source, package files, or generated build output. The older `FINAL_FIX_REPORT.md`, `IMPLEMENTATION_ROADMAP.md`, `PRODUCTION_READINESS_REPORT.md`, and `TEST_PLAN.md` still mention the previous design because they document historical audits; this report supersedes those deployment assumptions. The exported n8n JSON is retained for audit/reference only and is not needed by the scheduled Supabase collector.

## File inventory

### Modified

- `README.md`
- `audit/DEPLOYMENT_GUIDE.md`, `audit/ENVIRONMENT_VARIABLES.md`
- `ui/competitor-changelog-scout-main/.env.example`, `.prettierrc`, `AGENTS.md`, `eslint.config.js`, `package.json`
- `src/components/AskInsights.tsx`
- `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`
- `src/lib/demo-data.ts` (formatting only)
- `src/routeTree.gen.ts`, `src/routes/README.md`, `src/routes/__root.tsx`, `src/routes/index.tsx` (dashboard formatting only)
- `src/test/demo-review.test.ts`, `src/test/review.test.ts`, `src/test/reviewer-auth.test.ts` (formatting only)
- `supabase/config.toml`, `vite.config.ts`

### Created

- `audit/MIGRATION_REPORT.md`
- `ui/competitor-changelog-scout-main/index.html`, `package-lock.json`, `public/_redirects`, `src/main.tsx`
- `supabase/functions/insights/index.ts`, `review/index.ts`, `scan-competitors/index.ts`, `verify-entries/index.ts`
- `supabase/migrations/202610240001_schedule_collector.sql`

### Deleted

- `bun.lock`, `bunfig.toml`, `drizzle.config.ts`
- `src/integrations/supabase/auth-attacher.ts`, `auth-middleware.ts`, `client.server.ts`, `cron-auth.ts`, `previewAuthStorage.ts`
- `src/lib/ai/insights.server.ts`, `src/lib/ai/run-id.ts`, `src/lib/error-capture.ts`, `src/lib/error-page.ts`, `src/lib/lovable-error-reporting.ts`, `src/lib/review.server.ts`
- `src/routes/api/insights.ts`, `src/routes/api/review.ts`, `src/server.ts`, `src/start.ts`
- `src/test/insights-config.test.ts`, `src/test/review-api.test.ts`, `src/test/review.server.test.ts`
- `.lovable/project.json` was already absent when work began, as noted in the task; Git continues to report that tracked file as deleted.
