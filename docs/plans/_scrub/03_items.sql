/* ============================================================
   Stage 2: item LITM (2nd) + AITM (3rd) remap. Short item (ITM)
   unchanged. Keyed on short item so it's consistent everywhere.
   New values derived from the (non-identifying) short item.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_dev;
DECLARE @b int = 300000;

/* map built from the UNION of every short item that appears in any
   LITM/AITM-carrying table, so no carrying row is missed. */
IF OBJECT_ID('scrub.map_item') IS NOT NULL DROP TABLE scrub.map_item;
CREATE TABLE scrub.map_item (itm int PRIMARY KEY, new_litm nvarchar(50), new_aitm nvarchar(50));

;WITH allitems AS (
  SELECT imitm AS itm FROM PRODDTA.F4101
  UNION SELECT sditm FROM PRODDTA.F4211
  UNION SELECT pditm FROM PRODDTA.F4311
  UNION SELECT pritm FROM PRODDTA.F43121
)
INSERT scrub.map_item (itm, new_litm, new_aitm)
SELECT itm,
       'SI-'  + RIGHT('000000'   + CAST(itm AS varchar(12)), 6),
       'SMC' + RIGHT('00000000' + CAST(itm AS varchar(12)), 8)
FROM allitems WHERE itm IS NOT NULL;
PRINT 'map_item rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* F4101 master (64k) */
UPDATE f SET imlitm = m.new_litm, imaitm = m.new_aitm
FROM PRODDTA.F4101 f JOIN scrub.map_item m ON m.itm = f.imitm;
PRINT 'F4101 litm/aitm: ' + CAST(@@ROWCOUNT AS varchar(12));

/* F4311 PO detail (204k) */
UPDATE f SET pdlitm = m.new_litm
FROM PRODDTA.F4311 f JOIN scrub.map_item m ON m.itm = f.pditm
WHERE f.pdlitm <> m.new_litm;
PRINT 'F4311 pdlitm: ' + CAST(@@ROWCOUNT AS varchar(12));

/* F43121 receipts (499k) — litm + aitm, batched */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) f SET prlitm = m.new_litm, praitm = m.new_aitm
  FROM PRODDTA.F43121 f JOIN scrub.map_item m ON m.itm = f.pritm
  WHERE f.prlitm <> m.new_litm OR f.praitm <> m.new_aitm;
  IF @@ROWCOUNT = 0 BREAK; END
PRINT 'F43121 litm/aitm done';

/* F4211 sales detail (1.6M) — litm, batched */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) f SET sdlitm = m.new_litm
  FROM PRODDTA.F4211 f JOIN scrub.map_item m ON m.itm = f.sditm
  WHERE f.sdlitm <> m.new_litm;
  IF @@ROWCOUNT = 0 BREAK; END
PRINT 'F4211 sdlitm done';

PRINT 'STAGE2_COMPLETE';
