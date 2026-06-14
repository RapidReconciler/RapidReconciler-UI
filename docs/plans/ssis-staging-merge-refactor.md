# SSIS "dumb pipe + T-SQL MERGE" refactor — VS + DB worksheet

**Status:** drafted 2026-06-14 (s32). The #1 fix for the Sort memory hot spot
(see [`ssis-intra-container-parallelism.md`](ssis-intra-container-parallelism.md)
§ and memory [[reference_ssis_mce_not_honored]]). **F0911 first as the template**
(it's the only flow with delete detection, so it covers every case); replicate
to F4111 / F4102 / F43121 / F0011 after F0911 passes parity.

## Goal & shape

Kill the **blocking, fully-buffering Sort + Merge Join** in each net-change data
flow (the thing that grows in memory with RefreshDays). Move new/changed/deleted
detection to a **set-based T-SQL `MERGE`** in a stored proc. SQL Server does the
big join with proper memory grants + tempdb + indexes; SSIS memory for the
comparison drops to **zero**. Junior-proof: a junior can read a named proc in
SSMS — not a 10-component pipeline graph.

**Each net-change flow becomes three readable steps:**

1. **Execute SQL** — `TRUNCATE TABLE Staging_F0911`
2. **Data Flow** — `JDE source (windowed SELECT) → Derived Column (glaa decimal
   scale, kept) → OLE DB Destination [Staging_F0911]`, FASTLOAD. **No Sort, no
   Merge Join, no Conditional Split.** Pure move.
3. **Execute SQL** — `EXEC dbo.usp8_apply_f0911` (no parameter; the proc
   self-derives the window from the staged data)

## Exact current F0911 semantics (reverse-engineered — the parity contract)

- Merge Join = **full outer** on the 6 keys `glkco, gldct, gldoc, gldgj, gljeln,
  glextl` (the 7th PK col `gllt` is constant `'AA'` via the load filter).
- Conditional Split, by posted code only:
  - **Deleted** `ISNULL(strGLPOST)` → in RR, not in JDE window → DELETE
  - **New** `ISNULL(d_glpost)` → in JDE, not in RR → INSERT
  - **Changed** `strGLPOST != d_glpost` → posted code differs → UPDATE the
    redistribution columns (`glco, glaid, glmcu, globj, glsub, glani, glsbl,
    glaa`) + `glpost`
  - else **Unchanged** → discard
- **Window scope (critical):** both source queries filter `gldgj >= @minGLDATE
  and gllt = 'AA'`, so **deletes are window-scoped** — the MERGE's
  `NOT MATCHED BY SOURCE` MUST carry the same predicate or it would delete all of
  history.

## DB artifacts (ship via dacpac — net-new v8)

### `dbo.Staging_F0911` (new table — `RapidReconciler/dbo/Tables/`)
Mirror the JDE-pulled columns at F0911's exact types; clustered on the merge keys
so the MERGE join is seek-friendly. Truncate-and-load each run (heap of staging
is fine; the clustered index helps the MERGE).

```sql
CREATE TABLE [dbo].[Staging_F0911] (
    [glkco] NCHAR(5) NOT NULL, [gldct] NCHAR(2) NOT NULL, [gldoc] INT NOT NULL,
    [gldgj] DATETIME NOT NULL, [gljeln] DECIMAL(28,7) NOT NULL, [glextl] NCHAR(2) NOT NULL,
    [glpost] NCHAR(1) NOT NULL, [glicu] INT NOT NULL, [glicut] NCHAR(2) NOT NULL,
    [gldicj] DATETIME NOT NULL, [glco] NCHAR(5) NOT NULL, [glaid] NCHAR(8) NOT NULL,
    [glmcu] NCHAR(12) NOT NULL, [globj] NCHAR(6) NOT NULL, [glsub] NCHAR(8) NOT NULL,
    [glani] NCHAR(29) NOT NULL, [glsbl] NCHAR(8) NOT NULL, [glaa] DECIMAL(28,7) NOT NULL,
    [glexa] NCHAR(30) NOT NULL, [glexr] NCHAR(30) NOT NULL, [glr1] NCHAR(8) NOT NULL,
    [glr2] NCHAR(8) NOT NULL, [glpdct] NCHAR(2) NOT NULL, [glpo] NCHAR(8) NOT NULL,
    [gldcto] NCHAR(2) NOT NULL, [gllnid] DECIMAL(28,7) NOT NULL, [gltorg] NCHAR(10) NOT NULL,
    [gluser] NCHAR(10) NOT NULL, [gllt] NCHAR(2) NOT NULL,
    INDEX [cix_staging_f0911] CLUSTERED ([glkco],[gldct],[gldoc],[gldgj],[gljeln],[glextl])
);
```

### `dbo.usp8_apply_f0911` (new proc)
```sql
CREATE OR ALTER PROCEDURE [dbo].[usp8_apply_f0911]   -- no param: window self-derived
AS
BEGIN
  SET NOCOUNT ON;
  DECLARE @minGLDATE DATETIME = (SELECT MIN(gldgj) FROM dbo.Staging_F0911);
  IF @minGLDATE IS NULL RETURN;   -- empty staging => no-op (never delete history on a failed/empty load)
  MERGE dbo.F0911 WITH (HOLDLOCK) AS t
  USING dbo.Staging_F0911 AS s
     ON t.glkco=s.glkco AND t.gldct=s.gldct AND t.gldoc=s.gldoc
    AND t.gldgj=s.gldgj AND t.gljeln=s.gljeln AND t.glextl=s.glextl
    AND t.gllt='AA'
  WHEN MATCHED AND t.glpost <> s.glpost THEN
    UPDATE SET t.glpost=s.glpost, t.glco=s.glco, t.glaid=s.glaid, t.glmcu=s.glmcu,
               t.globj=s.globj, t.glsub=s.glsub, t.glani=s.glani, t.glsbl=s.glsbl,
               t.glaa=s.glaa, t.ChangeDate=GETDATE()
  WHEN NOT MATCHED BY TARGET THEN
    INSERT (glkco,gldct,gldoc,gldgj,gljeln,glextl,glpost,glicu,glicut,gldicj,glco,
            glaid,glmcu,globj,glsub,glani,glsbl,glaa,glexa,glexr,glr1,glr2,glpdct,
            glpo,gldcto,gllnid,gltorg,gluser,gllt,InsertDate)
    VALUES (s.glkco,s.gldct,s.gldoc,s.gldgj,s.gljeln,s.glextl,s.glpost,s.glicu,
            s.glicut,s.gldicj,s.glco,s.glaid,s.glmcu,s.globj,s.glsub,s.glani,s.glsbl,
            s.glaa,s.glexa,s.glexr,s.glr1,s.glr2,s.glpdct,s.glpo,s.gldcto,s.gllnid,
            s.gltorg,s.gluser,'AA',GETDATE())
  WHEN NOT MATCHED BY SOURCE AND t.gldgj >= @minGLDATE AND t.gllt='AA' THEN
    DELETE;
END
```

## SSIS rewiring (VS, F0911 "Copy F0911" data flow + its container)

1. **F0911 Start** Execute SQL: change `TRUNCATE Changed_Rows_F0911 / Deleted_Rows_F0911`
   → `TRUNCATE TABLE Staging_F0911`.
2. Open **Copy F0911** data flow. Delete: the **Sort**, the **Merge Join**, the
   RR-local comparison **OLE DB Source** + its sort, the **Conditional Split**,
   and the three destinations (New insert / Changed→Changed_Rows / the merge-join
   plumbing). **Keep** the JDE **OLE DB Source** + the **Derived Column** (glaa
   scaling).
3. Add one **OLE DB Destination → `Staging_F0911`** (FASTLOAD, TABLOCK), map the
   Derived-Column output columns straight across.
4. Replace the post-flow **Update F0911 Changes** Execute SQL (the old MERGE)
   with **`EXEC dbo.usp8_apply_f0911`** — **no parameter, no mapping** (the proc
   self-derives the window from `MIN(Staging_F0911.gldgj)`). Dodges the OLE-DB
   ordinal-vs-name + Julian(`minGLDATE`)-vs-Gregorian(`minGLDATEgr`) parameter
   pitfalls, and the proc no-ops on empty staging so a failed load can't delete
   history. **PARITY VERIFIED 2026-06-14:** rebuilt F0911 from empty via real
   staged JDE data = byte-identical to the old Sort/Merge-Join baseline (4220 rows,
   both-way EXCEPT 0/0); idempotent (3 runs, 0 changes).
5. `Changed_Rows_F0911` / `Deleted_Rows_F0911` become obsolete for F0911 (retire
   later; harmless to leave).

## Parity test (the gate — do NOT ship without it)

On db21 against `JDE_PRIST920`:
1. Baseline: run the **current** package, snapshot F0911 →
   `SELECT COUNT(*), CHECKSUM_AGG(BINARY_CHECKSUM(*)) FROM F0911;` and keep a copy
   (`SELECT * INTO F0911_baseline FROM F0911`).
2. Clear + run the **refactored** package.
3. Compare: row counts equal, and **both-way `EXCEPT`** returns zero rows:
   `SELECT * FROM F0911 EXCEPT SELECT * FROM F0911_baseline` and the reverse
   (ignore `InsertDate`/`ChangeDate`). Any diff = a mis-classified row → fix
   before moving on.
4. Re-run twice (idempotency): a second refresh with no JDE change must produce
   **zero** updates/inserts/deletes.

## Decisions baked in (flag if you disagree)
- **Proc-based** (not inline Execute SQL) — testable in SSMS, versioned in the
  dacpac, junior-readable.
- **New `Staging_*` tables** (full row) rather than reusing `Changed_Rows_*`
  (which hold only the change subset).
- **`glextl` joined raw** (`NCHAR(2)` is fixed-pad, so SARGable + index-seek) —
  the SSIS `LTRIM(RTRIM())` was defensive; the parity test confirms it's safe. If
  parity shows glextl mismatches, switch the ON to `LTRIM(RTRIM())` both sides.

## Rollout after F0911 passes
Same pattern, simpler (no deletes except F0911):
- **F4111** (cardex) — keys `ilukid`. **DONE — design changed; see the F4111 section below.**
- **F4102** (item branch) — keys `ibmcu, ibitm`.
- **F43121** (receipts) — keys per `Update F43121`.
- **F0011** (batch) — keys `icicut, icicu`.
Each: reverse-engineer its Conditional Split (same method as F0911 above), write
`Staging_<t>` + `usp8_apply_<t>`, rewire, parity-test. Append-only flows
(F42119, F3106) and the truncate-reload masters are **unchanged**.

---

# F4111 (cardex) — DONE on the DB side (2026-06-14, s33). Not a byte-parity port.

F4111 is two independent flows; **only the change flow is refactored** — the
**New** flow (`Get F4111 New`: `ILUKID > maxUKID And ILIPCD != 'X' and ILCRDJ >=
startdatejul`) is already a clean dumb pipe (no Sort/Merge Join) and stays as-is.

## Why it's a redesign, not a parity port
The old change flow (`Get F4111 Changes`) drives off RR's **open** rows
(`No Batch from RR F4111` source = `ilicu = 0`) Merge-Joined against a JDE pull
windowed `WHERE ILICU >= numBatch`. That JDE-side batch window is the defect:
WO/SO transactions land in the cardex **incomplete** (`ilicu = 0`) before
R31802/R42800 cut their batch, and a long-sitting one can get a batch number
**below** the high-water `numBatch` → excluded from the pull → the completion is
**missed**. `ILICU` isn't indexed either (the only seekable column on F4111 is the
`ILUKID` clustered PK), so that window also scans.

The fix keeps the open-set driver but fetches each open row's **current JDE state
by `ILUKID`** (PK seeks, no batch-monotonicity assumption). So this is a behavioral
**improvement**, validated by "converges to JDE truth + catches a completion the old
window misses," NOT byte-identical to the old logic.

## Self-deriving watch-set (the key design — confirmed against real client data)
Don't hard-code which cardex doc types are "pending batch" — they vary by customer.
**Derive them from posted GL**, keyed on the stable JDE **batch types**:
- `dbo.RF4111ChangeBatchType` (config, seeded `'0'` = WO/mfg R31802, `'IB'` = sales
  R42800) — the only knob, tunable per customer in SSMS.
- The watch order-types = `SELECT DISTINCT gldcto FROM dbo.F0911 WHERE glicut IN
  (RF4111ChangeBatchType) AND gldcto <> ''` (RR-local F0911; **non-blank** GLDCTO —
  blank = manual JEs, would re-bloat). "As long as one such txn has posted, its order
  type is learned."
- Watch-set = `F4111 WHERE ilicu = 0 AND ildcto IN (derived gldcto)`.

**Why `ilicu = 0` alone fails on real data** (client `jde_treatt`, 3.0M-row F4111):
all `ilicu = 0` = **823,381 rows (27%)**, dominated by `IQ`/`IB`/`IZ` inventory
adjustments that carry `ilicu = 0` *permanently* (never batched) → 316,596
gaps-and-islands ranges, infeasible. The batch-type/GLDCTO filter cuts it to
**316 rows / 199 ranges (~8 KB predicate)** — exactly the WO/SO pending set.

## DB artifacts (shipped to the dacpac; deployed + tested on db21 / InstTest)
1. `dbo.RF4111ChangeBatchType` — config reference table, seeded `0` + `IB`.
2. `dbo.Staging_F4111` — 6-col landing (`ilukid, ildct, ildoc, ilicu, ilipcd,
   ildgl`), clustered on `ilukid`. The 5 non-key cols = exactly what JDE rewrites at
   batch completion (parity with the old `Update F4111 Changes` MERGE).
3. `dbo.usp8_f4111_build_change_pull @dbowner, @sql OUTPUT` — derives the watch-set,
   range-compresses the open ukids, emits `SELECT … FROM <dbowner>F4111 WHERE ILUKID
   BETWEEN … OR …` (or `WHERE 1=0` when nothing qualifies). **No `ILUKID >= min`
   fallback** — range-compression already bounds *rows* to the open count; a fallback
   would widen to the whole table on an old straggler (verified: `>= min` = 11,309
   rows vs 316 for the range path on treatt).
4. `dbo.usp8_apply_f4111` — `MERGE dbo.F4111 USING Staging_F4111 ON ilukid`,
   `WHEN MATCHED AND (any of the 5 cols differ)` → UPDATE + `ChangeDate`. No INSERT
   (New flow owns inserts), no DELETE. No-ops on empty staging. PRINTs
   `N open row(s) completed; M total changed`. **Verified**: synthetic completion
   updated correctly; idempotent re-run = 0 changed.

## SSIS rewiring (VS — `Get F4111 Changes` container)
1. **Add Execute SQL Task "Build F4111 change pull"** (RRLocal):
   `EXEC dbo.usp8_f4111_build_change_pull @dbowner=?`; **ResultSet = Single row**
   (the proc returns the query as a single-row result set `[qry]` — an OLE DB OUTPUT
   param truncates a long `NVARCHAR(MAX)`). Parameter Mapping: ord `0` =
   `User::dbowner` (Input). Result Set tab: Result Name `0` → `User::qryF4111Changes`.
   Set `User::qryF4111Changes` `EvaluateAsExpression = False` (drop the old
   `ILICU >= numBatch` expression).
2. **Truncate**: change the start Execute SQL to `TRUNCATE TABLE Staging_F4111`.
   Order: Build pull → Truncate → Get F4111 Changes → Apply.
3. **Data flow → dumb pipe**: JDE source data-access mode = **"SQL command from
   variable"** = `User::qryF4111Changes`. **KEEP** `Remove Nulls 1` + `Dates and
   decimals 1` (the `GrgILDGL` Julian→date). **DELETE** Union All, Sort, `No Batch
   from RR F4111`, Merge Join, Conditional Split, the `Changed Rows` row-count, and
   the `Changed_Rows_F4111` destination. **ADD** OLE DB Destination → `Staging_F4111`
   (FASTLOAD + TABLOCK); map `ILUKID→ilukid, ILDCT→ildct, ILDOC→ildoc, ILICU→ilicu,
   ILIPCD→ilipcd, GrgILDGL→ildgl`.
4. **Replace** the post-flow `Update F4111 Changes` MERGE Execute SQL with
   `EXEC dbo.usp8_apply_f4111` (no params).
5. **Obsolete** (retire when convenient): `qryF4111Changes` expression,
   `numBatch`/`qryminbatch` (verify nothing else uses them), `Changed_Rows_F4111`
   table, `ctrF4111Chg`.

## Dependency + cold-start
The builder reads RR-local `F0911`, so the watch order-types come from already-loaded
GL. On a **cold first load** F0911 is empty → derivation returns nothing → `WHERE
1=0` → no changes applied (correct: a first load has no completions to catch; the New
flow loads everything). In steady state the order-type set is stable, so no
ordering dependency between the GL and Inv containers.

## ⚠ Surfacing note (carries to NEXT#3, affects F0911 too)
An **Execute SQL Task does NOT propagate T-SQL `PRINT` to
`catalog.event_messages`** — confirmed on F0911 execs 190/191 (Verbose logging, 302
OnInformation messages, none carrying the PRINT). The proc PRINTs are correct at the
SQL level (visible in SSMS direct runs) but invisible to the catalog log. So VALC's
planned per-run row-count line must read a **log table** the proc writes, not the
SSIS info stream. The `usp8_apply_*` PRINTs stay (useful in SSMS) but aren't the
surfacing mechanism.

---

# F0011 / F4102 — DONE on the DB side (2026-06-14, s33). Classic F0911-style ports.

Both are the straightforward template: stage the existing windowed/full pull, then a
set-based MERGE does **insert (new) + update (changed)**, **no delete** (parity — neither
has one), and **no build-pull proc** (the source query is unchanged). Only the change
flow's Sort + Merge Join + Conditional Split go away.

## F0011 (batch control)
- **Parity contract:** JDE pull `qryF0011` = `ICICUT, ICICU, ICUSER, ICIAPP, ICDICJ, ICIST
  FROM <dbowner>F0011 WHERE ICDICJ >= minbatch AND ICICUT IN ('0','O','S','ST','IB','T',
  'N','NC','G','V','I')`. RR side `qryF0011RR` pulls the **whole** RR F0011 (the Sort
  cost). Merge Join on `(ICICUT, ICICU)` → Conditional Split → New (insert) / Changed
  (update `iciapp, icist`). No delete.
- **DB:** `dbo.Staging_F0011` (6 cols, clustered `icicut,icicu`), `dbo.usp8_apply_f0011`
  (MERGE; update `iciapp,icist` when differ; insert the 6 pulled + InsertDate). Deployed
  + smoke-tested on db21 (1 new + 1 updated, rolled back).
- **VS steps (`Copy F0011` / its container):** keep `qryF0011` source + the Dates-and-
  decimals (Julian `ICDICJ`→date). **Delete** `qryF0011RR` source, Sort, Merge Join,
  Conditional Split, the New-insert dest, `Changed_Rows_F0011` dest. **Add** OLE DB dest
  → `Staging_F0011` (FASTLOAD+TABLOCK). Change the start truncate to `TRUNCATE TABLE
  Staging_F0011`. Replace the post `MERGE F0011 …` Execute SQL with `EXEC
  dbo.usp8_apply_f0011`. Obsolete: `qryF0011RR`, `Changed_Rows_F0011`.

## F4102 (item branch — master data)
- **Parity contract:** JDE pull `qryF4102` = the 25 cols `IBMCU, IBITM, IBGLPT, IBSTKT,
  IBSRP1..0, IBPRP1..0, IBUPMJ FROM <dbowner>F4102` (NO window — master). MERGE key
  `(ibmcu, ibitm)`; update the 23 category/reporting cols + `ibupmj`; insert new. No
  delete.
- **DB:** `dbo.Staging_F4102` (25 cols, clustered `ibmcu,ibitm`), `dbo.usp8_apply_f4102`.
  Deployed + smoke-tested on db21 (1 new + 1 updated, rolled back).
- **VS steps:** same shape — keep `qryF4102` + Dates-and-decimals (Julian `IBUPMJ`→date);
  delete the RR-compare source + Sort + Merge Join + Conditional Split + Changed_Rows
  dest; add OLE DB dest → `Staging_F4102`; truncate `Staging_F4102`; replace the post
  `MERGE f4102 …` with `EXEC dbo.usp8_apply_f4102`.

# F43121 (receipts) — DESIGN ONLY, build DEFERRED (2026-06-14, s33)

More complex than the others; **not built blind**. Reverse-engineered contract:
- JDE pull `qryF43121` = ~60 cols from `<dbowner>F43121 LEFT JOIN <dbowner>F0101 ON
  pran8 = aban8 WHERE PRDOCO > 0 AND PRDGL >= DateF43121` (the address-book join supplies
  `abalph`). RR side `qryF43121RR` windowed `PRDGL >= DateF43121Gr`.
- Apply (`update F43121 … from F43121 a join changed_rows_f43121 b on` an **8-col key**
  `prmatc, prkcoo, prdoco, prdcto, prsfxo, prlnid, prnlin, prdoc`) updates 11 status cols
  (`prnxtr, prupmj, prdgl, prpid, praopn, prarec, praptd, praclo, pruopn, prurec, pruclo`)
  + `changedate`. New rows inserted separately.
- **Open question before building:** the flow also truncates + writes a work table
  **`F43121_rev`** (an OLE DB destination inside the flow). Determine its role (looks like
  a revision/reversal staging branch) before collapsing to a single MERGE — it may carry
  delete/reversal semantics the other tables don't.
- **Recommended build (on return):** `Staging_F43121` mirroring the pulled cols (incl. the
  F0101-derived `abalph`/`pran8`), `usp8_apply_f43121` = MERGE on the 8-col key (update the
  11 status cols when differ; insert new; keep the `PRDGL >= DateF43121` window via the
  staged pull). Resolve `F43121_rev` first. Same dumb-pipe rewiring as the others.

# Surfacing foundation shipped (2026-06-14, s33)
`dbo.RSsisLoadLog` (table) + all `usp8_apply_*` procs now INSERT a per-run row
(`table_name, new_rows, changed_rows, note`). This is the durable record VALC's Load
Progress card should read (since PRINT can't reach `catalog.event_messages`). The
per-container execution time for the Tables headers comes from
`catalog.executable_statistics` — both are the VALC surfacing task (UI, owner-reviewed).
