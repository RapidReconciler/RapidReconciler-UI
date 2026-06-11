# Deployment Center, reimagined — Installations / Upgrades / Maintenance

**Status:** design agreed (this session); phased build pending. Captured 2026-06-11.
**Spans:** RapidReconciler-Valc (UI + orchestration), RapidReconciler-Agent
(new dacpac-apply executor), RapidReconciler-DB / -Agent (release manifest),
RapidReconciler-AI (this doc).
**Audience driver:** junior operators (exit strategy) — every tab is a guided
workflow with hints, organized by *intent*, not by artifact type.

---

## The reframe

Today's tabs are artifact-oriented — **DB Scripts** vs **Services Release**
("which file type am I pushing?"). They become **intent-oriented**, matching the
customer lifecycle:

| Tab | "I am…" | What it does |
|---|---|---|
| **Installations** | onboarding a new customer | install the DB where topology says it goes |
| **Upgrades** | taking a customer to a new platform version | deploy a paired DB + Services release together (e.g. V7→V8) |
| **Maintenance** | fixing/operating an existing customer | run a curated ad-hoc script |

Each tab is a **stepper**: *Pick target → Confirm what's needed → Preview /
Pre-flight → Run → **Verify*** — one hint line per step. Same skeleton, three
fillings. Default-open to the tab that has pending work.

### Locked decisions (2026-06-11)
1. **Upgrades = one paired "platform release."** The junior picks a single
   version (e.g. "V8.0-beta.2"); a **compatibility manifest** resolves it to the
   matched DB dacpac + Services jar. No independent version picks (prevents
   silent mismatch).
2. **Executor = through-the-agent.** Build an **agent dacpac-apply endpoint** so
   firewall-bound customer-prod installs/upgrades work. VALC-direct SqlPackage
   stays as the path for GSI-reachable targets (NA/TR/internal); the UI is
   executor-agnostic.
3. **Installations detection = derived** (no schema migration): a
   `client_databases` row with topology placed but no successful DB install.

---

## Tab 1 — Installations

"Clients awaiting their DB."

- **Detection (derived):** a `client_databases` row exists + a `client_servers`
  SQL row (topology placed), but `database_version` is null and there's no
  SUCCEEDED `component=database` deploy → "awaiting install." Tab shows the count.
- **Credentials are the crux.** Steady-state `rruser` can't `CREATE DATABASE` /
  set compat. Cold install needs a **privileged bootstrap login**
  (`reference_v7_sql_deploy_via_agent`). The workflow's centerpiece step is a
  **transient credential prompt** — full password-manager suppression suite + eye
  toggle (`feedback_password_field_suppression`), used then discarded, never stored.
- **Sequence:** create DB → publish dacpac (schema) → `SET COMPATIBILITY_LEVEL 140`
  → seed bootstrap data → (SSIS deploy? — see open questions) → **verify**
  (`DatabaseVersion` stamped, agent healthy).
- **No data-loss gate** — a fresh DB has nothing to lose.
- ⚠ **Chicken-and-egg:** a brand-new customer's agent isn't installed yet, so
  VALC can't reach the box. Resolve via the **install bundle** (Inno + WinSW +
  agent + bundled SQL) laying the agent down first, *then* VALC→agent runs the DB
  install. GSI-reachable targets can install direct. (See `install-bundle-generator.md`,
  `mini-valc-database-provisioning-production-ready.md`, `go-live-handoff.md`.)

## Tab 2 — Upgrades

"Take an existing customer to a new platform version (DB + Services together)."

- **Paired release (manifest).** One pick → matched dacpac + jar. The manifest is
  the net-new data structure (see below).
- **Ordered orchestration (the part a junior must not get wrong, so the flow owns it):**
  1. DB **pre-flight** (the data-loss gate — V7→V8 is exactly where drops like
     `RCardexVariance.LocOffset` surface).
  2. DB **publish** → **verify** the new `DatabaseVersion` stamped.
  3. **Then** Services **push** → **verify** agent health.
  4. **Stop if the DB step fails** — never push the V8 jar onto a half-upgraded
     schema (the jar queries V8 objects).
- **V7→V8 is the headline** and is proven (RR_V178_Base → clean 10K-line dacpac
  diff; SqlPackage handles per-customer drift).
- **No ad hoc here** — curated releases only.
- Open: rollback / partial-failure handling (DB succeeded, Services failed).

## Tab 3 — Maintenance

The existing ad-hoc pane, relocated:
- Editable SQL pane + full sqlcmd output surfacing + **GitHub-sourced maintenance
  scripts** (the `RapidReconciler-DB/Maintenance Scripts/` picker) — all built.
- No gate (operator runs curated/typed data-update scripts; owner's call).
- Smallest lift: it just moves to its own tab.

---

## Net-new: the agent dacpac-apply endpoint (RapidReconciler-Agent)

The executor that makes the firewall-bound path real (decision #2). Mirrors how
`ServicesDeployService` already ships the jar to the agent.

- VALC ships the dacpac bytes to the customer's agent (same artifact-push as the
  jar self-update).
- The agent, **local to the customer DB**, shells **SqlPackage/DacFx** (Option A
  from `deployment-center-db-migration.md` — bundle DacFx with the install):
  - `/Action:DeployReport` → returns operations + data-loss alerts to VALC for the
    **pre-flight gate** (so the gate works against remote customers too).
  - `/Action:Publish` (with `BlockOnPossibleDataLoss` per the operator's opt-in,
    `DropObjectsNotInSource=False`) → applies; returns result.
- Auth: loopback/admin pattern like `JobsController`'s `/admin/...` endpoints.
- VALC records `client_deploys` from the agent's reported outcome.
- Adds a DacFx dependency to the customer install bundle.

## Net-new: the release manifest

Maps a platform version → its matched artifacts:
`{ "V8.0-beta.2": { db: "8.0-beta.2" (dacpac), services: "X.Y.Z" (jar) } }`.
Open question where it's authored/stored — candidates: a JSON asset on a GitHub
release, a small VALC table, or derived by matching version strings. Needs a short
design pass. Drives the Upgrades single-pick.

---

## Reuse map (little is net-new on the VALC side)

| Existing | Reused by |
|---|---|
| `DbDeployService` generate / pre-flight + data-loss gate / publish | Upgrades, Installations |
| `ServicesDeployService` jar push | Upgrades |
| Editable pane + sqlcmd output + GitHub maintenance scripts (`DbMaintenanceScriptController`) | Maintenance (verbatim) |
| `file_versions`, `client_servers` topology, `client_deploys` | all tabs |

Net-new: the 3-tab stepper shell, the agent dacpac-apply endpoint, the release
manifest, Installations detection + cold-install credential flow, Upgrades
orchestration, and the **Verify** steps.

---

## Cross-cutting

- **Verify closes the loop** (junior gold): post-run, confirm the `DatabaseVersion`
  stamp, agent health, and — the RR move — a **reconciliation smoke check** that
  the numbers tie. "Done ✓," not "exited 0."
- **Executor abstraction:** agent path (firewall-bound) vs VALC-direct
  (GSI-reachable) behind one interface; the workflows don't care which runs.
- **Default tab = pending work** (awaiting installs → open Installations).

---

## Phased build (each phase independently shippable)

1. **Shell + Maintenance.** Restructure to the 3-tab stepper; move the ad-hoc pane
   into Maintenance. Validates the junior UX immediately; low risk; direct executor.
2. **Upgrades (GSI-reachable).** Release manifest + single-pick + ordered
   DB→verify→Services→verify orchestration + the data-loss gate, on the
   VALC-direct executor.
3. **Agent dacpac-apply endpoint.** The firewall-bound executor (DeployReport +
   Publish via the agent); wire pre-flight + publish + `client_deploys` through it.
4. **Installations.** Derived detection + transient bootstrap-credential step +
   cold-install sequence + verify (+ resolve the agent-first prerequisite).

## Open questions

- Where the release manifest lives + how it's authored.
- SSIS in the install/upgrade sequence (now or later; see
  `ssis-management-and-jde-extraction.md`).
- Rollback on a partial Upgrade failure.
- Installations: confirm the agent-bundle-first prerequisite for brand-new customers.

## Related

- [`deployment-center-db-migration.md`](deployment-center-db-migration.md) — the
  built direct DB flow + the agent-executor design this builds on.
- [`ssis-management-and-jde-extraction.md`](ssis-management-and-jde-extraction.md)
- `mini-valc-database-provisioning-production-ready.md`, `go-live-handoff.md`,
  `install-bundle-generator.md` — provisioning / install lifecycle this dovetails with.
- Memory: `user_role_exit_strategy`, `feedback_password_field_suppression`,
  `reference_v7_sql_deploy_via_agent`, `feedback_data_services_changeable_broker_frozen`.
