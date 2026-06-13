# SSIS per-container gating — VS worksheet (preload by group)

**Status:** drafted 2026-06-13. Builds on the parallel-load restructure
([`ssis-parallel-load.md`](ssis-parallel-load.md)) and the catalog model
([`ssis-catalog-reversal-spec.md`](ssis-catalog-reversal-spec.md)). Net-new
package; goal verified by the Step-5 live progress card.

## Goal

Let an execution run **one container group** instead of the whole package, so the
big incremental F tables can be **preloaded by group during business hours** —
rough, not perfectly synced — before the scheduled off-hours full load. Because
the large tables are already **incremental**, that off-hours run then only deltas
them (fast) + truncate-reloads the small ones → tight point-in-time → more
accurate.

The mechanism mirrors the existing **`BootstrapOnly`** gate: a Boolean package
parameter drives a **precedence-constraint expression** on the edge feeding each
container group. Default `True` = every group runs = **today's full-load behavior
is unchanged**.

## Container groups (from the parallel-load graph)

```
Initialize → Companies → Compute Load Dates        ← gated by !BootstrapOnly (exists)
   → ┌─ Inventory ─┬─ Inventory Supplemental        RunInv
     │             └─ Orders
     ├─ General Ledger                               RunGL      (independent root, F0911/F0902)
     └─ Receipts                                     RunReceipts (independent root, F43121)
   → Complete   (Logical AND of the 4 leaves)
```

The three independent roots — **Inventory** (F4111), **General Ledger**, **Receipts**
— are the preload candidates. Inventory Supplemental + Orders depend on Inventory's
RR-local F4111, so they ride with `RunInv` (no separate flag for now).

## VS steps (SSDT-BI)

### 1. Add three package parameters

Control Flow → **Parameters** tab → add (same shape as `BootstrapOnly`):

| Name | Type | Default | Sensitive |
|---|---|---|---|
| `RunInv` | Boolean | `True` | No |
| `RunGL` | Boolean | `True` | No |
| `RunReceipts` | Boolean | `True` | No |

**Package** parameters (not project), so they can be set per execution like
`BootstrapOnly` / `InitLoad`.

### 2. Put an expression on each group's entry constraint

Double-click the precedence constraint (the arrow) **from `Compute Load Dates`
into each group root**, then:

- **Evaluation operation:** `Expression and Constraint`
- **Value:** `Success` (leave as is)
- **Expression:**

| Constraint (arrow) | Expression |
|---|---|
| `Compute Load Dates → Inventory` | `@[$Package::RunInv] == True` |
| `Compute Load Dates → General Ledger` | `@[$Package::RunGL] == True` |
| `Compute Load Dates → Receipts` | `@[$Package::RunReceipts] == True` |

When the expression is `False`, that path is **not taken** — the container (and,
for Inventory, its `Inventory Supplemental` + `Orders` children) is skipped. A
skipped path is **not a failure**; the package still ends Succeeded.

### 3. Leave `Complete` exactly as it is

`Complete` keeps its **Logical AND** of the four leaf Success constraints. The
nice consequence: on a **partial** run (some `Run*` = False) the AND isn't
satisfied, so `Complete` is **skipped** — which is what you want for a rough
preload (no final reconciliation/stamp). On a **full** run (all three `True`,
the default) every leaf fires and `Complete` runs as today. No edit needed.

### 4. Build the `.ispac`

Rebuild headlessly (`devenv.com /Rebuild`) or via the IDE, then drop the new
`.ispac` over `artifact-store/8/` (or re-sync the release). **No environment
change needed** — the three params default `True`, so the deployed environment's
18 bindings are untouched; VALC sets the `Run*` flags **per execution** only when
preloading a group.

## VALC side (Claude — after the params exist)

Mirrors `startRun`'s `BootstrapOnly`/`InitLoad` handling:

- Step-5 left card gets **per-group preload buttons** (Inventory / General Ledger
  / Receipts). Each fires `catalog.create_execution` with `BootstrapOnly = False`
  and only its own `Run*` = `True`, the others `False` (`set_execution_parameter_value`,
  object_type 30, the new Boolean params).
- A full load leaves all three at their `True` default → unchanged.
- The Step-5 **right-card progress display already watches it** — pick the DB,
  fire a group, watch that group's tables climb (▲) live.

## Verify

1. Deploy the rebuilt `.ispac` (Step 4).
2. Preload **General Ledger** only → on the dev catalog, only F0911/F0902 climb;
   F4111/F43121 stay flat; the execution ends Succeeded and `Complete` is skipped.
3. Run a **full load** (defaults) → all groups run, `Complete` fires — same as today.

## Notes / future

- Finer than the three roots (e.g. `Inventory` without `Inventory Supplemental`)
  = add `RunInvSupp` / `RunOrders` on the `Inventory → …` edges the same way.
  Not needed for the preload-the-big-F-tables goal.
- `ModInv` / `ModRnv` stay as the **module** gates (licensed modules); the `Run*`
  flags are an orthogonal, finer **per-run** selection for preloading.
