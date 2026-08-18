# Cardex 006b netting coverage analysis

Read-only investigation, 2026-07-16. No writes anywhere except this file. No B->C, reset, reload, or deploy was run. Live queries were bounded SELECTs against the three demo databases.

## Headline verdict

The owner's suspicion is mostly **refuted for the current proc**. The note that "usp6_006b ignores the cost-method/level grain and the account-invariant partition" describes the pre-build-178 version. Build 178 hardened both. Every netting pass now keys on `shortaccount` (account never crossed) and gates the netting grain by cost method and cost level. The code confirms it and the live seeded data confirms it: 7 of the 8 injected variances survived with their exact seeded values, and nothing netted across accounts, companies, or cost methods.

There is one real defect. The two "flip Quantity to Amount" passes (lot and location) check the net at a fine grain but apply the flip at a coarser grain, because their UPDATE join omits `location` and `lot`. A genuine quantity variance at one location can be zeroed and relabeled Amount when a different location or lot for the same item, branch, and account nets to near zero. This is a false negative, and it is worst under standard cost, where a quantity shortfall drives a proportional dollar shortfall and the relabel misroutes the analyst to a dollars-only adjustment instead of a quantity fix.

Two stale-registry hazards surfaced along the way, and they matter more than the netting question in the short term. See section 6.

## 1. How 006b actually nets, pass by pass

`usp6_006_inventory` calls `exec usp6_006b_cardex_variance 0` at line 448, after `RPerpetualInv` is built and before the as-of pass. The proc writes three columns on `rperpetualinv` in place: `estunits` (net quantity variance), `baselinevar` (net dollar variance), and `reason` (`Quantity`, `Amount`, or empty). `rperpetualinv` has a clustered PK on `itemid` and one row per item/branch/location/lot, so every row is already at the finest lot grain.

Column locations, since they trip people up: `CostMethod` lives on `rperpetualinv`, `costlevel` lives on `ritems`, `threshold` lives on `rcompanies`.

Pass 0a, perpetual variance (lines 47-66). Per row. `estunits = (quantityincardex - baselineqic) - (quantityonhand - baselineqoh)`. `baselinevar = round((amountincardex - baselineaic) - (amountonhand - baselineaoh), 2)`. Delta of deltas from the frozen baseline. Trash accounts (`xxxxxxxx`, `yyyyyyyy`) forced to zero. Sign is cardex minus on-hand.

Pass 0b, perpetual reason (lines 68-89). Clears all reasons, then sets `Quantity` where `abs(estunits) > 0`, else `Amount` where `abs(baselinevar) > 0`, else empty. Per row.

Passes 1 to 4, flip Quantity to Amount (lines 98-236). Where the quantity variance offsets to near zero within a grain but the dollars do not, the residual is treated as an Amount problem, so these set `reason = 'Amount'` and `estunits = 0` on rows currently flagged `Quantity`.

| Pass | Grain checked (GROUP BY) | Cost-method gate | UPDATE join grain | Threshold |
|---|---|---|---|---|
| 1, lot | branch, item, account, location, lot | none, all methods | branch, item, account | `abs(sum(estunits)) < 0.05` |
| 2, location | branch, item, account, location | `09` or (`02` and level 1/2) | branch, item, account | `<= 0.05` |
| 3, branch | branch, item, account | `09` or (`02` and level 1/2) | branch, item, account | `<= 0.05` |
| 4, item | item, account | `02` and level 1 | item, account | `<= 0.05` |

Passes 5 to 8, net the variance away (lines 245-392). Where both the dollar net is at or under the company threshold and the quantity net is at or under 0.09, clear the reason to empty.

| Pass | Grain checked (GROUP BY) | Cost-method gate | UPDATE join grain | Threshold |
|---|---|---|---|---|
| 5, lot | branch, item, account, location, lot | none, all methods | branch, item, account, location, lot | dollars <= threshold and qty <= 0.09 |
| 6, location | branch, item, account, location | `09` or (`02` and level 1/2) | branch, item, account, location | dollars <= threshold and qty <= 0.09 |
| 7, branch | branch, item, account | `09` or (`02` and level 1/2) | branch, item, account | dollars <= threshold and qty <= 0.09 |
| 8, item | item, account | `02` and level 1 | item, account | dollars <= threshold and qty <= 0.09 |

The intended grain ladder from the build header:

- Method 07 (Standard): nets only at location/lot. Passes 2, 3, 4, 6, 7, 8 all exclude 07.
- Method 02 (WAC) cost level 1: item-wide (passes 4, 8).
- Method 02 cost level 2: branch (passes 3, 7) and location (passes 2, 6), not item-wide.
- Method 02 cost level 3: location/lot only, like standard (excluded from the level-1/2 gate).
- Method 09 (Actual): lot to location to branch, not item-wide. Legacy behavior, still account-partitioned.

## 2. The cost-method/level and account-invariant question, confirmed or refuted

**Account-invariant partition: confirmed present.** Every one of the eight netting passes includes `shortaccount` in both the GROUP BY and the UPDATE join predicate (`and b.shortaccount = c.shortaccount`). A variance cannot net across GL accounts. If a bad GL-class change posts equal and opposite variances to two accounts, both survive as separate rows rather than canceling at item level. The owner's suspicion that 006b ignores this is refuted by the code.

**Cost-method/level grain: confirmed present, with one hole.** The coarse passes (2, 3, 4, 6, 7, 8) carry explicit `costmethod` and `costlevel` WHERE filters that implement the grain ladder above. Standard cost is held to lot grain. WAC level 1 gets item-wide netting, level 2 gets branch, level 3 stays at lot. So the claim that 006b ignores cost method/level is also refuted for the current build.

The hole is in passes 1 and 2. Both compute their net at a fine grain (pass 1 groups by location and lot, pass 2 by location) but their UPDATE join back to `rperpetualinv` matches only on branch, item, and account. The location and lot columns are in the subquery's GROUP BY and never appear in the join. So the effect is: if any single location or lot subgroup for a given branch, item, and account nets under the tolerance, every `Quantity`-flagged row for that branch, item, and account gets flipped to `Amount` and zeroed, including rows at other locations that carry a real quantity variance. Pass 1 additionally has no cost-method gate at all, so it exposes standard-cost rows to this coarse flip. The build header claims pass 1 runs "per account x loc x lot," but the join delivers "per account x branch x item." That is the gap.

Contrast with the net-away passes 5 and 6, which correctly include `location` (and `lot` for pass 5) in their UPDATE join. Someone fixed the join grain on the clear-to-empty passes but not on the flip-to-Amount passes. The asymmetry looks like an oversight rather than a design choice.

**Cross-cost-method netting: does not happen.** The subqueries do not group by cost method, but each pass filters to a single method (or method set) in its WHERE, and cost method is a property of the item, so a single group cannot mix methods. Passes 1 and 5 have no method filter, but they group at lot grain where one lot is one item is one method. No pass nets a standard item against an average item.

**Netting a quantity offset against an unrelated amount offset: does not happen.** The net-away passes (5 to 8) require both `abs(sum(baselinevar)) <= threshold` and `abs(sum(estunits)) <= 0.09`. Both dimensions must be immaterial to clear a group. The flip passes (1 to 4) look only at the quantity sum and only touch rows already flagged `Quantity`. Neither mechanism nets a dollar offset against a quantity offset.

## 3. Coverage gaps as concrete scenario classes

### False positives (real offsets 006b fails to clear, so they surface as fake issues)

These are narrow. The account partition is the main driver, and it is correct by design, so most of what looks like a false positive is actually intended.

- Legitimately offsetting activity posted to two different GL accounts (a reclass or a GL-class change). Both halves survive because the partition never crosses accounts. This is intended, and passes 5 to 8 in the successor proc even flag these as GL-class offsets. Not a bug, but the analyst sees two rows for one economic event and has to recognize the pairing themselves. Applies to both standard and average.
- Standard-cost items with offsetting quantity activity spread across locations within one account. Standard is held to lot grain, so an offset that only nets at branch level will not clear. This is defensible (each standard location carries the same fixed cost, so there is little reason to net across them), but it is the class most likely to look like noise to an analyst who expects branch-level netting. Standard only.

### False negatives (real issues 006b wrongly clears or mislabels, so they hide)

This is where the risk concentrates.

- **The pass 1 and pass 2 coarse-join flip.** A quantity variance at location A is real and should surface. Location B for the same item, branch, and account nets to near zero on its own. Pass 1 or pass 2 sees B's clean net and flips A to `Amount`, zeroing A's `estunits`. The quantity signal is lost. Under average cost the damage is a mislabel: the row survives as Amount if the dollars are still material, and the analyst investigates a dollar variance that is really a quantity variance. Under standard cost the damage is worse, because amount equals quantity times a fixed standard, so the surviving `baselinevar` looks like a pure revaluation when it is actually the dollar shadow of the missing units. The suggested action for a standard Amount row points at a dollars-only inventory adjustment owned by JD Edwards, when the correct action is a quantity fix to F41021 owned by IT. Wrong reason, wrong owner, wrong fix.
- **Sub-unit quantity variances between the two tolerances.** Pass 0b flags anything with `abs(estunits) > 0` as Quantity. The flip passes only clear quantity nets under 0.05. So a 0.2-unit quantity variance stays flagged `Quantity`. That is correct at the proc level, but see the UI note in section 5: the page treats anything under 1 unit as not-a-quantity-problem, so there is a tolerance mismatch between the proc (0.05) and the UI (1.0). This is a display false negative, not a proc one.

## 4. Live-data findings per demo database

The seeder `usp8_demo_seed_cardex_variance` stages eight variances in Demo1 only, four in company 80002 (Standard, cost method 07) and four in company 80008 (Average, cost method 02). Two quantity and two amount per company. Demo2 and Demo3 carry no seed. Cost data confirmed from `rperpetualinv.CostMethod` and `ritems.costlevel`: 80002 is method 07, 80008 is method 02, and every Demo1 item is cost level 2.

Residual after the current pipeline, by company, method, and reason:

| DB | Company | Method | Level | Reason | Rows | Sum estunits | Sum baselinevar |
|---|---|---|---|---|---|---|---|
| Demo1 | 80002 | 07 Standard | 2 | Quantity | 2 | 500.00 | 550.00 |
| Demo1 | 80002 | 07 Standard | 2 | Amount | 2 | 0.00 | 3500.00 |
| Demo1 | 80008 | 02 Average | 2 | Quantity | 2 | 3200.00 | 726.00 |
| Demo1 | 80008 | 02 Average | 2 | Amount | 2 | 0.00 | 1050.00 |
| Demo2 | (none) | | | | 0 | | |
| Demo3 | (none) | | | | 0 | | |

Row-level detail for Demo1 (generic item ids as staged by the demo seeder):

| Company | Item | Br | Loc/Lot | Method | Reason | estunits | baselinevar |
|---|---|---|---|---|---|---|---|
| 80002 | SI-146048 | P027 | MRB | 07 | Quantity | 500.00 | 550.00 |
| 80002 | SI-444095 | P027 | WHS4 | 07 | Quantity | 0.00 | 0.00 |
| 80002 | SI-500548 | P019 | WHS | 07 | Amount | 0.00 | 1500.00 |
| 80002 | SI-240538 | P019 | WHS | 07 | Amount | 0.00 | 2000.00 |
| 80008 | SI-493929 | P032 | 39C04 | 02 | Quantity | 200.00 | 336.00 |
| 80008 | SI-492739 | P032 | 62C05 | 02 | Quantity | 3000.00 | 390.00 |
| 80008 | SI-482255 | P032 | 07D01 | 02 | Amount | 0.00 | 600.00 |
| 80008 | SI-494273 | P032 | 01E08 | 02 | Amount | 0.00 | 450.00 |

What this shows:

- Seven of the eight seeds survived with their exact injected values. The two standard quantity seeds, the two standard amount seeds, both average quantity seeds, and both average amount seeds all match the seeder's `dQ` and `dA` figures. No over-netting. Nothing netted across the account boundary between 80002 and 80008, nothing netted across the standard/average method boundary. On this test bed the hardened netting behaves correctly.
- One row is a zombie. SI-444095 carries `reason = 'Quantity'` but both `estunits` and `baselinevar` are 0.00. The variance was resolved (most likely a sync or clear applied through the UI, which zeroes the on-hand against the cardex) but the reason flag was not re-cleared, because reason only clears on the next 006b run inside a B->C. The view `v6ui_itemrollintegritydialog` filters on `reason <> ''`, so this row still appears in the worklist and on the Home cardex count with zero variance. That is the source of the "2 rows but sum 500" line in the summary. See section 5 for how the UI handles it.

The important caveat: this test bed cannot exercise the pass 1/2 defect. Every seed is a distinct single item at a single lot with no offsetting partner, so no branch/item/account key has one location netting clean while another carries a real variance. The demo also never touches WAC level 1, WAC level 3, or method 09. So the clean result proves the account and method partitions hold on simple cases, but it does not prove the coarse-join flip is safe, because the topology that would trigger it is absent. That is a hole in the demo, not evidence the proc is fully correct.

## 5. UI verdict: handles as is, with two specific hardening items

The live page `RRV8/inventory-cardex-variance.html` reads `v6ui_itemrollintegritydialog` through POST `/inventory/integrity`. It does **not** read the `v8ui_cardexworklist` / `RCardexVariance` path the object registry describes. It shows one focused item's lot rows, with columns for Method, Cost Level, Unit Cost, Qty Var, and Amt Var, and a currency-aware amount. The workflow is a single check with two forks: validate in JDE, then Record if JDE was off (routes to IT or marks fixed-at-source, clears on the next refresh) or Adjust if JDE ties (syncs RR up to the cardex, logged and reversible). A clear-it link, a before/after roll-forward what-if, and a data-as-of chip round it out.

The good news is that the fork logic does not trust the proc's `reason` string. `_cxFocusAgg` recomputes the shape client-side from the summed variance numbers (line 877): `shape = abs(qty) >= 1 ? 'Quantity' : (abs(amt) > 0.005 ? 'Amount' : null)`. So a mislabel that only touched the `reason` text would be corrected at the UI. The catch is that the pass 1/2 defect also zeroes `estunits`, and the UI computes qty from `sum(AdjQty)` which is `sum(estunits)`. Once the proc has zeroed the units, the UI has nothing to recompute from and will read the row as Amount too. The client-side recompute protects against a pure label bug but not against the data loss in this specific defect.

On standard versus average: the deterministic fork is the same for both methods, and that is correct. Whether an item is standard or average does not change what the analyst does. Cardex is king, so either you fix JDE at source or you sync RR to JDE. The cost-method distinction matters for interpreting why the variance exists, not for the corrective action, and the AI grounding already feeds the method into the cause read with the "07 = Standard, 02 = Average/WAC" hint (line 935). So the page represents the standard and average cases adequately as they stand. It does not need a third fork.

Two hardening items are worth doing:

1. **Zero-variance zombie rows.** SI-444095 proves the view surfaces rows where `reason <> ''` even after the variance is gone. The focused page degrades gracefully: `shape` computes to null, both fork buttons disable, and the title reads "This item ties, nothing to validate." But the row still counts on Home's cardex cards and in the worklist grid, which is noise the analyst learns to skim past. Fix at the view: add `and (abs(estunits) > tol or abs(baselinevar) > threshold)` to `v6ui_itemrollintegritydialog`, or clear `reason` at sync time in the adjustment proc instead of waiting for the nightly 006b. The second option is cleaner because it keeps the reason column honest between refreshes.
2. **The 1-unit shape floor versus the 0.05 proc tolerance.** A quantity variance between 0.05 and 1 unit survives 006b as `Quantity` but the UI classifies it as Amount or null because of the `abs(qty) >= 1` test. For fractional-unit items (weight, volume, length) this hides real quantity variances behind an Amount label or drops them from the fork entirely. Lower the UI floor to match the proc tolerance, or make it unit-of-measure aware.

Neither of these blocks shipping. The page works as is for the seeded scenarios and for the standard/average split. They are cleanups that remove noise and close a tolerance seam.

## 6. Prioritized recommendation

**First, fix the registry, not the code.** `docs/plans/cardex-db-object-registry.md` (dated 2026-06-06) says the nightly pipeline was repointed to `usp8_cardex_variance` and that `usp6_006b_cardex_variance` is orphaned and "safe to drop." The live code says the opposite. `usp6_006_inventory` was reverted to call `usp6_006b` (lines 442-448, with a comment explaining that usp8 diverged from the canonical source and overwrote `reason` on every run so the worklist never reconciled to the card). The actually-orphaned objects now are `usp8_cardex_variance`, `RCardexVariance`, and `v8ui_cardexworklist`. If anyone runs the registry's step-6 cleanup as written, they will drop the live proc and break the entire cardex pipeline and page. Correct the registry before it bites. This is the highest-priority item on the list, and it is documentation, not SQL.

**Second, fix the pass 1 and pass 2 join grain in 006b.** Add `and b.location = c.location` to pass 2's UPDATE join, and `and b.location = c.location and b.lot = c.lot` to pass 1's. That makes the flip apply at the same grain it measures, matching what passes 5 and 6 already do. Consider adding a cost-method gate to pass 1 so standard cost is not swept into a coarse flip. This is the only real correctness defect in the netting.

**Third, add a demo case that exercises the defect.** The current seeds cannot trigger the coarse-join flip because they are all single-lot with no offsetting partner, and they only cover method 07 level 2 and method 02 level 2. Add a Demo1 item with two locations under one branch, item, and account, where one location nets clean and the other carries a real quantity variance, and add at least one WAC level-1 item so the item-wide passes get tested. Without it, the fix in step two cannot be verified against live data and a regression would go unnoticed.

**Fourth, the two UI cleanups in section 5.** Clear `reason` at sync time (or filter zero-variance rows in the view), and align the UI's quantity shape floor with the proc tolerance.

What is actually fine and needs no change: the account-invariant partition, the cost-method/level grain ladder on passes 2 through 8, the standard-versus-average handling in both the proc and the UI, and the two-fork corrective workflow. Those were the parts the original suspicion doubted, and the code plus the seeded data clear them.

## Evidence trail

- Proc: `C:\source\repos\RapidReconciler-DB\RapidReconciler\dbo\Stored Procedures\usp6_006b_cardex_variance.sql`
- Call site: `usp6_006_inventory.sql` lines 442-448
- Successor (now orphaned): `usp8_cardex_variance.sql`
- Live UI view: `RapidReconciler\dbo\Views\v6ui_itemrollintegritydialog.sql`
- Perpetual table grain: `RapidReconciler\dbo\Tables\RPerpetualInv.sql` (PK on itemid)
- Seeder: `RapidReconciler-DB\demo\usp8_demo_seed_cardex_variance.sql`
- UI: `C:\source\repos\RapidReconciler-AI\RRV8\inventory-cardex-variance.html` (data source line 14, shape logic line 877, AI method hint line 935)
- Stale registry: `C:\source\repos\RapidReconciler-AI\docs\plans\cardex-db-object-registry.md`
