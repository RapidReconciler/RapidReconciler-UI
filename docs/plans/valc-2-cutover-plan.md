# Plan: V8 cutover (VALC 2.0 + new Services jar foundation)

**Status:** Spec. In progress. Foundation pieces have landed
(VALC 2.0 control plane, new Services jar core endpoints, JWT
per-database scoping). Customer-facing rollout (V7 &rarr; V8) is
phased.

**Source of this plan:** session conversations starting 2026-05-25
covering what a real customer-facing cutover would actually look
like, refined 2026-05-27 to lead with V8 as the customer-visible
deliverable (with VALC 2.0 + the new Services jar as the
foundation it depends on).

**Related plan:** [`mini-valc-database-provisioning-production-ready.md`](mini-valc-database-provisioning-production-ready.md)
&mdash; the &ldquo;Add Database &rarr; spawn Services jar&rdquo;
flow this cutover depends on. (That file still uses the prototyping
name; the surface it describes is what becomes VALC 2.0's
provisioning flow.)

---

## Background

The customer-facing outcome of this work is **V8** &mdash; the
modernized RapidReconciler UI in `RRV8/`. Two layers of platform
modernization make V8 viable:

- **VALC 2.0** (previously prototyped as &ldquo;mini-VALC&rdquo;)
  replaces the legacy Azure VALC SPA at its existing URLs.
- The **new Services jar** from `RapidReconciler-Agent` replaces
  v359 on a per-customer schedule via the existing VALC deploy
  panel.

V8 itself is a separate switching dimension: every customer's
install can be flipped between V7 (legacy AngularJS SPA) and V8
**independently** of the Services jar version. A customer can run
on the new Services jar with V7 still mounted, then flip to V8
when their module coverage is ready &mdash; or stay on V7
indefinitely if they prefer. See &sect; *V7 &harr; V8 customer
switching* below.

By the end of Phase 4 below:

- VALC 2.0 replaces the legacy Azure VALC SPA at its existing URLs.
- The new Services jar replaces v359 on every customer's box.
- V8 replaces V7 on every customer's installation, with V7 kept
  reachable behind a per-customer flag for rollback or for
  customers whose module coverage requires it.
- All VALC infrastructure (legacy + new) runs on Azure VMs. The
  new instance stands up alongside the legacy one and takes over
  via a DNS / LB flip.

Coral, the platform vendor who built the current stack, continues
to provide development and operational support under a
**10-hours-per-week engagement**. Operational responsibilities for
the new infrastructure &mdash; Services version pushes, customer
onboarding, on-call rotation &mdash; are assigned at cutover time
based on each process's frequency, complexity, and the engagement
hours available; some may remain with Coral, others may shift to
GSI's in-house operators.

---

## Hard constraint &mdash; cutover is invisible to the customer

**The customer takes no action. They don't even know it happened.**

The cutover is a **server-side push** through VALC's deploy panel
&mdash; the same mechanism that's rolled out Services version
updates on customer boxes for years. From the customer IT admin's
perspective: a normal Services jar update happens, the customer's
browser keeps working, they go on with their day.

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

Replace the legacy production stack with the green-field
equivalent:

| Legacy (today) | Green-field (target) |
|---|---|
| Azure VALC SPA at `staging-valcspa.cloudapp.net` / `rr-valc-spa.cloudapp.net` | VALC 2.0 on Azure VMs at the same URLs (DNS / LB flip) |
| `rr-valc-agent.jar` on every customer's box (legacy broker, JMS to central VALC) | **No change** &mdash; legacy broker stays. Talks to VALC 2.0 at the same hostname post-DNS flip. |
| v359 Services jar (one per DB) spawned by the legacy broker | New Services jar from `RapidReconciler-Agent` repo, deployed via the existing VALC deploy panel |
| AngularJS SPA at `staging-rr-spa.azurewebsites.net` / `rapidreconciler.getgsi.com` | V8 (RRV8/) from `RapidReconciler-UI` (separate effort; can run in parallel with v359 Services until coverage closes) |

Done = every customer is on the new stack and the legacy pieces
are decommissioned. **No customer ever takes an action.** Every
step is server-side or invisible.

---

## Phase 0 &mdash; Pre-cutover engineering

This is the bulk of the work. Everything below ships from the
server side; nothing reaches a customer until it's all done.

1. **Auth shape rewrite** &mdash; new agent's `JwtAuthFilter` +
   VALC 2.0's `JwtService.mint()` aligned on a single canonical
   wire shape. Source-validated against the V7 codebase 2026-05-30
   (`rr-client-services` + `rr-valc` repos cloned locally; see
   [`RapidReconciler-Agent/docs/v359-auth.md`](../../../RapidReconciler-Agent/docs/v359-auth.md)
   &sect; *Token shape divergence*). Real divergence is between
   V7's and VALC 2.0's minted shapes (not phantom fields in the new
   agent as previously framed). Chunk queued in
   [`RRV8/HANDOFF.md`](../../RRV8/HANDOFF.md).
2. **JMS protocol parity** &mdash; VALC 2.0's Artemis broker must
   accept connections from existing `rr-valc-agent.jar` instances
   using the legacy CORE protocol, the existing truststore, and
   the same hostname (post-DNS-flip). Validate end-to-end against
   a real legacy broker pointed at VALC 2.0.
3. **Signing-key inheritance** &mdash; VALC 2.0 accepts Azure
   VALC's existing RSA private key as its signing key at cutover
   time. The new Services jar bundles the SAME `public.key`
   resource v359 does. Same trust anchor; v359 + new agent both
   verify the same tokens.
4. **V8 module coverage** &mdash; In Transit, PO Receipts, Roll
   Forward not yet built in the new agent or as V8 pages. The new
   agent today doesn't have these controllers; the legacy SPA hits
   them when customers click those tabs. Build them in the new
   agent. **V7 source now available** at
   `C:/source/repos/RapidReconciler-V7-Services` (cloned from
   `getgsi/rr-client-services` on Bitbucket) &mdash; the relevant
   controllers (`OrdersController`, `LineAnalysisController`,
   `RollForwardController`, `RunJobController`) are paste-ready
   spec material. Detail in
   [`RapidReconciler-Agent/docs/v359-vs-new-agent.md`](../../../RapidReconciler-Agent/docs/v359-vs-new-agent.md)
   &sect; *Phase 0 #4 cutover blockers*.
5. **Schema ETL** &mdash; Azure VALC's user / client / permissions /
   deploy-history data into VALC 2.0's Postgres. Coordinate the
   export and the import. Happens once at the DNS-flip moment.
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
8. **Operational ownership assignment** &mdash; decide per process
   which side handles it on the new infrastructure:
   - VALC deploy panel access (push Services updates to customers)
   - Customer onboarding (Add Database flow)
   - On-call rotation for the central server
   - SOC 2 audit responsibility for the new infrastructure

   Each process gets assigned based on its frequency, complexity,
   and the engagement hours available. Some processes naturally
   stay where they are today; others may shift.

**Exit criteria for Phase 0**: dev box runs V8 end-to-end against
VALC-2.0-issued JWTs across every customer-facing module, with
zero behavioral diff from the same flows on Azure VALC. JMS
protocol parity smoke against the legacy broker passes.

---

## Phase 1 &mdash; Internal cutover

- Stand up the production VALC 2.0 instance on its Azure VMs.
- DNS-flip GSI's OWN internal RR install onto VALC 2.0. Push
  the new Services jar to the GSI internal broker via the
  existing deploy panel.
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
- Watch the post-deploy health (system-status, agent-log, V8 /
  legacy SPA browser hits) for the next ~48 hours.
- Bug found? Redeploy v359 Services via the same panel.
  Customer-invisible.

**Exit**: customer hits their first month-end close on the new
stack without raising a ticket.

---

## Phase 3 &mdash; Rollout

- Rest of the customer base, push by push.
- Batch the easy ones (Inventory-only customers) early; save the
  module-coverage-edge-case customers for last.
- Tail off the early adopters as confidence grows; don't push all
  at once.

**Exit**: every customer on the new stack OR a documented
decision not to migrate.

---

## Phase 4 &mdash; Decommission

- Legacy Azure VALC SPA: archive + keep reachable for 90 days
  behind a fallback DNS record in case of late-discovered
  rollback needs. After 90 days clean: shut down.
- Legacy AngularJS SPA: separate decommission decision &mdash;
  depends on whether V8 covers everything the customer needs.
- The legacy `rr-valc-agent.jar` (broker) stays on customer boxes
  for now. Replacing it is a separate later effort with its own
  customer-impact analysis &mdash; out of scope for this cutover.
- Update SOC 2 audit materials, security questionnaires,
  customer onboarding docs to reflect VALC 2.0.

---

## V7 &harr; V8 customer switching

V7 (the legacy AngularJS SPA) and V8 (RRV8/) are **two independent
UI surfaces** that share the same Services jar backend and the same
auth source. A customer's installation can run on either at any
time, flipped by a single server-side flag. No customer action; no
DNS work; no broker changes; fully reversible.

### Mechanism (target design)

1. **Per-customer flag in VALC 2.0's Postgres.** New column
   `clients.ui_version` (values `'v7'` / `'v8'`; default `'v7'`).
   Ships in a Flyway migration alongside the other VALC 2.0
   schema changes.
2. **Landing-page redirect at the legacy URL.** The customer's
   bookmark (e.g. `rapidreconciler.getgsi.com`) hits a thin
   landing page that:
   1. Reads the user's JWT (post-login).
   2. Resolves `client_id` from the token's `dbs[i]` entry.
   3. Queries VALC 2.0 for that client's `ui_version`.
   4. Redirects to the V7 SPA host or the V8 static host
      accordingly.
3. **Per-customer flip control.** The VALC 2.0 Client Management
   page's Edit Client modal gains a **UI version** dropdown
   (`v7` / `v8`). Admin selects; PUTs to
   `/api/v1/admin/clients/{id}`; row updates; next login picks
   up the new value. No user-visible session interruption.
4. **Rollback.** Same dropdown. Flip back to `v7`; next login
   serves V7 again. The two surfaces never have to be torn down
   together &mdash; they coexist.
5. **Per-user override (deferred).** A `users.ui_version_override`
   column (nullable, falls back to client-level) lets specific
   power users opt into V8 ahead of their client's flip, or stay
   on V7 if they need a V8-incomplete module. Ship after the
   per-customer flag has bedded in.

### State combinations the cutover walks through

Each customer goes through some subset of these states &mdash; not
necessarily linearly:

| Services jar | UI surface | Notes |
|---|---|---|
| v359 | V7 | Status quo (pre-cutover). |
| v359 | V8 | **Not supported.** V8 expects the new agent's endpoints (e.g. `reconciliation/history`, `reconciliation/rows`, `audit-detail`). Customers must move to the new Services jar before the V8 flip. |
| New jar | V7 | Services jar swapped silently per Phase 2 below; UI flag stays at `v7`. V7 keeps working &mdash; the new jar speaks the same legacy endpoints. |
| New jar | V8 | The end state. Customer flipped via the VALC 2.0 dropdown when their module coverage is ready. |

The new Services jar swap and the V7&rarr;V8 flip are **independent
gates**. Customers whose module coverage isn't yet built (In
Transit / PO Receipts / Roll Forward) can ride on the new Services
jar for an indefinite stretch while their UI stays at V7.

### Sequencing within the phases

- **Phase 0** ships the `clients.ui_version` column, the landing
  redirect, the Client Management dropdown, and the V8 production
  hosting. V8 must be reachable at a stable URL before any flag
  can target it.
- **Phase 2** is the first customer's **Services jar** swap; UI
  flag stays at `v7`. That customer is now on `(New jar, V7)`.
- **Phase 3** rolls the Services jar to the rest of the customer
  base. UI flag stays at `v7` for all of them.
- After Phase 3, customers are flipped to V8 **one at a time** as
  their coverage and operator comfort allow. This isn't a phase
  with an exit criterion &mdash; it's an ongoing per-customer
  workflow run from the VALC 2.0 dashboard.

### Why this design

- **No DNS work per customer.** The bookmark URL doesn't change.
- **No customer conversation.** The flip is a server-side
  database write.
- **Independently reversible.** A misbehaving V8 page on customer
  X doesn't bottleneck the rest of the rollout; flip X back to
  V7, leave others on V8.
- **Coexists with the rollback story already in Phase 2.** Both
  knobs (Services jar version, UI version) live on the VALC 2.0
  dashboard; both flip the same way (admin selects, server-side
  push).

### Exit criterion for V7 &harr; V8 dimension

Every customer's `ui_version` is `'v8'`, with no rollback-to-V7
flips in the last 30 days. At that point V7 can be considered for
decommission (legacy SPA archive + 90-day fallback per Phase 4).

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
| **Phase 3** &mdash; rollout | 1&ndash;2 months | **2&ndash;4 weeks** | Each push is one day; pushes can be paralleled cautiously once Phase 2's first customer has stabilized. |
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
Services jar. Same lifecycle pattern as today.

### `RapidReconciler-Valc`

**During cutover** &mdash; the biggest changes land here. Repo
name keeps "Valc" for historical continuity even though the
product is "VALC 2.0" in user-facing language.

- Provisioning flow (full 7 phases).
- Auth (login + change-password + JWT minting + password policy).
- Schema ETL tooling (or a new sibling sub-folder for migration
  scripts).
- Multi-tenant hardening &mdash; VALC 2.0 becomes a hosted
  service on Azure VMs with the ops responsibilities that come
  with that.
- Operational tooling (monitoring, backup, restore).

**After cutover** &mdash; this is a hosted service with uptime
+ backup + breach-blast-radius obligations.

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

- **Azure VALC SPA repo** &mdash; archived after phase 4.
- **v359 Services jar source** &mdash; superseded by
  `RapidReconciler-Agent`. Archived.
- **Legacy AngularJS SPA repo** &mdash; lifecycle depends on
  whether any customer still needs it after V8 covers their
  modules.
- **Legacy `rr-valc-agent.jar` source** &mdash; stays for now.
  Eventual replacement is a separate later effort.

**Note on legacy-stack sources**: this repo doesn't currently
mirror them. Phase 0 includes mining what's needed via `javap`
on the deployed jars + DevTools observation against the live
staging SPA. The cutover runbook lives in `RapidReconciler-UI`;
no direct edits to the legacy sources are required.

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
- **Per-process operational-ownership assignments** &mdash; which
  side handles what on the new infrastructure is decided at
  cutover time, not pre-committed here.
- **Pricing / contract implications** &mdash; if VALC 2.0 enables
  capabilities not in the old contract, separate conversation.
- **The split-repo decision** discussed in earlier session
  conversations. It's related but independent &mdash; cutover
  works either way.

---

## Work queue &mdash; recommended sequence

Consolidated backlog as of 2026-05-27, ordered for working through
when capacity frees up. Each item notes **what**, **why it's here in
the order**, **where it lives**, and **what it depends on**. Phase
references point at the Phase 0&ndash;4 sections above; items without
a phase tag are smaller fixes that surfaced during V8 / VALC 2.0
build-out and aren't gated by the cutover sequence.

This is a living list &mdash; reorder as dependencies shift. The
guiding rule: **finish the auth foundation first** (it unblocks real
multi-DB testing, permission gating, and retires the synthetic dev
token), then clear the cheap high-value fixes, then the feature
breadth, then the cutover-infrastructure long poles.

### Tier 1 &mdash; Auth foundation (do first; unblocks the most)

1. **Finish the JWT claim-shape rewrite** (Phase 0 #1). `dbs[i].n`
   matching is **DONE** (agent `JwtAuthFilter.selectDbEntry`,
   PR #40). **Re-scoped 2026-05-30** against the V7 source &mdash;
   the "phantom fields" framing in the original HANDOFF was
   superseded; the fields exist in V7 tokens, the new agent reads
   them correctly. Real remaining work:
   (a) resolve the `dbs[i].t` key collision (V7: inTransit array;
   VALC 2.0: tabs object);
   (b) make VALC 2.0 emit `dbs[i].p` (PO Receipts companies; today
   absent);
   (c) decide username-source canon (`sub` vs `user.u`) and ensure
   the new agent matches VALC 2.0;
   (d) reconcile the `as / aite` semantic flip (V7 semantics vs
   VALC 2.0's Import-JDE squash).
   Full punch list: [`RapidReconciler-Agent/docs/v359-auth.md`](../../../RapidReconciler-Agent/docs/v359-auth.md)
   &sect; *What the new agent must change*.
2. **mini-VALC mints real tokens** &mdash; `JwtService.mint()` emits
   the v359 wire shape (`{user:{id,fn,c,u,rm}, dbs:[{ip,k,n,i,t,p,a}]}`);
   `AuthController` at `POST /resource/client/login` with
   `{username,password,rememberme}` &rarr; `{token}`. Once live, the
   dev box logs in through VALC 2.0 and the **synthetic dev token is
   retired** (no more hand-pasting into `localStorage`; no more
   "staging VALC has no Dev entry" caveat). Depends on #1 for the
   claim shape.
3. **Change-password flow** &mdash; `POST /resource/client/change-password`
   on mini-VALC, enforcing the on-disk `PasswordPolicyService` rules
   (8-char min, 3-of-4 complexity, history-of-10, gated by
   `clients.password_policy_active`). V8 `login.html` flips `AUTH_BASE`
   to `localhost:8080`. Depends on #2.

### Tier 2 &mdash; Cheap, high-value fixes (clear these next)

4. **VALC 2.0 Start-button bug** &mdash; Clients dashboard Test-agent
   popover Start silently no-ops; agent must be launched via
   `run-test-agent.ps1`. Surface the `ProcessBuilder` exception to the
   dashboard toast + precheck the jar/JDK paths. Full write-up at the
   top of `RRV8/HANDOFF.md` Next-session queue. No dependencies.
5. **DMAAI page `beforeunload` guard** &mdash; warn the analyst when
   closing with unsaved responses. Tiny. No dependencies.

### Tier 3 &mdash; Feature completion (depends on Tier 1 auth)

6. **Permission gating in the V8 user menu** &mdash; hide Import JDE /
   Restart Service / etc. based on the JWT's per-DB flags. Needs the
   corrected flags from Tier 1 #1, else everything reads false.
7. **mini-VALC provisioning flow** (Phase 0 #7) &mdash; Add Database
   &rarr; spawn Services jar, per
   [`mini-valc-database-provisioning-production-ready.md`](mini-valc-database-provisioning-production-ready.md).
   Pick the topology gate (per-customer vs central broker) before
   starting &mdash; every hardening choice depends on it.
8. **Deployment Center real wiring** &mdash; the `/valc/deployment`
   DB-script execute and Services-release deploy are stubs today
   (per-target placeholder results). Wire DB-script dispatch to the
   selected customer databases and Services-release push through the
   agent self-update path. Depends on #7 (provisioning) for the
   target-database plumbing.

### Tier 4 &mdash; Module breadth (Phase 0 #4)

9. **Build In Transit / PO Receipts / Roll Forward** &mdash; new-agent
   controllers + V8 pages. The legacy SPA serves these today; the new
   agent has no controllers for them. Gates which customers are
   eligible for the Phase 2 / 3 push. **V7 source is paste-ready
   spec** as of 2026-05-30: see
   [`RapidReconciler-Agent/docs/v359-vs-new-agent.md`](../../../RapidReconciler-Agent/docs/v359-vs-new-agent.md)
   &sect; *Phase 0 #4 cutover blockers* for the controller / endpoint
   list. Highest leverage: `OrdersController` (covers BOTH In Transit
   AND PO Receipts order surfaces in one controller, 8 endpoints).

### Tier 5 &mdash; Cutover infrastructure long poles

10. **JMS protocol parity** (Phase 0 #2) &mdash; VALC 2.0 Artemis
    broker accepts legacy `rr-valc-agent.jar` connections (CORE
    protocol, existing truststore, post-DNS-flip hostname). Validate
    end-to-end against a real legacy broker.
11. **Signing-key inheritance** (Phase 0 #3) &mdash; VALC 2.0 adopts
    Azure VALC's RSA private key so both stacks verify the same
    tokens at cutover. **Caveat surfaced 2026-05-30**: V7's Services
    jar (`rr-client-services/TokenService`) does NOT actually verify
    signatures (it calls `isSigned()` &mdash; a structural check &mdash;
    then Jackson-deserializes the payload directly). The new agent
    + VALC 2.0 use modern jjwt's `parseSignedClaims()` which DOES
    verify. Pre-Phase-2 validation step: decode a real customer
    token, verify the signature + `exp` against the candidate
    VALC 2.0 public key end-to-end before silent push. Tokens that
    quietly worked on V7 may be rejected by the new agent. Detail in
    [`RapidReconciler-Agent/docs/gotchas.md`](../../../RapidReconciler-Agent/docs/gotchas.md)
    &sect; *Signature verification difference*.
12. **Schema ETL + password-store strategy** (Phase 0 #5, #6) &mdash;
    migrate users / clients / permissions / deploy history into VALC
    2.0 Postgres; confirm the password hash format carries over (if
    not, forced-reset is customer-visible &mdash; flag early).

### Tier 6 &mdash; Quality &amp; polish (parallelizable)

13. **DMAAI overlay endpoints** &mdash; three agent endpoints + two
    SQL tables specced in
    [`docs/plans/dmaai-page-overlay-table.md`](dmaai-page-overlay-table.md);
    detector reference is `derive-dmaai-analysis.py`.
14. **Implement the V8 test suite** &mdash; `RRV8/TESTING.md` 8-tier
    plan; PowerShell pre-push hook for fast tiers, Python in GHA for
    all tiers.
15. **Certificate import real-world test** &mdash; round-trip a real
    DigiCert-signed cert through `/valc/certificate/import` once one
    is in hand (the generate-CSR side is verified; import is
    untested against a real signed cert).

### Not in this queue (tracked elsewhere)

- The `rr-valc-agent.jar` broker replacement (explicitly out of
  cutover scope &mdash; see *What this plan deliberately does NOT
  cover*).
- Demo-mode rebuild (frozen until the Inventory module is complete,
  per the production-only tenet in `RRV8/WORKFLOW.md`).
- Operational-ownership assignment (Phase 0 #8) &mdash; a decision,
  not an engineering task; settled at cutover time.

---

## Release notes &mdash; cutover-relevant commits

Curated list of merged PRs that materially advance the cutover.
Append each new cutover-relevant commit at the **top** so the most
recent landing reads first. Format: `YYYY-MM-DD &middot; repo#PR
&middot; short summary &middot; tier / phase reference`.

### 2026-05

- 2026-05-27 &middot; **Agent #40** &middot; `JwtAuthFilter` scopes
  by matching `dbs[i].n` against `agent.database-name` (not
  `dbs[0]`); fallback to `dbs[0]` with WARN. &mdash; *Phase 0 #1
  / Tier 1 #1 (partial).*
- 2026-05-27 &middot; **UI #144** &middot; HANDOFF queues the VALC
  2.0 Start-button bug at top of Next-session queue. &mdash;
  *Tier 2 #4.*
- 2026-05-26 &middot; **Valc #21** &middot; Certificate Renewal
  page (CSR generator + signed-cert import, broker keystore
  mining); Troubleshooting tabs (out.log + Console log analyzer);
  sidebar polish (cert chip, scrollable, Client Management /
  Certificate Renewal labels). &mdash; *VALC 2.0 control plane
  build-out.*
- 2026-05-26 &middot; **Valc #20** &middot; Deployment Center
  page (DB Scripts + Services Release tabs, stub execute); new
  Troubleshooting page (customer connection + out.log import);
  shared sidebar tail across pages. &mdash; *VALC 2.0 control
  plane build-out.*
- 2026-05-26 &middot; **UI #143** &middot; HANDOFF refresh
  (standing-rule block, Resume prompt for the next session).
  &mdash; *Cutover-plan upkeep.*
- 2026-05-26 &middot; **UI #142** &middot; Cutover-plan framing
  refinements; workspace-cwd-migration plan filed. &mdash;
  *Cutover-plan upkeep.*
- 2026-05-26 &middot; **Valc #19** &middot; Sidebar link renamed
  to "VALC 2.0 cutover plan." &mdash; *Naming alignment.*
- 2026-05-26 &middot; **Valc #18** &middot; Clients dashboard
  card-grid layout, sidebar link to the cutover plan, JwtService
  keydir fix. &mdash; *VALC 2.0 control plane build-out.*
- 2026-05-25 &middot; **Valc #17** &middot; Dashboard polish +
  auth scaffolding (JWT shape rewrite still queued). &mdash;
  *VALC 2.0 control plane build-out.*
- 2026-05-25 &middot; **Agent #39** &middot; Mined v359's auth
  surface; flagged the new agent's claim-shape divergence.
  &mdash; *Phase 0 #1 prep.*
- 2026-05-25 &middot; **Agent #38** &middot; Reconciliation
  by-company endpoint kills the Cardex Variance N+1 (one call
  replaces the per-customer loop). &mdash; *Performance.*
- 2026-05-25 &middot; **Agent #37** &middot; Janitor: hourly
  cleanup of legacy export-breadcrumb files left behind by the
  legacy broker. &mdash; *Housekeeping.*
- 2026-05-24 &middot; **Agent #36** &middot; Tag-triggered release
  GitHub Action wired up. &mdash; *Release plumbing.*
- 2026-05-24 &middot; **Agent #35** &middot; AdminDatabases +
  `companies/all` loopback-only server-admin endpoints. &mdash;
  *VALC 2.0 control plane API.*
- 2026-05-24 &middot; **Agent #34** &middot; AdminCompanies GET +
  PUT + unlicensed list. &mdash; *VALC 2.0 control plane API.*
- 2026-05-24 &middot; **Agent #33** &middot; Documentation: v359
  vs new agent reference. &mdash; *Onboarding / handover.*
- 2026-05-24 &middot; **Agent #32** &middot; Poll endpoint
  long-poll parity with v359 (60s hang on
  `?updating=&recalculating=`). &mdash; *V8 / agent compat.*

Earlier merges that pre-date the cutover-plan framing aren't
back-filled here; pull from each repo's `git log` if archaeology
is needed.
