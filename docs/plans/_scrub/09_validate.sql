SET NOCOUNT ON; USE jdesource_dev;
PRINT '== row counts (expect unchanged) ==';
SELECT t.name + ' = ' + CAST(SUM(p.rows) AS varchar(20))
FROM sys.tables t JOIN sys.partitions p ON p.object_id=t.object_id AND p.index_id IN (0,1)
WHERE t.name IN ('F4111','F0911','F4211','F43121','F0901','F0006','F0010','F0101','F4101','F30026','F4105')
GROUP BY t.name ORDER BY t.name;
PRINT '== leftover OLD codes across big tables (ALL want 0) ==';
SELECT
 (SELECT COUNT(*) FROM PRODDTA.F0911 f WHERE EXISTS(SELECT 1 FROM scrub.map_obj m WHERE m.old_obj=RTRIM(f.globj))) AS f0911_old_obj,
 (SELECT COUNT(*) FROM PRODDTA.F0911 f WHERE EXISTS(SELECT 1 FROM scrub.map_sub m WHERE m.old_sub=LTRIM(RTRIM(f.glsub)))) AS f0911_old_sub,
 (SELECT COUNT(*) FROM PRODDTA.F0911 f WHERE EXISTS(SELECT 1 FROM scrub.map_mcu m WHERE m.old_mcu=LTRIM(RTRIM(f.glmcu)))) AS f0911_old_mcu,
 (SELECT COUNT(*) FROM PRODDTA.F0911 f WHERE EXISTS(SELECT 1 FROM scrub.map_co  m WHERE m.old_co=RTRIM(f.glco)  AND m.old_co<>m.new_co)) AS f0911_old_co,
 (SELECT COUNT(*) FROM PRODDTA.F4111 f WHERE EXISTS(SELECT 1 FROM scrub.map_mcu m WHERE m.old_mcu=LTRIM(RTRIM(f.ilmcu)))) AS f4111_old_mcu,
 (SELECT COUNT(*) FROM PRODDTA.F4211 f WHERE EXISTS(SELECT 1 FROM scrub.map_mcu m WHERE m.old_mcu=LTRIM(RTRIM(f.sdmcu)))) AS f4211_old_mcu;
PRINT '== themed samples (should read industrial-fake, no Carling/real names) ==';
SELECT TOP 4 '[' + RTRIM(abalph) + ']' AS ab FROM PRODDTA.F0101 WHERE RTRIM(abalph)<>'' ORDER BY aban8;
SELECT '[' + RTRIM(ccname) + ']' AS co_name FROM PRODDTA.F0010 ORDER BY ccco;
SELECT TOP 4 '[' + RTRIM(mcdl01) + ']' AS bu_desc FROM PRODDTA.F0006;
SELECT TOP 4 '[' + RTRIM(gmdl01) + ']' AS acct_desc FROM PRODDTA.F0901 ORDER BY gmobj;
SELECT TOP 4 '[' + RTRIM(imdsc1) + '] litm[' + RTRIM(imlitm) + '] aitm[' + RTRIM(imaitm) + ']' AS item FROM PRODDTA.F4101 ORDER BY imitm;
PRINT '== ani sample (newBU.newOBJ.newSUB) ==';
SELECT TOP 3 '[' + RTRIM(glani) + ']' AS glani FROM PRODDTA.F0911 WHERE RTRIM(glani)<>'';
PRINT '== company codes + obj/sub remapped ==';
SELECT '[' + RTRIM(ccco) + ']' AS co FROM PRODDTA.F0010 ORDER BY ccco;
SELECT TOP 6 '[' + RTRIM(gmobj) + '].[' + RTRIM(gmsub) + ']' AS acct FROM PRODDTA.F0901 ORDER BY gmobj;
PRINT '== date window (expect ~2023-2025 Julian 12xxxx; gbfy 23/24/25) ==';
SELECT MIN(gldgj) AS gl_min, MAX(gldgj) AS gl_max FROM PRODDTA.F0911 WHERE gldgj>0;
SELECT MIN(ildgl) AS il_min, MAX(ildgl) AS il_max FROM PRODDTA.F4111 WHERE ildgl>0;
SELECT DISTINCT gbfy FROM PRODDTA.F0902 ORDER BY gbfy;
