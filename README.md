# Competitor-Changelog-Scout


# Live Dashboard / Demo: [competitor-changelog-scout.lovable.app](https://competitor-changelog-scout.lovable.app/)

An AI Agent built for product teams to automate competitor intelligence. Instead of manually reading competitor blogs and release notes, our agent scrapes updates, classifies them using AI, and presents them in a unified weekly digest for human approval.

## 🚀 Key Features

- **Automated Scraping:** Regularly fetches data from competitor changelogs and marketing pages.
- **AI Classification:** Intelligently categorizes updates into Shipped, Announced, Renamed (mapped back to canonical features), or Uncertain (handling 404s safely without assuming a feature was removed).
- **Human-in-the-Loop (Decision Gate):** Pauses for human review. Managers can approve or reject the AI's classifications, viewing the exact AI reasoning trace and confidence score before committing data.
- **Test Case Compliance:** Built-in verification matrix explicitly proving the 4 mandatory hackathon test scenarios (TC1 - TC4).

## 🛠️ Tech Stack

- **Frontend UI:** Built with React, Tailwind CSS, and shadcn/ui (Generated via Lovable).
- **Workflow Orchestration:** n8n (handles scraping, AI routing, and database writing).
- **Database:** Supabase (PostgreSQL) for robust state management, idempotent writes, and tracking weekly diffs.
- **AI Engine:** Groq (Qwen3 32B) for extraction and classification, with Google Gemini as the fallback model.

## Architecture

Mock/real changelog pages → **n8n** (fetch → clean → AI extract and classify → safety rules → save) → **Supabase** (entries, runs, test_results) → **Lovable dashboard** (human approval) → **n8n verification** (re-reads and checks stored decisions).

The n8n workflow is in [`n8n/competitor-changelog-scout.json`](n8n/competitor-changelog-scout.json). It has three parts:

1. **Scout chain** (runs every 12 hours or manually): reads competitors and features from Supabase, fetches each page and records the HTTP status, asks the LLM to extract entries and map them to tracked features, applies rule checks in code, saves entries as *pending*, writes the test results, and saves a weekly digest with a diff against the previously approved entries.
2. **Verification chain**: finds rows that a human has approved or rejected, checks the stored state against the proposal and the evidence, and writes `verify_status` (`match` or `mismatch`).
3. **Approval webhook chain** (optional alternative): lets a client approve through an n8n link instead of writing to the database directly. The dashboard currently writes decisions to Supabase itself.

## Decision rules

- A changelog entry that says the feature is available is **shipped**. A blog or marketing post, or wording like "coming soon" or "waitlist", is **announced**.
- A name that matches a tracked feature or one of its aliases is mapped to the **existing** row (renames are not added as new features).
- Anything unclear, undated or low-confidence is **uncertain**, with the reason stored.
- A failed fetch (404, 410 or empty page) is recorded as **uncertain**, never "feature removed". This is decided by a deterministic check before the model is ever called.
- Code enforces the rules after the model: a blog source can never be shipped, a missing date means uncertain, and a status outside the allowed set becomes uncertain.
- Every row stores its source URL, retrieval time, date, confidence and a one-line reason.
- Nothing is approved automatically. Rows start as `pending`, and writes use an idempotency key (`competitor|feature|status|date`) so retries cannot create duplicates.

## Test cases

| Case | Scenario | Result |
|---|---|---|
| TC1 | New feature in changelog | shipped, dated 2026-10-20, with source link |
| TC2 | Feature in marketing post only | announced, not shipped |
| TC3 | Feature renamed | mapped to the existing feature (`feat_ai_reply`) via alias, rename noted in the reason |
| TC4 | Changelog page removed | uncertain, never "removed" (a missing page returns HTTP 404 and is stored as uncertain) |

Actual results and evidence for each run are stored in the `test_results` table and shown in the dashboard's Test Compliance view.

## How to run it

1. Create a Supabase project and run `schema.sql`. It defines the database fields, review status, dashboard view, access policies, and demo seed data used by both the dashboard and workflow.
2. Import `n8n/competitor-changelog-scout.json` into n8n and attach your own credentials: Postgres (Supabase session pooler), Groq and Gemini.
3. Run the workflow manually, review the pending rows in the dashboard, then approve or reject. The verification chain then marks each decision `match` or `mismatch`.

## Repository layout

- `n8n/`: the exported workflow
- `ui/`: the Lovable dashboard
- `schema.sql`: database schema and seed data
- `tc1-new.html` … `tc4-missing.html`, `index.html`: mock competitor pages (served by GitHub Pages) used to demonstrate the four test cases on demand

## Known limitations

- Pages are fetched with plain HTTP, so JavaScript-rendered changelogs need a headless-browser step (not included).
- The weekly schedule only runs while the n8n instance is running.
