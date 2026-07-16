# Cardex Corrective Action &mdash; DB Object Registry

Every object created / modified / superseded by the cardex corrective-action build, with each object's **references** so a later rename pass (or the legacy cleanup) can update all call sites mechanically. Final names are **TBD** &mdash; the `Rename &rarr;` column is the placeholder to fill when we settle them.

Convention in force: net-new procs/views use the **v8** prefix (`feedback_v8_prefix_new_db_objects`). Data tables stay `R`-prefixed.

Last updated: 2026-06-06 (after DB steps 1&ndash;4; agent/UI rows pending step 5).

> ### ⚠ CORRECTION 2026-07-16 &mdash; the 006b&rarr;usp8 migration was REVERTED; the tables below were inverted and dangerous
> **Verified in code 2026-07-16:** `usp6_006_inventory` calls **`usp6_006b_cardex_variance`** (line 448), NOT `usp8_cardex_variance`. Its inline comment (L443&ndash;445) states 006b "is the canonical source `v6ui_itemrollintegritydialog` reads; `usp8_cardex_variance` was a parallel recomputation that diverged." The 2026-06-06 migration recorded here (repoint 006b&rarr;usp8, mark 006b deletable) was later **reverted**, and this doc was never updated &mdash; so it told a reader the **live** proc was "safe to drop."
> **Live cardex-variance path (verified):** `usp6_006b_cardex_variance` &rarr; writes **`rperpetualinv`** (variance + `reason`; 11 UPDATE passes, netting hardened in build 178: account partition + cost-method/level grain) &rarr; **`v6ui_itemrollintegritydialog`** &rarr; agent `/inventory/integrity` &rarr; `RRV8/inventory-cardex-variance.html`.
> Read the corrected "Superseded" section below, NOT the pre-correction rows, before dropping anything.

---

## New objects &mdash; RapidReconciler-DB

| Object | Type | File | Referenced by (update on rename) | Rename &rarr; |
|---|---|---|---|---|
| `RCardexVariance` | table | `dbo/Tables/RCardexVariance.sql` | `usp8_cardex_variance` (MERGE target), `v8ui_cardexworklist`, sqlproj | _TBD_ |
| `RAdjustLedger` | table | `dbo/Tables/RAdjustLedger.sql` | `usp8_maint_set_beginning_balance`, `usp8_maint_undo_beginning_balance`, sqlproj, (agent ledger endpoint) | _TBD_ |
| `RCardexWorkStatus` | table | `dbo/Tables/RCardexWorkStatus.sql` | `v8ui_cardexworklist`, sqlproj, (agent mark-worked endpoint) | _TBD_ |
| `usp8_cardex_variance` | proc | `dbo/Stored Procedures/usp8_cardex_variance.sql` | ~~`usp6_006_inventory` (exec)~~ **NOT called (2026-07-16 verify: no `exec` anywhere)** &mdash; parallel recompute, superseded by the reverted 006b path; sqlproj | _TBD_ |
| `usp8_maint_set_beginning_balance` | proc | `dbo/Stored Procedures/usp8_maint_set_beginning_balance.sql` | agent `POST /inventory/set-beginning-balance` (step 5), sqlproj | _TBD_ |
| `usp8_maint_undo_beginning_balance` | proc | `dbo/Stored Procedures/usp8_maint_undo_beginning_balance.sql` | agent `POST /inventory/undo-adjustment` (step 5), sqlproj | _TBD_ |
| `v8ui_cardexworklist` | view | `dbo/Views/v8ui_cardexworklist.sql` | agent `GET /inventory/cardex-worklist` (step 5), sqlproj | _TBD_ |

## Modified objects &mdash; RapidReconciler-DB

| Object | Change | Referenced by |
|---|---|---|
| `usp6_006_inventory` | ~~repointed 006b &rarr; usp8~~ **REVERTED (2026-07-16 verify):** calls **`usp6_006b_cardex_variance`** (line 448) &mdash; the canonical path. `usp8_cardex_variance` is NOT called. | the nightly pipeline |
| `RapidReconciler.sqlproj` | `<Build Include>` entries for the 7 new objects | SSDT build |

## Superseded / deletable candidates (CORRECTED 2026-07-16 &mdash; canonical&harr;orphaned was inverted)

### DO NOT DROP &mdash; LIVE
| Object | Role |
|---|---|
| `usp6_006b_cardex_variance` | **CANONICAL** cardex variance + netting proc; called by `usp6_006_inventory` L448; writes `rperpetualinv`; feeds `v6ui_itemrollintegritydialog` &rarr; the live UI. **The pre-correction "safe to drop" entry was WRONG &mdash; dropping this breaks the entire cardex pipeline.** |

### Not on the live 006b path &mdash; verify a current reader before dropping ANY of these
| Object | Status (2026-07-16) |
|---|---|
| `usp8_cardex_variance` | Orphaned &mdash; **no `exec` anywhere** (grep). Its header claims to supersede 006b, but `usp6_006` doesn't call it. The parallel recompute that diverged. |
| `RCardexVariance` (table) | Written ONLY by `usp8_cardex_variance` (its MERGE target) &rarr; dormant with it. NB the `RCardexVariance.sql` comment "nightly MERGE (usp6_006b) joins on" is stale &mdash; **006b writes `rperpetualinv`, not this table.** |
| `v8ui_cardexworklist` (view) | Reads `RCardexVariance`; fed the old `GET /inventory/cardex-worklist`. The live UI was rebuilt onto `v6ui_itemrollintegritydialog` &mdash; confirm the current agent/UI has no reader before dropping. |

### Legacy reroll procs (unchanged status)
| Object | Superseded by | Still referenced? |
|---|---|---|
| `usp6_maint_reset_item_balance` | `usp8_maint_set_beginning_balance` (Manual preset) | Yes &mdash; legacy reroll until UI cuts over |
| `usp6_set_beginning_balances_zero` | `usp8_maint_set_beginning_balance` (Zero preset) | Yes &mdash; legacy reroll |
| `usp6_maint_reset_cardex_variance` | `usp8_maint_set_beginning_balance` (Clear-to-JDE preset) | Yes &mdash; legacy reroll |

> ⚠ **This registry inverted canonical&harr;orphaned once and told a reader to drop the LIVE proc.** Before dropping ANY object: grep `RapidReconciler-DB` + `RapidReconciler-Agent` + `RapidReconciler-AI/RRV8` for a live caller/reader and confirm against the CURRENT agent endpoints + UI data source &mdash; trust the code, not this doc's history. The `usp8_maint_*` procs + `RAdjustLedger` remain LIVE (they back the current adjust/roll-forward flow) &mdash; do not confuse them with the orphaned `usp8_cardex_variance` stack. The three reroll procs drop only once the Cardex page stops calling the old `rollIItem` flow.

## Agent objects &mdash; RapidReconciler-Agent (step 5, done)

Java; Spring component-scans them (no manifest to update). Endpoints documented in `RapidReconciler-Agent/docs/API.md`.

| Object | Type | File | Calls / reads |
|---|---|---|---|
| `CardexCorrectionController` | controller | `controller/CardexCorrectionController.java` | the 5 endpoints below |
| `BeginningBalanceRepository` | repository | `repository/BeginningBalanceRepository.java` | `usp8_maint_set_beginning_balance`, `usp8_maint_undo_beginning_balance` (JWT-scoped) |
| `CardexWorklistRepository` | repository | `repository/CardexWorklistRepository.java` | `v8ui_cardexworklist`, `RAdjustLedger`, `RCardexWorkStatus` (JWT-scoped) |
| `SetBeginningBalanceRequest` / `UndoAdjustmentRequest` / `WorkStatusRequest` | beans | `beans/*.java` | request DTOs |

Endpoints (all JWT-scoped): `POST /inventory/set-beginning-balance`, `POST /inventory/undo-adjustment`, `GET /inventory/cardex-worklist`, `GET /inventory/adjustment-ledger`, `POST /inventory/cardex-work-status`. Supersede `POST /inventory/rollIItem`.

DB tweak for the agent: `usp8_maint_set_beginning_balance` `@adjustid` now defaults null + returns a one-row result set `{AdjustID, ResEstunits, ResBaselineVar}` so the EXEC caller reads it without an OUTPUT param.

## UI objects &mdash; RapidReconciler-AI / V8 (step 5, done)

`RRV8/inventory-cardex-variance.html` reworked into the live corrective-action surface (demo-verified):
- Data source switched from `/inventory/integrity` (raw) to **GET `/inventory/cardex-worklist`** (netted, stable, classified); demo uses an inline sample.
- COLUMNS remapped to the worklist shape (Reason, Company, Long Account, GL Class + GL-class-change badge, Item, Branch, Grain, Amt/Qty Var, Suggested action, Owner, Stable, Status); hero KPIs updated.
- **Re-roll button removed**; replaced with click-a-row **Adjust Beginning Balance** modal (Clear/Zero/Manual presets) &rarr; POST `/inventory/set-beginning-balance` (uses `RepItemID`), an **Adjustment ledger** drawer &rarr; GET `/inventory/adjustment-ledger` with **Undo** &rarr; POST `/inventory/undo-adjustment`.
- 5 endpoints added to the rrFetch test-agent routing set.

DB enabler added this step: **`RCardexVariance.RepItemID`** (single-constituent itemid) + server-side **preset handling** in `usp8_maint_set_beginning_balance` (Zero/Clear resolved from the before-image, so the UI sends only the preset). Both flow through `usp8_cardex_variance` / `v8ui_cardexworklist`.

_All v8 object names still provisional &mdash; rename pass pending._

---

### Rename-pass checklist (when we settle final names)
1. Rename the object file + the `CREATE` statement inside it.
2. Update the `<Build Include>` in `RapidReconciler.sqlproj`.
3. Update every row in the **Referenced by** column above (exec call sites, MERGE/JOIN targets, agent endpoint→proc mappings).
4. Re-grep `RapidReconciler-DB` and `RapidReconciler-Agent` for the old name to catch anything missed.
5. Rebuild SSDT; dev-DB validate before QA publish (`project_dev_to_qa_workflow`).
