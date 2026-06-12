# SSIS parallel-load restructure — VS worksheet

**Status:** drafted 2026-06-12, approved. Builds on the date consolidation +
bootstrap work. Net-new package, full-reload test ahead.

## Goal

Let the **independent** transactional containers run concurrently instead of in
a fixed serial chain, **throttled per-customer** so a small server stays safe.
Ship parallel-capable, **default serial** (`MaxConcurrentExecutables = 1`).

## Dependency graph (mapped + verified)

```
Initialize → Companies → Compute Load Dates        ← gate !BootstrapOnly already here
   → ┌─ Inventory ─┬─ Inventory Supplemental        (Inv Supp + Orders look up
     │             └─ Orders                          RR-local f4111 from Inventory)
     ├─ General Ledger                               (self-contained)
     └─ Receipts                                     (leaf)
   → Complete   (after all 4 leaves)
```

- **`Inventory` must precede `Inventory Supplemental` + `Orders`** (their `f4111`
  lookups hit the RR-local table Inventory loads — confirmed `RRLocal`).
- **`General Ledger`, `Receipts`** are independent of everything but
  `Compute Load Dates`.
- **No wrapper Sequence Container needed** — the `BootstrapOnly` gate already
  sits on `Companies → Compute Load Dates`, so everything below only runs in a
  full load. We just rewire the precedence.

## 1. Precedence rewiring (top level)

**Delete these 4 serial-chain edges:**
- `Inventory Supplemental → Orders`
- `Orders → General Ledger`
- `General Ledger → Receipts`
- `Receipts → Complete`

**Add these 7 (keep `Compute Load Dates → Inventory` and `Inventory → Inventory
Supplemental`):**
- `Compute Load Dates → General Ledger`
- `Compute Load Dates → Receipts`
- `Inventory → Orders`
- `Inventory Supplemental → Complete`
- `Orders → Complete`
- `General Ledger → Complete`
- `Receipts → Complete`

**Resulting edge set (full-load path):**

| From | To |
|---|---|
| Compute Load Dates | Inventory |
| Compute Load Dates | General Ledger |
| Compute Load Dates | Receipts |
| Inventory | Inventory Supplemental |
| Inventory | Orders |
| Inventory Supplemental | Complete |
| Orders | Complete |
| General Ledger | Complete |
| Receipts | Complete |

`Complete` ends up with 4 inbound edges (default **Logical AND** → runs after all
four leaves succeed). Leave all constraints on the default **Success**.

## 2. Throttle: `MaxConcurrentExecutables`

- **Bake the package property to `1`** (package selected on Control Flow →
  Properties (F4) → `MaxConcurrentExecutables = 1`). `1` = serial = today's
  behavior on every server.
- **Config-driven per customer:** `SsisConfigService` writes a row for
  `\Package.Properties[MaxConcurrentExecutables]` (default `1`, `valc.ssis.max-concurrent`).
  Because the SQL Server config is **table-driven**, the package applies whatever
  row is present at run time — **no design-time config-tree change needed**. A
  capable customer's install raises the value (e.g. `3`/`4`); a small box stays
  at `1`.
- `-1` (SSIS default = CPUs + 2) is *not* used — we want an explicit, conservative
  default.

## 3. Per-container internals — UNCHANGED

Do **not** touch anything inside the containers. The intra-container orderings
(both caches `Load Objects→F0902`, `Short Items→Costs/Item Master/UOMs`; the
lookup chains `F4095→F09xx`, `F4101→UOMs/Costs`, `F4102→F4101`; `Min UKID →
Get F4111`) stay exactly as they are — they're what keep each container correct
regardless of how many run in parallel.

## 4. Validate

1. **Build Solution.**
2. **Full-reload test at `MaxConcurrentExecutables = 1`** — confirm row counts /
   results match a run of the pre-restructure package (parity; same order class).
3. **Then bump to `2`–`4` and re-run** — confirm identical results with the
   independent containers overlapping (Inventory ∥ GL ∥ Receipts; then Inv Supp ∥
   Orders). Watch the JDE source box's load — the throttle is the safety valve.
