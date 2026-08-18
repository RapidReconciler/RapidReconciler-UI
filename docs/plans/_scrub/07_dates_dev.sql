/* ============================================================
   Stage 6 (DEV ONLY): +9 years to real JDE dates.
   JDE Julian CYYDDD: +9 years = +9000 (data 2014-2016 -> 2023-2025, no
   century roll). Fiscal years +9. SINGLE atomic UPDATEs (one pass each;
   atomic => safe to retry, no partial). Run ONCE. Skips zero/blank dates
   and RR-added cols (InsertDate/ChangeDate/perioddate).
   *UPMJ (update-Julian): MUST shift on tables whose SSIS Copy window filters
   on it, or the post-shift load window excludes every row (F4211 SDUPMJ >=
   DateF4211, F4311 PDUPMJ >= DateF4311). Bug fixed 2026-07-03: sdupmj/pdupmj
   were skipped -> F4211/F4311 pulled 0 rows into staging after sanitization.
   NOT for NA/TR.
   ============================================================ */
SET NOCOUNT ON;
USE jdesource_demo1;   -- renamed from jdesource_dev; the +9y set is the Demo1 source

/* fiscal patterns + company constants (small) */
UPDATE PRODDTA.F0008 SET
  cddfyj=CASE WHEN cddfyj>0 THEN cddfyj+9000 ELSE cddfyj END,
  cdd01j=CASE WHEN cdd01j>0 THEN cdd01j+9000 ELSE cdd01j END,
  cdd02j=CASE WHEN cdd02j>0 THEN cdd02j+9000 ELSE cdd02j END,
  cdd03j=CASE WHEN cdd03j>0 THEN cdd03j+9000 ELSE cdd03j END,
  cdd04j=CASE WHEN cdd04j>0 THEN cdd04j+9000 ELSE cdd04j END,
  cdd05j=CASE WHEN cdd05j>0 THEN cdd05j+9000 ELSE cdd05j END,
  cdd06j=CASE WHEN cdd06j>0 THEN cdd06j+9000 ELSE cdd06j END,
  cdd07j=CASE WHEN cdd07j>0 THEN cdd07j+9000 ELSE cdd07j END,
  cdd08j=CASE WHEN cdd08j>0 THEN cdd08j+9000 ELSE cdd08j END,
  cdd09j=CASE WHEN cdd09j>0 THEN cdd09j+9000 ELSE cdd09j END,
  cdd10j=CASE WHEN cdd10j>0 THEN cdd10j+9000 ELSE cdd10j END,
  cdd11j=CASE WHEN cdd11j>0 THEN cdd11j+9000 ELSE cdd11j END,
  cdd12j=CASE WHEN cdd12j>0 THEN cdd12j+9000 ELSE cdd12j END,
  cdd13j=CASE WHEN cdd13j>0 THEN cdd13j+9000 ELSE cdd13j END,
  cdd14j=CASE WHEN cdd14j>0 THEN cdd14j+9000 ELSE cdd14j END,
  cdfy=cdfy+9;
PRINT 'F0008';
UPDATE PRODDTA.F0010 SET ccdfyj=CASE WHEN ccdfyj>0 THEN ccdfyj+9000 ELSE ccdfyj END; PRINT 'F0010';
UPDATE PRODDTA.F0902 SET gbfy=gbfy+9; PRINT 'F0902 gbfy';
UPDATE PRODDTA.F0011 SET icdicj=icdicj+9000 WHERE icdicj>0; PRINT 'F0011';
UPDATE PRODDTA.F4311 SET pdtrdj=CASE WHEN pdtrdj>0 THEN pdtrdj+9000 ELSE pdtrdj END,
                        pddgl =CASE WHEN pddgl >0 THEN pddgl +9000 ELSE pddgl  END,
                        pdupmj=CASE WHEN pdupmj>0 THEN pdupmj+9000 ELSE pdupmj END  -- load window filters on PDUPMJ
  WHERE pdtrdj>0 OR pddgl>0 OR pdupmj>0; PRINT 'F4311';
UPDATE PRODDTA.F43121 SET prtrdj=CASE WHEN prtrdj>0 THEN prtrdj+9000 ELSE prtrdj END,
                         prrcdj=CASE WHEN prrcdj>0 THEN prrcdj+9000 ELSE prrcdj END,
                         prdrqj=CASE WHEN prdrqj>0 THEN prdrqj+9000 ELSE prdrqj END,
                         prdgl =CASE WHEN prdgl >0 THEN prdgl +9000 ELSE prdgl  END
  WHERE prtrdj>0 OR prrcdj>0 OR prdrqj>0 OR prdgl>0; PRINT 'F43121';
UPDATE PRODDTA.F4801 SET WADRQJ=WADRQJ+9000 WHERE WADRQJ>0; PRINT 'F4801';

/* big tables — SINGLE pass each */
UPDATE PRODDTA.F3106 SET sddgj =CASE WHEN sddgj >0 THEN sddgj +9000 ELSE sddgj  END,
                        sddicj=CASE WHEN sddicj>0 THEN sddicj+9000 ELSE sddicj END
  WHERE sddgj>0 OR sddicj>0; PRINT 'F3106';
UPDATE PRODDTA.F4211 SET sdtrdj=CASE WHEN sdtrdj>0 THEN sdtrdj+9000 ELSE sdtrdj END,
                        sdaddj=CASE WHEN sdaddj>0 THEN sdaddj+9000 ELSE sdaddj END,
                        sddgl =CASE WHEN sddgl >0 THEN sddgl +9000 ELSE sddgl  END,
                        sdupmj=CASE WHEN sdupmj>0 THEN sdupmj+9000 ELSE sdupmj END  -- load window filters on SDUPMJ
  WHERE sdtrdj>0 OR sdaddj>0 OR sddgl>0 OR sdupmj>0; PRINT 'F4211';
UPDATE PRODDTA.F0911 SET gldgj =CASE WHEN gldgj >0 THEN gldgj +9000 ELSE gldgj  END,
                        gldicj=CASE WHEN gldicj>0 THEN gldicj+9000 ELSE gldicj END
  WHERE gldgj>0 OR gldicj>0; PRINT 'F0911';
UPDATE PRODDTA.F4111 SET ildgl =CASE WHEN ildgl >0 THEN ildgl +9000 ELSE ildgl  END,
                        ilcrdj=CASE WHEN ilcrdj>0 THEN ilcrdj+9000 ELSE ilcrdj END
  WHERE ildgl>0 OR ilcrdj>0; PRINT 'F4111';
PRINT 'STAGE6_DATES_COMPLETE';
