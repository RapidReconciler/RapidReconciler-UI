# Plan: Reminders → server-recorded activity events (retire the localStorage scatter)

**Status:** proposed 2026-06-28. Owner picked the server-authoritative approach
over a log-only bolt-on. Phase 0 (searchable/filterable Activity Log) already
shipped; the rest is sequenced below. Cross-repo: **RapidReconciler-Agent**
(endpoint + persistence) + **RapidReconciler-AI** (UI wiring).

## Why

Two problems, one fix:
1. **Reminders aren't auditable.** "Who acknowledged the team review / AI
   settings / refresh schedule, and when" should be visible — the owner's CEO
   mental model ([[project_home_role_lanes]]): Set Context is the authority,
   they want a reportable status. Acknowledgements belong in the Activity Log.
2. **Reminders scatter.** Today they're **client localStorage**
   (`rrv8.aiReview.<db>`, `rrv8.scheduleReview.<db>`, `rrv8.cardexReloadSnooze.<db>`,
   `rrv8.complexPwReview.<db>`, `rrv8.licenseSnooze.<db>`, `rrv8.activityReview.<db>`)
   — per-browser, not synced, and they landed on the wrong DB when context
   drifted (see [[project_home_db_isolation]] and the shared-browser race in
   [[feedback_dont_share_browser]]).

**Recording acknowledgements server-side solves both at once** — and because the
per-DB **agent instance** is the recorder, acks are DB-scoped *structurally*
(no `<db>`-suffixed localStorage key to get wrong). That's the elegant part: the
scatter becomes impossible, not just patched.

## Current state

- **Activity Log** reads the agent's `GET /admin/activity` — server events
  (`{at, event, detail, by}`): report-engine restarts, GL/cardex reloads,
  refreshes. Flat table, now searchable + type-filterable client-side (Phase 0).
- **Reminders** are client localStorage + `RRV8.*ReviewLevel()` helpers that
  compute green/amber for the Home dots. EXCEPT —
- **RR Team review is already server-recorded** — in **VALC**
  (`client_access_reviews`, V57, token-scoped, with the auditor Excel export;
  see [[project_access_review_and_reminders]]). So one ack already lives
  server-side, but in VALC, not the agent's activity store.

## Inventory — what becomes a server ack

| Reminder | Kind | Today | Cadence |
|---|---|---|---|
| AI Assistant settings | periodic review | localStorage | 30/60/Never |
| Activity Log review | periodic review | localStorage | 7/14/30 |
| Refresh schedule confirm | periodic review | localStorage | 30/60/Never |
| Complex-password policy | periodic review | localStorage | (cadence) |
| RR Team review | periodic review | **VALC** (keep authoritative) | 30/60/90 + ack checkbox |
| Reload Cardex snooze | conditional snooze | localStorage | 30 days |
| Purge recommendation snooze | conditional snooze | localStorage | 1/3/6 months |
| License expiry snooze | conditional snooze | localStorage | 10/20/30 days |

## Design — server-authoritative

**Agent (per-DB instance, so acks are inherently DB-scoped):**
- `POST /admin/activity/ack` — body `{ kind, cadenceDays?, never? }`. The agent
  stamps `at` + `by` (from the JWT) + the instance's database, persists the ack
  (latest-per-kind), AND appends a human-readable entry to the activity stream
  (e.g. event "AI settings reviewed", detail "next review in 30 days") so it
  shows in the log for free.
- `GET /admin/acks` — returns `{ kind: { ackedAt, cadenceDays, never } }` so the
  Home dots compute green/amber from server state. (Or fold this into
  `/admin/activity`'s payload.)
- Document both in `RRV8/API.md` and the agent handoff per
  [[feedback_always_spec_new_endpoints]].

**UI (RapidReconciler-AI):**
- Each reminder control POSTs the ack instead of writing localStorage.
- Home dots (`setAiDot`/`setActivityDot`/`setPwPolicyDot`/`loadRefreshSchedule`/
  cardex/purge/license) derive from `GET /admin/acks`, reusing the existing
  `RRV8.*ReviewLevel()` math fed with server values. These reads ride the
  per-DB `loadActiveDbSurfaces()` + `rrFetch` gen-guard already in place
  ([[project_home_db_isolation]]), so they're switch-safe automatically.
- Retire the `rrv8.*Review`/snooze localStorage keys (keep a one-time read as a
  migration fallback, then drop).

**Placement decision (the one real fork):** the activity log reads the *agent*
store, but RR Team review lives in *VALC*. Recommendation: **keep VALC the
system-of-record for team review** (it owns the auditor export) and have the
team-review action ALSO emit an agent activity event so the log is complete —
accept that small duplication rather than merging two backends into the log
reader. Revisit only if a second VALC-side ack appears.

## Sequencing

- **Phase 0 — DONE (2026-06-28):** Activity Log searchable + type-filterable
  (client-side over the loaded window). Server-side `?q=&type=` deferred until
  the log routinely exceeds the fetch window.
- **Phase 1 — Agent:** `POST /admin/activity/ack` + `GET /admin/acks` +
  persistence; document in API.md. (Agent rebuild.)
- **Phase 2 — UI periodic reviews:** wire AI / Activity / Schedule /
  Complex-passwords to POST acks; dots derive from `/admin/acks`; retire their
  localStorage keys.
- **Phase 3 — UI conditional snoozes:** cardex / purge / license snoozes → acks.
- **Phase 4 — Team review:** emit the agent activity event on review so it shows
  in the log; VALC stays authoritative.

## Open questions

- Confirm the placement recommendation (VALC stays team-review SoR + mirror an
  activity event) vs merging both sources in the log reader.
- Conditional snoozes in the log: worth an entry ("Cardex reload snoozed 30
  days") or noise? Leaning worth it — it explains why a Home dot is green.
- Retention/trim: acks share the activity store's cap; confirm the trim policy
  keeps the latest ack per kind even if older events roll off.
