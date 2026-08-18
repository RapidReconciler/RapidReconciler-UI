/* ============================================================
   Demo3 (TR) — Stage 5b: APPLY business-unit + company maps.
   Target: jdesource_tr. Run AFTER maps built (05a).

   MCU written right-justified width-12; company assigned raw (JDE
   company = char(5), the 30xxx / 00000 / 99999 codes fill exactly).
   map_co's 00000->00000 and 99999->99999 are harmless no-ops in a
   single UPDATE; in the batched F4111 loop the inequality guard in the
   WHERE excludes them so the loop terminates.

   EXTENDED beyond _demo2 05b via the 2026-07-11 surface scan (every
   addition value-verified — see 05a header). NEW columns flagged NEW.
   Order/doc/amount numbers that merely pattern-match %CO (ILDOCO,
   PRDOCO, SDDOCO, PDDOCO, WADOCO, PRAVCO, ...) are deliberately EXCLUDED.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_tr;
DECLARE @b int = 300000, @r int;

/* ---- masters + small/medium (single UPDATE each) ---- */
UPDATE f SET ccco=c.new_co FROM PRODDTA.F0010 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.ccco); PRINT 'F0010';

UPDATE f SET mcmcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F0006 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.mcmcu));
UPDATE f SET mcmcus=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F0006 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.mcmcus));
UPDATE f SET mcco=c.new_co FROM PRODDTA.F0006 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.mcco); PRINT 'F0006';

UPDATE f SET gmmcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F0901 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.gmmcu));
UPDATE f SET gmco=c.new_co FROM PRODDTA.F0901 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.gmco); PRINT 'F0901';

UPDATE f SET GBCO=c.new_co FROM PRODDTA.F0902 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.GBCO); PRINT 'F0902';

UPDATE f SET mlmcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F4095 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.mlmcu));
UPDATE f SET mlco=c.new_co FROM PRODDTA.F4095 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.mlco); PRINT 'F4095';

UPDATE f SET faco=c.new_co FROM PRODDTA.F4096 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.faco); PRINT 'F4096';

UPDATE f SET wamcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F4801 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.wamcu));
UPDATE f SET wammcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F4801 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.wammcu));
UPDATE f SET waco=c.new_co FROM PRODDTA.F4801 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.waco);
UPDATE f SET WARKCO=c.new_co FROM PRODDTA.F4801 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.WARKCO); PRINT 'F4801 (+WARKCO NEW)';

UPDATE f SET cimcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F41001 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.cimcu)); PRINT 'F41001';
UPDATE f SET ummcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F41002 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.ummcu)); PRINT 'F41002';
UPDATE f SET limcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F41021 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.limcu)); PRINT 'F41021';
UPDATE f SET ibmcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F4102 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.ibmcu)); PRINT 'F4102';
UPDATE f SET comcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F4105 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.comcu)); PRINT 'F4105';
UPDATE f SET iemmcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F30026 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.iemmcu)); PRINT 'F30026 (0 rows in TR)';

/* F0101 address-book BU — NEW table (absent from _demo2 05b) */
UPDATE f SET ABMCU=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F0101 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.ABMCU)); PRINT 'F0101 ABMCU (NEW)';

/* ---- medium/big: one pass each (COALESCE = leave unmapped untouched) ---- */

/* F4311 (+PDOMCU bu NEW, +PDOKCO co NEW) */
UPDATE f SET
  pdmcu =COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.pdmcu),
  pdomcu=COALESCE(RIGHT(SPACE(12)+jo.new_mcu,12),f.pdomcu),                 /* NEW */
  pdco  =COALESCE(j1.new_co,f.pdco), pdkcoo=COALESCE(j2.new_co,f.pdkcoo),
  pdrkco=COALESCE(j3.new_co,f.pdrkco), pdokco=COALESCE(j4.new_co,f.pdokco)  /* pdokco NEW */
FROM PRODDTA.F4311 f
LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.pdmcu))
LEFT JOIN scrub.map_mcu jo ON jo.old_mcu=LTRIM(RTRIM(f.pdomcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.pdco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.pdkcoo)
LEFT JOIN scrub.map_co  j3 ON j3.old_co=RTRIM(f.pdrkco)
LEFT JOIN scrub.map_co  j4 ON j4.old_co=RTRIM(f.pdokco)
WHERE jm.old_mcu IS NOT NULL OR jo.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL
   OR j2.old_co IS NOT NULL OR j3.old_co IS NOT NULL OR j4.old_co IS NOT NULL;
PRINT 'F4311 (+PDOMCU,+PDOKCO NEW)';

/* F43121 (+PROMCU bu NEW) */
UPDATE f SET
  primcu=COALESCE(RIGHT(SPACE(12)+ja.new_mcu,12),f.primcu),
  prmcu =COALESCE(RIGHT(SPACE(12)+jb.new_mcu,12),f.prmcu),
  promcu=COALESCE(RIGHT(SPACE(12)+jc.new_mcu,12),f.promcu),                 /* NEW */
  prco  =COALESCE(j1.new_co,f.prco), prkcoo=COALESCE(j2.new_co,f.prkcoo), prkco=COALESCE(j3.new_co,f.prkco)
FROM PRODDTA.F43121 f
LEFT JOIN scrub.map_mcu ja ON ja.old_mcu=LTRIM(RTRIM(f.primcu))
LEFT JOIN scrub.map_mcu jb ON jb.old_mcu=LTRIM(RTRIM(f.prmcu))
LEFT JOIN scrub.map_mcu jc ON jc.old_mcu=LTRIM(RTRIM(f.promcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.prco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.prkcoo)
LEFT JOIN scrub.map_co  j3 ON j3.old_co=RTRIM(f.prkco)
WHERE ja.old_mcu IS NOT NULL OR jb.old_mcu IS NOT NULL OR jc.old_mcu IS NOT NULL
   OR j1.old_co IS NOT NULL OR j2.old_co IS NOT NULL OR j3.old_co IS NOT NULL;
PRINT 'F43121 (+PROMCU NEW)';

/* F4211 (+SDEMCU bu NEW, +SDCMCO/SDKCO co NEW) */
UPDATE f SET
  sdmcu =COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.sdmcu),
  sdemcu=COALESCE(RIGHT(SPACE(12)+je.new_mcu,12),f.sdemcu),                 /* NEW */
  sdco  =COALESCE(j1.new_co,f.sdco), sdkcoo=COALESCE(j2.new_co,f.sdkcoo),
  sdokco=COALESCE(j3.new_co,f.sdokco), sdrkco=COALESCE(j4.new_co,f.sdrkco), sdokc=COALESCE(j5.new_co,f.sdokc),
  sdcmco=COALESCE(j6.new_co,f.sdcmco), sdkco=COALESCE(j7.new_co,f.sdkco)    /* NEW */
FROM PRODDTA.F4211 f
LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.sdmcu))
LEFT JOIN scrub.map_mcu je ON je.old_mcu=LTRIM(RTRIM(f.sdemcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.sdco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.sdkcoo)
LEFT JOIN scrub.map_co  j3 ON j3.old_co=RTRIM(f.sdokco)
LEFT JOIN scrub.map_co  j4 ON j4.old_co=RTRIM(f.sdrkco)
LEFT JOIN scrub.map_co  j5 ON j5.old_co=RTRIM(f.sdokc)
LEFT JOIN scrub.map_co  j6 ON j6.old_co=RTRIM(f.sdcmco)
LEFT JOIN scrub.map_co  j7 ON j7.old_co=RTRIM(f.sdkco)
WHERE jm.old_mcu IS NOT NULL OR je.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL
   OR j2.old_co IS NOT NULL OR j3.old_co IS NOT NULL OR j4.old_co IS NOT NULL
   OR j5.old_co IS NOT NULL OR j6.old_co IS NOT NULL OR j7.old_co IS NOT NULL;
PRINT 'F4211 (+SDEMCU,+SDCMCO,+SDKCO NEW)';

/* F0911 (1.6M, single pass; +GLHMCU bu NEW, +GLOKCO/GLPKCO co NEW) */
UPDATE f SET
  glmcu =COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.glmcu),
  glhmcu=COALESCE(RIGHT(SPACE(12)+jh.new_mcu,12),f.glhmcu),                 /* NEW */
  glco  =COALESCE(j1.new_co,f.glco), glkco=COALESCE(j2.new_co,f.glkco),
  glokco=COALESCE(j3.new_co,f.glokco), glpkco=COALESCE(j4.new_co,f.glpkco)  /* NEW */
FROM PRODDTA.F0911 f
LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.glmcu))
LEFT JOIN scrub.map_mcu jh ON jh.old_mcu=LTRIM(RTRIM(f.glhmcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.glco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.glkco)
LEFT JOIN scrub.map_co  j3 ON j3.old_co=RTRIM(f.glokco)
LEFT JOIN scrub.map_co  j4 ON j4.old_co=RTRIM(f.glpkco)
WHERE jm.old_mcu IS NOT NULL OR jh.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL
   OR j2.old_co IS NOT NULL OR j3.old_co IS NOT NULL OR j4.old_co IS NOT NULL;
PRINT 'F0911 (+GLHMCU,+GLOKCO,+GLPKCO NEW)';

/* F4111 (3M, BATCHED; +ILMMCU bu NEW). Inequality guards in the WHERE
   exclude already-correct + structural no-op rows so the loop drains. */
WHILE 1=1 BEGIN
  UPDATE TOP (@b) f SET
    ilmcu  =COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.ilmcu),
    ilmmcu =COALESCE(RIGHT(SPACE(12)+jn.new_mcu,12),f.ilmmcu),              /* NEW */
    ilkco  =COALESCE(j1.new_co,f.ilkco), ilkcoo=COALESCE(j2.new_co,f.ilkcoo)
  FROM PRODDTA.F4111 f
  LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.ilmcu))
  LEFT JOIN scrub.map_mcu jn ON jn.old_mcu=LTRIM(RTRIM(f.ilmmcu))
  LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.ilkco)
  LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.ilkcoo)
  WHERE (jm.old_mcu IS NOT NULL AND f.ilmcu  <> RIGHT(SPACE(12)+jm.new_mcu,12))
     OR (jn.old_mcu IS NOT NULL AND f.ilmmcu <> RIGHT(SPACE(12)+jn.new_mcu,12))
     OR (j1.old_co  IS NOT NULL AND f.ilkco  <> j1.new_co)
     OR (j2.old_co  IS NOT NULL AND f.ilkcoo <> j2.new_co);
  SET @r=@@ROWCOUNT; IF @r=0 BREAK; END
PRINT 'F4111 (+ILMMCU NEW) done';
PRINT 'STAGE5B_COMPLETE';
