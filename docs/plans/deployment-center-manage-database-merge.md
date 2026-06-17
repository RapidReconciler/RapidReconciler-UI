# Deployment Center — merge Installations + Upgrades into "Manage database"

**Status:** Design captured 2026-06-17 (s26). Owner chose the merge over a
quick steps-6/7 selector patch. Driven by the observation that the Deployment
Center is organized by *intent* (Install vs Upgrade) but almost every operation
is scoped to a **(customer, database)** and applies whether the DB is new or
existing.

## The insight

"Install" is just *"this database doesn't exist yet — run the full sequence
once."* Load staging data, set the refresh schedule, configure SSIS, license
companies, deploy a DB release, deploy Services — these are all things you do
**to a database**, new or existing. Today the per-DB maintenance ops (load,
schedule, SSIS, license) live only inside the Install wizard, so they're
unreachable for an existing DB except by walking the install flow. And the
DB-release publish is duplicated (Install Step 3 = initial schema; Upgrade
Step 2 = newer dacpac — the same SqlPackage Publish).

This is also why Steps 6/7 "need a selector": they're per-DB ops stuck in a
linear wizard bound to one DB context (the shared `js-inst-load-db` selector
buried in Step 5). The fix for the selector and the fix for the overlap are the
same: make the flow **database-centric** with a shared (customer, database)
picker at the top.

## Target design — one "Manage database" flow

Deployment Center tabs become: **Manage database · Fleet rollout ·
Troubleshooting** (Installations + Upgrades collapse into the first).

**Step 1 — Customer + Database (the shared context).**
- Pick customer (all active customers).
- Pick database: existing DBs as radios (current version + Services version
  shown), **plus a "＋ New database" option**.
- This sets a single `(customerId, databaseId | NEW)` context every band below
  reads. Solves the steps-6/7 selector by construction.

**Bands below adapt to the selected DB's state:**
| Band | New (empty) DB | Existing DB |
|---|---|---|
| Readiness | full pre-install checklist | quick health/connectivity |
| Create database | shown (name + create + rruser + register) | hidden |
| Database release | initial schema publish | upgrade: Build/Test/Deploy vs live |
| Services | deploy | deploy / rollback |
| SSIS config + deploy | shown | shown |
| Bootstrap + licensing | shown | shown (re-license) |
| Load staging data | full load | full or steady reload |
| SQL Agent schedule | set | set/change |

## Spine choice: **Install is the spine** (rename → "Manage database")

Install already carries the larger per-DB op set (create-DB, SSIS,
bootstrap/license, load, schedule) **and** a per-DB selector (`instLoadDbSel`)
feeding Steps 5–7. So it moves the *least* code. What we import from Upgrades:
the Build/Test/Deploy **release pipeline** for existing DBs (Install Step 3
already does the initial publish — unify them) + the **Services** deploy/
rollback band. Step 1 gets reworked to add existing-DB selection (today it's
customer-only; the DB picker lives in Step 5).

(Upgrade-as-spine would mean moving 5 big install-only bands; Install-as-spine
moves ~2 areas + a Step-1 rework. Fewer moving parts, lower risk.)

## Staged execution (page stays working at every stage)

1. **Foundation — unified Step 1.** Rename Install tab → "Manage database".
   Rework Step 1 into customer + DB picker (existing radios + "＋ New
   database"). Promote DB selection to Step 1 as the shared context; point
   Steps 5/6/7 at it (`instLoadDbSel` becomes/echoes the Step-1 selection).
   Gate the create-DB sub-step to the "New database" selection. **Upgrades tab
   left intact this stage.** Each per-DB op now has its selector (it's Step 1).
2. **Fold in release upgrade + Services.** Unify the DB-release band (create-
   if-new + Build/Test/Deploy publish for new-or-existing); bring in the
   Services deploy/rollback band. **Retire the Upgrades tab** (and its
   deep-link `?clientId=` lands on Manage database). Sweep the `ug*` JS that's
   now dead.
3. **State-driven gating + polish.** Band visibility by DB state (new vs
   existing), band summaries, readiness placement, neat-freak alignment pass,
   then doc sweep `GSIRRTech/using-valc.html`.

## Risk controls

- 6,000-line, TDZ-fragile, production-hardened page. Work in stages, restart +
  verify after each (boot clean + the flow still works). The big script is one
  `th:inline="none"` IIFE — keep additions guarded; don't reorder const decls.
- Don't delete the `ug*` JS until Stage 2 actually folds its bands in.
- Verify server-side (endpoints, boot) every restart; owner eyeballs the UI.

## Related
- `fleet-rollout-orchestration.md` (the new Fleet tab — shares the per-DB deploy
  machinery + the Step-1 picker idiom).
- `deployment-center-reimagined.md` (the 3-intent-tab design this supersedes
  for Install/Upgrade).
