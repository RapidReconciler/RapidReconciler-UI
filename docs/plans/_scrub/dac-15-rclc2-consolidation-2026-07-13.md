# DAC-15 — RCardexLedgerCompare2 index consolidation (spec)

**2026-07-13 · held (schema-only, no customer data) · DAC-15 sub-item.**

## Why

`RCardexLedgerCompare2` (RCLC2) is the txv classifier's working table: TRUNCATE +
rebuilt every B→C, then read by the classifier chain (`usp8_txv_*`) and the UI
(via `v6_inv_trans_offset_summary` → the reconciling-items surface). It carries
**8 non-clustered indexes**, every one rewritten on every load — 8× index-write
amplification on a fully-rebuilt table. The win is fewer indexes → less load-write
cost, without regressing the read paths.

## Usage (Demo2, today's B→C)

Classifier-side is representative (the B→C ran the classifier). **UI-side reads are
NOT exercised** (no UI browsing since the 2026-07-10 SQL restart) — the load-bearing
caveat below.

| Index | Key | seeks | scans | writes |
|---|---|---|---|---|
| `_subtype` | SubType | **45** | 4 | 46 |
| `_periods` | CompanyNumber, recstatus | **43** | 5 | 51 |
| `_recstatus` | recstatus *(16-col include)* | **42** | 5 | 72 |
| `_transreport` | CompanyNumber, DocType, DocNumber | 11 | 0 | 18 |
| `_je` | CompanyNumber, ShortAccount | 6 | 0 | 79 |
| `_ic` | CompanyNumber, OrigOrder | 0 | 4 | 27 |
| `_subtype2` | CompanyNumber, ShortAccount, SubType | 3 | 0 | 46 |
| `_order` | OrderNumber *(12-col include)* | 0 | 1 | 72 |

## Clusters + proposal (8 → 5)

**1. recstatus cluster — `_periods` + `_recstatus`.** Both high-seek (43 / 42). Keep
`_periods` (company-scoped `(CompanyNumber, recstatus)` — the common classifier path).
`_recstatus` keys on recstatus ALONE with a fat **16-column include** — the single
biggest write-cost item here. Its 42 seeks mean an all-company-by-recstatus path is
real, so don't drop blind — but **trim the 16-col include to what the seeking queries
actually project** (validate against the `usp8_txv_*` predicates). Likely keep both
keys, shrink `_recstatus`'s include hard.

**2. subtype / account cluster — `_subtype` + `_subtype2` + `_je`.** Keep `_subtype`
(SubType, 45 seeks — the hot one). **Merge `_je` + `_subtype2` → one index**: shared
`(CompanyNumber, ShortAccount)` prefix, both low-use (6 / 3 seeks). New index keyed
`(CompanyNumber, ShortAccount, SubType)` INCLUDE (`Comment, DocType, OrderType,
PeriodEnds, Variance, Batch, DocNumber`) — the union of both includes, covering both
patterns. 3 → 2. (Resolves the DAC-15 "for-review" pair as a merge, not a free drop.)

**3. doc / order cluster — `_transreport` + `_order` + `_ic`.** Keep `_transreport`
(11 seeks). `_order` (0 seeks, 1 scan, 12-col include, 72 writes) and `_ic` (0 seeks,
4 scans) are **drop candidates** — but gated (below): the UI's order-lookup paths
didn't run since restart, so classifier-zero ≠ unused.

**Proposed set: `_periods`, `_subtype`, `_recstatus`(include trimmed), `_transreport`,
`_acct`(merged je+subtype2) — 8 → 5**, dropping `_order` + `_ic` *if* the gate clears.

## Validation gate (mandatory — the DAC-15 lesson)

Classifier usage is representative; UI usage is not (proven at the DAC-15 level by
`ix7_f0911_icut` reading zero yet being critical). So before any drop:

1. Run a representative **UI session** (analyst Transaction Variance + accountant
   Overview/Accounts) **+ a B→C**, so both read paths register.
2. Re-check RCLC2 usage — confirm `_order` / `_ic` (and the merge inputs) are still
   read=0 across BOTH classifier and UI.
3. Apply to a dev DB, re-run B→C, **tie-out**: row-identical classifier output +
   no query-plan regression on the `usp8_txv_*` procs and the reconciling-items view.
4. Model in SSDT (`v8`/canonical case, BOM+CRLF); measure the load-write delta.

**No drops without this gate + owner OK.**

## Expected win

8 → 5 NC indexes on a table rebuilt every B→C ≈ **~40% fewer index writes** on the
RCLC2 load, plus footprint (trimming `_recstatus`'s 16-col include is the biggest
single cost). All high-seek read paths preserved. On Demo2 the table is only ~10 MB,
but the write-amplification ratio is schema-wide and scales to a real customer's
volume — this is a load-time win, not a query win.

## Related
`RapidReconciler-DB/docs/dac-15-index-audit.md` (the static analysis this extends);
DAC-15 WORKLIST row (the DMV pass that surfaced RCLC2 as the real target).
