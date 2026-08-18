/* ============================================================
   Stage 4b/5b: APPLY business-unit + company maps — SINGLE set-based
   UPDATEs (one pass per table; NO batched TOP loops — those re-scan the
   big tables per batch and are catastrophically slow). MCU written
   right-justified width-12; company left-justified. map_co's 00000->00000
   is a harmless no-op in a single UPDATE. Run AFTER maps built (05a).
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_na;

/* ---- masters + small/medium ---- */
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
UPDATE f SET waco=c.new_co FROM PRODDTA.F4801 f JOIN scrub.map_co c ON c.old_co=RTRIM(f.waco); PRINT 'F4801';
UPDATE f SET cimcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F41001 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.cimcu));
UPDATE f SET ummcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F41002 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.ummcu));
UPDATE f SET limcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F41021 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.limcu));
UPDATE f SET ibmcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F4102 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.ibmcu));
PRINT 'F41001/F41002/F41021/F4102';

/* ---- medium/big: one pass each ---- */
UPDATE f SET comcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F4105 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.comcu)); PRINT 'F4105';
UPDATE f SET iemmcu=RIGHT(SPACE(12)+m.new_mcu,12) FROM PRODDTA.F30026 f JOIN scrub.map_mcu m ON m.old_mcu=LTRIM(RTRIM(f.iemmcu)); PRINT 'F30026';

UPDATE f SET
  pdmcu =COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.pdmcu),
  pdco  =COALESCE(j1.new_co,f.pdco), pdkcoo=COALESCE(j2.new_co,f.pdkcoo), pdrkco=COALESCE(j3.new_co,f.pdrkco)
FROM PRODDTA.F4311 f
LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.pdmcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.pdco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.pdkcoo)
LEFT JOIN scrub.map_co  j3 ON j3.old_co=RTRIM(f.pdrkco)
WHERE jm.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL OR j2.old_co IS NOT NULL OR j3.old_co IS NOT NULL;
PRINT 'F4311';

UPDATE f SET
  primcu=COALESCE(RIGHT(SPACE(12)+ja.new_mcu,12),f.primcu),
  prmcu =COALESCE(RIGHT(SPACE(12)+jb.new_mcu,12),f.prmcu),
  prco  =COALESCE(j1.new_co,f.prco), prkcoo=COALESCE(j2.new_co,f.prkcoo), prkco=COALESCE(j3.new_co,f.prkco)
FROM PRODDTA.F43121 f
LEFT JOIN scrub.map_mcu ja ON ja.old_mcu=LTRIM(RTRIM(f.primcu))
LEFT JOIN scrub.map_mcu jb ON jb.old_mcu=LTRIM(RTRIM(f.prmcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.prco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.prkcoo)
LEFT JOIN scrub.map_co  j3 ON j3.old_co=RTRIM(f.prkco)
WHERE ja.old_mcu IS NOT NULL OR jb.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL OR j2.old_co IS NOT NULL OR j3.old_co IS NOT NULL;
PRINT 'F43121';

UPDATE f SET
  sdmcu =COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.sdmcu),
  sdco  =COALESCE(j1.new_co,f.sdco), sdkcoo=COALESCE(j2.new_co,f.sdkcoo),
  sdokco=COALESCE(j3.new_co,f.sdokco), sdrkco=COALESCE(j4.new_co,f.sdrkco), sdokc=COALESCE(j5.new_co,f.sdokc)
FROM PRODDTA.F4211 f
LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.sdmcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.sdco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.sdkcoo)
LEFT JOIN scrub.map_co  j3 ON j3.old_co=RTRIM(f.sdokco)
LEFT JOIN scrub.map_co  j4 ON j4.old_co=RTRIM(f.sdrkco)
LEFT JOIN scrub.map_co  j5 ON j5.old_co=RTRIM(f.sdokc)
WHERE jm.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL OR j2.old_co IS NOT NULL
   OR j3.old_co IS NOT NULL OR j4.old_co IS NOT NULL OR j5.old_co IS NOT NULL;
PRINT 'F4211';

UPDATE f SET
  glmcu=COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.glmcu),
  glco =COALESCE(j1.new_co,f.glco), glkco=COALESCE(j2.new_co,f.glkco)
FROM PRODDTA.F0911 f
LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.glmcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.glco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.glkco)
WHERE jm.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL OR j2.old_co IS NOT NULL;
PRINT 'F0911';

UPDATE f SET
  ilmcu=COALESCE(RIGHT(SPACE(12)+jm.new_mcu,12),f.ilmcu),
  ilkco=COALESCE(j1.new_co,f.ilkco), ilkcoo=COALESCE(j2.new_co,f.ilkcoo)
FROM PRODDTA.F4111 f
LEFT JOIN scrub.map_mcu jm ON jm.old_mcu=LTRIM(RTRIM(f.ilmcu))
LEFT JOIN scrub.map_co  j1 ON j1.old_co=RTRIM(f.ilkco)
LEFT JOIN scrub.map_co  j2 ON j2.old_co=RTRIM(f.ilkcoo)
WHERE jm.old_mcu IS NOT NULL OR j1.old_co IS NOT NULL OR j2.old_co IS NOT NULL;
PRINT 'F4111';
PRINT 'STAGE4B5B_COMPLETE';
