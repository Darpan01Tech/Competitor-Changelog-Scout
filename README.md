# Competitor-Changelog-Scout


# Demo URL (availability not verified): [competitor-changelog-scout.lovable.app](https://competitor-changelog-scout.lovable.app/)

An AI-assisted competitor-intelligence demo for product teams. The n8n workflow can fetch configured sources, classify updates, and write evidence to Supabase; the exported workflow is inactive by default. The dashboard presents approved updates, a repeatable local review demo, and test execution status.

## 🚀 Key Features

- **Automated Scraping:** Regularly fetches data from competitor changelogs and marketing pages.
- **AI Classification:** Intelligently categorizes updates into Shipped, Announced, Renamed (mapped back to canonical features), or Uncertain (handling 404s safely without assuming a feature was removed).
- **Review Queue:** Shows three stable local demo entries with Accept, Reject, and Reset actions. These choices are session-only and separate from read-only live Supabase records.
- **Test Case Compliance:** Shows execution status. Seeded cases begin as NOT RUN and pass only after workflow assertions execute.

## 🛠️ Tech Stack

- **Frontend UI:** Built with React, Tailwind CSS, and shadcn/ui (Generated via Lovable).
- **Workflow Orchestration:** n8n (handles scraping, AI routing, and database writing).
- **Database:** Supabase (PostgreSQL) for robust state management, idempotent writes, and tracking weekly diffs.
- **AI Engine:** Groq (Qwen3 32B) for extraction and classification, with Google Gemini as the fallback model.

## Architecture

Configured changelog pages → **n8n** (validate demo host → fetch → clean → AI extract and classify → safety rules → save) → **Supabase** (entries, runs, test_results) → **dashboard** (approved digest and read-only live records). Local review samples remain separate from this live data path.

The n8n workflow is in [`n8n/competitor-changelog-scout.json`](n8n/competitor-changelog-scout.json). It has three parts:

1. **Scout chain** (manual or scheduled after an operator activates it): reads competitors and features from Supabase, checks URLs against the demo host allowlist, fetches without following redirects, asks the LLM to extract entries and map them to tracked features, applies rule checks in code, saves entries as *pending*, writes test execution status, and saves a digest.
2. **Verification chain** (15-minute trigger after activation): checks externally decided rows against stored proposals.
3. **Approval webhook chain:** disabled in the exported workflow. The current dashboard demo does not write review decisions to Supabase.

## Dashboard refresh and scan monitoring

The dashboard automatically refreshes the persisted entry list, test compliance rows, and last saved scan digest every 15 seconds. Set `VITE_DASHBOARD_REFRESH_INTERVAL_MS` to a value from 5000 to 300000 (milliseconds) to change that interval; invalid values use 15000. Polling pauses in a background tab. **Refresh dashboard** refetches those same queries and never starts a competitor scan. It reports the last successful dashboard refresh separately from the timestamp of the last saved scan digest. The digest timestamp is evidence that a workflow reached its persistence step; failed n8n executions are not currently persisted in `runs`, so attempted/failed scan time and live workflow health remain unverified.

## Scan schedule

The exported scout schedule is **every 12 hours**. The separate verification schedule is **every 15 minutes**. After importing, an operator can change each Schedule Trigger interval in n8n (hours for scanning, minutes for verification) and must save and activate the workflow deliberately. The export is inactive. Verify an automatic scan by checking a successful n8n execution, its execution ID, and a new `runs` digest with status `waiting_approval`; verify saved entries and test evidence in Supabase and then click **Refresh dashboard**. The dashboard button is not a scan trigger. The workflow has database idempotency keys for exact duplicate entries and upserts test rows by test-case ID, but no global lock prevents overlapping executions.

## Review access

The Decision Gate's **Accept** and **Reject** buttons are a frontend-only hackathon demo. They update local page state, move records into a reviewed list, adjust the pending count, and show a session-only confirmation. They do not call `/api/review` or write to Supabase. Decisions reset on page refresh. Browser database write permissions remain revoked. The earlier authenticated review endpoint and its environment configuration remain in the repository but are not used by these demo buttons.

## Decision rules

- A changelog entry that says the feature is available is **shipped**. A blog or marketing post, or wording like "coming soon" or "waitlist", is **announced**.
- A name that matches a tracked feature or one of its aliases is mapped to the **existing** row (renames are not added as new features).
- Anything unclear, undated or low-confidence is **uncertain**, with the reason stored.
- A failed fetch (404, 410 or empty page) is recorded as **uncertain**, never "feature removed". This is decided by a deterministic check before the model is ever called.
- Code enforces the rules after the model: a blog source can never be shipped, a missing date means uncertain, and a status outside the allowed set becomes uncertain.
- Every row stores its source URL, retrieval time, date, confidence and a one-line reason.
- Rows start as `pending` and writes use an idempotency key (`competitor|feature|status|date`) so retries cannot create exact duplicates. Public review writes are revoked.

## Test cases

| Case | Scenario | Result |
|---|---|---|
| TC1 | New feature in changelog | shipped, dated 2026-10-20, with source link |
| TC2 | Feature in marketing post only | announced, not shipped |
| TC3 | Feature renamed | mapped to the existing feature (`feat_ai_reply`) via alias, rename noted in the reason |
| TC4 | Changelog page removed | NOT RUN until a controlled HTTP 404 URL is configured in the workflow; a normal page is not evidence of a 404 |

These rows describe expected behavior, not recorded results. Fresh setup displays all cases as NOT RUN.

Actual results and evidence are upserted by test-case ID into `test_results` after workflow execution and shown as NOT RUN, PASS, or FAIL in the dashboard. TC4 is NOT RUN by default.

## How to run it

1. For a **fresh database**, create a Supabase project and run `schema.sql`; this is the canonical fresh-install path. It creates the `approval_status` schema, read-only public review access, and NOT RUN test rows. For an existing database created from the Drizzle migration history, back it up and review the unapplied migrations, then set `LOVABLE_DB_MIGRATION_URL` and run `bunx drizzle-kit migrate` from the UI project directory. Migration `0003` drops the legacy approval boolean/view reference, removes only the exact synthetic entry/run fixtures from migration `0000`, restores the digest view, resets test status to NOT RUN while retaining previous text/evidence, and revokes public review updates. Do not apply migrations to production without reviewing the target and backup.
2. Import `n8n/competitor-changelog-scout.json` into n8n and attach your own credentials: Postgres (Supabase session pooler), Groq and Gemini.
3. Open the Decision Gate and click **Accept** or **Reject** on a pending card. The card moves to decision history and the pending count updates. The toast and panel label identify the result as session-only. Refreshing the page resets these choices; no login or additional review configuration is needed for this walkthrough.
4. In n8n, attach credentials, confirm the allowlisted controlled sources, and configure a controlled TC4 URL verified to return a genuine HTTP 404. Execute manually first. Confirm each actual persisted test status and evidence, including HTTP 404 plus uncertain classification for TC4. Configure the 12-hour scan and 15-minute verification triggers as desired, then activate deliberately.

For the UI, from `ui/competitor-changelog-scout-main`, use `bun install --frozen-lockfile`, `bun run test`, `bun run lint`, and `bun run build`. The UI project uses `bun.lock`; there is no root package manifest or npm lockfile for this app.

For the demo: open the dashboard, click **Refresh dashboard**, then use **Decision Gate** → **Accept** or **Reject** and **Reset demo** to replay the three local examples. The demo queue is session-only and does not persist. If backend reads fail, local dashboard/test examples are explicitly labeled and are never presented as live results. Do not claim the refresh triggered collection or that test examples ran. If n8n is configured, show its real execution ID, HTTP evidence, persisted digest and test results. Keep unrun cases marked NOT RUN.

Ask Insights requires the server-side `LOVABLE_API_KEY`. Keep it out of browser `VITE_` variables. Dashboard data requires valid `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` server settings plus `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` for browser requests. When those read requests fail, the dashboard reports the live error and can still demonstrate clearly labeled local examples.

## Repository layout

- `n8n/`: the exported workflow
- `ui/`: the Lovable dashboard
- `schema.sql`: database schema and seed data
- `tc1-new.html` … `tc4-missing.html`, `index.html`: mock competitor pages (served by GitHub Pages) used to demonstrate the four test cases on demand

## Known limitations

- The collector demo allowlist currently permits HTTPS only for `darpan01tech.github.io`; other sources are rejected until the allowlist is deliberately configured.
- Redirects are disabled and the HTTP request has an 8-second timeout. URL checks do not provide DNS-rebinding or network-egress protection, and response bytes are not bounded at the HTTP node; do not treat this as comprehensive SSRF protection.
- JavaScript-rendered changelogs need a headless-browser step (not included). Network-level fetch errors may stop the workflow; run history and schedule behavior still require verification in the target n8n instance.
- Public review is disabled. Dashboard AI insights are protected by per-process best-effort limits, not a distributed quota; set provider-side quotas and budget alerts before public exposure.
