# V8 — fiscal period key on the period-persistent tables

> ## ⚠ 2026-06-25 — DECISION CHANGE: schema re-key DEFERRED; ship the date-swap as a V8 admin utility
>
> Owner reframed the whole effort. A fiscal-calendar change is a **rare** event,
> and **clients never rewrite history** (doing so would invalidate prior
> financial reporting). That makes the heavy `FiscalYear`/`FiscalPeriod` re-key
> below **over-engineered for V8**: because the stale OLD period-ending date only
> ever lives in the *current* open period, a plain **from-date → to-date value
> replacement across all companies** touches exactly the rows that need fixing —
> no company filter, no history risk. So:
>
> - **V8 ships the corrected date-swap as an Administrator utility**, not the
>   13-table schema change. New proc
>   [`usp8_maint_update_periodends`](../../../RapidReconciler-DB/RapidReconciler/dbo/Stored%20Procedures/usp8_maint_update_periodends.sql)
>   (preview + apply, guarded, metadata-driven so it's case-safe) ports the legacy
>   `usp6` logic with the **corrected target list** — drops the two wasted updates
>   (`RCardexLedgerCompare2`, `RNV_Validation`, which B→C rebuilds) and adds the
>   three genuine misses (`RInvAsOf_Log`, `RUnpostedCardex`, `Transit_GL_Balance`).
>   **Built + verified on Dev (preview) 2026-06-25.**
> - This also retires the separate V7 "complete the table list" task — the V8
>   utility serves both stacks. (`usp6_maint_update_periodends` stays in place for
>   any legacy caller, but the V8 utility is the path forward.)
> - **`usp8_maint_resync_periodends`** (the auto-resync that depended on the new
>   columns) is **not being built.** The schema-key analysis below is preserved as
>   rationale; revisit only if the value-swap proves insufficient in practice.
>
> **Remaining for the utility:** agent endpoints (`POST /inventory/fiscal-period-end-preview`
> + `…-apply`) + `API.md`; V8 `admin-fiscal-period.html` (preview→confirm→apply)
> + `config.js` area + Home admin tile + a help doc.

**Status:** drafted 2026-06-24, **table list verified with owner.** Design = store
the stable fiscal key (`FiscalYear` + `FiscalPeriod`) on the R-tables that retain
history across a refresh, so a fiscal-calendar change auto-corrects instead of
needing a manual remap. Supersedes the hand-maintained
[`usp6_maint_update_periodends`](../../../RapidReconciler-DB/RapidReconciler/dbo/Stored%20Procedures/usp6_maint_update_periodends.sql)
for V8. The V7 tactical fix (snapshot + keyed remap) stays as the legacy bridge;
see "V7 bridge" below.

## The problem

The R-tables store a **denormalized period-ending date** (`periodends` /
`PeriodEnds`). The source of truth for that date is `RFiscalCalendar`, which is
**truncated + rebuilt every refresh** from JDE (`usp6_002_set_up` →
`v6_005_fiscal_calendar`). When a customer's fiscal calendar changes — e.g. an
acquisition re-bases period-ending dates, or a calendar correction — the rebuilt
`RFiscalCalendar` carries the **new** `PeriodEnds`, but any table that stored the
**old** date and is *not* recomputed keeps a stale value, silently breaking
period grouping/joins.

**Which tables go stale?** Only the ones B→C does **not** truncate-and-reload.
Owner's rule (verified): *truncated in B→C ⇒ fully rebuilt ⇒ self-corrects on the
next refresh; not truncated ⇒ appended / purge-and-insert ⇒ retains
un-recomputed history ⇒ at risk.*

## Root cause

The row stores the **volatile derived value** (the date) instead of the **stable
identity** (company + fiscal year + period). The date is just an attribute of the
period and is always re-derivable from the calendar. Store the stable key and the
staleness class of bug disappears — for acquisitions and for any future calendar
correction.

## Decision (recorded)

Two options were weighed:

1. **Baseline calendar table** — keep a maintained copy of the old calendar to
   diff against the new one. Rejected: needs standing upkeep as companies are
   added/removed, can silently drift, and *still* requires a risky bulk UPDATE on
   each change.
2. **Add `FiscalYear` + `FiscalPeriod` to the affected tables; derive/re-stamp
   the date.** Chosen: fixes the root cause, no standing maintenance, and the row
   self-describes its period so the fix needs **no pre-change snapshot at all** —
   after the calendar rebuilds, re-derive the date directly from the row's own
   year+period.

## Affected tables — the locked 13

Every one is truncated **only** on full reset (`reset_RapidReconciler_database`)
or by a manual/on-demand proc — never inside the B→C chain — so each retains
history that won't self-correct.

**Inventory / core (6)**

| Table | Period-end column | Company resolution |
|---|---|---|
| `RTransactions` | `PeriodEnds` (date) | `CompanyNumber` |
| `RCardexLedgerCompare` | `PeriodEnds` (date) | `CompanyNumber` |
| `RCardexLedgerCompare2WorkNote` | `PeriodEnds` (date) | `CompanyNumber` |
| `RInvasOf` | `PeriodEnds` (date) | **via `ItemID → ritems.companynumber`** (no company column of its own) |
| `RInvAsOf_Log` | `periodends` (date) | `companynumber` |
| `RUnpostedCardex` | `PeriodEnds` (date) | `CompanyNumber` |

**In-Transit (7)**

| Table | Period-end column | Company resolution |
|---|---|---|
| `TransitWorkNote` | `PeriodEnds` (date) | `CompanyNumber` |
| `Transit_Compare` | `PeriodEnds` (date) | `CompanyNumber` |
| `Transit_Compare2` | `PeriodEnds` (date) | `CompanyNumber` |
| `Transit_GL_Balance` | `periodends` (date) | `companynumber` |
| `Transit_GL_Details` | `PeriodEnds` (date) | `CompanyNumber` |
| `Transit_Item_Details` | `periodends` (date) | `companynumber` |
| `Transit_Item_Details_CDX` | `periodends` (date) | `companynumber` |

**Excluded and why:**

- **Truncated + reloaded in B→C (self-correct on refresh):** `RAccountSummary`
  (009), `RCardexLedgerCompare2` (008), `RDuplicateSales` (006), `RFixBatch`
  (006), `RUnpostedBatches` (007), `RNV_Receipts_Ledger` (009b), `RNV_Validation`
  (009b), `Transit_Summary` (009a).
- **`RCompanies.MaxPeriodEnds`** — a per-company *derived max*, not a period
  stamp; re-derived from the new calendar, no new columns.
- **`RItemRoll`** — removed by owner (rebuilt by on-demand `usp6itemrollforward`,
  not a concern). NB: its `periodends` is `datetime`, unlike the rest.
- **`RDirectShipWorkTable`** — **dead**: created + truncated-on-reset only, never
  `INSERT`ed or `SELECT`ed anywhere in the repo. Always empty ⇒ no risk.
  Retirement candidate (see follow-up).

> **Completeness note.** The old `usp6_maint_update_periodends` remapped
> `RCardexLedgerCompare2` and `RNV_Validation` (which B→C rebuilds anyway — wasted
> work) and **missed** `RInvAsOf_Log`, `RUnpostedCardex`, and `Transit_GL_Balance`
> (genuinely persistent). The hardcoded list had drifted both ways — exactly the
> gap this design removes.

## Schema change

Add to each of the 13 (types match `RFiscalCalendar`):

```sql
[FiscalYear]   INT NOT NULL CONSTRAINT [DF_<tbl>_FiscalYear]   DEFAULT ((0)),
[FiscalPeriod] INT NOT NULL CONSTRAINT [DF_<tbl>_FiscalPeriod] DEFAULT ((0))
```

- Non-key columns (not added to the PK). They're functionally dependent on
  `(company, periodends)` and only need to exist for the re-stamp join.
- **Keep `periodends` physical.** It's part of the clustered PK and multiple
  indexes on most of these tables — it cannot become a pure view-derived column.
  So the model is: `periodends` stays, and `FiscalYear`/`FiscalPeriod` become the
  stable key that lets us re-derive `periodends` exactly.
- Per repo rule, all 13 table DDLs live in the `.sqlproj` Build set — edit the
  table `.sql` files and confirm each is in `RapidReconciler.sqlproj`
  ([`reference_db_objects_must_be_in_sqlproj`]). Files are UTF-8 BOM + CRLF.
- **Collation gotcha:** this repo ships a case-sensitive-ready object script
  (`_collation_work/`). Use each table's **exact column case** (`PeriodEnds` vs
  `periodends`, `CompanyNumber` vs `companynumber`) in every script — a CS
  deployment will reject the wrong case.

## One-time backfill (migration)

Run while the **current** calendar is still loaded (its `PeriodEnds` still match
the stored values). For each table, map `(company, periodends) → RFiscalCalendar
→ (FiscalYear, FiscalPeriod)`:

```sql
UPDATE t
SET    t.FiscalYear   = c.FiscalYear,
       t.FiscalPeriod = c.FiscalPeriod
FROM   dbo.<table> t
JOIN   dbo.RFiscalCalendar c
  ON   c.CompanyNumber = t.CompanyNumber          -- exact case per table
 AND   c.PeriodEnds    = t.PeriodEnds;
```

- **`RInvasOf`** has no company column — resolve it through `ritems` first:

  ```sql
  UPDATE a
  SET    a.FiscalYear = c.FiscalYear, a.FiscalPeriod = c.FiscalPeriod
  FROM   dbo.RInvasOf a
  JOIN   dbo.ritems   i ON i.itemid = a.ItemID
  JOIN   dbo.RFiscalCalendar c
    ON   c.CompanyNumber = i.companynumber
   AND   c.PeriodEnds    = a.PeriodEnds;
  ```
  (Confirm `ritems` key/column names at build time.)

- **Report unmatched rows** per table (rows whose `periodends` isn't in the
  calendar — typically the `'1901-01-01'` default sentinel, or dates outside the
  built calendar window). Leave their year/period at 0 and surface the count;
  don't fail silently.

## Going forward: stamp at write time

The procs that `INSERT` into the 13 already resolve `periodends` from the calendar
at load time — extend those inserts to also populate `FiscalYear`/`FiscalPeriod`
from the same `RFiscalCalendar` lookup. Insert sites to update:

- `RTransactions` ← `usp6_006_inventory`
- `RCardexLedgerCompare` ← `usp6_007_merge_cx_gl`
- `RInvasOf` ← `usp6_006a_inventory_as_of`
- the worknotes (`RCardexLedgerCompare2WorkNote`, `TransitWorkNote`) ← their
  maintain procs / app writes
- `RInvAsOf_Log`, `RUnpostedCardex`, and the `Transit_*` set ← their populate
  procs (trace each at build time)

Worknotes written by the app/UI must also pass year+period (or stamp via the
calendar in the write path).

## Auto-correct: the re-stamp proc (replaces the manual remap)

A new `usp8_maint_resync_periodends` makes a calendar change a non-event:

1. **Self-discovering target set** — pick the tables that have **both** a
   period-end column and `FiscalPeriod` from `sys.columns`, so the list can never
   drift again (the original completeness concern, solved permanently).
2. For each, `UPDATE periodends = c.PeriodEnds` joining `RFiscalCalendar` on
   `(company, FiscalYear, FiscalPeriod)` where the stored date differs.
   - Company comes from the table, except `RInvasOf` (via `ritems`).
   - Updating `periodends` touches a **clustered-PK column** on most tables — a
     key update (row moves in the clustered index). Safe because year+period is
     unique per company, so the new date is also unique; cost is fine for these
     small persistent tables. Note it in the proc header.
3. Idempotent — re-running changes nothing once aligned. Safe to wire as a
   guarded step at the **end of B→C** (after `RFiscalCalendar` rebuilds), so the
   correction happens automatically on the first refresh after any calendar
   change. No snapshot, no baseline, no operator action.

## V7 bridge (already in flight — unchanged)

The current V7 customer still uses the tactical fix: snapshot `RFiscalCalendar`
→ `RFiscalCalendar_PreChange` *before* the change
([Clone RFiscalCalendar script](../../../RapidReconciler-DB/Maintenance%20Scripts/Clone%20RFiscalCalendar%20%28pre%20fiscal-calendar%20change%29.sql)),
then after the rebuild remap the persistent tables by joining old↔new on
`(company, year, period)`. V8 makes that automatic; the legacy stack keeps the
snapshot approach because its rows don't carry year+period.

## Rollout order

1. Add the two columns to the 13 table DDLs (NOT NULL, default 0); confirm each in
   the `.sqlproj`.
2. Deploy columns → run the one-time backfill (with `ritems` hop for `RInvasOf`);
   review unmatched-row report.
3. Update the insert sites to stamp year+period going forward.
4. Add `usp8_maint_resync_periodends`; wire as a guarded tail step in B→C.
5. Verify: simulate a calendar shift on a test DB, run a refresh, confirm the 13
   tables' `periodends` track the new calendar with no manual step.

## Open questions

- **Company scoping** — does a calendar change hit *all* companies in a DB or just
  the acquired entity? The `(company, year, period)` key handles either, but
  confirms whether per-company filtering is ever needed in the resync.
- **Run the resync inside B→C, or keep it operator-triggered?** Wiring it into B→C
  is fully automatic; a manual trigger is more conservative for the first release.
  Recommendation: ship operator-triggered, promote to an auto B→C tail step once
  proven.

## Follow-up (out of scope here)

- Prune dead-table truncates from `reset_RapidReconciler_database`
  (`RDirectShipWorkTable`, the currency table, and any others the
  db-retirement-registry surfaces). Tracked separately.
