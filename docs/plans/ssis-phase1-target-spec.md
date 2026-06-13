# SSIS overhaul — Phase 1 target spec (build-ready)

**Status:** Phase 1 of the SSIS overhaul. Drafted 2026-06-12.
**Mandate:** **net-new customers only** — existing installs stay as-is, no
migration. Free to redesign.
**Inputs:** [`ssis-package-audit.md`](ssis-package-audit.md) (Phase 0, current
state) + the decisions logged there. **Design home:**
[`ssis-management-and-jde-extraction.md`](ssis-management-and-jde-extraction.md).

This is the blueprint to build in SSDT-BI (the VS runbook is §6) plus the
VALC/agent side it pairs with. Phase 2 = execute it; Phase 3 = rebuild + test.

---

## 1. The model (recap)

> **⚠ SUPERSEDED (2026-06-13): REVERSED back to the SSISDB catalog.** The
> PACKAGE/msdb decision recorded in this section was reversed — the deciding
> fact was that the **vast majority of existing customers already run the SSIS
> catalog**, so CLR + catalog are proven-acceptable for this base, and the
> catalog **unifies old + new installs on one model** (one debugging story, one
> runbook) instead of splitting the fleet. The catalog's `catalog.executions`
> telemetry is also the exit-strategy lever a junior needs to self-diagnose a
> failed load — the msdb store has no usable GUI in modern SSMS. The canonical,
> build-ready design is now
> [`ssis-catalog-reversal-spec.md`](ssis-catalog-reversal-spec.md) (verified
> end-to-end), with the privileged-principal model in
> [`ssis-deploy-service-account.md`](ssis-deploy-service-account.md). **Read
> those, not the package-model text below.** What carries over from this spec is
> deployment-model-agnostic: the package internal redesign (§3), bootstrap mode
> + date horizon (§4), and the parameter inventory (§2) — only the *transport*
> (deploy + config emit) changed from msdb/config-table to
> `catalog.deploy_project` + an SSISDB environment. The package/msdb text below
> is kept for history.

> **DEPLOY MODEL DECISION (2026-06-12): PACKAGE deployment, not project.**
> This supersedes the SSISDB-catalog/environment terminology that lingers in
> §2a (kept for history); **§5 below is rewritten to the package-model deploy
> half**. Package model was chosen because it **deletes
> the SSISDB catalog entirely** — no CLR-enable, no `create_catalog` (often
> blocked on a locked-down prod box), no folder, no `deploy_project`, no
> environments. The catalog was the most fragile, hardest-to-automate part.
>
> **Package-model shape:**
> - **Artifact:** one `.dtsx` (the agent places it on the box; the install
>   bundle already delivers it), `ProtectionLevel = DontSaveSensitive`.
> - **Run:** a SQL Agent **"SSIS Package"** job step (the refresh job already
>   fired via `sp_start_job`), run by the local agent.
> - **Config-per-customer:** a **SQL Server configuration table in the
>   customer's own RR database** — the agent writes it from VALC data; no
>   plaintext `.dtsConfig` on disk; dovetails with the existing
>   `rsystemvariables` sync. Secrets live in that table (DontSaveSensitive).
> - **No catalog/folder/CLR provisioning.** Readiness simplifies to "is SSIS
>   installed (SQL Agent SSIS subsystem present) + are the per-platform OLE DB
>   providers present."
> - **Telemetry:** SQL Agent job history + package logging (no
>   `catalog.executions`); RR's own reconciliation is the correctness oracle.
> - **VS cost:** convert the project to package model — folded into the
>   net-new rebuild, not throwaway.

**One** parameterized `.dtsx` for all customers and all platforms. It ships
once; the only per-customer act is supplying its config (job name, connections,
parameters) — written to the RR-DB config table by the agent.
`ProtectionLevel = DontSaveSensitive` so the package carries no secrets and is
identical everywhere. Adding a JDE column = rebuild the one package → the agent
redeploys it to everyone. No customer-box Visual Studio, no manual edits per
install.

---

## 2. Parameter inventory (the heart of the spec)

Every per-customer value becomes a configurable package value (parameter,
connection-manager property, or variable). Source column says where VALC gets
the value when it generates the config rows (§5).

### 2a. Per-customer values — supplied via the RR-DB config table

| Project parameter | Type | VALC source | Notes |
|---|---|---|---|
| `JDESource.ServerName` | str | `client_servers` JDE_SOURCE `host` | Topology JDE Source card (V44) |
| `JDESource.InitialCatalog` | str | `client_servers.jde_catalog` | SQL source only; blank for Oracle/AS400 |
| `JDESource.UserName` | str | JDE_SOURCE `credentials_username` | |
| `JDESource.Password` | str (sensitive) | JDE_SOURCE `credentials_password_encrypted` | |
| `JDESource` provider | str | `clients.jde_source_platform` | ORACLE→`OraOLEDB` / AS400→`IBMDA400` / SQLSERVER→`MSOLEDBSQL`; folded into the conn string |
| `RRLocal.ServerName` | str | `client_databases.db_address` | RR target SQL host |
| `RRLocal.InitialCatalog` | str | `client_databases.db_name` | the customer RR DB |
| `RRLocal.UserName` | str | `client_databases.db_username` | `rruser` |
| `RRLocal.Password` | str (sensitive) | `client_databases.db_password_encrypted` | |
| `dbowner` | str | **baked default `dbo.`** | parameter only so a rare non-dbo install can override |
| `tableQualifier` | str | `clients.jde_table_qualifier` | e.g. `proddta` (currently embedded per query — promote to one param) |
| `RefreshDays` | int | `clients`/per-DB, **default −35** | steady-state; raise per customer for backdating shops (memory cost) |
| `RefreshDaysRNV` | int | **default −90** | as above |
| `ModInv` | bool | **derived** from licensed Inventory | from `clients.tab_inventory` |
| `ModRnv` | bool | **derived** from licensed Reconciliation | from licensed modules |
| `DecExtCost` / `DecUnitCost` / `DecQty` / `DecQtyCX` | int | **NOT config — self-derived in-package** | see below |

> **Decimals are mined from the JDE DD at runtime (decided 2026-06-12).** Verified
> against `JDE_PRIST920`: the values live in `F9210.FRCDEC` (ECST=2, UNCS=4;
> PQOH/TRQT are customer-specific). Rather than capture/ask, an Execute SQL Task
> in the package reads `FRCDEC` for the four items from the DD (`…CTL`) schema
> and sets the `Dec*` variables as `10^FRCDEC` — exactly like the existing
> Julian-date task. Never captured, never config, self-healing. GSI never sees
> them. The V20 decimal fields on Client Details become vestigial for net-new.
> (DD-schema resolution: derive from the data qualifier's `CTL`/`DTA` pattern or
> locate `F9210` — pinned in the package work.)

### 2b. Initial-load-only — set at the load action, not steady-state

| Parameter | Type | Source | Notes |
|---|---|---|---|
| `aaStartDateGr` | date | from the **bootstrap's** period cutoffs (§4) | history horizon; moot after first load until a full reset |
| `InitLoad` | bool | operational (Deployment Center) | 1 for the first full load, 0 after |

### 2c. Mode flag — new

| Parameter | Type | Notes |
|---|---|---|
| `BootstrapOnly` | bool | `true` = run `Initialize` + `Companies` + `usp6_002a_companies` and stop (§4). `false` = full run. |

---

## 3. Package structural changes

- **`ProtectionLevel` → `DontSaveSensitive`.** The single change that frees the
  `.dtsx` from a per-machine user key. All sensitive values arrive at runtime
  from the RR-DB config table (§5).
- **Expose every per-customer value to the SQL config** (§2). The two OLE DB
  connection managers (`JDESource` / `RRLocal`) already exist; `RefreshDays`,
  `RefreshDaysRNV`, `ModInv`, `ModRnv`, `InitLoad`, `aaStartDateGr`, `dbowner`,
  and the four `Dec*` already exist as `User::` variables. **Add the two net-new
  variables** the config will set: `tableQualifier` (today embedded per query)
  and `BootstrapOnly` (§2c mode flag).
- ~~**Standardize the RRLocal driver on `MSOLEDBSQL`**~~ — **already done in Prod**:
  both connection managers are on `MSOLEDBSQL.1`. The deprecated `SQLNCLI11` lived
  only in the now-deleted JDELab variant. No action.
- **Drop `F4096old`** (the old-column-name container) — net-new customers won't
  be on old-column JDE. Ship the single new-column `F4096` path.
- **Retire the per-container hardcoded date shadows** (`Date<table>` /
  `Date<table>Gr` = `122001` / `2022-01-01`). Every container's date derives
  from the one horizon (§4); nothing is hand-set per container.

---

## 4. Bootstrap mode + date-horizon flow

**Bootstrap** (`BootstrapOnly = true`) runs only:
1. **`Initialize`** — connection test on both pipeline ends (JDE source + RR
   local). Doubles as an install-readiness check.
2. **`Companies`** — the master/constants load (F0006/F0008/F0010/F0015…). Fast.
3. **`usp6_002a_companies`** — populates `rcompanies`. Fast.

Then stops. Result: company list + per-company period cutoffs established.

**Why it matters:**
- **Licensing + handoff unlock immediately** (they need the company list, which
  the bootstrap produces) — decoupled from the multi-hour full load.
- The **load horizon** for the full run derives from those per-company cutoffs
  (earliest reconciled period − the timing buffer). So `aaStartDateGr` is *set
  from data the bootstrap just created*, resolving the chicken-and-egg.

**Date flow (full load):** one horizon (from cutoffs) → global `aaStartDateGr` →
every container's `qry<table>Date` (already derives: empty table → global;
else → `max(existing) + RefreshDays`). Load horizon = retention horizon, so the
cleanup sprocs never delete freshly-loaded data. No load-then-purge; no manual
container drilling.

**Install ladder:** Step 4 (SSIS config/deploy) → **Step 4b bootstrap**
(companies/cutoffs → licensing + handoff) → Step 5 full load (horizon-bounded).

---

## 5. VALC / agent side (pairs with the package — PACKAGE deployment model)

> **⚠ SUPERSEDED (2026-06-13) — see §1.** This package-model deploy half was
> replaced by the **SSISDB catalog** deploy in
> [`ssis-catalog-reversal-spec.md`](ssis-catalog-reversal-spec.md) §5–§6 (built +
> verified). In the shipped model the deploy half is: `catalog.deploy_project`
> the `.ispac` (via `OPENROWSET(BULK …)` on the box) + provision an SSISDB
> **environment** (the per-customer config, secrets encrypted in the catalog,
> the connection-string/password split) + run via `catalog.create_execution`.
> Catalog mutations reject SQL auth (Msg 27123) and SQL 2017 has no Entra, so
> VALC routes them through a SQL Agent T-SQL job that runs under the Agent's
> Windows account (member of SSISDB `ssis_admin`) — durable named steps on the
> per-DB standard job for the secret-free ops (audit trail), a transient job for
> the secret-bearing environment build (Phase 3 moves that to the on-box agent).
> The config-table emit, `[dbo].[SSIS Configurations]`, and the msdb/`dtutil`
> placement below are retired. The text below is kept for history.

> This section is the package-model deploy half (per §1). **No SSISDB** — no
> `deploy_project`, no `create_environment`, no catalog. The deploy half is:
> place one `.dtsx`, write the per-customer config rows into the RR DB, and run
> it from a SQL Agent SSIS-Package job step — all over the same agent T-SQL/file
> channel that already serves `sp_start_job` and the dacpac flows.

1. **Config-table generation (VALC).** VALC renders the §2a values — including
   the derivations (`10^decimal` for the `Dec*`, module→`bool`, platform→provider
   string) — into rows of the **standard SSIS package-configuration table** in the
   customer's own RR database (default `[dbo].[SSIS Configurations]`:
   `ConfigurationFilter` / `ConfiguredValue` / `PackagePath` /
   `ConfiguredValueType`). One filter per customer; the `.dtsx` is built with a
   **SQL Server package configuration** pointing at this table, so at run time it
   pulls connections + parameters from it. The two passwords live only in this row
   set — the DB is access-controlled and `DontSaveSensitive` keeps them out of the
   artifact. Dovetails with the existing `rsystemvariables` sync (same DB, same
   agent write path).
2. **Agent deploy (T-SQL + file).** Per database the agent: (a) **places/updates
   the `.dtsx`** at the box's package path (the install bundle delivers the first
   copy; redeploys overwrite it — compare by version); (b) **upserts the config
   rows** for that customer's filter; (c) **creates the SQL Agent job + "SSIS
   Package" job step** via `msdb.dbo.sp_add_job` / `sp_add_jobstep` (subsystem
   `SSIS`, `PackageSource = File system`, pointing at the deployed `.dtsx`; the
   in-package SQL config points back at the RR DB for its values). The job name is
   the per-DB value already captured on the Step-4 SSIS tab (`client_databases`
   job field).
3. **SSIS tab — versioning.** Register/version the `.dtsx` in `file_versions`
   (`component='ssis'`) exactly like the dacpac (`component='database'`,
   `syncDbReleases`) and the Services jar — pull a tagged build in, pick a
   version, deploy. **Release pipeline built** (`release-ssis.yml`, `ssis-v*`
   tags); `syncSsisReleases` + `?component=ssis` catalog it. The Deployment
   Center version-picker UI is the remaining piece (part of the deploy half).
4. **Bootstrap + full-load actions.** Deployment Center buttons set the run-mode
   config rows then start the job via `sp_start_job`: **bootstrap** =
   `BootstrapOnly=true` (companies/cutoffs only — §4); **full load** =
   `BootstrapOnly=false`, `InitLoad=1`, `aaStartDateGr` from the bootstrap's
   cutoffs; **steady state** = `InitLoad=0`. Each is an upsert to the customer's
   config rows immediately before the start.
5. **Install readiness (already built, s23).** No catalog/CLR/master-key step.
   Readiness is just **`InstallProbeService.probeSsis`** — SQL Agent SSIS
   subsystem present + IS service running — plus a per-platform OLE DB provider
   presence check (`MSOLEDBSQL` / `OraOLEDB` / `IBMDA400`) on the box.

---

## 6. VS runbook (what to do in SSDT-BI)

Owner-side, the only-VS-can-do part. The structural conversion (deployment
model, `ProtectionLevel` re-handling, container delete, precedence wiring)
re-encrypts/re-writes the package — not safe to hand-edit the 6.4 MB XML, so
it's done in VS. The names/counts below are **mined from the real
`RapidReconciler_Prod.dtsx` (2026-06-12)**, so this is mechanical, not
exploratory. Suggested order:

1. **Convert Project → Package deployment model** (Solution Explorer → project →
   *Convert to Package Deployment Model*). The repo is now a single package
   (`RapidReconciler_Prod.dtsx`); the other four `.dtsx` + their `.dtproj`
   refs were removed.
2. **Set `ProtectionLevel = DontSaveSensitive`** on the package (and project).
   Currently implicit `EncryptSensitiveWithUserKey` — accept the Sensitive
   conversion prompt so the two passwords stop being user-key-encrypted; they
   arrive at runtime from the config table.
3. **Delete the `F4096old` container + its `qryF4096_old` variable.** ~399
   `F4096old` references vs ~1,678 `F4096` — net-new customers ship the single
   new-column `F4096` path only. (Biggest single edit; do it first after the
   model convert so the rest validates against the trimmed package.)
4. ~~Fix the RRLocal driver~~ — **no action.** Both `JDESource` and `RRLocal`
   are already OLE DB on `MSOLEDBSQL.1`.
5. **Add the two net-new `User::` variables** the config sets:
   `tableQualifier` (String; replace the per-query embedded qualifier with this
   variable) and `BootstrapOnly` (Boolean, default `False`). The other config
   targets already exist: connection managers `JDESource`/`RRLocal` and
   variables `RefreshDays` (−35), `RefreshDaysRNV` (−90), `ModInv`, `ModRnv`,
   `InitLoad`, `aaStartDateGr`, `dbowner` (`dbo.`), and the four `Dec*`.
6. **Wire `BootstrapOnly`** — a precedence-constraint expression
   (`@[User::BootstrapOnly] == false`) gating the transactional containers
   (`General Ledger`, `Inventory`, `Item Branch`, `Purch Orders`, `Receipts`,
   `Sales Orders`, `UOMs`, `Work Orders`) so bootstrap runs only `Initialize` +
   `Companies` (+ its `usp6_002a_companies`) and stops (§4).
7. **Add the decimals self-derive Execute SQL Task** (mirror the existing
   Julian-date task that sets `branchdatejul`/`startdatejul`): read
   `F9210.FRCDEC` for ECST/UNCS/PQOH/TRQT from the DD schema and set
   `DecExtCost`/`DecUnitCost`/`DecQty`/`DecQtyCX` = `10^FRCDEC`. These stay
   variables (they already are) — never config (§2a).
8. **Consolidate the date logic** — full worksheet:
   [`ssis-date-consolidation.md`](ssis-date-consolidation.md). Correction: the
   `Date*` vars are **runtime-computed** from `aaStartDateGr` (not hardcoded
   shadows). The real work is collapsing 6 date tasks + 7 query vars into one
   `Compute Load Dates` task, dropping dead write-only vars + the dead `Branch
   Date` task, and **fixing `Min UKID`'s 3 hardcoded `'2022-01-01'` literals** so
   inventory finally tracks `aaStartDateGr` too.
9. **Set up the SQL Server package configuration** pointing at
   `[dbo].[SSIS Configurations]` in the RR DB (`EnableConfig` is already `True`),
   so the package pulls the connection + variable values that
   `SsisConfigService` writes (§5.1). Export/confirm the `PackagePath` strings
   match `SsisConfigService.Paths`.
10. **Build** the package (`.dtsx`). Hand it to the SSIS-tab deploy flow (§5).

(Steps 6 + 8 are the fiddliest. Steps 1–6, 9, 10 are **done + verified**
(2026-06-12); the F0015 diagnostic tasks once referenced here were removed.
Steps **7 (decimals task)** and **8 (date shadows)** remain — deferred to the
correctness pass, along with the `tableQualifier` query-wiring.)

---

## 7. Open / deferred

- ~~**Diagnostic toggles**~~ — **resolved (2026-06-12):** the disabled F0015
  "Start"/"Stats" tasks **and the whole F0015 load** were removed (confirmed
  disabled long ago — zero behavior change). The now-orphan `aaStartF0015`
  variable can be deleted (harmless to leave).
- **Decimal source grain** — `Dec*` derive from `clients.jde_*`; confirm no
  per-DB override is needed.
- **`RefreshDays` grain** — per-client vs per-RR-database (parked; default −35
  works until a customer needs otherwise).
- ~~**`.dtsx` build tooling**~~ — **built (2026-06-12):** `release-ssis.yml` in
  the SSIS repo, on `ssis-v*` tags, attaches the committed
  `RapidReconciler_Prod.dtsx` to a GitHub release. Hosted runner, **no compile**
  (the package-deployment `.dtsx` *is* the artifact) — lighter than the dacpac.
  `syncSsisReleases` catalogs it into `file_versions` (`component='ssis'`, §5.3).
- **Incremental refinement** (Lever 1) — already largely present via the
  `max(date) + RefreshDays` pattern; revisit once the overhaul lands.
