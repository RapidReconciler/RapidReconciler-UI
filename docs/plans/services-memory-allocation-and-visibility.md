# Services memory allocation & process visibility — plan

_Scoped 2026-06-09. Grew out of the "Andy the Admin" review of the V8 Home
Service Health card + the VALC Databases RAM column._

## Why this matters

Andy is the **customer admin** — not technical. His job around the data
service is narrow:

1. Notice when a RapidReconciler database's service is running low on memory.
2. Know it's running, and be able to restart it.

He **cannot change the RAM allocation himself** — that lives in VALC, which is
GSI-only. So Andy's loop is: _watch usage → ask GSI to bump_. GSI, in turn,
needs to see **which** databases are pressing their allocation so they raise
the right one. Standing rule: production-ready, **no theater** — the numbers on
screen must reflect what the process is actually doing.

## Current reality (verified)

### The allocation is stored but never enforced

- VALC stores a per-DB **`max_memory_mb`** (default **1024**, validated against
  an allowed set) — the **RAM** column in Manage Client → Databases.
  (`ClientDatabaseEntity.maxMemoryMb`, set/validated in `ClientDatabaseController`.)
- It's plumbed into the remote desired-state descriptor:
  `DesiredStateBuilder.setMaxMemory(db.getMaxMemoryMb())`.
- **But nothing turns it into a JVM `-Xmx`.** The Services jar launches with no
  heap cap, so the JVM takes its default max heap = **¼ of physical RAM**. On
  the 32 GB box that's ≈ **8,180 MB** — exactly the "of 8,180 MB" the V8 Home
  memory readout shows. VALC's "1 GB" is therefore **advisory only** right now —
  the same tracked-but-not-enforced gap company-seat licensing had before it was
  wired.

### Two launch paths — one we own, one we don't

| Path | Who launches the Services jar | Can we change it? |
|---|---|---|
| Local / co-hosted (dev box, on-prem co-hosted, internal pilots) | VALC `AgentLifecycleService.start()` — builds `jvmArgs` + `ProcessBuilder` | **Yes** (Valc repo, GitHub) |
| Dev standalone | `RapidReconciler-Agent/setup/run-test-agent.ps1` — `Start-Process java` | **Yes** (Agent repo) |
| **Remote production** (customer's own host) | legacy `rr-valc-agent.jar` `ServicesInstanceManagerService` over JMS | **No** — Bitbucket, never-push |

`AgentLifecycleService.start()` already loads the `ClientDatabaseEntity` row
(for SQL creds, ~line 163), so `maxMemoryMb` is in hand at the launch site — the
`-Xmx` insert is a few lines.

### Process model (answers "can I see it in Task Manager like V7?")

- V8 **reuses v359's Agent + spawn machinery**; only the per-DB Services jar is
  green-field. So production topology = V7: the **Agent runs under WinSW (a named
  Windows service)**, and each **database's Services jar is a child `java`
  process** the Agent spawns — visible in Task Manager, identifiable only by its
  command line (jar path + DB name). It does **not** disappear in V8.
- On the dev box it merely _looks_ different: `run-test-agent.ps1` launches each
  jar as a detached, hidden-window `java.exe` (four of them) with no WinSW — a
  dev shortcut, not the shipping model.

### Restart

- **B1a (shipped):** Home Restart → VALC `POST /admin/services/restart` →
  `AgentLifecycleService` local stop→start (sticky port). Real on the
  local/co-hosted path.
- **B1b (pending):** remote-customer JMS `RestartInstance` (legacy agent owns
  it) → currently returns 503.

### V8 Home (done this session)

The Service Health card now shows one plain line — "Using X of Y MB allocated
(Z%)" + the colored bar — fed by the JVM's real ceiling. Once `-Xmx` is enforced
it will show the **true** allocation automatically, no further UI change.

## Proposed shape

- **P1 — Enforce `-Xmx = max_memory_mb` on the paths we own.**
  - **P1a** `AgentLifecycleService.start()`: insert `-Xmx{row.maxMemoryMb}m`
    into `jvmArgs` (JVM opts go before `-jar`), from the already-loaded
    `ClientDatabaseEntity`. Covers VALC-spawned instances (co-hosted prod +
    dev-via-VALC).
  - **P1b** `run-test-agent.ps1`: add a matching `-Xmx` so the standalone dev
    agents mirror prod.
  - Result: Home + VALC reflect the real allocation, not the 8 GB default.
- **P2 — Per-DB usage bar in VALC's Databases grid.** Beside the RAM column, a
  used-of-allocated bar. **Needs new telemetry: VALC collects NO per-instance
  memory today** (verified — no `heapUsed`/`heapMax` in VALC Java). The Services
  jar already exposes it at `/admin/service-health` (what V8 Home reads), so P2 =
  either (a) extend the existing heartbeat-facts the agent POSTs to VALC with
  heap used/max, store + render in the grid, or (b) have VALC probe each running
  instance's `/admin/service-health` on grid load. (a) is the durable path.
  GSI's "who needs a bump" view.
  - **Storage shape (decided 2026-06-09, route a):** heartbeat-facts are
    currently **server-level** (`AgentFactsService.upsert` writes the APP_SERVER
    `client_servers` row). Memory is **per-DB**, so: the reporter (which already
    knows its `client-database-id`) adds it + heap used/max to the payload;
    `upsert` stores memory on the matching **`client_databases`** row (new
    columns `mem_used_mb` / `mem_max_mb` / `mem_updated_at`, migration V40); the
    grid bar reads `mem_used_mb` / `max_memory_mb`, greying out when
    `mem_updated_at` is stale. Agent reuses `ServiceHealthService` for the heap
    figures (no recompute).
- **P3 — (done) V8 Home usage line + bar.** Andy's "should I ask GSI" signal.
- **P4 — Make the per-DB service identifiable (optional; beats V7).** Either a
  recognizable process name on the spawned jar, or register each per-DB Services
  instance as its own named Windows service ("RapidReconciler Services — <DB>")
  so `services.msc` becomes Andy's per-DB control panel. Doable on the local
  path; remote path is legacy-agent territory.

## The boundary to respect

`-Xmx` enforcement, restart **B1b**, and named-service visibility **on the
remote production path** all require changing the legacy `rr-valc-agent.jar`
(Bitbucket, never push) — or replacing it with the green-field agent. So:
**local/co-hosted + dev are buildable now; remote production is blocked** until
the legacy agent is updated or replaced. Don't promise remote behavior we can't
ship.

## Decisions needed before P1 ships

1. **Default RAM + steps.** The service currently uses ~700 MB; a hard **1 GB
   cap leaves little headroom** and a heavy reconciliation could OOM. Confirm a
   sane default (2 GB?) and the allowed-set steps **before** we actually cap it.
2. **Visibility approach (P4).** V7-parity child process / recognizable process
   name / named per-DB Windows service?
3. **Remote-path roadmap.** When/whether the legacy agent gets
   `-Xmx` + restart-B1b + naming, or the green-field agent replaces it.

## Suggested sequence

P1a + P1b (enforce `-Xmx`, local + dev) → verify Home shows the real allocation
on dev → P2 (VALC grid bar) → P4 (visibility) → remote path (legacy agent) when
that effort is scheduled.
