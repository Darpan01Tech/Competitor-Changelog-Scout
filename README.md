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
- **AI Engine:** Gemini / Claude via API.
