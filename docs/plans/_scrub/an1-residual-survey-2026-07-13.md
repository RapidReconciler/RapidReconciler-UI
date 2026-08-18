# AN-1 — Unclassified residual survey across Demo1/2/3

**Read-only survey · 2026-07-13 (overnight autonomous) · NOT for commit (carries unsanitized demo doc/order/item identifiers).**

**Question the owner asked:** across all three demo DBs, are the "Unclassified"
cards actually classifiable — do the rows fall into correct groupings, each with
a defined corrective action? If so, we win: the analyst reviews a handful of
named clusters instead of hunting thousands of rows.

**Answer: mostly yes.** The residual is far more classifiable than its size
suggests. Most of it maps to **six patterns with defined corrective actions**;
only one (work-order cost variance) is a genuine investigate-by-hand residual.
And the two single biggest piles are *already diagnosed* — the build proc stamps
the corrective action in the `Comment` field — they're just never promoted to a
card.

Source: `RCardexLedgerCompare2` where `recstatus = 1` and `SubType` is blank,
across `RapidReconciler_Demo1/2/3`.

---

## Residual by DB (shape = the first discriminator)

Shape splits on the variance: **cardex-only** (cardex ≠ 0, GL = 0),
**GL-only** (cardex = 0, GL ≠ 0), **both** (both post, disagree).

| DB | Total residual rows | cardex-only | GL-only | both-disagree |
|---|---|---|---|---|
| Demo1 | 1,711 | 529 | 459 | 723 |
| Demo2 | 4,014 | 168 | 2,814 | 1,045 |
| Demo3 | 2,096 | 2,043 | 19 | 34 |

The composition is completely different per DB — Demo2 is a GL-only story
(Purchasing), Demo3 is a cardex-only story (Mfg), Demo1 is mixed. A single
"unclassified" label hides three different problems.

---

## The patterns (signature → corrective action)

### 1. A/P voucher posted to an inventory account — **already named, not carded**
- **Signature:** batchtype **V** on an inventory account; comment already reads
  *"A/P voucher (batchtype V) posted to an inventory account. Check DMAAI 4220."*
- **Where:** Demo2 Purchasing — **2,779 GL-only + 1,023 both + 10 cardex-only ≈ 3,812 rows, ~$2.0M+**. Demo1: 1. Demo3: 7.
- **Corrective action (defined):** voucher mis-mapped through the inventory AAI;
  correct DMAAI 4220 routing at the source.
- **Status:** the classifier *already recognizes it* (stamps the comment) but
  leaves it in the residual. **Promote the comment to a card and Demo2's
  Purchasing residual nearly empties.** Highest-leverage, lowest-effort win.

### 2. BU / account mismatch — **proven, needs a new card**
- **Signature:** cardex-only, **batch > 0** (posted), cardex on the **9999998
  model** inventory account; GL relief landed on the real **9999842** BU.
- **Where:** Demo1 Sales **137 rows / $251K** (confirmed: 121 Finished Goods +
  12 WIP + 4 Purchased Parts, all BU 9999998). Demo3 Sales **1,292 / $23K**.
- **Corrective action (defined):** align the DMAAI — 4152 inventory model vs the
  4240 posting account for the item's GL class.
- **Status:** needs the BU-level test added to `usp8_txv_account_mismatch`
  (UI-36 Part 2). Specimen: doc 1125744.

### 3. Non-stock line routed to inventory — **proven, needs UI-35 + a card**
- **Signature:** GL-only, order **line type N**, GL posted to the inventory
  account (non-stock belongs on a P&L / clearing account).
- **Where:** Demo1 Sales **158 GL-only / $24K** (specimen 1125513 confirmed type N).
- **Corrective action (defined):** correct the line-type / AAI routing so
  non-stock lines land off inventory. Non-stock on a P&L account = expected,
  suppress; on inventory = fix.
- **Status:** gated on **UI-35** (SDLNTY in the payload) so the classifier can
  see the line type. Then a Non-stock card.

### 4. Unposted cardex (no GL batch) — **new finding, batch = 0 is the tell**
- **Signature:** cardex-only, **batch = 0** → genuinely never interfaced to GL
  (distinct from #2, where batch > 0 and the GL went elsewhere).
- **Where:** **Demo3 Mfg — 650 rows / $12.8M**, all DocType IC/IM, order type WO,
  one item/account (`B000022` "Inventory - Spice Blend").
- **Corrective action (defined):** post / interface the WO completions to GL —
  OR (likely) this is **Demo3-specific in-flux state** (TR-sourced, pending the
  landed-cost B→C + re-approve). **Flag for owner eyes before treating as a
  general pattern** — the concentration on one item smells like a demo artifact,
  not a fleet pattern.
- **Note:** this validates the batch-number lesson as a *classification axis* —
  cardex-only must split on batch (>0 = mismatch, =0 = unposted).

### 5. Duplicate sales — **already named, not carded**
- **Signature:** cardex posted twice, GL once; comment reads *"Duplicate sales:
  cardex posted twice, GL once. Reverse the duplicate F4111 line."* (`RDuplicateSales`
  already flags it.)
- **Where:** Demo1 7 rows, Demo3 2.
- **Corrective action (defined):** reverse the duplicate F4111 line at the source.
- **Status:** named + flagged but not carded. Small, but a free promote.

### 6. Work-order cost variance — **the genuine residual**
- **Signature:** both cardex AND GL post but disagree, on WO documents (IC/IM,
  order type WO), batch > 0. Cardex (inventory value) ≠ GL value — e.g. cardex
  $398 vs GL $42,566.
- **Where:** Demo1 Mfg **716 / $382K**, Demo3 Mfg 29, Demo2 Purchasing "both" 11.
- **Corrective action:** cost review (standard vs actual, cost-roll timing) —
  **not a mechanical auto-classify.** This is the bucket that legitimately stays
  a human hunt, though it can still be *grouped* (by WO) so the analyst works a
  work order, not scattered rows.

---

## Reclaim read

- **Demo2:** pattern #1 alone (~3,800 rows / ~$2M) is essentially the whole
  Purchasing residual. Promote the comment → card and Demo2's residual collapses.
- **Demo1:** Sales residual (302 rows) is almost entirely #2 (137) + #3 (158) +
  #5 (7). Mfg is #6 cost variance (716) + two blank cardex-only/GL-only clusters
  (387 / 299) I did **not** sample — they need the same shape+batch pass to
  confirm they're #2/#4; flagged, not claimed.
- **Demo3:** dominated by #4 ($12.8M, one item) which is probably in-flux — do
  not bank it. The real Demo3 pattern is #2 Sales (1,292 rows).

**Honest gaps:** I sampled Sales thoroughly and Mfg partially. The Demo1 Mfg
blank cardex-only (387) and GL-only (299) clusters, and Demo2's Mfg cardex-only
(133 / $380K), are un-sampled — the classifier work will re-run this pass over
them. I did not claim a single headline reclaim % because Demo3's $12.8M is
likely artifact and would inflate it dishonestly.

---

## Recommendations (priority)

1. **Promote the two already-commented patterns to cards** (#1 A/P voucher, #5
   duplicate sales). Trivial classifier change, and #1 clears most of Demo2. Do
   this first.
2. **Add the BU-mismatch card** (#2) — the account-BU test in
   `usp8_txv_account_mismatch`. Clears Demo1/Demo3 Sales cardex-only.
3. **Add the batch-split** to cardex-only classification (#4) so unposted
   (batch = 0) and account-mismatch (batch > 0) don't share a bucket.
4. **Non-stock card** (#3) after UI-35 lands.
5. **Group #6 by work order** rather than trying to auto-resolve it — give the
   analyst a WO-scoped view, not 716 loose rows.
6. **Owner eyes on Demo3 #4** (Spice Blend WO, $12.8M, batch 0) — confirm it's
   the pending landed-cost/B→C state vs a real posting gap.

Every one of #1–#5 has a defined corrective action and a stable signature — so
they're catalog entries (feeds `feedback_analytical_knowledge_one_source`: same
rule → classifier card + AI grounding + analyzer pop-up). That's the win
condition the owner set.
