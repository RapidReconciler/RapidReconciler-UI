# JDE refresh readiness — surface SQL Agent down

_Scoped 2026-06-10. From the "Andy the Admin" review: clicking Import JDE
returned a bare "502", and the Data Management status would still read green
even though a refresh can't run when SQL Server Agent is stopped._

## The problem

Import JDE → `POST jobs/refresh/start` → agent `JobsController` → `EXEC
msdb.dbo.sp_start_job`. If **SQL Server Agent is stopped**, `sp_start_job`
fails with error **22022** ("SQLServerAgent is not currently running"), which
the agent returns as **HTTP 502** with a JSON `{reason}`. Two gaps:

1. V8 showed the bare status ("502"), not the reason — meaningless to an admin.
2. Nothing makes **Data Management** go non-green proactively. The `/poll`
   job-status view (`v_diagnostic5_job_status`) only reads job *run history* —
   it'd show a stale "Successful" while the Agent service is actually down.

## Permission constraint (decided 2026-06-10)

Detecting the SQL Agent *service* state needs `sys.dm_server_services`, which
requires **VIEW SERVER STATE**. On dev it worked only because `rruser` is
**sysadmin** there; production `rruser` is least-privilege (it gets
`sqlagentoperatorrole` for `sp_start_job`, but **not** VIEW SERVER STATE).

**Decision: grant it at install** — a scoped, read-only server grant, not
sysadmin. Then the proactive check is reliable everywhere.

## Done (2026-06-10)

- **Install grant** — `GRANT VIEW SERVER STATE TO [rruser]` added to
  `RapidReconciler-DB/Installation Files/3 - RapidReconciler User Creation
  Script.sql` (right after the login is created). Dev `rruser` is already
  sysadmin, so no dev apply needed.
- **502 → real reason** — `rrFetch` now reads the agent's JSON `{reason}` on a
  non-2xx and includes it in the thrown error (helps every call, not just this
  one). The Import JDE handler turns the Agent-down case into a plain message:
  *"SQL Server Agent is stopped on the database server. Ask IT to start the SQL
  Server Agent service, then try again."*

## Next (needs an agent rebuild)

- **Agent `sql.agent_running` probe** — `SELECT status_desc FROM
  sys.dm_server_services WHERE servicename LIKE N'SQL Server Agent%'`. Add to
  the comms-check battery (`CommsCheckController` / `InstallDiagnosticsCollector`,
  label "SQL Server Agent running") **and** expose a `sqlAgentRunning` boolean
  V8 can read for the Home dot. Candidate: add to `PollController.readCurrent()`
  (cache ~30s so the long-poll loop doesn't re-query every cycle), or a small
  `GET /jobs/refresh/ready`.
- **V8 Data Management dot** — when `sqlAgentRunning` is false, force the panel
  amber/red ("Data refresh unavailable — SQL Server Agent is stopped") and
  disable the Import button with that tooltip, instead of letting a click 502.
- Rebuild the Services jar + relaunch — **preserve each DB's `service_port`**
  (Dev = 39504, the token's port; the launcher default 34537 is NOT it — this
  bit once already).
