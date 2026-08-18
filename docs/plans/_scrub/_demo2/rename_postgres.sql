-- Demo2 VALC Postgres re-point — run: psql -U valc -d valc -h localhost -f rename_postgres.sql
-- Renames ONLY the active/licensed client_databases row (id=24). The stale duplicate
-- id=5 (port 33436, blank override) is left untouched — resolve it manually later.
-- Licensing: the 6 licensed company codes are re-pointed to their sanitized (map_co)
-- successors; the 3 excluded companies (00043/00067/00073) are dropped from the license.

\set ON_ERROR_STOP on
BEGIN;

UPDATE client_databases
   SET db_name='RapidReconciler_Demo2',
       display_name='RapidReconciler_Demo2',
       jde_override_catalog='jdesource_demo2'
 WHERE id=24;

UPDATE user_database_permissions
   SET database_name='RapidReconciler_Demo2'
 WHERE database_name='RapidReconciler_NA';

-- licensed 6 → sanitized successors
UPDATE client_licensed_companies SET company_number='80003' WHERE client_database_id=24 AND company_number='00002';
UPDATE client_licensed_companies SET company_number='80004' WHERE client_database_id=24 AND company_number='00003';
UPDATE client_licensed_companies SET company_number='80010' WHERE client_database_id=24 AND company_number='00009';
UPDATE client_licensed_companies SET company_number='80013' WHERE client_database_id=24 AND company_number='00012';
UPDATE client_licensed_companies SET company_number='80023' WHERE client_database_id=24 AND company_number='00022';
UPDATE client_licensed_companies SET company_number='80041' WHERE client_database_id=24 AND company_number='00041';

-- excluded 3 → drop from the license (owner: NA licenses only the 6)
DELETE FROM client_licensed_companies WHERE client_database_id=24 AND company_number IN ('00043','00067','00073');

-- verify: expect the 6 sanitized codes, none of the old/excluded
SELECT company_number FROM client_licensed_companies WHERE client_database_id=24 ORDER BY company_number;

COMMIT;
