# Hackathon Demo Plan

Current live demo proof is **NOT VERIFIED**. No deployed endpoint, live database, AI provider, or n8n instance was exercised. The exported workflow is inactive, and the public review queue is read-only.

## Demo sequence

1. Open the dashboard and explain the competitor-monitoring problem: distinguish shipped changes from announcements, with source links for evidence.
2. Show persisted entries and test status. Explain that seeded cases begin NOT RUN and do not count as results.
3. Click **Refresh dashboard**. Show the loading state, successful refresh time, and refreshed data. Explain that this fetches Supabase data and never starts a scan. Point to the separate last saved scan digest time.
4. Show the pending queue and source evidence. Explain that approve/reject actions are unavailable because there is no verified reviewer session or tested server-side demo review endpoint.
5. If AI is configured, ask one question and point to supporting evidence. If unavailable, show the error/empty behavior without claiming an answer.
6. If n8n is configured, manually run the controlled workflow and show its real execution ID, HTTP response, persisted rows, and test evidence. Do not claim a scan ran if only the dashboard refreshed.
7. Finish with limitations: workflow inactive until deliberate activation, 12-hour scan/15-minute verification schedules, TC4 unset until a controlled real 404 endpoint is configured, no complete SSRF or response-size protection, and deployment/runtime not verified.

## Verify before presenting live behavior

- Confirm the database uses `schema.sql` for a fresh install or the reviewed Drizzle history through migration `0003` for an existing migration-managed database.
- Confirm Supabase queries work and show the expected persisted records.
- Confirm controlled TC1/TC2/TC3 source fixtures and configure TC4 only after verifying it returns HTTP 404.
- In n8n execution details, inspect the workflow execution ID and fetch status. In Supabase inspect `entries`, `test_results`, and the `runs` digest written with `waiting_approval` status.
- For TC4, require both observed HTTP 404 and an uncertain classification in the saved evidence. A 200, empty body, timeout, missing URL, or connection error is not a TC4 pass.
- Change and activate schedules only deliberately. Confirm a scheduled execution in the target n8n instance before claiming automatic scanning works.

The displayed last dashboard refresh timestamp reports successful persisted-data retrieval. The last saved digest is actual database evidence that the workflow reached its save step; failed/attempted runs are not currently persisted, so neither field proves n8n is healthy now.
