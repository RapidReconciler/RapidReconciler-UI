/* ============================================================
   Stage 3b (FAST recovery): account obj/sub apply as SINGLE set-based
   UPDATEs — one pass per table, hash-join to the small maps. Idempotent
   (new values disjoint from old), so this finishes whatever the aborted
   batched run left, with no double-remap. Maps already built (04a).
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_dev;

UPDATE f SET gmobj = mo.new_obj FROM PRODDTA.F0901 f JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.gmobj);
PRINT 'F0901 gmobj ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET gmsub = ms.new_sub FROM PRODDTA.F0901 f JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.gmsub));
PRINT 'F0901 gmsub ' + CAST(@@ROWCOUNT AS varchar(12));

UPDATE f SET gmdl01 =
  CASE WHEN LEFT(RTRIM(f.gmobj),2)='14' THEN 'Raw Materials Inventory'
       WHEN LEFT(RTRIM(f.gmobj),1)='1'  THEN 'Inventory - ' + pw.w
       WHEN LEFT(RTRIM(f.gmobj),1)='2'  THEN 'Accounts Payable'
       WHEN LEFT(RTRIM(f.gmobj),1)='4'  THEN 'Sales Revenue - ' + pw.w
       WHEN LEFT(RTRIM(f.gmobj),1)='5'  THEN 'Cost of Goods Sold - ' + pw.w
       WHEN LEFT(RTRIM(f.gmobj),1)='7'  THEN 'Operating Expense'
       WHEN LEFT(RTRIM(f.gmobj),1)='8'  THEN 'Other Expense'
       ELSE 'General Ledger Account' END
FROM PRODDTA.F0901 f
JOIN scrub.w pw ON pw.kind='ptype' AND pw.id = ABS(CHECKSUM(f.gmobj,f.gmsub)) % 15
WHERE RTRIM(ISNULL(f.gmdl01,'')) <> '';
PRINT 'F0901 gmdl01 ' + CAST(@@ROWCOUNT AS varchar(12));

UPDATE f SET mlobj = mo.new_obj FROM PRODDTA.F4095 f JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.mlobj);
PRINT 'F4095 mlobj ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET mlsub = ms.new_sub FROM PRODDTA.F4095 f JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.mlsub)) WHERE LTRIM(RTRIM(ISNULL(f.mlsub,'')))<>'';
PRINT 'F4095 mlsub ' + CAST(@@ROWCOUNT AS varchar(12));

/* F43121 (499k) — one pass */
UPDATE f SET probj = COALESCE(mo.new_obj, f.probj), prsub = COALESCE(ms.new_sub, f.prsub)
FROM PRODDTA.F43121 f
LEFT JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.probj)
LEFT JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.prsub))
WHERE mo.old_obj IS NOT NULL OR ms.old_sub IS NOT NULL;
PRINT 'F43121 obj/sub ' + CAST(@@ROWCOUNT AS varchar(12));

/* F0911 (6.5M) — ONE pass (replaces the pathological batched loop) */
UPDATE f SET globj = COALESCE(mo.new_obj, f.globj), glsub = COALESCE(ms.new_sub, f.glsub)
FROM PRODDTA.F0911 f
LEFT JOIN scrub.map_obj mo ON mo.old_obj = RTRIM(f.globj)
LEFT JOIN scrub.map_sub ms ON ms.old_sub = LTRIM(RTRIM(f.glsub))
WHERE mo.old_obj IS NOT NULL OR ms.old_sub IS NOT NULL;
PRINT 'F0911 obj/sub ' + CAST(@@ROWCOUNT AS varchar(12));
PRINT 'STAGE3B_FAST_COMPLETE';
