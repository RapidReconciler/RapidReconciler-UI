# Plan: Cutover from Azure VALC SPA + v359 to mini-VALC + new Services jar

**Status:** Spec only. Not yet executed. Pick up in a fresh session
when ready.

**Source of this plan:** session conversation on 2026-05-25 covering
what a real customer-facing cutover would actually look like. Came
out of "let's say we work really hard and get mini-VALC production
ready &mdash; what would a high-level cutover plan look like?"

---

## Hard constraint — cutover is invisible to the customer

**The customer takes no action. They don't even know it happened.**

The cutover is a **Coral-side push** through the existing VALC
deploy panel &mdash; the same mechanism Coral has used for years to
roll out Services version updates on customer boxes. From the
customer IT admin's perspective: a normal Services jar update
happens (Coral picks the time, presses Deploy, watches the jar
swap), the customer's browser keeps working, they go on with their
day.

**Implications that ripple through every other choice below:**

- The legacy `rr-valc-agent.jar` (broker) **stays on customer boxes**.
  It keeps connecting to Coral over JMS at the existing hostname.
  We don't replace it during cutover; that's a separate later effort
  with its own customer-impact analysis.
- mini-VALC is **hosted at Coral**, replacing the Azure VALC SPA at
  its existing URLs. The customer's broker reaches it via the same
  hostname after a Coral-side DNS / LB flip &mdash; the broker
  doesn't notice.
- The new Services jar must speak the **same JMS protocol** the
  legacy broker expects. The new agent already does (uses the same
  `rr-common` message DTOs).
- The new Services jar must **trust the same JWT signing keys** v359
  trusts. Simplest path: mini-VALC inherits Azure VALC's existing
  keypair at cutover; same `public.key` resource shipped in the
  Services jar = identical trust anchor. v359 jars and new-agent
  jars verify the same tokens during the transition.
- The architectural gate at the bottom (per-customer vs central
  broker) is **resolved by elimination**: per-customer broker
  contradicts no-customer-action. Central broker wins.
- **Rollback is also Coral-side and customer-invisible**: VALC's
  deploy panel can target an older Services version; redeploying
  v359 reverses the swap. The customer never sees a maintenance
  window or a banner; they see continuous service.

**Related plan:** [`mini-valc-database-provisioning-production-ready.md`](mini-valc-database-provisioning-production-ready.md)
&mdash; the &ldquo;Add Database &rarr; spawn Services jar&rdquo; flow
this cutover depends on.

---

## Goal

Replace the legacy production stack with the green-field equivalent:

| Legacy (today) | Green-field (target) |
|---|---|
| Azure VALC SPA at `staging-valcspa.cloudapp.net` / `rr-valc-spa.cloudapp.net` | mini-VALC, hosted at Coral on the same URLs (DNS / LB flip) |
| `rr-valc-agent.jar` on every customer's box (legacy broker, JMS to VALC) | **No change** &mdash; legacy broker stays. Talks to mini-VALC at the same hostname post-DNS flip. |
| v359 Services jar (one per DB) spawned by the legacy broker | New Services jar from `RapidReconciler-Agent` repo, deployed via the existing VALC deploy panel |
| AngularJS SPA at `staging-rr-spa.azurewebsites.net` / `rapidreconciler.getgsi.com` | V8 (RRV8/) from `RapidReconciler-UI` (separate effort; can run in parallel with v359 Services until coverage closes) |

Done = every customer is on the new stack and the legacy pieces are
decommissioned. **No customer ever takes an action.** Every step is
either Coral-side or invisible.

---

## Phase 0 &mdash; Pre-cutover (the work currently queued)

This is the bulk of the work. Everything below ships from Coral's
side; nothing reaches a customer until it's all done.

1. **Auth shape rewrite** &mdash; new agent's `JwtAuthFilter` +
   mini-VALC's `JwtService.mint()` aligned to v359's wire shape.
   Currently a known bug; chunk queued in [`RRV8/HANDOFF.md`](../../RRV8/HANDOFF.md).
2. **JMS protocol parity** &mdash; mini-VALC's Artemis broker must
   accept connections from existing `rr-valc-agent.jar` instances
   using the legacy CORE protocol, the existing truststore, and the
   same hostname (post-DNS-flip). Validate end-to-end against a
   real legacy broker pointed at mini-VALC.
3. **Signing-key inheritance** &mdash; mini-VALC accepts Azure
   VALC's existing RSA private key as its signing key at cutover
   time. The new Services jar bundles the SAME `public.key`
   resource v359 does. Same trust anchor; v359 + new agent both
   verify the same tokens. (Alternative: dual-issuing during a
   transition window. More moving parts; pick only if Coral
   refuses to migrate the key.)
4. **V8 module coverage** &mdash; In Transit, PO Receipts, Roll Forward
   not yet built in the new agent or as V8 pages. The new agent
   today doesn't have these controllers; the legacy SPA hits them
   when customers click those tabs. Either:
   - Build them in the new agent (preferred &mdash; closes the gap
     fully).
   - Keep v359 deployed for those modules and route only Inventory
     traffic to the new agent (more plumbing; not recommended).
5. **Schema ETL** &mdash; Azure VALC's user / client / permissions /
   deploy-history data into mini-VALC's Postgres. Coral-side
   migration; happens once at the DNS-flip moment. Snapshot then
   import.
6. **Password store strategy** &mdash; mine Azure VALC's password
   storage scheme (BCrypt? Argon2?) and confirm the import preserves
   hashes. If hash formats match, customer logins continue working
   unchanged. If they don't, users get forced-reset on next login
   &mdash; this IS customer-visible and contradicts the no-action
   constraint; design needs to flag this case.
7. **Provisioning flow** &mdash; Add Database &rarr; spawn Services
   jar per [`mini-valc-database-provisioning-production-ready.md`](mini-valc-database-provisioning-production-ready.md).
   For cutover specifically: every existing customer database needs
   a `client_databases` row in mini-VALC's Postgres before cutover
   (part of the schema ETL).
8. **Coral-side ops** &mdash; DNS / LB cutover plan, monitoring,
   page-out alerts, rollback script (re-flip DNS + redeploy v359
   Services via VALC). All Coral-side; customer never sees it.

**Exit criteria for Phase 0**: dev box runs V8 end-to-end against
mini-VALC-issued JWTs across every customer-facing module, with zero
behavioral diff from the same flows on Azure VALC. Internal smoke
of the JMS protocol parity against the legacy broker passes.

---

## Phase 1 &mdash; Internal cutover

- Stand up the production mini-VALC instance at Coral.
- DNS-flip GSI's OWN internal RR install onto mini-VALC. Coral pushes
  the new Services jar to the GSI internal broker via the existing
  deploy panel.
- GSI uses the system daily for ~2 weeks: analyzer, sales demos,
  internal training, the works.
- Bugs found here have ZERO customer impact (GSI's own install) but
  reproduce the production cutover path verbatim.

**Exit**: no production-blocking issues for a full week.

---

## Phase 2 &mdash; First customer (silent push)

- Pick a customer whose modules are fully covered by the new agent
  (no In Transit / PO Receipts / Roll Forward usage, or those have
  been built in phase 0). Pre-flight check via VALC's existing
  per-customer telemetry &mdash; no customer conversation needed.
- Coral-side: schedule the push during the customer's off-hours.
- Through VALC's deploy panel: pick the new Services version, click
  Deploy on that customer's instance. **This is the only mechanical
  step**; identical to any other Services version update Coral has
  done for that customer.
- Coral watches the post-deploy health (system-status, agent-log,
  V8 / legacy SPA browser hits) for the next ~48 hours.
- Bug found? Coral redeploys v359 Services via the same panel.
  Customer-invisible.

**Exit**: customer hits their first month-end close on the new
stack without raising a ticket.

---

## Phase 3 &mdash; Rollout

- Rest of the customer base, push by push.
- Coral's existing version-management cadence handles this &mdash;
  same playbook the existing v359 Services version bumps use.
- Batch the easy ones (Inventory-only customers) early; save the
  module-coverage-edge-case customers for last.
- Tail off the early adopters as confidence grows; don't push all at
  once.

**Exit**: every customer on the new stack OR a documented decision
not to migrate.

---

## Phase 4 &mdash; Decommission

- Azure VALC SPA: archive + keep reachable for 90 days behind a
  fallback DNS record in case of late-discovered rollback needs.
  After 90 days clean: shut down.
- Legacy AngularJS SPA: separate decommission decision &mdash; depends
  on whether V8 covers everything the customer needs.
- The legacy `rr-valc-agent.jar` (broker) stays on customer boxes
  for now. Replacing it is a separate later effort with its own
  customer-impact analysis &mdash; out of scope for this cutover.
- Update SOC 2 audit materials, security questionnaires, customer
  onboarding docs (the latter mostly to reflect the new SPA
  experience once V8 is the primary surface).

---

## Calendar-time estimate (revised under the no-customer-action constraint)

- **Phase 0 &mdash; pre-cutover engineering**: still the bulk of the
  effort. Aggressively, 6&ndash;10 engineer-weeks. Realistic at the
  current pace with other priorities, 2&ndash;4 months. Same as
  before &mdash; the customer-side simplification doesn't shrink the
  amount of code that needs to ship.
- **Phase 1 &mdash; GSI internal cutover**: 2&ndash;3 weeks.
- **Phase 2 &mdash; first customer push**: ONE day for the actual
  push, then a 1-month observation window before phase 3 begins. The
  push itself is mechanically identical to any Services version
  bump Coral has done before. The month is for confidence, not
  process.
- **Phase 3 &mdash; rollout**: rides Coral's existing version-
  management cadence. Realistic: a wave per week, batching by module
  coverage. Total: 1&ndash;2 months for a mid-sized customer base,
  longer if special-snowflake customers need their own pushes.
- **Phase 4 &mdash; decommission**: 90 days post-rollout for the
  Azure VALC archive window, then shutdown.

**Total: 4&ndash;6 months from "Phase 0 starts" to "Azure VALC dark."**
Optimistic floor assumes Phase 0 ships cleanly. The constraint drops
the per-customer cost from "weeks of prep + a maintenance window" to
"one push, watch for a day."

---

## Repo perspective

Cutover touches all four of our repos plus several outside our
control. The four we own:

### `RapidReconciler-UI` (this repo)

**During cutover** &mdash; minimal code churn. The UI repo holds:

- **`RRV8/`**: V8 already calls every endpoint we'd need; phase 0
  fills the In Transit / PO Receipts / Roll Forward gaps. Login
  flow's `AUTH_BASE` flips from `staging-valcspa.cloudapp.net` to
  mini-VALC's host &mdash; one config line per environment.
- **`RRUniversity/`**: net-new customer docs for the cutover &mdash;
  what changes for them, how to log in if anything changed, complex-
  password policy doc already exists. Existing docs mostly stay
  (they describe customer workflows, not implementation).
- **`GSIRRTech/`**: net-new internal docs &mdash; install playbook,
  cutover runbook, rollback runbook, ETL runbook, per-customer
  migration tracker. **The bulk of the runbook documentation lives
  here.**
- **`GSIRRSales/`**: probably no change &mdash; the sales pitch
  doesn't shift because the implementation changed.

**After cutover** &mdash; the repo is unchanged structurally. If the
app/docs split discussed earlier happens before cutover, this
becomes two repos and only the docs side carries the runbooks.

### `RapidReconciler-Agent`

**During cutover** &mdash; this is the new Services jar.

- Auth shape rewrite (queued).
- In Transit / PO Receipts / Roll Forward controllers + repositories
  &mdash; major new code.
- Tagged releases (`v0.3.x` for In Transit, etc.) keep coming via
  the existing GH Action release workflow.
- `artifacts/v359/` stays as historical reference forever &mdash;
  don't delete; the audit trail for "what was running pre-cutover"
  is more valuable than the disk space saved.

**After cutover** &mdash; ongoing development repo for the Services
jar. Same lifecycle pattern as today.

### `RapidReconciler-Valc`

**During cutover** &mdash; the biggest changes land here.

- Provisioning flow (full 7 phases).
- Auth (login + change-password + JWT minting + password policy).
- Schema ETL tooling (or a new sibling sub-folder for migration
  scripts &mdash; the architectural gate decides where).
- Multi-tenant hardening if the central-broker option wins.
- Operational tooling (monitoring, backup, restore).

**After cutover** &mdash; if central broker: this is a hosted service
with all the ops responsibilities that go with that. If per-customer
broker: this is "the new `rr-valc-agent`" shipped via the installer
and runs unattended on every customer's box.

### `RapidReconciler-DB`

**During cutover** &mdash; some new schema for `users`,
`user_password_history`, `client_databases`, `clients` already
landed in Valc. If the DB repo currently owns the *RR-product*
schema and Valc owns the *control-plane* schema, that boundary stays.
**Migration-script versioning** for the cutover needs explicit
attention &mdash; what version does a customer have to be at to
migrate? Document it in a `Releases/` directory.

### New repos that might appear

- **A release-coordinator repo** &mdash; tracking "shippable stack
  versions" (Valc X.Y + Agent A.B + V8 SHA + installer Z) and which
  customer is on which stack. Could be a single file under
  `RapidReconciler-UI/docs/` instead of a whole repo; the bar for
  spinning up a separate repo is "two contributors regularly editing
  it independently."
- **An installer repo** &mdash; if the installer source code currently
  lives at Coral (it does today, AFAIK), Coral's call whether to
  carve it out. We may not own this.
- **A schema-ETL repo** &mdash; if the ETL is more than ~5 scripts,
  give it its own home. Below that bar, a `Valc/setup/etl/` folder
  is enough.

### Repos / surfaces that go away

- **Azure VALC SPA repo** &mdash; Coral's. After phase 4 it gets
  archived. We don't own this directly.
- **Legacy `rr-valc-agent.jar` source** &mdash; Coral's. Archived
  with VALC SPA.
- **v359 Services jar source** &mdash; Coral's. Superseded by
  `RapidReconciler-Agent`. Archived.
- **Legacy AngularJS SPA repo** &mdash; Coral's. Lifecycle depends on
  whether any customer still needs it after V8 covers their modules.

**Note on "Coral's repos"**: we don't have direct access to those
codebases. Phase 0 includes mining what we need from them via
`javap` on the deployed jars + DevTools observation against the
live staging SPA. The cutover runbook lives in OUR repos; we don't
need to touch Coral's source.

### Cross-cutting

- **CI workflows**: the tagged-release pattern (Agent + Valc both
  have `release.yml`) keeps working. If a release-coordinator repo
  appears, it'd add a workflow that pins stack versions.
- **Branch policy divergence** worth re-checking at cutover: Agent +
  Valc both already use tagged releases off `main`; UI repo still
  has the `main` auto-mirrors-Dev pattern. If cutover means the V8
  app starts versioning explicitly (it will), the UI repo's branch
  policy needs to split per the app/docs discussion from earlier
  this session.
- **Documentation cross-links**: every cutover doc references both
  `docs/plans/` (saved plans) and `GSIRRTech/` (runbooks). Inside the
  UI repo today, relative paths work. After a potential app/docs
  split they become URL-based.

---

## What this plan deliberately does NOT cover

- **The actual technical implementation** of each phase. Each one is
  its own chunk; the provisioning plan is the model for what a
  detailed sub-plan looks like.
- **Customer communication strategy** &mdash; what to tell
  customers, when, in what tone. Sales + Support own that.
- **Pricing / contract implications** &mdash; if the new stack
  changes what GSI is selling (e.g. mini-VALC adds capabilities not
  in the old contract), separate conversation.
- **The split-repo decision** discussed earlier in the session. It's
  related but independent &mdash; cutover works either way.
