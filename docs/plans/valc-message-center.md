# VALC Message Center (replaces the Mailing List page)

**Status:** Planned — not started. **Created:** 2026-06-23.
**Owner decision:** build it; convert the VALC *Mailing List* page into a
*Message Center* whose messages render on the V8 **Home** landing page after
login.

---

## Why

Email is the wrong primary channel for operational announcements to people who
log into V8: it gets filtered/ignored, and our send path is still **stubbed in
dev** (blocked on SMTP + a prod app URL). An in-app message center:

- lives entirely inside the VALC ↔ V8 stack we already control (ships without
  waiting on mail infrastructure),
- fits the exit-strategy goal — a junior posts a notice in VALC; it appears
  in-app, nothing to debug,
- gives **proof of receipt** (who dismissed it) — email can't.

## Scope — complements email, does NOT replace it wholesale

An in-app message only reaches someone who **can and does log in**. These stay
**email** (the recipient has no usable session):

- **Go-live handoff** — seed RR Administrator + 7-day set-password link
  (`project_go_live_handoff_shipped`).
- **Password reset** links (the user is locked out by definition).
- **License-expiry / account-disabled** notices (login may be the broken thing).

The Message Center **replaces broadcast/operational announcements to existing
V8 users**. Keep the transactional/auth emails on the email path; keep
`email_audit` and the `JavaMailSender` path intact.

---

## Recipient list (owner requirements — apply verbatim)

The current page lists recipients as flat rows. The Message Center recipient
picker must:

1. **Exclude inactive clients** entirely from the list.
2. **Group by active client, collapsible** — collapsed by default; expand a
   client to see its individual users.
3. **Dedupe email addresses** — an address that appears under more than one
   client shows once.
4. **One message per user, not per row** — a user who appears in multiple rows
   / under multiple clients receives the message **once**. Resolution is by
   identity (V8 `user_id`), not by row.

Targets are **V8 users only** (client *contacts* don't log into V8, so they
can't see an in-app message — they remain an email-only audience if a broadcast
to them is ever needed). Selection granularity: **all**, **by client** (= all
active users of that client), or **individual users**. The resolved recipient
set is the **deduped union of `user_id`s**.

---

## UX

### VALC — Message Center page (was Mailing List)

- **Compose:** subject/body (plain text + an optional single link field — no
  free HTML), **severity** (info / warning / critical), **expiry date**
  (default +30 days), and the recipient picker above.
- **Live readout:** per message, **"seen by X of N"** (dismissed / targeted) —
  the satisfying confirmation email never gave us.
- **List of posted messages** with status (active / expired), edit/expire-now.

### V8 — Home message region (`RRV8/home.html`)

- A **dismissible card stack** at the **top of Home, above the role lanes**.
  Generalizes the existing what's-new mechanism (`rrv8.wnSeen`).
- **Overlap = the stack:** multiple active messages = multiple cards, each with
  its own ✕.
- **Severity drives prominence:** critical = banner; warning/info = card.
- **Dismiss is server-side** (see below), so it sticks across devices.

---

## Data model (VALC / Postgres)

```
messages
  id            BIGSERIAL PK
  author        TEXT            -- VALC operator who posted
  subject       TEXT
  body          TEXT            -- plain text; rendered ESCAPED
  link_url      TEXT NULL
  severity      TEXT            -- 'info' | 'warning' | 'critical'
  target_kind   TEXT            -- 'ALL' | 'CLIENT' | 'USER'
  starts_at     TIMESTAMPTZ
  expires_at    TIMESTAMPTZ
  created_at / updated_at

message_targets            -- only for CLIENT / USER kinds
  message_id   BIGINT FK
  client_id    BIGINT NULL
  user_id      BIGINT NULL

message_dismissals
  message_id   BIGINT FK
  user_id      BIGINT FK
  dismissed_at TIMESTAMPTZ
  PRIMARY KEY (message_id, user_id)
```

Recipient resolution (server): expand targets → join to **active** clients →
collect `user_id`s (V8 users) → **DISTINCT**. That single query enforces
requirements 1 and 4; the picker enforces 2 and 3 in the UI.

## Endpoints

- `POST /api/v1/admin/messages` — publish (operator).
- `GET  /api/v1/admin/messages` — list + per-message "seen by X/N".
- `PUT  /api/v1/admin/messages/{id}` — edit / expire-now.
- `GET  /api/v1/messages` — **active, targeted-at-me, not-yet-dismissed**, for
  the logged-in V8 user (bearer token → user identity; server filters so no
  cross-customer leak).
- `POST /api/v1/messages/{id}/dismiss` — per-user dismissal.

## Security / correctness

- **Escape the body on render** (junior-authored content inside the app = XSS
  surface). Plain text + the one optional link.
- `GET /api/v1/messages` filters strictly to the caller's `user_id` — never
  return another customer's messages.
- Dismissal is per-`(user, message)`; one card per user regardless of how many
  targets resolved to them.

## Phasing

1. Schema + publish/list/dismiss endpoints + recipient resolution (dedup +
   active-only).
2. VALC Message Center page (compose + collapsible recipient picker + seen-by).
3. V8 Home message region (fetch, render escaped by severity, dismiss).
4. Decommission the email *announcement* path; keep transactional emails.

## Open questions

- Acknowledge-required messages (must click "I've read this") vs plain
  dismissible — defer unless a use case needs it.
- Edit-after-publish semantics: does an edit re-surface a message a user already
  dismissed? Default **no** (dismissal sticks); "re-notify" is a deliberate new
  message.
