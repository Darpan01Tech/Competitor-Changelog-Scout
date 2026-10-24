# Deployment guide

## Components

1. Static React SPA from `ui/competitor-changelog-scout-main/dist` on Netlify, Cloudflare Pages, Vercel Static, GitHub Pages with a fallback, or another static host.
2. Supabase PostgreSQL, Auth, RLS, Edge Functions, and `pg_cron`/`pg_net` scheduling.

No Node server or n8n instance is required in production. Configure the static host to rewrite unknown paths to `/index.html` with status 200 (for example, a Netlify `/* /index.html 200` rule or equivalent). Vite's development and preview servers already provide SPA fallback for local checks.

## Frontend build

From `ui/competitor-changelog-scout-main`:

```sh
npm install
npm run dev
npm run build
npm run preview
npm run lint
npm run typecheck
npm test
```

Set these public build-time variables in `.env.local` and the static host:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- Optional: `VITE_DASHBOARD_REFRESH_INTERVAL_MS` (5000–300000, default 15000)

Never set service-role keys, database credentials, Groq keys, reviewer secrets, or cron secrets as `VITE_` variables.

## Supabase setup

1. Review the current schema and RLS policies in the root `schema.sql` against the target project. Back up production first. Do not apply that reconciliation script blindly.
2. Add Edge Function secrets through the Supabase dashboard or CLI:

   - `GROQ_API_KEY`: Groq API key for insights and source classification using `qwen/qwen3.8-27b`.
   - Optional `GEMINI_API_KEY`: Google Gemini API key for the collector's fallback model (`gemini-3.8-flash`).
   - `SCOUT_CRON_SECRET`: long random value used to authorize scheduled function invocations.
   - `SCOUT_ALLOWED_HOSTS`: comma-separated exact HTTPS hostnames the collector may fetch (for example, the owned fixture host). Do not use wildcards.
   - `DEMO_REVIEWER_EMAIL` and `DEMO_REVIEWER_USER_ID`: the email and UUID of the one authorized Supabase Auth reviewer.
   - Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to deployed Edge Functions. If unavailable in the project, configure them as Edge Function secrets; never expose the service key to the frontend.

3. Deploy the functions:

   ```sh
   supabase functions deploy insights --no-verify-jwt
   supabase functions deploy review
   supabase functions deploy scan-competitors --no-verify-jwt
   supabase functions deploy verify-entries --no-verify-jwt
   ```

   `insights` serves public approved evidence and does not require a user session. `review` requires a Supabase Auth JWT and checks the configured reviewer ID and email. Scanner and verifier use the separate `x-scheduler-secret` header.

4. Enable `pg_cron`, `pg_net`, and Vault in the Supabase project. Store the complete scan Edge Function URL as Vault secret `SCOUT_SCAN_FUNCTION_URL`, and a long random value as `SCOUT_CRON_SECRET`. Review and apply `ui/competitor-changelog-scout-main/supabase/migrations/202610240001_schedule_collector.sql` only after approval. It schedules scans every 12 hours and verification every 15 minutes. It skips installing schedules if either Vault value is missing. The saved cron commands call a fixed-target helper that reads the shared secret from Vault at runtime, so the secret is not embedded in `cron.job.command`.
5. Confirm schedules in the Supabase SQL editor with `select jobname, schedule, command from cron.job where jobname in ('competitor-scan-12-hourly', 'entry-verification-15-minute');`. The command should contain `invoke_scout_schedule` and no secret. Confirm a manual scan with POST to `/functions/v1/scan-competitors`, header `x-scheduler-secret: <SCOUT_CRON_SECRET>`, and JSON body `{}`; confirm a matching verifier POST to `/functions/v1/verify-entries`. Check function logs, `runs`, `entries`, and `test_results`, and provider usage.

The project has no scheduled test-case fixture runner. The collector records source results; it does not claim that all four demo test cases ran successfully. TC4 must be tested with an explicitly controlled source returning HTTP 404 before marking it passed. Entry writes use `idempotency_key` upserts, but each scan invocation creates a separate `runs` row and can rewrite the shared `test_results` rows. The scheduler is authenticated but not protected by a cross-invocation scan lock; if two scans overlap, duplicate run/digest records are possible.

## Review behavior and Auth

Seeded dashboard samples are read-only and cannot be reviewed. Pending live Supabase records use the existing full-size review cards with persisted Accept/Reject controls. A reviewer signs in with Supabase Auth; the browser checks authorization through the review function, and the function independently validates the JWT and checks both allowlisted user ID and email before a conditional `pending` to `approved`/`rejected` update. The service-role credential stays in the function and the server records the configured reviewer email and timestamp. Create the reviewer Auth user and set `DEMO_REVIEWER_USER_ID` and `DEMO_REVIEWER_EMAIL` before using these controls.

## Static hosting and rollback

Publish only the `dist` directory and configure SPA fallback. Keep frontend and Supabase environment values aligned. Roll back by redeploying the previous static artifact and disabling the two `pg_cron` jobs if collector behavior is incorrect. Database changes in the supplied scheduling migration are additive; no remote migrations have been run as part of this repository change.
