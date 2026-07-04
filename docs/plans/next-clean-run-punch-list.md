# Next clean-run punch list — dacpac + ispac + VALC

**Purpose:** collect ALL load/reconcile issues + fixes into one place, so the **next dacpac + ispac** carry
everything and Demo1's reset → reload → B→C runs clean end-to-end in one pass. **Owner is feeding issues as
he tests staging loads — DO NOT start coding until the list is called complete** (owner, 2026-07-05).

**Status key:** ✅ coded/held · 🔎 needs read-only investigation before coding · 📋 spec'd, not coded ·
🆕 captured, needs design · ⏳ incoming from owner testing.

---

## Execution sequence (Claude's to-do) — HOLD until owner reviews

Ordered by dependency. Item IDs (A#/B#/C#/D#) point to the detail tables below.
**Already done (coded + live in Demo1):** A1, A2/A5, A3, A6, the 7 proc note blocks, the watermark trace;
ispac perioddate Execute SQL Task = owner-deployed (B1). Nothing below is started yet.

**Phase 1 — finish the dacpac DB code**
1. **A4** — write `usp8_reload_truncate_group @group`: truncate each group's live + `Staging_*` tables;
   **leave `RTransactions` / `RPerpetualInv` / `RInvAsOf`** (owner decision 2026-07-05 — the next B→C
   rebuilds them). No watermark reset (self-resets on truncate). Add to `.sqlproj`; `CREATE OR ALTER` into
   Demo1. *Derive the authoritative group→table map read-only from `SsisConfigService` when coding.*
2. **A7** *(only if owner opts in)* — `usp6_008` NULL-aggregate guard (`ISNULL`/`COALESCE`).

**Phase 2 — build + validate the dacpac**
3. MSBuild Release → clean build (exit 0); sanity-check the model (6 indexes gone, `usp8_stamp_f4111_new`
   + truncate proc present, 006 fix present, data_prep perioddate removed). *No customer deploy — build only.*

**Phase 3 — VALC changes** (redeploy activates all of these + the already-coded C2/C3)
4. *Prereq trace (read-only):* production Agent job name + confirm the package reads mode/params from the
   config table (`SsisConfigService`). Needed for C0.
5. **C0** — LOAD → `sp_start_job` the production job; STOP → `sp_stop_job`; verify job/catalog state before
   resetting the UI (root-cause fix for **D5**).
6. **C1** — Reload buttons = truncate + load (call `usp8_reload_truncate_group`, then run the group load).
7. **D1** — board "changed rows" reads `RSsisLoadLog.changed_rows` (0 on static); reconcile the `expected`
   baseline.
8. **D2 / D3** — activity log: accumulate/persist entries, never clear on an empty poll; endpoint returns
   full execution history.
9. **C4** *(only if owner opts in)* — finer 6-group picker.

**Phase 4 — deploy + clean run** (owner-driven; I verify read-only)
10. *Owner:* deploy dacpac + ispac; redeploy VALC (activates C0/C1/C2/C3/D1/D2/D3 + #9/#11).
11. *Owner:* full reset Demo1 → reload (new ispac) → B→C.
12. *Me (read-only):* verify — 006 inserts the ~809K rows with the error surfaced (no swallowed dup);
    perioddate stamped at LOAD (data_prep pass gone); 6 indexes absent; STOP cancels; activity log stable;
    board changed-rows correct. Re-walk rows 14/15/19 on complete data + measure 006 vs the 20.6-min baseline.

**Need from owner (to unblock, review these):**
- **A7** in this dacpac, or defer? **C4** in this round, or defer?
- **C0:** OK to trace the production job name + config-driven mode read-only (VALC + `.dtsx`)? Or give me the job name.
- **D4:** the "Copy F0911 to Staging" warning detail text, when convenient.
- Sequencing: OK to do Phases 1–3 straight through, then hand to you for Phase 4 (deploy + reset)?

---

## A. DB — dacpac

| # | Item | Status | Notes |
|---|---|---|---|
| A1 | `usp6_006_inventory` swallowed-error fix (Defect A: capture `@err/@@rowcount` immediately after the insert; Defect B: `NOT EXISTS` idempotency guard) | ✅ coded/held | Already in repo `.sql` + deployed to Demo1 via `CREATE OR ALTER`. Must be in the dacpac so the reset doesn't revert it. Fixes the 809K-row silent loss. |
| A2 | Repo-only `B-TO-C ANALYSIS NOTES` blocks in 7 procs (006 / 006_data_prep / 006b / 006a / 007 / 008 / 009) | ✅ coded/held | Comment-only; rides along in the dacpac. |
| A3 | Drop 6 redundant duplicate indexes | ✅ done + dropped in Demo1 | **Validated read-only, all 6 safe** (no code hints, keys duplicate a sibling NC index or the clustered PK): `F4211.idx_f4211_purget`, `F42119.idx_f42119_purget`, `F4311.idx_f4311_purget`, `RPerpetualInv.idx_rperpetualinv_itemid`, `RCompanies.idx6_rcompanies_company`, `RInvasOf.idx_rinvasof_per_item`. Remove the `CREATE NONCLUSTERED INDEX` blocks from the table `.sql` files → SqlPackage emits DROP on publish. Cuts per-load write cost. |
| A4 | `usp8_reload_truncate_group @group` proc (truncate live + staging tables per group) | 🆕 ready to design | **Watermark trace DONE:** watermarks are NOT stored — "Compute Load Dates" derives them from `MAX()` of the live table each run (`maxUKID = isnull(max(ilukid),0)`, `DateF4211 = MAX(sdupmj) F4211`, `d4311 = MAX(pdupmj) F4311`, `d3106 = MAX(sddicj) F3106`, GL batch via `case when not exists`). So **truncating a table auto-resets its watermark** (empty → MAX NULL → 0 → next pull takes everything); no explicit reset needed. The proc just truncates the group's live + `Staging_*` tables (`DELETE` where a FK blocks `TRUNCATE`). Open: does an Item/Inventory reload also clear the B→C artifacts `RTransactions`/`RPerpetualInv`/`RInvAsOf`, or leave them to the next B→C? |
| A5 | perioddate stamp-at-load — new proc `usp8_stamp_f4111_new` | ✅ coded + in Demo1 + in `.sqlproj` | Lifts data_prep's perioddate/datelev logic verbatim (init + `usegldate` 0/1 branches) so it runs at LOAD via the SSIS task (B1). Compile-clean `CREATE OR ALTER` into Demo1. |
| A6 | Remove the perioddate section from `usp6_006_inventory_data_prep` | ✅ done + in Demo1 | Section 482–616 removed (init + `usegldate` 0/1 branches + its local index disable); kept the `usp6_maint_enable_indexes` that re-enables the cost/uom + itemid disables; pointer comment left. Compile-clean `CREATE OR ALTER` into Demo1. **Depends on B1 (the ispac stamp task) being present** — a load without it would leave perioddate/datelev unstamped. |
| A7 | `usp6_008_1`/`008_2` NULL-aggregate guard (`SUM(ISNULL(col,0))`) | ✅ shipped **beta.37** | Result-preserving wrap of `SUM(variance/amount/ledgeramount)`; clears the two "Null eliminated by an aggregate" warnings. |
| A8 | **PostDeployment MAXDOP `CONVERT('OFF')` crash fix (Msg 245)** | ✅ shipped **beta.38** | `WHERE name='MAXDOP' AND CONVERT(int,value)<>4` over `sys.database_scoped_configurations` evaluated `CONVERT(int,value)` on sibling boolean configs (`ELEVATE_ONLINE`/`…`, value `'OFF'`) → Msg 245 → **failed the whole publish after the version stamp** → made beta.36/37 un-deployable on any DB (all 3 RR DBs hit it). Fixed: read MAXDOP into a scalar via `TRY_CONVERT` first. Verified live. **Re-deploy beta.38 to Demo1/NA/TR to clear the failed/amber status** (they're functionally at beta.37; the skipped PostDeploy tail is minor). |
| A9 | **AG carve-out for PostDeployment DB-option changes** (`SET RECOVERY SIMPLE`, log-growth, MAXDOP) | 🆕 §5 flagged | An Availability-Group member DB must stay FULL recovery; `ALTER DATABASE … SET RECOVERY SIMPLE` (+ file-growth) is blocked/invalid on an AG member and would fail the publish. Guard those PostDeploy statements to skip when `DB_NAME()` is in an AG (`sys.databases.replica_id IS NOT NULL`). Not the cause of the beta.37 failure (this instance has no AGs) but a real customer-upgrade landmine. |

## B. SSIS — ispac

| # | Item | Status | Notes |
|---|---|---|---|
| B1 | perioddate stamp-at-load: **Execute SQL Task in "Get F4111 New"** running `EXEC dbo.usp8_stamp_f4111_new;` (finding ②, stage 1) | 🆕 owner wiring | Decided against a derived column — a thin Execute SQL Task calling the proc (A5) keeps the date CASE logic in T-SQL/testable. **Placement:** success precedence constraint from the "Get F4111 New" data flow → the new task (runs after the rows land). Pair with A6 (remove data_prep pass). Load-test + measure −159s. cost/uom = stage 2. |
| B2 | Truncate-and-load reload: watermark reset wiring + `PRELOAD_GROUPS` container-enable | 🆕 needs design | `docs/plans/valc-partial-group-reload.md`. Reset `maxUKID`/`DateF4211`/`DateF3106`/GL batch etc. to 0 on a group reload, else the pull returns nothing. |
| B3 | Load warnings surfaced during owner's staging testing | ⏳ incoming | e.g. the two "Null value is eliminated by an aggregate" warnings seen in `usp6_008` (row 15 walk) — owner is looking for more. |

## C. VALC (Java / redeploy)

| # | Item | Status | Notes |
|---|---|---|---|
| C0 | **LOAD button launches the normal production SQL Agent job; STOP stops that job** | 🆕 owner requirement | Replace the transient one-shot catalog-SQL job with `sp_start_job` on the existing production load job (per-run mode/params via the config table it already reads), and `sp_stop_job` to cancel. Makes the run visible + stoppable in SSMS Job Activity Monitor and sidesteps the SQL-auth 27123 wall entirely. **This is the root-cause fix for D5** (STOP currently no-ops + the UI falsely resets). Verify the job/catalog state before resetting the UI; surface failures. |
| C1 | Reload buttons = **truncate + load** (call A4's proc; watermarks self-reset on truncate — no explicit reset) | 🆕 needs design | Owner requirement 2026-07-05. Applies to every group Reload button on the Step-6 board. |
| C2 | Held fix #9 (No-source-data → "No new rows" label) | ✅ coded/held | Needs a VALC rebuild/redeploy to activate. |
| C3 | Held fix #11 (activity same-second ordering) | ✅ coded/held | Needs a VALC rebuild/redeploy to activate. |
| C4 | Finer group picker (6 groups) for `PRELOAD_GROUPS` | 📋 spec'd | `docs/plans/valc-partial-group-reload.md`. Optional for the clean run; confirm if wanted now. |
| C5 | **Capture the REAL SqlPackage error in `client_deploys.failure_reason`** | 🆕 (cost us a long hunt) | `DbDeployService.publishDacpac` stores `firstLine(pr.output())` — which is SqlPackage's **banner** ("Publishing to database…"), not the failure. Use `meaningfulError(pr.output())` (already exists, used by the catalog-step path) so a failed deploy shows e.g. `Msg 245: Conversion failed converting 'OFF' to int` instead of an opaque "exit 1". Same swallowed-error theme as D1–D5. |
| C6 | **LOAD/STOP rewire — Step-3 model (code done + compiles; needs owner redeploy + live-test)** | 🔧 code done, needs redeploy | `startRun` stamps this run's synchronized `create_execution` onto the per-DB job's **"Load Staging"** step (Step 3) + `sp_start_job … @step_name='Load Staging'` (A→B only, never B→C — Steps 1→2 are the nightly schedule's path). `stopRun` = `sp_stop_job` + `catalog.stop_operation`. Supersedes C0's flag/gate idea. **Status 2026-07-06:** (1) **Demo1 job already correctly wired** (verified read-only via msdb): Step 1 Run A to B (on_success=next), Step 2 Run B to C = bare `EXEC dbo.usp6_001_run_b_to_c;` on_success=Quit, Step 3 **Load Staging** present (A→B, on_success=Quit) — so the manual SSMS step is DONE. (2) **Provisioning `ensureScheduleJobs` now bakes in Load Staging** (create-only, VALC owns the per-run body) + adds it to the step-prune whitelist + Javadoc/comments updated — so new DBs get Step 3 and re-provision (Step-7 card auto-runs it) self-heals it. **Compiles clean** (`mvn -o compile` exit 0, JDK 21). (3) `v8_load_control` **absent on Demo1 + gone from all source** → nothing to drop. **Remaining (owner):** `redeploy-valc.ps1` (activates startRun/stopRun + new provisioning), then live-test LOAD→A→B-only→STOP (I verify read-only). **⚠️ 2026-07-06 first live LOAD went via the OLD transient path** — SSISDB execution ran but NO `RapidReconciler_Demo1` "Load Staging" sysjobactivity row was created, so the running VALC jar does NOT have the C6 rewire. The redeploy must actually `mvn package` from the working tree (uncommitted startRun/stopRun) — confirm the built jar postdates the edits, then retest: a LOAD should create a `RapidReconciler_Demo1` activity row with `last_executed_step_id` = the "Load Staging" step, and STOP (sp_stop_job) should cancel it. |

## D. Incoming (owner staging-test findings)

_(Add each issue here as reported — table, symptom, suspected cause, target fix + which artifact.)_

- **D1 — F4111 (changed rows) shows a nonzero count on static/fresh data.** Board shows `144` for
  "F4111 (changed rows)" on a fresh full load. **Verified the DB is correct:** `RSsisLoadLog` for that run
  = `changed=0`, note "0 open rows completed"; `Staging_F4111` empty; no rows carry today's `ChangeDate`.
  So `usp8_apply_f4111` changed **nothing** — the 144 is the count the change data-flow *pulled/checked*
  into staging (the watched open set + range-compression over-pull), **displayed as if it were changed
  rows**. **Suspected fix (VALC board tally):** the "changed rows" line should read `changed_rows` from
  `RSsisLoadLog` (=0), or be relabeled "rows checked / n changed". Also the `expected`-baseline captured
  the 144 (later screenshot shows `0 / 144`), so it will keep mismatching until the count source is fixed.
  → **VALC** (board tally / applyState). Not a DB bug.
- **D2 — Activity log lists only the FIRST table per group.** Load Progress (left) showed only
  "Loaded F4111" for the whole Inventory group; F41021 and the other per-table loads never appeared,
  though the Tables board (right) tallied them all. Same on the other groups ("only the first table is in
  the log"). → **VALC** `ssis-activity` endpoint / **SSIS** logging granularity — the streamed log reads a
  message source that only emits one entry per group/container. Needs read-only investigation of what the
  stream reads (event_messages vs RSsisLoadLog) vs what the board reads.
- **D3 — Activity log is unstable during long loads: loses details, then clears entirely.** First the
  per-step **details** dropped; then ~5 min in (while **F4211** — a big single data-flow — was loading) the
  **whole step list emptied** (green checks and all), though the load kept running and the Tables board kept
  updating. **Strong hypothesis:** the `ssis-activity` stream is **rebuilt from a rolling window / replaced
  on each poll** rather than accumulated, and it **clears on an empty poll**. During a long quiet stretch
  (one multi-minute table, no new SSIS `event_messages`) a poll returns nothing → the list renders empty →
  everything vanishes; when the next message lands it repopulates **without the earlier entries** (matches
  the "came back without details"). **Likely shares a root cause with D2:** the SSIS package emits only a
  sparse, group-level message set (one entry per container, not per table), so the stream is thin to begin
  with and any clear-on-empty wipes it. **Fixes to weigh:** (a) client accumulates/persists entries, never
  clearing on an empty/partial poll; (b) endpoint returns the **full execution message history** for the
  running execution, not a rolling window; (c) SSIS emits a per-table OnInformation event so the stream has
  content (also fixes D2). → **VALC** `ssis-activity` + client render (+ maybe **SSIS** event granularity).
- **D4 — Load warnings to clear (⏳ accumulating):**
  - "Warning **Copy F0911 to Staging**" surfaced ~18:43:32 during the Faster full load (details expander).
    Suspected: type/truncation/NULL on the F0911→`Staging_F0911` flow. → **SSIS**. Needs the warning detail.
  - Two "**Null value is eliminated by an aggregate or other SET operation**" warnings inside `usp6_008`
    (row-15 walk). Benign but should be NULL-guarded (`ISNULL`/`COALESCE` on the aggregated column). → **DB**.
  - _(more incoming as owner tests)_

- **D5 — STOP — ✅ FIXED + verified (VALC PR #180, 2026-07-06).** `stopRun` now calls
  `catalog.stop_operation` FIRST (graceful cancel → status 3 Canceled, releasing the synchronized
  Load Staging step), keeps `sp_stop_job` as a backstop, and tolerates Msg 14254 ("already not
  running") as success. Runs under the Agent Windows principal via `runCatalogJob` (no Msg 27123).
  Verified live: STOP → **status 3 CANCELED, ok:true** (previously a silent no-op that ended runs
  as status 6 "ended unexpectedly" and reported failure). Also shipped same PR: **L1** (progress
  query single-scan 1259ms→315ms + client single-flight/no-double-fetch → no freeze), **D3**
  (activity log never blanks on empty poll + resets per execution; cap 500→2000), and **C6**
  verified working (LOAD runs via the Load Staging step on job `RapidReconciler_Dev`). Original
  analysis below (kept for history):
- **D5 (original) — STOP LOAD does not cancel the running SSIS execution (VERIFIED root cause).** Clicking STOP
  reset the client UI to idle (Load Progress then wrongly read *"No load has run on this database yet"*),
  but execution 10379 stayed `status = 2 (RUNNING)` and kept bulk-inserting (F4111 climbed 1.32M → 2.46M+
  after the click). **Root cause:** `SSISDB.catalog.stop_operation` returns **Msg 27123 — "operation cannot
  be started by an account that uses SQL Server Authentication; use Integrated Authentication"** (reproduced
  directly). VALC connects to SSISDB as `rruser` (SQL auth), so its cancel call gets 27123, silently fails,
  and the UI resets anyway. Same auth wall as the catalog **deploy** (which VALC already routes through a
  one-shot **SQL Agent job** under a Windows principal — see memory `reference_ssis_catalog_deploy_no_entra`).
  **Mechanism confirmed (SsisDeployService ~L327–351):** the LOAD button does NOT call the catalog directly.
  It builds the catalog SQL (`create_execution` + set-params + `start_execution`) and runs it via
  `dbDeploy.runCatalogJob(...)` — a **transient one-shot SQL Agent job** under the Agent's Windows identity
  (the only way past 27123). `start_execution` is fire-and-forget, so that job **self-deletes immediately**;
  the load then runs inside SSISDB `ISServerExec`. (That's why no Agent job is left to stop, and why
  `sysjobactivity` shows nothing running.)
  **Fixes:** (a) **STOP should reuse the exact same `dbDeploy.runCatalogJob(...)` plumbing** to run
  `EXEC SSISDB.[catalog].stop_operation @operation_id = <execId>` under the Agent's Windows identity — the
  infrastructure already exists (it's how START works); STOP just never used it. (b) the STOP button must
  **verify the cancel actually took (catalog status → 9/stopping → 3/cancelled) before resetting the UI** —
  never show "no load has run" while the catalog still says RUNNING; (c) surface the 27123 / any stop
  failure to the operator instead of swallowing it. → **VALC** (SsisDeployService stop path + deployment.html
  button-state); see `docs/plans/ssis-load-orchestration-hardening.md` §5.7 (the START transient-job pattern
  to mirror). Ties to D3 (the false "no load has run" is the same UI-reset-on-stop).

- **D6 — Deploy/rollout progress shows a STATIC screen during long-running steps (owner pain, 2026-07-06).**
  During Demo1's beta.38 publish the Rollout-progress row sat frozen on `[dbo].[CK_RPurgeLog_direction] · 2 of 2`
  for ~10+ min while SqlPackage was actually running `ALTER INDEX [ix7_f0911_changedate] ON [dbo].[F0911] REBUILD`
  (verified live: session suspended on CXCONSUMER, sqlpackage at 0% CPU because `sqlservr` does the work). With no
  signal that a multi-minute index rebuild is in flight, a working deploy is indistinguishable from a hung one —
  the owner stared at a static screen for a very long time. **Fix (VALC deploy-progress):** when the object
  counter stops advancing, surface the operation actually executing — read the running request for the target DB
  (`sys.dm_exec_requests` command/`ALTER INDEX …`/wait_type, or the PostDeploy phase) and show e.g. "Rebuilding
  index ix7_f0911_changedate on F0911 (large table — several minutes)". At minimum show a "still working — long
  step" heartbeat/elapsed timer so silence ≠ hung. Same swallowed-signal theme as C5/D1–D5. → **VALC**
  (`DeployProgressService` / deployment.html rollout row). Ties to D7 (the rebuild is what's silent).
- **D7 — Every beta deploy rebuilds F0911 `ix7_f0911_changedate` despite `IgnoreIndexOptions=True` (perf).**
  Demo1's beta.38 publish spent 10+ min rebuilding that index on the full Orders-reload F0911; NA/TR were fast only
  because their F0911 is small. The publish sets `/p:IgnoreIndexOptions=True` specifically to STOP F-table index
  rebuilds — so a rebuild still firing means the index DEFINITION differs from the model (a real add/change), or
  PostDeployment is re-asserting it, not just an options diff. **Investigate read-only** why SqlPackage emits the
  rebuild (DeployReport / model diff on the F0911 changedate index) and eliminate it so a routine version bump
  doesn't rebuild a multi-million-row index — which also **stalls loads**: the deploy holds `RR_DB_ACTIVITY` (X)
  the whole time and the activity guard makes deploy + load mutually exclusive, so the owner literally can't load
  until the rebuild finishes. → **DB (dacpac / publish options)**. Root-cause candidate for the "16 hours and still
  can't load" pain.

## E. Deferred

- **E1 — "Load Staging Data" band stays amber; determine the exact green condition.** Hypothesis: the band
  greens only when every table's `rows == expected`, so the `F4111 (changed rows)` mismatch (D1) and any
  `rows ≠ expected` line (e.g. `F0902 90 / 60`) hold it amber → fixing D1 + reconciling the expected
  baseline likely greens it. Confirm against the band-state logic (`deployment.html` / `SsisDeployService`).
  Deferred by owner 2026-07-05 ("worry about amber later").

---

## Open design questions to resolve before coding

1. **Truncate scope per group (A4/C1)** — confirm the live-table list; does an Item/Inventory reload also
   clear the B→C artifacts `RTransactions` / `RPerpetualInv`, or leave those to the following B→C?
2. **Watermark storage/reset (A4/B2)** — where each per-group watermark lives (VALC run variable vs a DB
   table the package reads) — I'll investigate read-only when you're ready, so the truncate proc resets the
   right thing.
3. **Group granularity (C4)** — the 6-group cut vs per-table, and reconcile-after defaults.
