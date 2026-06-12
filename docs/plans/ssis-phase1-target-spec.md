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

> **DEPLOY MODEL DECISION (2026-06-12): PACKAGE deployment, not project.**
> This supersedes the SSISDB-catalog/environment details that appear later in
> §2a and §5 (kept for history). Package model was chosen because it **deletes
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

Every per-customer value becomes a **project parameter**. Source column says
where VALC gets the value when it generates the environment.

### 2a. Project parameters — supplied per customer (SSISDB environment)

| Project parameter | Type | VALC source | Notes |
|---|---|---|---|
| `CM.JDESource.ServerName` | str | `client_servers` JDE_SOURCE `host` | Topology JDE Source card (V44) |
| `CM.JDESource.InitialCatalog` | str | `client_servers.jde_catalog` | SQL source only; blank for Oracle/AS400 |
| `CM.JDESource.UserName` | str | JDE_SOURCE `credentials_username` | |
| `CM.JDESource.Password` | str (sensitive) | JDE_SOURCE `credentials_password_encrypted` | |
| `CM.JDESource` provider | str | `clients.jde_source_platform` | ORACLE→`OraOLEDB` / AS400→`IBMDA400` / SQLSERVER→`MSOLEDBSQL`; folded into the conn string |
| `CM.RRLocal.ServerName` | str | `client_databases.db_address` | RR target SQL host |
| `CM.RRLocal.InitialCatalog` | str | `client_databases.db_name` | the customer RR DB |
| `CM.RRLocal.UserName` | str | `client_databases.db_username` | `rruser` |
| `CM.RRLocal.Password` | str (sensitive) | `client_databases.db_password_encrypted` | |
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
  `.ispac` from a per-machine user key. All sensitive params arrive at runtime
  from the environment.
- **Promote every per-customer value to a project parameter** (§2). The
  connection-manager properties are already parameterized; add `tableQualifier`,
  `RefreshDays`/`RefreshDaysRNV`, the `Dec*`, `Mod*`, `BootstrapOnly`.
- **Standardize the RRLocal driver on `MSOLEDBSQL`** (drop the deprecated
  `SQLNCLI11` still in the JDELab variant).
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

## 5. VALC / agent side (pairs with the package)

1. **Environment-generation service** — VALC renders the §2a values (incl. the
   derivations: `10^decimal`, module→bool, platform→provider string) into an
   SSISDB environment value-set per customer.
2. **Agent T-SQL** — `catalog.deploy_project` (push the `.ispac`) +
   `catalog.create_environment` / `create_environment_variable` / set values +
   `set_object_parameter_value` (bind the project to its environment reference).
   Same T-SQL channel the agent already uses for `sp_start_job`.
3. **SSIS tab** in the Deployment Center — catalog/version the `.ispac` like the
   dacpac + Services flows.
4. **Bootstrap + full-load actions** — Deployment Center buttons that run the
   package with `BootstrapOnly=true` then (later) `InitLoad=1`, via the agent.
5. **Install bootstrap** — ensure the SSISDB catalog exists (CLR + master key +
   `CREATE CATALOG`) and a per-platform OLE DB provider presence check.

---

## 6. VS runbook (what to do in SSDT-BI)

Owner-side, the only-VS-can-do part. Suggested order:

1. Open the project; **set `ProtectionLevel = DontSaveSensitive`** on the
   project and every package (use the project-level setting + the Sensitive
   conversion prompt).
2. **Delete the `F4096old` container** and its variables.
3. **Fix the RRLocal connection manager** to `MSOLEDBSQL` (re-point provider).
4. **Promote to project parameters:** `tableQualifier`, `RefreshDays`,
   `RefreshDaysRNV`, `DecExtCost`, `DecUnitCost`, `DecQty`, `DecQtyCX`,
   `ModInv`, `ModRnv`, `dbowner`, `BootstrapOnly`, `aaStartDateGr`, `InitLoad`.
   Set the baked defaults (`dbowner=dbo.`, `RefreshDays=-35`, `RefreshDaysRNV=-90`).
5. **Wire `BootstrapOnly`** — a precedence-constraint expression on the
   transactional containers so they skip when `BootstrapOnly == true`.
6. **Retire the hardcoded `Date<table>`/`Date<table>Gr` shadows** — confirm each
   container's `qry<table>Date` drives the query off the global horizon, and
   remove the static fallbacks.
7. **Build** the `.ispac`. Hand it to the catalog flow.

(Step 6 is the fiddliest; pair with the date discussion's diagnostic-toggle
confirmation — the F0015 "Start"/"Stats" tasks — before finalizing.)

---

## 7. Open / deferred

- **Diagnostic toggles** — confirm the disabled F0015 "Start"/"Stats" tasks are
  diagnostics (leave off) vs. needed.
- **Decimal source grain** — `Dec*` derive from `clients.jde_*`; confirm no
  per-DB override is needed.
- **`RefreshDays` grain** — per-client vs per-RR-database (parked; default −35
  works until a customer needs otherwise).
- **`.ispac` build tooling** on the GitHub runner (SSIS build target) for a
  tag-triggered release — heavier than `.sqlproj`; needed before automated
  Services-style releases of the package.
- **Incremental refinement** (Lever 1) — already largely present via the
  `max(date) + RefreshDays` pattern; revisit once the overhaul lands.
