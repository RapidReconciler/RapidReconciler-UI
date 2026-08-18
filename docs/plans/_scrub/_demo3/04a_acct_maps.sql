/* ============================================================
   Demo3 (TR) — Stage 4a: BUILD + VERIFY account obj/sub maps.
   Touches NO data (scratch maps only). Object remap: class-preserving
   (leading digit + width kept), monotonic in group, spread across the
   in-class band; the AAI range 140000-149999 is PROTECTED (RR depends
   on it). Subs: coded remap. AID (short account) UNCHANGED = RR's join
   key. EXTENDED beyond _demo2: TR carries objects/subs in F4111 (3M)
   and F4311 too. Target: jdesource_tr.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;

/* ---- object map (source UNION includes F4111 + F4311) ---- */
IF OBJECT_ID('scrub.map_obj') IS NOT NULL DROP TABLE scrub.map_obj;
CREATE TABLE scrub.map_obj (old_obj varchar(12) PRIMARY KEY, new_obj varchar(12));
;WITH objs AS (
  SELECT DISTINCT RTRIM(GMOBJ) o FROM PRODDTA.F0901  WHERE RTRIM(ISNULL(GMOBJ,''))<>''
  UNION SELECT DISTINCT RTRIM(MLOBJ) FROM PRODDTA.F4095  WHERE RTRIM(ISNULL(MLOBJ,''))<>''
  UNION SELECT DISTINCT RTRIM(GLOBJ) FROM PRODDTA.F0911  WHERE RTRIM(ISNULL(GLOBJ,''))<>''
  UNION SELECT DISTINCT RTRIM(PROBJ) FROM PRODDTA.F43121 WHERE RTRIM(ISNULL(PROBJ,''))<>''
  UNION SELECT DISTINCT RTRIM(PDOBJ) FROM PRODDTA.F4311  WHERE RTRIM(ISNULL(PDOBJ,''))<>''
  UNION SELECT DISTINCT RTRIM(ILOBJ) FROM PRODDTA.F4111  WHERE RTRIM(ISNULL(ILOBJ,''))<>''
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
SELECT o, RIGHT(REPLICATE('0', w) + CAST( lb + rn * ((ub - lb)/(k+1)) AS varchar(12) ), w) FROM ranked;  /* zero-pad to old width: preserves leading-zero objects (e.g. 0100 -> 0010), fixes class/width drift */
PRINT 'map_obj rows: ' + CAST(@@ROWCOUNT AS varchar(12));

PRINT '-- obj checks (want all 0 except unchanged may be >0 only if a band is tiny) --';
SELECT
  (SELECT COUNT(*) FROM scrub.map_obj) - (SELECT COUNT(DISTINCT new_obj) FROM scrub.map_obj) AS collisions,
  SUM(CASE WHEN LEFT(old_obj,1) <> LEFT(new_obj,1) THEN 1 ELSE 0 END) AS class_changed,
  SUM(CASE WHEN LEN(RTRIM(old_obj)) <> LEN(RTRIM(new_obj)) THEN 1 ELSE 0 END) AS width_changed,
  SUM(CASE WHEN CAST(old_obj AS bigint) BETWEEN 140000 AND 149999
            AND CAST(new_obj AS bigint) NOT BETWEEN 140000 AND 149999 THEN 1 ELSE 0 END) AS range_escape,
  SUM(CASE WHEN old_obj = new_obj THEN 1 ELSE 0 END) AS unchanged
FROM scrub.map_obj;

/* ---- subsidiary map (source UNION includes F4111 + F4311) ---- */
IF OBJECT_ID('scrub.map_sub') IS NOT NULL DROP TABLE scrub.map_sub;
CREATE TABLE scrub.map_sub (old_sub varchar(16) PRIMARY KEY, new_sub varchar(16));
;WITH subs AS (
  SELECT DISTINCT LTRIM(RTRIM(GMSUB)) s FROM PRODDTA.F0901  WHERE LTRIM(RTRIM(ISNULL(GMSUB,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(MLSUB)) FROM PRODDTA.F4095  WHERE LTRIM(RTRIM(ISNULL(MLSUB,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(GLSUB)) FROM PRODDTA.F0911  WHERE LTRIM(RTRIM(ISNULL(GLSUB,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(PRSUB)) FROM PRODDTA.F43121 WHERE LTRIM(RTRIM(ISNULL(PRSUB,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(PDSUB)) FROM PRODDTA.F4311  WHERE LTRIM(RTRIM(ISNULL(PDSUB,'')))<>''
  UNION SELECT DISTINCT LTRIM(RTRIM(ILSUB)) FROM PRODDTA.F4111  WHERE LTRIM(RTRIM(ISNULL(ILSUB,'')))<>''
),
r AS (SELECT s, ROW_NUMBER() OVER (ORDER BY s) AS rn FROM subs)
INSERT scrub.map_sub (old_sub, new_sub) SELECT s, 'SB' + RIGHT('00000'+CAST(rn AS varchar(10)),5) FROM r;
PRINT 'map_sub rows: ' + CAST(@@ROWCOUNT AS varchar(12));
PRINT 'maps built.';
