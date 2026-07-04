# Stamp `perioddate` (+ `datelev`) at LOAD in the "Get F4111 New" SSIS flow

**Status:** spec, 2026-07-05. Owner picked the **A-staged** direction (perioddate first, then cost/uom;
itemid stays in data_prep) for B→C finding ② (see `GSIRRTech/database-spec.html` §2a Table 4 row 8.prep
and the note block in `usp6_006_inventory_data_prep.sql`).

**Correction to the original framing:** the handoff said "move the stamp into the apply proc
(`usp8_apply_f4111`)." That proc is the **change re-pull** — it MERGE-*updates* still-open rows and
explicitly does **no INSERT** ("new rows are the ILUKID > maxUKID 'Get F4111 New' flow"). New F4111 rows
— the ones that need stamping — land via a **direct SSIS FASTLOAD**, not a proc. So "stamp at load" is an
**SSIS data-flow change**, not a `usp8_apply_f4111` change.

**Do NOT ship the `.dtsx` edit blind — load-test it with a B→C run** (an untested package edit can break
the nightly load; same rule as the f3106 conversion).

## Why

Finding ②: `usp6_006_inventory_data_prep` spends **~791s = 73% of the 006 run** stamping four columns onto
F4111 in three full-table UPDATE passes. `perioddate` is **159s** of that and is the **cleanest to move**:

- It derives **only** from the row's own `ildgl` (GL date) / `ilcrdj` (creation date) with `getdate()`
  failsafes — **no fiscal-calendar / no RItems dependency** (verified in the proc source).
- data_prep's incremental perioddate pass is **already gated `where datelev = 0`**, so once new rows arrive
  pre-stamped (`datelev != 0`), that pass **no-ops with zero DB-side change**.

Effect: removes the 159s init pass on a full reload, and eliminates the per-cycle `datelev=0` full-table
scan on steady-state incremental loads.

## Verified current data flow (`RapidReconciler-SSIS/RapidReconciler_Prod.dtsx`)

"Get F4111 New" OLE-DB source (expression-built), against the JDE source:

```
Select ILKCOO, ILKCO, ILDCT, ILDOC, ILDCTO, ILMCU, ILLOCN, ILLOTN, ILGLPT, ILDGL, ILICU,
       ILPAID, ILDOCO, ILLNID, ILCRDJ, ILIPCD, ILTREF, ILUKID, ILTREX, ILUNCS, ILTRUM,
       ILTRQT, ILITM, ILUSER
From <dbowner>F4111 Where ILUKID > <maxUKID> And ILIPCD != 'X' and ILCRDJ >= <startdatejul>
```

- Pulls raw JDE columns incl. **`ILDGL`** and **`ILCRDJ`** (Julian). A "Date Format" derived-column stage
  converts Julian → datetime (same pattern as the f3106 flow's `SDDGJ`/`SDDICJ` conversion).
- Destination FASTLOADs `[New]` rows into `dbo.F4111`. `perioddate` / `datelev` / `costlevel` /
  `primaryuom` / `itemid` are **not** in the select → they land at their defaults (`datelev=0`,
  `perioddate` null, `costlevel=''`, `itemid=0`) and are filled later by B→C data_prep.

## The `perioddate` / `datelev` logic to replicate (from `usp6_006_inventory_data_prep`)

Two live branches today (the `usegldate` system-variable switch; default is `usegldate = 0`,
creation-date basis — "The ability to update this value is not available in the application"):

**Initial-load branch** (`if not exists (select top 1 transid from rtransactions)`), all rows:
```
datelev    = 5
perioddate = CASE WHEN ildgl > getdate()   THEN getdate()   -- no future dates
                  WHEN ildgl > '2000-02-01' THEN ildgl
                  ELSE ilcrdj END
```

**Incremental branch** (`where datelev = 0`), creation-date basis (`usegldate = 0`):
```
datelev    = CASE WHEN ilcrdj > getdate() THEN 3 ELSE 4 END
perioddate = CASE WHEN ilcrdj > getdate()      THEN getdate()
                  WHEN ilcrdj = '2000-01-01'   THEN ildgl
                  ELSE ilcrdj END
```

(A `usegldate = 1` GL-basis branch also exists but only fires if the flag was hand-set on the server.)

## Change

**SSIS side (primary):** in "Get F4111 New", after the Julian→datetime conversion, add a derived column
that computes **`perioddate`** and **`datelev`** using the **incremental-branch** expressions above
(a newly-pulled row is by definition a new row = the incremental case), and map them into the F4111
destination. Net: new rows land with `datelev != 0` and `perioddate` set.

**DB side:** **no change required for the happy path** — the `where datelev = 0` incremental pass simply
finds nothing and no-ops. One thing to confirm on the walk-fix re-run: the **initial-load branch** does a
full-table `update f4111 ... datelev = 5` regardless of `datelev`, so on the very first load it would
re-stamp the SSIS-computed values (harmless — same math). On every subsequent (incremental) cycle
RTransactions is non-empty, the init branch is skipped, and the SSIS stamp is authoritative.

## Follow-up (stage 2): cost/uom

`costlevel` / `primaryuom` come from **F4101** (`imclev` / `imuom1`), joined on `ilitm = imitm`. Moveable
by joining F4101 in the "Get F4111 New" **source SELECT** (F4101 is JDE-side, available at pull time), but
it's a bigger change (join in the windowed pull) — do it as a separate step after perioddate proves out.

## Not moving: itemid

`itemid` joins **RItems** (RR-internal cross-ref) **and** reads the just-stamped `costlevel`/`primaryuom`
— neither is available in the JDE source pull. It stays in data_prep (the `where a.itemid = 0` pass). A
filtered index `F4111(itemid) WHERE itemid = 0` (finding ② option C) would turn its per-cycle scan-to-find
into a seek on incremental loads — cheap, independent, can land any time.

## Sequencing & measurement

1. Owner re-runs the walk-fixed `usp6_006_inventory` first → backfills the 809K RTransactions rows and
   establishes the **corrected 20.6-min full-reload baseline**.
2. Apply the SSIS derived-column change, load-test with a B→C run.
3. Measure vs the baseline. Expect: **−159s** on a full reload; on incremental cycles the `datelev=0`
   full-table scan disappears entirely. Confirm `perioddate` values match the pre-change data_prep output
   (spot-check a sample of new rows: SSIS-computed vs the CASE logic).
