# Phase 3 — the on-box agent as the production deploy executor

**Status:** DESIGN (2026-06-13, s30). No code moved. The owner asked for the
full layout before building, and explicitly **parked the secret-path fork**
("decide when we get there"). This doc lays out the architecture, the channel,
the `.ispac` transport, the fork (with a recommendation), the per-method
disposition, and the sequencing. Builds on
[`ssis-deploy-service-account.md`](ssis-deploy-service-account.md) (the Windows-
principal fork, §4) and [`ssis-catalog-reversal-spec.md`](ssis-catalog-reversal-spec.md)
(the catalog model). Decision points are flagged **◆ OWNER**.

---

## 1. The finding that reframes Phase 3

Phase 4 (s28) shipped the SSIS catalog deploy running entirely from the **VALC
host** — SqlPackage, sqlcmd, the SQL-Agent-job catalog steps, the readiness
probe. That works on the dev box because **dev VALC sits on the same network as
the dev SQL Server**. It does **not** describe production.

The production network posture is **outbound-only**:

> *"Allow outbound HTTPS (port 443) from the application server to the GSI
> hosts… The connection is outbound only; **no inbound access from GSI is
> required**."* — `rr-installation-prep.html:2010` (Baseline, all topologies)

The customer's SQL Server accepts inbound 1433 **only from the customer's own
application server** (`rr-installation-prep.html:2028`), never from GSI. GSI/VALC
has **no route into the customer network**. This is also V7's model:
`reference_v7_sql_deploy_via_agent` — V7-VALC never touches the customer DB; it
ships SQL over the broker to the on-box Services jar, which runs it locally as
`rruser`.

**Consequence:** every VALC-host operation in `DbDeployService` /
`DbInstallService` / `InstallProbeService` that reaches the customer SQL —
SqlPackage Publish, sqlcmd `runScript`, `runCatalogStep`, `runCatalogJob`,
`testConnection`, `CREATE DATABASE` — is a **dev-only path**. In production the
**on-box agent is the only executor**. The named Phase-3 items (secret-bearing
env-build + prod `.ispac` placement) are not special cases; they're the first
two operations to cross a boundary that, in truth, **all** DB-mutating
operations must cross. Phase 3 is "stand up the on-box executor," and we route
operations through it incrementally — hardest-constrained first.

So the dev path is not throwaway. It stays as the **dev/co-located executor**;
Phase 3 adds a **remote (agent) executor** behind the same service API, selected
per target by whether the target is reachable from VALC or only from its on-box
agent.

---

## 2. What "the agent" is here (and what's frozen)

Two on-box JVMs, per `feedback_data_services_changeable_broker_frozen` +
`reference_v7_services_jar_store_versioned`:

- **The broker** (`rr-valc-agent.jar`, one WinSW service). Holds the outbound
  JMS connection to VALC (the bootstrap handshake in
  `reference_agent_bootstrap_protocol`). Spawns one **Services / Data-Services**
  instance per database. **FROZEN — do not change** (local commits only; we
  don't rebuild it).
- **Data Services** (`client-services` jar, spawned per DB). The HTTP data
  agent V8 calls (`/poll`, `/inventory/*`, `/admin/*`). **CHANGEABLE** — jar
  swap, no reinstall. This is where the new executor logic lives.

Two facts shape the channel:
- The broker's JMS pipe is **already** the proven way VALC pushes work to the
  box: V7 ships `DeploySqlScriptMessage{databaseName, sqlScript, id}` over it,
  the Services jar runs it locally and writes the result back, VALC polls. It
  also already has `requestFile` (how V7 shipped jars/SQL down) and a `run-ssis`
  trigger (`sp_start_job`). **We can reuse these frozen message types without
  touching the broker.**
- A **new agent is incoming** (`project_new_agent_incoming`) — endpoint shapes
  may change. So treat message/endpoint shapes below as **provisional**; commit
  to the *seam* (an "execute this against the local DB, report back" contract),
  not the wire detail.

---

## 3. The command channel — how VALC instructs the on-box executor

VALC cannot call the agent (no inbound). Two viable shapes; **◆ OWNER** picks,
though they're not exclusive (we can start with B and graduate to A):

### Channel A — ride the frozen broker (V7 `DeploySqlScript` family)
VALC enqueues a deploy message on the per-agent JMS queue (the broker's
established outbound-established pipe); the broker hands it to the Data-Services
instance for that DB; it executes locally and writes `result`/`dateResult` back;
VALC polls. This is **literally the V7 mechanism**, proven on the fleet.
- **Pros:** zero broker changes; the transport, retry, result-capture, and
  per-DB routing already exist and are battle-tested; survives the no-inbound
  posture by construction.
- **Cons:** message *types* are fixed by the frozen broker (we get
  `DeploySqlScript` = "run this SQL locally," `requestFile`, `run-ssis` — enough
  for the executor, but no bespoke "deploy_project with these bytes" type); the
  Data-Services handler interprets a generic SQL payload + a file fetch.

### Channel B — Data-Services outbound poll-pull (new, on the changeable jar)
The Data-Services jar **polls VALC** (outbound 443, already allowed) for pending
deploy jobs, executes locally, posts results back. A new control endpoint pair
on VALC (`GET /agent/{id}/deploy-jobs`, `POST /agent/{id}/deploy-jobs/{job}/result`)
+ a queue table.
- **Pros:** full control of the payload (catalog T-SQL, `.ispac` ref, run-mode,
  secrets) on the **changeable** side; no dependency on the broker's fixed
  message vocabulary; the same poll the agent already does for `/poll`.
- **Cons:** net-new queue + auth + idempotency + at-least-once semantics to
  build (the broker already solved these); two channels to reason about until
  the broker path is retired.

**Recommendation:** **Channel A for SQL execution** (reuse `DeploySqlScript` — it
*is* "run T-SQL locally and report back," exactly what the catalog ops are once
secret-handling is settled) **+ a file-fetch for the `.ispac`** (§4). Fall back
to / augment with Channel B only if the broker's message vocabulary proves too
narrow for a clean payload (e.g. we want structured run-mode + execution-id
return rather than scraping a result string). Either way the **executor logic is
new code on the Data-Services jar**, and VALC keeps generating the T-SQL exactly
as `SsisConfigService` / `DbDeployService` do today.

---

## 4. The `.ispac` transport (problem 1 — file placement across the firewall)

Today `DbDeployService.deployProjectToCatalog` does `Files.copy(src → ssisPackageDir/<db>/…)`
**on the VALC box**, then the catalog `Deploy project` step BULK-reads it. In
prod VALC cannot write to the customer's filesystem. The `.ispac` bytes must
reach the box another way, then the catalog `deploy_project` reads them locally.

Three ways to get the bytes on-box; **◆ OWNER**:

1. **Agent pulls the release from GitHub** (recommended). The Data-Services jar
   already has outbound 443 and `GitHubReleaseService` already resolves
   `ssis-v*` release assets (`syncSsisReleases`). VALC tells the agent *which
   version* (a `file_versions` id / `version_string` / asset URL + sha1); the
   agent downloads the `.ispac` directly from the GitHub release to its local
   `ssis.package-dir`, verifies the sha1, and the catalog step BULK-reads it.
   No large payload over the channel; the artifact provenance is the release.
   - *Caveat:* a fully air-gapped customer (no outbound 443 to GitHub) can't
     pull — fall back to (2) or (3). The prep doc already requires outbound 443
     to GSI hosts, so GitHub-release reachability is a reasonable ask but is a
     **distinct** host — confirm or proxy through a GSI host.
2. **Broker `requestFile`** — the existing V7 mechanism that shipped jars/SQL
   down. VALC serves the `.ispac` bytes; the broker streams them to the box.
   Zero new infra, no GitHub dependency, ~6 MB over the established pipe.
3. **Stream over Channel B** as a base64 payload — simplest to write, but a 6 MB
   message on a control channel is the least tasteful option; avoid unless 1+2
   are both unavailable.

**Recommendation:** **(1) agent-pulls-from-the-release** as primary (cleanest
provenance, no channel bloat, reuses `GitHubReleaseService`), **(2) broker
`requestFile`** as the air-gapped fallback. Whichever lands the file, the
catalog `deploy_project` step is **unchanged** — it BULK-reads a local path. The
`bulkadmin` requirement (on whatever principal runs the deploy) is unchanged.

---

## 5. ◆ The PARKED fork — the env-build's secret path (problem 2)

The env-build writes the **JDE source password + `rruser` password** into the
catalog environment's sensitive variables. Two hard constraints (verified s27,
`ssis-deploy-service-account.md` §1): catalog mutations **reject SQL auth**
(Msg 27123) → a **Windows principal** must run them; and SQL 2019 (the engine floor)
has **no Entra** → that principal authenticates by the *process's* Windows token.
So the env-build needs a Windows-principal executor **and** secret hygiene.
Today (dev) it's the deliberate-transient `runCatalogJob` (create-run-**delete**
a SQL-Agent T-SQL job so the password never persists in `msdb.sysjobsteps.command`).

The fork is **which Windows principal runs it on-box, and where the secret
lives in flight.** (This is `ssis-deploy-service-account.md` §4's A-vs-B, now in
the agent-executor context.)

### Option A — agent relays into a transient SQL-Agent job (piggyback)
The Data-Services jar runs as its **default low-privilege logon** (Local System
/ NETWORK SERVICE / a local account). It cannot mutate the catalog itself. So
for the env-build it submits the **same transient SQL-Agent T-SQL job** we use
in dev — created, run, deleted — which executes under the **SQL Agent service
account** (already required to be SSISDB `ssis_admin` for the steady job and the
durable catalog steps). VALC pushes the two passwords to the agent over the
channel; the agent embeds them in the transient job; the job is deleted after.

- **Pros:** **no new Windows account** — reuses the SQL-Agent-account
  membership the install already requires; identical T-SQL to what's proven;
  smallest customer-provisioning ask; works on SQL 2019+.
- **Cons:** the passwords briefly exist in `msdb.sysjobsteps.command` (mitigated
  by immediate delete — the change is still in `catalog.operations`); the
  transient-job **flicker** the owner disliked for shared-enterprise DBAs
  watching msdb; the env-build's identity is the shared SQL-Agent account, not a
  named RR principal.

### Option B — agent runs as a dedicated RR Windows service account (clean)
The Data-Services jar's **WinSW service logs on as a dedicated Windows account**
(domain or local) that is SSISDB `ssis_admin`. The agent opens an
**integrated-auth** connection to the local SQL and runs the env-build catalog
T-SQL **in-process** — no msdb, no transient job, no secret ever touching
`sysjobsteps`. VALC pushes the two passwords over the channel; the agent writes
them straight into the encrypted SSISDB sensitive env vars and discards them.

- **Pros:** **clean least-privilege separation** (a named RR principal, not the
  shared Agent account); **no msdb footprint at all** for the env-build — the
  exact "no msdb" end-state the owner chose; synchronous; no transient-job
  flicker; the same account can later own the durable steps too (one identity
  for all catalog work).
- **Cons:** the customer must **provision + manage a Windows service account**
  (domain coordination, password rotation policy — the prep doc already
  recommends a SQL-service account, so this is a known shape); the **agent
  installer must support "run as `<account>`"** (WinSW `serviceaccount`); depends
  on the agent-executor being built (it is, in Phase 3); a domain account adds a
  cross-machine trust consideration in the 3-server topology.

### The thing that does NOT change either way
**VALC must convey both passwords to the on-box agent regardless** — the JDE
source password lives on VALC's Topology JDE-Source card; the `rruser` password
on `client_databases`. The agent doesn't know them. So "the agent holds the
secrets" is never literally true; the agent *receives* them per-config-change
and writes them into encrypted SSISDB. The fork is only **(A) into a transient
msdb job under the SQL-Agent account** vs **(B) in-process under a dedicated
account** — i.e. *does a secret ever land in msdb, and which identity executes.*

### Recommendation (for when the fork un-parks)
**Option B** is the better end-state and is the owner's stated direction
(`ssis-deploy-service-account.md` §4 "the Phase-3 direction"; the memory's "no
msdb at all"). It removes the last transient-job and the last msdb secret
exposure, and gives one named RR identity for *all* catalog work (env-build +
the durable Deploy/Bootstrap/Full steps could all move in-process under it,
collapsing the dev SQL-Agent-job indirection entirely on the prod path).

**But** B's cost is real customer friction (a managed Windows account + the
"run-as" installer support), so a pragmatic sequencing is: **ship Option A
first** (it reuses what the install already requires and unblocks remote
env-build immediately), then **graduate to B** when the agent installer's
run-as support lands — the env-build T-SQL is byte-identical, only the executor
identity + transport-of-secret change. Park the *final* choice; build the
executor seam so either drops in.

---

## 6. Per-operation executor disposition (the build map)

Every customer-SQL-touching method gets a disposition: **dev = VALC-host** (keep
as the co-located executor), **prod = agent** (route through Phase 3). The
service API stays the same; an `Executor` seam picks the path per target.

| Operation (current method) | Touches | Prod executor | Notes for Phase 3 |
|---|---|---|---|
| `publishDacpac` / `generateScript` / `previewPublish` (SqlPackage) | customer SQL schema | **agent** | SqlPackage must run on-box (or replace with the agent applying the dacpac — V7 had no dacpac; this is the s21 "agent dacpac-apply" item). Generate/preview are read-only but still need on-box reach. |
| `runScript` / `runReadQuery` (sqlcmd ad-hoc + reads) | customer SQL | **agent** | The V7 `DeploySqlScript` path *is* this. Channel A native. |
| `runCatalogStep` (durable Deploy/Bootstrap/Full steps) | catalog + msdb | **agent** | Secret-free; the agent submits the same step T-SQL locally, or (Option B) runs `create_execution`/`deploy_project` in-process under its account. |
| `runCatalogJob` (transient env-build, **secrets**) | catalog + msdb | **agent** | **The §5 fork.** Option A = agent relays into the transient job; Option B = agent in-process, no msdb. |
| `deployProjectToCatalog` (`.ispac` stage + BULK deploy) | filesystem + catalog | **agent** | §4 — agent places the file, then runs `deploy_project` locally. |
| `testConnection` / `InstallProbeService.*` (readiness probe) | customer SQL + host facts | **agent** | The s21 "live readiness probe" item — the agent connects to the target with the privileged install account and reports `SERVERPROPERTY` / perms / SQL-Agent state / CLR / SSISDB. VALC can't probe across the firewall. |
| `DbInstallService.execute` (`CREATE DATABASE`, `CREATE LOGIN rruser`) | instance (master) | **agent** | The bootstrap path V7 lacked (`reference_v7_sql_deploy_via_agent`): needs a **privileged install account + a master/instance connection mode on the agent**, additive to the executor. |
| `mineDecimals` (F9210 read against JDE source) | JDE source | **agent (non-SQL) / either (SQL)** | Already half-deferred: non-SQL JDE sources are explicitly the agent's job. The agent owns the JDE-source OLE DB provider; VALC only mines SQL sources it can reach. In prod even SQL JDE sources may be unreachable from VALC → agent. |

**Seam shape:** introduce a `DeployExecutor` interface with two impls —
`LocalExecutor` (today's VALC-host sqlcmd/SqlPackage, used for dev + co-located
targets VALC can reach) and `AgentExecutor` (routes the same payload over the
channel to the on-box Data-Services jar). `DbDeployService` /
`SsisConfigService` / `InstallProbeService` already build the T-SQL and resolve
the values; they hand the payload to the selected executor instead of calling
`run(...)`/`runScript(...)` directly. **Selection rule:** a target is
agent-executed when it has a live registered agent (it phones home) and is not
flagged co-located/dev — else LocalExecutor (dev). This keeps the dev workflow
byte-identical while production routes on-box.

---

## 7. Dev/prod parity — don't fork the workflow, fork the executor

The risk: a prod-only agent path that's never exercised in dev rots. Mitigations:
- **One service API, two executors** (§6). The Deployment Center UI, the
  generated T-SQL, the result DTOs, the gating — all unchanged. Only the
  `run`/`runScript` tail swaps.
- **Exercise the AgentExecutor in dev** by pointing it at the **local
  Data-Services jar** (the dev agents on `:39504` etc.). The dev box can run
  *both* paths against the same `RapidReconciler_InstTest` — LocalExecutor
  (VALC-host sqlcmd, proven) and AgentExecutor (agent runs it locally), and we
  diff the results. That makes the prod path a first-class dev citizen.
- **The catalog T-SQL is identical** across executors — the only proven-risky
  new code is the channel marshaling + the agent-side handler, which the dev
  agent exercises.

---

## 8. Readiness + prep-doc + install implications

- **Readiness probe moves on-box** (§6). The Step-2 live probe
  (`InstallProbeService`) currently runs from VALC; in prod it must run from the
  agent — but the agent only exists *after* a DB is installed and a Services
  instance is bound. **Chicken-and-egg:** the *pre-install* probe (can I
  `CREATE DATABASE`? is the instance reachable / Mixed-Mode / SQL-Agent up?) has
  no agent yet. Options: a **lightweight bootstrap-probe mode** on the broker /
  a thin install-time agent that runs before the per-DB Services instance
  exists, OR keep pre-install readiness as **attestation-only** in prod (the
  operator runs the checks on-box manually, ticks them) and reserve the live
  probe for post-install verification. **◆ OWNER** — this is the one place the
  no-inbound posture genuinely blocks "verify don't trust."
- **Prep doc** (`rr-installation-prep.html` / `rr-provisioning.html` /
  `using-valc.html`): add the §5 requirement once the fork resolves —
  **Option A:** "SQL Server Agent running; its service account ∈ SSISDB
  `ssis_admin`" (already partly there from Phase 4). **Option B:** "a dedicated
  RR Windows service account, ∈ SSISDB `ssis_admin`, that the RapidReconciler
  agent Windows service runs as." Plus the one-time catalog-create (CLR + master
  key, sysadmin) + **master-key backup** (reversal spec §7) — unchanged.
- **Install bundle / agent installer:** Option B needs WinSW `serviceaccount`
  support (run-as a provided account) in the install bundle. The privileged
  **install account** (for `CREATE DATABASE` / `CREATE LOGIN`) is a separate,
  install-meeting-only credential (prep doc Baseline "Local Administrator … may
  be revoked after install") — the agent uses it for the bootstrap connection
  mode, then drops to `rruser` for steady ops, mirroring V7's gap-closure.

---

## 9. Sequencing (proposed; no build until the fork un-parks per the owner)

1. **Executor seam** — extract `DeployExecutor` (`LocalExecutor` = today's code,
   no behavior change) behind `DbDeployService`/`SsisConfigService`/
   `InstallProbeService`. Pure refactor, fully dev-verifiable. *Unblocks
   everything; commits cleanly on its own.*
2. **Channel** — implement `AgentExecutor` over the chosen channel (§3, rec:
   broker `DeploySqlScript` for SQL + agent-pull-from-release for the `.ispac`).
   Data-Services-side handler: receive payload, run locally, report back.
3. **Route the secret-free ops** — `runScript`, `runCatalogStep`,
   `deployProjectToCatalog`, the readiness probe — through `AgentExecutor`;
   dev-verify by diffing Local vs Agent against `RapidReconciler_InstTest`.
4. **◆ Resolve the §5 fork** and route the env-build (`runCatalogJob`) — Option A
   (ship-first) or B (end-state). Build the seam so either drops in.
5. **Bootstrap/install path** — agent master-connection mode + privileged
   install account for `DbInstallService` (the V7 gap).
6. **Prep-doc + readiness** updates (§8); resolve the pre-install probe
   chicken-and-egg (§8 ◆).

Steps 1–3 are buildable now with no fork decision and no new customer
provisioning. Step 4 is the parked one. **◆ OWNER** confirms whether to proceed
through step 3 this session or stop at the seam (step 1) as the design lands.

---

## 10. Open decisions for the owner (◆)

1. **Command channel (§3):** broker `DeploySqlScript` reuse (rec) vs new
   Data-Services poll-pull vs both.
2. **`.ispac` transport (§4):** agent-pull-from-GitHub-release (rec) vs broker
   `requestFile` vs base64-over-channel. Is GitHub-release outbound reachability
   acceptable on the fleet, or must it proxy through a GSI host?
3. **Secret-path fork (§5):** Option A (transient job, ship-first) → B (dedicated
   account, end-state), or straight to B. Parked — decide at step 4.
4. **Pre-install readiness (§8):** thin bootstrap-probe agent vs attestation-only
   in prod (live probe post-install only).
5. **How far this session:** stop at the executor seam (step 1) with the design,
   or build through the secret-free agent path (step 3)?
