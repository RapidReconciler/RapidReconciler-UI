# SSIS package audit — Phase 0 (current state)

**Status:** Phase 0 of the SSIS overhaul. Captured 2026-06-12 from the
`.dtsx`/`.dtproj` source in `RapidReconciler-SSIS`.
**Mandate (owner, 2026-06-12):** **greenfield for net-new customers only.**
Existing installs work and stay as-is — no migration. We're free to redesign.
**Sequel to:** [`ssis-management-and-jde-extraction.md`](ssis-management-and-jde-extraction.md)
("Decision — chosen path"). This audit feeds Phase 1 (target spec).

---

## 1. Packages in the repo

| Package | Role | JDE source |
|---|---|---|
| `RapidReconciler_Prod.dtsx` | **Canonical** per-customer package | SQL Server (`MSOLEDBSQL`) |
| `RapidReconciler_JDELab.dtsx` | Oracle-source variant (platform reference) | Oracle (`OraOLEDB`) |
| `RapidReconciler_POC.dtsx` | Proof-of-concept | — |
| `RRV6r4b6.dtsx` | Older v6 release | — |

Deployment model = **Project** (catalog/`.ispac`), confirmed in `.dtproj`.
Overhaul targets a single clean package (per-platform count TBD — see §6).

## 2. Connection managers

| CM | Prod | JDELab | Notes |
|---|---|---|---|
| `JDESource` | `MSOLEDBSQL`, `Initial Catalog=jde_*` | `OraOLEDB`, Oracle TNS/host | **The only platform-variant piece — driver + conn string.** |
| `RRLocal` | `MSOLEDBSQL`, `rrv7-*` | `SQLNCLI11.1`, `rrv7-JDELab` | Destination = RR SQL DB. **Driver drift to fix: standardize on `MSOLEDBSQL`** (JDELab still on deprecated SQLNCLI11). |
| `Cache - Objects`, `Cache - Short Items` | cache CMs | same | Lookup caches; internal. |

All four are exposed as project parameters (`CM.*.ServerName/InitialCatalog/UserName/Password/...`).

## 3. Package-scope variables — the config knobs (11)

| Variable | Prod value | Type | Phase-1 disposition |
|---|---|---|---|
| `aaStartDateGr` | `2022-01-01` | date | Initial-load start date. Root for derived Julian vars. **Mostly set-and-forget.** |
| `dbowner` | `dbo.` | str | Schema prefix. **Constant default** (rarely ≠ `dbo.`). |
| `DecExtCost` | `100` | int | = `jde_ecst` as 10ⁿ (2→100). Derive from client. |
| `DecUnitCost` | `10000` | int | = `jde_uncs` (4→10000). Derive from client. |
| `DecQty` | `100` | int | = `jde_pqoh` *(pairing to confirm)*. Derive. |
| `DecQtyCX` | `100` | int | = `jde_trqt` (cardex qty). Derive. |
| `ModInv` | `0` | int | Module flag → **derive from licensed Inventory**. |
| `ModRnv` | `0` | int | Module flag → **derive from licensed Reconciliation**. |
| `InitLoad` | `0` | int | First-load vs incremental → **per-run, operational** (Deployment Center). |
| `RefreshDays` | `-35` | str | Rolling load window. **Set-and-forget default**; expose only if it varies. |
| `RefreshDaysRNV` | `-90` | str | RNV load window. Same. |

**Owner's read (2026-06-12): most of these are set-and-forget.** So the
overhaul should **bake sensible defaults into the package** and expose as
project parameters only the few that genuinely vary per customer — that
minimal set is all VALC captures. (Likely just the connection + platform +
decimals, all already modeled.)

## 4. Derived / control variables — NOT config

Computed by the package; fall out once the knobs above are set. No capture:
- `qryJulianStart` / `qryJulianStartDate` / `aaStartF0015` — Julian conversion
  of `aaStartDateGr` (T-SQL, runs on **RRLocal** = SQL Server).
- `qryminbatch` / `qryMinGL` / `qryMinUKID` / `qryDateF43121` / `qry*Date` —
  high-water-mark filters for incremental pulls.
- `qryFxxxx` / `qryFxxxxRR` — the per-table extraction SQL (built from
  `dbowner` + date vars). Portable ANSI `SELECT`s.
- `qryF4096_exists` / `qrySourceConn` — existence/connection probes.

## 5. Extraction scope — ~30 JDE F-files

Master/constants: **F0006** (Business Unit), **F0008** (Date Fiscal Patterns),
**F0010** (Company Constants), **F0015** (Currency XR), **F1113**, **F41001**
(Inventory Constants), **F0011** (Batch Control), **F0901** (Account Master),
**F4095** (Distribution AAIs), **F4096** + **F4096old**, **F4101** (Item
Master), **F4102** (Item Branch), **F4105** (Item Cost), **F4108** (Lot),
**F30026** (Cost Component), **F41002**/**F41003** (UoM), **F4801** (Work Order).

Transactional (incremental + Init variants): **F0902** (Account Balances),
**F0911** (Account Ledger) + `Init`, **F41021** (Item Location), **F4111**
(Item Ledger/Cardex — `Changes`/`New` + `Update F4111 Changes`), **F4311**
(PO Detail) + `Update`, **F4211** (Sales Order) , **F42119** (S.O. History),
**F3106** (Routing), **F43121** (PO Receipts) + `Init` + `Update`.

**Key finding — incremental already exists.** The `Changes`/`New`/`Init`
variants + the high-water-mark date/batch queries are exactly the
delta-extraction the modernization plan called "Lever 1." It's built; the
overhaul refines/standardizes it rather than inventing it.

Also present: a **disabled** "Truncate destination tables" maintenance task
("leave disabled unless backing up the start date after the initial load").

## 6. Platform variance — driver only → ONE package (settled 2026-06-12)

Per the owner: **the extraction SQL is portable by design and works on all
three platforms; only the JDESource driver differs.** Control queries (Julian
etc.) run on RRLocal (always SQL Server).

**Settled: one package for everyone.** That's already current practice — the
owner ships the single package and repoints the JDESource connection string
(driver included) + sets the variables per customer. Swapping the OLE DB
provider on the one package is proven, so the cached-metadata risk is
theoretical, not real. **No per-platform fleet.** The earlier "3 packages"
decision is dropped.

## 7. Overhaul candidates (for Phase 1)

- **Hand-toggled tasks → config flags (the big one).** The package carries
  alternate paths switched by manually enabling/disabling tasks at install —
  exactly the "configure by hand" pain the overhaul kills. Convert each
  per-customer toggle into a **parameter** the package reads (conditional /
  precedence-constraint expression), so nobody edits the package per install:
  - **`F4096old` vs `F4096`** — JDE-version **column-name variant** (JDE
    renamed a column in F4096; new-name path enabled, old-name disabled; flip
    for older JDE). **Decision (owner, 2026-06-12): for net-new, DROP
    `F4096old`** and ship the single new-column path — net-new customers won't
    be on old-column JDE. Revisit only if one appears. (Not a parameter.)
  - Disabled in Prod today: `F4096old` container, "Truncate destination
    tables" (maintenance — stays a manual/operational switch), "F0015 Start"/
    "F0015 Stats" + a data flow (likely diagnostic — confirm, probably leave).
- **`ProtectionLevel` → `DontSaveSensitive`** (frees the `.ispac` from a
  per-machine user key — enables config-per-customer).
- **Standardize RRLocal driver** on `MSOLEDBSQL` (drop deprecated SQLNCLI11).
- **Derive** `ModInv`/`ModRnv` from licensed modules; `Dec*` from client
  decimals (count→10ⁿ). **Decimal pairing CONFIRMED (owner):**
  `DecExtCost`↔`ECST`, `DecUnitCost`↔`UNCS`, `DecQty`↔`PQOH`, `DecQtyCX`↔`TRQT`.
- **Bake vs parameterize** `RefreshDays`/`RefreshDaysRNV`/`aaStartDateGr`/
  `dbowner` — **needs discussion (§8.2)**, esp. the start date (likely
  per-customer).
- **F-file scope:** keep current ~30 as-is for net-new (owner, 2026-06-12).

## 8. Open questions for Phase 1

1. ~~Decimal pairing~~ **CONFIRMED** (owner): ExtCost↔ECST, UnitCost↔UNCS,
   Qty↔PQOH, QtyCX↔TRQT.
2. **Parameter set — RESOLVED (owner, 2026-06-12).** Two tiers:
   - **Initial-load-only** (set at Step 5, moot afterward): `aaStartDateGr` —
     the big-table history horizon, a deliberate **global buffer a few months
     before the period cutoff** (transaction timing). NOT derived from VALC's
     per-company cutoffs. Pairs with `InitLoad`. Re-set only on a full reset.
   - **Steady-state per-customer:** `RefreshDays` (default −35) /
     `RefreshDaysRNV` (default −90) — the incremental add/change/delete
     window. −35 is safe because finance doesn't backdate across periods;
     **raise per-customer** for the rare backdating shop, with a memory-cost
     caveat (bigger window → processing hiccups).
   - **`F4096` flip:** the only one, and possibly obsolete. **For net-new:
     drop `F4096old`, ship the single new-column path.** Revisit only if a
     net-new customer appears on old-column JDE.
   - **Date-related disabled toggles** (F0015 "Start"/"Stats", etc.): parked
     for their own discussion (owner).
3. ~~F-file scope~~ **stays as-is** for net-new (owner).
4. ~~F4096old dead?~~ **No** — version-compat alternate (see §7). Confirm the
   F0015 "Start"/"Stats" disabled tasks are diagnostic (leave) vs needed.

(Packaging settled in §6: one package for all platforms.)

---

## 9. Date horizon + the bootstrap (resolved 2026-06-12)

**Problem.** Every big-table container carries its own
`Date<table>` / `Date<table>Gr` / `qry<table>Date` trio. `qry<table>Date`
already derives smartly (table empty → global `aaStartDateGr`; else →
`max(existing date) + RefreshDays`), but hardcoded `122001` / `2022-01-01`
shadow values are baked per container — the dates the owner drills in to set.
Two compounding wastes: (1) a 2022 start while reconciling 2025-forward loads
~3 years of unneeded data; (2) the cleanup sprocs then **delete** it at
startup — pay to load, pay to delete.

**Horizon source = per-company period cutoffs** (owner). Caveat: those cutoffs
don't exist until data is loaded + the first setup proc runs — chicken-and-egg.

**Bootstrap breaks it (owner-scoped 2026-06-12, maps to existing containers):**
- **`Initialize`** container — connection test on each pipeline end (JDE
  source + RR local). Doubles as an install-readiness check.
- **`Companies`** container — loads the master/constants. "Has what we need,"
  runs quickly.
- **`usp6_002a_companies`** — populates `rcompanies`. Fast.
- Skip all transactional containers.

**Payoff.** Bootstrap (minutes) establishes companies + period cutoffs →
unlocks **licensing** + **handoff on day one, decoupled from the full load** →
and sets the **horizon** the full load consumes. The full load then pulls only
the retained window — nothing loaded-then-purged.

**Fix for Junior.** One horizon (from the bootstrap's cutoffs) drives the
global start date + every container's `Date<table>`; retire the hardcoded
shadows so nothing is hand-drilled. Bootstrap becomes a package **mode** (run
`Initialize` + `Companies` + setup, skip transactional) — in scope for the
net-new redesign. Reshapes the install ladder: **Step 4** config → **Step 4b
bootstrap** (companies/cutoffs → licensing + handoff) → **Step 5** full load
(horizon-bounded).

(`usp6_002a_companies` is an existing v6 proc — referenced as-is, not a
net-new object, so the v8-prefix rule doesn't apply.)
