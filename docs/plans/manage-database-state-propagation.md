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

## Chunk 4 — phase-2 durability (#7/#9)

Persist a per-(db,step) "done" marker in VALC so Bootstrap/Load/Schedule green
from a durable flag (not live catalog/msdb only); per-row DB probe on the
Clients card (today one-probe-applies-to-all).
