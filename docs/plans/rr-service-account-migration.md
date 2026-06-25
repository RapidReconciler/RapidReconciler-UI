# RR Service Account Migration — Runbook (DRAFT for Daren)

**Status:** Proposed, pending Daren's go-ahead. Authored 2026-06-25.
**Owners:** Daren runs the privileged (admin) steps; Claude does all config/code changes around them. Neither the owner nor Claude is a local admin on the SQL box.

---

## 1. Goal & why

Today every layer authenticates to SQL differently, and the credentials don't survive a reboot — which produced a long "whack-a-mole" of broken agents, empty `RR_SQL_PASSWORD`, and agents that boot but can't reach SQL.

**Target end state:** ONE Windows service account (call it `svc_rapidreconciler`) runs VALC + the spawned Services agents (+ optionally SQL Agent), and the agents connect to SQL with **integrated auth** (`Trusted_Connection=true` / `integratedSecurity=true`) **under that account**. Result: **no SQL password lives in any config, env var, or VALC row** — the `RR_SQL_PASSWORD` / `rruser`-password churn is eliminated at the root.

Non-goal: changing business logic. This is purely an identity/credential consolidation.

---

## 2. Current state (what authenticates how, today)

| Layer | How it auths to SQL today | Where it's set |
|---|---|---|
| Spawned Services agent | SQL login `rruser` + password | agent `application.yml` `spring.datasource.username/password` (password from `RR_SQL_PASSWORD` env, or passed by VALC) |
| VALC → agent spawn | passes `--spring.datasource.username/password` from **Topology** (`client_servers` credentials) | `AgentLifecycleService.start()` / `resolveCredentials()` |
| Dev launcher (now disabled) | `rruser` + `RR_SQL_PASSWORD` env | `setup/run-test-agent.ps1`, `test-agents.psd1` (disabled 2026-06-25) |
| DB DDL / setup scripts | run as `rruser` | `RapidReconciler-Agent/setup/sql/*.sql` |
| SSIS load + refresh jobs | SQL Agent service account (`NT SERVICE\SQLSERVERAGENT`) | SQL Agent jobs / SSIS packages |
| Install model | creates `rruser` (`CHECK_POLICY=OFF`, GSI-managed pwd synced in VALC) | provisioning/install docs (see memory `project_install_docs_pending`) |

### Reference map (signal files; logs / `.vs` / `obj` / `bin` noise filtered)

**DB — the install layer (highest priority):**
- `RapidReconciler-DB/Installation Files/3 - RapidReconciler User Creation Script.sql` — **where `rruser` is created** (the install model). Primary change site.
- `RapidReconciler-DB/Installation Files/4 - RapidReconciler SQL Agent Job Creation Script.sql` — SQL Agent job creation (the `SQLSERVERAGENT` layer).
- `RapidReconciler-DB/Installation Files/2 - RapidReconciler Database Object Script 178.sql` — DB object GRANTs to `rruser`.

**Agent:**
- `src/main/resources/application.yml` — datasource (`rruser` + `RR_SQL_PASSWORD`). Primary change site.
- `setup/sql/create-*.sql` (cardex-tolerance, dmaai-*) — v8 net-new tables GRANT to `rruser`.
- `setup/run-test-agent.ps1`, `setup/test-agents.psd1` (psd1 already disabled 2026-06-25).
- `controller/DeployExecutionController.java`, `services/InstallDiagnosticsCollector.java`, `specs/data-purge.md`, `specs/model-dmaai-review.md`.

**SSIS:**
- `RapidReconciler-SSIS/RapidReconciler_Prod.dtsx` (+ `.dtproj`) — connection-manager auth (and the copies under Valc `artifact-store/` + DB `Installation Files/`).
- `RapidReconciler-Valc/setup/deploy-patched-ispac.sql`.

**Prior art — read first (existing related plans):**
- `docs/plans/ssis-deploy-service-account.md` — **already a service-account plan for SSIS deploy**; align this runbook with it (may already answer the SQL-Agent question).
- `docs/plans/jde-refresh-readiness-sql-agent.md`, `docs/plans/dev-multi-agent-setup.md`.

---

## 3. Target architecture

- **Windows account** `svc_rapidreconciler` (domain or managed service account / gMSA if domain-joined; else a local account). Granted **Log on as a service**.
- **SQL Server:** a login for `svc_rapidreconciler` (Windows auth) with exactly the rights `rruser` has on the RR databases (likely `db_owner` per RR DB, or the specific role set — confirm by scripting `rruser`'s current memberships/grants first).
- **Services**: VALC, the spawned agents, and (optionally) SQL Agent run **as** `svc_rapidreconciler`.
- **Agent datasource**: `jdbc:sqlserver://<host>:<port>;databaseName=<db>;integratedSecurity=true;trustServerCertificate=true` (+ the mssql-jdbc native auth DLL on the path) — **no username/password**.
- VALC stops passing `--spring.datasource.username/password` to spawned agents.

---

## 4. Hard constraints

- **Privileged steps need Daren** (admin): create the account, grant logon-as-service, create the SQL login + role memberships, change service logon accounts.
- **Never delete-first.** `rruser` + `SQLSERVERAGENT` are woven through DB grants, SSIS/Agent jobs, VALC Topology creds, and the install model. Retire each **only after** its replacement is verified.
- Integrated auth requires the agent JVM to load the SQL Server native auth library (`mssql-jdbc_auth-*.dll`) — confirm it's present/on the path, or use the pure-Java Kerberos path.

---

## 5. Migration sequence (introduce → migrate → verify → retire)

**Phase 0 — Inventory (Claude, no admin).** Finish the grep reference map (§2). Script `rruser`'s current SQL roles/grants so the new login gets parity. List the SQL Agent jobs + SSIS packages and how they connect.

**Phase 1 — Introduce the account (Daren).** Create `svc_rapidreconciler`; grant Log on as a service; create its SQL login; grant it the same DB roles as `rruser` (alongside `rruser`, not replacing yet). No service changes yet — both identities valid in parallel.

**Phase 2 — Migrate the agent datasource (Claude + Daren).**
- Claude: switch agent `application.yml` to `integratedSecurity=true`, drop `username/password`; make `AgentLifecycleService` stop passing SQL creds to spawned agents.
- Daren: change VALC's service logon to `svc_rapidreconciler` (so spawned children inherit the account → integrated auth works).
- **Verify:** an agent boots and `/admin/companies/all` returns data with no password anywhere.

**Phase 3 — Migrate SQL Agent / SSIS (Daren).** Point SQL Agent (or the specific job credentials/proxies) at `svc_rapidreconciler`; confirm the SSIS load + refresh jobs run green.

**Phase 4 — Migrate DB setup scripts (Claude).** Update `setup/sql/*.sql` + the install model to create/grant `svc_rapidreconciler` instead of `rruser`.

**Phase 5 — Retire (Daren), only after all of the above verify green.** Remove `rruser`'s grants, then the login. Keep a scripted re-create for rollback.

---

## 6. Rollback

Each phase is independently revertible while both identities coexist (Phases 1–4). Keep: the `rruser` login + password (in VALC) and a script to re-grant it, until Phase 5 is confirmed stable across a reboot. If integrated auth fails at Phase 2, revert the agent datasource to `rruser` creds and VALC's service logon — both still valid.

---

## 7. Open questions for Daren

1. Domain-joined? (gMSA is cleanest if so; else a local service account.)
2. Is the native SQL auth DLL acceptable on the agent host, or do we need the Kerberos/JAAS path?
3. Should SQL Agent also move to `svc_rapidreconciler`, or stay on `SQLSERVERAGENT` (lower blast radius)?
4. Same account across all customer installs, or per-customer? (Affects the install bundle + provisioning doc.)

---

*Related memory: [[project_rr_service_account_consolidation]], [[reference_v8_dev_agent_topology]], [[project_install_docs_pending]].*
