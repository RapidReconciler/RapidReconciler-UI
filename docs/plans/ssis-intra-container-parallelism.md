# SSIS intra-container parallelism — VS worksheet + the MCE test

**Status: TESTED → REGRESSED → REVERTED (2026-06-14, s32). Do not re-attempt
without a working throttle.** §1–3 parallelization was applied, deployed, and
run (SSISDB execution 184): it **regressed 107s → 130s**. The parallelism worked
structurally (GL/InvSupp/Orders each faster in isolation), but unthrottled it
flooded the shared SQL instance with ~10 concurrent data flows → I/O contention →
**`Inventory` alone doubled 30→58s** (starved while GL ran 6 concurrent flows),
and the total got worse. The load is **resource/I/O-bound, not scheduling-bound**;
the original serial-within-container design was already near the box's sweet spot.
On this dev box JDE source + RR target are the same instance (127.0.0.1), which
worsens it — a real customer's separate JDE box *might* differ, but the local
write contention (concurrent FASTLOADs into one tempdb/buffer) would likely still
bite, and it can't be proven here. **Reverted to the serial chains; kept the
instrumentation removal (§7a — that's an independent clean win).** The only way to
revisit parallelism is to first make MCE honored (§5) and sweep for the sweet spot
(~3–4) — worthwhile only to tune a specific large/separate-JDE customer, not now.
Memory: [[reference_ssis_mce_not_honored]].

The s24 parallel restructure parallelized only the **top
level**
(`Inventory ∥ GL ∥ Receipts`; `Orders ∥ Inv Supplemental`). **Inside each
container the independent sub-flows still run serially** — that is the real
speed lever, and it's where the critical path is spent. Net-new package, full-
reload parity test ahead. Builds on [`ssis-parallel-load.md`](ssis-parallel-load.md)
and [`ssis-dataflow-normalization.md`](ssis-dataflow-normalization.md) (both
already executed).

## Ground truth — profiled, not guessed

Source: `catalog.executable_statistics` for execution_id **177** (a clean full
load on db21 / `RapidReconciler_InstTest`, status succeeded, 107.1s). Query at
the end (§7) — re-run it after any change to measure the delta.

```
107.1  \Package                                  (total)
 78.8  \Package\General Ledger                    leaf ceiling (standalone)
 75.7  \Package\Orders                            on critical path (after Inventory)
 73.7  \Package\Inventory Supplemental            on critical path (after Inventory)
 34.0  \Package\Companies                         OVERLAPS the fan-out (off critical path)
 29.9  \Package\Inventory                          the gate for Orders + Inv Supp
```

**Critical path = `Inventory` (29.9) → `Orders` (75.7) = 105.7s ≈ the 107.1
total.** `Inventory → Inv Supplemental` (103.6s) is right behind; `General
Ledger` (78.8s) is the standalone ceiling. `Companies` (34s) runs concurrently
with the fan-out (its `→ Compute Load Dates` edge co-exists with
`Initialize → Compute Load Dates`, so the transactional path doesn't wait on it)
— confirmed by the arithmetic, and it stays off the path after tuning.

### Why the sub-flows are serial today

Every big container chains its independent sub-flows with **precedence edges**
(green arrows). Since the engine is running parallel-capable already (MCE is not
being honored — see §5; top-level branches overlap), the only thing serializing
the sub-flows is those intra-container edges. Cut the artificial ones and the
sub-flows fan out.

## 1. General Ledger — 78.8s → ~28s

**Today (serial chain, 6 edges):**
`F0011 → F4095 → F4096_FA1RT → Load Objects → F0901 → F0902 → F0911`

**Verified dependency (the ONLY real one):** `Load Objects` is the
**Cache-Objects** loader; the **only consumer** of that cache is **`F0902`**
(confirmed: the package has exactly two `Cache - Objects` component references —
the writer inside `Load Objects` and one Lookup inside `F0902`). `F0011`,
`F0901`, `F0911`, `F4095`, `F4096_FA1RT` reference **no cache** and hit
independent JDE tables → independent staging tables.

**Edit:**
- **Delete** the 6 serial edges above.
- **Add** `Load Objects → F0902` (the real cache dependency — keep it).
- Leave `Load Objects`, `F0011`, `F0901`, `F0911`, `F4095`, `F4096_FA1RT` with
  no inbound edge inside GL → they all start when the `General Ledger` container
  starts; `F0902` waits only on `Load Objects`.
- Intra-sub-flow orderings (e.g. `F0911 Start → Min GL Date → Copy F0911 →
  F0911 Changes → Stats`) are **unchanged** — those are correct and internal.

**Projected GL** = max(F0011 12.2, F0901 7.6, **F0911 28.2**, F4095 8.3,
F4096 9.2, [Load Objects 3.5 → F0902 9.9] = 13.4) ≈ **28.2s** (F0911 dominates).

## 2. Inventory Supplemental — 73.7s → ~21s

**Today (serial chain, 5 edges):**
`Item Branch → Short Items → Item Master → Item Lots → UOMs → Costs`

**Verified dependency:** `Short Items` is the **Cache-Short Items** loader; its
consumers are **`Costs`, `Item Master`, `UOMs`** (confirmed by the Cache-Short
Items references landing in those three sub-flow ranges, plus the writer in
`Short Items`). **`Item Branch` and `Item Lots` reference no cache** —
independent.

**Edit:**
- **Delete** the 5 serial edges above.
- **Add** `Short Items → Costs`, `Short Items → Item Master`, `Short Items → UOMs`.
- Leave `Item Branch`, `Item Lots`, `Short Items` with no inbound edge inside the
  container.

**Projected Inv Supp** = max(Item Branch 20.5, Item Lots 17.0,
[Short Items 3.7 → max(Costs 9.8, Item Master 6.3, **UOMs 16.3**) = 20.0])
≈ **20.5s**.

## 3. Orders — 75.7s → ~44s (→ ~24s with the Sales Orders split)

**Today (serial chain, 2 edges):**
`Sales Orders → Purch Orders → Work Orders`

These three sub-containers hit **independent** JDE tables (F4211/F42119, F4311,
F3106/F4801) and use **no cache**. Each does its own `f4111` lookup against the
RR-local table — but that's satisfied by the top-level `Inventory → Orders` gate
(f4111 is fully loaded before the container starts), so intra-container
parallelism is safe.

**Edit (primary):**
- **Delete** `Sales Orders → Purch Orders` and `Purch Orders → Work Orders`.
- Leave all three with no inbound edge inside `Orders`.

**Projected Orders** = max(**Sales Orders 44.2**, Purch Orders 18.7,
Work Orders 12.8) ≈ **44.2s**.

**Edit (secondary — splits the new long pole):** inside `Sales Orders` the two
halves are serialized by `F4211 Stats → F42119 Start`. F4211 (open sales detail)
and F42119 (sales history) are independent tables/staging.
- **Delete** `F4211 Stats → F42119 Start`.
- Leave `F42119 Start` with no inbound edge inside `Sales Orders` (so the F4211
  chain and the F42119 chain run in parallel).
- **Projected Sales Orders** = max(F4211 chain ~25, F42119 chain ~18) ≈ **25s**,
  → **Orders ≈ 25s**.

## 4. Inventory — leave as-is (~30s, the floor)

`Min UKID → Get F4111 New (14.0) → Get F4111 Changes (13.9) → Update Changes`,
with `Copy F41021 (8.7)` branching off. `Get F4111 Changes` genuinely depends on
`Get F4111 New` (it diffs against what New loaded), so this chain is real. The
only parallel opportunity is `Copy F41021` alongside the F4111 chain, which it
already effectively is (branches off `Get F4111 New`). **No change** — Inventory
≈ 30s is the practical floor for everything gated behind it.

## 5. The MaxConcurrentExecutables test (coupled — do it in the same pass)

**Confirmed at the source why the dial is inert:** the package property is baked
`MaxConcurrentExecutables="1"` (line 13), but a **property expression**
overrides it at runtime: `<DTS:PropertyExpression DTS:Name="MaxConcurrentExecutables">@[$Package::MaxConcurrentExecutables]</DTS:PropertyExpression>`
(param default 1). Property expressions on `MaxConcurrentExecutables` are a known
SSIS quirk — frequently **not applied** under catalog execution. That matches
s31: MCE 1/2/4 all ≈112s and at "MCE=1" `Companies ∥ Inventory ∥ GL` still ran
concurrently (serial would be ~324s).

This matters now because intra-container parallelism **multiplies** the number of
concurrent JDE extracts (potentially 8–12 at once on the early fan-out). On the
8-CPU dev box that's fine; on a small customer box the throttle is the safety
valve. So settle MCE in the same pass:

**The test:**
1. **Remove** the `MaxConcurrentExecutables` property expression.
2. **Hardcode** the package property `MaxConcurrentExecutables = 1`.
3. Deploy, run a full load.

**Outcomes:**
- **If it now serializes** (≈300s+, branches no longer overlap) → the expression
  was the culprit. Then the per-customer throttle **cannot** ride a catalog
  parameter (catalog overrides params, not arbitrary properties). Decide:
  (a) bake a conservative fixed MCE (e.g. `4`) and accept it for all boxes, or
  (b) set the property at **deploy time** per customer (VALC rewrites the
  property in the staged package / uses two builds), or
  (c) throttle **structurally** via a "serial vs parallel" deploy variant
  (keep the precedence edges for small boxes).
- **If it still runs parallel at hardcoded 1** → `MaxConcurrentExecutables` is
  not constraining this package at all; the dial is dead. Retire it from the UI
  + `set_execution_parameter_value` path and throttle structurally if a small
  box ever needs it.

Either way the intra-container parallelism (§1–3) is the win; the MCE test just
determines how (or whether) we can cap it per customer.

## 6. Expected result

| Stage | Critical path | Total |
|---|---|---|
| Today | Inventory 30 → Orders 75.7 | **107s** |
| After §1–3 primary | Inventory 30 → Orders 44; GL 28; InvSupp 30+20.5=50.5 | **~74s** |
| + §3 secondary (Sales Orders split) | Inventory 30 → Orders ~25; GL 28; Companies 34 | **~54s** |

After the Sales Orders split the binding constraints become `Inventory (30) →
Orders (~25) = 55`, `Companies 34`, `GL 28`, `Inventory → InvSupp 50.5` — so the
**InvSupp path (~50s) and the Orders path (~55s) converge** as the new floor.
Further gains then come from `Inventory` itself and GL's `F0911 (28)` — diminishing.
**Net: roughly half the wall-clock (107 → ~55s) with no per-flow query change.**

## 7. Validate

1. **Owner: close the package in VS** before any direct-XML edge surgery
   (or do the edges in the designer — same target). Caches/lookups are
   untouched, so no re-encryption concern.
2. **Build Solution** — SSIS accepts the rewired precedence.
3. **Full-reload parity test** vs `JDE_PRIST920`: **row counts per table must
   match** a pre-change run (the caches still load before their consumers, so
   results are identical — only the schedule changes).
4. **Re-profile** (the same query that produced §0):
   ```sql
   SELECT CAST(es.execution_duration/1000.0 AS DECIMAL(7,1)) secs, e.package_path
   FROM catalog.executable_statistics es
   JOIN catalog.executables e
     ON e.executable_id = es.executable_id AND e.execution_id = es.execution_id
   WHERE es.execution_id = <new id>
   ORDER BY es.execution_duration DESC;
   ```
   (Connect to the SSISDB host as a login in `ssis_admin` / the per-DB login;
   `catalog.executions ORDER BY execution_id DESC` for the new id.)
5. **Watch the JDE source box load** during the parallel fan-out — this is what
   the MCE throttle (§5) exists to bound.

## 7a. Instrumentation removal — catalog replaces homegrown stats (APPLIED 2026-06-14)

With the SSISDB catalog, row counts (`catalog.execution_data_statistics`) and
per-component timing (`execution_component_phases` / the SSMS execution reports)
are native, so the package's homegrown logging is redundant. **Verified safe to
remove** — nothing in our stack reads it:
- VALC **Job Status badge** = `v_diagnostic5_job_status`, built entirely from
  **msdb SQL Agent job history** (not the data-capture log). Unaffected.
- VALC + Agent: no reads of `sp_Update_Data_Capture` / `RCaptureLog` / `RServerLog`.
- RRV8 `system-status-log` drawer is an **unwired mock** (PROD-TODO) modeled on
  the legacy server-log "A to B" cycles — breaks no live feature. (Follow-up:
  retire it or re-point at the catalog.)

**Applied via a validated XML pass** (`RapidReconciler_Prod.dtsx`), diff confirmed
surgical (no reformat):
- **Removed 27 Execute SQL tasks** — the 25 `* Stats`/`* Counts` row-count loggers
  + the 2 pure-logging Start tasks (`F42119 Start`, `F3106 Start`, which had **no**
  truncate — those tables are append-only) — plus their **38 precedence edges** and
  all **`statsF*` variables** (`sp_Update_Data_Capture` calls now = 0, `statsF` refs
  = 0).
- **Trimmed 23 `* Start` tasks to truncate-only** (dropped `Declare`/`Set`/
  `Exec sp_Update_Data_Capture_Start`; kept every `Truncate Table …`).
- **Bonus parallelism:** removing `F42119 Start`/`F3106 Start` frees `Copy F42119`/
  `Copy F3106` to run alongside their sibling F4211/F4801 chains (the §3-secondary
  Sales/Work-Orders split, for free).
- **Untouched (load-bearing):** `Min UKID`/`Min GL Date`/`Min batch date`, `Modules`,
  every `Update * Changes` MERGE, the `Copy *` data flows, both caches.

**Still present (optional next cleanup):** package-level `Record Package Start`
(`RCaptureLog`), `Log A to B Start`, `A to B Complete` (`usp6_Update_Server_Log`)
in `Initialize`/`Complete` — the catalog's `executions` row already records
run start/end/status, so these can go too on owner's call.

## 8. Order of operations

1. §1–3 **primary** edge surgery (GL + InvSupp + Orders sub-containers) → re-profile.
2. §5 **MCE test** (decide the throttle story) → re-profile.
3. §3 **secondary** (Sales Orders internal split) if the ~74→~55s gain is wanted.
4. Only then chase `Inventory`/`F0911` micro-gains if a target demands sub-50s.
