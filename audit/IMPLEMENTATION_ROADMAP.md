# Implementation Roadmap

Effort assumes one experienced full-stack engineer; ranges exclude account provisioning and external review.

## P0 — Establish a working, reproducible baseline

### 1. Repair database source of truth — 0.5–1 day

- **Files:** `schema.sql`, `ui/competitor-changelog-scout-main/drizzle/migrations/*`, README.
- **Dependencies:** none.
- **Acceptance:** Empty-database schema application succeeds; no stale `approved` references remain; n8n can insert entries; dashboard can query the digest view and review a pending row; migration and setup instructions yield the same schema.

### 2. Verify the end-to-end demo against deterministic fixtures — 1–2 days

- **Files:** `n8n/competitor-changelog-scout.json`, `tc1-new.html` through `tc4-missing.html`, `schema.sql`, `audit/TEST_PLAN.md`.
- **Dependencies:** Task 1, disposable Supabase DB, n8n, valid test credentials.
- **Acceptance:** TC1–TC3 assertions pass; TC4 receives an actual HTTP 404 and records uncertain; repeat checks do not duplicate records; failed fetch is distinct from empty content; actual evidence and timestamps persist; no seed claims execution.

### 3. Restrict public writes and choose demo access model — 1–3 days

- **Files:** `schema.sql`, migrations, `src/routes/index.tsx`, auth middleware or new server routes.
- **Dependencies:** Product decision whether shared public review is acceptable.
- **Acceptance:** Unauthorized callers cannot alter decisions; authenticated reviewer identity is derived from a verified session; RLS tests demonstrate only authorized rows/operations; public dataset is intentionally approved for disclosure or access is restricted.

### 4. Add fetch destination security controls — 1–2 days

- **Files:** n8n workflow and deployment/network configuration.
- **Dependencies:** Task 2; decide source policy (allowlist preferred for this MVP).
- **Acceptance:** Reject non-HTTP(S), localhost, private, reserved, link-local, metadata, and IPv4-mapped IPv6 targets; resolve and validate at connection time; every redirect is revalidated; DNS rebinding is mitigated; response size, duration, and redirect count are bounded; tests cover hostile URLs and redirects; host egress policy blocks internal ranges.

## P1 — Secure and operate the public demo

### 5. Gate AI insights and cap spend — 0.5–1.5 days

- **Files:** `src/routes/api/insights.ts`, `src/lib/ai/insights.server.ts`, gateway/provider settings.
- **Dependencies:** Task 3 for authenticated access, or an explicit public demo quota.
- **Acceptance:** Unauthorized/high-rate requests are rejected; row/token and concurrency bounds are enforced; provider usage cap/alert is configured; errors reveal no secrets; malformed and unavailable provider paths show a useful non-AI dashboard.

### 6. Harden model input and validate output — 1–2 days

- **Files:** n8n extraction/classification nodes, `src/lib/ai/insights.server.ts`.
- **Dependencies:** Task 2.
- **Acceptance:** Hostile page text cannot override instructions; structured output is schema-validated; deterministic constraints are tested; summaries cite source IDs/URLs and distinguish missing evidence from inference; malformed/rate-limit/provider-outage cases do not corrupt persisted state.

### 7. Make status and history truthful — 0.5–1 day

- **Files:** `src/routes/index.tsx`, `schema.sql`, workflow.
- **Dependencies:** reliable run records from Task 2.
- **Acceptance:** “Live” is driven by recent successful workflow heartbeat; last scan is distinct from last entry update; stale/failing state is shown; run history links to evidence; test compliance shows NOT RUN separately from failed.

### 8. Reproducible build and operations docs — 0.5–1 day

- **Files:** UI package manifests, `.gitignore`, `.env.example`, README, CI workflow.
- **Dependencies:** Tasks 1–2.
- **Acceptance:** One package manager and lockfile; clean install/build/test/lint succeed in CI; `.env` is ignored and placeholders documented; migration, start, health, backup, and rollback instructions work from a fresh clone.

## P2 — Improve collection quality and UX

### 9. Improve change quality and source support — 2–5 days

- **Files:** workflow collector, DB schema, dashboard.
- **Dependencies:** stable MVP.
- **Acceptance:** Support a clearly scoped feed or canonical changelog URL; store normalized evidence/snapshot hash; distinguish unchanged/updated/new idempotently; handle timeouts, redirects, errors, size limits and retryable failures; disclose that JavaScript-rendered sites are unsupported unless browser rendering is implemented.

### 10. Add competitor management and accessible review — 1–3 days

- **Files:** dashboard routes/components and secure backend endpoints.
- **Dependencies:** Task 3 and SSRF controls.
- **Acceptance:** Authorized user can add/view/edit/remove competitor; duplicate/invalid/unsupported URLs receive clear feedback; keyboard/focus labels and mobile layout work; empty, loading, success, partial and error states are covered.

## P3 — Optional differentiation

### 11. Evidence-backed weekly intelligence view — 1–2 days

- **Files:** dashboard digest/history components and AI insights.
- **Dependencies:** trustworthy entries, sources, review, and history.
- **Acceptance:** Highlight only verified changes, show dates/source excerpt and linked page, group announced versus shipped, and label AI inference. Keep manual source review as fallback.

Do not add Redis, Kubernetes, microservices, or a browser crawler until usage and source requirements justify them.
