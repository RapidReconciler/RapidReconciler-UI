# Deployment Center — DB migration flow + production (per-customer) deploy

**Status:** direct path built (s19, uncommitted in Valc at time of writing);
production agent path = future work. Captured 2026-06-11.
**Spans:** RapidReconciler-Valc (Deployment Center + `DbDeployService`),
RapidReconciler-Agent (Data Services jar — production executor),
RapidReconciler-DB (the dacpac source).

---

## 1. What's built — the direct path

Deployment Center → **DB Scripts** tab. Pick a DB release (dacpac synced
from a `db-v*` GitHub release into `file_versions`, `component='database'`)
+ target database(s), then:

- **Generate script** — `SqlPackage /Action:Script`, **live + real-time**
  against the target's current schema → the tailored upgrade SQL (read-only).
- **Pre-flight** — `SqlPackage /Action:DeployReport` (read-only) → operation
  summary + data-loss alerts. Deploy also runs this server-side as a gate.
- **Deploy** — `SqlPackage /Action:Publish` (the only writer) + a
  `client_deploys` row. `BlockOnPossibleDataLoss` defaults ON; the operator
  ticks **Allow data loss** to publish through a drop. `DropObjectsNotInSource=False`.
- Manual `.sql` upload runs through `sqlcmd` alongside the release path.

**Transport:** SqlPackage runs **on the VALC host**, connecting *directly*
to the target DB over the network (connection resolved from
`client_databases`/`client_servers`; host/port via the linked
`client_servers` row when set, else inline; creds prefer the server admin
login). This works for **dev / QA / NA / TR / GSI-internal prod** because
they're all reachable from the VALC host. This is the "direct publish" lane
(`dev/qa/prod stay on direct publish; NA/TR via the Deployment Center`).

---

## 2. The problem with a real customer's production DB

A customer's production database lives on the customer's network, behind
their firewall. **VALC (GSI-side) generally cannot open a SQL connection to
it.** So the direct-SqlPackage-from-VALC model does not reach customer prod.
The production flow must route **through the agent** — the Data Services jar
that already runs on the customer's box, connects to their SQL Server
locally, and already applies SQL (installs/upgrades, `sp_start_job`;
`reference_v7_sql_deploy_via_agent`). This is the **"or run via the agent"
half of step 4 — designed, not yet built.** The agent has no dacpac-apply
endpoint today (it has `JobsController`/`AdminResetController`).

The *only* real difference from dev is transport: dev → VALC reaches the DB
directly; customer prod → the agent is the local executor.

---

## 3. The production agent-deploy flow (intended)

1. GSI cuts a `db-v*` release → dacpac on the GitHub release.
2. VALC syncs it into `file_versions` *(built)*.
3. VALC ships the dacpac to the customer's agent — the same VALC→agent
   artifact push `ServicesDeployService` already uses for the jar
   self-update (`/admin/self-update`).
4. The agent, **local to the customer DB** with a privileged connection,
   does the diff + apply against that customer's live schema — tailored to
   their drift, with the **same data-loss pre-flight + gate**, then publishes.
5. Agent reports per-step results → VALC records a `client_deploys` row
   (status PENDING → … → SUCCEEDED/FAILED, same as the Services deploy).

### Open fork — where SqlPackage/DacFx runs on the customer side

- **Option A — agent shells SqlPackage/DacFx locally.** Bundle the DacFx CLI
  with the customer install; the agent runs `/Action:Script` (preview back to
  the operator), `/Action:DeployReport` (gate), `/Action:Publish` on the box.
  *Most faithful* — drift handled exactly as in dev. Cost: a .NET/DacFx
  dependency added to the customer install bundle.
- **Option B — central diff, agent applies plain SQL.** The agent extracts
  the customer's current schema as a dacpac (`/Action:Extract`) and ships it
  up; VALC diffs the two dacpacs **offline** — SqlPackage scripts
  source-dacpac vs target-dacpac with **no live connection** — producing the
  upgrade script + data-loss report centrally; ships the SQL back; the agent
  applies via `sqlcmd`. Keeps SqlPackage on the GSI side (one install to
  manage); the agent only runs plain SQL (already does) + a schema extract.
  Cost: an extract round-trip; Extract still needs DacFx on the box (so the
  .NET dependency isn't fully avoided unless extract is replaced by a
  schema-only artifact VALC restores to a scratch DB to diff — heavier).

**Lean:** Option A is simpler end-to-end and matches the dev behavior exactly;
the DacFx dependency is a one-time install-bundle addition. Revisit B only if
shipping DacFx to customer boxes is a hard no.

Either way: desired-state dacpac, per-customer drift handling, and the
data-loss gate all carry over unchanged.

---

## 4. Per-customer parameterization — NO per-customer publish.xml

A `.publish.xml` profile bundles (connection + `/p:` properties + `/v:`
SQLCMD vars) — all passable as discrete args, which `DbDeployService`
already does. What actually varies per customer:

| Varies per customer? | Item | Where it lives |
|---|---|---|
| **Yes (data)** | Connection (host/port/db/creds) | `client_databases` / `client_servers` — resolved per target at deploy time |
| **Mostly auto** | SQLCMD vars (`DatabaseName`, `DefaultDataPath`, `DefaultLogPath`, `DatabaseVersion`) | Auto-resolved by SqlPackage from the live target on an *upgrade* publish (only matter for *new* file creation on a fresh install) |
| **No (policy)** | `BlockOnPossibleDataLoss`, `DropObjectsNotInSource`, etc. | Constant across customers — code/config (`DbDeployService`), plus the operator's per-deploy Allow-data-loss opt-in |

So per-customer-ness is **data VALC already holds**, composed into the
SqlPackage invocation per target at deploy time — VALC is the single source
of truth. Per-customer XML files would duplicate that registry, drift when a
customer's connection/paths change, and store credentials on disk. (The stray
root `Dev.publish.xml` was deleted in s18 for the same reason.)

**Recommendation:** no per-customer profiles. At most a *single shared* policy
profile (or, as today, discrete `/p:` args), with connection + any required
`/v:` vars overridden per invocation from the client registry.

---

## 5. Open questions

- DacFx on the customer box (Option A) vs the extract round-trip (Option B).
- SQLCMD-var sourcing for a *fresh install* (new DB, files don't exist yet)
  vs an *upgrade* (auto-resolved) — the install path may need explicit
  data/log paths from the client registry.
- Privileged connection for schema work on a customer box — server-row admin
  creds vs a cold-install bootstrap service account
  (`reference_v7_sql_deploy_via_agent`: cold install needs a privileged
  account + bootstrap connection); least-priv `rruser` can't ALTER.
- Per-customer deploy concurrency / scheduling (maintenance windows), and
  surfacing the data-loss gate to the operator *before* a remote apply.

---

## Related

- The built direct path: `DbDeployService`, `DeploymentController`
  (`/db/generate`, `/db/preflight`, `execute-sql`), the DB Scripts tab in
  `deployment.html`.
- `ServicesDeployService` — the VALC→agent artifact-push + `client_deploys`
  pattern the production path reuses.
- [`ssis-management-and-jde-extraction.md`](ssis-management-and-jde-extraction.md)
  — sibling: SSIS deploy/test via the same VALC+agent shape.
- Memory: `reference_v7_sql_deploy_via_agent`,
  `feedback_data_services_changeable_broker_frozen` (Data Services jar is
  free to change — jar swap, no reinstall), `feedback_sql_compat_floor`.
