# Plan: Customer go-live handoff

Status: **in progress** (Phase 1 built). Last updated 2026-06-03.

## Decisions locked (2026-06-03)
- **Identity:** named RR Administrator only. The synthetic `RRAdmin@<domain>`
  shared account is dropped; Contact 2's real, deliverable email is the single
  Administrator-role login.
- **Name:** capture the RR Administrator's name (new `clients.contact_2_name`)
  for the seeded user's display name + the welcome-email greeting.
- **Live state:** track `clients.handed_off_at`; the Clients grid shows a
  distinct "Live" pill once handed off.

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

1. **Relabel + seed-source.** ✓ BUILT (2026-06-03, not yet committed).
   - Schema `V34__clients_go_live_handoff.sql`: `clients.contact_2_name` +
     `clients.handed_off_at`. Entity fields added (`ClientEntity`).
   - `deriveAdminEmail` now returns Contact 2's email verbatim (lower-cased to
     match the login lookup), not the synthetic `RRAdmin@<contact1-domain>`.
     Seed display name = `contact_2_name` (fallback "RR Administrator").
   - Relabeled Contact 2 → "RR Administrator" (+ a name field) in: Add Client
     modal, Client Details tab, Install Progress inline contacts editor (all
     `dashboard.html`), and V8 `admin-users.html` contacts band. DTO/patch
     endpoints carry `contact2Name` (name set only when present, so partial
     patches don't clobber it). `InstallChecksController.valcContactsComplete`
     + `MailingContactsService` wording updated. `PracticeClientService` reset
     now deletes the seeded admin by Contact 2's email; baseline seeds
     `Sofia Bianchi` / `sofia.bianchi@mauromfg.example.com`.
   - TODO: requirement still enforced only at seed time (400 if Contact 2 blank);
     the handoff step (Phase 3) is where it's surfaced to the operator.
2. **Companies-ready check.** ✓ BUILT. New `valc.companies_have_data` check in
   `InstallChecksController` probes each started DB's Services jar
   (`/admin/companies/all-with-unlicensed`, tight timeouts) for `companyConstantsCount`
   (F0010) / non-empty companies; green when any DB shows data. Verified present in
   the install-checks list.
3. **Handoff action + welcome email.** ✓ BUILT + verified. New `GoLiveHandoffService`
   (`POST /api/v1/admin/clients/{id}/handoff`): seeds/confirms the RR Administrator
   (Administrator role, ALL scope), mints a single-use set-password token (7-day TTL),
   emails the welcome (app URL from `domainUrl` + reset link + KB pointer) via the
   stubbed `EmailService`, stamps `handed_off_at`. Idempotent (backs "Resend"). UI:
   "Go-live handoff" card at the bottom of the Install tab — gate reads the
   `companies_have_data` check + Contact 2 presence; button enables when both green;
   flips to "live since" + Resend after handoff. Verified end-to-end against a test
   client: admin seeded (lowercased), reset token in `password_reset_tokens`, welcome
   body + link in `email_audit`, `handed_off_at` stamped.
4. **Decouple bundle creds.** ✓ BUILT. `InstallBundleService.generate` drops the
   `adminEmail`/`tempPassword` params; `RR-FIRST-LOGIN.txt` reworded to "next steps"
   (no credential — sign-in arrives via the welcome email). `ClientsController`
   bundle-gen no longer seeds the admin (agent identity still minted by `generate`).
   Bundle email + dashboard install-success card reworded; the temp-password card +
   admin-email row removed. Grid "Live" pill added (`AgentStatusDto.handedOff`).
5. **Docs.** PENDING — do at commit time (workspace doc-sweep rule):
   `rr-installation-prep.html` "RR Administrator (name + email)" field; go-live step in
   `tech-client-management.html`; touch `rr-provisioning.html` / `using-valc.html`;
   sweep VALC sidebar docs.

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
