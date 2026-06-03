# Plan: Customer go-live handoff

Status: **planned** (not started). Last updated 2026-06-03.

The final step of the new-client process: once the customer's databases are
registered and their **companies are showing data**, hand the app off to the
customer — give their RapidReconciler administrator the app URL and a way to log
in and start configuring. Today this step is promised in the docs
(`GSIRRTech/tech-client-management.html`: "customer go-live handoff with login URL
and initial credentials") but **not implemented**.

---

## Why this is more than a relabel

The current admin login is **synthetic and undeliverable**:
`ClientReadinessService.deriveAdminEmail` builds `RRAdmin@<contact1-domain>` and the
temp password goes into the install bundle's `RR-FIRST-LOGIN.txt`. That works for an
install-time, IT-hands-it-over flow — but it can't be the entry point for an emailed
"here's your URL + a way to log in" handoff, because nobody receives mail at
`RRAdmin@customerdomain.com`.

So the entry-point login must be a **real, deliverable email** — the human who will
administer the app. That makes the welcome email and the set-password link actually
work, and that person becomes the seeded **Administrator-role** user (the role model
shipped in Valc #70 / UI #183).

---

## Design

### Identity: split the two contacts by job
- **Contact 1 = install / IT coordination** (unchanged: derives nothing now, still
  receives the prep doc + install-bundle emails — the person GSI runs the install with).
- **Contact 2 → relabel "RR Administrator"** = the human who owns/configures the app.
  Becomes the seeded Administrator-role user and the welcome-email target. It is
  **optional at client creation but required at handoff**.

### Login + password
- `deriveAdminEmail` changes from "synthesize `RRAdmin@<domain>` from Contact 1" to
  "use Contact 2's literal email as the login."
- Hand off the password via the **existing reset-link flow** (`login.html?resetKey=…`,
  Valc #66), not a plaintext temp password. The welcome email carries a
  set-your-password link, so no stale credential sits in an inbox and nothing has to
  be copied out of a bundle file.
- **Decouple from the install bundle:** if the app login moves to Contact 2 +
  reset-link, the bundle's `RR-FIRST-LOGIN.txt` must stop minting a competing
  app-admin credential (avoid two logins).

### Readiness gate: "companies showing data"
Add a check to the Install Progress panel that turns green when the client's Services
jar returns F0010 companies **with data** (reuse the `companies-with-unlicensed`
proxy — non-empty companies set). This is the trigger the owner described; it gates
the handoff action.

### The handoff action ("Send go-live" / "Hand off")
A button (enabled only when the companies-ready check is green) that:
1. Seeds — or confirms — the RR Administrator user (Contact 2 email, Administrator
   role, ALL-scope assignments on the client's databases). `seedDefaultAdmin` already
   assigns the Administrator role (Valc #70); point it at Contact 2.
2. Sends the **welcome email** to Contact 2: the **app URL** (the client's `domainUrl`)
   + a set-password reset link + a pointer to the customer KB / support.
3. (Optional) records a `handed_off_at` timestamp so the Clients grid can show a
   "Live" state distinct from "installed."

---

## Implementation phases

1. **Relabel + seed-source.** Contact 2 → "RR Administrator" in the Add Client modal,
   Client Details tab, Install Progress contacts editor, and `admin-users.html`
   contacts band. `deriveAdminEmail` → use Contact 2 verbatim; move/validate the
   requirement to the handoff step (not client creation).
2. **Companies-ready check.** Add the Install Progress check (Services jar returns
   companies with data).
3. **Handoff action + welcome email.** The button + the `EmailService` template (URL +
   reset link). Behind the existing stubbed `EmailService` until SMTP lands — verify
   via `email_audit` in dev.
4. **Decouple bundle creds.** Stop the install bundle from minting the app-admin login
   once the handoff owns it.
5. **Docs.** `rr-installation-prep.html`: collect "RR Administrator (name + email)" as
   a distinct field feeding Contact 2. Add the go-live step to
   `tech-client-management.html`; touch `rr-provisioning.html` / `using-valc.html` as
   needed. Sweep the VALC sidebar docs per the workspace rule.

---

## Dependencies / blockers

- **Email delivery is stubbed** (blocked on IT SMTP for `rrsupport@getgsi.com`). The
  handoff email lands in `email_audit` until creds land; the mechanism works,
  delivery doesn't yet. This plan can be built and dev-verified against `email_audit`
  now; real delivery flips on with the existing `valc.mail.enabled` work.
- **App URL / prod serving model** — the welcome link needs the prod deploy knobs
  already queued (`valc.app.base-url`, `login.html` served on the app server,
  CORS origin). Confirm V8 is served same-origin on the customer's `domainUrl`.

## Open questions

- Do we keep a generic `RRAdmin@<domain>` shared account as an option, or is the
  named RR Administrator (Contact 2) the only entry point? (Leaning: named only —
  one identity, deliverable.)
- Do we capture the RR Administrator's **name** (for the seeded user's display name
  and the welcome greeting), or just the email? (Leaning: add a name field on the
  prep doc + Client Details.)
- Should "handed off / Live" be a real client state (with a grid pill), or is the
  welcome email enough?
