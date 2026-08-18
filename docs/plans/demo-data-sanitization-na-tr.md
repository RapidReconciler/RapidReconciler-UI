# Demo data sanitization — NA + TR runbook

> **Credentials are redacted in this file on purpose.** This repo is PUBLIC. The
> commands below name the accounts to run as, but no password value appears;
> read them from `~/.rr-sql-pwd` and the local secret store at run time.
Executable plan for sanitizing `jdesource_na` and `jdesource_tr`, reusing the
dev scripts. **Same scrub as dev, MINUS the +9-year date shift** (that's
dev-only, to make old data read as recent).

> **⚑ TARGET MAPPING (owner 2026-07-10 pivot): Dev→Demo1 (done) · NA→Demo2 (now) · TR→Demo3 (later).**
> (Swapped from the earlier TR=2/NA=3.) **NA is sanitized as Demo2 NOW so we work with clean data.** The
> staged cardex quantity variances live ONLY in `jdesource_na` F41021 (the 5 QOH bumps); the scrub leaves
> `lipqoh` + short-item intact, so a reset + FULL_LOAD + B→C recomputes them cleanly through the pipeline —
> and wipes the 006a-surfaced accumulated drift + the hand-edits to `dbo.F41021`/`rperpetualinv` (moot).
> Owner loads via VALC. NA date shift stays SKIPPED (Demo2 reads ~2020-2021 dates).

## Scripts (reusable tooling)
Live in `docs/plans/_scrub/` — the same set proven on `jdesource_dev`:

| Script | What it does | Per-DB adjustment |
|---|---|---|
| `01_text.sql` | scratch schema + word lists; themed overwrite of names/descriptions/item descriptions | **F0010 `ccname` is curated by company code** — re-craft the CASE for this DB's actual companies (see step 2) |
| `02_users_remarks.sql` | user/audit + remark fields → generic (batched, idempotent) | none |
| `03_items.sql` | LITM/AITM remap (short item stays) | none (map built from the DB's own items) |
| `04a_acct_maps.sql` | build+verify obj/sub maps from the DB's own distinct values | none (data-driven) |
| `04b_fast.sql` | apply obj/sub + account descriptions — **single set-based UPDATEs** | none |
| `05a_bu_co_maps.sql` | build+verify BU + company maps | none (data-driven) |
| `05b_bu_co_apply.sql` | apply BU + company across every carrying column — single UPDATEs | none |
| `08_ani.sql` | rebuild `glani` from remapped components; blank `prani`/`prvani` | none |
| `07_dates_dev.sql` | +9y Julian + fiscal years | **SKIP for NA/TR** |

### Per-DB theme (owner 2026-07-10)
Each demo DB gets a **distinct company-name vocabulary** so no two demos share a
company name:
- **Demo1** = industrial manufacturing (the original `01_text.sql` word lists).
- **Demo2 (NA)** = **wholesale distributor** — see `_demo2/01_text.sql`. `pfx` + `noun`
  lists are fully disjoint from Demo1, so no generated/curated name can collide.
- **Demo3 (TR)** = **mirror Demo1's industrial theme** (reuse the original word lists;
  only re-craft its own F0010 CASE + `USE`).

Working scripts live per-DB under `_scrub/_demoN/` (self-contained set: a themed
`01_text.sql` + `USE`-swapped copies of `02`–`08`). The `_scrub/*.sql` originals are
the **Demo1/industrial base**.

**TR turnkey path:** clone **`_scrub/_demo2/`** (NOT the originals) → `_scrub/_demo3/`
because `_demo2/` already carries the real-customer map-scaling fixes below. Then:
(1) `sed s/jdesource_na/jdesource_tr/g` across the set; (2) replace `_demo3/01_text.sql`'s
word lists with the **Demo1 industrial** lists (owner: TR mirrors Demo1) and re-craft its
F0010 CASE for TR's own companies; (3) confirm TR's F0010 names + `site+place` combos are
**≤ 30 chars** (TR company/BU cardinality differs — re-verify `04a`/`05a` = 0 collisions).

### ⚠️ Column widths + map scaling — REAL-CUSTOMER fixes (found on NA 2026-07-10)
The Demo1 scripts were sized for tiny dev cardinality and **break on a real customer**.
Both fixes are already in `_demo2/`; **TR needs the same** (larger than Demo1 too):
- **Text columns are `nchar(30)`** — `F0010.ccname`, `F0006.mcdl01`, `F4101.imdsc1`.
  Every curated F0010 name AND every generator combo (`pfx+noun+sfx`, `site+place`,
  `mat+ptype+size`) must be **≤ 30 chars** or the UPDATE errors (ANSI_WARNINGS rolls it
  back — safe, but the step fails). `gmsub`/`glsub` = 8 chars; `mcmcu`/`glmcu` = 12 chars.
- **`04a` map_sub** — dev's `'SB'+CAST(rn AS varchar(3))` **overflows** past 999 subs and
  its 2-digit tail collides past 100. NA has 2,155 distinct subs → widened to
  `'SB'+5-digit` (`varchar(10)` cast). Fits `nchar(16)`/8-char sub column.
- **`05a` map_mcu** — dev's `'P'+3-digit` alpha scheme **collides** past 1,000 (NA: 1,909
  alpha BUs → 909 collisions) and its same-width numeric band **overlaps** existing BUs.
  Replaced with a global **`'B'+6-digit` sequential over ALL BUs** (collision-free by
  construction; also kills identifying alpha prefixes like `CT`/`FK`). NA: 7,371 BUs.
  `num_width_change` in the verification is then **expected-nonzero** (numeric→alpha) and
  is cosmetic only; **`collisions` and `new-in-old overlap` must still be 0**.
- **`04b` account descriptions (`F0901.gmdl01`, nchar(30))** — the CASE built
  `'Cost of Goods Sold - ' (21) + ptype`; a 17-char ptype (`Cleaning Solution`) → 38 >
  30 → truncation rolled back that one UPDATE (obj/sub applies still succeeded). Fixed
  in `_demo2/04b_fast.sql`: short prefixes (`Sales - `, `COGS - `) + `LEFT(…,30)` cap.
  **Latent in the Demo1 base too** (never hit a long-enough combo on Demo1's small data;
  **TR will** — its industrial `Retaining Ring` gives `'Cost of Goods Sold - Retaining Ring'`
  = 35). The `LEFT(…,30)` wrap makes it theme-proof. If `04b` half-applies (obj/sub ok,
  gmdl01 truncates), recover with `_demo2/04b_recover.sql` (gmdl01 only — do NOT re-run
  the obj/sub applies; a class-preserving obj remap is not safely re-runnable), then `05b`,`08`.
- **Always run `04a`/`05a` FIRST and confirm collisions=0 + overlap=0 before the applies**
  (`04b`/`05b`) — a bad map merges distinct codes across the 6–7M-row tables.

> ⚠️ Every script starts with `USE jdesource_dev;` — change to `USE jdesource_na;`
> or `USE jdesource_tr;` before running (or run with `sqlcmd -v` / a copy per DB).
> The map-build scripts (`04a`, `05a`) read the target DB's own distinct values,
> so obj/sub/BU/company/item cardinality **auto-adapts** — no hand-editing of maps.

> ⚠️ **Never batch big-table UPDATEs with `TOP` + non-sargable joins** — it
> re-scans the table per batch (caused a ~2.8h runaway on dev F0911). All applies
> here are single set-based UPDATEs (one pass). Recovery is safe: the remaps are
> idempotent (new values disjoint from old).

> ⚠️ **F4111 schema differs by DB (verified 2026-07-01) — scripts unaffected.**
> `jdesource_na` (like dev) is the **slim** 26-column F4111: native `IL*` + the
> `InsertDate`/`ChangeDate` audit ints; owner removed the non-native (non-`IL`)
> text columns. `jdesource_tr` is the **full** native extract (72 cols —
> `ILLITM`, `ILAITM`, `ILOBJ`, `ILSUB`, `ILPID`, …). Every column the scrub touches
> (`iluser`, `iltrex`, `ilmcu`, `ilkco`, `ilkcoo`) is native `IL*` and present in
> both, so the scripts run unchanged on each (SQL is case-insensitive, so TR's
> upper-case `IL*` names match). **TR's extra native columns need no scrubbing** —
> RR's load doesn't read them (dev's slim F4111 lacks them yet dev reloads fine),
> so they never reach the demo RR DB.

## Steps (per DB — do NA, then TR)
1. **Confirm schema/creds.** `rruser` @ `localhost,1433` (password in `~/.rr-sql-pwd`; this repo is public, so it is not written here). Tables in
   `PRODDTA` (+ `F9210` in `PRODCTL`) — re-verify with the schema query in
   [demo-data-sanitization.md](demo-data-sanitization.md) in case NA/TR differ.
   (NA had prior load gaps — see memory `reference_na_load_f4211_f0902`.)
2. **Re-craft `F0010` names.** Run `SELECT ccco, ccname FROM PRODDTA.F0010;` on
   the target DB; rewrite the `CASE RTRIM(ccco) …` in `01_text.sql` to cover this
   DB's company codes (keep `00000` generic, keep the multi-entity structure).
3. **Run in order** (each is `sqlcmd -b -i <script>` after fixing `USE`):
   `01_text` → `02_users_remarks` → `03_items` → `04a_acct_maps` (check the
   verification row = all 0) → `04b_fast` → `05a_bu_co_maps` (check verification)
   → `05b_bu_co_apply` → `08_ani`. **Do NOT run `07_dates_dev`.**
4. **Validate** (same as dev, section below) then **drop `scrub` schema**:
   `DROP TABLE scrub.w, scrub.map_item, scrub.map_obj, scrub.map_sub,
   scrub.map_co, scrub.map_mcu; DROP SCHEMA scrub;`

## Validation (all DBs)
- Row counts unchanged per table (`sys.partitions`).
- No real names/locations remain: sample `F0101.abalph`, `F0010.ccname`,
  `F0006.mcdl01`, `F0901.gmdl01`, `F4101.imdsc1`.
- Referential integrity across the remap: every `F0911.globj` / `F4111.ilmcu` /
  `F43121.probj` resolves against the maps' new values (no leftover old codes).
- DMAAI ranges still bracket the remapped 14xxxx objects (F4096 `140000–149999`
  left as-is; 14xxxx objects stay in-band — verified by the obj map's
  `range_escape = 0`).
- (Dev only) dates: `SELECT MIN(gldgj), MAX(gldgj) FROM PRODDTA.F0911` lands in
  the +9y window (~2023–2025).

## After all three are sanitized
Owner does the full reset + reload of the demo DBs from the sanitized sources
(rename Dev→Demo1, NA→Demo2, TR→Demo3). `perioddate` and other RR-added columns are
repopulated on reload — they were left untouched (see section D of the dev doc).

## Parked follow-up — productize the rename into a VALC verb

The Demo1/2/3 renames run via the manual **Approach-2** runbook (physical
`ALTER DATABASE … MODIFY NAME` in `master` + lockstep update of
`client_databases.db_name`/`display_name` + `user_database_permissions.database_name`
+ agent respawn + rename the matching SSIS catalog environment `JdeInitialCatalog`
and the per-DB SQL Agent job so everything stays legible). VALC has **no rename
verb today** — the Edit modal (`ClientDatabaseController.updateSettings`) edits RAM/
port/job/GL/category/server only; `db_name` is read-only.

**After the July 15 demo**, fold this into a VALC **"Rename database"** action — a
`DatabaseRenameService` that reuses `DbInstallService`'s master-context connection to
do the whole dance atomically, so a future rename is one confirmed click, config
preserved (no untrack/re-adopt). Enforce the locked `RapidReconciler_` prefix;
type-to-confirm (it evicts live connections). **This hand-run is the spec** — each
step maps 1:1 to a service method.

## Rename → reset → reload runbook (post-sanitize) — Dev→Demo1 dry-run 2026-07-01

Renames a sanitized `RapidReconciler_<env>` + `jdesource_<env>` to `..._demoN` and reloads
clean demo data. **Rename legs (A) proven end-to-end on Dev→Demo1; reload legs (B) staged.**
Every destructive step assumes the DB pair is backed up.

### A. Rename (Approach 2 — scriptable, no VALC UI). PROVEN.
Run as `rruser` (sysadmin on the dev box) via `sqlcmd -d master`:
1. **jdesource:** `ALTER DATABASE [jdesource_dev] SET SINGLE_USER WITH ROLLBACK IMMEDIATE; ALTER DATABASE [jdesource_dev] MODIFY NAME=[jdesource_demo1]; ALTER DATABASE [jdesource_demo1] SET MULTI_USER;`
2. **RR DB:** same three statements `RapidReconciler_Dev`→`RapidReconciler_Demo1` (the `SINGLE_USER` evicts the agent's connection — expected).
3. **VALC Postgres** (`psql` as the `valc` role; password in the local secret store, not here), lockstep — keeps config, no untrack. **The per-DB JDE override must be COMPLETE** (catalog + host + platform + **login + password** + qualifier) or Build flags *"Environment incomplete — JDE source login."* Mirror a working sibling (NA id=24 = `rruser` / <password> / `proddta.`):
   - `UPDATE client_databases SET db_name='RapidReconciler_Demo1', display_name='RapidReconciler_Demo1', jde_override_catalog='jdesource_demo1', jde_override_host='<dev-box-host>', jde_override_platform='SQLSERVER', jde_override_username='rruser', jde_override_password_encrypted='<rr-sql-password>', jde_override_qualifier='proddta.' WHERE db_name='RapidReconciler_Dev';`
   - `UPDATE user_database_permissions SET database_name='RapidReconciler_Demo1' WHERE database_name='RapidReconciler_Dev';`
4. **Repoint the SSIS env — SIX linked pieces (this is where Demo1 silently missed some).**
   The runbook used to say only "run VALC Build environment"; the live catalog shows that
   leaves gaps. Renaming a DB touches **all six** of these, and the project references
   environments **BY NAME** (`reference_type='R'`), so a bare env rename orphans the reference
   AND the reload job:
   1. env **variable** `JdeInitialCatalog` → `jdesource_demoN`
   2. env **variable** `RrInitialCatalog` → `RapidReconciler_DemoN`
   3. env **variable** `aaStartDateGr` (per-DB; **not** a `client_databases` column, so Build
      may not source it — NA's still read the Demo1 `2025-01-01`)
   4. the **environment name** itself (`RapidReconciler_NA` → `RapidReconciler_DemoN`) — else a
      stale env lingers, exactly the Demo1 `RapidReconciler_Dev` leftover
   5. the project's **`environment_reference`** — by name, so delete the old + create the new
   6. the reload job **step-1 command**, which HARD-CODES `@env = N'RapidReconciler_NA'`
      (§5 below only ever covered step-2's `database_name` — step-1's `@env` was the miss)

   **Two paths** — both need a **Windows principal** for the catalog writes (SQL auth = Msg 27123):
   - **Scripted (preferred, complete):** `_scrub/_demo2/env_ops.sql` does all six, guarded +
     idempotent, `:setvar`-parameterized. Run via `sqlcmd -E -d SSISDB -i env_ops.sql` (Windows
     login that's sysadmin+ssis_admin) OR wrap as an sa-owned Agent **CmdExec** job calling that
     (agent = `NT SERVICE\SQLSERVERAGENT`, accepted by the catalog) — the pattern in
     `_collation_work/set_env_demo1.sql` (which itself only set 2 vars — do not reuse as-is).
   - **VALC "Build environment":** regenerates vars 1–3 + `JdeUserName` from the Postgres config
     in step 3 (so the override MUST be complete or Build blanks `JdeUserName`). Build does **not**
     rename the env, fix the by-name reference, or touch the job's step-1 `@env` — do those from
     `env_ops.sql` after.

   **Always finish with `_scrub/_demo2/verify_env.sql`** — a read-only PASS/FAIL checklist over all
   six pieces + variable-completeness diff vs a known-good env. It turns the Demo1 silent miss into
   a loud FAIL. Then **Validate** connectivity in VALC.
5. **Rename the reload job AND repoint its steps.** *(`env_ops.sql` §4 already does
   the job rename + step-1 `@env` + step-2 `database_name` in one pass — this manual
   sequence is the explanation + fallback. Step-1 `@env` was the Demo1 miss.)* Renaming
   the job is not enough — step 2 ("Run B to C") carries its own `database_name`, which
   still points at the old DB after the rename and fails the whole job with a
   misleading `Unable to connect to SQL Server '(local)'` (SQL Agent can't set
   context to the ghost DB). Bit the Demo1 dry-run. Do both:
   `EXEC msdb.dbo.sp_update_job @job_name='RapidReconciler_Dev', @new_name='RapidReconciler_Demo1';`
   `EXEC msdb.dbo.sp_update_jobstep @job_name='RapidReconciler_Demo1', @step_id=2, @database_name='RapidReconciler_Demo1';`
   (Step 1 "Run A to B" runs in `master` and drives the SSIS catalog by env name,
   so it needs no change — but verify with `SELECT step_id, database_name FROM
   msdb.dbo.sysjobsteps` after renaming.)
6. **Respawn the agent** against the new name (VALC Databases tab Stop→Start, or `publishDesiredState`). *[headless trigger TBD]*

### Licensing (per DB) — re-point to the SANITIZED codes BEFORE the load

Sanitization remaps company codes (`scrub.map_co`), so the licensed set must be
re-pointed to the **new** codes **before** the load (order matters — a load
against stale licensed codes filters `RCompanies` to nothing). Re-point BOTH:
- VALC Postgres `client_licensed_companies` (for this DB's client id), and
- the RR DB `RCompaniesLic` (`CompanyNumber` rows).

Keep `scrub.map_co` around (don't drop the `scrub` schema until after licensing)
so you have the precise old→new map to translate the codes below.

**NA (→ Demo2) — do NOT license companies `00043`, `00067`, `00073`** (owner,
2026-07-01). NA carries 9 companies (`00002, 00003, 00009, 00012, 00022, 00041,
00043, 00067, 00073`); license only the **6**: `00002, 00003, 00009, 00012,
00022, 00041` (translated through `scrub.map_co` to their sanitized successors).
Exclude the successors of `00043` / `00067` / `00073` from both licensing tables.
_(TR exclusions TBD — confirm against the TR company list when we get there.)_

### B. Reset → bootstrap → reload (owner-confirmed mechanics)
- **Bootstrap builds `RCompanies` + sets `PeriodCutoff` to day-1-of-current-FY; the agent job does NOT change `PeriodCutoff`.** So the override slots between bootstrap and the job's B→C.
- **`aaStartDateGr` = earliest across all 3 DBs = `2015-01-01`** (Demo1 pre-shift floor; ≤ NA 2020 / TR 2021-10 / Demo1-shifted ~2024). Over-pulled rows are trimmed by B→C. Set per env via the `sa`-job route.

Sequence per DB:
1. `EXEC dbo.reset_RapidReconciler_database 'F'` — full reset (computed tables **+ F-tables** via `sp_truncate_staging_tables` + reseed defaults).
   - **Reused / renamed DB (e.g. TR → Demo3): run `'P'` (partial) instead, BEFORE bootstrap.** A renamed DB carries over stale reconciliation R-tables (`ritems` / `rperpetualinv` / `rinvasof` / `rtransactions` + transit / rnv) that bootstrap never clears — on the Demo2 preflight they poisoned the inventory purge gate with **2.05M pre-cutoff rows**. `'P'` clears those while **keeping** companies, config, logs, and the already-loaded/sanitized **F-tables**. Use `'F'` only when reloading source from scratch; when you keep the loaded F-tables, `'P'` is the reset-before-bootstrap step. _(VLC-11)_
2. VALC **bootstrap** (builds `RCompanies`, fiscal calendar, defaults). *[headless trigger TBD]*
3. **Restore `PeriodCutoff`** (`_collation_work/restore_periodcutoff.sql`) — Demo1 = recorded **+9y**, NA/TR verbatim.
4. Run the agent job `RapidReconciler_demoN` (A→B full load @ `aaStartDateGr=2015-01-01` → B→C using the restored cutoff; B→C trims excess).
5. Validate (row counts, no real names/codes, dates in the expected window, UI shows crispy data).

### Recorded `PeriodCutoff` (2026-07-01 scan) + restore values
| DB | recorded | restore to | note |
|---|---|---|---|
| Demo1 | 2016-01-01 | **2025-01-01** | +9y (Dev source date-shifted) |
| NA | 2021-01-01 | 2021-01-01 | verbatim (unshifted) |
| TR | 2022-01-01 | 2022-01-01 | verbatim (unshifted; Oct-start FY) |

### C. Headless execution — PROVEN on Demo1 (2026-07-01)

**VALC is open on loopback** (`SecurityConfig` = `anyRequest().permitAll()`, no auth today), so **every step is driveable via `curl localhost:8080` + `sqlcmd`** — no VALC UI, no token. The two "unknowns" resolved: bootstrap + load are the `ssis-run` endpoint; respawn is the `start` endpoint.

1. **reset F** — `sqlcmd EXEC dbo.reset_RapidReconciler_database 'F'`.
   ⚠ **`f43121_rev` gap.** It's a **dead legacy artifact** (source comments in `Staging_F43121.sql` / `usp8_apply_f43121.sql`: nothing reads or writes it) that is **unmodeled** in the dacpac — so it's absent on any DB that didn't inherit it from legacy (Demo1 lacked it; NA/TR have it). Two procs `TRUNCATE` it unconditionally — `sp_truncate_staging_tables` (breaks `reset F`) **and** `usp6_maint_purge_rnv_tables` (breaks B→C) — both abort on the missing table. **Durable dacpac fix: retire `f43121_rev`** (drop the 2 dead truncates; it's a clean retirement-registry candidate) *or* model it so fresh installs have it. For Demo1 (live) I guarded `sp_truncate_staging_tables` (`_collation_work/guard_truncate_staging.sql`) then created an empty clone of `f43121` — either approach unblocks both procs.
2. **bootstrap** — `curl -X POST /valc/deployment/ssis-run -d '{"databaseId":<id>,"mode":"BOOTSTRAP"}'`. Builds `RCompanies` (sanitized names confirmed) + defaults `PeriodCutoff`. Poll `SSISDB.catalog.executions.status` → 7.
3. **restore `PeriodCutoff`** — `sqlcmd UPDATE RCompanies` (Demo1 no-op = already 2025-01-01 = recorded+9y; NA/TR per the table above).
4. **FULL_LOAD** — `curl -X POST /valc/deployment/ssis-run -d '{"databaseId":<id>,"mode":"FULL_LOAD"}'`. Response `historyStart` = **`MIN(PeriodCutoff) − 90`** (auto-windowed — no manual `aaStartDateGr`). Starts the SSIS catalog execution **async**.
5. ⚠ **B→C does NOT auto-run.** `ssis-run` starts the catalog execution directly, **not** the SQL Agent job's step 2. So monitor **`SSISDB.catalog.executions.status`** for the returned `execution_id` (NOT `sysjobactivity` — the job isn't the signal), and when it hits 7, run B→C explicitly: `sqlcmd EXEC dbo.usp6_001_run_b_to_c`.
6. **validate** — counts (`F0911`/`F4111`/`raccountsummary`/`rfiscalcalendar` all > 0), GL date window, sanitized-name samples.
7. **respawn agent** — `curl -X POST /api/v1/clients/{clientId}/databases/{id}/start` (spawns the Services jar against the new name; serves the UI).

**Monitoring:** one detached watcher polling `catalog.executions.status` for the execution_id, then the B→C exec. (First watcher attempt polled the SQL Agent job by global-max `session_id` and latched the wrong job — poll the execution, not the job.)

## Parked VALC enhancements (from the 2026-07-01 dry-run)

Post-demo — all confirmed useful, none blocking July 15:
- **Rename database verb** — the Approach-2 rename dance (§A) as one confirmed UI action / `DatabaseRenameService` (detailed above).
- **X-periods demo window** — let the bootstrap/override accept "last X periods" and auto-compute `PeriodCutoff` + load start from the data's latest period, instead of per-DB absolute dates (detailed in the dev-doc scan).
- **Running-step display** — for an in-progress SSIS execution, show the *current executable* (not just "Running"): source from `SSISDB.catalog.executable_statistics` (row with `end_time IS NULL`) or the latest `OnPreExecute` in `catalog.event_messages` lacking a matching `OnPostExecute`. Surface on the Troubleshooting SSIS-Catalog card + the Step-6 load board.
- **B→C after `ssis-run FULL_LOAD`** — `ssis-run` starts the catalog execution async and doesn't chain B→C; VALC should watch the execution to completion and then run `usp6_001` (today the SQL Agent job's step 2 fires before the async load finishes → B→C on empty data). Until fixed, the runbook runs B→C explicitly post-load.

## Forced cardex QUANTITY variances (demo/testing) — added 2026-07-09

NA (→ Demo2) had **zero quantity variance** — the entire cardex population was
average-cost, amount-only, so the Home "Cardex Variance" **Quantity** card and the
quantity-first path were untestable. Seeded 5 pure-quantity variances (one per
licensed variance-company) so the card and the UI-29 sync flow can be demoed.

**Mechanism (verified against `usp6_006b_cardex_variance`):** raising F41021
on-hand `lipqoh` by N (cardex/F4111 untouched) yields `estunits = −N` and, because
`amountonhand = quantityonhand × unitcost`, `baselinevar = −N×unitcost` — so the
item flags `reason='Quantity'` with real dollars = N×unitcost. **No cost-method or
amount edits.** Each item edited in 3 places: `rperpetualinv` (immediate),
`RapidReconciler_NA.dbo.F41021` (survives a C rebuild), `jdesource_na.PRODDTA.F41021`
(×100 — survives A→B→C).

| Co (pre-scrub) | itemid | short item (liitm) | branch | loc / lot | +N units | est / amt var |
|---|---|---|---|---|--:|---|
| 00002 | 155847 | 3613208 | 2 | 240707A / 843.0376 | +25 | −25 / −$27.72 |
| 00003 | 232554 | 209058 | 3 | 231806 | +2,000 | −2,000 / −$94.40 |
| 00009 | 230394 | 1781013 | 9 | 130107C | +300 | −300 / −$38.52 |
| 00012 | 235877 | 4136132 | 12 | LUBEROOM | +40 | −40 / −$140.21 |
| 00022 | 158140 | 2260316 | 22 | 140510 | +250 | −250 / −$51.40 |

**Durability through sanitization (intended):** the scrub touches names / accounts /
item numbers / company codes / dates — **not `lipqoh`**, and **short item is
preserved** (`03_items` remaps LITM/AITM, short item stays). So these `jdesource_na`
edits survive the scrub as DATA, but **a full reset+reload ZEROES the variance** — the reset
re-baselines to the current (bumped) on-hand, so the +N bakes into `baselineqoh` and `estunits`
ties to 0. **(Owner 2026-07-10 — supersedes the earlier "reset+reload re-creates the variance"
claim, which was WRONG. Cardex variance = divergence SINCE baseline; a fresh baseline = zero.)**
So these 5 bumps are **moot**: Demo2 loads with **zero cardex variance** (also clears the 006a
drift), and the demo variances are **staged post-load via the sync page** (Adjust Beginning
Balance creates the divergence, any db, after the fact). Optional cleanup: back the 5 bumps out of
`jdesource_na` so Demo2's on-hand reads clean (else they leave a slightly-off QOH, still no variance).

**Backout (restore-to-original absolute values)** — original `lipqoh`: RR
`dbo.F41021` = 100 / 21500 / 2880 / 357 / 2000; `jdesource` ×100 = 10000 / 2150000 /
288000 / 35700 / 200000; `rperpetualinv` originals were clean (`estunits`/`baselinevar`
= 0, `reason=''`; on-hand qty as the RR column above, `amountonhand` = qty×unitcost).
Full script was staged at the session scratchpad (`backout-cardex.sql`); the values
above are the authoritative record since the scratchpad is session-ephemeral.

> **NA-only.** Not yet applied to TR/Dev. All 5 companies are in NA's **licensed 6**
> (00002/00003/00009/00012/00022) — none are the excluded 00043/00067/00073.
