# Plan: Make mini-VALC's "Add Database -> spawn Services jar" flow production-ready

**Status:** Spec only. Not yet executed. Pick up in a fresh session when ready.

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

## Architecture decisions that must be made first

These shape every bucket below. Pick before building.

1. **Where does the broker live in production?**
   - *Per-customer*: a fork of mini-VALC (or hardened `rr-valc-agent.jar`) runs
     on the customer's box, spawns Services jars locally.
   - *Central + remote*: Coral hosts mini-VALC; a broker agent on each customer
     box pulls sync messages over the existing JMS link.
2. **Does mini-VALC ship to customers, or stay dev-only?** Today it's a dev
   control plane. Production-ready means deciding whether to harden it for
   customer install, or graft its UI onto the legacy VALC SPA and keep mini-VALC
   dev-only.
3. **Single-Services-jar-per-DB stays the unit of isolation?** Implicit yes --
   port assignment, JWT scope, deploy lifecycle all assume one DB per process.
   Confirm before committing.

---

## Phase 1 -- Wire the end-to-end flow on the dev box

Goal: clicking Save on Create Database actually spawns a Services jar. Nothing
else in this plan matters until this works.

| Today | Production-ready |
|---|---|
| Create Database modal save = stub toast | Wires to `POST /api/v1/clients/{id}/databases` |
| Postgres row sits there inert | `ClientDatabaseService.create()` persists + fires `SyncPublisher.sendSynchronize` |
| No port assignment | Allocator picks a free port in `agent.port.min..max` and writes to `client_databases.service_port` before publishing |
| `instances[]` payload not built | `DesiredStateBuilder` reads ALL active `client_databases` rows for the client and emits the full array (never empty -- empty terminates everything per the gotcha memory) |
| Receiver queue lookup ad hoc | `agent_connections.receiver_queue` looked up per client at sync time |
| Datasource creds in cleartext column | `db_password_encrypted` actually encrypts; key in a separate store; decrypted only in-process when building `InstanceState2` |

Exit criteria: add a new database via the modal, see a Services jar on the
assigned port answering `/health` green within 30s, see it in mini-VALC's
Clients grid with a tracked status.

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
layer on as the stack matures. The architectural decisions (top of file) are
the gate -- don't commit to a hardening path that assumes one topology if the
decision hasn't been made.

---

## What this plan deliberately does NOT cover

- Replacing `rr-valc-agent.jar` -- the broker piece. If the per-customer model
  wins, that jar (or a fork of mini-VALC playing the same role) keeps existing.
  Replacing it is a separate larger plan.
- The V7 -> V8 client cutover. Independent migration; the new agent's endpoint
  surface already covers both apps for Inventory + System Status, with known
  gaps in Roll Forward / PO Receipts / In Transit that V8 hasn't visited yet.
- The Postgres-side multi-tenancy decision. mini-VALC's `users` table is
  central today (one VALC, many customers); whether `clients` and
  `client_databases` follow the same pattern in production depends on the
  architectural decision in #1.
