# Plan: Make mini-VALC's "Add Database -> spawn Services jar" flow production-ready

**Status:** Topology gate CLOSED 2026-05-31 (central + remote, mirroring V7).
**Phase 1 central-publish wiring COMPLETE 2026-05-31** -- see the "Phase 1a"
table below. Owner decision 2026-05-31: Phase 1 is considered DONE at the
central-publish wiring; the two remaining items (validate the real broker jar
over Artemis, then remove the in-process `AgentLifecycleService` spawn) are
DEFERRED to an explicit follow-up (see "Deferred Phase 1 tail" below), not a
blocker. The rest of the plan can proceed.

**Broker correction (2026-05-31):** the per-box broker is NOT something to
build. It already exists and ships as `rr-valc-agent.jar` inside the customer
`agent.exe` installer (lands at `C:\Program Files\Rapid Reconciler\` alongside
WinSW + bundled JRE + `keystore.rr.jks`). It is the unchanged V7 Agent
component. All Phase 1b "port/revive the reconciler" language below is
superseded: there is no broker code to write -- only central-side
publish wiring (done) plus standing up / connecting the existing jar in dev.

**Source of this plan:** session conversation on 2026-05-25 while building the
Companies tab on the Manage Client modal. Question raised: "I am going to try
and add rrv7-al to the server. When I add the database it will spawn a service
to the new agent, correct?" Answer was no -- the Create Database modal is a UI
stub today (`dashboard.html:2765-2771` toasts and closes), `ClientDatabaseController`
exists but isn't wired, and even if it were there's no trigger that publishes a
`SynchronizeMessage2` to the broker agent. Conversation then enumerated what
production-ready actually requires; this file captures that punch list so the
decision + work doesn't get re-derived next time.

**Related context:**

- `RapidReconciler-Valc/src/main/java/coral/rapidreconciler/valc/jms/SyncPublisher.java`
  -- the wire to the broker agent exists and uses the legacy `SynchronizeMessage2`
  protocol the agent already understands. The trigger that calls it is missing.
- `RapidReconciler-Valc/src/main/java/coral/rapidreconciler/valc/controller/ClientDatabaseController.java`
  -- `POST /api/v1/clients/{clientId}/databases` persists a `client_databases`
  row but the UI doesn't call it.
- `RapidReconciler-Agent/setup/run-test-agent.ps1` -- the test "agent" on :34537
  is actually a single Services jar (`client-services-*.jar`) launched directly
  via `java -jar`, hardcoded to `RapidReconciler_Dev` via `--spring.datasource.*`.
  It is NOT a broker that adopts new DBs by spawning children.
- Memory `reference_sync_empty_array_terminates` -- the agent's
  `SynchronizeService.synchronizeInstances` treats null/empty `instances[]` as
  "terminate every running Services jar." Catastrophic in production. Any caller
  of `SyncPublisher` MUST publish the full desired state, never a delta.

---

## Goal

Turn the Create Database action on the Manage Client modal into the production
path for provisioning a new per-DB Services jar: UI saves -> Postgres row lands
-> broker spawns Services jar against the new DB on an assigned port -> mini-
VALC tracks it for health, deploys, lifecycle.

Tested today by adding "rrv7-al" through mini-VALC and watching V7 + V8 clients
hit the spawned Services jar without manual `java -jar` steps.

---

## Architecture decisions -- RESOLVED 2026-05-31

These shaped every bucket below. Decided by examining the cloned V7 source
(`RapidReconciler-V7-Valc` = central `rr-valc`; `RapidReconciler-V7-Broker` =
per-box `rr-valc-agent`). V7 is the canonical spec -- VALC 2.0 mirrors its
topology rather than inventing one.

1. **Where does the broker live in production? -> CENTRAL + REMOTE.**
   V7 is a two-tier split and VALC 2.0 follows it:
   - **Central control plane** (`rr-valc`, hosted): dashboard, Postgres,
     desired-state builder, embedded Artemis JMS server, publishes the agent
     installer `.exe`s. VALC 2.0's existing dashboard + Postgres + `SyncPublisher`
     play this role.
   - **Per-box broker** (`rr-valc-agent`): a thin standalone Spring Boot jar on
     each customer's machine. Connects OUT over JMS/TLS, receives
     `SynchronizeMessage2`, and reconciles local Services-jar processes against
     the desired `InstanceState2[]` via `ProcessBuilder`. Holds NO control-plane
     state (local Derby only).

   Evidence (V7 source): broker connects out to central `valc.jms.ip` and sends
   `AgentConnection` every 30s (`AgentConnectionJms.java:49-92`); central mints a
   per-agent queue and replies `AgentUseQueue` (`AgentConnectionConsumer.java:70-92`
   -- this is what VALC 2.0's `AgentConnectionHandler.resolveClientId` already
   mirrors); central builds the desired state (`EntitiesSyncService.getSync2():154-215`)
   and the broker diffs + spawns/stops jars (`SynchronizeService.synchronizeInstances():90-151`,
   `ServicesInstanceManagerServiceImpl:115-136`).

   **Implication for VALC 2.0's current code:** today VALC 2.0 itself spawns
   Services jars via `AgentLifecycleService` / `ProcessBuilder` -- that collapses
   the control plane and the broker into one process, which is the *per-customer*
   shape V7 deliberately rejects. It's fine on the dev box but is NOT the
   production target. The local-spawn role must be split back out into a broker
   tier (see re-scoped Phase 1). The clientId+secret identity model that just
   shipped (schema V27) was built to ride exactly this JMS link.

2. **Does mini-VALC ship to customers, or stay dev-only? -> STAYS CENTRAL /
   HOSTED.** In the central + remote model the control plane is NOT installed on
   the customer box. What ships to the customer is the thin broker jar (the
   `rr-valc-agent` analog) plus its Services-jar children. VALC 2.0's dashboard +
   Postgres stay centrally hosted by Coral, one instance serving many customers
   -- which is why `users` is already a central table and `clients` /
   `client_databases` follow the same multi-tenant pattern.

3. **Single-Services-jar-per-DB stays the unit of isolation? -> YES.** V7
   confirms it: the broker spawns one Services jar per DB on an auto-assigned
   port (`ServicesInstanceManagerServiceImpl`), JWT scope is per-DB, deploy
   lifecycle is per-jar. Keep this.

---

## Phase 1 -- Wire the end-to-end flow through the broker tier

Goal: clicking Save on Create Database makes the **central** VALC publish a
desired-state sync, and the **per-box broker** spawns the Services jar in
response. Nothing else in this plan matters until this works.

**This is the load-bearing re-scope from the topology decision.** Today VALC 2.0
spawns jars in-process via `AgentLifecycleService` / `ProcessBuilder`. That is
the per-customer (collapsed) shape. Phase 1 splits it: central VALC publishes
`SynchronizeMessage2` over JMS and never touches `ProcessBuilder`; a broker tier
(the `rr-valc-agent` analog) is the only thing that spawns local processes.

**Phase 1a -- central publishes desired state instead of spawning locally
(IMPLEMENTED 2026-05-31):**

| Today | Production-ready | Status |
|---|---|---|
| Create Database modal save = stub toast | Wires to `POST /api/v1/clients/{id}/databases` | DONE -- `dashboard.html:5362` discovers DBs, picks one, POSTs create, reloads the grid |
| Postgres row sits there inert | `ClientDatabaseController.create()` persists + calls `DeployService.publishDesiredState(clientId)` | DONE |
| `AgentLifecycleService.start()` spawns the jar in-process (ProcessBuilder) | That path is to be REMOVED from central VALC; the broker jar (1b) is the only spawner | NOT YET -- in-process spawn still present; removal is the Phase 1 exit criterion |
| No port assignment | Port is assigned by the **broker** at spawn time (V7 model: `SocketUtils.findAvailableTcpPorts`), reported back to central, persisted to `client_databases.service_port` | pending broker-tier validation |
| `instances[]` payload not built | `DesiredStateBuilder.buildDesiredState(clientId)` reads ALL active `client_databases` rows and emits the full array. Returns `Optional.empty()` (abort publish) when DBs exist but no Services artifact is imported; returns an empty array only when the client genuinely has zero active DBs (correct terminate-all). Pins each instance to the latest imported `services` `file_versions` row. | DONE |
| Receiver queue lookup ad hoc | `agent_connections.receiver_queue` looked up per client at publish time via `findFirstByClientIdOrderByLastSeenAtDesc`; no connected agent = logged + skipped (state re-publishes on reconnect) | DONE |
| Datasource creds in cleartext column | `db_password_encrypted` actually encrypts; key in a separate store; decrypted only in-process when building `InstanceState2` | NOT YET (Phase 2) |

Also fixed in this pass: `DeployService.trigger` previously published a
single-instance array, which the broker's terminate-not-in-list would treat as
"terminate every other running jar." It now routes through
`DesiredStateBuilder` and publishes the full desired state.

## Deferred Phase 1 tail (DEFERRED 2026-05-31 by owner)

Phase 1 is done at the central-publish wiring above. These two items remain but
are explicitly deferred -- they're sequenced (validation gates removal), and the
only installed broker today is a LIVE WinSW service that must not be repointed.

**1. Validate the real broker jar over Artemis.** The per-box broker already
exists as `rr-valc-agent.jar` (the unchanged V7 Agent component) shipping in the
customer `agent.exe` installer -- nothing to build. Validation = run it against
VALC 2.0's embedded Artemis and confirm it spawns a Services jar in response to
the `SynchronizeMessage2` VALC 2.0 now publishes.

Broker config keys (mined from the V7 source
`RapidReconciler-V7-Broker/src/main/resources/application.properties`):
- `valc.jms.queue=rr-agent-connection` (matches VALC 2.0's `EmbeddedBrokerConfig`)
- `valc.jms.ip` / `valc.jms.port` -- repoint to `127.0.0.1` / `5445`
- `valc.jms.keystore.path` / `valc.jms.keystore.password=coralsoftware`
  (the install dir's `keystore.rr.jks` matches VALC 2.0's)
- `agent.port.min=32145` / `agent.port.max=49152` (same V7-parity range VALC 2.0
  already mirrors)
- Derby at `jdbc:derby:db;create=true`

**Do NOT repoint the running WinSW service** (`C:\Program Files\Rapid Reconciler\`,
"Rapid Reconciler 7 Agent") -- it's live (daily logs, recent customer
RollForward) and pointed at Azure VALC. Run an ISOLATED copy (separate dir +
Derby + foreground, config overrides to localhost:5445) so the live broker is
untouched. Note: the installed jar is the V7 broker; its `AgentConnection` is
identified by external IP (`valc.checkip`), so it exercises VALC 2.0's
IP-fallback identity path, not clientId+secret (that's a VALC 2.0 broker
addition). Still a valid spawn-flow validation.

**2. Remove central VALC's in-process spawn (gated on #1).** Once the real
path is validated, delete the `AgentLifecycleService` / `ProcessBuilder`
Services-jar spawn so the control plane never supervises processes (the Phase 1
exit criterion: zero Services-jar-spawn `ProcessBuilder` in central VALC). Blast
radius to plan for: `ClientDatabaseController.start/stop`, `ServicesDeployService`
(the HTTP-push deploy stop->swap->start is the same collapsed dev shape -- in
central+remote, deploys ride `SynchronizeMessage2`'s fileId/sha1 and the broker
self-updates), and the dashboard's `valcManaged`/PID/uptime status (which comes
from heartbeats in central+remote, not local PIDs). The dev static-server
ProcessBuilders in `DashboardController` and the `gh auth token` shell-out in
`GitHubReleaseService` are unrelated dev/ops tooling and stay.

**Start/Stop button semantics -- grounded in V7 (investigated 2026-05-31).**
The V7 broker's full inbound message vocabulary (`ValcMessageListener`) for
instance lifecycle is exactly: `SynchronizeMessage` / `SynchronizeMessage2`
(desired-state reconcile) + `RestartDatabaseServiceMessage`. There is NO
standalone start-instance or stop-instance message. An instance runs iff it is
in the desired state. `RestartDatabaseServiceMessage` (`ValcInbound:76-78`) just
calls `servicesInstanceManagerService.stop(...)` and relies on the broker's
monitor (`agent.enable-monitor=true`) to respawn it because the instance is
still in desired state. So VALC 2.0's per-row buttons map to V7 as:
- **Stop** (permanent) = deactivate the row + republish -> broker terminates via
  terminate-not-in-list. (Already wired: `delete` republishes.)
- **Start** = activate the row + republish -> broker spawns.
- **Restart** = publish `RestartDatabaseServiceMessage(databaseName)` -> broker
  stops it -> monitor respawns. (Add this message to `SyncPublisher` if VALC 2.0
  wants restart parity; it's the only targeted per-instance op V7 has.)

Exit criteria (unchanged): add a database via the modal -> central publishes the
full desired state -> the real `rr-valc-agent.jar` spawns a Services jar on its
self-assigned port answering `/health` green within 30s -> the port is reported
back and the row shows a tracked status in VALC 2.0's Clients grid. Central
VALC's codebase contains zero Services-jar-spawn `ProcessBuilder` calls.

## Phase 2 -- Security hardening

- **JWT verification ON.** Test agent boots with
  `agent.jwt.skip-verification=true`. Production: load
  `setup/valc-public-key.pem`, fail-closed on missing key, fail-closed on bad
  signature. Per-DB Services jars share the verification config.
- **TLS on JMS broker.** Truststore + keystore plumbing exists for the test
  broker but the production pair needs Coral-CA-signed certs, not self-signed.
- **License enforcement.** Broker refuses to spawn a Services jar for an
  expired `clients.license_end_date`. Spawned jar refuses traffic past expiry.
  Today both are ignored.
- **DB credential rotation flow.** "Rotate password" re-encrypts + restarts
  only the affected Services jar, doesn't disturb sibling jars on the same
  client.

## Phase 3 -- Lifecycle ops on the spawned jars

- **Crash recovery.** Broker supervises children with auto-restart + backoff;
  persistent failure escalates to mini-VALC + pages.
- **Graceful drain on shutdown.** Services jar finishes in-flight
  `/inventory/transactions` calls before exiting.
- **Re-sync on mini-VALC restart.** On boot, mini-VALC publishes the current
  `client_databases` desired state so the broker rebuilds. Otherwise the empty-
  array gotcha terminates everything.
- **Per-DB log file with rotation.** Today the test agent logs to stdout.
  Production: `logs/services-<uuid>.log` with size + age rotation via
  log4j2 / logback config.
- **Deploy parity.** The HTTP-push deploy already handles upgrades to a single
  Services jar; verify it works against jars the broker spawned vs. ones
  started by `run-test-agent.ps1` (different process-tracking model).

## Phase 4 -- Schema + data

- **Schema-version gate on Services jar boot.** Read the
  `SQLSourceControl Database Revision` extended property on connect;
  fail-fast if the DB is older than the jar expects. Surface the version
  mismatch to mini-VALC.
- **Connection pool sizing per DB.** Today defaults; production needs limits
  matched to expected concurrency (Hikari `maximum-pool-size` per Services
  jar).

## Phase 5 -- Client-side multi-DB (mostly already there)

- V8's `config.js` routes by `activeDb.ip`; user-menu DB switcher already
  re-bases. **Production unknown**: the JWT issuer (VALC login) needs to
  populate `dbs[]` with `{ip, port}` per the customer's actual spawned-jar
  set, dynamically -- not a hardcoded list.
- CORS allow-origin must cover every per-DB port the customer's V8/V7 client
  will hit, OR the broker fronts all DBs on one port with path-based routing
  (architectural sub-decision worth raising in #1 above).

## Phase 6 -- Observability + alerting

- Structured logs from each Services jar shipped to a central sink (Datadog,
  ELK, whatever Coral runs).
- Per-jar health metrics on the mini-VALC dashboard (latency p95, error rate),
  not just a green/red dot.
- Page-out on `/health` red > 60s, system-status red > 5 minutes.

## Phase 7 -- Testing + rollout

- Integration test: drive the full `add-DB -> row lands -> sync sent -> jar
  spawns -> /health green -> request routes correctly -> row deleted -> jar
  terminates` loop in CI.
- Empty-array regression test: assert no `SyncPublisher` caller can publish an
  empty `instances[]` without an explicit override flag.
- Migration plan from v359 to the new agent surface -- per-customer cutover
  with rollback (legacy SPA keeps working on v359 until V8 is ready for that
  customer).

---

## Suggested sequencing

Phase 1 first -- nothing else matters until the end-to-end flow runs on the dev
box. Then 2 (security), then 3 (lifecycle), then 6 (observability). Phase 4/5/7
layer on as the stack matures. The topology gate is now CLOSED (central +
remote, mirroring V7), so the hardening phases have a fixed target: all
process-supervision, credential-decryption, and license-enforcement work lands
in the broker tier, never in central VALC.

---

## What this plan deliberately does NOT cover

- Any broker-tier code. The broker is the unchanged V7 `rr-valc-agent.jar`
  shipped in `agent.exe`; this plan does not build, port, or modify it. Phase 1b
  is connection/validation only. Its crash supervision, drain, and log rotation
  (Phase 3) are features the existing jar already provides; this plan only
  verifies them against VALC 2.0's published desired state.
- The V7 -> V8 client cutover. Independent migration; the new agent's endpoint
  surface already covers both apps for Inventory + System Status, with known
  gaps in Roll Forward / PO Receipts / In Transit that V8 hasn't visited yet.
- The Postgres-side multi-tenancy decision is now SETTLED by decision #2:
  central + remote means one hosted VALC 2.0 serving many customers, so
  `clients` and `client_databases` stay central-multi-tenant alongside `users`,
  matching today's shape.
