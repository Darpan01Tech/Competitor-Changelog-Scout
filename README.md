# Competitor Changelog Scout

React dashboard for tracking competitor changelogs, with a static Vite frontend and Supabase PostgreSQL, Auth, and Edge Functions backend.

## Architecture

- **Frontend:** React 19, Vite, Tailwind, and TanStack Router. Production output is static files in `ui/competitor-changelog-scout-main/dist/`.
- **Backend:** Supabase tables and RLS policies; Edge Functions handle AI insights, protected review writes, scheduled source scanning, and record verification.
- **AI provider:** Groq with `qwen/qwen3.8-27b`, matching the source workflow's configured primary model; the collector can use Google Gemini as a fallback when `GEMINI_API_KEY` is configured.
- **Scheduler:** Supabase `pg_cron` calls Edge Functions through `pg_net`; n8n is not part of production operation.

The dashboard keeps its local session-only sample review controls. Persisted reviewer writes are available through the separately protected `review` Edge Function for an allowlisted Supabase Auth user.

## Local development

From `ui/competitor-changelog-scout-main`:

```sh
npm install
cp .env.example .env.local
npm run dev
```

Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`. Build and check with `npm run build`, `npm run typecheck`, `npm run lint`, and `npm test`.

## Deploy

Deploy `ui/competitor-changelog-scout-main/dist` to any static host and configure an SPA fallback so unknown paths serve `/index.html`. Deploy Supabase functions with `supabase functions deploy insights`, `review`, `scan-competitors`, and `verify-entries`. See [audit/DEPLOYMENT_GUIDE.md](audit/DEPLOYMENT_GUIDE.md) for secrets, scheduling, and setup steps.

## Database

`schema.sql` documents the existing application schema and seed data. Do not rerun its reconciliation statements blindly on a production database. The additive scheduling migration is in `ui/competitor-changelog-scout-main/supabase/migrations/`; it does not drop or recreate application tables.

## Collector scope

Collector requests only fetch HTTPS hosts explicitly configured in the server-side `SCOUT_ALLOWED_HOSTS` secret, do not follow redirects, and apply request timeouts and response text limits. Configure the exact mock or owned competitor hostnames you intend to scan. The collector uses the Groq API secret and persists unique results using the existing `idempotency_key` constraint.
