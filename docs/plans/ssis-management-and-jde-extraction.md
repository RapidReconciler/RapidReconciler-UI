# SSIS package management + JDE extraction modernization

**Status:** future work / scoping. Captured 2026-06-11.
**Spans:** RapidReconciler-Valc (Deployment Center), RapidReconciler-Agent
(Data Services jar), RapidReconciler-SSIS (the packages), RapidReconciler-DB.

This plan has two layers. Workstreams **A** and **B** treat SSIS as-is and
build management/testing around it. Workstream **C** is the strategic
question — *is SSIS still the right extraction tool* — which, if pursued,
shrinks or retires A/B. Read C before committing heavily to A.

---

## 0. Today's state (grounded)

- **What SSIS does:** extracts JDE F-files into the RR SQL Server DB. The
  packages (`RapidReconciler-SSIS/*.dtsx`, ~6 MB each) are OLE DB source
  queries (`qryF0911`, `qryF43121`, `qryF41002`, plus F4111/F4311/F42119/
  F4102/F3106/F0011…) landing into RR staging/working tables (destination
  provider `MSOLEDBSQL`).
- **Three supported JDE source platforms — SQL Server, Oracle, AS/400
  (DB2 for i).** SSIS bridges all three via swappable OLE DB connection
  managers (`MSOLEDBSQL`/`SQLNCLI11`, `OraOLEDB`, `IBMDA400`). **This
  portability is the main reason SSIS is in the stack** — any replacement
  must speak all three sources.
- **Execution is already managed by the platform.** The agent fires the
  customer's SSIS load via `EXEC msdb.dbo.sp_start_job @job_name =
  <refreshJobName>` ([JobsController](../../../RapidReconciler-Agent/src/main/java/coral/rapidreconciler/client/services/controller/JobsController.java)).
  VALC owns `client_databases.refreshJobName` + the DB connection and
  syncs them to the agent (`ValcSettingsSync` → `rsystemvariables`). V8's
  "Import JDE" button and VALC's "Run Import" both call this.
- **VALC already models the surrounding pieces:** SSIS servers
  (`ClientServerEntity.ServerRole.SSIS`), the install bundle folds in the
  `*.dtsx` (`InstallBundleService`, `valc.install-bundle.sql-scripts-dir`).
- **Project vs package model is ambiguous in the repo:** a `.dtproj`
  (project deployment → `.ispac` → SSISDB catalog) *and* loose `.dtsx`
  run by a SQL Agent job (legacy package model). **Confirm which
  production uses before building A/B** — it determines the deploy
  mechanism and whether rich catalog telemetry is available.
- **Gaps:** no post-install package *update* path; no test harness;
  authoring still needs SSDT-BI (the hardest piece for a junior to own —
  an exit-strategy concern, see `user_role_exit_strategy`).

---

## Workstream A — Deploy/update SSIS packages from the Deployment Center

Mirrors the DB dacpac flow already built (DB Scripts tab + `DbDeployService`
+ pre-flight gate).

- **Catalog:** `file_versions.component` is already general — add `ssis`.
  Sync from a GitHub release of `RapidReconciler-SSIS` (the built `.ispac`),
  or manual upload, exactly like the DB tab.
- **Deploy mechanism (cleanest = pure T-SQL via the agent):**
  `catalog.deploy_project @folder_name, @project_name, @project_stream`
  takes the `.ispac` bytes as `varbinary`. The agent already runs SQL, so
  it deploys to SSISDB the same way it runs jobs — no extra tooling on the
  box. Alternative: `dtutil.exe` / `ISDeploymentWizard.exe` on the SSIS
  host (needs the binary present + the agent local to that box).
- **Re-point connection** at the target via
  `catalog.set_object_parameter_value` (VALC already owns the DB
  connection + job binding, so this is config it controls).
- **UI:** a new **SSIS tab** in the Deployment Center — `DeploymentController`
  is explicitly built for additional tabs. Same shape as DB Scripts:
  picker → pre-flight → deploy → `client_deploys` row.
- **Privileges:** catalog deploy needs `ssis_admin`/sysadmin — resolve from
  the server-row admin login, not least-priv `rruser` (the DB-gate pattern).
- **Build:** `.ispac` build needs the SSIS build target (devenv / the SSIS
  Projects extension), heavier than `.sqlproj`. The dev-box GitHub runner
  would need that tooling before a tag-triggered `.ispac` release works.
- **Fork:** catalog (`.ispac`) vs legacy package (`.dtsx` file/MSDB) deploy —
  confirm first (§0).

---

## Workstream B — Test harness (the edit stays in Visual Studio)

**Editing the package is VS/SSDT-BI only.** A `.dtsx` is a multi-MB visual
data-flow graph; there's no practical web-UI editor, and VALC shouldn't try
to be one. VALC orchestrates the test loop *around* the edit. The value is
that **RR's own reconciliation is the correctness oracle for ETL changes.**

Loop, entirely on the customer's box:

1. **Provision an isolated test DB** — restore/clone the customer DB to a
   `_TEST` copy (SqlPackage / backup-restore; reuse the practice-sandbox
   reset pattern, `reset-practice`). **Never prod** — SSIS loads
   truncate/replace staging.
2. **Deploy the candidate `.ispac`** to a test SSIS folder; re-point its
   connection at the test DB.
3. **Run it** — `catalog.start_execution` with parameters, or a test SQL
   Agent job; the agent already triggers loads.
4. **Read execution telemetry** — `catalog.executions` /
   `catalog.event_messages` / `catalog.execution_data_statistics`
   (rows in/out, warnings, errors, durations) → surface in VALC.
   *(Catalog/project model only; legacy package = SQL Agent job history +
   the package's own logging.)*
5. **Validate with RR's own reconciliation/integrity views** against the
   freshly loaded test DB — does inventory/GL tie? "Did this package change
   produce *correct* RR numbers?" answered by RR itself, against real
   customer data, with zero exfiltration.

**Guardrails (non-negotiable):**
- Copy, never prod.
- Customer data stays customer-side. For local VS iteration use a
  **sanitized/masked extract**, never live data (project data-hygiene rule).
- `ssis_admin`/sysadmin via the server-row admin creds.
- Catalog-model dependency for the rich telemetry (step 4).

---

## Workstream C — JDE extraction modernization ("is SSIS the right tool?")

The strategic fork. If pursued, it can shrink or retire A/B (you'd be
managing an agent extractor, already covered by the Services deploy flow +
the test harness pointed at the agent).

**Constraint:** any replacement must bridge all three source platforms
(SQL Server, Oracle, AS/400). That's exactly what SSIS gives you, so SSIS
isn't "slow" — it's a portable extractor. Evaluate replacements on
*operability/maintainability* (the exit-strategy axis) as much as throughput.

- **Lever 1 — incremental extraction (cheapest, transport-agnostic, do
  first).** If the packages reload a rolling window each run (the "35-day
  SSIS load window" in `jde-refresh-readiness-sql-agent.md` is the tell),
  switch to delta extraction by a **high-water mark** on JDE audit columns
  (Updated Date Julian + time; unique keys per F-file). This cuts data
  volume far more than changing the transport, and **keeps SSIS**. Highest
  ROI; lowest risk.

- **Lever 2 — move extraction into the Data Services agent (strategic,
  exit-strategy aligned).** The jar already talks to the RR SQL Server; add
  source connectivity via JDBC: MS JDBC (SQL Server), Oracle `ojdbc`, and
  **`jt400`** (pure-Java AS/400 / DB2-for-i — no OLE DB provider install on
  the customer box). Stream F-files in batches → bulk insert into RR SQL.
  This collapses **SSIS + SSDT-BI + SQL Agent** into the one component
  that's already versioned, deployed (jar swap, no reinstall —
  `feedback_data_services_changeable_broker_frozen`), and testable. One
  Java codebase with a per-platform source dialect; vastly more maintainable
  and teachable for a junior. Throughput is competitive for this volume;
  SSIS's mature-pipeline edge is marginal here.

- **Lever 3 — set-based ELT (SQL-source customers only).** Where JDE runs
  on SQL Server, a linked server / cross-DB `INSERT…SELECT` in sprocs beats
  SSIS outright and removes the layer. But it doesn't generalize to Oracle /
  AS400 (OLE DB providers + `OPENQUERY`, finicky for DB2/i) and pushes load
  onto the RR SQL box — so it's a per-platform optimization, **not** the
  unifying answer.

**Recommended order:** (1) incremental extraction now, keeping SSIS; then
(2) prototype the agent-JDBC extractor for one platform — SQL Server is
easiest to stand up, or AS/400 via `jt400` to prove the hardest bridge —
benchmark against the SSIS run, then decide whether to retire SSIS. Lever 3
only if a SQL-source customer needs a quick win.

---

## Open questions — confirm before building

- Catalog (project) vs legacy package deployment model in production (§0).
- Are JDE audit columns reliably populated for incremental, per platform?
- AS/400 access pattern (`jt400` connectivity, library list / `proddta`
  vs `testdta`, member access).
- Current load durations + volumes to benchmark a replacement against.
- Does the SSIS package do meaningful in-flight transformation, or is it
  mostly straight table copies? (Straight copies → Lever 2/3 is easy;
  heavy transforms → more to re-implement, or keep in RR sprocs as ELT.)

---

## Related

- **DB dacpac Deployment Center flow** — the deploy pattern A mirrors
  (`DbDeployService`, the DB Scripts tab + pre-flight gate).
- [`jde-refresh-readiness-sql-agent.md`](jde-refresh-readiness-sql-agent.md)
  — the run/refresh readiness work (SQL Agent state, `GRANT VIEW SERVER
  STATE`).
- [`services-memory-allocation-and-visibility.md`](services-memory-allocation-and-visibility.md),
  [`services-restart-endpoint.md`](services-restart-endpoint.md) — agent
  lifecycle the extractor would live alongside.
- Code: `JobsController` (run), `ClientServerEntity.ServerRole.SSIS`,
  `InstallBundleService` (install-time SSIS delivery), `ValcSettingsSync`
  (job-name/connection sync). Memory: `reference_v7_sql_deploy_via_agent`,
  `feedback_data_services_changeable_broker_frozen`, `user_role_exit_strategy`.
