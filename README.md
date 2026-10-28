# Competitor Changelog Scout

**Track competitor updates and review important product changes in one place.**

[Live Demo](https://competitor-changelog-scout.onrender.com) · [GitHub Repository](https://github.com/Darpan01Tech/Competitor-Changelog-Scout)

Competitor Changelog Scout is a dashboard for collecting competitor product updates, summarizing them with AI, and helping users review their possible impact. Instead of checking each website separately, users can review collected updates in one place.

## Live Demo

Try the application: https://competitor-changelog-scout.onrender.com

Open the demo and sign in as a reviewer if access is enabled. Contact the team if you need login details. Please do not enter personal or sensitive information in the shared demo.

## Features

### Competitor update monitoring
- View collected changelog entries in one dashboard.
- Review updates from configured sources.
- Keep findings organized for further analysis.

### AI-assisted insights
- Generate summaries and classifications of collected updates.
- Use Groq with the configured `qwen/qwen3.8-27b` model in AI-powered workflows.
- Treat AI-generated results as suggestions and check important findings against their original sources.

### Review workflow
- Review collected updates in the dashboard.
- The dashboard includes local, session-only sample review controls.
- Persisted reviewer actions are handled through a protected Supabase Edge Function and restricted to an allowlisted authenticated user.

### Source collection and validation
- Fetch content from configured HTTPS sources.
- Use n8n to coordinate source fetching, text normalization, AI extraction and classification, rule checks, and database writes.
- Apply server-side checks and request limits during collection.
- Use an idempotency constraint to help prevent duplicate records.
- Restrict collection to configured hosts using the `SCOUT_ALLOWED_HOSTS` secret.

Only configure mock sources, websites you own, or sources you are authorized to access. Collection depends on source availability and page structure.

## How It Works

1. Configure the source hosts the collector is allowed to access.
2. Fetch and normalize content from those sources.
3. Extract and classify possible updates using the configured AI workflow and rule-based checks.
4. Store unique records in Supabase.
5. Review entries and AI-generated insights in the dashboard.

The repository includes an n8n workflow with a manual trigger and a 12-hour Schedule Trigger. The exported workflow is not proof that scheduled runs are active in production; activation, credentials, and deployment settings must be checked. Supabase scheduling through PostgreSQL `pg_cron` and `pg_net` is also supported in the project configuration, but the active production scheduling path depends on deployment setup.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS |
| Routing | TanStack Router |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Backend logic | Supabase Edge Functions |
| AI provider | Groq |
| Configured AI model | `qwen/qwen3.8-27b` |
| Workflow orchestration | n8n |

## Architecture

### Frontend

The frontend is a React single-page application built with Vite. Its production build is generated in:

`ui/competitor-changelog-scout-main/dist/`

The application uses Supabase for supported backend operations.

### Supabase Edge Functions

The project includes these Edge Functions:

- `insights` — handles AI-powered insight generation.
- `review` — handles protected reviewer writes.
- `scan-competitors` — collects content from configured sources.
- `verify-entries` — handles record verification.

### n8n workflow

The workflow retrieves competitor and tracked-feature data, fetches configured pages, normalizes their text, extracts and classifies entries, applies rule-based checks, and saves records and test results. It can also build a digest by comparing collected entries with previously approved records.

The exported workflow contains a Schedule Trigger configured for a 12-hour interval, but the export alone does not confirm that it is enabled in production. An approval webhook in the exported workflow is disabled and should not be considered an active production endpoint unless it has been enabled and secured.

### Database

The root-level `schema.sql` documents the database schema and seed data. Additional database migrations are kept under the frontend application's Supabase and Drizzle migration directories.

## Security Notes

- Keep backend API keys and service credentials in Supabase secrets or the appropriate deployment environment.
- Use placeholders in documentation rather than real project credentials.
- Frontend variables prefixed with `VITE_` are included in the client-side build. Only publishable values should be used there.
- Never expose Supabase service-role keys or Groq API keys in frontend code or commit them to GitHub.
- Apply appropriate Supabase Row Level Security (RLS) policies.
- Collection is restricted to configured HTTPS hosts and uses request limits and redirect restrictions.

## Run Locally

### Prerequisites

- Node.js and npm
- A Supabase project
- Groq API access for AI-powered functionality
- Supabase CLI for deploying Edge Functions

### 1. Clone the repository

```bash
git clone https://github.com/Darpan01Tech/Competitor-Changelog-Scout.git
cd Competitor-Changelog-Scout
```

### 2. Open the frontend directory

```bash
cd ui/competitor-changelog-scout-main
```

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

Copy the example file:

```bash
cp .env.example .env.local
```

Set the frontend values in `.env.local` using your own Supabase project details:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
VITE_DASHBOARD_REFRESH_INTERVAL_MS=15000
```

Configure backend-only secrets separately in Supabase as required by the deployed functions, including `GROQ_API_KEY` and `SCOUT_ALLOWED_HOSTS`. Do not commit real credentials.

### 5. Start the development server

```bash
npm run dev
```

Open the local URL shown in the terminal.

## Quality Checks

Run these commands from `ui/competitor-changelog-scout-main`:

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

These commands run the project's configured build, type, lint, and test checks.

## Deployment

### Frontend

- **Build command:** `npm run build`
- **Publish directory:** `ui/competitor-changelog-scout-main/dist`

Configure the static host to serve `index.html` as the fallback for application routes.

Live deployment: https://competitor-changelog-scout.onrender.com

### Supabase Edge Functions

From the repository root, deploy the functions using the Supabase CLI and your configured project:

```bash
supabase functions deploy insights
supabase functions deploy review
supabase functions deploy scan-competitors
supabase functions deploy verify-entries
```

Set the required secrets and verify scheduling configuration before enabling automated collection. The frontend deployment alone does not confirm that backend functions or scheduled jobs are configured correctly.

## Repository Structure

```text
Competitor-Changelog-Scout/
├── n8n/
│   └── competitor-changelog-scout.json
├── ui/
│   └── competitor-changelog-scout-main/
│       ├── src/
│       ├── public/
│       ├── supabase/
│       ├── drizzle/
│       ├── .env.example
│       └── package.json
├── schema.sql
├── index.html
├── mock-pages.css
├── tc1-new.html
├── tc2-announced.html
├── tc3-renamed.html
├── tc4-missing.html
├── .gitignore
└── README.md
```

The root-level HTML files and CSS provide mock pages and test fixtures used to exercise source-collection scenarios, including a missing-source case.

## Current Limitations

- Collection can miss updates if a source is unavailable or its page structure changes.
- AI-generated summaries and classifications can be inaccurate and should be reviewed.
- Sample review controls in the dashboard are session-only; persisted reviewer actions use the protected backend workflow.
- Scheduled collection requires the relevant n8n or Supabase scheduler, credentials, and deployment settings to be configured and activated.

## Possible Future Improvements

- Add more configurable competitor sources.
- Improve historical comparisons, filtering, and prioritization.
- Add notifications for significant changes.
- Expand test coverage and operational monitoring.

## Contributing

If you find a bug or have a suggestion, open an issue or pull request in the [GitHub repository](https://github.com/Darpan01Tech/Competitor-Changelog-Scout).

---
**Live Demo:** https://competitor-changelog-scout.onrender.com  
**Repository:** https://github.com/Darpan01Tech/Competitor-Changelog-Scout
