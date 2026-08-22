# SSIS catalog deploy — the privileged principal (service account)

**Status:** DECISION PENDING (2026-06-13). Spun out of the catalog reversal
([`ssis-catalog-reversal-spec.md`](ssis-catalog-reversal-spec.md)) after dev
verification surfaced a hard SSISDB restriction. Captures the facts + a
recommendation; the deploy-execution model (§4 A vs B) is the owner's call
because it determines a rebuild of the catalog deploy path.

---

## 1. The hard fact (verified on the dev catalog, 2026-06-13)

**SSISDB catalog *mutations* reject SQL Server Authentication.** Every one of
`catalog.deploy_project`, `create_environment`, `create_environment` variable
ops, `delete_environment`, and `create_execution` throws:

> **Msg 27123** — "The operation cannot be started by an account that uses SQL
> Server Authentication. Start the operation with an account that uses
> Integrated Authentication."

Confirmed against `deploy_project` (via `internal.create_deploy_operation`),
`create_environment`, and `delete_environment`. Catalog **reads**
(`SELECT … FROM SSISDB.catalog.*`) are fine under SQL auth.

Two consequences that kill the original plan's "JDBC `setBytes` with the
resolved `rruser` SQL creds" approach:

- **It is the auth *scheme*, not permissions.** `rruser` is **already a member
  of the SSISDB `ssis_admin` role** — it has every needed permission and still
  can't run a catalog mutation, because it authenticates with SQL auth.
- **SQL 2019 is the product engine floor → no Entra/Microsoft-Entra SQL auth** (that
  arrived in SQL 2022). So the deploy principal must be a **classic Windows
  account** (domain or local), authenticated by the *process running as it*
  (Kerberos/NTLM). You cannot pass a Windows username+password in a SQL
  connection string for classic Windows auth — the connecting process must hold
  the token. (The dev box is SQL 2022 + Entra-joined, but we cannot rely on
  Entra for the fleet.)

So: **a Windows principal that is a member of SSISDB `ssis_admin` must perform
every catalog mutation.** The question is *which* Windows principal, and *how*
the deploy is routed to it.

---

## 2. Minimal permissions

- **Ongoing deploy/run account:** SSISDB **`ssis_admin`** database role. That's
  the whole requirement for `deploy_project` + environment provisioning +
  `create_execution` — **not** server `sysadmin`. One statement at install:
  `ALTER ROLE ssis_admin ADD MEMBER [<principal>];` (create the SSISDB user for
  the login first).
- **One-time catalog creation** (`SSISDB` + master key + `clr enabled = 1`)
  needs `sysadmin` — a documented human/install step, separate from the ongoing
  account (catalog reversal spec §7).
- **`OPENROWSET(BULK …)`** to stream the `.ispac` from a file (Option A) needs
  `ADMINISTER BULK OPERATIONS` (server) / the `bulkadmin` server role *in
  addition* to `ssis_admin`. `sysadmin` already has it. (Option B reads the
  bytes in-process, so it does not need bulkadmin.)

---

## 3. What carries over

The catalog code already written this session is correct **except for the
connection identity**: `SsisConfigService.toEnvironmentSql` (folder → env →
variables → reference → 16 parameter bindings), the run-mode
`create_execution` T-SQL in `SsisDeployService.startRun`, and the `.ispac`
artifact + `file_versions` cataloging all stand. Only *who runs the T-SQL* and
*how the `.ispac` bytes reach `deploy_project`* change with the model below.

---

## 4. The fork — which Windows principal, and how

### Option A — SQL Agent T-SQL job step *(proven tonight; recommended)*

VALC (or the agent) submits the catalog T-SQL as a **SQL Agent job, T-SQL
subsystem**, via `rruser` SQL auth (creating/starting an msdb job is allowed
under SQL auth — only the SSISDB *catalog* mutation is restricted). The **job
step runs under the SQL Agent service account** (a Windows principal) →
Msg 27123 satisfied.

- **Proven 2026-06-13:** a T-SQL Agent job running `create_environment`
  returned *"Executed as user: NT SERVICE\SQLSERVERAGENT. The step succeeded."*
  and the environment was created. (The dev Agent account was granted
  `ssis_admin`.)
- `deploy_project` reads the `.ispac` inside the step via
  `OPENROWSET(BULK '<path>', SINGLE_BLOB)` — the file must sit on a path the
  **SQL Server / Agent service account** can read (in prod the on-box agent
  drops it there; in dev it's the same box). Needs `bulkadmin` (§2).
- **Pros:** works on **SQL 2019+**, **no Entra**, **no new login to
  authenticate as** from VALC; reuses the existing "SSIS runs under SQL Agent"
  model a junior already knows; least customer friction (one `ALTER ROLE`
  scripted into the install — grant the Agent account `ssis_admin`).
- **Cons:** **async** — poll `msdb.dbo.sysjobhistory` for success/failure +
  message (the deploy/build endpoints become start-then-poll); a rebuild of the
  deploy path into job orchestration; the `.ispac` file-placement +
  `bulkadmin`; the deploy now rides the Agent account's identity (broad if the
  Agent runs as a privileged account — but it's already trusted to run the
  load).

### Option B — dedicated RR Windows service account the agent runs as *(owner's original ask; the Phase-3 direction)*

Provision a dedicated **Windows service account** (domain or local), make it a
member of SSISDB `ssis_admin`, and run the **on-box agent's Windows service
logon as that account**. The agent performs catalog mutations directly over an
integrated-auth connection (it holds the token). VALC generates the artifacts/
T-SQL; the firewall-bound agent executes them — the handoff's **Phase 3
agent-executor**.

- **Pros:** clean least-privilege separation (a named RR principal, not the
  shared Agent account); the agent-executor is where installs/upgrades head
  anyway; no `OPENROWSET`/`bulkadmin` (bytes read in-process); synchronous.
- **Cons:** the customer must **provision + manage a Windows service account**
  (domain coordination); depends on the Phase-3 agent-executor being built;
  topology must store the account (name for reference; classic Windows auth has
  no storable password VALC can use over the network — only the agent's logon
  identity); VALC-from-the-control-plane still can't deploy directly (no Windows
  password in a conn string), so dev/same-box VALC deploys would need VALC
  itself to run as the account.

### Why not "just store a Windows cred in topology and pass it"

Classic Windows auth (a SQL 2019 engine's only non-SQL option) has **no connection-string
username/password** — authentication is by the process's Windows token. So a
stored Windows credential can only be *used* by launching the process as that
account (service logon / `runas`), which is Option B's agent-logon model, or by
routing through a process that already holds a Windows token (Option A's Agent
service). Storing it in topology is fine for *documentation/reference*, but it
does not enable VALC to connect as it over JDBC/sqlcmd.

---

## 5. Recommendation

**Option A (SQL Agent T-SQL job step).** It's proven, portable to the SQL 2019
floor, needs no Entra and no new account (one scripted `ALTER ROLE ssis_admin
ADD MEMBER [<Agent service account>]`), and reuses the SQL-Agent model the
fleet already runs the load under — the lowest-friction, most junior-legible
path. Accept the async job-polling + `.ispac` file-placement + `bulkadmin` as
the cost. Keep **Option B (agent-as-service-account)** as the longer-term
Phase-3 direction when the on-box executor is built; the catalog T-SQL is
identical, only the executor changes.

If the owner prefers the dedicated-account separation now, go B — but it pulls
in the Phase-3 agent-executor and customer account provisioning.

---

## 6. Implications once chosen

- **Topology:** record the deploy principal (Agent service account name for A;
  the dedicated account for B) on the SQL Server card — for the readiness probe
  + the prep doc, not for VALC to authenticate with.
- **Prep doc** (`rr-installation-prep.html` / `rr-provisioning.html` /
  `using-valc.html`): add the requirement — *"SQL Server Agent running, its
  service account a member of SSISDB `ssis_admin`"* (A) or *"a dedicated RR
  Windows service account, member of SSISDB `ssis_admin`, that the RR agent
  service runs as"* (B). Plus the one-time catalog-create (CLR + master key,
  sysadmin) from the reversal spec §7.
- **Readiness probe** (`InstallProbeService`): add CLR-enabled + catalog-exists
  + (A) Agent-account-`ssis_admin` / (B) service-account-`ssis_admin` gates.
- **Code seams:** `DbDeployService.deployProjectToCatalog` (→ Agent-job +
  `OPENROWSET` for A, or in-process integrated for B); `SsisConfigService.applyConfig`
  + `SsisDeployService.startRun` (→ wrap their T-SQL in an Agent job + poll for
  A; direct for B). The generated T-SQL bodies are already written + correct.
- **Install script step 1** (`4 - …Job Creation Script.sql`): the SQL Agent job
  that runs the steady refresh uses the `/ISSERVER … /ENVREFERENCE` catalog form
  (reversal spec §6) — and under A the job's own account already satisfies the
  auth requirement for the scheduled run.

---

## 7a. Durable standard-job + named steps (audit trail) — BUILT 2026-06-13

Driver: a new customer wants RR deployed on a **shared enterprise SQL Server**
alongside many other DBs, where a DBA watches `msdb`. The original
create-run-**delete** transient job (`runCatalogJob`) reads as sneaky there (jobs
flicker; `sp_delete_job` discards the msdb job history + step output). Decided
with the owner: **the catalog ops are permanent named steps on the per-database
standard job, triggered on demand, never deleted** — so msdb retains a full run
history on top of `catalog.operations`/`catalog.executions` (which already log
every op with `caller_name`).

**Model (built + verified on db 21):**
- One durable job per DB = the standard job (`db_job_name`, e.g.
  `RapidReconciler_InstTest`). VALC ensures it + the named step exist
  (`DbDeployService.runCatalogStep`), refreshes the step's **(secret-free)**
  command, then `sp_start_job @step_name` runs **only that step**
  (`on_success = Quit`); polls `sysjobhistory`; **never deletes**.
- Steps verified: `Deploy project` (TSQL) + `Bootstrap` (TSQL) added alongside
  the install's `Run A to B` / `Run B to C`; both left durable with msdb history
  ("Deploy project ok", "Bootstrap ok"); **0 transient jobs** remained.
- **`Deploy project`** = `deploy_project` via `OPENROWSET(BULK …, SINGLE_BLOB)`
  from the on-box `valc.ssis.package-dir\<DB>\RapidReconciler-SSIS.ispac` (no
  secrets → the step body persists safely). VALC stages the file in dev (same
  box); **the on-box agent places it in prod** (VALC can't write across the
  firewall). Needs the Agent account `bulkadmin` (+ read on the path).
- **`Bootstrap` / `Full load` / `Steady refresh`** = `create_execution` with the
  run-mode params (no secrets) → permanent steps.

**The one carve-out — `Build environment` is NOT a permanent step.** Its T-SQL
sets the JDE + `rruser` passwords (into the sensitive env vars), which would
persist in `msdb.sysjobsteps.command` in clear text — defeating the catalog's
encrypted-secret design. So it stays on the **deliberate transient**
`runCatalogJob` (created-run-**deleted** for secret hygiene; the change is still
in `catalog.operations`) **until the on-box agent owns it (Phase 3)** — the owner
chose the agent as its end-state home (runs under the service account, no msdb at
all). Rare op (install/config change).

**Shared-enterprise footprint** is then exactly: 1 DB, 1 SSIS project + 1
environment in the catalog, 1 clearly-named standard job with named steps + full
history — nothing transient, all DBA-reviewable.

**Remaining (Phase 4 / Phase 3):** the DB-repo install script
(`4 - …Job Creation Script.sql`) should create the standard job with these steps
+ convert `Run A to B` step 1 to the catalog `create_execution` form; the on-box
agent takes over `Build environment` + the prod `.ispac` file-placement.

## 7. Dev verification path (either option)

The dev box's only `sysadmin` is the owner's **Entra** login (SSMS-interactive
only; headless `sqlcmd -E`/`-G` and JDBC can't get its token non-interactively).
So headless verification routes catalog mutations through the **SQL Agent job**
(Option A, proven) regardless of the production choice, and reads results back
under `rruser`. Target: db 21 / `RapidReconciler_InstTest` / `JDE_PRIST920`.
