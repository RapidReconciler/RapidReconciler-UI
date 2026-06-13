# SSIS deployment-model reconsideration — back to the SSISDB catalog?

**Status:** **DECIDED 2026-06-13 — revert to the SSISDB catalog.** The deciding
fact: **the vast majority of existing customers already run the SSIS catalog.**
That (a) proves CLR + catalog are acceptable across this customer base (the only
thing the package model bought us), and (b) makes catalog the choice that
**unifies old + new installs on one model** — one debugging story, one runbook,
one mental model for a junior, instead of splitting the fleet (legacy=catalog,
net-new=msdb). Reverses the 2026-06-12 PACKAGE decision in
[`ssis-phase1-target-spec.md`](ssis-phase1-target-spec.md) §1. **Execution
pending owner go on sequencing (§9).** No code moved yet.
**Trigger:** the msdb package store has no first-class GUI in modern SSMS
("Class not registered" on the legacy Integration Services node) and only
pass/fail debugging — a poor fit for the exit-strategy goal (a junior diagnoses
a failed load).

---

## 1. The decision in one line

We traded **debugging + tooling + a clean T-SQL deploy** for **one install-time
concern** (CLR-enable + catalog creation on a locked-down box). msdb did **not**
lower the deploy-privilege bar — both models need an SSIS-admin role. So the
question reduces to a single fact:

> **Will the target customers' SQL Servers allow `clr enabled = 1`?**
> - **Broadly yes →** go back to the catalog (recommended). The debugging /
>   observability win is large and exit-strategy-critical, the deploy is pure
>   T-SQL, and most of the hard work carries over.
> - **Some hard-block CLR by policy →** keep the catalog as default with an
>   msdb/file fallback for those few, **or** stay on msdb and build in-package
>   SSIS logging to a table to recover queryable (not GUI) debugging.

Everything below is the build-ready detail for the "go back to catalog" path.

---

## 2. Why the catalog wins (and where it costs)

| Axis | msdb package store (current) | SSISDB catalog (proposed) |
|---|---|---|
| **Debugging** | SQL Agent job history + raw dtexec text; pass/fail | `catalog.executions` + SSMS "All Executions" reports: failed task, exact message, per-data-flow row counts + timings |
| **GUI in modern SSMS** | None (legacy IS node broken — "Class not registered") | First-class **Integration Services Catalogs** node + standard reports |
| **Deploy transport** | `dtutil.exe /COPY SQL` (external exe, GUI rot) | `catalog.deploy_project` — **pure T-SQL** over the same sqlcmd/agent channel |
| **Per-run telemetry** | none | `execution_id` + messages + data statistics per run |
| **Deploy privilege** | `db_ssisadmin`/sysadmin | `ssis_admin`/sysadmin — **same bar** |
| **Secrets** | plaintext in `[dbo].[SSIS Configurations]` (RR DB) | encrypted in SSISDB (catalog master key) |
| **Install setup** | nothing (no CLR, no extra DB) | **CLR-enable + create catalog (SSISDB + master key)** — the one real cost |
| **Master key** | n/a | **must be backed up** — restore SSISDB without it and sensitive env values are lost (operational gotcha for a junior) |

The catalog's only real cost is the one-time setup. And **catalog creation can
be a documented one-time human step** (SSMS → Integration Services Catalogs →
Create Catalog wizard — checkbox "Enable CLR integration" + a master-key
password) since a person is doing the install anyway. Everything *after* that
(deploy, environments, runs) is T-SQL automation. That reframing shrinks the
automation burden that drove the original package decision.

---

## 3. What carries over vs. what changes

**Carries over untouched (the expensive work is safe):**
- The package's **internal redesign** — one consolidated package, bootstrap
  mode, single `aaStartDateGr` date lever, parallel-capable load,
  dataflow-normalization (FASTLOAD/TABLOCK/bounded commit/AutoAdjustBufferSize),
  dead-code removal. All deployment-model-agnostic.
- The **decimal mine** — `SsisConfigService.mineDecimals` (VALC sqlcmd →
  `F9210.FRCDEC` → freeze on `client_databases`, V45 columns, drift-guard). Only
  the *emit target* changes (config row → environment variable).
- `SsisConfigService`'s **value-resolution logic** — connection strings, provider
  selection, tunables, module flags, run-mode booleans, `tableQualifier`
  trailing-dot. The resolution is identical; only what it writes changes.
- `ProtectionLevel = DontSaveSensitive` — stays. Secrets come from the
  environment instead of the config table; the artifact stays secret-free.
- The `file_versions` catalog + the `ssis-v*` release pipeline. (The artifact
  becomes the `.ispac` instead of the bare `.dtsx`; see §5.)

**Changes (transport + setup, not logic):**
- VS: convert **package → project** deployment model; re-expose per-customer
  values as **project parameters** (they were parameters before the s24
  package conversion). Build a `.ispac` instead of a bare `.dtsx`.
- `SsisDeployService`: `dtutil`→msdb is replaced by `catalog.deploy_project` +
  environment provisioning (all T-SQL). `copyPackageToMsdb` +
  `checkMsdbWriteRights` + the `dtutil-path` config retire.
- `SsisConfigService`: the `[dbo].[SSIS Configurations]` emit (`toUpsertSql`,
  `readLiveConfig`, the `Paths` package-path strings) is replaced by
  **catalog environment** emit (`create_environment_variable` +
  `set_object_parameter_value @value_type='R'`). Resolution stays.
- Install: add CLR-enable + create-catalog + master key + folder.
- Readiness: add a **CLR-enabled** gate + a **catalog-exists** gate.
- Install **job script** (`4 - …Job Creation Script.sql`): revert step 1 from
  the msdb `/SQL "\<jobname>"` form back to the catalog
  `/ISSERVER "\SSISDB\<folder>\<project>\<package>.dtsx" /ENVREFERENCE …` form
  (or replace the SSIS step with a `catalog.create_execution` T-SQL step — §6).
- **Retire:** the DB-repo `[dbo].[SSIS Configurations]` table creation in the
  install (the space-form rename becomes moot), `dtutil-path` in
  `application.yml`. The **V45 decimal columns stay** (the mine is unchanged).

---

## 4. Per-customer value mapping (catalog model)

Each §2a value moves from a config-table row to one of three catalog homes:

| Value | Catalog home | Notes |
|---|---|---|
| JDESource connection string (+pwd) | **environment variable** (sensitive) | bound to the CM's `ConnectionString` parameter |
| RRLocal connection string (+pwd) | **environment variable** (sensitive) | bound to the CM's `ConnectionString` parameter |
| `dbowner`, `tableQualifier` | environment variable | bound to project params |
| `RefreshDays`, `RefreshDaysRNV` | environment variable | bound to project params |
| `MaxConcurrentExecutables` | project/package parameter (literal) or env var | package-level property — confirm it's parameterizable in project model |
| `ModInv`, `ModRnv` | environment variable (bool) | derived from licensed modules |
| `DecExtCost/DecUnitCost/DecQty/DecQtyCX` | environment variable (literal int) | **mined + frozen per-DB**, emitted here instead of config rows |
| `BootstrapOnly`, `InitLoad`, `aaStartDateGr` | **execution parameter** (per-run) | set at `create_execution` time, NOT environment — they change per run (§6) |

One environment per customer (e.g. `RR_<dbname>`), one
`create_environment_reference` linking it to the deployed project. VALC
generates the environment + variables; the agent binds + runs it over T-SQL —
the original "VALC generates an SSISDB environment, the agent binds it" plan.

**Parameter binding (T-SQL):** for each param,
`catalog.set_object_parameter_value @object_type=20|30, @folder, @project,
@parameter_name, @parameter_value=<env var name>, @value_type='R'` (reference).
Literals (the run-mode defaults) use the default `@value_type`.

---

## 5. VALC / agent deploy half (catalog)

Replaces `SsisDeployService.deployPackage`'s dtutil step with:

1. **Deploy the project.** `catalog.deploy_project @folder_name, @project_name,
   @project_stream` where `@project_stream` is the `.ispac` bytes. Read the
   on-box `.ispac` via `OPENROWSET(BULK '<path>', SINGLE_BLOB)` inside the
   deploy T-SQL (a 6 MB inline varbinary won't pass through sqlcmd; BULK-read it
   on the box). Records the `client_deploys` row (unchanged shape).
2. **Provision the environment.** Idempotent: `create_folder` →
   `create_environment` → per value `create_environment_variable` (sensitive for
   the two connection strings) → `create_environment_reference` → per param
   `set_object_parameter_value @value_type='R'`. This is the catalog analog of
   `applyConfig`; `SsisConfigService.resolveRows` feeds it.
3. **Privilege pre-flight** (replaces `checkMsdbWriteRights`): confirm the deploy
   login is `ssis_admin` (SSISDB) or sysadmin — `IS_MEMBER` against SSISDB / 
   `IS_SRVROLEMEMBER('sysadmin')`. Same actionable-error pattern.

Release artifact: build + catalog the **`.ispac`** (`release-ssis.yml` attaches
the `.ispac`; `syncSsisReleases` pulls it into `file_versions`,
`component='ssis'`). The Deployment-Center version picker is unchanged.

---

## 6. Run-mode actions (Step 5) — cleaner in the catalog

Two options; **recommend (a)** for the on-demand bootstrap/full/steady buttons
because it yields an `execution_id` + full telemetry:

**(a) `catalog.create_execution` (on-demand runs).**
```
EXEC catalog.create_execution @folder, @project, @package, @reference_id, @execution_id OUTPUT;
EXEC catalog.set_execution_parameter_value @execution_id, @object_type=30, 'BootstrapOnly', <0|1>;
EXEC catalog.set_execution_parameter_value @execution_id, @object_type=30, 'InitLoad', <0|1>;
-- aaStartDateGr for FULL_LOAD; LOGGING_LEVEL via object_type=50 'LOGGING_LEVEL'
EXEC catalog.start_execution @execution_id;
```
The returned `execution_id` ties straight to `catalog.executions` + the SSMS
report — the junior clicks the run and sees exactly what happened. Set
`LOGGING_LEVEL` = Basic (1) for steady, Verbose (3) when debugging.

**(b) SQL Agent job step (scheduled steady refresh).** `/ISSERVER
"\SSISDB\<folder>\<project>\<package>.dtsx" /SERVER "$(@@SERVERNAME)"
/ENVREFERENCE <id> /Par "$ServerOption::LOGGING_LEVEL(Int16)";1 …` — revert the
install-script step 1 to this form. Step 2 (`usp6_001_run_b_to_c`) unchanged.

This is strictly better than the config-table run-mode upsert: run-mode is set
per execution, not by mutating a shared config row immediately before
`sp_start_job`.

---

## 7. Install + readiness additions

**Install (one-time, per server):**
1. `sp_configure 'clr enabled', 1; RECONFIGURE;` (sysadmin). SSISDB's CLR is
   Microsoft-signed, so `clr strict security` can stay on.
2. **Create the catalog** — documented human step via SSMS (Integration Services
   Catalogs → Create Catalog: enable CLR + set master-key password), OR automate
   via PowerShell/SMO (`Microsoft.SqlServer.Management.IntegrationServices`,
   `$is.Catalogs.Add('SSISDB', $pwd); $catalog.Create()`). **Back up the master
   key** + record the password (a real operational requirement).
3. `catalog.create_folder` for RR.

**Readiness probe (`InstallProbeService`) — add two gates:**
- **CLR enabled:** `SELECT value_in_use FROM sys.configurations WHERE name='clr enabled'`
  (warn + offer to enable if 0; hard-fail if the DBA's policy forbids it →
  that customer is the fallback case, §8).
- **Catalog exists:** `DB_ID('SSISDB') IS NOT NULL` and the deploy login is
  `ssis_admin`/sysadmin.
- Replaces the msdb-store framing in the current SSIS readiness.

---

## 8. Fallback for CLR-blocked customers

If a customer's DBA hard-blocks CLR:
- **Option A — dual path.** Catalog by default; fall back to **file-system
  package + SQL Agent `/FILE` job step** (not msdb — file system needs no
  package-store admin) for the blocked customer. Two deploy paths to maintain;
  the config still comes from the RR-DB config table for that path. Highest
  flexibility, highest maintenance.
- **Option B — readiness hard-stop.** Treat CLR as a Tier-1 install blocker:
  "RR requires CLR enabled for the Integration Services Catalog." Simplest;
  rejects the rare CLR-forbidden customer.
- **Decision:** pick after the CLR-acceptance survey (§1). If <~10% of customers
  block CLR, Option B + a sales conversation beats carrying two paths.

---

## 9. Reversal step list (if accepted)

1. **VS/SSDT (owner):** convert package → project deployment model; re-expose the
   per-customer values as project parameters; confirm `MaxConcurrentExecutables`
   is parameterizable; keep `DontSaveSensitive`; build `.ispac`.
2. **Release:** `release-ssis.yml` → attach `.ispac`; `syncSsisReleases` catalogs it.
3. **VALC `SsisConfigService`:** swap the config-table emit for environment
   emit (resolution logic stays); keep `mineDecimals` (emit decimals as env vars).
4. **VALC `SsisDeployService`:** replace `copyPackageToMsdb` with
   `deployProjectToCatalog` (`deploy_project` + environment provisioning +
   `ssis_admin` pre-flight); drop `dtutil-path`.
5. **VALC `DeploymentController`:** `ssis-build-config` → builds/refreshes the
   environment; Step-5 run endpoints → `create_execution` (§6).
6. **DB repo:** revert install-script step 1 to the `/ISSERVER` catalog form;
   drop the `[dbo].[SSIS Configurations]` table creation; keep V45 decimals.
7. **Install/readiness:** add CLR + catalog-exists gates; add the catalog-create
   install step (doc + optional PowerShell/SMO automation).
8. **Deployment-Center UI:** "Build config" → "Build environment"; surface the
   `catalog.executions` link/last-run status (the debugging payoff).
9. **Docs:** update `ssis-phase1-target-spec.md` §1/§5 (reverse the package
   decision), `ssis-management-and-jde-extraction.md`, and the install docs
   (point juniors at the Catalog node + execution reports, not the msdb store).

---

## 10a. Verification log (2026-06-13) + what's proven vs. pending

Built + **verified end-to-end on the dev catalog** (db 21 / `RapidReconciler_InstTest`):

- **Deploy model changed** from the planned "JDBC `setBytes` with resolved SQL
  creds" to a **SQL Agent T-SQL job** — because SSISDB catalog *mutations*
  (`deploy_project`, `create_environment`, `create_execution`, …) **reject SQL
  Server Authentication** (Msg 27123), and SQL 2017 (the floor) has no Entra
  auth. The job step runs under the Agent's Windows account; `rruser` only
  creates+starts the job. Full design + the service-account question:
  [`ssis-deploy-service-account.md`](ssis-deploy-service-account.md). Owner
  chose the SQL-Agent-job model.
- **Proven via the VALC endpoints + `rruser` catalog reads:**
  Build config → 18 environment variables with correct catalog types
  (`String`/`Int32`/`Boolean` per the `.ispac`) and sensitivity; Deploy →
  project in `SSISDB\RapidReconciler\RapidReconciler-SSIS` + environment
  reference + **all 18 parameters bound by reference** (`value_type='R'`);
  Bootstrap → `catalog.create_execution` (execution 130) with `BootstrapOnly=1`,
  `InitLoad=0`, `LOGGING_LEVEL=3` set as execution parameters; row present in
  `catalog.executions`.
- **Secret handling:** `CM.*.ConnectionString` is **Sensitive=0** in the
  `.ispac`, so the connection string is emitted **password-free + non-sensitive**
  and the password binds the separate **`CM.*.Password`** param (Sensitive=1) →
  satisfies SSISDB's sensitivity-match rule (Err 27221) and keeps the password
  encrypted.

**Pending (package-side, owner's VS pass — NOT the deploy code):**

- ⚠ **The `.ispac` still has the legacy SQL Server package configuration
  enabled** (filter `RRConfig` → the old `[dbo].[SSIS Configurations]` via the
  orphan `ConfigDB` CM). At run time the package logged *"Failed to load …
  configuration entries for RRConfig"* and then a connection-acquire failure —
  the leftover package configuration conflicts with catalog parameter injection.
  **Disable "Enable package configurations" + delete the `ConfigDB` CM in VS**,
  rebuild the `.ispac`, then the full load can validate cleanly.
- Until package configs are off, the **split ConnectionString+Password merge
  can't be cleanly validated** (the leftover config interferes with the
  connection string) — re-run Bootstrap/Full after the VS cleanup to confirm.
- So **`ssis-v8.0-beta.2` should be tagged from the cleaned `.ispac`**, not the
  current one.

## 10. Recommendation

If the CLR-acceptance answer is "broadly yes," **revert to the catalog.** The
debugging + observability is the single biggest lever for the exit-strategy
(a junior self-diagnosing a load), the deploy is cleaner T-SQL than dtutil, the
privilege bar is unchanged, the expensive package-internals + decimal-mine work
all survives, and catalog creation can be a one-time documented human step. The
package/msdb model solved an install concern at the cost of the thing we most
need day-two. Confirm the CLR fact, then decide.
