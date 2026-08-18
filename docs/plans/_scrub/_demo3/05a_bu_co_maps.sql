/* ============================================================
   Demo3 (TR) — Stage 5a: BUILD + VERIFY business-unit + company maps.
   Touches NO data (scratch maps only). Target: jdesource_tr.

   COMPANY: CURATED 30xxx map (approved 2026-07-11), keyed on the
   ORIGINAL ccco. Structural companies 00000 + 99999 kept as-is.
   NOT the _demo2 sequential-8xxxx generator (owner wants Demo3 in a
   distinct 30xxx series, disjoint from Demo1/Demo2's overlapping 800xx).
   New non-structural codes (30001-30011) are disjoint from the old set
   (00001-00011) so the idempotent apply terminates and never chains.

   BU: global 'B'+6-digit sequential over the F0006 master (kills any
   identifying prefix, collision-free by construction, disjoint from the
   numeric originals). Same scheme as _demo2 05a.

   SURFACE-SCAN NOTE (2026-07-11): a %MCU / %CO value-overlap probe over
   every populated PRODDTA table proved the _demo2 05b coverage list is
   INCOMPLETE for TR. 05b adds 6 BU cols (ILMMCU/GLHMCU/PROMCU/SDEMCU/
   PDOMCU/ABMCU) + 6 company cols (GLOKCO/GLPKCO/SDCMCO/SDKCO/PDOKCO/
   WARKCO). Every populated BU value across all tables was confirmed
   present in the F0006 master (so this F0006-sourced map is complete);
   every populated company value was confirmed present in F0010's 13
   codes (so the curated 13-row map is complete). DOCO/WADOCO/PRAVCO
   etc. are order/doc/amount numbers, NOT companies — excluded.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;

/* ---- company map (CURATED — explicit, keyed on original ccco) ---- */
IF OBJECT_ID('scrub.map_co') IS NOT NULL DROP TABLE scrub.map_co;
CREATE TABLE scrub.map_co (old_co varchar(10) PRIMARY KEY, new_co varchar(10));
INSERT scrub.map_co (old_co, new_co) VALUES
 ('00000','00000'),  /* Harvest Foods Group (JDE default — kept)      */
 ('00001','30001'),  /* Golden Harvest Foods Ltd.        (GBP)        */
 ('00002','30002'),  /* Golden Harvest Foods USA Inc.    (USD)        */
 ('00003','30003'),  /* Orchard Lane Ingredients Ltd.                 */
 ('00004','30004'),  /* Maplewood Farms Ltd.                          */
 ('00005','30005'),  /* Cedarvale Oils Co.                            */
 ('00006','30006'),  /* Maplewood Farms (SA) Pty Ltd.                 */
 ('00007','30007'),  /* Maplewood Farms India Pvt Ltd.               */
 ('00008','30008'),  /* Rosewood Naturals Ltd.                        */
 ('00009','30009'),  /* Rosewood Naturals (EA) Ltd.                   */
 ('00010','30010'),  /* Harvest Foods Development Co.                 */
 ('00011','30011'),  /* Golden Harvest (Asia) Ltd.                    */
 ('99999','99999');  /* Chart of Accounts/Subledgers (structural — kept) */
PRINT 'map_co rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- business-unit map (global B+6-digit over F0006 master) ---- */
IF OBJECT_ID('scrub.map_mcu') IS NOT NULL DROP TABLE scrub.map_mcu;
CREATE TABLE scrub.map_mcu (old_mcu varchar(24) PRIMARY KEY, new_mcu varchar(24));
;WITH bus AS (SELECT DISTINCT LTRIM(RTRIM(mcmcu)) m FROM PRODDTA.F0006 WHERE LTRIM(RTRIM(ISNULL(mcmcu,'')))<>''),
 r AS (SELECT m, ROW_NUMBER() OVER (ORDER BY m) rn FROM bus)
INSERT scrub.map_mcu (old_mcu, new_mcu)
SELECT m, 'B' + RIGHT('000000' + CAST(rn AS varchar(10)), 6) FROM r;
PRINT 'map_mcu rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- verification (all want 0) ---- */
PRINT '-- co: collisions / new-in-old overlap (excl. structural no-ops) / F0010 coverage gap --';
SELECT
  (SELECT COUNT(*) FROM scrub.map_co) - (SELECT COUNT(DISTINCT new_co) FROM scrub.map_co) AS co_collide,
  (SELECT COUNT(*) FROM scrub.map_co WHERE new_co IN (SELECT old_co FROM scrub.map_co) AND old_co NOT IN ('00000','99999')) AS co_overlap,
  (SELECT COUNT(*) FROM PRODDTA.F0010 f WHERE RTRIM(ISNULL(f.ccco,''))<>''
     AND RTRIM(f.ccco) COLLATE DATABASE_DEFAULT NOT IN (SELECT old_co COLLATE DATABASE_DEFAULT FROM scrub.map_co)) AS co_uncovered_in_F0010;

PRINT '-- mcu: collisions / new-in-old overlap / F0006 coverage gap --';
SELECT
  (SELECT COUNT(*) FROM scrub.map_mcu) - (SELECT COUNT(DISTINCT new_mcu) FROM scrub.map_mcu) AS mcu_collide,
  (SELECT COUNT(*) FROM scrub.map_mcu WHERE new_mcu IN (SELECT old_mcu FROM scrub.map_mcu)) AS mcu_overlap,
  (SELECT COUNT(*) FROM PRODDTA.F0006 f WHERE LTRIM(RTRIM(ISNULL(f.mcmcu,'')))<>''
     AND LTRIM(RTRIM(f.mcmcu)) COLLATE DATABASE_DEFAULT NOT IN (SELECT old_mcu COLLATE DATABASE_DEFAULT FROM scrub.map_mcu)) AS mcu_uncovered_in_F0006;

PRINT '-- map_co contents --';
SELECT old_co, new_co FROM scrub.map_co ORDER BY old_co;
PRINT 'bu/co maps built.';
