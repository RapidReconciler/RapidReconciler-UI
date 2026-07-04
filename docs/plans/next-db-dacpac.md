# Next DB dacpac — deferred changes (build + TEST ON DEMO2, not Demo1)

Owner directive (2026-07-04): collect DB proc/schema changes found during the from-empty
B→C walk here; implement them in a **new dacpac** and **test on Demo2 when it's built** —
do **not** apply to Demo1 (Demo1 is up on the current known-good state).

---

## 1. Cost/UOM stamp-at-load (perf — data_prep stage 2)
Move the two F4101-lookup passes out of `usp6_006_inventory_data_prep` to LOAD time, the same
way perioddate was moved (stage 1, `usp8_stamp_f4111_new`):
- `add cost level and primary uom to cardex` — `F4111 set costlevel=imclev, primaryuom=imuom1 … join F4101 on ilitm=imitm` (full 3.22M, batched; ~414s on a full reload — the single biggest data_prep pass).
- `add cost level and uom to f41021` — same lookup into F41021 (`join F4101 on liitm=imitm`, ~19K rows).

**Difference from perioddate:** perioddate was pure row-math (zero deps). Cost/uom **join F4101**,
so the load-time stamp has a **load-order dependency: F4101 must load before F4111/F41021 get
stamped.** F4101 loads in A→B (~38K rows), so it's available. Two implementations: an SSIS Lookup
against F4101 in the F4111/F41021 dataflow, or a post-load Execute SQL Task running that same
`UPDATE … join F4101` (mirrors `usp8_stamp_f4111_new`).
**Do NOT move** the third pass (`add itemid to f4111`) — it joins RItems on the just-stamped
cost/uom and RItems is built inside data_prep, so it stays in B→C.
Payoff: removes the biggest data_prep pass + a redundant full-F4111 scan every incremental cycle.
Spec: [`f4111-stamp-perioddate-at-load.md`](f4111-stamp-perioddate-at-load.md) (stage 2).

## 2. Order-purge from-empty guard
`usp6_maint_purge_order_tables` (row 4 of `usp6_001`) runs **before** 006 builds RTransactions.
Its keep-list = orders referenced by RTransactions rows with `periodends > @orderdate` — **empty on
a first/from-empty run** — so it would delete every aged order with no protection (measured on
Demo1: **539,169 / 709,104 F4211 (76%) + 31,580 / 128,564 F4311 (25%)**). Hits any customer's
first-ever B→C and any full-reset→reload→B→C.
**Fix (recommended):** guard the order purge to skip when RTransactions is empty
(`IF NOT EXISTS (SELECT 1 FROM rtransactions) → skip`); the retention purge is a steady-state
cleanup that the next cycle performs correctly once RTransactions is populated.
Also sanity-check `usp6_maint_purge_rnv_tables` for the same empty-RTransactions exposure.

## 3. Enforce In-Transit / PO-Receipts module gate on 009a / 009b  (owner 2026-07-04)
Requirement: if **In Transit** is unchecked in VALC → skip `usp6_009a_in_transit`; if **PO receipts**
(= the **RNV** module) is unchecked → skip `usp6_009b_rnv`.
**NOTE — a gate already exists** in `usp6_001_run_b_to_c`:
```sql
if (select enabled from usertabnames where usertab = 'in transit') = 1  → usp6_009a_in_transit
if (select enabled from usertabnames where usertab = 'rnv') = 1          → usp6_009b_rnv
```
So the likely gap is **not** the proc gate but the **VALC checkbox → `usertabnames.enabled`
wiring**. Action: (a) verify unchecking "In Transit"/"PO receipts" in VALC actually sets the
matching `usertabnames.enabled = 0`; (b) if it does, no dacpac change is needed (VALC-side only);
(c) if the intent is defense-in-depth regardless of caller, add a self-guard at the top of
`usp6_009a_in_transit` / `usp6_009b_rnv` that no-ops when its `usertabnames` flag is 0.
(These procs are the transit/RNV builds whose output no UI surface reads today, so skipping them
when unlicensed also saves real B→C time.)

---

## Related doc fix (not a dacpac change)
`GSIRRTech/database-spec.html` §2a Table 4 row 8 says the 809K rows were "genuinely-new rows
silently dropped / accountant reads a short table." The from-empty walk + owner confirm those
809,143 F4111 rows are **pre-fiscal-calendar-start** and correctly excluded by
`v6_006_trans_new_rows` (they stay `transflag=0` as steady state; correct RTransactions =
2,414,186). The swallowed-**error** code defect (A) was real, but the **impact wording overstates
data loss** — correct it to "these are legitimately filtered pre-calendar rows, not lost data."
