# RapidReconciler PO Receipts — Suspensions and Exclusions

## Managing Known Variances Without Distorting the RNV Reconciliation

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Why Suspensions and Exclusions Exist](#section-1-why-suspensions-and-exclusions-exist)
- [Section 2: Suspensions vs. Exclusions](#section-2-suspensions-vs-exclusions)
- [Section 3: How to Apply a Suspension or Exclusion](#section-3-how-to-apply-a-suspension-or-exclusion)
- [Section 4: The Audit Trail Note](#section-4-the-audit-trail-note)
- [Section 5: Reversing a Suspension or Exclusion](#section-5-reversing-a-suspension-or-exclusion)
- [Section 6: When to Use a Suspension](#section-6-when-to-use-a-suspension)
- [Section 7: When to Use an Exclusion](#section-7-when-to-use-an-exclusion)
- [Section 8: Decision Guide](#section-8-decision-guide)
- [Section 9: What Suspensions and Exclusions Do Not Do](#section-9-what-suspensions-and-exclusions-do-not-do)
- [Section 10: Best Practices](#section-10-best-practices)
- [Section 11: Related Documentation](#section-11-related-documentation)

---

## Overview

The RNV reconciliation in RapidReconciler compares open receipts in the F43121 PO Receiver table against the General Ledger balance for the Received-Not-Vouchered account. In a clean environment, every Match Type 1 record will eventually be offset by a Match Type 2 voucher match, and the F43121 open balance will agree to the GL.

In practice, certain records will never clear through the standard process. A receipt may have been cleared through a manual journal entry, a landed cost may have been configured as accrual-only, or an out-of-sequence reversal may have left an orphaned record that cannot be re-matched. If left in the variance calculation, these records create a permanent, unexplainable difference between F43121 and the GL.

Suspensions and exclusions are the mechanism RapidReconciler provides to remove these known, immaterial, or unresolvable items from the variance calculation so that the reconciliation surfaces only the items that genuinely need to be investigated.

| Mechanism | Scope | Purpose |
|---|---|---|
| **Suspension** | Entire purchase order | Remove the whole order from view and variance calculations |
| **Exclusion** | Individual PO line | Remove a single line from variance calculations when the order itself is otherwise valid |

Both are fully reversible. Both require an audit trail note. Both keep the affected items visible through a separate view rather than deleting them from the system.

---

## Section 1: Why Suspensions and Exclusions Exist

The RNV reconciliation is only useful when the variance it reports is actionable. If the variance includes orders or lines that are known to be permanent — such as installation-era data, accrual-only landed costs, or voucher matches that were cleared manually — the variance will never go to zero, and the reviewer cannot tell which items are genuine open issues and which are noise.

Suspensions and exclusions resolve this by allowing reviewers to formally acknowledge that an item is known and accepted, document why, and remove it from the variance calculation. The item itself is not deleted from F43121 or the GL — it remains in the source data and continues to be visible in RapidReconciler through a separate filtered view. Only its contribution to the headline variance number is removed.

The result is a reconciliation that surfaces only the items requiring action, with full traceability for everything that has been set aside.

---

## Section 2: Suspensions vs. Exclusions

The two mechanisms are mechanically similar but operate at different scopes and tend to be used in different situations.

### 2.1 Scope

| Aspect | Suspension | Exclusion |
|---|---|---|
| **Applied at** | PO order header level | PO order line level |
| **Affects** | All lines on the order | Only the specified line |
| **Other lines on the same order** | All removed from variance | Continue to appear normally in the variance |

A suspension is a blunt instrument applied when the entire purchase order is non-actionable. An exclusion is the targeted equivalent — used when the order is otherwise legitimate but contains one line that needs to be set aside.

### 2.2 Typical Use

| Mechanism | Typical Trigger |
|---|---|
| **Suspension** | Application installation pulls in old unmatched receipt and voucher data; a data integrity issue at the order level that is immaterial for the GL; an entire PO that has been cleared by a manual journal entry |
| **Exclusion** | A single line cleared by manual JE while other lines voucher normally; a single PRLAND-style line-level issue; a one-line orphaned reversal on an otherwise active order |

### 2.3 Behavior on the Variance

Both mechanisms remove the affected items from the variance calculation. Both keep the item visible in a separate view so a reviewer can audit what has been set aside. Both require a note as the audit trail and both can be undone at any time through the same control that applied them.

| Behavior | Suspension | Exclusion |
|---|---|---|
| Removed from headline variance | Yes | Yes |
| Removed from default unreconciled view | Yes (whole order) | Yes (specified line only) |
| Visible in a separate view | Yes | Yes |
| Reversible | Yes — fully | Yes — fully |
| Requires audit note | Yes | Yes |
| Affects underlying F43121 or GL data | No | No |

---

## Section 3: How to Apply a Suspension or Exclusion

Suspensions and exclusions are applied through the **Edit Note** button on the relevant screen. The same button handles both the initial action and any subsequent reversal — there is no separate "suspend" or "exclude" button.

### 3.1 Applying a Suspension (Order Level)

1. Navigate to the purchase order in the PO Receipts module.
2. Click **Edit Note** on the order-level screen.
3. In the note popup, enter the audit trail note (see [Section 4](#section-4-the-audit-trail-note)).
4. Check the suspension checkbox in the popup.
5. Save.

The order is removed from the unreconciled view and from the variance calculation. It remains accessible in the suspended-items view.

### 3.2 Applying an Exclusion (Line Level)

1. Navigate to the purchase order and drill to the line level.
2. Click **Edit Note** on the line-level screen.
3. In the note popup, enter the audit trail note.
4. Check the exclusion checkbox in the popup.
5. Save.

The line is removed from the variance calculation. Other lines on the same order continue to appear normally. The excluded line remains visible in the corresponding excluded-items view.

> **Note:** The Edit Note popup is the single point of control for both applying and reversing suspensions and exclusions. The checkbox in the popup is the toggle.

---

## Section 4: The Audit Trail Note

The note entered in the Edit Note popup is the audit trail for the suspension or exclusion. It is the only record of why the action was taken and is the primary reference for any future review or audit.

### 4.1 The Note Is Required

Every suspension and exclusion must have a note. Treat the note field as a required input — a suspension or exclusion without context is effectively orphaned and cannot be defended in an audit.

### 4.2 What a Good Note Includes

A note should be specific enough that a reviewer six or twelve months later can understand exactly what was done and why without having to reconstruct the situation. At a minimum, include:

- **What the issue is** — the underlying reason the item won't clear through the normal process
- **Why it is acceptable to remove from variance** — confirmation that the GL is correct, that the residual is immaterial, or that the issue has been investigated
- **Reference number** — JE number, ticket number, or other supporting reference where applicable
- **Date and initials** — even if the system captures these automatically, including them in the note text makes export and review easier
- **Expected resolution path** — if the suspension/exclusion is intended to be temporary, note when it should be revisited

### 4.3 Example Notes

| Scenario | Example Note |
|---|---|
| Manual JE clearance | "Order cleared via JE 2024-08-1142 on 8/15/24. Supplier invoice received post-period; AP processed manually. F43121 record orphaned. GL is correct. — JS 8/16/24" |
| Out-of-sequence reversal | "Voucher reversed in error 6/3/24, original receipt also reversed before re-match attempted. IT ticket #4419 confirms no path to re-match. JE 2024-06-0871 cleared GL. — MR 6/10/24" |
| Cancelled PO with residual | "PO cancelled 11/2/24 after partial receipt; receipt was reversed but F43121 retains a residual due to rounding. Immaterial ($0.04). — KP 11/3/24" |
| Cross-period timing | "Receipt 12/29/24, voucher matched 1/3/25. Suspending for 12/24 close only; will reverse after 1/25 close confirms clearance. — DT 12/31/24" |
| Installation-era data | "Pre-go-live unmatched receipt from legacy system. Confirmed with controller no further action. Permanent. — Finance 3/1/24" |

---

## Section 5: Reversing a Suspension or Exclusion

Both suspensions and exclusions are fully reversible at any time. The reversal mechanism is identical to the application mechanism: the Edit Note button, with the checkbox unchecked.

### 5.1 Reversal Steps

1. Locate the suspended order or excluded line through the appropriate filtered view.
2. Click **Edit Note** on the same screen used to apply the action.
3. Uncheck the suspension or exclusion checkbox.
4. Update the note to record why the reversal is being made (recommended).
5. Save.

The item returns to the standard unreconciled view and contributes to the variance calculation again.

### 5.2 When to Reverse

Common reasons to reverse a suspension or exclusion include:

- The underlying issue has been resolved (voucher finally posted, IT corrected the data integrity issue, etc.)
- The suspension was applied for a single period to handle a timing difference and the next period has cleared the item normally
- A reviewer determines the original suspension/exclusion was applied in error
- Audit or controller review requires the item to be re-examined

> **Best practice:** When reversing, append to the existing note rather than overwriting it. The history of why an item was suspended in the first place remains valuable context even after reversal.

---

## Section 6: When to Use a Suspension

Apply a suspension when the entire purchase order is non-actionable in the RNV reconciliation. The most common scenarios are below.

### 6.1 Installation-Era Data

When RapidReconciler is first deployed against an existing JD Edwards environment, F43121 typically contains old unmatched receipt and voucher records that pre-date the implementation. These records may have been settled through manual processes that were never reflected back into F43121, or they may simply be too old to investigate.

Suspending these orders en masse is the standard way to establish a clean baseline for ongoing reconciliation. Once installation-era noise is suspended, the variance reflects only post-go-live activity.

### 6.2 Manual JE Clearances of RNV

When AP processes a supplier invoice outside the standard P4314 voucher match — for example, by posting a journal entry directly to the RNV account — the GL is correct but the F43121 record is left open. The Match Type 1 receipt has no offsetting Match Type 2 record, so it appears as an open receipt forever.

If the JE cleared the entire order, suspend the order. The note should reference the JE number, the date, and confirm that the GL is correct.

### 6.3 Out-of-Sequence or Orphaned Reversals

Reversing a voucher match and then a receipt in an order that prevents re-matching can create an F43121 state that no JD Edwards process can resolve. If IT confirms there is no path to clean up the record through the application, and the GL has been corrected through a journal entry, suspend the order.

### 6.4 Cancelled POs with Residual F43121 Records

When a purchase order is cancelled after partial receipt, the receipt should be reversed and the F43121 record cleared. In some cases — typically due to rounding, partial reversals, or cost changes between receipt and reversal — a small residual remains. If the residual is immaterial and the GL is correct, suspend the order.

### 6.5 Cross-Period Timing Differences (Whole Order)

When a receipt occurs in one period and the voucher match occurs early in the next period, the receipt creates a legitimate RNV balance at period end. This is not a candidate for suspension under normal circumstances — it is a real open receipt that will clear through the standard process.

A suspension is only appropriate when:

- The timing difference would cause material misstatement of the variance for a specific close
- The order will demonstrably clear in the following period
- The suspension is reversed promptly after the next period close

This is the one suspension scenario that should always be temporary. Note clearly in the audit trail that the suspension is for a single period.

---

## Section 7: When to Use an Exclusion

Apply an exclusion when the issue is contained to a single line on an otherwise valid purchase order. The same scenarios as suspensions apply, scaled down to the line level.

### 7.1 Manual JE Clearance of a Single Line

A purchase order has multiple lines. Most lines vouchered normally, but one line was cleared via a journal entry — perhaps because the supplier billed that line on a separate invoice that AP processed manually. Suspending the entire order would hide legitimate activity on the other lines. Exclude only the affected line.

### 7.2 Single-Line Orphaned Reversal

A multi-line purchase order had one line reversed in a way that left an orphaned F43121 record, while the remaining lines processed normally. Exclude the orphaned line; the rest of the order continues to reconcile through the standard process.

### 7.3 Cancelled or Adjusted Line with Residual

A single line was cancelled or adjusted after receipt, leaving an immaterial residual in F43121. If the GL is correct and the rest of the order is active, exclude the line.

### 7.4 Cross-Period Timing Difference on a Single Line

The same logic as Section 6.5 applies, but at the line level. Use sparingly and reverse promptly.

---

## Section 8: Decision Guide

Use this flow to choose between a suspension and an exclusion.

1. **Will the item ever clear through the standard receipt → voucher match process?**
   - Yes, in the normal course of business → Do nothing. Let the standard process clear it.
   - No → Continue to step 2.

2. **Is the GL correct as-is?**
   - No → Do not suspend or exclude. Correct the GL first.
   - Yes → Continue to step 3.

3. **Does the issue affect the entire purchase order, or only specific lines?**
   - Entire order → **Suspension**
   - Specific lines, with other lines on the order processing normally → **Exclusion**

4. **Is the situation expected to be temporary or permanent?**
   - Temporary (single-period timing) → Apply suspension/exclusion, note the expected reversal date, reverse promptly
   - Permanent (manual clearance, orphaned reversal, installation-era) → Apply with a note that confirms permanence

> **Rule of thumb:** When in doubt, prefer an exclusion over a suspension. An exclusion is more precise — it removes only the specific line that needs to be set aside and leaves the rest of the order's activity visible in the variance.

---

## Section 9: What Suspensions and Exclusions Do Not Do

It is as important to understand what these mechanisms do not do as what they do.

| Action | Suspension/Exclusion Effect |
|---|---|
| **Modify F43121** | No — F43121 is the source of truth and is never modified by RapidReconciler |
| **Modify the GL** | No — the GL is read-only from RapidReconciler's perspective |
| **Delete the record from RapidReconciler** | No — the item remains visible in a separate view |
| **Prevent future activity on the order** | No — if a voucher match is later processed in JD Edwards, it will flow through normally |
| **Substitute for fixing data integrity issues** | No — they are an acknowledgement that the item is known, not a fix |
| **Replace a journal entry** | No — if the GL is wrong, a JE is still required |

A suspension or exclusion is a reconciliation-tool annotation, not a system-of-record action. The underlying JD Edwards data is unchanged.

---

## Section 10: Best Practices

| Practice | Rationale |
|---|---|
| **Always write a meaningful note** | The note is the only audit trail. A vague note ("cleared by JE") has no investigative value six months later. |
| **Reference source documents** | Include JE numbers, IT ticket numbers, and any supporting references in the note. |
| **Prefer exclusions over suspensions when possible** | Exclusions preserve more activity in the standard view and make residual issues easier to spot. |
| **Review suspended and excluded items periodically** | Items intended to be temporary should be reversed when the underlying issue clears. A quarterly review of the suspended/excluded view is reasonable for most environments. |
| **Reverse promptly when timing differences clear** | Cross-period suspensions in particular should be reversed as soon as the next period close confirms the receipt has been vouchered. |
| **Don't suspend to hide a real problem** | If the GL is wrong, fix the GL. Suspending an order with a real underlying variance defeats the purpose of the reconciliation. |
| **Suspend installation data en masse at go-live** | The cleanest way to start reconciliation against an existing F43121 is to suspend pre-go-live unmatched records as a baseline activity. |
| **Document the standard at the team level** | What constitutes "immaterial" varies by organization. Having a documented threshold for when suspensions are appropriate prevents drift between reviewers. |

---

## Section 11: Related Documentation

| Document | Relevance |
|---|---|
| [Reconciling RNV in RapidReconciler](../MDS/reconciling-rnv.md) | Full RNV reconciliation workflow including the unreconciled view and drill-down |
| [Purchase Order Comprehensive Reference Guide](../MDS/purchase_order_reference_comprehensive.md) | F43121 mechanics, match types, PRLAND, AAIs, and accounting flow |
| [PO Receipts Key Concepts](../MDS/po-receipts-key-concepts.md) | Foundational concepts for the RNV account and reconciliation |
| [Getting Started with RapidReconciler](../MDS/getting-started-with-rapidreconciler.md) | Login, navigation, and application overview |
