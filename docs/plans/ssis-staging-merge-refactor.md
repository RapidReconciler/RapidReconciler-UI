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
- **F4111** (cardex) — keys `ilukid`; change cols per its current Conditional Split.
- **F4102** (item branch) — keys `ibmcu, ibitm`.
- **F43121** (receipts) — keys per `Update F43121`.
- **F0011** (batch) — keys `icicut, icicu`.
Each: reverse-engineer its Conditional Split (same method as F0911 above), write
`Staging_<t>` + `usp8_apply_<t>`, rewire, parity-test. Append-only flows
(F42119, F3106) and the truncate-reload masters are **unchanged**.
