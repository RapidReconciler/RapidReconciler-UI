/* ============================================================
   Stage 3c: rebuild account-input strings from the REMAPPED components
   (run AFTER obj/sub + mcu remaps). The SSIS load carries these verbatim
   (trimmed), so stale values would leak the old obj/sub.
   - glani  = BU.OBJ[.SUB] rebuilt from glmcu/globj/glsub.
   - prani/prvani reference accounts not fully in this row's columns
     (prvani is a variance account); blank them to remove the leak.
   Single UPDATEs (one pass).
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_dev;

UPDATE PRODDTA.F0911
SET glani = LTRIM(RTRIM(glmcu)) + '.' + RTRIM(globj)
          + CASE WHEN RTRIM(ISNULL(glsub,'')) <> '' THEN '.' + RTRIM(glsub) ELSE '' END
WHERE RTRIM(ISNULL(glani,'')) <> '';
PRINT 'F0911 glani rebuilt ' + CAST(@@ROWCOUNT AS varchar(12));

UPDATE PRODDTA.F43121 SET prani = '' WHERE RTRIM(ISNULL(prani,'')) <> '';
PRINT 'F43121 prani cleared ' + CAST(@@ROWCOUNT AS varchar(12));
UPDATE PRODDTA.F43121 SET prvani = '' WHERE RTRIM(ISNULL(prvani,'')) <> '';
PRINT 'F43121 prvani cleared ' + CAST(@@ROWCOUNT AS varchar(12));
PRINT 'STAGE_ANI_COMPLETE';
