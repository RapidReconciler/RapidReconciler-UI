# Load reliability + activity log — overnight execution plan

## ✅ RESULTS — shipped + verified live (2026-07-06 overnight, VALC PR #180 → main)

**The owner's core ask is delivered and verified on Demo1.** Click LOAD → data loads;
activity log shows every step, ordered, per-table, scoped to the run, never blanked; progress
never freezes; STOP cancels cleanly.

- **L1 (progress freeze) — FIXED + verified.** `populatePhaseProgress` now scans the 550K-row
  `event_messages` ONCE into a table variable (identical output, **1259ms → 315ms**). Client
  poll is **single-flight** + fetches `/ssis-last-execution` once/cycle (was twice, unguarded →
  12–43s stacked). Measured after: **0.4s idle**, ~4.6s under load contention but no stacking →
  smooth, never frozen.
- **D3 (activity log vanished) — FIXED + verified.** Client never blanks a populated log on an
  empty/slow poll, and resets only when the execution id changes (no prior-run entries). Server
  cap 500 → 2000. Verified: 10390 log = 15 ordered per-table entries, scoped to the run.
- **D5 (STOP) — FIXED + verified.** `stopRun` now calls `stop_operation` FIRST (graceful →
  status 3 Canceled, releasing the synchronized step), `sp_stop_job` as backstop, tolerates
  Msg 14254. Verified: STOP → **status 3 CANCELED, ok:true** (was silent no-op / status-6).
- **C6 (Load Staging) — VERIFIED WORKING.** LOAD runs via the per-DB job's Load Staging step,
  A→B only, clean Succeeded (10385/10390). The earlier "no activity row" alarm was MY error —
  I queried job `RapidReconciler_Demo1` but VALC uses `RapidReconciler_Dev` (a `db_job_name`
  override left from the Dev→Demo1 rename). Provisioning bakes Load Staging in + keeps it out of
  the prune.
- **Load engine sound.** Full load 10384 loaded every table to expected (F0911 3.0M, F4111 3.2M,
  F3106 1.95M, …), zero errors. The "16 hours can't load" pain was the frozen/lying UI, not lost data.

**Progress-bar denominator mismatch (owner-flagged 2026-07-06, DON'T fix yet):** the Load
Progress bar reads "N of **14** tables" but the log now lists ~20 bulk tables (show-every-table).
The board's `_instTableProgress.total` (14) doesn't match the full bulk-table set — likely counts
a different/licensed subset or splits F4111 differently. Reconcile the progress denominator with
the full table set so the bar and the log agree. Deferred by owner ("add it to the list, no need
to fix now").

**`usp8_stamp_f4111_new` missing the blank-GL-date fallback (VERIFIED 2026-07-06, DB proc fix):**
compared F4111 perioddate on the from-empty Demo1 (new stamp-at-load) vs `rrv7-al` (old B→C data_prep
proc) joined on `ilukid`, normalized for the demo's **+9y Julian shift** (day-of-year preserved, not
calendar date). Result: **3,223,148 of 3,223,329 match; 181 real mismatches (0.006%)**. Of the 181,
**144** are rows with a **blank/zero `ildgl`** where the OLD proc fell back to `ilcrdj` (created date)
but the NEW `usp8_stamp_f4111_new` used the blank `ildgl` → a bogus `2009-01-01` perioddate (wrong
period). **Fix:** add the old proc's "blank/zero `ildgl` → use `ilcrdj`" fallback to
`usp8_stamp_f4111_new` (dacpac). Remaining **37** are a second smaller pattern (old used neither
`ilcrdj` nor the shift-matched `ildgl`; `ildgl` not blank — likely period-end rounding or genuine
data diff) — categorize when fixing. The old behavior is the correct one.

**F4111 index rebuild blocks other flows from starting (owner-flagged 2026-07-06, DON'T fix yet):**
during a load the F4111 non-clustered index rebuild (3.2M rows) blocks other group containers from
starting — so even with parallel fan-out (Faster), the other groups stall behind the F4111 rebuild
instead of running concurrently. Investigate what the rebuild holds (a lock, or it sits on the shared
critical path / the "Disable NC Indexes" → "Rebuild Indexes" span) and let independent groups proceed
while it runs. Extends **D7** (F4111/F0911 index-rebuild perf). Deferred by owner.

**Faster effort should be mce=2, currently mce=4 (owner-flagged 2026-07-06, DON'T fix yet):** the
effort dial's "Faster" option sends `maxConcurrent=4` (`deployment.html` — `<option value="4">Faster</option>`
+ the "up to four"/mce hints at lines ~1984/2012/5631/5641/6543). Owner wants Faster = **mce 2**. Change
the option value 4→2 and the accompanying label/hint text ("up to four" → "up to two"). NOT yet done.
Deferred by owner ("for the list").

**Load Staging band green after a reset — should be amber (owner-flagged 2026-07-06, DON'T fix
yet):** after the reset procedure (`clearTables`) empties the tables, the Step-6 "Load Staging Data"
band stays **green** and the per-table rows keep their prior green ✓ + timings despite showing
`0 / expected`. The board doesn't reflect the emptied state — an empty staging set should read
**amber** (not loaded), and the stale green checks/timings from the prior run should clear on reset.
Reconcile the band + per-row state with actual post-reset row counts (ties to **E1** in the
next-clean-run punch list; likely the `_instClearedExecId` path not covering the band + per-row tint).
Deferred by owner ("add that to the list").

**Client card false "open deployments / update available" (owner-flagged 2026-07-06, DON'T fix
yet):** the RR Test Server-Acme Clients card shows a "GSI · YOU CAN FIX THIS — Update available:
RapidReconciler_NA's SSIS package is on 8.0-beta.9; 8.0-beta.10 is available" nudge + an "Open
Deployments" button, but there are **no actual pending deployments** (SSIS is current). The card's
update-available detection is comparing a stale installed version against available and firing a
false nudge. Reconcile the client-card "update available" logic against the real deployed-vs-available
versions so it doesn't cry wolf. Deferred by owner ("add to the work list").

**Remaining (NOT blocking the morning; documented, not rushed):**
- **A4 / C1 — group Reload = truncate + load.** Group Reload buttons currently *load* a group
  (incremental), they don't truncate-first. Truncate proc `usp8_reload_truncate_group` not written
  (destructive — must not rush unverified). Next focused task.
- **Full CLEAR + reload test** — deliberately NOT run overnight to preserve the loaded state (a
  50-min reload failing unmonitored would leave empty tables for the morning). Run when watched.
- **Job-name cleanup** — VALC uses `RapidReconciler_Dev` for the Demo1 DB (`db_job_name` override);
  a stale `RapidReconciler_Demo1` job also exists (from a manual script). Reconcile to one name.

---


**One objective:** the owner clicks **LOAD** in the morning and (1) data actually loads, reliably;
(2) the activity log shows **what is really happening** including **which job step is executing**;
(3) **no cutoff** — every step that has executed is visible, in the **correct sequence**. Group
Reload + Clear/reload must work too. **Test everything live** (clear + reload, individual groups,
STOP). Commit and redeploy VALC as many times as needed.

**Scope discipline — OUT OF SCOPE this pass (do NOT touch):** C5 (SqlPackage error capture), A9 (AG
carve-out), D7 (F0911 index-rebuild perf), B→C reconcile correctness, any UI/demo polish. Loads +
activity log ONLY.

**GOVERNING RULE (owner, 2026-07-06): verify, never assume — in this doc too.** Every hypothesis below
is marked TO VERIFY until a DMV/source/log read confirms it; do NOT state a cause as fact (no "almost
certainly", no "strong evidence") until verified. Every fix is **live-verified before it's called done**.
(This doc originally asserted a "stale jar" root cause unverified — corrected below.)

### ★ HEADLINE (VERIFIED 2026-07-06): the load WORKS — the UI is what's broken.
Full load **10384 succeeded (status 7), zero errors** in `RSsisLoadLog`. Every table the frozen board
showed as `0 / expected` is now fully populated (partition-stats verified): F0911 3,036,334 · F3106
1,951,501 · F30026 448,810 · F4105 220,180 · F4311 128,564 · F4101 38,066 · F41002 30,180 · F4102
59,031 · F4801 7 · F4111 3,223,329 · F4211 709,104 · F0011 369,781. (F4108/F42119 = 0, legitimately
empty.) The `0/expected` the owner saw was the load still running (Serial = sequential groups) while
the **progress panel was frozen** (L1) and the board/banner were stale. **So the priority is the
activity-log + progress OBSERVABILITY (L1 + D2/D3 + D6), not the load engine.** A→B loading is sound.

### Verified facts captured this session (2026-07-06, DMV-confirmed)
- A full load (SSISDB execution **10384**, Serial) ran with **status 2 RUNNING, zero errors/zero
  warnings**, and progressed past table loads into a **"Rebuild Indexes"** phase (F4111
  `idx_f4111_perioddate` REBUILD active) — i.e. the load was healthy and working while the **UI falsely
  showed "2 of 5 · Running Orders · spinner stopped."** The display froze; the load did not.
- **VALC's progress query is slow and stacks:** the `WITH tl(ord, v)` recursive CTE keyed on the
  execution id was observed running **12–43 s per poll with 4 copies concurrently** on Demo1. Prime
  suspect for the frozen spinner / stale log. → new item **L1** below.
- **VERIFIED — the jar is NOT stale (my earlier assumption was WRONG).** The packaged
  `SsisDeployService.class` contains the C6 code (`Load Staging` ×7, `startRun`/`stopRun`, `sp_start_job`);
  jar built `00:43:27`; the running VALC process (PID 15088) started `00:43:38` — 11 s later — so the live
  process **has C6**. `startRun` (read 189–376) has **no bypass branch**: all modes route through the
  `Load Staging` stamp + `sp_start_job @step_name='Load Staging'`. So Phase 0.0 is answered: code is live.
- **UNEXPLAINED anomaly (resolve with a clean logged test, do NOT theorize):** run 10384 apparently did
  not leave a `RapidReconciler_Demo1` job-activity row (latest was 07-01) despite C6 being live. Rather
  than reverse-engineer an ambiguous run, the next controlled LOAD (post-fixes, post-redeploy) is
  instrumented to confirm the Load Staging step fires (activity row + `last_executed_step_id`).
- **NOT yet verified:** whether the `0 / expected` tables (F0911, F3106, F4101, F4105, F30026, F4311 …)
  are genuinely unloaded or just pending in the Serial sequence — verify AFTER the load reaches status 7,
  do not judge mid-run.

**Target DB:** Demo1. **Truth for progress:** the Tables board (rows/expected, from `RSsisLoadLog` +
live table counts). The left activity log is the panel being fixed.

---

## Phase 0 — Verify what the running jar actually contains, then make it current

**Hypothesis (TO VERIFY, not asserted):** the running VALC jar may predate the held fixes **#9**
(no-source label), **#11** (same-second ordering), **C6** (Load Staging rewire) + the provisioning
bake-in. Observed-but-not-yet-explained signals: the first live LOAD showed no `RapidReconciler_Demo1`
"Load Staging" job-activity row, and the log showed a prior run's entries. Do NOT assume "stale" —
verify.

- [ ] **0.0** VERIFY jar provenance: compare `target/valc-0.1.0-SNAPSHOT.jar` mtime to the source-edit
  mtimes (SsisDeployService / DeploymentController / deployment.html), and/or unzip the jar and confirm
  whether the compiled classes contain the C6 `Load Staging` / `startRun` code. State the finding as fact.
- [ ] **0.1** Clean rebuild VALC from the working tree (`mvn -DskipTests package`, JDK 21) and redeploy
  (`redeploy-valc.ps1`). Confirm the built jar postdates the source edits and `/actuator/health` is UP.
- [ ] **0.2** Confirm the fixes are now live: a LOAD creates a `RapidReconciler_Demo1` job-activity row
  whose `last_executed_step_id` = the **Load Staging** step; the log renders in correct order (#11).
  *Acceptance:* one LOAD → Load-Staging activity row exists; ordering correct.

## Phase 1 — LOAD / STOP / Reload reliability

- [ ] **1.1 LOAD = A→B only via Load Staging (C6).** Verify `startRun` stamps + `sp_start_job
  @step_name='Load Staging'` and that **B→C (`usp6_001`) does NOT run** afterward (Load Staging
  on_success = Quit). *Acceptance:* after a LOAD completes, no `usp6_001_run_b_to_c` execution fired.
- [ ] **1.2 STOP actually cancels (D5).** STOP → `sp_stop_job` + `catalog.stop_operation`; the SSIS
  execution goes to status 9→3 (Canceled) and the row stops growing. UI must **not** reset to "no load
  has run" while the catalog still says RUNNING. *Acceptance:* start a load, STOP mid-run, confirm the
  execution cancels and the UI reflects Canceled (not "never ran").
- [ ] **1.3 Group Reload = truncate + load (A4 + C1).** Write `usp8_reload_truncate_group @group`:
  truncate the group's live + `Staging_*` tables (DELETE where a FK blocks TRUNCATE); **leave**
  `RTransactions`/`RPerpetualInv`/`RInvAsOf`; watermarks self-reset on truncate. Add to `.sqlproj` +
  `CREATE OR ALTER` into Demo1. Wire each group's **Reload** button to call it, then run that group's
  load. *Acceptance:* reload each group individually → its tables drop to 0 then reload to rows==expected;
  other groups untouched.
- [ ] **1.4 Full Clear + Load Data.** From a cleared state, LOAD DATA repopulates **every** staging
  table to rows == expected (Serial). *Acceptance:* CLEAR → LOAD DATA → all groups reach rows==expected;
  no table stuck at 0 (except legitimately-empty ones, e.g. F4108/F42119).

## Phase 2 — Activity log: accurate, complete, ordered, uncut (the core ask)

- [ ] **2.1 Scope to the current execution.** On a new run, reset the log so it never shows the prior
  run's entries (the "18:43 entries from yesterday's execution under today's header" bug). *Acceptance:*
  a fresh LOAD shows only this execution's steps, timestamps matching now.
- [ ] **2.2 Never clear on an empty/partial poll; accumulate + persist (D3).** The endpoint returns the
  **full message history** for the running execution (not a rolling window); the client accumulates and
  never wipes on a quiet poll. **No fixed row cap — it grows to show all steps.** *Acceptance:* during a
  long single-table stretch (e.g. F4211) the earlier green steps stay put; nothing vanishes; the list
  keeps every entry from Initialize → final.
- [ ] **2.3 Show EVERY table/step, not just the first per group (D2).** Prefer a VALC-side fix: fold
  per-table completions from `RSsisLoadLog` (which already has per-table rows — the Tables board proves
  it) into the log, rather than an ispac change. Only touch SSIS event granularity if VALC-side can't
  surface per-table. *Acceptance:* the log lists each table load (F4111, F41021, F4102, …) not just the
  group's first.
- [ ] **2.4 Correct sequence incl. same-second ties (#11).** Order by `(message_time, message_id)` /
  a stable sequence, not time alone. *Acceptance:* "Done Companies" can't sort after "Started Orders"
  when both stamp the same second.
- [ ] **2.5 Show the executing job step + current operation (D6).** Header/entries name the **Load
  Staging** step and the table/container currently running, plus an elapsed heartbeat so a long step
  reads as "working," not hung. *Acceptance:* mid-load the panel says which step + which table is active.
- [ ] **2.6 End-to-end log verification.** Full load: watch Initialize → each group → each table →
  finish, in order, nothing cleared, nothing cut off, correct step name throughout.
- [ ] **L1 — Fix the slow progress query that freezes the panel (VERIFIED root-cause candidate).** The
  `WITH tl(ord, v)` recursive CTE VALC polls for the running execution took 12–43 s per call with 4
  concurrent copies on Demo1 — a poll that slow, stacking, is why the spinner stops updating and the log
  goes stale. Find the query (SsisDeployService / the ssis-activity + deploy-progress endpoints), make it
  cheap (avoid the recursive CTE / read `RSsisLoadLog` + `catalog.executable_statistics` directly), and
  ensure overlapping polls don't pile up (single-flight / dedupe). *Acceptance:* progress poll returns in
  well under 1 s; the panel updates smoothly through a full load; no stacked long-running poll queries in
  `sys.dm_exec_requests`.

## Phase 3 — Board reading correctness (only what affects load confidence)

- [ ] **3.1 D1 — "F4111 (changed rows)" shows 144 on static data.** Board tally should read
  `changed_rows` from `RSsisLoadLog` (=0) or be relabeled "rows checked / n changed"; reconcile the
  `expected` baseline so it stops mismatching. *Acceptance:* on a fresh full load the changed-rows line
  reads 0 (or is clearly labeled) and the row isn't falsely amber from this.

## Phase 4 — Commit + record

- [ ] **4.1** Commit DB (`usp8_reload_truncate_group` + `.sqlproj`) and VALC (C6 + activity-log fixes)
  via the full flow → PR to main → squash-merge → sync Dev. (Owner pre-authorized commits for this work.)
- [ ] **4.2** Update `next-clean-run-punch-list.md` statuses (C6/D1/D2/D3/D5/#9/#11) to reflect what shipped.

---

## Testing protocol (run for each phase, on Demo1)

1. **Individual group reload** — for each group (Inventory, Inventory Supplemental, Orders, General
   Ledger, …): click Reload → confirm truncate→reload, rows==expected, log correct + complete.
2. **Full clear + load** — CLEAR → LOAD DATA (Serial) → all groups load; log shows every step in order.
3. **STOP** — start a full load, STOP mid-run → confirm cancel + honest UI.
4. **Repeat after every VALC redeploy** until all acceptance criteria pass. Redeploy as many times as needed.

## Known constraints (don't relearn the hard way)

- Deploy + load are **mutually exclusive** via the `RR_DB_ACTIVITY` applock — never test a load while a
  deploy runs. Demo1 is on beta.38 now; no more deploys needed for this work.
- This box **is** the SQL server — verify with single targeted reads, not polling loops.
- Owner reviews UI live in his own browser; I verify read-only in a 2nd tab. Never drive his session.
