# Environment Variables

Inventory based on source references and variable names in the tracked UI `.env`; secret values were not displayed or copied. Add only placeholder values to future examples.

| Variable | Required where used | Purpose/source | Exposure |
|---|---|---|---|
| `SUPABASE_URL` | Required for SSR/server Supabase operations | Supabase project URL, read by `src/integrations/supabase/client.ts`, `client.server.ts`, auth middleware, and AI insights loader. | Server configuration; URL itself is not secret. |
| `SUPABASE_PUBLISHABLE_KEY` | Required for browser/server publishable Supabase client | Supabase publishable/anon key, referenced by Supabase client, auth middleware, and insights query. | Public key; database RLS is the security boundary. |
| `VITE_SUPABASE_URL` | Optional build-time browser override; otherwise falls back to `SUPABASE_URL` | `src/integrations/supabase/client.ts`. | Public, embedded in browser build. |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Optional build-time browser override; otherwise falls back to `SUPABASE_PUBLISHABLE_KEY` | `src/integrations/supabase/client.ts`. | Public, embedded in browser build. Never place service-role key under `VITE_`. |
| `SUPABASE_PROJECT_ID` | Platform/tooling only; not referenced by application source found | Present by name in tracked `ui/competitor-changelog-scout-main/.env`. | Identifier, not credential. |
| `VITE_SUPABASE_PROJECT_ID` | Platform/tooling only; not referenced by application source found | Present by name in tracked UI `.env`. | Identifier, not credential. |
| `LOVABLE_API_KEY` | Required only for `/api/insights` AI function | Lovable AI Gateway authorization in `src/lib/ai/insights.server.ts`; absent key returns “AI is not configured.” | Secret; server-only. |
| `LOVABLE_DB_MIGRATION_URL` | Required only if invoking Drizzle migration tooling | `drizzle.config.ts` database URL. | Secret connection string; server/tooling only. |
| `LOVABLE_CRON_SECRET` | Required only for cron-auth helper | `src/integrations/supabase/cron-auth.ts`; helper returns 500 without it. No route use was found. | Secret bearer token. |
| `LOVABLE_CRON_SECRET_PREVIOUS` | Optional during secret rotation | Previous accepted secret in cron-auth helper. | Secret bearer token; remove after rotation window. |

## Not application environment variables

n8n stores Postgres, Groq, and Gemini credentials in n8n's credential store per README/workflow. The export contains credential references, not credential values. Configure these in n8n's secret/credential manager; do not add keys to the exported JSON or browser variables. The `LOVABLE_API_KEY` provider differs from n8n's Groq/Gemini flow.

## Repository hygiene

`ui/competitor-changelog-scout-main/.env` is tracked by Git. Its values were classified in memory without printing: project IDs and URLs are configuration values, and both Supabase keys are publishable/anon formats. No server credential was found in the current file. The new ignore rule does not untrack an already tracked file; do not put future private keys there, use the placeholder-only `.env.example`, and review Git history if any server key was ever committed.

## Current implementation notes

- `VITE_DASHBOARD_REFRESH_INTERVAL_MS` configures dashboard polling in milliseconds (5000–300000; default 15000). It is public build-time configuration.
- `SUPABASE_SERVICE_ROLE_KEY` is a server-only privileged value used by optional server admin helpers; this build's review queue is read-only and does not need it to display actions.
- There is no implemented `DEMO_REVIEW_SECRET` or protected demo review API. Adding a value will not enable approve/reject controls.
