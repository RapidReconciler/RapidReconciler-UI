# SSIS load orchestration — hardening the run / stop / observe path

**Status:** DESIGN — DECISION PENDING (2026-06-23). Spun out of a live incident
this session (a Dev full load that couldn't be stopped from the UI, plus CPU
swamp). Builds on the **settled** credential model in
[`ssis-deploy-service-account.md`](ssis-deploy-service-account.md) (Option A =
SQL Agent T-SQL job step; §7a durable standard-job + named steps) and the
on-box executor seam in [`phase3-agent-executor.md`](phase3-agent-executor.md).
This doc does **not** revisit *who runs the catalog T-SQL* — that's decided. It
hardens *how a load is started, stopped, observed, and gated* once you account
for a real customer box: a DBA owns SQL Server, a scheduled run may already be
in flight, and a junior must not be able to nuke a live client.

---

## 1. The incident (what we're hardening against)

Clicking **Load Data** on Dev, then trying to stop it:

- **Stop did nothing** on the first clicks; it took ~3 tries and a long wait,
  and the DB-row START button never updated. The load only stopped when I
  hand-issued `catalog.stop_operation` through a **separate one-shot** SQL Agent
  job.
- The box was simultaneously **CPU-swamped** (idle JVM fleet + the load), so
  every wasted retry and every 180s-blocking request made it worse.

Neither symptom was an auth failure (the stop path already rides the
Windows-principal job). They were **orchestration** failures.

---

## 2. What we now know (settled facts these constraints rest on)

1. **Production is outbound-only.** VALC cannot reach the customer SQL Server.
   VALC *generates* T-SQL; the **on-box agent executes it** (dev = loopback
   HTTP `/admin/deploy/sql`; prod = agent poll-pull). See
   `DeployExecutionController` + `phase3-agent-executor.md`.
2. **Catalog mutations reject SQL auth (Msg 27123).** `rruser` is even an
   `ssis_admin` and still can't call `create_execution` / `stop_operation` — it's
   the auth *scheme*. SQL 2017 floor ⇒ no Entra ⇒ a **classic Windows principal**
   must run every catalog mutation.
3. **The agent is also `rruser` (SQL auth).** So it can't call the catalog
   directly either. The **SQL Agent job is the unavoidable Windows-principal
   bridge**: `rruser` may `sp_start_job` (msdb role), and the job step runs as
   the Agent service account → Msg 27123 satisfied. (`JobsController` already
   fires the refresh job this way.)
4. **Today's model (§7a):** one **durable standard job per DB** carries every
   catalog op as a **named step** (`Deploy project`, `Bootstrap`, `Full load`,
   `Steady refresh`, `Stop load`, `Run A to B`, `Run B to C`, `Enable job`).
   `runCatalogStep` rewrites the step body, `sp_start_job @step_name` runs just
   that step, then it **polls `sysjobhistory` synchronously for up to 180s.**
   Chosen for DBA-auditability (full msdb history, nothing transient).

**The gap:** §7a optimized for *audit*, not *concurrency or interruption*. One
shared job + `sp_start_job` being **non-reentrant** + a **synchronous 180s poll**
is the whole bug surface.

---

## 3. Root cause (mapped to the symptoms)

| Symptom | Cause |
|---|---|
| Stop "did nothing", needed 3 clicks | Stop is a named step on the **same job** that's busy running the load. `sp_start_job` on a running job is **refused** ("job already running") — silently. |
| The one-shot job *did* stop it | A **separate** job has zero contention — proof the contention, not auth, is the problem. |
| Requests hung / piled up | `runCatalogStep` **blocks the HTTP thread up to 180s** polling `sysjobhistory`. Each Stop click ties up a thread on an already-swamped box; a refusal surfaces as an opaque timeout, not "job busy." |
| "Unstoppable from the UI" | VALC only *observes* the package (catalog polls); it can't kill `ISServerExec` (SQL-Server-owned; we hit access-denied). The **only** kill switch is `stop_operation` through the contended job — no fallback. |
| (latent) collisions with the nightly run | Nothing leases the DB. A 02:00 scheduled refresh, a DBA-triggered run, or a peer's click can be mid-flight when support clicks Load — and collide. |

---

## 4. The four production realities → requirements

**R1 — A run may already be in progress (scheduled / DBA / peer).** Normal, not
an edge case. ⇒ Every start/stop must first **detect** any in-flight execution
(catalog) *and* job activity (`sysjobactivity`), and **defer with a clear
message** — never collide. A per-DB **operation lease** serializes VALC-initiated
work and respects externally-initiated work.

**R2 — The DBA owns SQL Server.** The Agent job, its schedule, and permissions
are the DBA's. ⇒ VALC/agent are **least-privilege and read-mostly** against the
job: observe state, adapt, surface plainly when expectations break (renamed,
disabled, perms tightened). **Never silently rewrite the customer's *scheduled*
job to issue a control command.** Keep control ops off the scheduled job (see
R-design below). One clearly-named, DBA-reviewable job + full msdb history (the
§7a property) is retained.

**R3 — Stop must work while the load runs.** ⇒ Stop/kill **cannot** be a step on
the job currently running the load. It needs a **contention-free path** and must
be **async** (ack immediately; converge via the progress poll), with an
**escalation/kill** backstop.

**R4 — Junior clear/load on a live client.** ⇒ Gate by **client state × role**:
- **Clear** (truncates `F*`) is a provisioning/dev tool — **hidden/locked once
  `handed_off_at` is set** (live client).
- **Full Load Data** is the *one-time initial* step; after go-live the steady
  nightly refresh keeps data current. Re-running it ⇒ **elevation + explicit
  confirmation**, not a junior default.
- Juniors get the **steady refresh + read/observe**; destructive/heavy ops gate
  on live-state + an elevated role claim (`perms`/`rn` already in the token).

---

## 5. Target design

Keep everything settled (Option A bridge, durable named steps for audit, on-box
executor). Change the orchestration:

**5.1 Separate "scheduled refresh" from "control ops."**
- The **scheduled nightly refresh** stays the one DBA-owned job with its
  schedule — read-mostly; VALC never rewrites it to send a command.
- **Ad-hoc control** (start full/bootstrap, **stop**, kill) runs on a
  **dedicated control path** that never contends with a running load:
  - **Stop/kill → a transient one-shot job** (create → `sp_start_job` → it runs
    `stop_operation` / the kill → self-deletes). No secrets, so transient is
    clean (the §7a secret-hygiene carve-out already blesses transient jobs); the
    op still lands in `catalog.operations`. This is exactly what worked by hand.
  - **Start (full/bootstrap)** can keep its durable named step (it only runs when
    nothing else is) *guarded by the lease* (5.2).

**5.2 Per-DB operation lease + in-progress detection.**
- Before any start: check `catalog.executions` for a running/pending execution
  **and** `sysjobactivity` for a live run of the standard job. If either is
  active → refuse with "a load is already running (started <when>, by
  <scheduled/operator>) — stop it or wait," never `sp_start_job` into a busy job.
- A lightweight app-tier lock per `client_database` serializes VALC-initiated
  ops so two clicks can't race the same job.

**5.3 Async stop, no HTTP block.**
- `ssis-stop` validates a running execution, fires the one-shot stop, returns
  **immediately** ("Stop requested"); the existing progress poll observes
  Stopping→Canceled. Keep the synchronous 180s wait only for *deploy* (one-shot,
  user-waits). Surface job-busy explicitly ("retrying / busy"), never a silent
  no-op.

**5.4 Kill escalation owned by the on-box agent.**
- If `stop_operation` hasn't reached Canceled within N seconds, the **on-box
  agent** (Windows identity, *on the box*) force-terminates the `ISServerExec`
  execution — the backstop VALC-remote can never have. A load is then **always**
  stoppable without hand-rolling a job.

**5.5 Role + client-state gating (R4).**
- Clear + full-Load are **install-phase** ops; a live client's cadence is the
  steady refresh only. So: pre-handoff (installing) they're the normal flow;
  **post-handoff they're a deliberate re-provision** — allowed but **behind an
  elevated role + confirmation** (decision §7.1), never a junior default.
- Server-enforced (not just UI-hidden): Clear and full-Load endpoints check the
  live-DB signal + role; the UI reflects it (Clear hidden on a live client; full
  Load behind a confirm + elevated role). Juniors keep steady-refresh + observe.
- **The live signal = `clients.handed_off_at`, with one convention.** It's
  client-level, so it only works if **dev/test clients stay un-handed-off** — a
  handed-off client then means a real live customer owning its real DB. (Acme's
  handoff was undone 2026-06-23 — it was a feature-test — so no test client is
  handed off.) If test + prod DBs ever coexist under one client, switch to a
  **per-DB** flag (`client_databases.category` or a db-row column). See §6.3.

**5.7 Standard-job shape — supersedes §7a "durable step per op" (decided 2026-06-23).**
The per-DB standard job should be **only the scheduled steady refresh**
(`Run A→B → Run B→C` + the daily Refresh schedule) — that is the entire
production-visible job. Every other catalog op (Deploy project, Bootstrap,
Full load, Steady refresh, Toggle Refresh schedule, Enable job, Set up
schedules, Stop) is **install/maintenance-only** and runs as a **transient
one-shot** (`runCatalogJob`, create→run→self-delete), audited via
`catalog.operations`. This reverses §7a's all-durable-named-steps choice (which
optimized for msdb history) in favor of a clean, DBA-legible production job;
the audit lives in the catalog either way.
- **Done 2026-06-23 (dev box):** deleted the cruft jobs (`_rr_bindtest_job`,
  `_rr_pwdtest_job`, `RR_SSIS_DeployPatched_s33`) + the now-dead `Stop load`
  step on all three standard jobs (stop is transient now). The other on-demand
  steps remain until the refactor below, because `runCatalogStep` re-adds them.
- **Refactor TODO:** route the remaining call sites through `runCatalogJob`
  instead of `runCatalogStep` — `DbDeployService.deployProjectToCatalog`
  ("Deploy project") + "Enable job"; `SsisDeployService.startRun` (the run-mode
  step) + the schedule-toggle / set-up-schedules sites. Keep `Run A→B`/`Run B→C`
  + the schedule durable. **Verify the Step-7 schedule-creation flow first** so
  the nightly isn't disturbed. Then the standard jobs collapse to refresh-only
  across the fleet, and a re-provision's full load is a transient op (or the
  documented separate `<db>_InitialLoad` job), not a standing step.

**5.6 Posture toward the box (R2).**
- Readiness probe asserts the Option-A prerequisites (Agent account `ssis_admin`,
  Agent running, catalog exists) and reports drift instead of fighting it.
- Everything VALC creates is **clearly named + DBA-reviewable**; transient
  control jobs are short-lived and labeled (`rr_ctl_stop_<execId>`).

---

## 6. Migration path — status (2026-06-23 one-pass)

1. **Stop → transient one-shot job — DONE.** `stopRun` now dispatches via
   `runCatalogJob` (its own `_rr_ssis_<db>_stop` job), not a step on the busy
   standard job — kills the contention. Plus the client poll-fix (sticky
   "Stopping…"). The synchronous-vs-async refinement (5.3) is moot in practice:
   `stop_operation` returns fast, so the transient stop job completes quickly.
2. **Standard job = refresh-only + lease — DONE** (folds in §5.7 + §5.2). All six
   on-demand `runCatalogStep` sites (Deploy project, run-mode load, Set/Toggle
   Refresh, Enable job, Set up schedules) now run as **transient** `runCatalogJob`;
   `ensureScheduleJobs` **prunes** the standard job to `Run A→B / Run B→C` +
   schedule and self-heals. Live Dev/NA/TR jobs pruned to refresh-only. `startRun`
   takes a **per-DB lease** (`tryLock`) so two requests can't race two starts; the
   in-flight catalog guard already detects scheduled/DBA/peer runs.
3. **State gating signal — RESOLVED 2026-06-23; role layer still pending.** The
   blocker was that `clients.handed_off_at` is **client-level**, and the test DBs
   (`_Dev`/`_NA`/`_TR`) sat under a handed-off client (Acme) — so gating on it
   would have blocked the owner's own dev clear/load. **Fix:** Acme's handoff was
   undone (it was a feature-test, not a real go-live); **no client is handed-off
   on the dev box now.** With the convention "dev/test clients stay un-handed-off,"
   client-level `handed_off_at` is a usable "live" signal — a real customer is
   handed off and owns its real DB; the gate correctly skips test clients. (A
   per-DB flag stays the cleaner long-term option but isn't required.) **Still
   pending:** the *role* layer — only an elevated user may confirm a live-client
   re-provision — which needs auth on VALC's deployment endpoints (`permitAll`
   today). The pure state+confirm gate is now implementable without breaking dev;
   the role restriction layers on with deployment-endpoint auth.
4. **Kill escalation via the agent (5.4) — BLOCKED, deferred.** Force-terminating
   `ISServerExec` needs the on-box agent's terminate op (VALC/SQL can't kill it —
   stop_operation is the only SQL lever). Lands with the Phase-3 executor +
   `DeployExecutionController`'s terminate counterpart.
5. **(Phase 3/B, longer term)** the dedicated RR Windows service account
   (`ssis-deploy-service-account.md` Option B) — orthogonal to 1–4.

---

## 7. Decisions (RESOLVED 2026-06-23)

**Framing the owner set:** Clear + full-load + the ad-hoc control ops are
**installation-phase** activities. A live (handed-off) client's only cadence is
the scheduled nightly **steady refresh** — you don't clear/full-load a live
client except as a deliberate **re-provision**. This one fact resolves all three
below and simplifies the model: no steady-state control-job churn on a DBA's
live server, and killing a load is low-stakes because there's rarely a live one.

1. **Re-running a full load on a live client → ALLOW behind elevation.** Not
   blocked outright — it's a deliberate re-provision gated by an elevated role +
   confirmation (R4 / §5.5). Routine junior support post-handoff never reaches it
   (steady refresh only).
2. **Kill means kill.** The agent-owned escalation (§5.4) **force-terminates** the
   `ISServerExec` execution — no stop-request-only carve-out, including on a live
   re-provision load. Low-risk precisely because loads are install-time and you
   reload anyway. (N = how long to wait for a cooperative stop before killing; a
   tunable, but the kill itself is committed.)
3. **Transient one-shot control jobs** (stop/kill): create → run → self-delete,
   zero standing residue. Acceptable *specifically because* the control ops are
   install-phase — a DBA watching a live server sees no job flicker, so the §7a
   "durable steps for audit" concern doesn't apply here (the op still lands in
   `catalog.operations`).

Everything else follows from the settled model + R1–R4.

---

## 8. References

- [`ssis-deploy-service-account.md`](ssis-deploy-service-account.md) — the
  Windows-principal / Option A decision + §7a durable-step model (the base).
- [`phase3-agent-executor.md`](phase3-agent-executor.md) — the on-box executor
  seam (VALC generates, agent executes; loopback dev / poll-pull prod).
- [`ssis-management-and-jde-extraction.md`](ssis-management-and-jde-extraction.md)
  — the broader SSIS management + extraction plan.
- Code today: VALC `SsisDeployService.startRun` / `stopRun`,
  `DbDeployService.runCatalogStep` (the shared-job + 180s poll);
  `DeploymentController` `/valc/deployment/ssis-run` · `ssis-stop` ·
  `ssis-last-execution`. Agent `JobsController` (`sp_start_job` refresh),
  `DeployExecutionController` (`/admin/deploy/sql` on-box executor).
