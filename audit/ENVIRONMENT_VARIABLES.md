# Environment variables

## Browser build

| Variable | Purpose | Secret? |
|---|---|---|
| `VITE_SUPABASE_URL` | Supabase project URL | No |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key used with RLS | No |
| `VITE_DASHBOARD_REFRESH_INTERVAL_MS` | Optional dashboard polling interval | No |

Use `.env.local` copied from `ui/competitor-changelog-scout-main/.env.example`. The example contains placeholders only.

## Supabase Edge Function secrets

| Secret | Purpose |
|---|---|
| `GROQ_API_KEY` | Groq Qwen API access for insights and scan classification |
| `GEMINI_API_KEY` | Optional Google Gemini fallback for scan classification |
| `SCOUT_CRON_SECRET` | Shared secret checked by scheduled scan and verification functions |
| `SCOUT_ALLOWED_HOSTS` | Exact comma-separated HTTPS host allowlist for source fetching |
| `DEMO_REVIEWER_EMAIL` | Email of the one authorized reviewer account |
| `DEMO_REVIEWER_USER_ID` | UUID of that Supabase Auth user |
| `SUPABASE_URL` | Supabase project URL (provided to deployed functions) |
| `SUPABASE_ANON_KEY` | Key used for public approved-evidence reads and Auth validation |
| `SUPABASE_SERVICE_ROLE_KEY` | Function-only database writes that bypass RLS |

Supabase-managed secrets should not be duplicated unless the deployed function runtime does not provide them. Never use a service key, Groq key, cron secret, or reviewer credential in a `VITE_` variable. Obsolete AI gateway, cron, and migration URL variables have been removed from active configuration.
