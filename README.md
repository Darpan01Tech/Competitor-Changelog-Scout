# Competitor Changelog Scout

**Track competitor updates. Discover product changes. Turn changelogs into actionable insights.**

[Live Demo](https://competitor-changelog-scout.onrender.com) · [GitHub Repository](https://github.com/Darpan01Tech/Competitor-Changelog-Scout)

Competitor Changelog Scout is an AI-assisted competitive intelligence dashboard designed to help teams monitor competitor product updates, analyze changelogs, and identify meaningful changes in the competitive landscape.

Instead of manually checking multiple competitor websites and product update pages, the platform provides a centralized dashboard for reviewing collected updates, understanding their potential impact, and organizing findings for further analysis.

The project combines a React-based dashboard, Supabase backend services, automated source collection, and AI-powered insights into a single application.

## Live Demo

**Try the application:** https://competitor-changelog-scout.onrender.com

### Demo Login Credentials

Use the following credentials to explore the application:

- **Email:** `darpantusharkotak@gmail.com`
- **Password:** `Dkotak`

Alternatively, if your deployed authentication setup supports the reviewer account, use the reviewer sign-in option with the credentials provided for that account.

*Note: These are demonstration credentials intended for evaluation. Please avoid using them for personal or sensitive information.*

## Key Features

### 1. Centralized Competitor Monitoring
- Track competitor changelog entries in one dashboard.
- Review product updates and changes collected from configured sources.
- Reduce the need for repetitive manual research.
- Organize competitor intelligence for easier review.

### 2. AI-Powered Insights
- Use AI to help interpret collected changelog entries.
- Generate concise summaries and insights from product changes.
- Support competitive analysis by highlighting potentially important updates.
- Use Groq with the configured `qwen/qwen3.8-27b` model for AI-powered workflows.

The project also has a Google Gemini model configured as an additional AI option. Its fallback behavior depends on the active workflow configuration.

AI-generated insights are intended to support human analysis rather than replace independent verification or business judgment.

### 3. Review Workflow
- Review collected competitor updates.
- Use the dashboard's local, session-only sample review controls.
- Support protected, persisted reviewer actions through a dedicated Supabase Edge Function.
- Restrict persisted review writes to an allowlisted authenticated user.

### 4. Automated Source Scanning
- Collect updates from explicitly configured HTTPS sources.
- Use the project's n8n workflow to orchestrate source fetching, content normalization, AI extraction and classification, rule enforcement, and database writes.
- The exported n8n workflow includes a Schedule Trigger configured for a 12-hour interval and a manual trigger for testing.
- The Supabase backend also supports scheduled Edge Function invocation through PostgreSQL `pg_cron` and `pg_net`. The active scheduling path depends on the deployment configuration.
- Prevent duplicate persisted results through an idempotency constraint.

### 5. Backend Verification
- Use a dedicated verification Edge Function to check collected records.
- Apply server-side validation and request limits during source collection.
- Restrict collection to configured hosts through the `SCOUT_ALLOWED_HOSTS` secret.
- Avoid automatically following redirects when fetching configured sources.

**Important:** Collection is limited to explicitly configured hosts. Configure only mock, owned, or otherwise authorized competitor sources that you intend to scan.

## How It Works

The application follows a straightforward workflow:

1. **Configure sources:** Specify the competitor hosts that the collector is permitted to access.
2. **Collect updates:** The backend fetches permitted sources and processes their content.
3. **Persist records:** Unique results are stored in Supabase.
4. **Generate insights:** AI-powered workflows analyze relevant changelog information.
5. **Review findings:** Users explore updates, examine insights, and use the review workflow.
6. **Automate collection:** The project includes an n8n workflow with a configured 12-hour Schedule Trigger. Supabase also supports scheduled Edge Function invocation through `pg_cron` and `pg_net`; the active production path depends on deployment configuration.

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | React 19 |
| Build Tool | Vite |
| Styling | Tailwind CSS |
| Routing | TanStack Router |
| Database | Supabase PostgreSQL |
| Authentication | Supabase Auth |
| Backend Logic | Supabase Edge Functions |
| AI Provider | Groq |
| Primary AI Model | `qwen/qwen3.8-27b` |
| Additional Configured AI Model | Google Gemini |
| Workflow Orchestration | n8n |
| Scheduled Automation | n8n Schedule Trigger (12-hour interval in the exported workflow); Supabase PostgreSQL `pg_cron` and `pg_net` are also supported for Edge Function scheduling |

## Architecture

### Frontend
The frontend is a React single-page application built with Vite. Its production build generates static assets in:

`ui/competitor-changelog-scout-main/dist/`

The static application communicates with Supabase for supported backend operations.

### Backend
Supabase provides the database, authentication, row-level security policies, and server-side processing.

The project includes four Edge Functions:

- **`insights`** — Handles AI-powered insight generation.
- **`review`** — Handles protected reviewer writes.
- **`scan-competitors`** — Collects information from configured competitor sources.
- **`verify-entries`** — Handles record verification.

### Workflow Orchestration and Scheduling

The project includes an n8n workflow for source collection and processing. The exported workflow contains a manual trigger for on-demand runs and a Schedule Trigger configured for a 12-hour interval.

The workflow retrieves competitor and tracked-feature data from PostgreSQL, fetches configured pages, normalizes their text, uses an AI chain with structured output to extract and classify entries, applies rule-based checks, and saves entries and test results to the database. It also builds a digest by comparing collected entries with previously approved records.

The Supabase backend separately supports scheduling through PostgreSQL `pg_cron` and `pg_net` to invoke Edge Functions. The exported workflow confirms that n8n is configured, but does not by itself confirm that it is currently active in production. Confirm which scheduler is enabled in the deployed environment and avoid overlapping schedules unless intentional.

The exported workflow also contains an approval webhook marked as disabled. Do not describe this webhook as an active production approval endpoint unless it has been enabled and secured.

### Database
The database schema and seed data are documented in `schema.sql`. Scheduling-related database changes are maintained through additive Supabase migrations.

Production database changes should be reviewed carefully before applying them.

## Security Considerations

Security is an important part of the application's design.

- Store backend API keys and service credentials in Supabase secrets or the appropriate deployment environment.
- Use `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for frontend configuration.
- Never expose Supabase service-role keys, Groq API keys, or Gemini API keys in frontend code.
- Apply appropriate Supabase Row Level Security (RLS) policies to database operations.
- Restrict persisted reviewer writes to the intended authenticated users.
- Allow the collector to access only explicitly configured HTTPS hosts.
- Use request timeouts, response-size limits, and redirect restrictions during collection.

Frontend environment variables prefixed with `VITE_` are exposed to client-side code after the application is built. Only publishable values should be placed there.

The demo account is for evaluation only. Do not store private or sensitive data in a shared demo environment.

## Getting Started Locally

### Prerequisites

- Node.js and npm
- A Supabase project
- Groq API access for AI-powered functionality
- Google Gemini API access if the optional fallback is required
- Supabase CLI for backend deployment

### 1. Clone the Repository

```bash
git clone https://github.com/Darpan01Tech/Competitor-Changelog-Scout.git
cd Competitor-Changelog-Scout
```

### 2. Navigate to the Frontend

```bash
cd ui/competitor-changelog-scout-main
```

### 3. Install Dependencies

```bash
npm install
```

### 4. Configure Environment Variables

Create your local environment file:

```bash
cp .env.example .env.local
```

Configure the frontend variables in `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
VITE_DASHBOARD_REFRESH_INTERVAL_MS=15000
```

Configure backend-only credentials separately using Supabase secrets. Depending on the enabled functionality, these may include:

- `GROQ_API_KEY`
- `GEMINI_API_KEY` (optional fallback)
- `SCOUT_ALLOWED_HOSTS`
- Any additional secrets documented in `audit/DEPLOYMENT_GUIDE.md`

Do not commit real API keys or private credentials to GitHub.

### 5. Start the Development Server

```bash
npm run dev
```

Open the local URL printed by Vite in your terminal.

## Quality Checks

Run the following commands from the frontend directory:

```bash
npm run build
npm run typecheck
npm run lint
npm test
```

These commands build the frontend and run the configured type, lint, and test checks.

## Deployment

### Frontend Deployment

The production frontend can be deployed as a static site.

- **Build directory:** `ui/competitor-changelog-scout-main`
- **Build command:** `npm run build`
- **Publish directory:** `ui/competitor-changelog-scout-main/dist`

Configure the static host to serve `index.html` as the fallback for application routes that are not physical files.

Live deployment: https://competitor-changelog-scout.onrender.com

### Supabase Backend Deployment

Deploy the Edge Functions from the repository using the Supabase CLI:

```bash
supabase functions deploy insights
supabase functions deploy review
supabase functions deploy scan-competitors
supabase functions deploy verify-entries
```

Configure the required secrets and scheduling settings before enabling automated collection.

For detailed deployment instructions, refer to [`audit/DEPLOYMENT_GUIDE.md`](audit/DEPLOYMENT_GUIDE.md).

## Project Structure

```text
Competitor-Changelog-Scout/
├── audit/
│   └── DEPLOYMENT_GUIDE.md
├── schema.sql
└── ui/
    └── competitor-changelog-scout-main/
        ├── src/
        ├── supabase/
        │   └── migrations/
        ├── public/
        ├── .env.example
        ├── package.json
        └── dist/             # Generated production build
```

The repository also contains the application configuration and supporting files required for development and deployment.

## Current Scope and Limitations

- Source collection depends on the availability and structure of configured websites.
- Only explicitly allowlisted HTTPS hosts can be accessed by the collector.
- AI-generated insights may require human review and verification.
- The dashboard's sample review controls are session-only; persisted review actions use the protected backend workflow.
- Automated collection requires the appropriate n8n workflow activation and credentials and/or the relevant Supabase configuration, secrets, and scheduled jobs, depending on the deployment path.
- A successful frontend deployment alone does not guarantee that every backend function or scheduled workflow is configured correctly.

## Development Approach

This project was developed through hands-on implementation, experimentation, testing, and iterative refinement, with AI-assisted development used where helpful for exploring approaches, troubleshooting issues, and improving implementation quality.

The focus is on building a practical competitive intelligence tool while learning how frontend applications, backend services, AI integrations, authentication, database security, and scheduled automation work together.

## Future Improvements

Potential areas for further development include:

- More configurable competitor source management.
- Historical changelog timelines and change comparisons.
- Improved filtering, search, and prioritization of updates.
- More detailed competitive intelligence reports.
- Notifications for significant competitor changes.
- Expanded test coverage and operational monitoring.

## Contributing

Suggestions, bug reports, and improvements are welcome. Please open an issue or submit a pull request through the GitHub repository.

## License

No license has been specified in this README. Add a `LICENSE` file if you intend to publish the project under a particular open-source license.

---

**Live Demo:** https://competitor-changelog-scout.onrender.com

**Repository:** https://github.com/Darpan01Tech/Competitor-Changelog-Scout
