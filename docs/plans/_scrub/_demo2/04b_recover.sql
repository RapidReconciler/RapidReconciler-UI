/* Recovery: 04b completed gmobj/gmsub/mlobj/mlsub/F43121/F0911-objsub but the
   F0901 gmdl01 (account descriptions) UPDATE truncated + rolled back. Re-run ONLY
   gmdl01 with the width fix (short prefixes + LEFT cap). Do NOT re-run the obj/sub
   applies — a class-preserving obj remap is not safely re-runnable. gmdl01 reads the
   already-remapped gmobj (class preserved), so it themes correctly. */
SET NOCOUNT ON;
USE jdesource_na;
UPDATE f SET gmdl01 = LEFT(
  CASE WHEN LEFT(RTRIM(f.gmobj),2)='14' THEN 'Raw Materials Inventory'
       WHEN LEFT(RTRIM(f.gmobj),1)='1'  THEN 'Inventory - ' + pw.w
       WHEN LEFT(RTRIM(f.gmobj),1)='2'  THEN 'Accounts Payable'
       WHEN LEFT(RTRIM(f.gmobj),1)='4'  THEN 'Sales - ' + pw.w
       WHEN LEFT(RTRIM(f.gmobj),1)='5'  THEN 'COGS - ' + pw.w
       WHEN LEFT(RTRIM(f.gmobj),1)='7'  THEN 'Operating Expense'
       WHEN LEFT(RTRIM(f.gmobj),1)='8'  THEN 'Other Expense'
       ELSE 'General Ledger Account' END, 30)
FROM PRODDTA.F0901 f
JOIN scrub.w pw ON pw.kind='ptype' AND pw.id = ABS(CHECKSUM(f.gmobj,f.gmsub)) % 15
WHERE RTRIM(ISNULL(f.gmdl01,'')) <> '';
PRINT 'F0901 gmdl01 (recover) ' + CAST(@@ROWCOUNT AS varchar(12));
PRINT 'RECOVER_GMDL01_COMPLETE';
