/* ============================================================
   Demo3 env/reload-job VERIFY — run AFTER env_ops.sql (or a VALC
   "Build environment"). Read-only; runs fine as rruser (catalog VIEWS are
   readable under SQL auth; only the write procs need a Windows principal).
   Loud PASS/FAIL checklist confirming the TR->Demo3 SSIS repoint took.
   REFENV = RapidReconciler_Demo1 (known-good) to diff var completeness.
   ============================================================ */
:setvar FOLDER   "RapidReconciler"
:setvar PROJECT  "RapidReconciler-SSIS"
:setvar OLDENV   "RapidReconciler_TR"
:setvar NEWENV   "RapidReconciler_Demo3"
:setvar JDECAT   "jdesource_demo3"
:setvar RRCAT    "RapidReconciler_Demo3"
:setvar OLDJOB   "RapidReconciler_TR"
:setvar NEWJOB   "RapidReconciler_Demo3"
:setvar REFENV   "RapidReconciler_Demo1"

SET NOCOUNT ON;
USE SSISDB;
IF OBJECT_ID('tempdb..#chk') IS NOT NULL DROP TABLE #chk;
CREATE TABLE #chk (seq int IDENTITY, chk varchar(60), detail varchar(120), status varchar(4));

DECLARE @n int;

/* 1. new env exists, old env gone */
INSERT #chk(chk,detail,status) SELECT 'env renamed',
  'new=$(NEWENV) present, old=$(OLDENV) absent',
  CASE WHEN EXISTS(SELECT 1 FROM catalog.environments e JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)')
        AND NOT EXISTS(SELECT 1 FROM catalog.environments e JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(OLDENV)')
       THEN 'PASS' ELSE 'FAIL' END;

/* 2. variable completeness vs REFENV (no var missing from new env) */
SET @n = (SELECT COUNT(*) FROM catalog.environment_variables rv
  JOIN catalog.environments re ON re.environment_id=rv.environment_id
  JOIN catalog.folders rf ON rf.folder_id=re.folder_id
  WHERE rf.name=N'$(FOLDER)' AND re.name=N'$(REFENV)'
  AND rv.name NOT IN (SELECT nv.name FROM catalog.environment_variables nv
     JOIN catalog.environments ne ON ne.environment_id=nv.environment_id
     JOIN catalog.folders nf ON nf.folder_id=ne.folder_id
     WHERE nf.name=N'$(FOLDER)' AND ne.name=N'$(NEWENV)'));
INSERT #chk(chk,detail,status) SELECT 'var completeness',
  CAST(@n AS varchar(6))+' var(s) in $(REFENV) missing from $(NEWENV)',
  CASE WHEN @n=0 THEN 'PASS' ELSE 'FAIL' END;

/* 3. catalog names repointed */
INSERT #chk(chk,detail,status) SELECT 'JdeInitialCatalog',
  ISNULL((SELECT CAST(v.value AS varchar(60)) FROM catalog.environment_variables v JOIN catalog.environments e ON e.environment_id=v.environment_id JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)' AND v.name='JdeInitialCatalog'),'(null)'),
  CASE WHEN EXISTS(SELECT 1 FROM catalog.environment_variables v JOIN catalog.environments e ON e.environment_id=v.environment_id JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)' AND v.name='JdeInitialCatalog' AND CAST(v.value AS varchar(60))='$(JDECAT)') THEN 'PASS' ELSE 'FAIL' END;
INSERT #chk(chk,detail,status) SELECT 'RrInitialCatalog',
  ISNULL((SELECT CAST(v.value AS varchar(60)) FROM catalog.environment_variables v JOIN catalog.environments e ON e.environment_id=v.environment_id JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)' AND v.name='RrInitialCatalog'),'(null)'),
  CASE WHEN EXISTS(SELECT 1 FROM catalog.environment_variables v JOIN catalog.environments e ON e.environment_id=v.environment_id JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)' AND v.name='RrInitialCatalog' AND CAST(v.value AS varchar(60))='$(RRCAT)') THEN 'PASS' ELSE 'FAIL' END;

/* 4. critical connection vars non-blank */
SET @n = (SELECT COUNT(*) FROM catalog.environment_variables v JOIN catalog.environments e ON e.environment_id=v.environment_id JOIN catalog.folders f ON f.folder_id=e.folder_id
  WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)'
  AND v.name IN ('JdeUserName','RrUserName','JdeServerName','RrServerName','dbowner')
  AND RTRIM(CAST(v.value AS varchar(80)))='');
INSERT #chk(chk,detail,status) SELECT 'conn vars non-blank',
  CAST(@n AS varchar(6))+' of {Jde/Rr User,Jde/Rr Server,dbowner} blank',
  CASE WHEN @n=0 THEN 'PASS' ELSE 'FAIL' END;

/* 5. reference by name repointed */
INSERT #chk(chk,detail,status) SELECT 'env reference',
  'project $(PROJECT) -> $(NEWENV)',
  CASE WHEN EXISTS(SELECT 1 FROM catalog.environment_references r JOIN catalog.projects p ON p.project_id=r.project_id JOIN catalog.folders f ON f.folder_id=p.folder_id WHERE f.name=N'$(FOLDER)' AND p.name=N'$(PROJECT)' AND r.environment_name=N'$(NEWENV)')
        AND NOT EXISTS(SELECT 1 FROM catalog.environment_references r JOIN catalog.projects p ON p.project_id=r.project_id JOIN catalog.folders f ON f.folder_id=p.folder_id WHERE f.name=N'$(FOLDER)' AND p.name=N'$(PROJECT)' AND r.environment_name=N'$(OLDENV)')
       THEN 'PASS' ELSE 'FAIL' END;

/* 6. reload job renamed + step-1 @env + step-2 db */
INSERT #chk(chk,detail,status) SELECT 'job renamed',
  'job $(NEWJOB) present, $(OLDJOB) absent',
  CASE WHEN EXISTS(SELECT 1 FROM msdb.dbo.sysjobs WHERE name=N'$(NEWJOB)') AND NOT EXISTS(SELECT 1 FROM msdb.dbo.sysjobs WHERE name=N'$(OLDJOB)') THEN 'PASS' ELSE 'FAIL' END;
INSERT #chk(chk,detail,status) SELECT 'step-1 @env',
  'step-1 references $(NEWENV), not $(OLDENV)',
  CASE WHEN EXISTS(SELECT 1 FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobsteps s ON s.job_id=j.job_id WHERE j.name=N'$(NEWJOB)' AND s.step_id=1 AND s.command LIKE '%$(NEWENV)%' AND s.command NOT LIKE '%$(OLDENV)%') THEN 'PASS' ELSE 'FAIL' END;
INSERT #chk(chk,detail,status) SELECT 'step-2 database',
  ISNULL((SELECT s.database_name FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobsteps s ON s.job_id=j.job_id WHERE j.name=N'$(NEWJOB)' AND s.step_id=2),'(none)'),
  CASE WHEN EXISTS(SELECT 1 FROM msdb.dbo.sysjobs j JOIN msdb.dbo.sysjobsteps s ON s.job_id=j.job_id WHERE j.name=N'$(NEWJOB)' AND s.step_id=2 AND s.database_name=N'$(RRCAT)') THEN 'PASS' ELSE 'FAIL' END;

/* 7. aaStartDateGr present */
INSERT #chk(chk,detail,status) SELECT 'aaStartDateGr',
  ISNULL((SELECT CAST(v.value AS varchar(40)) FROM catalog.environment_variables v JOIN catalog.environments e ON e.environment_id=v.environment_id JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)' AND v.name='aaStartDateGr'),'(null)'),
  CASE WHEN EXISTS(SELECT 1 FROM catalog.environment_variables v JOIN catalog.environments e ON e.environment_id=v.environment_id JOIN catalog.folders f ON f.folder_id=e.folder_id WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)' AND v.name='aaStartDateGr' AND RTRIM(CAST(v.value AS varchar(40)))<>'') THEN 'PASS' ELSE 'FAIL' END;

SELECT RIGHT('  '+CAST(seq AS varchar(2)),2)+'. '+chk AS [check], detail, status FROM #chk ORDER BY seq;
SELECT CASE WHEN EXISTS(SELECT 1 FROM #chk WHERE status='FAIL') THEN '*** ENV VERIFY: FAIL -- see rows above ***' ELSE 'ENV VERIFY: ALL PASS' END AS verdict;
DROP TABLE #chk;
