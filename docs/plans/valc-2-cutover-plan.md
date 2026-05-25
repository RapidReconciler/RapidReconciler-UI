# Plan: VALC 2.0 cutover (replacing Azure VALC + v359 Services + Coral-operated push process)

**Status:** Spec only. Not yet executed. Pick up in a fresh session
when ready.

**Source of this plan:** session conversations on 2026-05-25
covering what a real customer-facing cutover would actually look
like, with iterative clarifications from the owner about the
business context.

**Related plan:** [`mini-valc-database-provisioning-production-ready.md`](mini-valc-database-provisioning-production-ready.md)
&mdash; the &ldquo;Add Database &rarr; spawn Services jar&rdquo;
flow this cutover depends on. (That file still uses the prototyping
name; the surface it describes is what becomes VALC 2.0's
provisioning flow.)

---

## Background &mdash; what this is really about

Coral is a third-party UI / platform vendor GSI has used as the
source of RapidReconciler's web stack for years:

- Azure VALC SPA (the central admin / auth server)
- The legacy AngularJS customer-facing SPA
- v359 Services jar
- The Services version push process &mdash; Coral has the
  privileged access to VALC's deploy panel that customers' boxes
  receive updates through

Budget constraints are driving GSI to bring this development
**in-house**. This cutover is the mechanical execution of that
move. By the end of Phase 4 below:

- VALC 2.0 (the in-house rewrite, previously prototyped as
  &ldquo;mini-VALC&rdquo;) replaces Azure VALC at its existing URLs.
- The new Services jar from `RapidReconciler-Agent` replaces v359.
- V8 (RRV8/) replaces the legacy AngularJS SPA when its module
  coverage closes.
- **The Services version push process moves from Coral to the
  in-house team.** This is one of the things VALC 2.0 enables
  &mdash; the deploy-panel access becomes an internal capability
  instead of a contracted-out one.
- All VALC infrastructure (old + new) runs on Azure VMs;
  hosting moves from Coral's Azure account to GSI's (or whichever
  entity carries the in-house operation).

This is a vendor-replacement story, not just a tech swap.

---

## Hard constraint &mdash; cutover is invisible to the customer

**The customer takes no action. They don't even know it happened.**

The cutover is a **server-side push** through VALC's deploy panel
&mdash; the same mechanism Coral has used for years to roll out
Services version updates on customer boxes. From the customer IT
admin's perspective: a normal Services jar update happens, the
customer's browser keeps working, they go on with their day.

During the transition, Coral may still be operating the push
button while VALC 2.0 + the new Services jar are being smoke-
tested. By Phase 3, the in-house team has taken over the push
access entirely.

**Implications that ripple through every other choice below:**

- The legacy `rr-valc-agent.jar` (broker) **stays on customer boxes**.
  It keeps connecting to the central server over JMS at the
  existing hostname. We don't replace it during cutover; that's a
  separate later effort.
- VALC 2.0 is hosted at the existing URLs (Azure VMs, in-house
  Azure subscription). The customer's broker reaches it via the
  same hostname after a DNS / LB flip &mdash; the broker doesn't
  notice.
- The new Services jar must speak the **same JMS protocol** the
  legacy broker expects. The new agent already does (uses the same
  `rr-common` message DTOs).
- The new Services jar must **trust the same JWT signing keys**
  v359 trusts. Simplest path: VALC 2.0 inherits Azure VALC's
  existing keypair at cutover; same `public.key` resource shipped
  in the Services jar = identical trust anchor.
- The architectural gate "per-customer vs central broker" is
  **resolved by elimination**: per-customer broker contradicts
  no-customer-action. Central broker wins (which matches the
  existing Azure VM topology anyway).
- **Rollback is also server-side and customer-invisible**: VALC's
  deploy panel can target an older Services version; redeploying
  v359 reverses the swap. The customer never sees a maintenance
  window or a banner; they see continuous service.

---

## Goal &amp; stack mapping

Replace the legacy production stack with the green-field in-house
equivalent:

| Legacy (today, Coral-operated) | Green-field (target, in-house) |
|---|---|
| Azure VALC SPA at `staging-valcspa.cloudapp.net` / `rr-valc-spa.cloudapp.net` (Coral Azure) | VALC 2.0, in-house Azure VMs at the same URLs (DNS / LB flip) |
| `rr-valc-agent.jar` on every customer's box (legacy broker, JMS to Coral's VALC) | **No change** &mdash; legacy broker stays. Talks to VALC 2.0 at the same hostname post-DNS flip. |
| v359 Services jar (one per DB) spawned by the legacy broker | New Services jar from `RapidReconciler-Agent` repo, deployed via the existing VALC deploy panel |
| AngularJS SPA at `staging-rr-spa.azurewebsites.net` / `rapidreconciler.getgsi.com` (Coral) | V8 (RRV8/) from `RapidReconciler-UI`, in-house (separate effort; can run in parallel with v359 Services until coverage closes) |
| Services version push process operated by Coral | Push process operated by the in-house team |

Done = every customer is on the new stack, the legacy pieces are
decommissioned, and the in-house team owns the push process.
**No customer ever takes an action.** Every step is server-side or
invisible.

---

## Phase 0 &mdash; Pre-cutover engineering

This is the bulk of the work. Everything below ships from the
in-house team's side; nothing reaches a customer until it's all
done.

1. **Auth shape rewrite** &mdash; new agent's `JwtAuthFilter` +
   VALC 2.0's `JwtService.mint()` aligned to v359's wire shape.
   Currently a known bug; chunk queued in [`RRV8/HANDOFF.md`](../../RRV8/HANDOFF.md).
2. **JMS protocol parity** &mdash; VALC 2.0's Artemis broker must
   accept connections from existing `rr-valc-agent.jar` instances
   using the legacy CORE protocol, the existing truststore, and
   the same hostname (post-DNS-flip). Validate end-to-end against
   a real legacy broker pointed at VALC 2.0.
3. **Signing-key inheritance** &mdash; VALC 2.0 accepts Azure
   VALC's existing RSA private key as its signing key at cutover
   time. Requires Coral cooperation to export the key. The new
   Services jar bundles the SAME `public.key` resource v359 does.
   Same trust anchor; v359 + new agent both verify the same
   tokens.
4. **V8 module coverage** &mdash; In Transit, PO Receipts, Roll
   Forward not yet built in the new agent or as V8 pages. The new
   agent today doesn't have these controllers; the legacy SPA hits
   them when customers click those tabs. Build them in the new
   agent.
5. **Schema ETL** &mdash; Azure VALC's user / client / permissions /
   deploy-history data into VALC 2.0's Postgres. Coral cooperation
   needed for the export; in-house team owns the import. Happens
   once at the DNS-flip moment.
6. **Password store strategy** &mdash; confirm Azure VALC's
   password storage scheme (BCrypt? Argon2?) and that the import
   preserves hashes. If hash formats match, customer logins
   continue working unchanged. If they don't, users get
   forced-reset on next login &mdash; this IS customer-visible and
   contradicts the no-action constraint; flag this case early.
7. **Provisioning flow** &mdash; Add Database &rarr; spawn Services
   jar per the [provisioning plan](mini-valc-database-provisioning-production-ready.md).
   Every existing customer database needs a `client_databases` row
   in VALC 2.0's Postgres before cutover (part of the schema ETL).
8. **Operational ownership transition** &mdash; the in-house team
   needs to take over what Coral does today:
   - VALC deploy panel access (push Services updates to customers)
   - Customer onboarding (Add Database flow)
   - On-call rotation for the central server
   - SOC 2 audit responsibility for the new infrastructure
   This is a process-and-people transition, not just code.

**Exit criteria for Phase 0**: dev box runs V8 end-to-end against
VALC-2.0-issued JWTs across every customer-facing module, with
zero behavioral diff from the same flows on Azure VALC. JMS
protocol parity smoke against the legacy broker passes.

---

## Phase 1 &mdash; Internal cutover

- Stand up the production VALC 2.0 instance on in-house Azure VMs.
- DNS-flip GSI's OWN internal RR install onto VALC 2.0. The
  in-house team pushes the new Services jar to the GSI internal
  broker via the existing deploy panel.
- GSI uses the system daily for ~2 weeks: analyzer, sales demos,
  internal training, the works.
- Bugs found here have ZERO customer impact (GSI's own install)
  but reproduce the production cutover path verbatim.

**Exit**: no production-blocking issues for a full week.

---

## Phase 2 &mdash; First customer (silent push)

- Pick a customer whose modules are fully covered by the new agent
  (no In Transit / PO Receipts / Roll Forward usage, or those have
  been built in phase 0). Pre-flight check via VALC's existing
  per-customer telemetry &mdash; no customer conversation needed.
- Schedule the push during the customer's off-hours.
- Through VALC's deploy panel: pick the new Services version,
  click Deploy on that customer's instance. **This is the only
  mechanical step**; identical to any other Services version
  update done for that customer.
- The in-house team watches the post-deploy health
  (system-status, agent-log, V8 / legacy SPA browser hits) for
  the next ~48 hours.
- Bug found? Redeploy v359 Services via the same panel.
  Customer-invisible.

**Exit**: customer hits their first month-end close on the new
stack without raising a ticket.

---

## Phase 3 &mdash; Rollout + Coral handoff

- Rest of the customer base, push by push, run by the in-house
  team.
- Batch the easy ones (Inventory-only customers) early; save the
  module-coverage-edge-case customers for last.
- Tail off the early adopters as confidence grows; don't push all
  at once.
- **Coral's operational role winds down** through this phase as
  the in-house team's confidence in the push process matures.
  Push access can be co-held during transition or revoked once
  the team is comfortable.

**Exit**: every customer on the new stack OR a documented
decision not to migrate. Coral's Services-push role formally
ended.

---

## Phase 4 &mdash; Decommission

- Azure VALC SPA (Coral): archive + keep reachable for 90 days
  behind a fallback DNS record in case of late-discovered
  rollback needs. After 90 days clean: shut down on Coral's side.
- Legacy AngularJS SPA: separate decommission decision &mdash;
  depends on whether V8 covers everything the customer needs.
- The legacy `rr-valc-agent.jar` (broker) stays on customer boxes
  for now. Replacing it is a separate later effort with its own
  customer-impact analysis &mdash; out of scope for this cutover.
- Update SOC 2 audit materials, security questionnaires,
  customer onboarding docs to reflect the in-house operation.

---

## Calendar-time estimate &mdash; AI-assisted pace

The original "6&ndash;10 engineer-weeks / 2&ndash;4 months for
Phase 0" estimate was based on human-only programming. The pace
we've established in this codebase &mdash; AI-assisted, with
mining-before-designing discipline, with the V8 + new agent +
VALC 2.0 prototyping infrastructure already in place &mdash;
suggests a real timeline closer to:

| Phase | Original (human-only) | Revised (AI-assisted) | Why the compression |
|---|---|---|---|
| **Phase 0** &mdash; pre-cutover engineering | 2&ndash;4 months | **3&ndash;6 weeks** | Bulk of the queued work (auth shape rewrite, V8 module coverage, schema ETL) is well-scoped chunks the current pace handles in days each. The provisioning flow's 7 phases is the longest sub-thread. |
| **Phase 1** &mdash; internal cutover | 2&ndash;3 weeks | **2&ndash;3 weeks** | Calendar-bound. Daily use bake can't be compressed; you have to run it for time to surface what time surfaces. |
| **Phase 2** &mdash; first customer push | 1 day push + 1 month observation | **1 day + 2 weeks** | Push itself is mechanical. Observation window can shrink if Phase 1's bake was clean &mdash; we know what to look for. |
| **Phase 3** &mdash; rollout | 1&ndash;2 months | **2&ndash;4 weeks** | Each push is one day; pushes can be paralleled cautiously. Coral handoff happens in parallel with rollout, not after it. |
| **Phase 4** &mdash; decommission | 90 days | **90 days** | Calendar-bound. The archive window exists because we want time to discover late-rollback needs, not because anyone is doing work. |

**Revised total: 2&ndash;3 months from "Phase 0 starts" to "Azure
VALC dark"** &mdash; down from the original 4&ndash;6 month
estimate. The shrinkage is almost entirely in Phase 0 (engineering)
and Phase 3 (rollout mechanics); Phase 1 and Phase 4 stay the
same because they're calendar-bound rather than effort-bound.

Two cautions against over-compressing:

1. **The pace assumes the current discipline holds.** Mining v359
   before designing, committing in coherent chunks, releasing
   tagged versions with verification &mdash; all of that adds
   sub-day overhead that pays for itself in not having to
   re-derive things. Skipping it would actually slow the project.
2. **Customer-touching phases (2 + 3) have a confidence-building
   component that can't be compressed**. The first customer's
   month of observation matters because it's the first time real
   production traffic flows through; you can't simulate that
   with speed.

---

## Repo perspective

Cutover touches all four of our repos plus several outside our
control. The four we own:

### `RapidReconciler-UI` (this repo)

**During cutover** &mdash; minimal code churn. The UI repo holds:

- **`RRV8/`**: V8 already calls every endpoint we'd need; phase 0
  fills the In Transit / PO Receipts / Roll Forward gaps. Login
  flow's `AUTH_BASE` flips from `staging-valcspa.cloudapp.net` to
  VALC 2.0's host &mdash; one config line per environment.
- **`RRUniversity/`**: net-new customer docs for any user-visible
  changes (the complex-password policy doc already exists).
  Existing docs mostly stay (they describe customer workflows,
  not implementation).
- **`GSIRRTech/`**: net-new internal docs &mdash; runbooks for
  the push playbook, rollback runbook, ETL runbook, per-customer
  migration tracker. **The bulk of the runbook documentation
  lives here.**
- **`GSIRRSales/`**: probably no change &mdash; the sales pitch
  doesn't shift because the implementation changed.

**After cutover** &mdash; the repo is unchanged structurally.

### `RapidReconciler-Agent`

**During cutover** &mdash; this is the new Services jar.

- Auth shape rewrite (queued).
- In Transit / PO Receipts / Roll Forward controllers +
  repositories &mdash; major new code.
- Tagged releases (`v0.3.x` for In Transit, etc.) keep coming via
  the existing GH Action release workflow.
- `artifacts/v359/` stays as historical reference forever &mdash;
  don't delete; the audit trail for "what was running pre-cutover"
  is more valuable than the disk space saved.

**After cutover** &mdash; ongoing development repo for the
Services jar. Same lifecycle pattern as today, just owned by the
in-house team instead of Coral.

### `RapidReconciler-Valc`

**During cutover** &mdash; the biggest changes land here. Repo
name keeps "Valc" for historical continuity even though the
product is "VALC 2.0" in user-facing language.

- Provisioning flow (full 7 phases).
- Auth (login + change-password + JWT minting + password policy).
- Schema ETL tooling (or a new sibling sub-folder for migration
  scripts).
- Multi-tenant hardening &mdash; VALC 2.0 becomes a hosted
  service on in-house Azure VMs with the ops responsibilities
  that come with that.
- Operational tooling (monitoring, backup, restore).

**After cutover** &mdash; this is a hosted service the in-house
team runs, with uptime + backup + breach-blast-radius
obligations.

### `RapidReconciler-DB`

**During cutover** &mdash; some new schema for `users`,
`user_password_history`, `client_databases`, `clients` already
landed in Valc. If the DB repo currently owns the *RR-product*
schema and Valc owns the *control-plane* schema, that boundary
stays. **Migration-script versioning** for the cutover needs
explicit attention &mdash; what version does a customer have to
be at to migrate? Document it in a `Releases/` directory.

### New repos that might appear

- **A release-coordinator repo** &mdash; tracking "shippable
  stack versions" (Valc X.Y + Agent A.B + V8 SHA) and which
  customer is on which stack. Could be a single file under
  `RapidReconciler-UI/docs/` instead of a whole repo.
- **A schema-ETL repo** &mdash; if the ETL is more than ~5
  scripts, give it its own home. Below that bar, a
  `Valc/setup/etl/` folder is enough.

### Repos / surfaces that go away

- **Azure VALC SPA repo** &mdash; Coral's. After phase 4 it gets
  archived. We don't own this directly.
- **v359 Services jar source** &mdash; Coral's. Superseded by
  `RapidReconciler-Agent`. Archived.
- **Legacy AngularJS SPA repo** &mdash; Coral's. Lifecycle
  depends on whether any customer still needs it after V8 covers
  their modules.
- **Legacy `rr-valc-agent.jar` source** &mdash; Coral's. Stays
  for now. Eventual replacement is a separate later effort.

**Note on Coral's repos**: we don't have direct access to those
codebases. Phase 0 includes mining what we need from them via
`javap` on the deployed jars + DevTools observation against the
live staging SPA. The cutover runbook lives in OUR repos; we
don't need to touch Coral's source.

### Cross-cutting

- **Naming convention**: "VALC 2.0" is the canonical name for
  the new server going forward. The `RapidReconciler-Valc` repo
  keeps its name (it's just a repo identifier); the running
  product, the docs, and customer-facing language all use
  "VALC 2.0" (or just "VALC" once the original is decommissioned).
  The "mini-VALC" name from the prototyping phase should not
  appear in new docs.
- **CI workflows**: the tagged-release pattern (Agent + Valc both
  have `release.yml`) keeps working.
- **Branch policy divergence** worth re-checking at cutover: Agent
  + Valc both already use tagged releases off `main`; UI repo
  still has the `main` auto-mirrors-Dev pattern.
- **Documentation cross-links**: every cutover doc references
  both `docs/plans/` (saved plans) and `GSIRRTech/` (runbooks).
  Inside the UI repo today, relative paths work.

---

## What this plan deliberately does NOT cover

- **The actual technical implementation** of each phase. Each
  one is its own chunk; the provisioning plan is the model for
  what a detailed sub-plan looks like.
- **Replacement of the legacy `rr-valc-agent.jar` broker.** It
  stays on customer boxes during this cutover; replacing it is a
  separate later effort with its own customer-impact analysis.
- **Coral contract wind-down logistics** &mdash; the contractual
  / legal side of ending the vendor relationship. Operations
  leadership owns that.
- **Pricing / contract implications** &mdash; if VALC 2.0 enables
  capabilities not in the old contract (or if the savings from
  no-Coral change what GSI is selling), separate conversation.
- **The split-repo decision** discussed in earlier session
  conversations. It's related but independent &mdash; cutover
  works either way.
