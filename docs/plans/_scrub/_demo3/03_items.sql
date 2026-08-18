/* ============================================================
   Demo3 (TR) sanitization — Stage 3: 2nd/3rd item numbers.
   Short item (ITM) stays (non-identifying internal key). LITM (2nd)
   + AITM (3rd) carry real product codes -> remap, keyed on short item
   so consistent everywhere. EXTENDED beyond the _demo2 template: TR
   carries LITM/AITM in F4111 (3M), F4102, F4105, F4801 too — those
   would otherwise keep the real codes. Target: jdesource_tr.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;
DECLARE @b int = 300000;

/* map from the UNION of short items across EVERY LITM/AITM table */
IF OBJECT_ID('scrub.map_item') IS NOT NULL DROP TABLE scrub.map_item;
CREATE TABLE scrub.map_item (itm int PRIMARY KEY, new_litm nvarchar(50), new_aitm nvarchar(50));
;WITH allitems AS (
  SELECT IMITM AS itm FROM PRODDTA.F4101
  UNION SELECT ILITM FROM PRODDTA.F4111
  UNION SELECT SDITM FROM PRODDTA.F4211
  UNION SELECT PDITM FROM PRODDTA.F4311
  UNION SELECT PRITM FROM PRODDTA.F43121
  UNION SELECT IBITM FROM PRODDTA.F4102
  UNION SELECT COITM FROM PRODDTA.F4105
  UNION SELECT WAITM FROM PRODDTA.F4801
)
INSERT scrub.map_item (itm, new_litm, new_aitm)
SELECT itm,
       'SI-'  + RIGHT('000000'   + CAST(itm AS varchar(12)), 6),
       'SMC'  + RIGHT('00000000' + CAST(itm AS varchar(12)), 8)
FROM allitems WHERE itm IS NOT NULL;
PRINT 'map_item rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* small tables — single-shot */
UPDATE f SET IMLITM=m.new_litm, IMAITM=m.new_aitm FROM PRODDTA.F4101 f JOIN scrub.map_item m ON m.itm=f.IMITM;
PRINT 'F4101 litm/aitm: ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET IBLITM=m.new_litm, IBAITM=m.new_aitm FROM PRODDTA.F4102 f JOIN scrub.map_item m ON m.itm=f.IBITM;
PRINT 'F4102 litm/aitm: ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET COLITM=m.new_litm, COAITM=m.new_aitm FROM PRODDTA.F4105 f JOIN scrub.map_item m ON m.itm=f.COITM;
PRINT 'F4105 litm/aitm: ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET PDLITM=m.new_litm, PDAITM=m.new_aitm FROM PRODDTA.F4311 f JOIN scrub.map_item m ON m.itm=f.PDITM;
PRINT 'F4311 litm/aitm: ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE f SET WALITM=m.new_litm, WAAITM=m.new_aitm FROM PRODDTA.F4801 f JOIN scrub.map_item m ON m.itm=f.WAITM;
PRINT 'F4801 litm/aitm: ' + CAST(@@ROWCOUNT AS varchar(12));

/* F4211 sales detail — batched */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) f SET SDLITM=m.new_litm, SDAITM=m.new_aitm
  FROM PRODDTA.F4211 f JOIN scrub.map_item m ON m.itm=f.SDITM
  WHERE f.SDLITM<>m.new_litm OR f.SDAITM<>m.new_aitm;
  IF @@ROWCOUNT=0 BREAK; END
PRINT 'F4211 litm/aitm done';

/* F43121 receipts — batched */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) f SET PRLITM=m.new_litm, PRAITM=m.new_aitm
  FROM PRODDTA.F43121 f JOIN scrub.map_item m ON m.itm=f.PRITM
  WHERE f.PRLITM<>m.new_litm OR f.PRAITM<>m.new_aitm;
  IF @@ROWCOUNT=0 BREAK; END
PRINT 'F43121 litm/aitm done';

/* F4111 cardex (3M) — batched */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) f SET ILLITM=m.new_litm, ILAITM=m.new_aitm
  FROM PRODDTA.F4111 f JOIN scrub.map_item m ON m.itm=f.ILITM
  WHERE f.ILLITM<>m.new_litm OR f.ILAITM<>m.new_aitm;
  IF @@ROWCOUNT=0 BREAK; END
PRINT 'F4111 litm/aitm done';

PRINT 'STAGE3_COMPLETE';
