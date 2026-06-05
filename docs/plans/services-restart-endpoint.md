# Plan: Self-serve Services restart endpoint (Phase B #1)

**Status:** **B1a SHIPPED** — VALC `AdminServicesController` live
(`POST /api/v1/admin/services/restart`, local stop/start, sticky port).
**B1b pending** — the remote-customer JMS `RestartInstance` command on the
Agent. The V8 frontend was already wired; no client change was needed.

**Source:** `RRV8/API.md` § "Restart Services instance"; the recurring
production symptom where the Services jar wedges under heavy concurrency and
a restart clears it. Memory: `reference_agent_bootstrap_protocol`,
`reference_sync_empty_array_terminates`, `project_mini_valc_provisioning_plan`.

---

## 1. The contract (already built on the V8 side)

- `home.html` Service-health card + the Reconciliation export-hang advisory
  both call `restartService()` →
  `POST api/v1/admin/services/restart` with body `{ "database": "<dbName>" }`,
  routed to VALC (the `api/v1/` prefix). Gated on the `rs` (restart-service)
  permission.
- Today VALC has no such route, so V8 shows an honest "restart control isn't
  wired in VALC yet" message on 404/405/501. **This plan makes it real.**
- **Never** `POST /shutdown` to a Services jar directly — that *stops* it and
  only the Agent re-spawns it. Restart must go through the orchestrator.

---

## 2. What already exists in VALC (reuse, don't reinvent)

The Services-jar lifecycle is fully built for the deploy flow:

- **`AgentLifecycleService`** — `start(descriptor)` / `stop(id)` /
  `forceStopByPort(port)` / `isRunning(id)`. One `Process` per agent id.
  - **Sticky port:** `start()` reuses the `client_databases.service_port`
    when free, so a restart keeps the same port → JWT `dbs[i].ip`, bookmarks,
    and caches don't churn. This is exactly the restart behavior we want.
  - Agent id for a per-DB Services jar = `client-<clientId>-db-<dbId>`
    (`ClientDatabaseController.synthAgentId`).
  - `readoptRunningAgents()` already re-adopts jars by PID after a VALC
    bounce, so stop/start resolve the right handle.
- **`ServicesDeployService.deploy()`** — already does the full
  **stop → (swap) → start → poll `/health` until healthy (30s)** sequence,
  with `stop()` falling back to `forceStopByPort()` when the process is
  unmanaged. **Restart = this minus the staging/jar-move steps.**
- **`ClientDatabaseController` start/stop** — per-row spawn/stop endpoints
  already resolve a `client_databases` row → `AgentDescriptor`.
- **`ClientDatabaseRepository.findByDbNameAndActiveTrue(name)`** — resolves a
  database name → the row (→ clientId, dbId, service_port, descriptor).
- **JMS path** (`DeployService` + `SyncPublisher`) — publishes to a remote
  customer Agent for the production topology.

---

## 3. The endpoint

`POST /api/v1/admin/services/restart`  (new `AdminServicesController`)

### Request
```
Authorization: Bearer <jwt>
Content-Type: application/json
{ "database": "RapidReconciler_Prod" }
```

### Behavior
1. **Authorize.** Require the `rs` permission on the caller's JWT (same
   per-(user,db) shape the other admin actions use). 403 if absent. Resolve
   the caller's client so the DB lookup can't cross tenants.
2. **Resolve target.** `database` → `client_databases` row (active, scoped to
   the caller's client) → agent id `client-<clientId>-db-<dbId>` + descriptor
   (jarPath / javaHome / sticky `service_port` / databaseName /
   clientDatabaseId). 404 if no such DB for this client (don't leak other
   tenants' DBs).
3. **Dispatch the restart** (one targeted instance — never the whole fleet):
   - **VALC-owned process (dev + same-box install):**
     `lifecycle.stop(agentId)`; if `NOT_TRACKED`,
     `forceStopByPort(service_port)`; then `lifecycle.start(descriptor)`.
     Sticky port reuse keeps the same `service_port`.
   - **Remote customer Agent (prod):** publish a **`RestartInstance` JMS
     command** (DB-scoped) to that client's Agent; the Agent stops +
     re-spawns that one DB's Services jar (§5). Use the existing
     `SyncPublisher` transport.
   - Selection between the two = whether VALC owns the `Process` handle
     (`lifecycle.isRunning`) vs the instance is remote — same branch
     `ServicesDeployService` already makes.
4. **Respond.** `200 { status: "RESTARTING", database, port }` as soon as the
   restart is **dispatched** (per API.md). The restart is async; V8 already
   polls connectivity and shows "reports should work again in ~30s."
   - *Option:* a `?wait=1` variant that polls `/health` (reusing
     `ServicesDeployService.waitForHealthy`) and returns `READY`/`TIMEOUT`.
     Default is dispatch-and-ack to keep the button snappy.
5. **Audit.** Write a lightweight restart-audit row (or reuse the
   `client_deploys` table with a `RESTART` marker) — who, which DB, when,
   outcome — so the Troubleshooting page can show restart history.

### Safety
- **Targeted, single instance.** Resolves exactly one `client_databases`
  row. Never emits an empty/blanket `SynchronizeMessage2` (the
  terminate-everything hazard — `reference_sync_empty_array_terminates`).
- Refuses privileged ports (`forceStopByPort` already guards `< 1024`).
- No direct `/shutdown` to the Services jar.

---

## 4. v359 grounding

The deploy flow VALC already implements ("stop-old / start-new") mirrors
v359's broker-driven Services lifecycle; restart is a strict subset (no jar
swap). Before building the **remote/prod JMS** path, confirm the legacy
broker's restart message shape with `javap` on `rr-valc-agent.jar`
(`docs/jar-mining.md`) so the new `RestartInstance` command matches the
Agent's existing lifecycle vocabulary rather than inventing a parallel one.
The **dev/local path needs no v359 work** — it's pure `AgentLifecycleService`.

---

## 5. Agent side (RapidReconciler-Agent, prod only)

For the production topology where the customer's Agent owns the Services
processes, the Agent needs a JMS command handler:

- **`RestartInstance { databaseName | clientDatabaseId }`** → stop the named
  DB's Services JVM (graceful, then force) → re-spawn it on the same sticky
  port → ack. Mirrors the Agent's existing spawn/sync handling.
- Spec it in `RapidReconciler-Agent/specs/` alongside the bootstrap +
  sync-message specs; keep the message envelope consistent with
  `SynchronizeMessage2` / `AgentUseQueue`.

The **dev path ships first** (VALC owns the process → `AgentLifecycleService`
stop/start), proving the endpoint + V8 round-trip end-to-end. The Agent JMS
command lands when the prod transport is wired (deferred to Coral per the
heartbeat-facts note).

---

## 6. Phasing

- **B1a (now):** `AdminServicesController` + `rs` gate + DB resolution +
  the **local** stop/start dispatch + dispatch-ack response + audit. Wire
  it; V8's existing button lights up. Restart VALC; verify the Home
  Service-health Restart + the Reconciliation advisory both get a 200 and
  the instance comes back on the same port.
- **B1b (with prod transport):** the `RestartInstance` JMS command on the
  Agent + the remote branch in the controller.

---

## 7. Open questions

- **Audit home:** new `service_restarts` table, or reuse `client_deploys`
  with a `RESTART` kind? (Lean: reuse — the Deployment/Troubleshooting pages
  already read it.)
- **Rate-limit / debounce:** should a second restart within N seconds be a
  no-op (the button already disables during the call, but two admins could
  both click)? Lean: a short per-DB cooldown.
- **`wait=1`** health-poll variant — build now or defer? (Lean: defer; the
  dispatch-ack + V8's connectivity poll is enough for the button.)
