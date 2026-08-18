/* ============================================================
   Demo2 (NA->Demo2) — COMPLETE SSIS-environment + reload-job rename.
   Fixes the Demo1 gap: renaming the env alone breaks (a) the project's
   by-NAME environment_reference and (b) the reload job step-1 command,
   which HARD-CODES @env = the environment name. The runbook §A.5 only
   covered step-2's database_name; step-1 @env + the reference were the
   "env updates missed in Demo1".

   *** RUN AS A WINDOWS PRINCIPAL ***  catalog write procs reject SQL auth
   (Msg 27123). Two proven ways:
     (a) sqlcmd -E -d SSISDB -i env_ops.sql   (if your Windows login is
         sysadmin + ssis_admin), or
     (b) wrap as an sa-owned SQL Agent CmdExec job calling the above
         (the agent runs as NT SERVICE\SQLSERVERAGENT — accepted by the
         catalog), mirroring _collation_work/set_env_demo1.sql.
   The msdb job edits (§4) also run fine under that same principal.

   Idempotent + guarded; safe to re-run. Change the 9 :setvar lines for TR.
   ============================================================ */
:setvar FOLDER   "RapidReconciler"
:setvar PROJECT  "RapidReconciler-SSIS"
:setvar OLDENV   "RapidReconciler_NA"
:setvar NEWENV   "RapidReconciler_Demo2"
:setvar JDECAT   "jdesource_demo2"
:setvar RRCAT    "RapidReconciler_Demo2"
:setvar AASTART  "2015-01-01"
:setvar OLDJOB   "RapidReconciler_NA"
:setvar NEWJOB   "RapidReconciler_Demo2"

SET NOCOUNT ON;
USE SSISDB;

/* --- 1. rename the environment in place (preserves all 20 vars; no orphan) --- */
IF EXISTS (SELECT 1 FROM catalog.environments e JOIN catalog.folders f ON f.folder_id=e.folder_id
           WHERE f.name=N'$(FOLDER)' AND e.name=N'$(OLDENV)')
   AND NOT EXISTS (SELECT 1 FROM catalog.environments e JOIN catalog.folders f ON f.folder_id=e.folder_id
                   WHERE f.name=N'$(FOLDER)' AND e.name=N'$(NEWENV)')
BEGIN
  EXEC catalog.rename_environment @folder_name=N'$(FOLDER)',
       @environment_name=N'$(OLDENV)', @new_environment_name=N'$(NEWENV)';
  PRINT '1. renamed env $(OLDENV) -> $(NEWENV)';
END
ELSE PRINT '1. env rename skipped (old absent or new already present)';

/* --- 2. repoint the two catalog names + aaStartDateGr (all others DB-agnostic) --- */
EXEC catalog.set_environment_variable_value @folder_name=N'$(FOLDER)', @environment_name=N'$(NEWENV)',
     @variable_name=N'JdeInitialCatalog', @value=N'$(JDECAT)';
EXEC catalog.set_environment_variable_value @folder_name=N'$(FOLDER)', @environment_name=N'$(NEWENV)',
     @variable_name=N'RrInitialCatalog',  @value=N'$(RRCAT)';
EXEC catalog.set_environment_variable_value @folder_name=N'$(FOLDER)', @environment_name=N'$(NEWENV)',
     @variable_name=N'aaStartDateGr',      @value=N'$(AASTART)';
PRINT '2. catalog vars set (Jde=$(JDECAT), Rr=$(RRCAT), aaStartDateGr=$(AASTART))';

/* --- 3. references are BY NAME; the rename orphaned the old one. Delete stale, create fresh. --- */
DECLARE @oldref bigint = (
  SELECT r.reference_id FROM catalog.environment_references r
  JOIN catalog.projects p ON p.project_id=r.project_id
  JOIN catalog.folders f ON f.folder_id=p.folder_id
  WHERE f.name=N'$(FOLDER)' AND p.name=N'$(PROJECT)' AND r.environment_name=N'$(OLDENV)');
IF @oldref IS NOT NULL BEGIN
  EXEC catalog.delete_environment_reference @reference_id=@oldref;
  PRINT '3a. deleted stale reference -> $(OLDENV)';
END
IF NOT EXISTS (SELECT 1 FROM catalog.environment_references r
               JOIN catalog.projects p ON p.project_id=r.project_id
               JOIN catalog.folders f ON f.folder_id=p.folder_id
               WHERE f.name=N'$(FOLDER)' AND p.name=N'$(PROJECT)' AND r.environment_name=N'$(NEWENV)')
BEGIN
  DECLARE @newref bigint;
  EXEC catalog.create_environment_reference @folder_name=N'$(FOLDER)', @project_name=N'$(PROJECT)',
       @environment_name=N'$(NEWENV)', @reference_type='R', @environment_folder_name=NULL,
       @reference_id=@newref OUTPUT;
  PRINT '3b. created reference -> $(NEWENV) (ref_id=' + CAST(@newref AS varchar(12)) + ')';
END
ELSE PRINT '3b. reference -> $(NEWENV) already present';

/* --- 4. reload job: repoint step-1 @env (embeds the env name), step-2 db, then rename the job --- */
IF EXISTS (SELECT 1 FROM msdb.dbo.sysjobs WHERE name=N'$(OLDJOB)')
BEGIN
  DECLARE @cmd nvarchar(max) = (SELECT s.command FROM msdb.dbo.sysjobs j
      JOIN msdb.dbo.sysjobsteps s ON s.job_id=j.job_id WHERE j.name=N'$(OLDJOB)' AND s.step_id=1);
  /* step-1 references only the env as '$(OLDENV)'; folder/project/package are distinct strings */
  SET @cmd = REPLACE(@cmd, N'$(OLDENV)', N'$(NEWENV)');
  EXEC msdb.dbo.sp_update_jobstep @job_name=N'$(OLDJOB)', @step_id=1, @command=@cmd;
  PRINT '4a. step-1 @env repointed -> $(NEWENV)';
  EXEC msdb.dbo.sp_update_jobstep @job_name=N'$(OLDJOB)', @step_id=2, @database_name=N'$(RRCAT)';
  PRINT '4b. step-2 database_name -> $(RRCAT)';
  EXEC msdb.dbo.sp_update_job @job_name=N'$(OLDJOB)', @new_name=N'$(NEWJOB)';
  PRINT '4c. job renamed $(OLDJOB) -> $(NEWJOB)';
END
ELSE PRINT '4. reload job $(OLDJOB) not found (skip)';

PRINT 'ENV_OPS_COMPLETE';
