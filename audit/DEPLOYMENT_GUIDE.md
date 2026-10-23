# Deployment Guide

This is a proposed path, not a record of a completed deployment. No infrastructure was created or changed during this audit.

## Recommended MVP architecture

Keep the current simple topology: Lovable-hosted TanStack Start app (the repo's documented publishing path), one Supabase PostgreSQL project, and one persistent n8n instance running the workflow. The UI itself has a server-side `/api/insights` route, so confirm the chosen Lovable runtime supports this route in a production build before assuming a static host will work. Keep n8n separate because scheduled workflows need a continuously running scheduler. Do not use ephemeral/serverless execution for the scheduler unless a persistent worker/scheduler guarantee is confirmed.

Current provider split: n8n uses Groq with Gemini fallback; dashboard insights uses Lovable AI Gateway. Configure only providers you intend to demonstrate and cap usage. The project has no built-in local start/build hosting container or health check endpoint.

## Prerequisites

- Supabase project with PostgreSQL and PostgREST; use `schema.sql` for a fresh install or review/backup an existing Drizzle-managed database before applying migration `0003`.
- n8n instance with persistent storage, HTTPS, user access control, and persistent scheduling; import `n8n/competitor-changelog-scout.json` and attach Postgres/Groq/Gemini credentials as required.
- Lovable project access and production publish permission, or another host proven to support TanStack Start SSR/API routes.
- Secrets stored in each service's secret manager, never in Git or browser bundle.
- Before launch, choose public demo access versus authenticated users; the current SQL allows globally readable demo data and denies anonymous review writes.

## Environment/config inventory

See [ENVIRONMENT_VARIABLES.md](ENVIRONMENT_VARIABLES.md). In summary: server/browser Supabase URL and publishable key, optional project IDs used by platform tooling, Lovable AI Gateway key, migration database URL, and optional cron secrets defined by generated auth helper. n8n credentials are configured in n8n credential storage and are not environment variables documented in this repository.

## Deployment sequence

1. **Reconcile schema first.** Repair the `approved`/`approval_status` mismatch, choose either SQL or Drizzle as the source of truth, and run against a disposable empty database. Confirm view, trigger, policies, grants and insert/update behavior.
2. **Set Supabase policies.** Review the shared public-read demo policy and keep review updates revoked. Restrict the publishable key to browser use; keep service-role credentials only in server-side secrets.
3. **Secure collector egress.** Add strict URL validation, connection-time DNS/IP checks, redirect revalidation, response/time limits and network-level internal egress blocks. Start with allowlisted mock sources.
4. **Provision n8n.** Use an always-on instance with persistent storage. Configure Postgres access using least privilege and secret storage. Import the workflow, attach Groq/Gemini credentials if needed, inspect node versions and expressions, then run manually against fixtures.
5. **Activate schedules only after validation.** The export has `active: false`. Activate in n8n after a successful manual run, and verify 12-hour scan and 15-minute verification triggers in deployment. Set execution retention and backup policies.
6. **Configure Lovable app.** Supply server `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `LOVABLE_API_KEY`; expose only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` as client build-time variables. Confirm server API route works in the published SSR runtime.
7. **Build and publish.** From `ui/competitor-changelog-scout-main`, use the selected package manager's frozen install, then `run build`. With Lovable, publish via the Lovable UI and verify the published snapshot; no GitHub Pages or backend deploy command is present in this repository. Do not infer the current deployment from README link.
8. **Smoke test and monitor.** Verify app, Supabase queries, dashboard refresh behavior, insight response, workflow entry, test evidence, scheduled run, stale/error status, logs and provider usage. The review queue remains read-only until an authenticated or protected review path is implemented and tested. Capture date-stamped evidence.

## Build, migration, start, health

- UI scripts from `package.json`: `dev: vite dev`, `build: vite build`, `preview: vite preview`, `lint: eslint .`, `test: vitest run`.
- No production `start` script or `/health` endpoint was found. Do not use `vite preview` as a production server. Confirm hosting integration's server start behavior and add a readiness/health route before relying on automated health checks.
- `drizzle.config.ts` reads `LOVABLE_DB_MIGRATION_URL`, but no documented migration command is provided. Select a single migration process and test it before launch. `README.md` currently tells users to execute `schema.sql`.
- n8n startup/health depends on selected host; configure persistent volumes and restart policy following that host's official documentation.

## Rollback and recovery

- Keep the previous published Lovable snapshot available and republish it if app smoke checks fail.
- Disable the n8n workflow immediately if it creates bad data or unexpected provider spend; preserve execution logs for diagnosis.
- Take a database backup before schema changes; rollback with a tested migration/restore plan. Supabase Free currently advertises no automatic backups, while Pro includes daily backups retained 7 days; verify current account terms before launch.
- Rotate any exposed secrets; the tracked local `.env` currently appears to contain only publishable values, but audit commit history before production.

## Free-tier and cost considerations (checked 2026-10-23)

- Supabase currently lists Free at $0 with 500 MB database, 5 GB egress, and projects pausing after one week inactive; Pro starts at $25/month and advertises daily backups retained seven days. Free pause behavior is a material risk to a continuously demonstrated service. Verify exact limits and current pricing before choosing.
- Lovable docs describe hosted publishing with HTTPS and a `lovable.app` URL; features, audience controls, and custom domains vary by plan. The README URL itself was inaccessible in this audit, and this repository does not prove which plan/runtime is enabled.
- n8n documents free self-hosted Community edition, but hosting compute, persistent disk, domain/HTTPS, backups, and operations still cost time/money. A self-hosted ephemeral/free container is unsuitable for guaranteed schedules unless persistent runtime is proven. n8n Cloud is an alternative paid managed service; pricing/quotas were not established here.
- Groq, Gemini, and Lovable AI Gateway quotas/costs depend on account and model; no project budgets were available. Set provider-side limits/alerts; no reliable spend estimate can be calculated from repository evidence.

## Troubleshooting

- Supabase missing-env error: configure both server variables and matching Vite browser variables; ensure URLs point at the intended project.
- View/trigger errors: stop deployment and reconcile `schema.sql` with Drizzle migrations before retry.
- No automatic scans: confirm n8n is running, workflow is active, schedule enabled, and Postgres/model credentials valid.
- Insights reports AI not configured: configure server-only `LOVABLE_API_KEY`; verify budget/entitlement and endpoint runtime.
- Dashboard refresh: **Refresh dashboard** refetches entries, test results, and the most recent saved digest without starting a scan. The dashboard polls those queries every 15 seconds by default; `VITE_DASHBOARD_REFRESH_INTERVAL_MS` accepts 5000–300000 milliseconds.
- Stale dashboard: distinguish no new entry from failed workflow; inspect n8n execution and database run records. Failed scan attempts are not persisted in `runs`, so the dashboard cannot show a reliable last-failed or last-attempt time.
- Never paste secrets into issue reports, screenshots, or demo recordings.
