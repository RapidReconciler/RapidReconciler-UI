# Plan: Practice go-live walkthrough — "see what your customer sees"

Status: **planned** (decision locked 2026-06-03; not started). The first thing to
tackle next session. Relates to memory `project_practice_flows_per_process` and
`project_go_live_handoff_shipped`.

## Goal
Extend the **"Practice Creating a New Client"** sandbox flow with a final step that
takes the new hire through the **go-live handoff** and then lets them **experience
the post-handoff RapidReconciler-administrator view exactly as the customer does** —
using the real shipped surfaces, not a mockup.

**Decision locked: live walkthrough** (reuse the real handoff + login + admin-users
surfaces), not an embedded mockup. The screens already exist (go-live handoff + V8
New User + first-run landing shipped 2026-06-03), so live is higher-fidelity *and*
less to maintain than a mock.

## The new step (what the hire experiences)
Add **Step 6 — "Go live & see what your customer sees"** to the practice drawer,
after "Databases":

1. **Simulate company data.** A practice-only action makes the
   `valc.companies_have_data` check go green (the practice client has no live agent
   loading F0010). Mirrors the existing *Simulate heartbeat* so the hire watches the
   readiness gate turn green like a real go-live — not a silent bypass.
2. **Hand off (practice).** The real **Hand off to customer** action runs against the
   practice client: seeds the practice RR Administrator (**Sofia Bianchi /
   `sofia.bianchi@mauromfg.example.com`**, already the practice Contact 2), mints the
   7-day set-password token, writes the welcome email (STUBBED → `email_audit`),
   stamps `handed_off_at`. The client shows the **Live** pill.
3. **"Here's the email your customer receives."** Inline panel renders the *actual*
   welcome email body from `email_audit` (real artifact, zero mocking).
4. **"Open your customer's first sign-in."** Button opens
   `login.html?resetKey=<practice token>` in a new tab. The hire **sets a password
   and lands as Sofia** on Administrator → Users — seeing the first-run getting-started
   checklist + the New User modal exactly as the customer's admin does. Caption frames
   the persona switch ("you're now seeing the app as the customer's administrator").
5. **Reset** wipes Sofia, her token, and `handed_off_at` so the flow runs clean again
   (reset already clears these — verify the token clear is covered).

## Implementation pieces
- **Practice companies-data simulate** (`PracticeClientService` + a
  `POST /api/v1/admin/clients/{id}/simulate-companies` endpoint, gated `is_practice`).
  The `valc.companies_have_data` check (in `InstallChecksController`) must honor it for
  the practice client — e.g. a transient flag / sentinel the check reads, since there's
  no real Services jar to probe. Decide: a DB column, an in-memory set, or have the
  practice client's check treat "simulated heartbeat present" as data-ready.
- **Surface the practice reset token.** The handoff already mints it; return it (or the
  full link) from the handoff response **for practice clients only** so the drawer's
  "open first sign-in" button can deep-link it. (Don't expose tokens for real clients.)
- **Read endpoint for the welcome email** — e.g.
  `GET /api/v1/admin/clients/{id}/last-welcome-email` (or reuse an email_audit read)
  returning subject + body for the inline panel. Practice-gated or admin-only.
- **Drawer UI** (`dashboard.html`, the "Practice Creating a New Client" `.ref-drawer`):
  add Step 6 with the simulate-companies button, the hand-off button, the welcome-email
  panel, and the "open first sign-in" button + persona caption. The practice flow's
  existing standalone drawer script (bottom of `dashboard.html`) is where the wiring
  goes.
- **Reset coverage** (`PracticeClientService.resetPractice`): confirm it deletes Sofia
  (by Contact 2 email — already does), her reset tokens, her UDP rows, clears
  `handed_off_at` (already added), and any companies-data simulate flag.

## Notes / gotchas
- Practice client is already `uiVersion='v8'` and Sofia is the baseline Contact 2 —
  no baseline changes needed beyond the simulate flag.
- Sofia needs a database assignment for V8 admin-users to have `RR_SESSION.dbs`; the
  hire registers a practice DB in Step 4, and the handoff seed assigns the admin to the
  client's active DBs — so the order (register DB → hand off) matters. Surface that in
  the step copy.
- Email is STUBBED in dev — fine here, since the walkthrough *reads* the body from
  `email_audit` rather than relying on real delivery. (Real send still blocked on SMTP,
  but the practice walkthrough doesn't need it.)
- The hire ends up logged in as Sofia (viewMode=customer) in the new tab, separate from
  their GSI dashboard session — that's intended and instructive.
