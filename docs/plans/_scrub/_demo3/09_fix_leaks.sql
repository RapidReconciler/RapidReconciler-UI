/* ============================================================
   Demo3 (TR) — Stage 9 leak fixes. Target: jdesource_tr.
   Phase-9 sweep found the item/product description text leaks in SEVEN
   columns: the item master (IMDSC2) plus its snapshots copied onto sales
   lines (SDDSC1/2), PO lines (PDDSC1/2), and work orders (WADL01), and the
   BU compressed desc (MCDC). Stage 1 themed only the item-master IMDSC1.

   Fix (theme-from-item): re-theme IMDSC2 from the SAME scrub.w F&B word
   lists FIRST (it is the source), then copy each line's description from
   the item master so a line shows the same themed text as its item.
   Join key = short item IMITM (float). Only re-theme cells that currently
   hold a description (preserve blank lines). Orphan lines (desc set, item
   not in F4101) are handled by a final blank sweep at the end.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;

/* 1. item master IMDSC2 — re-theme from word lists (distinct salt vs IMDSC1) */
UPDATE f SET imdsc2 = LEFT(m.w + N' ' + t.w + N' ' + z.w, 30)
FROM PRODDTA.F4101 f
JOIN scrub.w m ON m.kind='mat'   AND m.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.imitm)),'|m2')))) % 8
JOIN scrub.w t ON t.kind='ptype' AND t.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.imitm)),'|t2')))) % 15
JOIN scrub.w z ON z.kind='size'  AND z.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(CONVERT(varchar(30),f.imitm)),'|z2')))) % 8
WHERE RTRIM(ISNULL(f.imdsc2,'')) <> '';
PRINT 'F4101 imdsc2 re-themed ' + CAST(@@ROWCOUNT AS varchar(12));

/* 2. sales lines (F4211) <- item master themed descriptions */
UPDATE f SET SDDSC1 = im.imdsc1 FROM PRODDTA.F4211 f JOIN PRODDTA.F4101 im ON im.imitm = f.SDITM WHERE RTRIM(ISNULL(f.SDDSC1,'')) <> '';
PRINT 'F4211 SDDSC1 <- imdsc1 ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET SDDSC2 = im.imdsc2 FROM PRODDTA.F4211 f JOIN PRODDTA.F4101 im ON im.imitm = f.SDITM WHERE RTRIM(ISNULL(f.SDDSC2,'')) <> '';
PRINT 'F4211 SDDSC2 <- imdsc2 ' + CAST(@@ROWCOUNT AS varchar(12));

/* 3. PO lines (F4311) <- item master themed descriptions */
UPDATE f SET PDDSC1 = im.imdsc1 FROM PRODDTA.F4311 f JOIN PRODDTA.F4101 im ON im.imitm = f.PDITM WHERE RTRIM(ISNULL(f.PDDSC1,'')) <> '';
PRINT 'F4311 PDDSC1 <- imdsc1 ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET PDDSC2 = im.imdsc2 FROM PRODDTA.F4311 f JOIN PRODDTA.F4101 im ON im.imitm = f.PDITM WHERE RTRIM(ISNULL(f.PDDSC2,'')) <> '';
PRINT 'F4311 PDDSC2 <- imdsc2 ' + CAST(@@ROWCOUNT AS varchar(12));

/* 4. work orders (F4801) <- item master primary description */
UPDATE f SET WADL01 = im.imdsc1 FROM PRODDTA.F4801 f JOIN PRODDTA.F4101 im ON im.imitm = f.WAITM WHERE RTRIM(ISNULL(f.WADL01,'')) <> '';
PRINT 'F4801 WADL01 <- imdsc1 ' + CAST(@@ROWCOUNT AS varchar(12));

/* 5. BU compressed desc (F0006) <- themed BU description */
UPDATE PRODDTA.F0006 SET MCDC = MCDL01 WHERE RTRIM(ISNULL(MCDC,'')) <> '';
PRINT 'F0006 MCDC <- mcdl01 ' + CAST(@@ROWCOUNT AS varchar(12));

/* 6. orphan safety net — any line desc still non-blank whose item is not
      in F4101 keeps real text; blank those so nothing leaks. */
UPDATE f SET SDDSC1='' FROM PRODDTA.F4211 f WHERE RTRIM(ISNULL(f.SDDSC1,''))<>'' AND NOT EXISTS(SELECT 1 FROM PRODDTA.F4101 im WHERE im.imitm=f.SDITM);
UPDATE f SET SDDSC2='' FROM PRODDTA.F4211 f WHERE RTRIM(ISNULL(f.SDDSC2,''))<>'' AND NOT EXISTS(SELECT 1 FROM PRODDTA.F4101 im WHERE im.imitm=f.SDITM);
UPDATE f SET PDDSC1='' FROM PRODDTA.F4311 f WHERE RTRIM(ISNULL(f.PDDSC1,''))<>'' AND NOT EXISTS(SELECT 1 FROM PRODDTA.F4101 im WHERE im.imitm=f.PDITM);
UPDATE f SET PDDSC2='' FROM PRODDTA.F4311 f WHERE RTRIM(ISNULL(f.PDDSC2,''))<>'' AND NOT EXISTS(SELECT 1 FROM PRODDTA.F4101 im WHERE im.imitm=f.PDITM);
UPDATE f SET WADL01='' FROM PRODDTA.F4801 f WHERE RTRIM(ISNULL(f.WADL01,''))<>'' AND NOT EXISTS(SELECT 1 FROM PRODDTA.F4101 im WHERE im.imitm=f.WAITM);
PRINT 'orphan safety-net blanks applied';

PRINT 'STAGE9_FIX_COMPLETE';
