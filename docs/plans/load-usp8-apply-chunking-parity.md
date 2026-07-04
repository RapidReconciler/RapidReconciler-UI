# Load perf: bring `usp8_apply_f4211` to the `f4311` fast-path + chunked pattern

**Status:** spec, uncommitted (2026-07-03). Zero-box source audit; needs a dev test-deploy before shipping.

## Audit result — which `usp8_apply_*` procs actually need work

Source audit of all 7 (`f0011, f0911, f4102, f4311, f43121, f4111, f4211`):

| Proc | Pattern today | Needs upgrade? |
|---|---|---|
| f0011, f0911, f4102, f4311, f43121 | empty-target **fast path** (disable NC idx → `TABLOCK` insert → rebuild) **+** re-run **chunked MERGE** (100K `_seq` batches) | ✅ already good |
| **f4211** | dedupe #temp, then **one unbounded MERGE** — no fast path, no chunking | ⬅ **upgrade this one** |
| f4111 | **update-only** MERGE over `Staging_F4111` = the small *open-rows* change-set (~144 rows on Demo1); new rows come from the separate **"Get F4111 New"** SSIS flow | ❌ no change — input is a small delta |

**Correction to the earlier audit:** f4111 apply is *not* a full-table operation, so it does not need chunking. The heavy F4111 cost (the 3.2M new-row bulk load **and the index rebuild that gates the next table**) is the **"Get F4111 New" flow in the SSIS package**, not this proc — track that separately (it's the parallelization question).

**Reminder — the bigger lever is memory, not batching.** Tonight's swamp (`usp8_apply_f43121`) is *already* chunked, yet ran I/O-bound (`PAGEIOLATCH_EX`) because the 2 GB buffer-pool cap forces disk reads. Raising `max server memory` (the shared-box tradeoff) helps every table more than this rewrite. This spec is the correctness/parity fix; memory is the perf fix.

## The change to `usp8_apply_f4211`

Mirror `usp8_apply_f4311` exactly. Build the deduped `#f4211` **once** (it already does this), add a `_seq`, then branch:

- **Empty target (initial full load):** disable NC indexes → single minimally-logged `INSERT … WITH (TABLOCK)` from `#f4211` → rebuild NC indexes `WITH (SORT_IN_TEMPDB = ON)`, in TRY/CATCH so indexes restore on failure. (Insert from the **deduped `#f4211`**, not raw staging, so it does not depend on `pk_f4211` being `IGNORE_DUP_KEY`.)
- **Re-run (non-empty):** the existing MERGE, but **chunked** in 100K `_seq` batches via a `WHILE` loop (bounds the log under SIMPLE recovery).

### Draft (review + dev test-deploy before shipping)

```sql
CREATE OR ALTER PROCEDURE [dbo].[usp8_apply_f4211]
AS
BEGIN
    SET NOCOUNT ON;

    IF NOT EXISTS (SELECT 1 FROM dbo.Staging_F4211)
        RETURN;   -- empty/failed pull => don't touch F4211

    -- Collapse to one row per 5-col PK (keep max sdupmj) + _seq for chunked apply.
    IF OBJECT_ID('tempdb..#f4211') IS NOT NULL DROP TABLE #f4211;
    SELECT d.*, _seq = ROW_NUMBER () OVER (ORDER BY (SELECT 1))
    INTO #f4211
    FROM (SELECT s.*, _rn = ROW_NUMBER () OVER (
                     PARTITION BY s.sdkcoo, s.sddoco, s.sddcto, s.sdlnid, s.sdsfxo
                     ORDER BY s.sdupmj DESC)
          FROM dbo.Staging_F4211 s) d
    WHERE d._rn = 1;

    DECLARE @newRows INT =
        (SELECT COUNT (*) FROM #f4211 s
         WHERE NOT EXISTS (SELECT 1 FROM dbo.F4211 t
                           WHERE t.sdkcoo = s.sdkcoo AND t.sddoco = s.sddoco AND t.sddcto = s.sddcto
                             AND t.sdlnid = s.sdlnid AND t.sdsfxo = s.sdsfxo));
    DECLARE @affected INT = 0;

    IF NOT EXISTS (SELECT 1 FROM dbo.F4211)
    BEGIN
        -- FAST PATH: empty target => minimally-logged bulk load.
        BEGIN TRY
            DECLARE @dis nvarchar(max) = N'', @reb nvarchar(max) = N'';
            SELECT @dis = @dis + N'ALTER INDEX ' + QUOTENAME(i.name) + N' ON dbo.F4211 DISABLE;' + CHAR(13)
            FROM sys.indexes i
            WHERE i.object_id = OBJECT_ID(N'dbo.F4211') AND i.type_desc = N'NONCLUSTERED'
              AND i.is_primary_key = 0 AND i.is_unique_constraint = 0 AND i.is_disabled = 0;
            SELECT @reb = @reb + N'ALTER INDEX ' + QUOTENAME(i.name) + N' ON dbo.F4211 REBUILD WITH (SORT_IN_TEMPDB = ON);' + CHAR(13)
            FROM sys.indexes i
            WHERE i.object_id = OBJECT_ID(N'dbo.F4211') AND i.type_desc = N'NONCLUSTERED'
              AND i.is_primary_key = 0 AND i.is_unique_constraint = 0;
            IF @dis <> N'' EXEC sys.sp_executesql @dis;

            INSERT INTO dbo.F4211 WITH (TABLOCK)
                   (sdkcoo, sddoco, sddcto, sdlnid, sdsfxo, sduncs, sdecst, sdtcst, sddoc, sddct,
                    sdmcu, sdco, sdglc, sdlnty, sdcsto, sdso01, sdso02, sdrorn, sdrcto, sdrlln,
                    sdnxtr, sdokc, sdodoc, sdodct, sdoorn, sdocto, sdokco, sdogno, sdrkco, sditm,
                    sdlitm, sdlocn, sdlotn, sdpqor, sduom1, sdso11, sdaexp, sdcrcd, sdcrr, sdfea,
                    sdtrdj, sdaddj, sddgl, sdupmj, InsertDate)
            SELECT sdkcoo, sddoco, sddcto, sdlnid, sdsfxo, sduncs, sdecst, sdtcst, sddoc, sddct,
                   sdmcu, sdco, sdglc, sdlnty, sdcsto, sdso01, sdso02, sdrorn, sdrcto, sdrlln,
                   sdnxtr, sdokc, sdodoc, sdodct, sdoorn, sdocto, sdokco, sdogno, sdrkco, sditm,
                   sdlitm, sdlocn, sdlotn, sdpqor, sduom1, sdso11, sdaexp, sdcrcd, sdcrr, sdfea,
                   sdtrdj, sdaddj, sddgl, sdupmj, GETDATE ()
            FROM #f4211;
            SET @affected = @@ROWCOUNT;
            SET @newRows  = @affected;   -- every row is new on an initial load
            IF @reb <> N'' EXEC sys.sp_executesql @reb;
        END TRY
        BEGIN CATCH
            IF @reb <> N'' EXEC sys.sp_executesql @reb;   -- restore indexes even on failure
            THROW;
        END CATCH
    END
    ELSE
    BEGIN
        -- RE-RUN: chunked MERGE (100K committed batches; log truncates between them).
        DECLARE @b INT = 100000, @lo INT = 1, @max INT = (SELECT ISNULL (MAX (_seq), 0) FROM #f4211);
        WHILE @lo <= @max
        BEGIN
            MERGE dbo.F4211 WITH (HOLDLOCK) AS t
            USING (SELECT * FROM #f4211 WHERE _seq >= @lo AND _seq < @lo + @b) AS s
               ON t.sdkcoo = s.sdkcoo AND t.sddoco = s.sddoco AND t.sddcto = s.sddcto
              AND t.sdlnid = s.sdlnid AND t.sdsfxo = s.sdsfxo
            WHEN MATCHED AND t.sdupmj <> s.sdupmj THEN
                UPDATE SET t.sduncs = s.sduncs, t.sdecst = s.sdecst, t.sddoc = s.sddoc, t.sddct = s.sddct,
                           t.sdlnty = s.sdlnty, t.sdcsto = s.sdcsto, t.sdso01 = s.sdso01, t.sdso02 = s.sdso02,
                           t.sdnxtr = s.sdnxtr, t.sdpqor = s.sdpqor, t.sdaexp = s.sdaexp, t.sddgl = s.sddgl,
                           t.sdupmj = s.sdupmj, t.ChangeDate = GETDATE ()
            WHEN NOT MATCHED BY TARGET THEN
                INSERT (sdkcoo, sddoco, sddcto, sdlnid, sdsfxo, sduncs, sdecst, sdtcst, sddoc, sddct,
                        sdmcu, sdco, sdglc, sdlnty, sdcsto, sdso01, sdso02, sdrorn, sdrcto, sdrlln,
                        sdnxtr, sdokc, sdodoc, sdodct, sdoorn, sdocto, sdokco, sdogno, sdrkco, sditm,
                        sdlitm, sdlocn, sdlotn, sdpqor, sduom1, sdso11, sdaexp, sdcrcd, sdcrr, sdfea,
                        sdtrdj, sdaddj, sddgl, sdupmj, InsertDate)
                VALUES (s.sdkcoo, s.sddoco, s.sddcto, s.sdlnid, s.sdsfxo, s.sduncs, s.sdecst, s.sdtcst,
                        s.sddoc, s.sddct, s.sdmcu, s.sdco, s.sdglc, s.sdlnty, s.sdcsto, s.sdso01, s.sdso02,
                        s.sdrorn, s.sdrcto, s.sdrlln, s.sdnxtr, s.sdokc, s.sdodoc, s.sdodct, s.sdoorn,
                        s.sdocto, s.sdokco, s.sdogno, s.sdrkco, s.sditm, s.sdlitm, s.sdlocn, s.sdlotn,
                        s.sdpqor, s.sduom1, s.sdso11, s.sdaexp, s.sdcrcd, s.sdcrr, s.sdfea, s.sdtrdj,
                        s.sdaddj, s.sddgl, s.sdupmj, GETDATE ());
            SET @affected += @@ROWCOUNT;
            SET @lo += @b;
        END
    END

    INSERT dbo.RSsisLoadLog (table_name, new_rows, changed_rows, note)
        VALUES (N'F4211', @newRows, @affected - @newRows, NULL);
    PRINT CONCAT ('usp8_apply_f4211: ', @newRows, ' new; ', @affected - @newRows, ' updated.');
END
```

## Notes / before shipping
- **Faithful port:** the fast-path insert column list + the MERGE UPDATE/INSERT columns are copied verbatim from the current proc — no behavior change beyond bounding.
- Deploy via VALC (`execute-sql`) to Demo1 for a dev test, confirm F4211 populates from a full load; it's an existing proc already in `RapidReconciler.sqlproj` (`CREATE OR ALTER`), so no Build Include change needed. Canonical case / UPPERCASE keywords per the SQL standard.
- Do **not** add a MAXDOP hint here — server MAXDOP is already 4; the real perf lever is buffer-pool memory (see the right-size-box task).
