# Practice Client + Import-Testing — build plan

**Status:** SHIPPED 2026-06-01 — Part 0 (Active-control relocation),
Part A (resettable practice client + drawer + footer button), Part B
(parser module + harness), and Part C (licenseEndDate 400) are all
built and verified live (parser harness 12/12; reset 200 on practice /
403 on a real client; create-without-end-date now 400). This doc is
retained as the design-of-record + the enumerated 12-case battery.

## Why

- Testing the create-client arc (Create → Topology-via-Import → Install
  Prep → Databases) by repeatedly **deleting + recreating** a client
  accumulates soft-deleted rows and — more importantly — isn't
  *teachable*: every new hire improvises against live data.
- The exit-strategy goal needs a safe, repeatable way for a new hire to
  **practice the whole process** end to end.
- The import parser is the linchpin of "add a customer from their
  installation-prep email," and it fails **silently** on a mismatched
  section header/label. It currently lives inline in `dashboard.html`,
  so it can't be regression-tested in isolation.

## Decisions settled (2026-06-01)

- Practice approach = **Resettable Practice Client + walkthrough doc**
  (chosen over doc-only and over an in-app coachmark tour — the tour
  was rejected as brittle "mode" clutter on the production control plane).
- Active control = **Client Details drill-down + confirm-on-deactivate**;
  the grid pill is a **read-only badge**. (Shipped — Part 0 below.)
- Parser test = **module-extraction + the 12-case battery**, committed
  (chosen over a drift-prone copy-harness and over a non-persisted
  one-off).

---

## Part 0 — Active-control relocation (SHIPPED 2026-06-01)

Done this session, recorded here for continuity:

- Active/Inactive toggle added to **Manage Client → Client Details**
  settings strip; flips via `PUT /{id}/active` (the client-form Save
  ignores `active`). **Deactivation prompts a confirm**; activation is
  immediate.
- Grid attention-card pill converted from a one-click `<button>` to a
  read-only `<span>` status badge (class `is-active-state`); the old
  `toggle-active` click branch removed.
- Closes the gap where **healthy-strip clients had no Active control**
  (the strip cell has no pill) — they can now be deactivated via the
  drill-down, reachable from both the healthy cell and the attention card.
- Verified live: opening the healthy Mauro cell loads the real client
  (subtitle `Mauro`, `js-client-id=5`) and the toggle reflects state.

---

## Refinements (2026-06-01, later in session — SHIPPED)

The practice model was reworked to mirror the real create flow more
closely (and the licenseEndDate handling reversed):

- **Create-client defaults a 1-year license term** (start = today,
  end = +1yr) when none is supplied; the Add Client modal no longer
  shows license term choices. This **reverses Part C's 400** — we
  default rather than reject.
- **The practice client sits INACTIVE at rest** (seeded + reset both
  leave `active=false`), so its card isn't shown until "created". The
  dashboard only puts an *active* practice client in the practice band.
- **"Create the practice client" opens the REAL Add Client form,
  prefilled + read-only** from the practice client's contract baseline;
  its Create button **activates** the client (PUT /active) instead of
  POSTing a new row — the card then appears. Mirrors the real create
  step without churning rows.
- **Reset now wipes children AND deactivates** → back to the pre-create
  resting state, ready to "create" again.
- The practice client renders as a **full card** (shared `clientCard`
  Thymeleaf fragment), in its own labeled section below live clients.
- The next step — a guided **Manage Client setup wizard** (Next buttons
  per page, mandatory-field gating, strict-for-practice nav) — is
  spec'd separately in
  [manage-client-setup-wizard.md](manage-client-setup-wizard.md).

## Part A — Resettable Practice Client

- **Schema (Flyway V29):** `clients.is_practice BOOLEAN NOT NULL
  DEFAULT false`. Seed one practice client (e.g. `Mauro Manufacturing —
  Practice`) via the migration so it's always present in dev.
- **Reset endpoint:** `POST /api/v1/admin/clients/{id}/reset-practice`
  — **gated to `is_practice = true`** (404/403 otherwise). Returns the
  client to a pristine pre-install state: wipe `client_servers`,
  `jde-config`, `client_install_bundles`, `client_databases`,
  `client_licensed_companies`, any seeded RRAdmin user; restore the
  fixture contacts + a rolling license window; set `active = true`,
  `setupStep = NEW`. Idempotent.
- **UI:** a **"Reset to clean state"** button that renders **only** on
  the practice-flagged client (Client Details footer), behind a confirm.
  Never appears on a real customer card.
- **Isolation:** exclude `is_practice` clients from real-customer counts,
  `LicensingSyncService`, and any customer-facing rollups so the sandbox
  can't skew production state.

## Part B — Import-parser regression harness

- **Extract** `parseInstallEmail` + `IMPORT_TOPOLOGY_MAP` +
  `IMPORT_SOURCE_MATCHES` + `IMPORT_SERVER_ROLE_MATCHES` out of the
  inline `dashboard.html` script into
  `src/main/resources/static/js/install-email-parser.js`, exposing
  `window.RRInstallEmailParser = { parse, TOPOLOGY_MAP, SOURCE_MATCHES,
  SERVER_ROLE_MATCHES }`. Include via `<script src>` in `dashboard.html`
  and update the Parse-&-Fill call site. `applyImportResult` stays inline
  (it's DOM plumbing).
- **Harness:** `static/dev/parser-tests.html` includes the module + the
  12-case battery, renders pass/fail. Served at
  `:8080/dev/parser-tests.html`. No Node needed — runs in the browser.
- **Fixture** for the happy path:
  `RapidReconciler-Valc/setup/fixtures/mauro-install-prep-submission.txt`
  (created 2026-06-01).
- **The 12 cases** (all PASS against the current parser, verified
  2026-06-01 by extracting the live function from the served HTML):
  1. Config 2 + SQL Server (happy path)
  2. Config 1 co-located (`Dedicated RR Server` → APP_SERVER)
  3. Config 3 incl SSIS (3 server roles, ordered)
  4. Source AS/400 → `AS400`
  5. Source Oracle → `ORACLE`
  6. `[not provided]` placeholders dropped (name/qualifier/email)
  7. Missing TOPOLOGY section → `topology: null`, rest still parses
  8. Sections reordered (SUBMITTED BY first)
  9. Lowercase headers (case-insensitive match)
  10. Server line with no internal IP → `ip: ''`
  11. Empty input → all null, `servers: []`
  12. Unknown section + CHECKLIST noise ignored (no cross-section bleed —
      an `Email:` under CHECKLIST is NOT captured)

## Part C — Hardening finding (from the Layer-3 backend test)

- `POST /api/v1/admin/clients` returns a **raw 500** when
  `licenseEndDate` is omitted: `ClientEntity.licenseEndDate` is
  `nullable = false`, but `create()` defaults only `licenseStartDate`
  (to today). **Fix:** validate `licenseEndDate` and return a `400` with
  a clear message, OR default it (e.g. start + 1 year) to mirror the
  Add Client modal. Low urgency — the modal always computes an end date —
  but a 500 on a required field isn't production-grade.

---

## Test evidence (2026-06-01, live against dev VALC :8080 / proxy :8090)

- **Layer 1 — parser logic:** 12/12 against the *real deployed parser*
  (extracted from served HTML; no copy/drift).
- **Layer 2 — apply/UI pipeline:** Mauro fixture imported through the
  real modal fills Name, JDE platform/qualifier/decimals, topology, and
  both server cards; Contact-1 correctly skipped (already populated) and
  the toast honestly omits it.
- **Layer 3 — backend contract:** create → get → delete-while-active
  guard (`409`) → install-bundle (`200`, real zip + token) → re-download
  (`200`) → regenerate (token rotated) → old token superseded (`410`) →
  deactivate (`200`) → soft-delete (`200`). All green.

## Tooling notes

- No Node/Python runner locally (company policy) → the parser harness is
  **browser-based**, served by VALC.
- `RapidReconciler-AI/.claude/launch.json` has a `valc-proxy` (Python,
  `:8090 → :8080`) for preview-driven inspection. The proxy implements
  **GET/HEAD/POST only** — PUT/DELETE contract tests must hit `:8080`
  directly (curl), not the proxy.
