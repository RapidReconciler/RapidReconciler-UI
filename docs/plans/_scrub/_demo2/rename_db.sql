/* Demo2 physical DB rename — run as rruser (sysadmin) in master.
   SINGLE_USER WITH ROLLBACK IMMEDIATE evicts live connections (the NA Services
   agent) — expected. Guarded so a partial/re-run is safe. STOP the valc service
   + any NA Services jar (port 45585) FIRST so nothing respawns mid-rename. */
SET NOCOUNT ON;
USE master;

IF DB_ID('jdesource_na') IS NOT NULL AND DB_ID('jdesource_demo2') IS NULL
BEGIN
  ALTER DATABASE [jdesource_na] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  ALTER DATABASE [jdesource_na] MODIFY NAME = [jdesource_demo2];
  ALTER DATABASE [jdesource_demo2] SET MULTI_USER;
  PRINT 'renamed jdesource_na -> jdesource_demo2';
END ELSE PRINT 'jdesource rename skipped (source gone or target exists)';

IF DB_ID('RapidReconciler_NA') IS NOT NULL AND DB_ID('RapidReconciler_Demo2') IS NULL
BEGIN
  ALTER DATABASE [RapidReconciler_NA] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
  ALTER DATABASE [RapidReconciler_NA] MODIFY NAME = [RapidReconciler_Demo2];
  ALTER DATABASE [RapidReconciler_Demo2] SET MULTI_USER;
  PRINT 'renamed RapidReconciler_NA -> RapidReconciler_Demo2';
END ELSE PRINT 'RR DB rename skipped (source gone or target exists)';
