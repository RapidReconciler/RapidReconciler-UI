/* ============================================================
   Stage 4a/5a: BUILD + VERIFY business-unit + company maps.
   - Company: keep 00000 (JDE default); others -> 8xxxx (disjoint).
   - BU: numeric BUs stay numeric (same width, high range so disjoint
     from originals); alpha BUs -> P-codes. New values disjoint from old
     so the idempotent batched apply terminates.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_na;

/* ---- company map ---- */
IF OBJECT_ID('scrub.map_co') IS NOT NULL DROP TABLE scrub.map_co;
CREATE TABLE scrub.map_co (old_co varchar(10) PRIMARY KEY, new_co varchar(10));
;WITH cos AS (SELECT DISTINCT RTRIM(ccco) c FROM PRODDTA.F0010 WHERE RTRIM(ISNULL(ccco,''))<>''),
 r AS (SELECT c, ROW_NUMBER() OVER (ORDER BY c) rn FROM cos)
INSERT scrub.map_co (old_co, new_co)
SELECT c, CASE WHEN c='00000' THEN '00000'
               ELSE '8' + RIGHT('0000' + CAST(rn AS varchar(6)), 4) END
FROM r;
PRINT 'map_co rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- business-unit map ---- */
IF OBJECT_ID('scrub.map_mcu') IS NOT NULL DROP TABLE scrub.map_mcu;
CREATE TABLE scrub.map_mcu (old_mcu varchar(24) PRIMARY KEY, new_mcu varchar(24));
/* Demo2: replaced dev's numeric-preserving scheme (collided at 1909 alpha
   BUs > 1000 P-codes, and same-width numeric overlapped existing BUs).
   Global 'B'+6-digit sequential: remaps ALL BUs, collision-free by
   construction, kills identifying alpha prefixes (CT/FK/etc.). */
;WITH bus AS (SELECT DISTINCT LTRIM(RTRIM(mcmcu)) m FROM PRODDTA.F0006 WHERE LTRIM(RTRIM(ISNULL(mcmcu,'')))<>''),
 r AS (SELECT m, ROW_NUMBER() OVER (ORDER BY m) rn FROM bus)
INSERT scrub.map_mcu (old_mcu, new_mcu)
SELECT m, 'B' + RIGHT('000000' + CAST(rn AS varchar(10)), 6) FROM r;
PRINT 'map_mcu rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- verification (all want 0) ---- */
PRINT '-- co: collisions / new-in-old overlap --';
SELECT (SELECT COUNT(*) FROM scrub.map_co)-(SELECT COUNT(DISTINCT new_co) FROM scrub.map_co) AS co_collide,
       (SELECT COUNT(*) FROM scrub.map_co WHERE new_co IN (SELECT old_co FROM scrub.map_co) AND old_co<>'00000') AS co_overlap;
PRINT '-- mcu: collisions / new-in-old overlap / width-change(numeric) --';
SELECT (SELECT COUNT(*) FROM scrub.map_mcu)-(SELECT COUNT(DISTINCT new_mcu) FROM scrub.map_mcu) AS mcu_collide,
       (SELECT COUNT(*) FROM scrub.map_mcu WHERE new_mcu IN (SELECT old_mcu FROM scrub.map_mcu)) AS mcu_overlap,
       SUM(CASE WHEN old_mcu NOT LIKE '%[^0-9]%' AND LEN(old_mcu)<>LEN(new_mcu) THEN 1 ELSE 0 END) AS num_width_change
FROM scrub.map_mcu;
PRINT 'bu/co maps built.';
