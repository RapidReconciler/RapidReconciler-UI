/* ============================================================
   Demo3 (TR) — Stage 8: account-input-string rebuild.
   Run AFTER obj/sub (4b) + mcu (5b) remaps. Target: jdesource_tr.

   ANI rebuild — stale account strings surface in the reconciliation UI
   and would show the OLD account even though the components were remapped.
     - F0911.glani : rebuilt from remapped glmcu/globj/glsub (template)
     - F4311.pdani : rebuilt from remapped pdmcu/pdobj/pdsub
                     (ADDED vs _demo2 08 — surface scan caught it)
     - F43121.prani / prvani : blanked (reference accounts not fully in
                     this row's own columns; a variance acct in prvani)

   F0101 deliberately NOT touched (owner 2026-07-11): RR surfaces only
   ABAN8 + ABALPH (already themed in stage 1); the rest never displays
   and the DB stays on-box, so the remaining F0101 fields are left as-is.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;

/* ---- ANI rebuild ---- */
UPDATE PRODDTA.F0911
SET glani = LTRIM(RTRIM(glmcu)) + '.' + RTRIM(globj)
          + CASE WHEN RTRIM(ISNULL(glsub,'')) <> '' THEN '.' + RTRIM(glsub) ELSE '' END
WHERE RTRIM(ISNULL(glani,'')) <> '';
PRINT 'F0911 glani rebuilt ' + CAST(@@ROWCOUNT AS varchar(12));

UPDATE PRODDTA.F4311
SET pdani = LTRIM(RTRIM(pdmcu)) + '.' + RTRIM(pdobj)
          + CASE WHEN RTRIM(ISNULL(pdsub,'')) <> '' THEN '.' + RTRIM(pdsub) ELSE '' END
WHERE RTRIM(ISNULL(pdani,'')) <> '';
PRINT 'F4311 pdani rebuilt ' + CAST(@@ROWCOUNT AS varchar(12));

UPDATE PRODDTA.F43121 SET prani = '' WHERE RTRIM(ISNULL(prani,'')) <> '';
PRINT 'F43121 prani cleared ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE PRODDTA.F43121 SET prvani = '' WHERE RTRIM(ISNULL(prvani,'')) <> '';
PRINT 'F43121 prvani cleared ' + CAST(@@ROWCOUNT AS varchar(12));

PRINT 'STAGE8_COMPLETE';
