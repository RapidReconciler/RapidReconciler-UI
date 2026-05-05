# JD Edwards Transfer Order (ST/OT) Reference Guide

## Process Flow, Accounting, and In-Transit Tracking Between Branch Plants

---

## Table of Contents

- [Overview](#overview)
- [Key Concepts](#key-concepts)
- [JD Edwards Setup Requirements for ST/OT Orders](#jd-edwards-setup-requirements-for-stot-orders)
- [The Process Flow at a Glance](#the-process-flow-at-a-glance)
- [Step 1: Transfer Order Entry (P4210)](#step-1-transfer-order-entry-p4210)
- [Step 2: Print Pick Slip (R42520)](#step-2-print-pick-slip-r42520)
- [Step 3: Ship Confirmation (P4205)](#step-3-ship-confirmation-p4205)
- [Step 4: Sales Update (R42800)](#step-4-sales-update-r42800)
- [Step 5: Purchase Order Receipt (P4312)](#step-5-purchase-order-receipt-p4312)
- [Step 6: Voucher Match (P4314 / P0411) — Optional](#step-6-voucher-match-p4314--p0411--optional)
- [Inventory Movement Summary](#inventory-movement-summary)
- [Accounting: Transfer at Cost vs. Transfer at Cost Plus](#accounting-transfer-at-cost-vs-transfer-at-cost-plus)
- [DMAAI Reference](#dmaai-reference)
- [Worked T-Account Scenarios](#worked-t-account-scenarios)
- [Complete Scenario Matrix](#complete-scenario-matrix)
- [The DMAAI 4335 Dilemma](#the-dmaai-4335-dilemma)
- [Status Code Progression](#status-code-progression)
- [Key Tables Touched](#key-tables-touched)
- [F4211 and F4311 — Technical Field Reference](#f4211-and-f4311--technical-field-reference)
- [In-Transit Inventory Visibility](#in-transit-inventory-visibility)
- [Variances and Reconciliation](#variances-and-reconciliation)
- [Manual Journal Entries for Unresolved Balances](#manual-journal-entries-for-unresolved-balances)
- [Typical Process Issues and Corrective Actions](#typical-process-issues-and-corrective-actions)
- [When NOT to Use ST/OT](#when-not-to-use-stot)
- [Quick Reference: Programs in the Flow](#quick-reference-programs-in-the-flow)

---

## Overview

A JD Edwards **Transfer Order (ST/OT)** is the standard mechanism for moving inventory between two branch plants within the same company. Because the goods physically travel between locations and may be in transit for hours, days, or weeks, JDE uses a **two-order pair** and an **In Transit clearing account** to keep the perpetual inventory and the General Ledger in sync throughout the journey.

A single transfer is processed as **two linked orders** that JDE creates simultaneously from one entry screen:

| Order | Document Type | Role | Branch Plant |
|---|---|---|---|
| **ST** | Sales Order | Shipping branch sells the goods | Branch A (from) |
| **OT** | Purchase Order | Receiving branch buys the goods | Branch B (to) |

The **cost on the ST becomes the price on the OT** — they are linked at creation time and ride together through the process.

---

## Key Concepts

- **In Transit Account.** A clearing/asset account that holds the dollar value of inventory while it is between branches. Debited at shipment; credited at receipt.
- **Wash Account vs. Real In Transit.** When transferring at cost, certain DMAAIs (4230, 4245) point to a "wash" clearing account so that the price on the ST has no GL impact. When transferring at cost plus, those same DMAAIs point to real In Transit and Interbranch Revenue accounts.
- **No A/R, No A/P, No Invoice.** ST/OT is intra-company. The Sales Update version for transfers must have the **A/R interface turned off**, and no customer invoice is generated. The OT side is normally not voucher-matched (no real supplier).
- **Quantity AND Amount.** The In Transit GL account tracks **dollars only**. To reconcile properly you must independently verify both quantity-in-transit and amount-in-transit, which is what reconciliation tools track.

---

## JD Edwards Setup Requirements for ST/OT Orders

Before you process a single transfer order, the following must be configured. Skipping any of these is a common root cause of process issues that show up later as in-transit imbalances.

| Requirement | Description | Where Configured |
|---|---|---|
| **Order Activity Rules** | Status progression must be defined for both `ST` and `OT` document types at every status they will pass through (e.g., 520→540→560→580→620→999 for ST; 220→400→999 for OT) | UDC `40/AT` and the Order Activity Rules program |
| **Line Type** | The line type used on transfer lines (typically `S` — stock) must have the correct inventory interface so the system relieves and receives inventory properly | Line Type Constants (P40205) |
| **Branch / Plant Constants** | Both the shipping and receiving Branch/Plants must be configured, active, and have compatible commitment methods | Branch/Plant Constants (P41001) |
| **DMAAIs** | 4220, 4230, 4240, 4245, 4310, 4320, 4335 must all be set up for the document types and GL class codes you'll use. Missing AAIs cause R42800 and P4312 to error | Distribution AAIs (P40950) |
| **Item Setup** | The item must exist in **both** the shipping and receiving Branch/Plants with **consistent GL class codes**. Inconsistent class codes will route entries to different In Transit accounts at ship and receipt | Item Branch (P41026) |
| **Standard Costs** | If using standard costing, costs should be **frozen** in both Branch/Plants before transfer orders are entered. Cost rolls during in-flight transfers create variances (see worked scenarios below) | Item Cost (P4105) |
| **Inter-Branch Markup** | If transferring at cost plus, the Branch Sales Markup table (`P3403`) must be configured before orders are entered, otherwise the markup won't apply | Branch Sales Markup (P3403) |
| **Sales Update version** | A dedicated R42800 transfer-order version with the **A/R interface OFF** must exist. Running the standard SO version against transfers generates phantom A/R | R42800 processing options |
| **Ship Confirm processing options** | P4205 must have **In-Transit Accounting** enabled on the Process tab, and the **PO Receipts (P4312) version** populated on the Versions tab | P4205 processing options |

---

## The Process Flow at a Glance

```
┌──────────────────────────────────────────────────────────────────────┐
│  BRANCH A (Shipping)                       BRANCH B (Receiving)       │
└──────────────────────────────────────────────────────────────────────┘

  1. Transfer Order Entry (P4210)
     └─► Creates ST sales order (F4201/F4211)
     └─► Creates OT purchase order (F4301/F4311)
         (linked via the Related Order — RORN field)

  2. Print Pick Slip (R42520)         [Branch A]
     └─► Hard commits inventory at Branch A

  3. Ship Confirmation (P4205)        [Branch A]
     └─► Inventory leaves Branch A (F41021 on-hand decremented)
     └─► Cardex entry written (F4111)
     └─► ST advances to ship-confirmed status (e.g., 580)

  4. Sales Update (R42800)            [Branch A — End of Day]
     └─► Writes journal entries to F0911
            DR  In Transit
            CR  Inventory @ Branch A
         (plus wash entries for 4230/4245 — see accounting)
     └─► ST advances toward 999

  ─────────────────  goods physically travel  ─────────────────

  5. PO Receipt (P4312)               [Branch B]
     └─► Inventory arrives at Branch B (F41021 on-hand incremented)
     └─► F43121 receiver record written, F4311 updated
     └─► Cardex entry written (F4111)
     └─► Journal entries written to F0911
            DR  Inventory @ Branch B
            CR  In Transit
     └─► OT advances toward 400/999

  6. Voucher Match (P4314 / P0411)    [Branch B — usually skipped]
     └─► Normally not done for ST/OT
```

---

## Step 1: Transfer Order Entry (P4210)

**Program:** `P4210` — Sales Order Entry (the same program you use for normal sales orders, invoked through a transfer-order version)

**What happens:**
- One entry screen creates **both** orders. The Transfer Order program creates an **ST** sales order for the shipping branch and an **OT** purchase order for the receiving branch in a single transaction.
- The two orders are linked via the **Related Order** (`RORN`) field. The ST's RORN points at the OT, and the OT's RORN points back at the ST.
- The ST's **unit cost** becomes the OT's **unit price/cost**. This is what the receiving branch will book inventory at.
- A flag on the F4211 (`SDS011` — Transfer/Direct Ship/Intercompany indicator) marks the line as a transfer.
- The Branch From (the ST's branch) and Branch To (the OT's branch) are both stored on each line.

**Tables updated:**
- `F4201` — Sales Order Header
- `F4211` — Sales Order Detail (the ST line)
- `F4301` — Purchase Order Header
- `F4311` — Purchase Order Detail (the OT line)

**Status after this step:**
- ST line: typically **520/540** (entered, awaiting pick)
- OT line: typically **220/400** (entered, awaiting receipt)

> **Constraints on transfer orders.** You cannot enter kits on a transfer order, and the system will not allow **Commit to Other 1** or **Commit to Other 2** on a sales transfer order. Use the regular sales/purchase order programs for those scenarios.

---

## Step 2: Print Pick Slip (R42520)

**Program:** `R42520` — Print Pick Slip / Pick Slip Print

**What happens:**
- The pick slip is generated for the warehouse at Branch A.
- **Hard commits** inventory at Branch A (the previous soft commit becomes a hard commit in F41021).
- ST line advances, e.g., **540 → 560**.

This step does **not** move inventory or hit the GL — it just locks units to this order and gives the warehouse the paperwork.

---

## Step 3: Ship Confirmation (P4205)

**Program:** `P4205` — Shipment Confirmation

**What happens:**
- The warehouse confirms the items physically left Branch A.
- **On-hand quantity at Branch A is decremented** in `F41021`.
- A **Cardex** record is written to `F4111` (the Item Ledger File) representing the outbound inventory movement. The Cardex is the perpetual inventory's transaction log.
- The ST line advances from ship-confirm status (e.g., **560 → 580**).

> **Critical processing-option setup for ST/OT.** Two options on P4205 must be configured for transfer-order ship confirm to work correctly:
>
> 1. The **In-Transit Accounting** processing option on the *Process* tab must be activated so the system knows to write to the In Transit account rather than to COGS at sales-update time.
> 2. The **PO Receipts (P4312)** version on the *Versions* tab governs how the linked OT is treated downstream.

**At this point inventory has physically left Branch A but has not yet been received at Branch B. The on-hand qty has dropped at Branch A. The GL has not yet moved — that happens at Sales Update.**

---

## Step 4: Sales Update (R42800)

**Program:** `R42800` — Sales Update (typically run as an end-of-day batch with a special "transfer" version)

**What happens:**
- Reads ship-confirmed ST records from F4211 and writes the journal entries to **F0911 (Account Ledger)**.
- Writes the GL date / batch number back to the F4111 Cardex record so it ties to the GL entry.
- Advances the ST line to a closed status (e.g., **620 → 999**).

> **A/R interface MUST be off.** The transfer-order version of R42800 must have the A/R interface turned **off**. ST orders are not real customer sales — leaving A/R on would generate phantom receivables. Likewise, no customer invoice is produced.

**The journal entries written depend on whether you're transferring at cost or at cost plus** — see the [Accounting](#accounting-transfer-at-cost-vs-transfer-at-cost-plus) section.

In dollar terms: at the end of this step, Branch A's inventory account has been credited (reduced) and the In Transit clearing account has been debited (increased) by the cost of the goods.

---

## Step 5: Purchase Order Receipt (P4312)

**Program:** `P4312` — Purchase Order Receipts

**What happens at Branch B:**
- The receiving clerk records that the goods physically arrived.
- **On-hand quantity at Branch B is incremented** in `F41021`.
- A **Cardex** entry is written to `F4111` (this time as a receipt).
- A **purchase receiver** record is written to `F43121`.
- `F4311` (PO detail) is updated with the received quantity and amount.
- Journal entries are written to `F0911`:
  - **DR** Inventory at Branch B (at the OT cost — DMAAI 4310)
  - **CR** In Transit account (DMAAI 4320)
- The OT line advances toward **400 / 999**.

**This is the step that closes the loop.** The In Transit clearing account is credited, restoring the value back into actual inventory at Branch B.

> **Important:** The OT's price is the ST's cost. So if both branches share the same standard cost and nothing changes between shipment and receipt, the In Transit debit (at shipment) and the In Transit credit (at receipt) should be equal-and-opposite, and the clearing account zeroes out for that order pair. When they don't match — qty discrepancy, partial receipt, standard cost change between order and receipt, or branch cost differences — a balance is left in the In Transit account that has to be reconciled.

---

## Step 6: Voucher Match (P4314 / P0411) — Optional

**Programs:** `P4314` (Receipts to Match — Voucher Match) and `P0411` (Standard Voucher Entry)

For ST/OT transfers, voucher match is **typically skipped**. There's no external supplier to pay — the OT exists only to drive the receipt and the GL postings at Branch B. Most installations close the OT line at receipt without going through voucher match, and configure their order activity rules accordingly.

You'll only see this step in unusual setups (for example, where ST/OT is being used to model an intra-company chargeback that does need a settlement document). For true intercompany scenarios, use the **SI/SK/OK** intercompany sale flow instead — see [When NOT to Use ST/OT](#when-not-to-use-stot).

---

## Inventory Movement Summary

| Stage | Branch A On-Hand (F41021) | Branch B On-Hand (F41021) | In Transit Balance (GL) |
|---|---|---|---|
| Order entered (P4210) | Unchanged (soft committed) | Unchanged | $0 |
| Pick slip printed (R42520) | Unchanged (hard committed) | Unchanged | $0 |
| Ship confirmed (P4205) | **Decreased** | Unchanged | $0 (GL hasn't moved yet) |
| Sales Update (R42800) | Decreased | Unchanged | **Debited** (positive balance) |
| PO Receipt (P4312) | Decreased | **Increased** | **Credited** (back to $0 if perfect match) |

The In Transit account holds the value of the goods only between Sales Update and PO Receipt. If everything matches, the account zeros out for that order pair. If anything doesn't match, the residual must be reconciled.

---

## Accounting: Transfer at Cost vs. Transfer at Cost Plus

The DMAAI configuration drives whether the price on the ST has any GL impact at all.

### Transfer at Cost (No Markup)

Price on the ST equals the cost. To prevent the price from polluting revenue or A/R, DMAAIs **4230** and **4245** are pointed at the **same wash/clearing account** so the price-driven entries cancel out.

**Shipping entries (Sales Update of the ST):**

| AAI | Account | DR | CR | Notes |
|---|---|---|---|---|
| 4245 | Clearing (wash) | Price | | A/R interface is off — 4245 used in place of RC |
| 4230 | Clearing (wash) | | Price | Revenue points to the same wash account |
| 4240 | Inventory @ Branch A | | Cost | Reduces inventory at the shipping branch |
| 4220 | In Transit | Cost | | Builds the clearing balance at Branch A's cost |

**Receiving entries (PO Receipt of the OT):**

| AAI | Account | DR | CR | Notes |
|---|---|---|---|---|
| 4310 | Inventory @ Branch B | Cost | | Increases inventory at Branch B's standard cost |
| 4320 | In Transit | | Cost | Clears In Transit at the OT cost (= ST price) |

**Why the wash works:** Whether the price on the ST is $0 or $1,000,000, the DR and CR via 4245 and 4230 hit the same account and cancel. Only the **cost** field (via 4220 → 4240) drives real GL impact. This is the safest setup for intra-company transfers because operators can fat-finger the price field with no consequence.

### Transfer at Cost Plus (Markup)

Now the ST carries a real markup, and the markup *should* hit the books as **Interbranch Revenue** at the shipping side and become the **inventory cost** at the receiving side.

**Shipping entries (Sales Update of the ST):**

| AAI | Account | DR | CR | Notes |
|---|---|---|---|---|
| 4245 | In Transit | Price | | Builds In Transit at the marked-up price |
| 4230 | Interbranch Revenue | | Price | Records intercompany revenue |
| 4240 | Inventory @ Branch A | | Cost | Reduces inventory at Branch A's cost |
| 4220 | COGS | Cost | | Records COGS at Branch A's cost |

**Receiving entries (PO Receipt of the OT):**

| AAI | Account | DR | CR | Notes |
|---|---|---|---|---|
| 4310 | Inventory @ Branch B | Cost | | Inventory at the OT cost (= ST price) |
| 4320 | In Transit | | Cost | Clears In Transit |

**Key difference from transfer at cost:** In Transit is debited at the **price** (via 4245) rather than at cost (via 4220). When you're auditing or reconciling an in-transit balance, you have to know which DMAAI holds the In Transit account — that determines whether the system used price or cost to compute the in-transit shipment value.

---

## DMAAI Reference

DMAAIs ("Distribution Manufacturing Automatic Accounting Instructions") map distribution events to GL accounts. The ones in play for ST/OT are:

| DMAAI | Event | Transfer at Cost | Transfer at Cost Plus |
|---|---|---|---|
| **4220** | COGS / In-Transit at ship | **In Transit** (clearing) | COGS |
| **4230** | Sales / Interbranch Revenue | Clearing (wash) | **Interbranch Revenue** |
| **4240** | Inventory relief at ship | Inventory @ Branch A | Inventory @ Branch A |
| **4245** | A/R or In Transit at ship (when A/R is off) | Clearing (wash) | **In Transit** |
| **4310** | Inventory @ receipt | Inventory @ Branch B | Inventory @ Branch B |
| **4320** | In-Transit clearing at receipt | In Transit | In Transit |
| **4335** | Variance at receipt | In Transit *or* PPV Expense | PPV Expense |

The **4335** account handles any variance between the in-transit debit (at ship) and the in-transit credit (at receipt). The right configuration depends on whether your variances are purely timing (point 4335 at the In Transit account itself so it self-clears) or genuine branch cost differences (point 4335 at PPV Expense to recognize the difference as a real cost). The worked scenarios below show this in detail.

---

## Worked T-Account Scenarios

The accounting tables above are easiest to understand against concrete numbers. The scenarios below all use the same item (item 123, 10 units) and trace the journal entries from ship to receipt under different cost and price conditions. **Watch what happens to the In Transit account in each one** — that's the line that tells you whether the configuration works.

### Scenario 1 — Transfer at Cost, No Variance

The ideal case. Both branches share the same standard cost; no cost changes; no markup.

**Setup:** Branch A standard = $1.00, Branch B standard = $1.00, ST cost = OT cost = $10.00.

**Ship Confirmation (ST):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch A | 4240 | | $10.00 |
| In Transit | 4220 | $10.00 | |

**OT Receipt (Branch B):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch B | 4310 | $10.00 | |
| In Transit | 4320 | | $10.00 |

**Result:** ✅ In Transit clears to zero. DMAAI 4335 not invoked.

### Scenario 2 — Transfer at Cost, Standard Cost Updated in Both Branches Mid-Flight

A timing issue. Cost rolled from $1.00 to $1.10 in **both** branches between order entry and shipment. Ship confirm picks up the new cost; the OT was created at the old cost and isn't updated.

**Setup:** Both branches now $1.10. ST cost at shipment = $11.00, OT cost on PO = $10.00 (stale).

**Ship Confirmation (ST):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch A | 4240 | | $11.00 |
| In Transit | 4220 | $11.00 | |

**OT Receipt (Branch B):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch B | 4310 | $11.00 | |
| In Transit | 4320 | | $10.00 |
| In Transit (via 4335) | **4335** | | $1.00 |

**Result:** ✅ In Transit clears, **but only if DMAAI 4335 points to the In Transit account**. The $1.00 timing variance is absorbed back into In Transit, which nets to zero across the order pair.

> **Configuration takeaway for Scenario 2:** Point DMAAI 4335 at the **In Transit** account so timing variances from cost rolls self-clear.

### Scenario 3 — Transfer at Cost, Branch Cost Variance (Different Standards)

A real cost difference, not a timing issue. Branch B's standard was never updated and remains at $0.90 while Branch A is at $1.00.

**Setup:** Branch A = $1.00, Branch B = $0.90. ST cost = OT cost = $10.00.

**Ship Confirmation (ST):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch A | 4240 | | $10.00 |
| In Transit | 4220 | $10.00 | |

**OT Receipt (Branch B):** Branch B values inventory at its own standard of $0.90 × 10 = $9.00.

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch B | 4310 | $9.00 | |
| In Transit | 4320 | | $10.00 |
| PPV Expense (via 4335) | **4335** | $1.00 | |

**Result:** ✅ In Transit clears, **but only if DMAAI 4335 points to PPV Expense**. The $1.00 cost difference is correctly recognized as a P&L expense.

> **Configuration takeaway for Scenario 3:** Point DMAAI 4335 at the **PPV Expense** account so genuine branch cost differences hit the income statement.

### Scenario 4 — Transfer at Cost, Branch Variance + Mid-Flight Cost Change

Both Scenarios 2 and 3 happen at once: a cost roll in Branch A mid-flight, AND Branch B's standard didn't get updated.

**Setup:** Branch A = $1.10 (rolled), Branch B = $0.90 (stale). ST cost at shipment = $11.00, OT cost = $10.00 (the original).

**Ship Confirmation (ST):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch A | 4240 | | $11.00 |
| In Transit | 4220 | $11.00 | |

**OT Receipt (Branch B):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch B | 4310 | $9.00 | |
| In Transit | 4320 | | $10.00 |
| Variance (via 4335) | **4335** | $1.00 | |

**Result:** ❌ In Transit does **not** clear. Whichever way you've configured 4335 — In Transit or PPV — there's still a residual. Ship-side debit was $11.00; receive-side credit was $10.00; only one side of the variance is captured by 4335. A **manual journal entry is required** to clear the remaining $1.00 in In Transit.

### Scenario 5 — Transfer at Cost Plus, No Variance, OT Cost Matches ST Price

The textbook cost-plus case. Markup on the ST is set up correctly via P3403, and the OT cost equals the ST price.

**Setup:** Branch A and B both at $1.00. ST cost = $10.00, ST price = $12.00. OT cost = $12.00.

**Ship Confirmation (ST):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch A | 4240 | | $10.00 |
| COGS | 4220 | $10.00 | |
| In Transit | 4245 | $12.00 | |
| Interbranch Revenue | 4230 | | $12.00 |

**OT Receipt (Branch B):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch B | 4310 | $10.00 | |
| In Transit | 4320 | | $12.00 |
| PPV Expense (via 4335) | **4335** | $2.00 | |

**Result:** ✅ In Transit clears. The $2.00 markup is recognized as PPV (or whatever account 4335 points to). Note that for cost-plus, **DMAAI 4335 should point at PPV Expense** — that's where the markup naturally lands.

### Scenario 6 — Transfer at Cost Plus, OT Cost Does NOT Match ST Price

The most common failure case for cost-plus: the OT was created or edited so its cost differs from the ST's price. This is exactly the situation that arises when a user opens an ST in a non-transfer P4210 version and the system reprices the linked OT.

**Setup:** Branch A and B both at $1.00. ST cost = $10.00, ST price = $12.00. OT cost = **$11.00** (mismatched).

**Ship Confirmation (ST):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch A | 4240 | | $10.00 |
| COGS | 4220 | $10.00 | |
| In Transit | 4245 | $12.00 | |
| Interbranch Revenue | 4230 | | $12.00 |

**OT Receipt (Branch B):**

| Account | AAI | DR | CR |
|---|---|---|---|
| Inventory @ Branch B | 4310 | $10.00 | |
| In Transit | 4320 | | $11.00 |
| PPV Expense (via 4335) | **4335** | $1.00 | |

**Result:** ❌ In Transit does **not** clear. Ship-side debit was $12.00; receive-side credit + variance is only $11.00 + $1.00 = $12.00, but the variance hits PPV not In Transit, so the In Transit account is left with a $1.00 residual. **Manual journal entry required.**

> **Configuration takeaway:** No DMAAI tweak rescues Scenario 6. The fix is procedural — keep OT cost equal to ST price. See [Typical Process Issues](#typical-process-issues-and-corrective-actions) for the controls that prevent this.

---

## Complete Scenario Matrix

The eight scenarios below cover essentially every real-world ST/OT case. The two that don't clear (Scenarios 4 and 6, plus their cost-plus variant 8) account for the majority of unreconciled In Transit balances in production environments.

### Transfer at Cost

| # | Branch A Std | Branch B Std | ST Cost | OT Cost | Variance | In Transit Clears? | 4335 Setting Needed |
|---|---|---|---|---|---|---|---|
| 1 | $1.00 | $1.00 | $10.00 | $10.00 | None | ✅ Yes | Not invoked |
| 2 | $1.10 | $1.10 | $11.00 | $10.00 | $1.00 timing | ✅ Yes | **In Transit** |
| 3 | $1.00 | $0.90 | $10.00 | $10.00 | $1.00 branch | ✅ Yes | **PPV Expense** |
| 4 | $1.10 | $0.90 | $11.00 | $10.00 | $1.00 + $1.00 | ❌ No | Neither clears |

### Transfer at Cost Plus

| # | Branch A Std | Branch B Std | ST Price | OT Cost | Variance | In Transit Clears? | 4335 Setting Needed |
|---|---|---|---|---|---|---|---|
| 5 | $1.00 | $1.00 | $12.00 | $12.00 | $2.00 markup | ✅ Yes | **PPV Expense** |
| 6 | $1.00 | $1.00 | $12.00 | $11.00 | Mismatch | ❌ No | Neither clears |
| 7 | $1.00 | $0.90 | $12.00 | $12.00 | $3.00 combined | ✅ Yes | **PPV Expense** |
| 8 | $1.00 | $0.90 | $12.00 | $11.00 | $2.00 + mismatch | ❌ No | Neither clears |

> **Pattern in the matrix:** In Transit fails to clear whenever (a) the OT cost doesn't equal the ST cost/price the system used at ship time, or (b) two independent variance sources exist simultaneously and only one can be absorbed by a single 4335 account.

---

## The DMAAI 4335 Dilemma

DMAAI 4335 catches the variance at the receive side. It's set up **once per document type and GL class** — there's no way to make it conditional on the scenario. But the scenarios above need it pointed at different accounts:

| Scenario | Variance Type | DMAAI 4335 Should Point To |
|---|---|---|
| 2 — Cost rolled mid-flight, both branches updated | Pure timing | **In Transit** (so the variance self-clears) |
| 3 — Branch standards differ | Real cost difference | **PPV Expense** (so the difference hits P&L) |
| 5 / 7 — Cost-plus with markup | Markup recognition | **PPV Expense** |
| 4 / 6 / 8 — Compound or mismatched | Multiple sources | Neither setting fully clears — manual JE |

**There is no DMAAI 4335 setup that works correctly for every scenario.** Pick the one that matches the situation that occurs most often in your organization, document the decision, and accept that the other situations will require manual journal entries.

A practical approach:

- **If you transfer at cost and your standard cost rolls are infrequent**, point 4335 at PPV. Branch cost differences are your dominant variance, and the rare timing variance from a cost roll is small.
- **If you transfer at cost and you do frequent cost rolls**, point 4335 at In Transit. Timing variances dominate, and you can chase the rare branch difference with a JE.
- **If you transfer at cost plus**, point 4335 at PPV. The markup itself needs to land there in every case, and that's the dominant entry.

---

## Status Code Progression

JDE uses a "from / to" status pair on each order line. Order activity rules in UDC `40/AT` define the legal sequence. A typical ST/OT progression:

**ST sales order line:**

| From → To | Trigger | Program |
|---|---|---|
| 520 → 540 | Order entry | P4210 |
| 540 → 560 | Pick slip print | R42520 |
| 560 → 580 | Ship confirm | P4205 |
| 580 → 620 | (intermediate; invoice print is normally skipped) | — |
| 620 → 999 | Sales Update | R42800 |

**OT purchase order line:**

| From → To | Trigger | Program |
|---|---|---|
| 220 → 400 | Order entry / awaiting receipt | P4210 |
| 400 → 999 | Receipt | P4312 |

> **999 means closed.** Once both the ST and OT lines reach 999, no further JDE transactions can be performed against the order pair. If a residual balance remains in the In Transit account at that point, the only path to clear it is a manual offsetting journal entry — typically driven through a reconciliation tool's "exclusion" process.

---

## Key Tables Touched

| Table | Description | Touched By |
|---|---|---|
| **F4201** | Sales Order Header | P4210 |
| **F4211** | Sales Order Detail (ST) | P4210, P4205, R42800 |
| **F4301** | Purchase Order Header | P4210 |
| **F4311** | Purchase Order Detail (OT) | P4210, P4312 |
| **F4111** | Item Ledger (Cardex) — perpetual inventory log | P4205 (issue), P4312 (receipt), R42800 (updates with GL info) |
| **F41021** | Item Location — on-hand and committed quantities | R42520 (commit), P4205 (relieve), P4312 (receive) |
| **F43121** | Purchase Order Receiver File | P4312 |
| **F0911** | Account Ledger (the GL) | R42800 (ship-side JEs), P4312 (receipt-side JEs) |
| **F42199** | Sales Order Ledger (history) | R42800 |
| **F43199** | Purchase Order Ledger (history) | P4312, P4314 |

The **RORN** (Related Order Number) field on F4211 and F4311 is what links the ST and OT together. When tracing or reporting on an order pair, RORN is your key — but it has some quirks. See the next section.

---

## F4211 and F4311 — Technical Field Reference

### JDE Field Naming Convention

Every column in F4211 is prefixed with **`SD`** ("Sales Detail"); every column in F4311 is prefixed with **`PD`** ("Purchase Detail"). The suffix is a JDE Data Dictionary item (e.g., `DOCO` = Document Number, `LNID` = Line Number) that means the same thing wherever it appears across the database.

So `SDDOCO` and `PDDOCO` are both "Document Number" — one on a sales line, one on a purchase line.

### Primary Key Fields

A sales order line and a purchase order line are each uniquely identified by the same five-field composite key (with table-specific prefixes):

| F4211 (Sales) | F4311 (Purchase) | Description |
|---|---|---|
| `SDKCOO` | `PDKCOO` | **Order Company** (key) — 5-char company code, e.g., `00001` |
| `SDDOCO` | `PDDOCO` | **Document Number** — the order number (numeric) |
| `SDDCTO` | `PDDCTO` | **Document Type** — `ST` for sales transfer, `OT` for purchase transfer |
| `SDSFXO` | `PDSFXO` | **Order Suffix** — usually `000` (used when an order is split/re-quoted) |
| `SDLNID` | `PDLNID` | **Line Number** — line within the order (e.g., `1.000`, `2.000`) |

You always need all five to uniquely identify a line. Joining on just `DOCO` will produce duplicates the moment you have suffixes or multiple companies.

### F4211 — Sales Order Detail Fields That Matter for Transfer Orders

#### Identity & Routing
| Field | Description |
|---|---|
| `SDKCOO` | Order Company |
| `SDDOCO` | ST Order Number |
| `SDDCTO` | Order Type (`ST` for transfers) |
| `SDSFXO` | Order Suffix |
| `SDLNID` | Line Number |
| `SDMCU` | **Branch / Plant — From** (the shipping branch) |
| `SDEMCU` | **Header Branch / Plant** (the order's header branch) |
| `SDLNTY` | **Line Type** — drives inventory/GL behavior. Usually `S` (stock) for transfers |

#### Related Order Fields (the link to F4311)
| Field | Description |
|---|---|
| `SDRKCO` | **Related PO/SO/WO Order Company** — the OT's company |
| `SDRORN` | **Related PO/SO/WO Number** — the OT's document number, **stored as a string** |
| `SDRCTO` | **Related PO/SO/WO Order Type** — `OT` |
| `SDRLLN` | **Related PO/SO Line Number** — line on the OT |

#### Item & Quantities
| Field | Description |
|---|---|
| `SDITM` | Short item number (numeric) |
| `SDLITM` | Long item number (the one users typically see) |
| `SDAITM` | Third item number / cross-reference |
| `SDLOCN` | Location |
| `SDLOTN` | Lot number |
| `SDUORG` | **Quantity Ordered** (original) |
| `SDSOQS` | **Quantity Shipped** |
| `SDSOBK` | **Quantity Backordered** |
| `SDSOCN` | **Quantity Cancelled** |
| `SDUOPN` | **Quantity Open** (still to ship) |
| `SDUOM` | Unit of Measure |

#### Pricing & Cost
| Field | Description |
|---|---|
| `SDUPRC` | **Unit Price** (the ST's selling price → becomes OT's cost) |
| `SDAEXP` | **Extended Price** (qty × unit price) |
| `SDUNCS` | **Unit Cost** (Branch A's inventory cost) |
| `SDECST` | **Extended Cost** (qty × unit cost) |

#### Status & Flags
| Field | Description |
|---|---|
| `SDNXTR` | **Next Status** — the next step in order activity rules (e.g., `540`, `580`, `999`). This is the reliable status field. |
| `SDLTTR` | **Last Status** — what step was just completed |
| `SDSO11` | **Transfer / Direct Ship / Intercompany flag** — `1` = transfer, `2` = direct ship, `3` = intercompany |
| `SDDGL` | **GL Date** — populated by Sales Update |
| `SDDOC` | Invoice Number — for transfer orders this is normally not used |
| `SDDCT` | Invoice Document Type |

### F4311 — Purchase Order Detail Fields That Matter for Transfer Orders

#### Identity & Routing
| Field | Description |
|---|---|
| `PDKCOO` | Order Company |
| `PDDOCO` | OT Order Number |
| `PDDCTO` | Order Type (`OT` for transfers) |
| `PDSFXO` | Order Suffix |
| `PDLNID` | Line Number |
| `PDMCU` | **Branch / Plant — To** (the receiving branch) |
| `PDLNTY` | Line Type — usually `S` (stock) for transfers |

#### Related Order Fields (the link back to F4211)
| Field | Description |
|---|---|
| `PDRKCO` | **Related Order Company** — the ST's company |
| `PDRORN` | **Related Order Number** — the ST's document number, **stored as a string** |
| `PDRCTO` | **Related Order Type** — `ST` |
| `PDRLLN` | **Related Order Line Number** — line on the ST |

#### Item & Quantities
| Field | Description |
|---|---|
| `PDITM` / `PDLITM` / `PDAITM` | Short / long / third item numbers (must match the ST line) |
| `PDLOCN` / `PDLOTN` | Location and lot at the receiving branch |
| `PDUORG` | Quantity Ordered |
| `PDUREC` | **Quantity Received** |
| `PDUOPN` | Quantity Open (still to receive) |

#### Pricing & Cost
| Field | Description |
|---|---|
| `PDPRRC` | **Unit Cost** on the OT (= ST's `SDUPRC`) |
| `PDAEXP` | Extended Cost |

#### Status & Flags
| Field | Description |
|---|---|
| `PDNXTR` | Next Status |
| `PDLTTR` | Last Status |

### How the Related Order Fields Actually Work

When P4210 creates a transfer order, it writes both the ST (to F4211) and the OT (to F4311) and stamps each line with the **Related Order** fields pointing at the other:

```
F4211 (ST line)                       F4311 (OT line)
────────────────                      ────────────────
SDKCOO  = 00001                       PDKCOO  = 00001
SDDOCO  = 7000123     ◄────────┐      PDDOCO  = 8500456
SDDCTO  = ST                   │      PDDCTO  = OT
SDLNID  = 1.000                │      PDLNID  = 1.000
                               │
SDRKCO  = 00001  ──────────────┼───►  PDRKCO  = 00001
SDRORN  = "08500456"           │      PDRORN  = "07000123"
SDRCTO  = OT                   │      PDRCTO  = ST
SDRLLN  = 1.000                └──────PDRLLN  = 1.000
```

The relationship is **symmetric** — each side knows about the other. To traverse from an ST to its OT, read `SDRORN`/`SDRCTO`/`SDRKCO`/`SDRLLN`. To traverse from an OT back to its ST, read `PDRORN`/`PDRCTO`/`PDRKCO`/`PDRLLN`.

### The String-vs-Numeric Quirk (Important)

There's a long-standing quirk that trips up almost everyone the first time they try to join F4211 and F4311 on these fields:

- `SDDOCO` and `PDDOCO` are **numeric** (Math Numeric).
- `SDRORN` and `PDRORN` are **8-character strings**, **left-padded with zeros**.

So you can't write a naive SQL join like `SDDOCO = PDRORN`. The DBMS rejects it (different types), and even if it didn't, the string `"00310998"` doesn't equal the number `310998` without a conversion.

**The fix** when writing reports or integrations is to convert the numeric to a zero-padded string before joining — e.g., in JDE ER you'd use business function `B8000094` (Convert Math Numeric to String) and then `lpad` the result to 8 chars; in SQL you cast and pad in the join predicate. Conceptually:

```sql
-- ST → OT (sales side knows the OT number)
... ON F4311.PDDOCO = CAST(LTRIM(F4211.SDRORN) AS NUMERIC)
   AND F4311.PDDCTO = F4211.SDRCTO
   AND F4311.PDKCOO = F4211.SDRKCO
   AND F4311.PDLNID = F4211.SDRLLN

-- or OT → ST (purchase side knows the ST number)
... ON F4211.SDDOCO = CAST(LTRIM(F4311.PDRORN) AS NUMERIC)
   AND F4211.SDDCTO = F4311.PDRCTO
   AND F4211.SDKCOO = F4311.PDRKCO
   AND F4211.SDLNID = F4311.PDRLLN
```

Always include all four related-order fields (`RORN`, `RCTO`, `RKCO`, `RLLN`) in the join — `RORN` alone is not unique.

### The `SDSO11` Flag

`SDSO11` (Transfer/Direct Ship/Intercompany) on F4211 is how the system distinguishes a transfer-order ST from a regular sales order or a direct-ship sales order. Even though all of these can use document type `ST`, the `SO11` flag is the authoritative marker:

| `SDSO11` value | Meaning |
|---|---|
| Blank / 0 | Regular sales order |
| `1` | Transfer order (ST/OT) |
| `2` | Direct-ship order (SD/OD) |
| `3` | Intercompany order |

When writing reports that need to single out transfer activity, filtering on `SDDCTO = 'ST'` is the typical first cut, but checking `SDSO11 = '1'` is the more reliable indicator that the line is part of a true transfer-order pair.

### Status Field Practical Notes

`NXTR` (Next Status) is the field operations teams rely on. `LTTR` (Last Status) is more of a breadcrumb. A pair like `LTTR=580 / NXTR=620` reads as "ship confirm just completed; sales update is next." A pair like `LTTR=620 / NXTR=999` means "sales update done; line is closed."

For history beyond what's in F4211/F4311, look at the corresponding ledger tables: **F42199** (Sales Order Ledger) and **F43199** (Purchase Order Ledger). These are where past status transitions live after the active record has moved on.

### Header vs. Detail

A few fields appear on the headers (F4201 / F4301) rather than the detail lines. Header tables use the `SH` and `PH` prefixes:

| Header Field | Description |
|---|---|
| `SHKCOO`, `SHDOCO`, `SHDCTO`, `SHSFXO` | Order key on F4201 |
| `PHKCOO`, `PHDOCO`, `PHDCTO`, `PHSFXO` | Order key on F4301 |
| `PHOSTS` | Order Header Status |

When you need both the order-level fields (sold-to address, customer PO, etc.) and the line-level fields, join header to detail on the `KCOO + DOCO + DCTO + SFXO` four-field key.

---

## In-Transit Inventory Visibility

The In Transit GL account tells you the **dollar value** of stock in transit, but it doesn't tell you what items, what quantities, or which orders make up the balance. JDE doesn't ship a standard report that ties the In Transit GL balance back to its supporting order pairs. Companies typically use one of three approaches to bridge that gap.

### Receipts Routing

Receipts routing is a built-in JDE feature that tracks inventory physically in transit. After ship confirm at the origin, the OT is auto-receipted into the first step of the routing — typically a `TRAN` (in-transit) step — and only completes into stock at the destination through a final routing step.

| Stage | Description |
|---|---|
| **TRAN (In Transit)** | Goods have left the shipping branch but have not yet been physically received into stock at the destination |
| **STK (Stock)** | Goods have been physically received and entered into inventory at the destination branch |

**Pros:** Real-time visibility into what's on the road. MRP can see in-transit stock as supply at the destination (avoiding the over-planning problem described in [Typical Process Issues](#typical-process-issues-and-corrective-actions)).

**Cons:** Requires dedicated setup, adds a step to the receiving process, and needs ongoing maintenance of routing definitions per item or item category.

### Custom Reporting (F4211 + F4311 Join)

The most common workaround. Build a report or SQL view that joins F4211 (or F42119 for closed orders) to F4311 on the related-order key, filtered to where shipped quantity differs from received quantity (e.g., `SDSOQS <> PDUREC`). Group by item, branch pair, or order pair as needed.

This is the lowest-cost approach and works without additional licensing, but it has to be built and maintained per site, and it doesn't easily reconcile back to the GL balance dollar-for-dollar.

### Flex Accounting With a Subledger

A clever middle ground. Configure flex accounting to put the related order number into the **subledger** field on every In Transit GL entry, with subledger type `Y`:

1. Enable flex accounting in P16902 — add `FA` records for F4311 in P4312 and F4211 in R42800.
2. Activate flex accounting in the processing options of R42800 and P4312.
3. Set the **posting edit code on the In Transit account to `S`** (subledger required, validated). This forces the subledger to be a valid order number.
4. Add flex rules in P40296:
 - For `ST`: object = In Transit account, document type = `ST`, subledger type = `Y`, file = `F4211`, data item = `RORN`.
 - For `OT`: object = In Transit account, document type = `OT`, subledger type = `Y`, file = `F4311`, data item = `DOCO`.

Now every In Transit GL entry carries the order number, and you can drill F0911 by subledger to see exactly which order pairs make up the balance. Standard JDE account reconciliation programs (e.g., R09130) can match the entries automatically.

### Reconciliation Tooling

Third-party tools such as RapidReconciler do the F4211/F4311 matching automatically and surface the unreconciled balance as a click-through report from the GL value down to the supporting order pairs. They also typically provide an **As-Of view** that shows the in-transit position as of any past period end, with transaction-level detail. This is useful for auditors who need to substantiate prior-period balances.

The choice between approaches comes down to volume and audit pressure: low-volume sites can usually live with a custom report; high-volume sites benefit from either the routing approach or a reconciliation tool.

---

## Variances and Reconciliation

If everything matches perfectly — same quantity shipped and received, same cost on ST and OT, no standard cost change in between — the In Transit account ends at zero for that order pair. In practice, residuals happen for several reasons:

| Reason | What you'll see | Resolution path |
|---|---|---|
| Goods shipped but not yet received | Order pair open, OT not at 999 | Wait — normal in-flight state |
| Quantity mismatch (e.g., shipped 100, received 94) | Order pair at 999 with TranQty/TranAmt remaining | Offsetting journal entry; reconciliation-tool exclusion |
| Standard cost changed between ship and receive | OT cost ≠ ST price | Variance flows via DMAAI 4335 (see [Worked Scenarios](#worked-t-account-scenarios)) |
| Sales Update (R42800) hasn't run yet | "End of Day" variance — F4111 is updated but F0911 isn't | Run/rerun the transfer version of R42800 |
| GL batches unposted | In Transit GL doesn't reflect the activity yet | Post the batches in F0911 |

### Period-End Investigation Procedure

When the In Transit account carries a balance at period close, work through this checklist:

1. **Identify open transfer orders.** Pull all order pairs where the ST has shipped but the OT has not been fully received. This is your "true" in-transit population.
2. **Verify OT cost matches ST price** (cost-plus) **or ST cost** (at-cost). A mismatch is the most common cause of an unresolved balance — see Scenarios 6 and 8 in the matrix.
3. **Check DMAAI 4335 configuration** against the variance type that occurred. If a Scenario 3 happened but 4335 is configured for Scenario 2 (or vice versa), the variance landed in the wrong account.
4. **Identify standard cost changes** that happened between order entry and shipment, or between shipment and receipt. If both branches were updated at different times, you may have a Scenario 4 situation.
5. **Confirm R42800 ran successfully** for all ship-confirmed transfer orders in the period. An "End of Day" type variance points here.
6. **Post a manual journal entry** for any residual that cannot be resolved through normal processing. Document the order pair(s) the entry corresponds to.

### Preventive Controls

| Control | What It Prevents |
|---|---|
| Keep standard costs synchronized across branch plants | Scenarios 3, 4, 7, 8 (branch variance) |
| Update OT cost when ST price changes (or use a price adjustment schedule) | Scenarios 6, 8 (cost mismatch on cost-plus) |
| Run cost rolls in both branches at the same time | Scenarios 2, 4 (timing-only variances when only one branch updated) |
| Configure DMAAI 4335 for the most common scenario | Reduces the volume of unresolved balances |
| Use a period-end in-transit report or reconciliation tool | Catches issues before they become reconciling items in the next period |
| Restrict ST document type to transfer-version P4210 only | Prevents the wrong-version edit that creates Scenario 6 |

---

## Manual Journal Entries for Unresolved Balances

When the In Transit account doesn't clear and the cause can't be fixed by reprocessing, a manual JE is the path forward. The right offset depends on what caused the residual:

| Cause | DR | CR | Notes |
|---|---|---|---|
| OT cost doesn't match ST price (Scenarios 6, 8) | In Transit | COGS or Cost Variance | Ship-side overstated In Transit; remove the residual to a variance account |
| Standard cost change after shipment, before receipt (Scenarios 2 or 4 where 4335 didn't catch it) | In Transit | Inventory or Variance | Adjusts for the timing difference |
| Branch cost variance not absorbed by 4335 (Scenarios 3, 4 where 4335 was set for In Transit instead of PPV) | PPV Expense | In Transit | Recognizes the real branch cost difference |
| Goods lost or damaged in transit | Inventory Shrink / Loss Expense | In Transit | Removes the value from In Transit and recognizes the loss |
| Order pair closed at 999 with residual quantity (partial receipt or short close) | Inventory Variance | In Transit | Same pattern — clear the orphaned balance |

> **Documentation discipline.** Every manual In Transit JE should be tagged with the ST and OT order numbers, the period in which it was posted, and a brief description of why the variance arose. This is what audit will ask for, and it's what your future self will need when a similar variance shows up six months later.

---

## Typical Process Issues and Corrective Actions

The In Transit account is supposed to zero out as orders complete, but in practice it almost never does on its own. The reasons are well-known to anyone who has lived with JDE transfer orders for any length of time. The issues below come up repeatedly and break down into four buckets: **user behavior**, **costing & pricing**, **partial / mismatched receipts**, and **system / timing**.

### User Behavior Issues

#### 1. Users edit an ST with the wrong order-entry version

**Symptom.** The ST sales order looks normal, but the In Transit account doesn't clear at receipt. Investigation shows the OT cost on F4311 doesn't match the ST cost on F4211 — typically the OT was updated to the *sales price* rather than left at the inventory cost.

**Cause.** After a transfer order is created, a user opens it through the standard sales-order P4210 version (instead of the transfer version) to change quantity or address. The standard SO version reprices the line, which can flow through to the related OT and corrupt the cost relationship.

**Corrective action.**
- **Prevent.** Restrict the document type `ST` from being editable in standard SO versions through document-type security or P4210 processing options. Lock it down so transfer orders can only be opened in transfer-version applications.
- **Train.** Make the rule explicit: ST orders are edited only via the transfer version. Same for the OT side via the transfer version of P4310.
- **Detect.** Run a periodic integrity check that compares `SDUNCS` on the ST line with `PDPRRC` on the linked OT line — they should match for at-cost transfers. Any mismatch is a candidate for investigation.
- **Repair.** Where the cost has already drifted, the cleanest fix is usually a journal entry rather than trying to back-edit the orders. Document the variance against the order pair so reconciliation downstream knows what it represents.

#### 2. Users change the price on the ST after entry

**Symptom.** Big balance accumulates in the In Transit / Goods-in-Transit account that won't clear, even though all order pairs appear to close at status 999.

**Cause.** When transferring at cost, the safety net is that DMAAIs 4230 and 4245 wash to the same clearing account so price changes don't matter. But if the DMAAI setup *doesn't* wash (e.g., 4245 is pointing at a real In Transit account but 4230 is pointing at revenue), the price field suddenly drives a real GL impact, and a hand-edit of the price creates an out-of-balance entry.

**Corrective action.**
- **For at-cost transfers, verify the wash setup.** DMAAIs 4230 and 4245 must point at the same clearing account. If they don't, the design is broken — even a perfect process won't reconcile.
- **For cost-plus transfers, control the price.** Use a dedicated price adjustment schedule for transfers (a documented working solution for several E1 sites) so the markup is system-driven rather than user-typed. This eliminates the "fat finger" problem.
- **Disable the price field on transfer-version P4210s** with column security if no markup is ever expected.

#### 3. Receiver enters a quantity greater than what was shipped

**Symptom.** OT was shipped for 50 units, received for 55. On-hand at Branch B is 5 units higher than reality, and the In Transit account is *over*-credited.

**Cause.** P4312 doesn't, by default, prevent the receiver from typing a quantity greater than the open quantity on the OT. Tolerance checking exists but is set at the item level, not branch-pair level, so it isn't always usable.

**Corrective action.**
- **Set the P4312 processing option** to default the open quantity into the entry field. Train receivers not to overwrite it unless absolutely necessary.
- **Apply column security on the "Quantity to be Received" field** for users who shouldn't be entering arbitrary quantities.
- **Use tolerance checking as a warning** (not a hard error) so users see a flag when over-receiving but operations don't grind to a halt.
- **Repair after the fact:** post an inventory adjustment at Branch B to remove the phantom 5 units, plus an offsetting journal entry to bring the In Transit account back into line.

### Costing & Pricing Issues

#### 4. Standard cost changes between ship and receipt

**Symptom.** The In Transit account doesn't clear cleanly. A residual variance equal to (qty × cost-difference) is left behind.

**Cause.** This is one of the most common issues. The ST/OT is created with cost X. Between when the ST ships and the OT is received, a cost roll updates the standard. Now:
- Ship-side debit to In Transit was based on the *old* cost.
- Receive-side credit to In Transit is based on the *new* cost (or the old OT-stored cost, depending on which branch's standard was updated and when).
- Inventory at Branch B is debited at Branch B's *current* standard, which may be a third value.

**Corrective action.**
- **Configure DMAAI 4335 for your dominant scenario.** If your standard cost rolls are infrequent and most variances are timing only, set 4335 to point back at the In Transit account so the variance self-clears. If your standard cost variances are real and need to be recognized, point 4335 at a Purchase Price Variance / PPV expense account so the difference hits the P&L. **There is no DMAAI setup that's correct for every scenario** — pick the one that matches the situation that occurs most often, and accept that the others will require manual journal entries.
- **Time cost rolls deliberately.** Where possible, run cost updates when in-transit balances are minimal (e.g., immediately after month-end receipts post). The fewer in-flight transfers at the moment of a cost roll, the fewer variances you create.
- **For weighted-average costing**, reprice the OT after ship confirm but before PO receipt. JDE provides repricing programs for this purpose; without it, the average cost shifts will manifest as in-transit residuals.

#### 5. The wash-account DMAAI setup doesn't actually match the business case

**Symptom.** Variances accumulate that shouldn't exist according to the documentation, and the variance amounts don't correspond to any obvious cause.

**Cause.** The most common version of this is: the company is doing **transfers at cost**, but the DMAAI setup is the **cost-plus** template (4230 → real revenue, 4245 → real In Transit). Now any time the price differs from cost on the ST, a phantom variance is recorded.

**Corrective action.**
- **Audit the DMAAI map.** Pull the actual values for 4220, 4230, 4240, 4245, 4310, 4320, and 4335 and compare them against your business case (at-cost vs. cost-plus). If you're at-cost, 4230 and 4245 must point at the *same* clearing account.
- **Document the configuration.** A surprising number of sites don't have written documentation of which AAI points where. Build the DMAAI map and keep it current.
- **Don't mix.** A common mistake is mixing costing methods on the same document type — different items on the same ST using different cost methods. Standardize the costing method per document type.

### Partial / Mismatched Receipt Issues

#### 6. Order pair closes at 999 with a residual quantity or amount

**Symptom.** Both the ST and the OT show status 999 (closed), but the order pair has TranQty or TranAmt — the In Transit position never zeroed out and no further JDE transactions are possible against the order pair.

**Cause.** Several variations:
- Receiver used the "partial receipt, close remaining" option (option 7 on P4312) when the truck arrived short. The OT was forced closed at the received quantity even though the ST shipped more.
- Goods were lost or damaged in transit and never received.
- A quantity-only mismatch — 100 shipped, 94 received, OT closed.

**Corrective action.**
- **For lost / damaged goods:** post a journal entry to write off the residual In Transit balance against an inventory shrink or damage account, and document the order pair as the source.
- **For deliberate partial receipts:** the same — journal entry to clear the In Transit residual.
- **In a reconciliation tool** (such as RapidReconciler), use the **Exclusion process** to remove the order pair from the active in-transit calculation, then post the offsetting JE. The Exclusions line in the variance calculation tells you the exact amount to journal.
- **Prevent recurrence:** restrict who can use P4312's "close remaining" options; require an approval step before short-closing an OT.

#### 7. Receipt without a matching shipment

**Symptom.** The OT is received before the ST has been ship-confirmed. The In Transit account is *credited* without ever having been *debited*, leaving a negative balance.

**Cause.** Standard JDE permits this — the OT and ST are linked but their statuses are independent. A receiver at Branch B can process P4312 against an OT regardless of whether the linked ST has actually shipped.

**Corrective action.**
- **Use receipt routing on the OT** with an "in-transit" first step. Goods can't be fully received until the ST has shipped, which forces the natural order of operations.
- **Use Transportation Management** if licensed — the load isn't deliverable until it's been ship-confirmed at origin.
- **Add a check at receipt:** require that the linked ST be at status 580 or higher before the OT can be received. This can be done with a custom validation in P4312 or with workflow.
- **Repair existing cases:** locate the orphan OT receipt, ship-confirm and sales-update the ST so the debit is created, and let the two postings net out in the In Transit account.

#### 8. Item or line numbers don't match between ST and OT

**Symptom.** The order pair appears in reconciliation with both lines visible but no automatic matching occurs. In Transit residuals build up that look like duplicate transactions.

**Cause.** The item number on the ST line must match the item number on the OT line, and the line numbers must align. If a line was added to one side and not the other (a reported issue where ST has 50 lines but only 49 OT lines were created), or if substitute items were used incorrectly, the link is broken.

**Corrective action.**
- **Periodic integrity check** (daily or weekly): join F4211 to F4311 on the related-order key and report any ST line that has no matching OT line and vice versa. This catches "lost line" cases early.
- **Fix at the source:** add the missing line to the side that's incomplete, or cancel the orphan line entirely. Don't try to ship/receive against an unmatched pair.
- **Don't allow item substitution on transfer orders.** Configure line types and item-substitution rules so substitutions go through a separate process for transfers.

### System & Timing Issues

#### 9. Sales Update (R42800) didn't run or didn't complete

**Symptom.** F4111 (Cardex) is updated for the ST line, but F0911 (GL) has no corresponding entry. The In Transit GL balance is understated relative to the perpetual reality. Reconciliation shows an "End of Day" variance.

**Cause.** R42800 either wasn't run for the period, errored out partway through, or ran but the transfer-order version was missed.

**Corrective action.**
- **Verify completion daily.** Check the job log for the transfer-order R42800 version every day. Don't rely on the assumption that "the batch ran."
- **Investigate errors.** If R42800 errored, it's typically because of a data integrity issue (missing AAI, invalid GL date, posting-edit-code conflict). Resolve the error in the source data and rerun for the affected records.
- **Don't run the wrong version.** The standard SO version of R42800 has the A/R interface on. Running it against transfer orders generates phantom A/R. Always use the dedicated transfer version with the A/R interface off.

#### 10. Receipt records the GL but not the F43121 receiver

**Symptom.** The OT shows received in F4311. The Cardex (F4111) and GL (F0911) have entries. But there's no record in F43121 (Purchase Receiver). Voucher match (if used) can't find the receipt.

**Cause.** A documented JDE bug pattern (multiple SARs across various releases): cache issues when running multiple P4312 sessions on the same machine, especially when blind landed cost is involved or when one session is cancelled while another commits. Some sites have also seen this when the receiver uses partial-receipt option 7.

**Corrective action.**
- **Apply the relevant SARs** for your release — check Oracle Support documents 6913695 / 6986616 / 6883140 series for the specific fixes by version.
- **One P4312 session per workstation.** Instruct receivers not to open multiple receiving sessions in parallel.
- **Repair after the fact.** Where F43121 is missing but the rest of the postings happened correctly, the practical fix is a manual issue/receipt cycle in the Cardex to balance the records, or a journal entry against the discrepancy. For ST/OT specifically, voucher match is normally skipped, so a missing F43121 record is mostly a reporting nuisance rather than a financial blocker.
- **Run an integrity report** that compares F4111 receipt entries (`MATT='OV'` or similar) against F43121 records and flags mismatches.

#### 11. Sales orders auto-cancelling to 982/999 or 984/999

**Symptom.** ST lines unexpectedly close to status 982/999 (cancelled-by-commitment) or 984/999 (cancelled-by-shipment) before they were actually shipped, leaving stranded order pairs in the system.

**Cause.** Inventory commitment failures during pick-slip subsystem processing — typically when the customer's back-order rules don't allow back-orders and the system can't fully commit the line.

**Corrective action.**
- **Verify back-order rules** on customer billing instructions and item branch settings. For transfer orders specifically, the "customer" is the receiving branch; make sure that customer record allows back-orders unless you really intend cancellation.
- **Don't use restricted-commitment customer setups for transfer-order customers.** Use a dedicated "transfer customer" record per branch with permissive settings.
- **Repair:** for a stranded ST that was wrongly cancelled, enter a new ST (don't try to revive the cancelled one). The OT side may need to be cancelled and re-created to match.

#### 12. The "no canned report" problem

**Symptom.** Auditor or controller asks "what makes up the $900K balance in the In Transit account?" and there's no JDE report that gives a clean answer.

**Cause.** JDE doesn't ship a standard report that ties the In Transit GL balance back to its supporting order pairs. There's no inquiry screen that shows the ST and the OT side-by-side with their statuses, quantities, and amounts.

**Corrective action.**
- **Build a custom report** that joins F4211/F42119 (active and history sales detail) with F4311 (PO detail) and F43121 (receipts) on the related-order key, filtered to where shipped quantity differs from received quantity. The JDEList community has multiple working examples; the pattern is well-established.
- **Use flex accounting with a subledger** of `RORN` (related order number) and subledger type `Y`. Set the In Transit account's posting edit code to `S` (subledger required, validated). Now every In Transit GL entry carries the order number, and you can reconcile by drilling F0911 on the subledger field.
- **Or use a reconciliation product** such as RapidReconciler that does this matching for you and surfaces the unreconciled balance with a click-through to the underlying order pairs.
- See [In-Transit Inventory Visibility](#in-transit-inventory-visibility) for the trade-offs between these approaches.

#### 13. MRP plans extra supply because it can't see in-transit stock

**Symptom.** Multi-Plant MRP (R3483) suggests creating new orders for items that are already in transit. The receiving branch over-orders.

**Cause.** Without in-transit receipt routing, MRP sees the shipped stock as gone from Branch A but not yet at Branch B, so it doesn't count it as available supply during planning.

**Corrective action.**
- **Configure In-Transit Receipt Routing** for the OT order type (Oracle support document 1324965 covers this). At ship confirm, the OT is auto-receipted into the routing's "in transit" step. The stock is now visible to MRP as supply at the destination, and receipt completes when the goods physically arrive.
- This also has the side benefit of giving you genuine in-transit visibility separate from the In Transit GL account — a routing inquiry shows you exactly what's on the road.

### Issue → Action Quick Reference

| Issue | First Diagnostic Step | Typical Corrective Action |
|---|---|---|
| Wrong order-entry version used | Compare `SDUNCS` to `PDPRRC` | Lock down doc-type security; JE the variance |
| Price changed on ST | Verify wash setup of DMAAI 4230 vs 4245 | Use price adjustment schedule; fix DMAAI |
| Over-receipt on OT | Compare PDUREC to SDSOQS on the pair | Column security on receipt qty; inv adjustment |
| Standard cost change mid-flight | Check item cost history | Configure DMAAI 4335 to In Transit (timing) or PPV (real) |
| Wrong DMAAI template (at-cost vs. cost-plus) | Audit current AAI map | Realign 4230/4245 to the actual business case |
| Closed pair with residual qty | Look for receipt option 7 usage | Exclusion + offsetting JE |
| OT received before ST shipped | Check ST status at receipt time | Receipt routing or status-check validation |
| Missing OT line on a multi-line ST | Integrity report joining F4211 to F4311 | Add the missing line or cancel orphans |
| R42800 didn't run | Job log for transfer version | Rerun; investigate error; don't use SO version |
| F43121 missing after receipt | Compare F4111 receipts to F43121 | Apply SAR; one P4312 session per workstation |
| ST cancelled to 982/999 | Customer back-order rules | Fix customer master; re-enter the ST |
| Can't explain In Transit balance | None — root issue is reporting gap | Custom report or flex accounting with RORN subledger |
| MRP over-plans across branches | Check for in-transit routing config | Enable In-Transit Receipt Routing on OT |

---

## When NOT to Use ST/OT

ST/OT is built for **intra-company** transfers — both branch plants belong to the same company in the JDE org structure. If the shipping and receiving branches sit in **different companies**, use **intercompany sales (SI/SK/OK)** instead. Intercompany processing generates real A/R at the selling company and real A/P at the buying company, settles the balance properly, and avoids polluting your In Transit clearing account with what is really a payable between two legal entities.

ST/OT is also the wrong tool when:

- The "transfer" is a same-site move between two locations of the same branch plant — use **Inventory Transfer (P4113)** instead. There's no In Transit, no two-order pair, and no clearing account.
- The goods are being drop-shipped from a supplier directly to a customer — use a **Direct Ship Order (SD/OD)** via P4210/P4310, which is a different pattern even though it uses some of the same programs.

---

## Quick Reference: Programs in the Flow

| Program | Type | Purpose | Step |
|---|---|---|---|
| **P4210** | Interactive | Transfer Order Entry (creates ST + OT) | 1 |
| **R42520** | Batch | Pick Slip Print + Hard Commit | 2 |
| **P4205** | Interactive | Ship Confirmation | 3 |
| **R42800** | Batch | Sales Update (writes ship-side GL) | 4 |
| **P4312** | Interactive | PO Receipts (writes receive-side GL) | 5 |
| **P4314 / P0411** | Interactive | Voucher Match (rarely used for ST/OT) | 6 |
| **P42040** | Interactive | Status Code Update (for cleanup; cannot move to 999) | utility |
| **P43214** | Inquiry | Open Receipts Inquiry | reporting |
