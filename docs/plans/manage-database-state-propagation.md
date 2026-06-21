# Manage Database — state-propagation & tinting fixes

Owner audited the VALC Deployment Center **Manage Database (Installations)**
workflow and approved fixing all of it. This doc is the finding→fix table; work
is sequenced into four chunks, each its own commit + VALC restart.

**Symptom that triggered the audit:** on the co-resident instance
`10.4.3.132` (NA / TR / Dev share one SQL Server + one SSISDB catalog
project), TR's SSIS badge shows **"deployed"** with **no version** and **no
amber prompt**, even after a redeploy.

**Root cause:** the SSIS catalog *project* is shared per SQL instance, but the
version badge reads a **per-DB `client_deploys` 'ssis' row**. Only the DB whose
own *Package Deploy* (`deployPackage`) ran gets that row; co-resident siblings
share the project but have no row → `ssisInstalled = true`, `ssisVersionKnown =
false` (`DeploymentController` L317-331). The catalog-only state then renders
**green** at every surface, so the operator gets no signal that a stamp is
missing.

---

## Corrected findings (vs. the original handoff audit)

The handoff audit predated Valc #140, which already added install-tab band
tinting. Verified against the committed code (Valc `main=Dev=101e77b`):

| Handoff claim | Actual state in code | Implication |
|---|---|---|
| "install tab doesn't tint component bands from the picked DB's pills at all" | **Stale.** `mdSyncStepTints` (deployment.html L7621) mirrors db-pill→band 9, svc-pill→band 8, ssis-pill→band 4, run on customer+DB change via `refreshBands()`. Mirrors the Upgrades-tab `ugSyncStepTints` (L2990). | "Tint-B" is essentially done. The remaining gap is that the SSIS *chip* is `is-current` (green), so the band tints green, not amber. |
| "the 'deployed' chip is GREEN (`is-current`)" | **Confirmed.** L1403 / L2294 / L2425 — chip `is-current` "deployed", catalog-only. | Tint-A is the live fix: amber chip → drives `comp-behind`. |
| SSIS band greened by deploy state | `instSsisRefreshStepState(complete, deployed)` sets band 4 `is-done` (green) when `deployed` (L4527-4529); `deployed` is true for catalog-only. | Band must read amber, not green, for the catalog-only/no-version case. |
| deployed-note | `instSsisRenderDeployedNote` (L4578) shows a **green `is-ok`** banner for catalog-only ("Deploy a release to stamp this database's version"). | Make it amber + a one-click stamp action. |

---

## Chunk 1 — amber-signal cluster (fixes the TR experience) — IN PROGRESS

Goal: the catalog-only / no-version-stamp SSIS state reads **amber (action
needed)** consistently — chip, band, and note — and offers a one-click stamp.

- **Tint-A — chip.** Replace the version-unknown "deployed" chip's `is-current`
  (green) with a dedicated **`is-needs-stamp`** class (amber, same palette as
  `is-behind`), in all 3 picker blocks (L1403 / L2294 / L2425). Add the CSS.
  Keep the "deployed" text + the existing stamp tooltip.
- **Tint band wiring.** Teach `mdSyncStepTints` (L7621) **and** `ugSyncStepTints`
  (L2990) to treat `is-needs-stamp` like `is-behind` → `comp-behind`. Leave
  `ugAllCurrent` (L3067, counts only `.is-behind`) untouched so the Upgrades-tab
  "fully current" gate semantics don't shift — the needs-stamp signal is an
  install-tab concern surfaced by the band + the note.
- **Band 4 (SSIS Package Deploy).** Thread a `needsStamp` state into
  `instSsisRefreshStepState` so the band reads amber (not green `is-done`) when
  catalog-only-without-version.
- **#8 endpoint.** `ssis-config-status` returns `needsVersionStamp:true` when
  `inCatalog && no per-DB version` (DeploymentController L912-950).
- **#8 prompt.** `instSsisRenderDeployedNote` (L4578) renders an amber note + a
  one-click **"Package Deploy on this DB to stamp the version"** button
  (preselect the latest SSIS release + trigger Deploy when SQL Agent is up).
  `deployPackage` already records the per-DB row on completion.
- **Deferred to Chunk 3:** optionally fan the deploy record to all co-resident
  tracked DBs on the instance (the genuinely-complete fix for "even after a
  redeploy"). Lives near the deploy-recording unification.

## Chunk 2 — one JSON refresh path (#2/#4, retires #3) — DONE

**As built.** Adds `GET /valc/deployment/client-databases?clientId=` returning the
picked customer's `UpgradeDb[]`, built from an extracted `buildUpgradeClients()`
helper that the page handler now also calls — so the refresh data can never drift
from the page model (single source).

`step1MarkDeployed` (the brittle one-lane optimistic patch that only touched the
deployed lane on one drawer and never picked up server-side effects like a
catalog-only SSIS becoming version-known) is **retired**, replaced by
`step1RefreshDeployed(dbId)` → re-fetch the endpoint → `mdApplyRowLanes` rewrites
that row's three lanes (ver + currency pill, incl. the `is-needs-stamp` →
`is-current` flip) in **both** drawers from server truth → re-run both band tints
(`ugSyncStepTints` + `window.mdSyncStepTints`). Wired into all three deploys (DB /
Services / SSIS) and the Chunk-1 SSIS stamp. `data-role` ver markers were added to
the Manage drawer for uniform addressing (parity with the Upgrades drawer).

**Deliberately kept as full-page reloads (structural add/remove, low-risk, rare):**
register an unregistered DB and untrack/decommission — those add or remove a picker
row, and a reload is the robust path (no bespoke client-side row-builder to drift
from the Thymeleaf markup). A new-DB **install** stays mid-wizard (no reload) so the
flow continues into Step 4; its row appears on the next natural reload. These three
are the remaining candidates if a future pass wants zero reloads.

**Verified:** VALC compiles + starts clean; `/valc/deployment` renders fully (no
truncation; only the new `data-role` attrs differ from baseline, modulo pre-existing
row-order non-determinism); the endpoint returns data identical to the page model
(DB 23/TR `ssisVersionKnown:false`, DBs 1/24 version-known). The live deploy/stamp
re-sync is owner-verified in the browser.

## Chunk 3 — unify the version model (#1/#5/#6) — DONE (fan-out deferred)

**As built.**
- **Cold install records a deploy row.** `DbInstallService.install` published the
  schema via its own SqlPackage call and stamped only the `databaseVersion`
  column — no `client_deploys` row (unlike the upgrade path's `publishDacpac`).
  It now records a SUCCEEDED `database` deploy row after register (component
  derived from the linked `file_versions` row, as `publishDacpac`). Best-effort:
  a history-write failure logs + continues (the install already succeeded).
- **Render-time DB drift flag.** `UpgradeDb.dbDrift` + `deployedDbVersion`:
  computed in `buildUpgradeClients` as the live/stamped column version vs the
  latest SUCCEEDED `database` deploy. Flagged only when **both** exist and differ
  (an out-of-band publish or a stamp that didn't take) — a column-only/legacy row
  is *not* drift, just unrecorded (no false positives for pre-change installs).
  Surfaced as a hidden-unless-drift amber `live ≠ deployed` chip on the Manage
  drawer DB lane; `mdApplyRowLanes` toggles it on re-sync so a redeploy clears it.
- The DB lane keeps the column as the displayed version (it's the authoritative
  live stamp from the agent heartbeat); the deploy-history is the drift basis +
  the now-uniform record. Services/SSIS already key off deploy-history.

**Deferred: the SSIS co-resident fan-out** (write the `ssis` deploy row to every
co-resident tracked DB on the instance when one deploys, since they share the
catalog project). It writes deploy rows for DBs that didn't directly deploy, so
it's best landed with a live catalog deploy to verify — pairs with Chunk 4.

## Chunk 4 — phase-2 durability (#7/#9) — DONE

**As built (Valc, V51).**

**Part A — durable per-(db,step) "done" markers.** New table `client_database_steps`
(`V51`, unique on `(client_database_id, step)`, `step ∈ {bootstrap, load, schedule}`)
+ `ClientDatabaseStepEntity` / repo / `DbStepMarkerService` (mark / clear / sync /
completedSteps). Recording is **server-side at the same VALC endpoints each band
already hits**, so markers accrue on the first reachable visit — no backfill:
- `ClientDatabaseController.companiesLicensedForDb` — rcompanies rows present →
  `mark(bootstrap)` (mark-only; an empty read is "not yet", and bootstrap is sticky).
- `DeploymentController.ssisLastExecution` — execution `Succeeded`/`Completed` →
  `mark(load)` (sticky; a later failed re-run doesn't un-load the data, and the live
  read still shows the failure).
- `DeploymentController.refreshSchedule` + the toggle — `sync(schedule, rfEnabled)`
  (the msdb read/toggle reached the box, so it's authoritative — mark on, clear off).

Read path: `GET /valc/deployment/db-step-markers?databaseId=` → `{bootstrap, load,
schedule}`. The install tab's existing-DB select handler calls `mdSeedStepMarkers(dbId)`
(awaited, **before** the live cascade) to toggle bands 5/6/7 `is-done` from the markers.
The live probes then refine — each only writes `is-done` on a *reachable* success and
leaves it untouched on failure/unreachable (verified in code: `instLoadCompanies`
returns early without clearing, `instRenderTableCounts` early-returns on an empty list,
`instLoadSchedules` returns on a non-ok read), so a marker-seeded green **survives a
failed probe** — the durability win. Live wins when the box is reachable.

**Part B — per-row Clients-card probe.** `DashboardController.snapshot()` now probes
**every** database with a `service_port` once (keyed by db id), instead of probing one
`_PROD`-preferred DB and applying it to all. Per-DB `online` + `systemStatusLabel` /
`systemStatusKind` / `systemMessage` (new `AgentStatusDto.DatabaseStatus` fields) come
from each row's own probe; the old "single-probe heuristic" re-rate is gone. The
**card-level pill stays `_PROD`-preferred** (owner's call) — per-DB detail surfaces in
the Database popover (Thymeleaf + the 5s JS poll renderer both updated; shared
`jobStatusBadge` helper keeps the card pill and per-DB mapping from drifting). Footprint:
`AgentHealthProbeService.probe()` now skips `/poll` when `/health` got no response, so a
dead port costs one quick refused connection, not two 2s waits (prod is 1-DB-per-client
anyway).

**Verified live (2026-06-21):** V51 applied; markers auto-recorded for TR/NA
(bootstrap+load) on reachable visits; `db-step-markers?databaseId=23` →
`{bootstrap:true, load:true, schedule:false}`; install-tab bands 5/6 seed green on
select (no console errors; R5a badges renumber); `/api/agents` carries genuinely
per-DB status (Acme's TR/Dev/NA show distinct "data as of" times). The multi-DB card
popover uses the same renderer over this verified data; owner to eyeball in the card
view (the preview session was in the compact healthy-cell grid view).

Minor known cosmetic: in the *reachable* case the Load band can blip green→gray→green
on select (the marker seeds green, the first catalog render clears it before the
done-sources accrue, then it re-greens). Ends correct; the unreachable/durability path
doesn't flicker (early-return, no render). Smooth later only if it bothers.

---

# SSIS package = server-instance (redesign, 2026-06-21)

Owner-approved redesign. The SSISDB catalog **project is per SQL instance** (one
project/package shared by every DB's environment on that server). Modeling
*Package Deploy* as a per-database step was the root cause of the TR
"deployed, no version" symptom + the Chunk-1 needs-stamp chip + the Chunk-3
co-resident fan-out. Fix it at the true grain.

**Decisions (owner):** key the package deploy to the **server instance**; keep the
Services pill + version in Step 1 but show a **Start button when not running**;
replace the Step-1 package-version pill with an **environment-build status**.

### R1 — Services Start button (Step 1)  *(spec; needs a running-signal decision)*
When a DB's Services instance is installed but **not running**, show a **Start**
button in the Step-1 svc lane instead of "current"; keep version + currency when
running. Reuse the per-row spawn endpoint (`ClientDatabaseController.start` →
`AgentLifecycleService.start`). **Open fork:** the "running" signal needs a live
probe. Eager (probe every fleet DB's `service_port` in `buildUpgradeClients`) is
simple but raises the page's diagnostic footprint across the whole fleet (memory
`feedback_low_diagnostic_footprint`). Lazy (probe only the selected DB on pick,
like the existing per-DB cascade) keeps footprint low but only the selected row
shows the button. **Recommend lazy** — decide with the owner.

### R2 — Package version keyed to the server instance  *(schema + live deploy path)*
- **Schema migration:** add `server_id` to `client_deploys` (nullable). An `ssis`
  deploy is recorded with `client_database_id = null` + `server_id` set (the
  instance the shared catalog project lives on); DB/Services rows are unchanged
  (still per-DB).
- **`SsisDeployService.deployPackage`** records the row server-keyed (resolve the
  target DB's `server_id`; set it, leave `client_database_id` null).
- **Reads:** `buildUpgradeClients` + `FleetRolloutService` read the SSIS package
  version by **server** (latest SUCCEEDED `ssis` deploy for the DB's `server_id`),
  not per-DB. Co-resident DBs then all read the one server row — the fan-out
  problem disappears.
- **Verification:** needs a live catalog deploy → do with the owner watching.

### R3 — Manage Step-1 SSIS pill → environment-build status  *(DONE — safe/verifiable)*
The env (connections, decimals, tunables) is the genuinely per-DB SSIS concern.
`UpgradeDb.ssisEnvComplete` computed from `ssisConfig.missingConfig(dbId)` (cheap,
VALC-side only). The Manage Step-1 SSIS lane shows **env built** (green) /
**env not built** (amber) instead of the package version + the (now-removed)
needs-stamp chip. The package version lives in Fleet Rollout (R4). `mdApplyRowLanes`
handles the env pill on re-sync. Upgrade/Troubleshooting drawers keep the version
pill (out of Step-1 scope).

### R4 — Fleet Rollout SSIS step → per server instance  *(depends on R2)*
Fleet Rollout already deploys SSIS, but **per database** (`runTarget` →
`deployPackage` per target DB). Re-key it: dedupe SSIS targets by `server_id` so the
shared package deploys **once per instance**, not once per co-resident DB. The
package version column on the rollout board reads the server row.

### R5 — Install-flow env-build gate  *(depends on R2)*
A new customer's first DB can't build its environment or load until the package is
on that server. The R3 env-build pill carries a **"package not on this server yet"**
gate (env can't go green without the catalog project present) linking to the Fleet
Rollout deploy step, so a fresh install doesn't dead-end.

**R5a — hide the per-DB SSIS Package Deploy step for an existing database (DONE).**
Because the package deploy is now a server-level operation (Upgrades tab, once per
SQL instance), the Installations **Step 4 "SSIS Package Deploy"** band is redundant
for an EXISTING database whose server already carries the shared catalog project.
`showSsisDeployStep(show)` (deployment.html) hides `[data-inst-step="4"]` when an
existing DB is picked and renumbers the trailing SSIS/load badges so the visible run
is gap-free (`…S · 4 env-build · 5 bootstrap · 6 load · 7 schedule`); the new-install
and no-selection paths keep the step + original `4·5·6·7·8` numbering. Wired into the
no-selection / customer-reset / new-DB / existing-DB branches of the Step-1 selection
handler; covers the `?add=1` / `?remove=` deep-links (both route through the same
change handler). Verified live (preview): existing→hidden+renumbered, new→restored,
no console errors.

**R5b — env-build "package not on this server yet" gate (DEFERRED — failsafe only).**
The case where an existing DB's server genuinely lacks the project is **already
surfaced on the Upgrades tab**: `FleetRolloutService.ssisServerTargets` lists every
active located server and sets `behind = (current == null || version mismatch)`, where
`current = serverSsisVersion(sid)` is null when the server has no SUCCEEDED `ssis`
deploy row. So a server missing the package shows up as a Step-2 target exactly like a
behind one — the Upgrades tab is the authoritative surface. The install-tab env-build
amber gate would only be a failsafe/signpost (point the operator to the Upgrades SSIS
step), not the primary signal. Deferred per owner — build it only if the failsafe is
worth the surface.

### Supersedes
R2+R3 retire the **Chunk-1 needs-stamp amber chip** and make the **Chunk-3 SSIS
co-resident fan-out** unnecessary — both existed only because of the per-DB row
model. (Chunk-3's DB drift flag + cold-install deploy row are about the *database*
version and stay valid.)
