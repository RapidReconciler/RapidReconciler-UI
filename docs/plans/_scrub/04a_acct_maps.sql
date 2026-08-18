/* ============================================================
   Stage 3a: BUILD + VERIFY account obj/sub maps (no data touched).
   Object remap: class-preserving (leading digit + width kept),
   monotonic within group, spread across the in-class band. The lone
   AAI object range 140000-149999 is protected (those objects stay in
   that band; F4096 range left unchanged). Subs: simple coded remap
   (not range-constrained). AID unchanged.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_dev;

/* ---- object map ---- */
IF OBJECT_ID('scrub.map_obj') IS NOT NULL DROP TABLE scrub.map_obj;
CREATE TABLE scrub.map_obj (old_obj varchar(12) PRIMARY KEY, new_obj varchar(12));

;WITH objs AS (
  SELECT DISTINCT RTRIM(gmobj) o FROM PRODDTA.F0901  WHERE RTRIM(ISNULL(gmobj,''))<>''
  UNION SELECT DISTINCT RTRIM(mlobj)  FROM PRODDTA.F4095  WHERE RTRIM(ISNULL(mlobj,''))<>''
  UNION SELECT DISTINCT RTRIM(globj)  FROM PRODDTA.F0911  WHERE RTRIM(ISNULL(globj,''))<>''
  UNION SELECT DISTINCT RTRIM(probj)  FROM PRODDTA.F43121 WHERE RTRIM(ISNULL(probj,''))<>''
),
calc AS (
  SELECT o, LEN(o) AS w, CAST(o AS bigint) AS v,
    CASE WHEN CAST(o AS bigint) BETWEEN 140000 AND 149999 THEN 'R14'
         ELSE LEFT(o,1) + '_' + CAST(LEN(o) AS varchar(2)) END AS grp
  FROM objs WHERE o NOT LIKE '%[^0-9]%'
),
bands AS (
  SELECT c.*,
    CASE WHEN grp='R14' THEN 140000
         WHEN grp='1_6' THEN 100000
         ELSE CAST(LEFT(o,1) AS bigint) * POWER(CAST(10 AS bigint), w-1) END AS lb,
    CASE WHEN grp='R14' THEN 149999
         WHEN grp='1_6' THEN 139999
         ELSE (CAST(LEFT(o,1) AS bigint)+1) * POWER(CAST(10 AS bigint), w-1) - 1 END AS ub
  FROM calc c
),
ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY grp ORDER BY v) AS rn,
            COUNT(*)      OVER (PARTITION BY grp)            AS k
  FROM bands
)
INSERT scrub.map_obj (old_obj, new_obj)
SELECT o, CAST( lb + rn * ((ub - lb)/(k+1)) AS varchar(12) ) FROM ranked;
PRINT 'map_obj rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- object map verification (all must be 0 except the count line) ---- */
PRINT '-- obj checks (collisions / class-change / width-change / range-escape; want 0) --';
SELECT
  (SELECT COUNT(*) FROM scrub.map_obj) - (SELECT COUNT(DISTINCT new_obj) FROM scrub.map_obj) AS collisions,
  SUM(CASE WHEN LEFT(old_obj,1) <> LEFT(new_obj,1) THEN 1 ELSE 0 END) AS class_changed,
  SUM(CASE WHEN LEN(RTRIM(old_obj)) <> LEN(RTRIM(new_obj)) THEN 1 ELSE 0 END) AS width_changed,
  SUM(CASE WHEN CAST(old_obj AS bigint) BETWEEN 140000 AND 149999
            AND CAST(new_obj AS bigint) NOT BETWEEN 140000 AND 149999 THEN 1 ELSE 0 END) AS range_escape,
  SUM(CASE WHEN old_obj = new_obj THEN 1 ELSE 0 END) AS unchanged
FROM scrub.map_obj;

/* ---- subsidiary map (trim-normalized; not range-constrained) ---- */
IF OBJECT_ID('scrub.map_sub') IS NOT NULL DROP TABLE scrub.map_sub;
CREATE TABLE scrub.map_sub (old_sub varchar(16) PRIMARY KEY, new_sub varchar(16));
;WITH subs AS (
  SELECT DISTINCT LTRIM(RTRIM(gmsub)) s FROM PRODDTA.F0901  WHERE LTRIM(RTRIM(ISNULL(gmsub,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(mlsub)) FROM PRODDTA.F4095  WHERE LTRIM(RTRIM(ISNULL(mlsub,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(glsub)) FROM PRODDTA.F0911  WHERE LTRIM(RTRIM(ISNULL(glsub,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(prsub)) FROM PRODDTA.F43121 WHERE LTRIM(RTRIM(ISNULL(prsub,'')))<>''
),
r AS (SELECT s, ROW_NUMBER() OVER (ORDER BY s) AS rn FROM subs)
INSERT scrub.map_sub (old_sub, new_sub) SELECT s, 'SB' + RIGHT('00'+CAST(rn AS varchar(3)),2) FROM r;
PRINT 'map_sub rows: ' + CAST(@@ROWCOUNT AS varchar(12));

/* ---- account descriptions by new object band (realistic COA) ---- */
PRINT 'maps built.';
