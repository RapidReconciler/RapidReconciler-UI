# VALC partial / group reload — reload one table-group, not the whole load

**Status:** spec, uncommitted (2026-07-03). Owner request: when a load has an issue (e.g. F4211/F4311 didn't come in), reload just *that* group instead of the whole multi-hour run.

## Why this is a small feature, not a big one

The parameterized SSIS package **already runs subsets** — `SsisConfigService.RunMode` supports `BOOTSTRAP`, `FULL_LOAD`, `STEADY`, and the partial modes **`PRELOAD_INV` / `PRELOAD_GL` / `PRELOAD_RECEIPTS`** (see `DeploymentController.ssisRun` + `SsisConfigService`). So the package's selective-container mechanism exists; this feature makes it **finer-grained + owner-selectable in the UI**, rather than building selective loading from scratch.

## Table-groups (proposed)

Each group = the JDE F-tables it copies + their `usp8_apply_*` procs. Finer than the current 3 preloads:

| Group | F-tables (Copy → apply) |
|---|---|
| Companies / setup | F0010, F0006, F0008, F0901, F41001, F4095 |
| GL | F0911, F0902, F0011 |
| Item / Inventory | F4101, F4102, F41021, F4111 (+ "Get F4111 New"), F4105, F41002, F41003 |
| Sales Orders | F4211, F42119 |
| Purchase Orders / Receipts | F4311, F43121 |
| Currency (opt) | F0015, F1113 |

(The existing `PRELOAD_INV/GL/RECEIPTS` map roughly to Item/Inventory, GL, Purchase-Receipts — this splits Sales Orders and POs out and adds the rest.)

## Design

1. **Selection input.** Add a `groups: string[]` param to `POST /valc/deployment/ssis-run` (alongside the existing `mode`). Simplest that composes with today: introduce a `mode = "PRELOAD_GROUPS"` that reads `groups`. `SsisConfigService` maps each group → the set of SSIS containers to enable (the same enable/disable lever `PRELOAD_*` already uses), enabling **only** the chosen groups' Copy + apply containers.
2. **SSIS package.** Extend the per-mode container-enable expression so it can be driven per-group (a package parameter, e.g. `EnabledGroups`, that each container's `Disable` expression reads). The `PRELOAD_*` modes prove this mechanism works; this generalizes it.
3. **VALC UI.** On the Step-6 load screen, a **group picker** (checkboxes for the groups above) → `ssis-run { mode: 'PRELOAD_GROUPS', groups: [...] }`. Default all-checked = equivalent to today's full load.
4. **Reconcile after?** A partial copy+apply leaves the reconciled tables (C-side) stale for the touched group. **Open decision:** run a scoped B→C after a group reload, or leave recon to a separate button. Likely: offer a "reconcile after" checkbox; default on for GL/Inventory groups (they feed roll-forward), off for a pure re-copy. Flag for owner.
5. **Guardrails.** Ride the per-DB activity guard (`RActivityLock` / `usp8_activity_*`) so a group reload is still mutually exclusive with a dacpac deploy. Far fewer rows than a full load → much lighter on the box (dovetails with the load-perf work).

## Reload = TRUNCATE + load (owner requirement, 2026-07-05)

A **Reload** button must give a **clean slate for the applicable tables**, not append to what's there.
Today's reload runs the copy/apply without clearing first, so stale rows survive and staging residue
accumulates — the load-side twin of B→C finding ① (the RTransactions residue that dropped 809K rows
came from exactly this: a reload over a table that wasn't cleared first). Reload therefore =
**truncate the group's tables → reset the group's watermark → load**.

Per group, in order:

1. **Truncate the applicable LIVE target tables** (e.g. Sales Orders → `F4211`, `F42119`; POs/Receipts →
   `F4311`, `F43121`, `F3106`; Item/Inventory → `F4111` + its downstream `RTransactions` residue path).
   Use `TRUNCATE` (minimally logged, resets identity) where there's no FK blocking it; else a guarded
   `DELETE`. A `usp8_reload_truncate_group @group` proc is the clean home (ships in the dacpac; VALC calls
   it before invoking the SSIS run) — keeps the table list server-authoritative and out of the package XML.
2. **Reset the group's watermark to 0** — CRITICAL. The "new rows" pulls are watermark-gated
   (`Where ILUKID > @maxUKID`, `SDDICJ >= @DateF4211`, `SDDICJ >= @DateF3106`, GL `>= @maxBatch`, …). If a
   reload truncates the live table but leaves the watermark at its old high value, the pull returns
   **nothing** and the table stays empty. So truncating F4211 must reset `DateF4211`→0, truncating F4111
   must reset `maxUKID`→0, etc. The watermarks live in the VALC-supplied run variables / the tables the
   package reads them from — reset them as part of the same reload action.
3. **Load** the group (the existing `PRELOAD_GROUPS` container-enable).

**Net-change interaction:** for the apply-proc tables (F0911/F4111/F4102/F43121/F0011) the load is
normally net-change into the live table (staging + MERGE, delete-detection). After a truncate the table is
empty, so every row is "new" → the apply runs as a full load (delete-detection is a no-op). That's the
intended reload semantic; no apply-proc change needed, but the reload path should confirm staging is also
truncated so a partial prior run doesn't double-count.

**Scope of the button:** applies to every group Reload button on the Step-6 board. A full reset (the
"start over from reset" flow) already truncates everything, so this matters most for a *targeted* reload
(e.g. Orders didn't come in) done without a full reset.

## Open questions for owner
- **Truncate scope per group** — confirm the live-table list above (esp. whether Item/Inventory reload
  should also clear the B→C artifacts `RTransactions`/`RPerpetualInv`, or leave those to the following B→C).
- **Truncate locus** — a `usp8_reload_truncate_group` proc called by VALC (recommended, server-authoritative)
  vs a truncate step inside the SSIS package. Watermark reset goes wherever the truncate does.
- Group granularity — are the 6 groups above the right cut, or do you want per-table selection?
- Reconcile-after default per group (see #4).
- Should a group reload be allowed to run *concurrently* with another group (bounded parallelism) once the box is right-sized, or always serialized?

## Ties to
- `load-usp8-apply-chunking-parity.md` (a group reload of Sales Orders exercises `usp8_apply_f4211` — upgrade it first).
- Right-size-the-box / memory tradeoff (a group reload is lighter, but the buffer-pool cap still governs speed).
