# Fleet rollout orchestration — deploying a DB version to the whole customer base

**Status:** Design captured 2026-06-16. Not yet built. Prompted by the operational
question: *"45 active customers on servers worldwide; a new DB version ships; if each
deploy takes ~10 minutes, deploying one at a time never finishes."*

## The problem

VALC's Deployment Center deploys a DB release to **one database at a time**, via a
**blocking** `POST /valc/deployment/execute-sql` that runs SqlPackage Publish and only
returns when the publish completes. That's correct for a single DB but doesn't scale:

- **Serialized:** an operator clicking through 45 customers, 10 min each, is ~7.5 hours.
- **Fragile at scale:** each deploy holds an HTTP request open for the full publish;
  45 of those (across a WAN) means timeouts and a browser tab babysitting connections.
- **Unattended-unfriendly:** customers are in different timezones — there is no single
  window when deploying to all of them at the operator's convenience is acceptable.

## The key insight

Deploys are **independent** — each acts on its own database, and in production runs on
the customer's **own box via their agent**. So they should run **in parallel**: 45
concurrent deploys ≈ the slowest single deploy (~10–15 min wall-clock), not the sum.
The bottleneck is the *serialized, synchronous, manual* trigger model — not the per-DB
cost. The deliverable is a **rollout orchestrator** layered on top of the per-DB deploy
machinery that already exists.

## What already exists (build on, don't rebuild)

- **`client_deploys`** table — one row per (database, attempt): `client_id`,
  `client_database_id`, `file_version_id`, `status` (`INSTALLING`/`SUCCEEDED`/`FAILED`),
  `triggered_at`, `completed_at`, `failure_reason`, `target_version_string`. Already the
  per-DB system of record for a deploy's outcome.
- **`DbDeployService.publishDacpac`** — runs SqlPackage `/Action:Publish` against a
  target, writes the `client_deploys` row. The unit of work a rollout fans out over.
- **Executor modes** — `valc.deploy.executor-mode = local | agent`. `local` runs
  SqlPackage on the VALC host (dev); **`agent`** routes execution to the customer's
  on-box agent (the production posture, and what makes parallel fleet execution work —
  the work happens on 45 machines, not one).
- **Active-load gating** — `/valc/deployment/active-loads` + `_ddBusyClients` already
  tracks customers with a running SSIS load and blocks contending actions. The hook for
  "don't deploy to a box mid-load."
- **Live publish progress** (added 2026-06-16) — `DeployProgressService` +
  `GET /valc/deployment/deploy-progress` expose per-DB object/`N of TOTAL`. Per-DB deploy
  lock + Step-1 row spinners likewise. These plug straight into a fleet view.

## Target design

### 1. Async dispatch — decouple "trigger" from "watch" (foundational)
Split the blocking `execute-sql` into:
- **`POST .../deploys`** — validate + create the `client_deploys` row(s) in a `QUEUED`
  state and return the deploy id(s) **immediately**. The publish runs on a worker
  (background executor / the agent), flipping `QUEUED → INSTALLING → SUCCEEDED/FAILED`.
- **`GET .../deploys/status`** — poll deploy rows by client/db/rollout. The existing
  `deploy-progress` endpoint supplies the live object/counter per in-flight DB.

No held connections; the UI (or a script, or a schedule) fires deploys and watches the
table. The single-DB Deployment Center keeps working — it just polls instead of blocking.

### 2. Execute on the agent, in parallel
Confirm/finish the **agent-side** DB-deploy path so each customer's migration runs on
their box against their local SQL Server. Central `local`-mode SqlPackage to 45 remote
servers is a dev-only fallback (slow over WAN, single-host bottleneck). Fleet rollout
assumes `executor-mode=agent`.

### 3. Rollout orchestrator (the new layer)
A **rollout** = "bring this set of clients to version X," with:
- **Target set:** all active clients not already on X (skip `SUCCEEDED` at X; this makes
  rollouts **resumable** — re-running only picks up pending/failed).
- **Rings / canary:** ordered waves — e.g. `canary (1–2)` → gate → `batch (5)` → gate →
  `rest`. A gate is auto (canary must succeed + a soak period) or manual (operator
  approves the next ring). One bad release hits the canary, not all 45.
- **Concurrency cap:** N deploys in flight at once within a ring (e.g. 10), so we don't
  saturate or lose oversight. Slots free → next queued target starts.
- **Per-customer maintenance windows:** each client carries a timezone + allowed window;
  the orchestrator schedules each target's deploy inside *its* window. Turns a rollout
  into a scheduled, unattended job rather than 45 live clicks.
- **Health/load gating:** skip or defer a target whose box is mid-load (reuse
  `active-loads`) or unhealthy (no recent heartbeat); retry it later in the rollout.
- **Failure isolation + retry:** one `FAILED` target never blocks the others; transient
  failures auto-retry M times; genuinely-failed targets are surfaced for hands-on fix and
  the rollout continues.

### 4. Fleet status board
A Clients-grid view: each customer × {current DB version, target, deploy status, last
result, live object/counter while in-flight}. Operator approves the rollout, watches the
board, drills into the few failures. Rollup: "38 succeeded · 5 in progress · 2 failed."

## Data model

- **New `deploy_rollouts`** — `id`, `file_version_id`, `target_version_string`,
  `created_by`, `created_at`, `status` (`PLANNING`/`RUNNING`/`PAUSED`/`DONE`),
  `concurrency_cap`, `ring_plan` (JSON: ring → client list), `policy` (allow-data-loss,
  retry count, soak seconds).
- **`client_deploys` += `rollout_id`** (nullable FK) + a `QUEUED` status + a
  `scheduled_for` timestamp (the per-target maintenance-window slot). One rollout → many
  client_deploys rows; the rollout's progress is an aggregate query over them.
- **Per-client:** `timezone` + `maintenance_window` (already partly present via topology
  / client metadata — confirm and fill the gap).

## Endpoints (sketch)

- `POST /valc/deployment/rollouts` — create a rollout (version + target filter + rings +
  cap + policy). Returns rollout id.
- `POST /valc/deployment/rollouts/{id}/start` `/pause` `/resume` `/advance-ring`.
- `GET  /valc/deployment/rollouts/{id}` — aggregate status + per-target rows.
- `POST /valc/deployment/deploys` — async single/batch deploy (also the rollout's unit).
- `GET  /valc/deployment/deploys/status?...` + existing `deploy-progress`.

## Phasing

1. **Async dispatch** — `QUEUED` state + non-blocking trigger + status polling. (Unblocks
   everything; immediately useful even for a handful of manual deploys.)
2. **Agent-side execution** verified for DB deploys at fleet scale.
3. **Batch deploy with concurrency cap** — "deploy version X to these N clients, ≤10 at
   once," with failure isolation + retry. (Already a huge win over one-at-a-time.)
4. **Rings/canary + maintenance windows + scheduling** — full unattended rollout.
5. **Fleet board** — the operator surface (can grow alongside 3–4).

## Open questions

- **Where does the agent get the dacpac?** Pull from VALC on dispatch vs. pre-staged?
  (Affects WAN load when 45 agents fetch a 388 KB+ dacpac — small, likely fine to pull.)
- **Allow-data-loss at fleet scale:** per-release policy decided once, or per-customer
  pre-flight gate? A data-loss diff on one customer shouldn't silently apply to 45.
- **Rollback:** is forward-fix-only acceptable, or do we need a fleet rollback to the
  prior version? (SqlPackage publish isn't a clean reverse; likely forward-fix + restore.)
- **Soak / canary success criteria:** what signals "the canary is healthy" before
  advancing — deploy `SUCCEEDED` only, or also a post-deploy health/heartbeat check?

## Related
- This session's per-DB deploy lock + Step-1 spinners + `DeployProgressService` /
  `deploy-progress` (deployment.html, DbDeployService, ProcessRunner).
- `project_heartbeat_auto_fill_shipped` (agent heartbeat — health gating input).
- The SSIS config-per-customer plan (per-DB environment model — same per-customer fan-out
  shape).
