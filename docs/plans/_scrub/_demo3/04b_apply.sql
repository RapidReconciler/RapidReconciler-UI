/* ============================================================
   Demo3 (TR) — Stage 4b: apply account obj/sub maps. Set-based per
   table, hash-join to the small maps. Idempotent (new values disjoint
   from old). EXTENDED beyond _demo2: adds F4311 + F4111 (3M, batched).
   Maps built in 4a. F0901 account descriptions re-themed here.
   Target: jdesource_tr.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;
DECLARE @b int = 300000, @r int;

/* F0901 master obj/sub + description */
UPDATE f SET GMOBJ = mo.new_obj FROM PRODDTA.F0901 f JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.GMOBJ);
PRINT 'F0901 gmobj ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET GMSUB = ms.new_sub FROM PRODDTA.F0901 f JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.GMSUB)) WHERE LTRIM(RTRIM(ISNULL(f.GMSUB,'')))<>'';
PRINT 'F0901 gmsub ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET GMDL01 = LEFT(
  CASE WHEN LEFT(RTRIM(f.GMOBJ),2)='14' THEN 'Raw Materials Inventory'
       WHEN LEFT(RTRIM(f.GMOBJ),1)='1'  THEN 'Inventory - ' + pw.w
       WHEN LEFT(RTRIM(f.GMOBJ),1)='2'  THEN 'Accounts Payable'
       WHEN LEFT(RTRIM(f.GMOBJ),1)='4'  THEN 'Sales - ' + pw.w
       WHEN LEFT(RTRIM(f.GMOBJ),1)='5'  THEN 'COGS - ' + pw.w
       WHEN LEFT(RTRIM(f.GMOBJ),1)='7'  THEN 'Operating Expense'
       WHEN LEFT(RTRIM(f.GMOBJ),1)='8'  THEN 'Other Expense'
       ELSE 'General Ledger Account' END, 30)
FROM PRODDTA.F0901 f
JOIN scrub.w pw ON pw.kind='ptype' AND pw.id = ABS(CONVERT(int,HASHBYTES('MD5',CONCAT(RTRIM(f.GMOBJ),'|',RTRIM(f.GMSUB))))) % 15
WHERE RTRIM(ISNULL(f.GMDL01,'')) <> '';
PRINT 'F0901 gmdl01 ' + CAST(@@ROWCOUNT AS varchar(12));

/* F4095 AAI obj/sub */
UPDATE f SET MLOBJ = mo.new_obj FROM PRODDTA.F4095 f JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.MLOBJ);
PRINT 'F4095 mlobj ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET MLSUB = ms.new_sub FROM PRODDTA.F4095 f JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.MLSUB)) WHERE LTRIM(RTRIM(ISNULL(f.MLSUB,'')))<>'';
PRINT 'F4095 mlsub ' + CAST(@@ROWCOUNT AS varchar(12));

/* F4311 PO detail obj/sub (ADDED vs _demo2) */
UPDATE f SET PDOBJ = COALESCE(mo.new_obj, f.PDOBJ), PDSUB = COALESCE(ms.new_sub, f.PDSUB)
FROM PRODDTA.F4311 f
LEFT JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.PDOBJ)
LEFT JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.PDSUB))
WHERE mo.old_obj IS NOT NULL OR ms.old_sub IS NOT NULL;
PRINT 'F4311 obj/sub ' + CAST(@@ROWCOUNT AS varchar(12));

/* F43121 receipts obj/sub */
UPDATE f SET PROBJ = COALESCE(mo.new_obj, f.PROBJ), PRSUB = COALESCE(ms.new_sub, f.PRSUB)
FROM PRODDTA.F43121 f
LEFT JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.PROBJ)
LEFT JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.PRSUB))
WHERE mo.old_obj IS NOT NULL OR ms.old_sub IS NOT NULL;
PRINT 'F43121 obj/sub ' + CAST(@@ROWCOUNT AS varchar(12));

/* F0911 detail obj/sub — single pass (1.6M, SIMPLE recovery) */
UPDATE f SET GLOBJ = COALESCE(mo.new_obj, f.GLOBJ), GLSUB = COALESCE(ms.new_sub, f.GLSUB)
FROM PRODDTA.F0911 f
LEFT JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.GLOBJ)
LEFT JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.GLSUB))
WHERE mo.old_obj IS NOT NULL OR ms.old_sub IS NOT NULL;
PRINT 'F0911 obj/sub ' + CAST(@@ROWCOUNT AS varchar(12));

/* F4111 cardex obj/sub (ADDED vs _demo2; 3M — batched) */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) f SET ILOBJ = COALESCE(mo.new_obj, f.ILOBJ), ILSUB = COALESCE(ms.new_sub, f.ILSUB)
  FROM PRODDTA.F4111 f
  LEFT JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.ILOBJ)
  LEFT JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.ILSUB))
  WHERE (mo.old_obj IS NOT NULL AND f.ILOBJ <> mo.new_obj)
     OR (ms.old_sub IS NOT NULL AND f.ILSUB <> ms.new_sub);
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F4111 obj/sub done';

PRINT 'STAGE4B_COMPLETE';
