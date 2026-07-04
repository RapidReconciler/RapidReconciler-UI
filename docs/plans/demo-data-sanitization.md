# Demo data sanitization — jdesource sweep + plan

Working doc for the demo-data process. **Status: list for owner to verify
before we write the executable steps.**

## The overall process (owner's plan, recorded here)

1. Rename the three RR databases: **Dev → Demo1, TR → Demo2, NA → Demo3**.
   - **Clean up the per-DB SQL Agent jobs after the rename** (missed on the Dev→Demo1 pass —
     found 2026-07-05). Each RR DB has an Agent job named after it with a *"Run A to B"* step
     (SSIS `create_execution`, carries `@env = <db>`) and a *"Run B to C"* step (`@database = <db>`,
     `EXEC usp6_001_run_b_to_c`). After a rename you must:
       - **Drop the old-named job** (e.g. the orphaned `RapidReconciler_Dev` job — its DB no longer
         exists; it was left pointing its B→C at `RapidReconciler_Demo1`, which is dangerous).
       - **Fix the renamed job's step targets:** `Run A to B` `@env` and `Run B to C` `@database`
         must both equal the NEW db name. Verified drift 2026-07-05: the `RapidReconciler_Demo1`
         job's `Run A to B` still had `@env = RapidReconciler_Dev`, and the leftover
         `RapidReconciler_Dev` job's B→C pointed at Demo1 (Demo1↔Dev cross-wired). NA/TR were correct.
     These are `msdb` mutations (need a Windows/Agent principal — rruser is read-only on msdb), so
     apply them via the same Windows-auth path the catalog ops use (or SSMS). NOTE: VALC's new
     LOAD path also refreshes `Run A to B`'s `@env`/params on every start, which self-heals the env
     drift for the load button — but the orphaned old job and the B→C `@database` still need this cleanup.
2. All three RR DBs **and their JDE sources** are backed up (post latest dacpac).
3. Sanitize identifying fields in each **JDE source** (`jdesource_dev`,
   `jdesource_tr`, `jdesource_na`) — same field list on all three.
4. **`jdesource_dev` only:** add **9 years** to every Julian date field so the
   old data reads as recent (see the date-shift section — kept separate from
   sanitization).
5. Full reset of the demo RR DBs, then reload from the sanitized JDE sources.

## Connection facts (so we don't repeat the password dance)

- SQL Server: `localhost,1433`. Working login: **`rruser` / `rruser`**
  (Windows/AzureAD auth is rejected; the local `valctest` row in Postgres did
  not authenticate).
- The per-client SQL creds live in **VALC's Postgres**, table
  `client_databases.db_password_encrypted` — **plaintext** (the column name is
  aspirational; code comment: *"stored as-is … encryption TBD"*). Read with
  `psql -h localhost -U valc -d valc` (pw `valc`).
- `INFORMATION_SCHEMA.*` returns nothing for `rruser` (permission-scoped views);
  use `sys.tables` / `sys.columns` / `sys.partitions` instead.
- JDE source DBs visible to rruser: `jdesource_dev`, `jdesource_na`, `jdesource_tr`.

## Table inventory (jdesource_dev) — row counts

| Table | Rows | What it is |
|---|--:|---|
| F0006 | 1,055 | Business Unit master |
| F0008 | 18 | Date fiscal patterns |
| F0010 | 11 | Company constants |
| F0011 | 369,781 | Batch control |
| F0013 | 0 | Currency codes (empty) |
| F0015 | 0 | Currency exchange (empty) |
| F0101 | 1,168 | Address Book (slim: number + name only) |
| F0901 | 204 | Account master |
| F0902 | 90 | Account balances |
| F0911 | 6,519,721 | Account ledger |
| F1113 | 0 | (empty) |
| F30026 | 735,530 | Item location detail |
| F3106 | 4,141,584 | (sd-prefixed; user/job audit) |
| F4095 | 15,808 | DMAAI / AAIs |
| F4096 | 3 | AAI (item/account ranges) |
| F41001 | 19 | Inventory constants |
| F41002 | 53,042 | UoM conversions |
| F41003 | 68 | UoM |
| F4101 | 64,417 | Item master |
| F4102 | 107,180 | Item branch/plant |
| F41021 | 19,235 | Item location / balances |
| F4105 | 362,504 | Item cost |
| F4108 | 0 | Lot master (empty) |
| F4111 | 7,066,351 | Item Ledger / Cardex |
| F4211 | 1,611,205 | Sales order detail |
| F42119 | 0 | Sales order history (empty) |
| F4311 | 204,253 | PO detail |
| F43121 | 499,195 | PO receiver / receipts |
| F4801 | 277 | Work order master |
| F9210 | 56,273 | **JDE data dictionary (system metadata)** |

Empty tables (F0013, F0015, F1113, F4108, F42119) need nothing.

---

## A. Sanitize — safe text overwrite (display-only, no integrity risk)

These are names / descriptions / free text / audit fields. They don't
participate in joins or the recon math, so they can be blanket-overwritten.

### Company & entity names
| Table | Column | JDE field | Suggested replacement |
|---|---|---|---|
| F0010 | `ccname` | Company name | `Demo Company ` + `ccco` |
| F0006 | `mcdl01` | Business-unit description | **realistic per BU** — a named plant/warehouse, distinct per BU (NOT all "Warehouse Lakeside"). Demo1: 9999998→`Lakeside Manufacturing Plant`, 9999679→`Harborview Distribution Center`. See the 2026-07-04 note. |
| F0101 | `abalph` | Address Book alpha name | `Account ` + `aban8` (customer/vendor) |
| F0901 | `gmdl01` | Account description | **realistic by object account** — an inventory GL ladder, NOT all "Raw Materials". Demo1: 140909→`Raw Materials Inventory`, 141818→`Purchased Parts Inventory`, 144545→`Work in Process`, 145454→`Packaging Materials Inventory`, 147272→`Finished Goods Inventory`. See the 2026-07-04 note. |
| F4096 | `fadl01` | AAI description | generic |

### Item descriptions
| Table | Column | JDE field | Note |
|---|---|---|---|
| F4101 | `imdsc1` | Item description | `Item ` + `imitm` (or themed faker) |

### Remarks / explanations / free text
| Table | Column | JDE field | Note |
|---|---|---|---|
| F0911 | `glexa` | Explanation – alpha (JE line name) | 6.5M rows — batch the UPDATE |
| F0911 | `glexr` | Explanation – remark | 6.5M rows |
| F4111 | `iltrex` | Cardex transaction explanation | 7.0M rows |
| F43121 | `prvrmk` | Receipt remark | |

### Reference / order / invoice numbers
**Out of scope** (owner: "orders and invoices are ok as is") — leave
`glr1`/`glr2`/`glpo`, `iltref`, `sdoorn`/`sdrorn`, `pdrorn`, `prvinv` untouched.

### User / audit (blanket set, e.g. to `DEMO`)
| Table | Columns |
|---|---|
| F0011 | `icuser` |
| F0911 | `gluser`, `gltorg` |
| F3106 | `sduser`, `sdpid`, `sdjobn` (4.1M rows) |
| F4111 | `iluser` (7.0M rows) |
| F43121 | `pruser`, `prtorg`, `prpid` |
| F9210 | `FRUSER`, `FRPID`, `FRJOBN` (optional — system metadata) |

---

## B. Keyed remaps — IN SCOPE, applied consistently across every carrying table

Build a **mapping table once**, then apply the identical mapping everywhere the
value appears, so joins and the recon math stay intact. Both remaps below run on
the JDE source *before* reload.

### Item numbers — 2nd & 3rd only (`LITM`, `AITM`); short item stays
Owner: scrub the **second and third** item number fields; the **short item
stays as is**.
- **Keep:** short item `imitm` / `…itm` (int) + `itemid` — the join backbone.
- **Remap:** `LITM` (2nd #) and `AITM` (3rd #), keyed on short item:
  - `LITM` columns: F4101 `imlitm` · F4211 `sdlitm` · F4311 `pdlitm` · F43121 `prlitm`
  - `AITM` columns: F4101 `imaitm` · F43121 `praitm`
  - (F4108/F42119 carry these but are empty.)
- Mapping source = F4101 (`imitm → newLITM, newAITM`); apply by joining each
  carrying table on its short item. Same short item ⇒ same new LITM/AITM everywhere.

### Account numbers — remap `OBJ` + `SUB`; keep `AID`; scrub descriptions
Owner: "account numbers give them away… aid need not change but objects and subs
should, plus descriptions."
- **Keep:** `aid` (account short ID). F0902 keys purely on `gbaid` ⇒ **F0902
  needs nothing** for this remap.
- **Remap `OBJ` and `SUB`** everywhere they appear:
  - F0901 `gmobj`/`gmsub` (master) · F0911 `globj`/`glsub` · F4095 `mlobj`/`mlsub`
    (DMAAI ranges) · F4096 `faobjf`/`faobjt` (object ranges) · F43121 `probj`/`prsub`
- **⚠ Two ripple effects that must be handled in the same pass:**
  1. **DMAAI ranges (F4095/F4096) must keep bracketing the same accounts** ⇒ the
     object remap must be **order-preserving (monotonic)**, and the SAME mapping
     applied to the range endpoints. A non-monotonic remap silently breaks AAI
     resolution.
  2. **Free-form account-input fields** embed the account string and must be
     regenerated from the new obj/sub: F0911 `glani`, F43121 `prani`/`prvani`
     (nchar 58). Confirm their format (likely `BU.OBJ.SUB`) and rebuild.
- Sanitize account **descriptions** `gmdl01` (already in section A).

### Business unit codes (`mcu`) & address numbers (`an8`)
Structural; identifying part is the name/description (section A). Leave the codes.

### Lot / location (`lotn`,`locn`)
F30026, F41021, F4105, F4111, F4211, etc. Usually codes — leave unless the
customer encodes names/dates into lot numbers (low priority).

---

## C. Leave alone
- **F9210** (data dictionary) — JDE system metadata; `FRCDEC` decimals are mined
  live by the app. Don't scrub beyond the optional user fields above.
- Currency/UoM/constants tables (F0013, F0015, F1113, F41002, F41003, F41001).
- All amount/quantity/cost columns (the demo needs real-shaped numbers).

---

## D. Dev-only: +9 years to every Julian date (separate from sanitization)

JDE Julian = `CYYDDD`. Add 9 to the year component (NOT +9000 to the int).

**Owner: ignore `InsertDate`/`ChangeDate` and all `*UPMJ` fields.** So those are
excluded; shift only the real JDE transaction/GL Julian dates:
- F0008 `cddfyj`, `cdd01j`–`cdd14j` (fiscal pattern boundaries — must shift with the data) + `cdfy` (year)
- F0010 `ccdfyj`
- F0011 `icdicj`
- F0911 `gldgj` (G/L date — drives period placement), `gldicj`
- F3106 `sddgj`, `sddicj`
- F4111 `ildgl` (cardex G/L date), `ilcrdj`
- F4211 / F42119 `sdtrdj`, `sdaddj`, `sddgl`
- F4311 `pdtrdj`, `pddgl`
- F43121 `prtrdj`, `prrcdj`, `prdrqj`, `prdgl`
- F4801 `WADRQJ`

**Excluded** (owner): every `InsertDate`/`ChangeDate`; `ibupmj`, `sdupmj`,
`pdupmj`, `prupmj`, `FRUPMJ`.

**Rule (owner): any readable-English column name is NOT JDE — it's RR-added.**
JDE columns are always coded (`ildgl`, `gldgj`, `mcdl01`). RR-added columns
(`perioddate`, `datelev`, `transflag`, `itemid`, `costlevel`, `primaryuom`,
`InsertDate`/`ChangeDate`, `rrtax`, …) are repopulated on reload ⇒ **leave them
entirely** — no sanitize, no shift. `perioddate` follows the shifted JDE GL date
automatically on reload.

**F4111 schema note (owner, 2026-07-01):** owner physically **removed the
non-native (non-`IL`-prefixed) text columns from `PRODDTA.F4111` in `jdesource_dev`
+ `jdesource_na`** — they weren't real JDE fields. Both now carry 26 columns: the
native `IL*` set + the two int audit columns `InsertDate`/`ChangeDate` (kept).
**No impact on sanitization** — every F4111 field the scrub touches is native `IL*`
and still present (`iluser`, `iltrex` [§A]; `ilmcu`, `ilkco`, `ilkcoo` [§B];
`ildgl`, `ilcrdj` [§D]). The removed columns were ones the scripts never
referenced. `jdesource_tr` was NOT slimmed — it keeps the full native extract
(72 cols); the scrub still runs against it unchanged (see the NA/TR runbook).

Fiscal-YEAR columns that also need +9 for consistency (the delicate part — must
stay aligned with F0008/F0010 so periods line up):
- F0902 `gbfy` (balances keyed by fiscal year), F0008 `cdfy`.

---

## Decisions (verified with owner 2026-06-30)
1. **Item numbers** — remap the **2nd (`LITM`) and 3rd (`AITM`)** item numbers
   only; **short item stays**. Keyed cross-table remap (section B).
2. **Account numbers** — remap **`OBJ` + `SUB`** (keep `AID`) + scrub
   descriptions; monotonic, with F4095/F4096 ranges and `ani` fields handled
   (section B).
3. **Orders / invoices** — out of scope, leave as-is.
4. **Dates** — ignore `InsertDate`/`ChangeDate` and `*UPMJ`; shift only real JDE
   Julian dates + fiscal years (section D).
5. **Fake-value style** — **themed / realistic** ("look unfabricated") — curated
   plausible company, item, account, and user names, not `Account 1234`.

## Still to verify (I can check these myself, no owner needed)
- `glani` / `prani` / `prvani` format → how to rebuild from new obj/sub.
- Order-preserving obj remap that keeps F4095/F4096 ranges valid.
- Source of themed names (curated list / faker dataset).

(Resolved: `perioddate` etc. are RR-added, not JDE — repopulated on reload, left
alone. General rule recorded in section D.)

---

## Diagnosis 2026-07-02 — the "sentinel accounts" bug is NOT the obj/sub remap

Investigated the reported "OBJ/SUB remap broke DMAAI/GL-class → sentinel accounts"
on the live `RapidReconciler_Demo1` (loaded from sanitized `jdesource_demo1`).
**The obj/sub remap is fine; the real break is elsewhere.** Evidence:

- **Symptom confirmed:** `RInvAccountList` (from `v6_004_account_list`) in Demo1 =
  **4 rows, all sentinels, 0 real resolved accounts.** NA (un-scrubbed) = 30 rows /
  12 real; TR = 9 / 5 real. The sentinels (`xxxxxxxx`/"outside operations",
  `yyyyyyyy`/"gl class not in base table") are emitted one-per-company **always** —
  they are not the bug; the bug is **zero real accounts**.
- **Obj/sub remap is internally consistent** (rules it OUT as the cause):
  `jdesource_demo1` F0911 → F0901 object resolution = **0 miss** (11/11 distinct
  posted objects resolve). An inconsistent map would make F0911 miss too. The high
  F4095→F0901 obj miss (75/86) is **native AAI-template breadth** vs a 204-account
  chart (F4095 references bands 40s/50s/70s/80s the COA/ledger never use), not a
  scrub defect — 0 of the 75 missing objects appear in F0911.
- **Root cascade:** `v6_004_account_list`'s two real branches both yield 0 because
  **`RAccountInstr` has 4277 rows but 0 tagged `'base aai'`** (NA has 1296). The
  setup proc (`usp6_002_set_up`) DID run (`RAccountInstr` + `RDMAAIStaging` 14,639
  populated) — but the **base-AAI classification produced nothing**. With no base
  AAI, `v6_004_base_accounts` is empty → `ritems` account resolution is garbage
  (`ritems.shortaccount` never matches `f0901.gmaid`) → account list is all sentinels.
- **Where the base-AAI tag comes from:** `usp6_002b_aai_staging` + `v6_003_expanded_aais`,
  driven by **F4096 flex rules** (fields `faanum`/`faco`/`faobjf`/`fasfit`/`fafile`,
  table 4152) and the flex-consistency gate in `usp6_002_set_up` (lines ~100-153:
  *"all companies must use the same flex rules; if not, separate RR databases are
  required"*). The scrub leaves F4096 obj-ranges unchanged but the base-AAI path
  reads F4096 **company/flex** fields — the suspects are (a) F4096 `faco` (company)
  remap vs the flex-consistency check, (b) GL-class alignment F4095↔items, or
  (c) a Demo1-reload dry-run sequencing artifact (the reload was a hand-run per the
  NA/TR runbook §C).

**Action before any re-scrub+reload (which runs HOURS):** do NOT redo the obj/sub
remap — it's correct.

### PINNED root cause 2026-07-02 — `RCompanies.AAIDocType` is blank (NOT a scrub bug)

The base-AAI tag in `v6_003_expanded_aais` (line 19) fires only when
`a.tablenumber = '4152' AND comp.aaidoctype = a.doctype` (RCompanies.AAIDocType ==
the staging row's doctype). Compared Demo1 vs NA:

| | `RCompanies.AAIDocType` | rdmaaistaging 4152 doctypes | base aai |
|---|---|---|---|
| NA (works) | `PI` | `PI` | 1296 |
| **Demo1** | **`` (blank)** | `99`,`IP`,**`PI`** | **0** |

Demo1's DMAAI staging **is fine** — it has `PI` rows for table 4152. Read-only proof:
with `AAIDocType='PI'`, **56 base-AAI rows tag and all 56 resolve to a real F0901
account** (mcu+obj+sub). So the sanitized F-tables are correct; the obj/sub/mcu
remap is consistent.

**Why blank:** `usp6_002a_companies` hardcodes `AAIDocType='PI'` **only on the
INSERT of a newly-licensed company** (line 43), guarded by `not exists` (line 58).
Demo1's companies were created by the VALC **bootstrap** (SSIS BOOTSTRAP) with the
column default `''`, so the RR setup's insert skipped them (already present) and they
kept blank. `usp6_002a` otherwise only reads `max(aaidoctype)` — a blank never
self-heals. This is a **bootstrap/reload gap, not scrubbed data.**

**Fix (cheap — no re-scrub, no source reload):**
1. `UPDATE RapidReconciler_Demo1.dbo.RCompanies SET AAIDocType='PI' WHERE RTRIM(ISNULL(AAIDocType,''))='';` (2 rows)
2. Rebuild the DMAAI/account tables: re-run `usp6_002_set_up` (it truncates+rebuilds
   `raccountinstr` from `v6_003_expanded_aais`) — or the full B→C (`usp6_001_run_b_to_c`).
   Then `RInvAccountList` resolves real accounts (verify: real_obj_rows > 0).

**Durable fix (ships in dacpac; matters for Demo2/Demo3 + every VALC-bootstrapped
install):** make `usp6_002a_companies` also SET `AAIDocType='PI'` for **existing**
companies (not just on insert) — e.g. an `UPDATE rcompanies SET AAIDocType='PI'
WHERE RTRIM(ISNULL(AAIDocType,''))=''` after the insert block — OR set it in the
Demo1/2/3 reload runbook step before B→C. Otherwise every bootstrap-then-load DB
reproduces the empty-AAIDocType → zero-inventory-accounts bug.

### APPLIED + verified 2026-07-02
- Durable patch added to `RapidReconciler-DB/.../usp6_002a_companies.sql` (UPDATE
  existing companies' `AAIDocType='PI'` when blank) — **uncommitted; ship in the
  next DB tag + dacpac.** Deployed to `RapidReconciler_Demo1` via CREATE OR ALTER.
- Re-ran `usp6_002_set_up` (set aaidoctype via the patched proc, rebuilt
  raccountinstr + RInvAccountList) then `usp6_001_run_b_to_c` (no params — it takes
  none) on Demo1.
- Result: base AAI **0→55**, RInvAccountList real accounts **0→17**,
  `v6ui_raccountsummary` **0→153**. Demo1 inventory reconciliation resolves real
  accounts. No re-scrub / no source reload was needed.

---

## Realistic account + BU descriptions (owner 2026-07-04) — replaces the generic §A placeholders

Owner: everything reading "Raw Materials Inventory" / "Warehouse Lakeside" is unrealistic —
account descriptions should **vary by object account**, BU descriptions **by business unit**.
Descriptions come from `F0901.gmdl01` (account) and `F0006.mcdl01` (BU); the inventory list
surfaces them via `v6_004_account_list → RInvAccountList`. Source tables are in the **PRODDTA**
schema (`jdesource_demo1.PRODDTA.F0901`, etc.); the RR-DB copies (`RapidReconciler_Demo1.dbo.*`)
are in `dbo`. `mcmcu` is right-justified — match with `LTRIM(RTRIM(mcmcu))`, not `RTRIM` alone.

**Applied 2026-07-04** to BOTH the source `jdesource_demo1.PRODDTA` (durable across reload) AND
the loaded `RapidReconciler_Demo1.dbo` (immediate), then rebuilt the list
(`truncate rinvaccountlist; insert … select * from v6_004_account_list`). Object→description and
BU→description (Demo1's sanitized values):

```sql
-- account descriptions by object account (F0901.gmdl01)
UPDATE <F0901> SET gmdl01 = CASE LTRIM(RTRIM(gmobj))
    WHEN '140909' THEN 'Raw Materials Inventory'
    WHEN '141818' THEN 'Purchased Parts Inventory'
    WHEN '144545' THEN 'Work in Process'
    WHEN '145454' THEN 'Packaging Materials Inventory'
    WHEN '147272' THEN 'Finished Goods Inventory'
    ELSE gmdl01 END
WHERE LTRIM(RTRIM(gmobj)) IN ('140909','141818','144545','145454','147272');   -- 132 rows

-- BU descriptions by business unit (F0006.mcdl01)
UPDATE <F0006> SET mcdl01 = CASE LTRIM(RTRIM(mcmcu))
    WHEN '9999998' THEN 'Lakeside Manufacturing Plant'
    WHEN '9999679' THEN 'Harborview Distribution Center'
    ELSE mcdl01 END
WHERE LTRIM(RTRIM(mcmcu)) IN ('9999998','9999679');                            -- 2 rows
```
Run against `jdesource_demo1.PRODDTA.F0901`/`.F0006` (source) — and, for immediate effect
without a reload, also against `RapidReconciler_Demo1.dbo.F0901`/`.F0006` + rebuild
`RInvAccountList`. **NOT the BU/account *numbers***: those are recon keys (tie to F0911/F4111/
RItems) — re-keying is the §B remap, not a description change.

**Demo2/Demo3 (NA/TR):** apply the analogous mapping with **their own** sanitized object accounts
and BU codes (each source is scrubbed independently, so the object/BU values differ) — pick the
same inventory-ladder semantics (raw material / purchased parts / WIP / packaging / finished goods)
per their object accounts, and a distinct plant name per BU. Add to the NA/TR runbook.
