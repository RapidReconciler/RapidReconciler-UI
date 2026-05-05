# JD Edwards Purchase Order Comprehensive Reference Guide

## PO Receipts, RNV Reconciliation, Tax, Landed Costs, and Receipts Routing

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Glossary and Key Concepts](#section-1-glossary-and-key-concepts)
- [Section 2: PO Receipts and the RNV Account](#section-2-po-receipts-and-the-rnv-account)
- [Section 3: Process Flows (2-Way and 3-Way Match)](#section-3-process-flows-2-way-and-3-way-match)
- [Section 4: The F43121 Table](#section-4-the-f43121-table)
- [Section 5: Match Types](#section-5-match-types)
- [Section 6: Master AAI Reference](#section-6-master-aai-reference)
- [Section 7: Tax in Procurement](#section-7-tax-in-procurement)
- [Section 8: Landed Costs](#section-8-landed-costs)
- [Section 9: Receipts Routing](#section-9-receipts-routing)
- [Section 10: Accounting Flow Summary](#section-10-accounting-flow-summary)
- [Section 11: What Affects the RNV Balance](#section-11-what-affects-the-rnv-balance)
- [Section 12: Reconciliation Challenges and How RapidReconciler Helps](#section-12-reconciliation-challenges-and-how-rapidreconciler-helps)
- [Section 13: Period-End Close Checklist](#section-13-period-end-close-checklist)
- [Section 14: Troubleshooting Common Issues](#section-14-troubleshooting-common-issues)
- [Section 15: Quick-Reference Tables](#section-15-quick-reference-tables)
- [Section 16: Programs and Tables Index](#section-16-programs-and-tables-index)
- [Section 17: Related Documentation](#section-17-related-documentation)

---

## Overview

This guide consolidates the JD Edwards Purchase Order Management knowledge required to understand, account for, and reconcile purchase order activity. It covers the foundational concepts of PO Receipts and the Received-Not-Vouchered (RNV) account, the structure of the F43121 receiver table, and the three configuration areas that most heavily influence purchase order accounting: **tax**, **landed costs**, and **receipts routing**.

The PO Receipts module in RapidReconciler reconciles the RNV balance sheet liability account against open purchase order receipt activity. The RNV account holds the value of goods and services received from suppliers until the corresponding supplier invoice is matched and vouchered through Accounts Payable. At any point in time, the RNV account balance should equal the total value of receipts that have been processed but not yet matched to a supplier invoice. If the balance does not agree to open receipt activity, a reconciling variance exists.

**What the PO Receipts module reconciles:**

| Side | Source | Description |
|---|---|---|
| **Open Receipts Balance** | F43121 Match Type 1 records | Receipts that have not yet been vouchered |
| **GL Balance** | F0902 Account Balances | General ledger period-end balance for the RNV account |
| **Out of Balance** | Difference between the two | What must be explained and resolved |

---

## Section 1: Glossary and Key Concepts

| Term | Definition |
|---|---|
| **PO Receipts / RNV (Received-Not-Vouchered)** | A balance sheet liability for goods or services received against a purchase order where the supplier invoice has not yet been processed. Controlled by DMAAI 4320. |
| **Open PO** | A purchase order or line where not all items have been received. No receipt exists; no accounting entries; no RNV balance. |
| **2-Way Match** | Receipt and voucher are processed simultaneously; RNV is bypassed entirely. |
| **3-Way Match** | Standard process: PO → Receipt → Voucher Match. RNV is opened at receipt and closed at voucher match. |
| **F43121 (PO Receiver)** | The source-of-truth table for all PO receipts and voucher matches. Not a true ledger — reversals overwrite records rather than appending new ones. |
| **F0911 / F0902** | General ledger transaction detail (F0911) and period-end balances (F0902). Used as the GL side of the RNV reconciliation. |
| **Match Type** | Field on F43121 that identifies what stage of the purchasing process each record represents (1 = receipt, 2 = voucher match, 3 = receipt reversal, 4 = voucher reversal, 5/6 = landed cost equivalents). |
| **DMAAI** | Distribution/Manufacturing Automatic Accounting Instructions. Numeric AAIs (e.g., 4310, 4320) that direct procurement transactions to the correct GL accounts. |
| **PRLAND** | F43121 field indicating whether a record is a standard receipt or a landed cost, and if landed, whether it is eligible for voucher match. |
| **PRLVLA** | F43121 field storing the Landed Cost Level — a three-character code from UDC 40/CA. |
| **Landed Cost** | Additional fees added to an item's cost (harbor fees, brokerage, duties, commissions) above the purchase price. |
| **Receipts Routing** | A configurable series of inspection and handling steps between supplier receipt and entry into usable stock. |

> **Critical distinction:** "Open PO" and "Open Receipt" are not the same thing. Open POs create no accounting entries. Open Receipts (Match Type 1 with no offsetting Match Type 2) are the legitimate component of the RNV balance.

---

## Section 2: PO Receipts and the RNV Account

### 2.1 Definition

PO Receipts, also known as **Received-Not-Vouchered (RNV)**, is a balance sheet liability that accounts for goods and services received against a purchase order where the supplier invoice has not yet been processed.

The RNV account is controlled by **DMAAI 4320** in JD Edwards. It is credited when goods are received (the liability is recognized) and debited when the voucher is matched (the liability is cleared).

### 2.2 Why the RNV Account Matters

The RNV account is a temporary liability. It should be self-clearing over time as supplier invoices are received and vouchered. A large or growing RNV balance typically indicates one or more of the following:

- Supplier invoices are not being processed promptly
- Receipts are being processed incorrectly or out of sequence
- Voucher matches are being entered manually rather than through the standard process
- Aged open receipts are accumulating without investigation
- Permanent open balances exist from PRLAND = 3 landed costs that have not been suspended

### 2.3 Healthy vs. Unhealthy RNV Balance Indicators

| Indicator | Healthy | Unhealthy |
|---|---|---|
| **Balance trend** | Stable or fluctuating with normal activity | Growing month over month |
| **Receipt aging** | Most items < 60 days old | Significant balance in items > 90 days old |
| **Manual GL entries** | Rare and well-documented | Frequent direct journal entries to RNV |
| **Reconciling variance** | Near zero or fully explained | Persistent unexplained variance |
| **PRLAND = 3 records** | Identified and suspended | Mixed in with active receipts |

---

## Section 3: Process Flows (2-Way and 3-Way Match)

### 3.1 Standard 3-Way Match

The standard PO Receipts process follows these steps:

| Step | Event | F43121 Record | GL Impact |
|---|---|---|---|
| **1** | Purchase order created | No record | None |
| **2** | Goods received (P4312) | Match Type **1** created | Inventory/Expense **debit**; RNV **credit** |
| **3** | Supplier invoice received | — | — |
| **4** | Voucher match processed (P4314) | Match Type **2** created | RNV **debit**; A/P Trade **credit** |
| **5** | Payment issued | — | A/P Trade **debit**; Cash/Bank **credit** |

At Step 4, the RNV account is fully cleared and the liability transfers to Accounts Payable. The PO Receipts balance for this transaction returns to zero.

### 3.2 2-Way Match

In a 2-way match, the receipt and voucher are processed simultaneously. No separate receipt step occurs:

| Step | Event | F43121 Record | GL Impact |
|---|---|---|---|
| **1** | Purchase order created | No record | None |
| **2** | Receive and voucher simultaneously (P4314) | Match Type **1** and **2** created together | Non-stock account **debit**; A/P Trade **credit** |
| **3** | Payment issued | — | A/P Trade **debit**; Cash/Bank **credit** |

> **Note:** In a 2-way match, the temporary liability AAIs 4320 and 4355 are not used. The RNV account is bypassed entirely.

### 3.3 Reversals

Reversals are a critical factor in understanding F43121 behavior. When a receipt or voucher match is reversed in JD Edwards, the original F43121 record is **overwritten** rather than a new record being created:

| Reversal Type | F43121 Behavior | Match Type Change |
|---|---|---|
| **Receipt reversal** | Original Match Type 1 record is overwritten | Match Type changes from **1 to 3** |
| **Voucher match reversal** | Original Match Type 2 record is overwritten | Match Type changes from **2 to 4** |

This overwrite behavior is the primary reason F43121 does not function as a true ledger and why As-Of reporting is not available for RNV.

---

## Section 4: The F43121 Table

### 4.1 Overview

Table **F43121** (PO Receiver) is the source of truth for purchase order receipts. It stores a record for every receipt and voucher match transaction on a purchase order line.

**Critical behavior:** F43121 does not behave as a standard ledger. During a receipt or voucher reversal, the original record is **overwritten** with new information rather than a new record being created. This means:

- There is no transaction history for reversed receipts — only the final state of the record is preserved
- It is impossible to generate a true As-Of report from this table
- Reconciliation must be performed as a **current balance-to-balance comparison**, not a historical roll-forward

### 4.2 Key F43121 Fields

| Field | Description |
|---|---|
| **Match Type** | Identifies the record type (1 = receipt, 2 = voucher, 3 = receipt reversal, 4 = voucher reversal, 5/6 = landed cost equivalents) |
| **PRLAND** | Identifies whether the record is a standard receipt or a landed cost, and if landed, whether it is eligible for voucher match |
| **PRLVLA** | Stores the Landed Cost Level — a three-character code from UDC 40/CA |
| **Quantity fields** | Updated when reversals occur; reflect the net position after any reversals |
| **Amount fields** | Updated when reversals occur; reflect the net position after any reversals |

### 4.3 The PRLAND Field

The **PRLAND** field is the key indicator for landed cost records within F43121:

| PRLAND Value | Meaning | RNV Impact |
|---|---|---|
| **Blank** | Standard product/item receipt | Eligible for voucher match |
| **1** | Product/item line | Eligible for voucher match |
| **2** | Landed cost — eligible for voucher match | Will have a Match Type 2 record when vouchered |
| **3** | Landed cost — accrual only | **Never vouchered** — creates a permanent open balance if not excluded or suspended |

> **Important:** PRLAND = 3 records will never have a corresponding Match Type 2 record. They contribute to the F43121 open balance indefinitely. In RapidReconciler, these orders should be suspended to prevent them from creating a permanent false variance in the RNV reconciliation.

---

## Section 5: Match Types

Table F43121 contains a Match Type column that identifies what stage of the purchasing process each record represents:

| Match Type | Description | Effect on RNV |
|---|---|---|
| **1** | **Receipt** — Created when goods are received (P4312). The initial record that opens the RNV balance. | **Opens** RNV — credits the RNV account via AAI 4320 |
| **2** | **Voucher Match** — Created when the supplier invoice is matched to the receipt (P4314/P0411). | **Closes** RNV — debits the RNV account via AAI 4320 |
| **3** | **Receipt Reversal** — The original Match Type 1 record is overwritten when a receipt is reversed. | **Closes** RNV for the reversed quantity and amount |
| **4** | **Voucher Match Reversal** — The original Match Type 2 record is overwritten when a voucher match is reversed. | **Reopens** RNV for the reversed amount |
| **5** | **Landed Cost Receipt** — Created when a landed cost is applied at receipt (PRLAND = 2). | Opens RNV for the landed cost amount |
| **6** | **Landed Cost Voucher Match** — Created when a landed cost is matched to an invoice. | Closes RNV for the landed cost amount |

> **Key Point:** A fully reconciled purchase order line will have offsetting Match Type 1 and Match Type 2 records that net to zero. Any line with a Match Type 1 record and no corresponding Match Type 2 is an open receipt — a legitimate component of the RNV balance. Lines that are unbalanced for reasons other than a missing voucher match are where reconciling variances originate.

---

## Section 6: Master AAI Reference

The following AAIs drive procurement journal entries. AAIs prefixed with a number (e.g., 4310) are Distribution AAIs; alphabetic AAIs (PC, PT) are Financial AAIs that create the A/P side of the entry.

| AAI | Account | Used At | Notes |
|---|---|---|---|
| **4310** | Inventory | Receipt — debits inventory | Inventory line types only |
| **4320** | RNV (Received-Not-Vouchered) | Receipt — credits RNV; Voucher match — debits RNV | Not used in 2-way match |
| **4330** | Purchase Price Variance | Voucher match — when invoice cost differs from receipt cost | |
| **4332** | Cost of Sales Variance | Voucher match — when goods are consumed before voucher match; also used for negative on-hand landed cost | |
| **4335** | Standard Cost Variance | Receipt — when receipt cost differs from standard cost | Standard cost (07) environments |
| **4340** | Exchange Rate Variance | Voucher match — for multi-currency orders; also tracks landed cost FX variance | |
| **4350** | Tax Expense | Receipt — for S, U, C, and B tax explanation codes | |
| **4355** | RNV Tax | Receipt — temporary tax liability | Not used in 2-way match |
| **4365** | Prior to Receipt/Completion Liability | Receipts routing — liability for goods at a routing operation | |
| **4370** | Routing Operation | Receipts routing — asset account tracking goods through routing stages | |
| **4375** | Routing Disposition Expense | Receipts routing — items dispositioned off during routing | |
| **4385** | Landed Cost / Cost Expense | Receipt — when landed costs are applied | |
| **4390** | Landed Cost Liability | Receipt — landed cost liability side | |
| **PC** | A/P Trade | Voucher match — creates the accounts payable liability | Financial AAI |
| **PT** | Tax-Related A/P | Voucher match — for use tax (U) and PST withheld (B); also VAT recoverable lookup base (V, C) | Financial AAI |

> **Note:** All journal entries marked with `*` in this guide are made by the GL Post program (R09801).

---

## Section 7: Tax in Procurement

### 7.1 Tax Terms

| Term | Definition |
|---|---|
| **Sales Tax** | A tax paid to the supplier along with the cost of goods or services. The supplier collects and remits it to the taxing authority. |
| **Use Tax** | A self-assessed tax on goods or services paid directly to the taxing authority by the buyer. |
| **VAT (Value Added Tax)** | A tax paid to the supplier that is subsequently recoverable by the buyer from the taxing authority. |
| **GST (Goods and Services Tax)** | A Canadian Federal Government tax. GST is a recoverable VAT tax. |
| **PST (Provincial Sales Tax)** | A Canadian provincial tax applied to goods or services. PST can be payable to either the supplier (acts as sales tax) or directly to the taxing authority (acts as use tax). |

### 7.2 Tax Setup

Tax setup is performed on menu **G0021** and includes:

- Tax Authorities
- Tax Rate/Areas
- Tax Explanation Codes
- Tax Rules by Company

All taxing authorities should be set up as regular Address Book records.

### 7.3 Tax Rate/Area

| Field | Description |
|---|---|
| **Effective Date** | Blank defaults to the current date |
| **Expiration Date** | If tax rates are indefinite, extend as far as possible. Once established, the expiration date cannot be changed. |
| **Item Number** | A Tax Rate/Area can be applied to a group of items or a single item |
| **Maximum Unit Cost** | The maximum amount an item can be taxed |
| **Address** | Address Book number for each taxing authority. Up to five authorities per Tax Rate/Area. |
| **GL Offset** | The GL Class code used by tax AAIs (4350 and 4355). For procurement, the GL Offset comes from the Purchase Order Detail (F4311), not from the Tax Rate/Area. |
| **Compound Tax** | Controls GST/PST calculation. Checked = PST calculated on item cost plus GST (tax-on-tax). Unchecked = PST calculated on item cost only. |
| **VAT Expense** | Percentage of VAT not eligible for input credits. Checked = not recoverable (expense). Unchecked = recoverable (receivable, default). |

**Compound Tax Calculation Example (GST = 4%, PST = 6%):**

| | Compound Tax Checked | Compound Tax Unchecked |
|---|---|---|
| Item | $100.00 | $100.00 |
| GST | $4.00 | $4.00 |
| PST | $6.24 ($104 × 6%) | $6.00 ($100 × 6%) |
| **Total** | **$110.24** | **$110.00** |

### 7.4 Tax Explanation Codes (UDC 00/EX)

| Code | Description |
|---|---|
| **S** | Sales Tax — seller-assessed |
| **U** | Use Tax — self-assessed by buyer |
| **V** | VAT Tax — seller-assessed and recoverable |
| **C** | GST/PST with PST paid to supplier |
| **B** | GST/PST with PST accrued and paid directly to taxing authority |
| **E** | Tax Exempt |

### 7.5 Tax Rules by Company

Access Tax Rules by Company for Procurement with **System = 2**.

| Field | Description |
|---|---|
| **Calculate Tax on Gross (Including Discount)** | Choose to calculate tax on gross including or excluding discount |
| **Calculate Discount on Gross (Including Tax)** | Check to calculate discount on item cost plus tax |

### 7.6 Default Tax Codes and Rates

Default tax information (Tax Explanation Code and Tax Rate/Area) is specified in **Supplier Master Information (P04012)**. These defaults populate the Purchase Order Entry screen and can be overridden at order entry.

> **Important:** If tax information is not entered during purchase order entry, taxes will not be accrued at PO Receipt. Tax codes can be entered at Voucher Match, and the resulting journal entries will resemble those for a 2-way match.

**Processing option #7 on the Defaults tab of Purchase Order Entry (P4310):**

| Setting | Behavior |
|---|---|
| **1** | Defaults Tax Explanation Code and Tax Rate/Area from the Supplier Master of the Ship-To Address Book |
| **Blank** | Defaults Tax Explanation Code and Tax Rate/Area from the Supplier Master of the Supplier Address Book |

> **Note:** PO Receipts (P4312) and Voucher Match (P4314) have no processing options specific to taxes.

### 7.7 GL Treatment by Tax Code

The accounting treatment varies based on three factors:

- Tax Explanation Code
- Inventory vs. Non-Inventory line (Inventory = line type with inventory interface "Y"; Non-Inventory = "N" or "A")
- Two-way match vs. three-way match

---

#### Tax Code "S" — Simple Sales Tax

Tax is remitted to the supplier with the cost of goods.

**Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| 4310 — Inventory | Item | |
| 4350 — Tax Expense | Tax | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | Tax | |
| PC — AP Trade * | | Item + Tax |

**Non-Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + Tax | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | Tax | |
| PC — AP Trade * | | Item + Tax |

**Non-Inventory — 2-Way Match**

Receive and Voucher (P4314):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + Tax | |
| PC — AP Trade * | | Item + Tax |

---

#### Tax Code "U" — Use Tax

The buyer calculates, accrues, and remits the tax amount directly to the taxing authority.

**Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| 4310 — Inventory | Item | |
| 4350 — Tax Expense | Tax | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | Tax | |
| PC — AP Trade * | | Item |
| PT AAI *@ | | Tax |

**Non-Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + Tax | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | Tax | |
| PC — AP Trade * | | Item |
| PT AAI *@ | | Tax |

**Non-Inventory — 2-Way Match**

Receive and Voucher (P4314):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + Tax | |
| PC — AP Trade * | | Item |
| PT AAI *@ | | Tax |

> **@ PT AAI Logic for Use Tax:** The system first looks for AAI PT____ (literal blank) to find the cost center and object account. It then looks for an account whose cost center, object, and subsidiary name match the Tax Rate/Area name. If a subsidiary account is not found, only the cost center and object are used. The GL Offset in the Tax Rate/Area is ignored.

---

#### Tax Code "V" — Value Added Tax

The buyer pays tax to the supplier that is later recoverable from the taxing authority.

**Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| 4310 — Inventory | Item | |
| 4320 — RNV | | Item |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| VAT Recoverable *@ | Tax | |
| PC — AP Trade * | | Item + Tax |

**Non-Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item | |
| 4320 — RNV | | Item |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| VAT Recoverable *@ | Tax | |
| PC — AP Trade * | | Item + Tax |

**Non-Inventory — 2-Way Match**

Receive and Voucher (P4314):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item | |
| VAT Recoverable *@ | Tax | |
| PC — AP Trade * | | Item + Tax |

> **@ VAT Recoverable AAI Logic:** The system looks up the GL Offset from the Tax Rate/Area and searches for an AAI of PT followed by the GL Offset (e.g., PTTXTX).

---

#### Tax Code "C" — GST/PST with PST Paid to Supplier

Used in Canada. PST behaves like "S" (seller-assessed); GST behaves like "V" (recoverable VAT).

**Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| 4310 — Inventory | Item | |
| 4350 — Tax Expense | PST Tax | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | PST Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | PST Tax | |
| VAT Recoverable *@ | GST Tax | |
| PC — AP Trade * | | Item + PST + GST |

**Non-Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + PST | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | PST Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | PST Tax | |
| VAT Recoverable *@ | GST Tax | |
| PC — AP Trade * | | Item + PST + GST |

**Non-Inventory — 2-Way Match**

Receive and Voucher (P4314):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + PST | |
| VAT Recoverable *@ | GST Tax | |
| PC — AP Trade * | | Item + PST + GST |

> **@ VAT Recoverable AAI Logic:** The system uses the GL Offset from the first line of the Tax Rate/Area table and looks for an AAI of PT followed by the GL Offset (e.g., PTTXTX).

---

#### Tax Code "B" — GST/PST with PST Withheld

Used in Canada. GST is paid to the supplier; PST is withheld and paid directly to the Provincial tax authority. PST behaves like "U" (self-assessed use tax).

**Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| 4310 — Inventory | Item | |
| 4350 — Tax Expense | PST Tax | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | PST Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | PST Tax | |
| VAT Recoverable *@ | GST Tax | |
| Tax Payable *# | | PST Tax |
| PC — AP Trade * | | Item + GST |

**Non-Inventory — 3-Way Match**

PO Receipt (P4312):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + PST Tax | |
| 4320 — RNV | | Item |
| 4355 — RNV Tax | | PST Tax |

Voucher Match (P4314):

| Entry | Debit | Credit |
|---|---|---|
| 4320 — RNV | Item | |
| 4355 — RNV Tax | PST Tax | |
| VAT Recoverable *@ | GST Tax | |
| Tax Payable *# | | PST Tax |
| PC — AP Trade * | | Item + GST |

**Non-Inventory — 2-Way Match**

Receive and Voucher (P4314):

| Entry | Debit | Credit |
|---|---|---|
| Account entered on PO | Item + PST Tax | |
| VAT Recoverable *@ | GST Tax | |
| Tax Payable *# | | PST Tax |
| PC — AP Trade * | | Item + GST |

> **@ VAT Recoverable AAI Logic:** The system uses the GL Offset from the first line of the Tax Rate/Area table and uses the financial AAI of PT followed by the GL Offset (e.g., PTTXTX).

> **# Tax Payable AAI Logic for PST:** The system first looks for AAI PT____ (literal blank) to find the cost center and object account. It then looks for an account whose cost center, object, and subsidiary name match the Tax Rate/Area name. If a subsidiary account is not found, only the cost center and object are used. The GL Offset in the Tax Rate/Area is ignored.

### 7.8 Tax Code Summary Matrix

| Code | Paid To Supplier | Self-Assessed | Recoverable | Uses 4350/4355 | Uses PT |
|---|---|---|---|---|---|
| **S** | Yes (full) | No | No | Yes | No |
| **U** | No | Yes (full) | No | Yes | Yes |
| **V** | Yes (full) | No | Yes (full) | No | Yes (recoverable) |
| **C** | Yes (full) | No | GST only | Yes (PST) | Yes (GST recoverable) |
| **B** | GST only | PST only | GST only | Yes (PST) | Yes (both) |
| **E** | No | No | No | No | No |

---

## Section 8: Landed Costs

### 8.1 Overview

Landed costs are additional fees automatically added to an item's cost to account for expected charges associated with delivery or handling. Common examples include:

- Harbor Fees
- Brokerage Fees
- Commissions
- Import Duties

**Key Rules:**

- Landed costs are costs that **exceed** the purchase price of an item
- Landed costs are applied to an **individual item line** — they cannot be applied to the total cost of a purchase order
- Landed costs are **not taxable**

### 8.2 Setup

#### Required UDC Tables

| UDC Table | Purpose |
|---|---|
| **41/P5** | All Landed Cost Rules must exist here before they can be used |
| **40/CA** | Defines the Landed Cost Level used to calculate additional fees |
| **41/9** | All GL class codes used for landed costs must be included here |

#### Assignment Methods

Landed costs may be assigned by a **specific Item and Branch/Plant combination** or by a **Cost Rule** — a named group of landed costs reusable across items and suppliers.

A Cost Rule can be assigned to:

- An inventory item (Item Branch/Plant Category Codes — P41026)
- A supplier (Supplier Master, Purchasing1 tab — P04012)
- A purchase order header (Additional Information form exit in P4310)
- A purchase order detail line (Additional Information in P4310)
- A processing option in Purchase Order Entry (P4310)

#### Calculation Methods

| Method | Description | Example |
|---|---|---|
| **Percentage of unit price** | Entered as a whole number (e.g., 5% entered as 5.00). Calculated as % × quantity × unit cost. | 5% of a PO line with 10 units at $10.00 = $5.00 |
| **Fixed dollar amount** | A flat fee applied per unit | — |
| **Rate × weight or volume** | Rate entered as a whole number per unit of weight or volume | $4.50/lb for a 10 lb item with quantity 1 = $45.00 |

#### Landed Cost Level and Basis

All landed costs must be assigned a **Landed Cost Level** from UDC 40/CA. The **Based on Level** field controls what the landed cost is calculated against — the purchase order line only, or the purchase order line plus a previously applied landed cost level (cumulative).

#### GL Class Code

The GL Class determines how landed costs are routed to the GL via AAIs 4385 and 4390. Different GL classes direct landed costs to different accounts.

**Examples:**

- LC21 → Harbor Fees
- LC24 → Brokerage Fees

> **Note:** If the GL class is left blank in Landed Cost Revisions, the system retrieves the GL class from the Item Location record.

#### Landed Cost Configuration Options

| Field | Description |
|---|---|
| **Effective Dates** | Limits the landed cost to a specific date range |
| **Supplier** | The landed cost can be paid to a different supplier than the one on the PO |
| **Voucher (Y/N)** | Y = eligible for voucher match (PRLAND = 2); N = accrual only (PRLAND = 3) |
| **Include in Cost (Y/N)** | Y = updates Average Cost and Last-In buckets (UDC 40/AV applies); N = does not update any inventory cost bucket |

> **Note:** The purchasing bucket (08) and standard cost bucket (07) are never updated by landed cost.

### 8.3 Cost Rule Hierarchy

When more than one landed cost assignment exists, the system applies the following priority (highest to lowest):

1. Cost Rule — Item Branch/Plant combination (P41291)
2. Purchase Order Header — Additional Information
3. Processing option behind Purchase Order Entry P4310
4. Purchasing Instructions from the Ship To address
5. Landed Cost category code in the Item Branch/Plant Category Codes (P41026)

### 8.4 Applying Landed Costs

Landed costs are applied and calculated using **Landed Cost Revisions (P41291)**, invoked at three points:

| Point | Program |
|---|---|
| **At Receipt** | Purchase Order Receipts (P4312) |
| **At Voucher Match** | Voucher Match to Open Receipt (P4314), called from P0411 |
| **Stand-Alone** | Stand Alone Landed Cost (P43214) — used between receipt and voucher match |

**Processing option #6 on the Process tab of P4312:**

| Setting | Behavior |
|---|---|
| **1** | Form W43291A displays after the receipt. Enter option 1 to include the landed cost. Click OK to create journal entries and F43121 records; Cancel to exit without applying. |
| **2** | Blind Landed Cost — applied and calculated automatically without displaying the form |
| **Blank** | No landed cost applied |

> **Note:** If a purchase order receipt is reversed, any landed costs applied — including journal entries, F43121 records, and cardex records — will also be reversed.

> **Note:** Landed costs cannot be reversed through the Stand Alone program (P43214: ZJDE0003). Reversal is possible only if the purchase order itself is reversed using Open Receipts by Supplier (P43214: ZJDE0001).

### 8.5 Landed Cost Journal Entries

**Setup for examples:** Landed Cost Rule = 10% of cost; Include in Cost = Y; Purchase Order = $100.

**Positive On-Hand Quantity:**

| Account | Debit | Credit | AAI |
|---|---|---|---|
| Inventory | $100 | | 4310 |
| RNV | | $100 | 4320 |
| Cost/Expense (landed cost) | $10 | | 4385 |
| Cost/Liability (landed cost) | | $10 | 4390 |

**Negative On-Hand Quantity:**

If the on-hand quantity is negative, the landed cost expense is split between AAI 4385 and AAI 4332. The cardex record and AAI 4385 are created only for the portion applicable to the quantity on hand.

**Example:** On-hand = -50; PO quantity = 100; PO cost = $100.

| Account | Debit | Credit | AAI |
|---|---|---|---|
| Inventory | $100 | | 4310 |
| RNV | | $100 | 4320 |
| Cost of Sales | $5 | | 4332 |
| Cost/Expense (landed cost) | $5 | | 4385 |
| Cost/Liability (landed cost) | | $10 | 4390 |

> **Note:** Landed costs will not update the cardex (F4111) if the standard cost (07) rule is used for inventory.

### 8.6 Landed Cost F43121 Records

The **PRLAND** field in the F43121 table is the key indicator for landed cost records:

| PRLAND Value | Meaning |
|---|---|
| **Blank** | Not related to landed cost |
| **1** | Product/item line |
| **2** | Landed cost eligible for voucher match |
| **3** | Landed cost for accrual only — not eligible for voucher match |

The **PRLVLA** field stores the Landed Cost Level — a three-character value from UDC 40/CA identifying the specific landed cost applied.

### 8.7 Multi-Currency Landed Costs

Landed costs support multi-currency processing. A purchase order can be in one currency while landed costs are in different currencies. When multi-currency is enabled:

- The currency field within the landed cost record becomes active
- The currency defaults from the Supplier Master and **cannot be overridden**
- Exchange rate variances for landed costs are tracked using **AAI 4340**

---

## Section 9: Receipts Routing

### 9.1 Overview

Receipts Routing in JD Edwards allows organizations to track inventory through a series of inspection and handling steps between the time goods are received from a supplier and when they are placed into usable stock. Rather than immediately crediting inventory upon receipt, goods can be held in intermediate routing operations until quality checks and other processing requirements are satisfied.

Receipts routing is commonly used for:

- Incoming quality inspection
- Quarantine periods for regulated goods
- In-transit tracking for intercompany transfer orders (ST/OT)
- Staged receipt processing where goods must pass through multiple handling steps

### 9.2 How Receipts Routing Works

When a purchase order is received, instead of immediately posting to inventory, the goods are placed into a **routing operation**. Each routing operation represents a physical stage in the receiving process. The goods progress through the routing steps until they reach the final operation, at which point they are moved into usable stock.

**Standard routing stages:**

| Stage | Description |
|---|---|
| **INSPE (Inspection)** | Goods are held for quality inspection before being released to stock |
| **TRAN (In Transit)** | Goods are in transit and have not yet been physically received into stock — commonly used for ST/OT transfer orders |
| **STK (Stock)** | Goods have been physically received and entered into usable inventory |

At each routing stage, JD Edwards tracks the quantity and value in the routing operation. The goods are not available for use until they reach the stock stage.

### 9.3 Setup Requirements

**UDC Table 43/RC — Routing Operations**

All routing operations must be defined in UDC table **43/RC** before they can be used. Each operation code represents a stage in the routing process.

**Order Activity Rules (P40204)**

Order Activity Rules must be configured for the applicable order type and line type to support routing operations. The rules define which status codes are valid for each stage of the routing process.

**Receipt Routing Definition (P43091)**

The routing definition program (P43091) is used to define the sequence of routing operations for a given item or item group. The definition specifies:

- The order in which routing operations are performed
- Whether goods at a routing stage are available for use
- Whether the goods are included in on-hand quantity at each stage

**Processing Options**

Processing option #3 on the Process tab of Purchase Order Receipts (P4312) controls whether routing is activated at receipt. When set, goods received against purchase orders with routing assigned will be placed into the first routing operation rather than directly into stock.

### 9.4 Routing Operation Status

Goods at each routing stage carry a status that determines their availability:

| Status | Description |
|---|---|
| **In Routing** | Goods are at a routing operation and not yet in usable stock |
| **Available** | Goods have passed all routing operations and are in usable stock |
| **Rejected** | Goods failed inspection and are flagged for return or disposition |

### 9.5 Moving Goods Through Routing Operations

The **Movement and Disposition program (P43250)** is used to move goods from one routing operation to the next. At each movement:

- The quantity is transferred from the current routing operation to the next
- Journal entries are created based on the configured routing AAIs (4365/4370)
- The F43121 record is updated to reflect the current routing stage

When goods are moved to the final stock operation, inventory is fully credited and the goods become available for use.

### 9.6 Receipts Routing Journal Entries

Receipts routing uses two additional AAIs for journal entries at routing operations:

| AAI | Account | Usage |
|---|---|---|
| **4365** | Prior to Receipt/Completion Liability | Liability account for goods at a routing operation |
| **4370** | Routing Operation | Asset account tracking goods through routing stages |
| **4375** | Expense | Debits expense account for items dispositioned off during receipt routing |

**At initial receipt into routing:**

| Entry | Debit | Credit | AAI |
|---|---|---|---|
| Routing Operation | x | | 4370 |
| RNV / In Transit | | x | 4320 |

**At movement to stock:**

| Entry | Debit | Credit | AAI |
|---|---|---|---|
| Inventory | x | | 4310 |
| Routing Operation | | x | 4370 |

**At disposition (rejection/write-off):**

| Entry | Debit | Credit | AAI |
|---|---|---|---|
| Expense | x | | 4375 |
| Routing Operation | | x | 4370 |

### 9.7 Receipts Routing and Landed Costs

Landed costs are fully compatible with receipts routing. However, there is one important restriction: **landed costs cannot be applied at the time of receipt when material burden is also in use**. If both are required, use the standalone landed cost program (P43214) to apply landed costs separately after receipt.

### 9.8 Receipts Routing for ST/OT Transfer Orders

Receipts routing is frequently used to track inventory in transit between branch plants on ST/OT transfer orders. The TRAN routing operation holds goods between the time the ST order is ship confirmed and the time the OT is received at the destination branch.

**Key considerations for ST/OT routing:**

- The TRAN routing stage keeps goods visible as in-transit inventory without crediting the receiving branch's on-hand balance
- Goods at the TRAN stage are excluded from the receiving branch's perpetual inventory but remain tracked in the routing operation
- RapidReconciler provides an alternative to receipts routing for in-transit tracking — see the [Transfer Order Reference Guide](../MDS/transfer_order_reference.md) for details

### 9.9 Receipts Routing Best Practices

| Practice | Recommendation |
|---|---|
| **Define operations clearly** | Keep routing operations simple and purposeful — complex routing with many stages increases administrative burden |
| **Train receiving staff** | Ensure receiving staff understand how to move goods through routing operations correctly — goods left in a routing stage create reconciliation issues |
| **Monitor routing inventory** | Regularly review goods at routing stages to identify items stuck in a routing operation longer than expected |
| **Configure AAIs carefully** | Ensure AAIs 4365 and 4370 point to appropriate accounts — goods at routing stages must be distinguishable from fully received inventory in the GL |
| **Consider the RapidReconciler alternative** | For ST/OT in-transit tracking specifically, RapidReconciler's As-Of tracking provides the same visibility without requiring receipts routing configuration |

---

## Section 10: Accounting Flow Summary

### 10.1 Standard 3-Way Match (No Tax, No Landed Cost)

**At Receipt (P4312):**

| Account | Debit | Credit | AAI |
|---|---|---|---|
| Inventory | x | | 4310 |
| RNV | | x | 4320 |

**At Voucher Match (P4314):**

| Account | Debit | Credit | AAI |
|---|---|---|---|
| RNV | x | | 4320 |
| A/P Trade * | | x | PC |

**If a purchase price variance exists at voucher match:**

| Account | Debit | Credit | AAI |
|---|---|---|---|
| RNV | x | | 4320 |
| Purchase Price Variance | x or (x) | | 4330 |
| A/P Trade * | | x | PC |

### 10.2 Where Each Configuration Hits the Books

| Configuration | Receipt-Side Impact | Voucher-Match-Side Impact |
|---|---|---|
| **No tax / no landed cost** | 4310 DR, 4320 CR | 4320 DR, PC CR |
| **Tax (S, U, C, B)** | Adds 4350 DR, 4355 CR | Adds 4355 DR, PT or PC CR |
| **VAT (V, GST portion of C/B)** | No tax entry at receipt | Adds VAT Recoverable DR via PT lookup |
| **Landed cost (PRLAND = 2)** | Adds 4385 DR, 4390 CR | Adds 4390 DR, PC CR for landed cost |
| **Landed cost (PRLAND = 3)** | Adds 4385 DR, 4390 CR | None — never vouchered |
| **Receipts routing** | 4370 DR (instead of 4310), 4320 CR | Unchanged — voucher match still hits 4320/PC |

---

## Section 11: What Affects the RNV Balance

Understanding what creates, clears, and distorts the RNV balance is essential for effective reconciliation.

### 11.1 What Opens the RNV Balance

| Event | Program | Match Type Created |
|---|---|---|
| Standard PO receipt | P4312 | 1 |
| Landed cost receipt (PRLAND = 2) | P4312 / P43214 | 5 |
| Voucher match reversal | P4314 / P0411 | 4 (reopens RNV) |

### 11.2 What Closes the RNV Balance

| Event | Program | Match Type Created |
|---|---|---|
| Voucher match | P4314 / P0411 | 2 |
| Receipt reversal | P4312 | 3 (closes RNV for reversed amount) |
| Landed cost voucher match | P4314 / P0411 | 6 |

### 11.3 What Creates False or Permanent RNV Balances

| Cause | Description | Resolution |
|---|---|---|
| **Manual GL entry to clear RNV** | A journal entry was posted directly to the RNV account instead of processing through voucher match | The F43121 record remains open. Suspend the order in RapidReconciler; verify the GL is correct. |
| **PRLAND = 3 landed cost** | Accrual-only landed cost will never be vouchered | Suspend in RapidReconciler to prevent a permanent false variance |
| **Out-of-sequence reversal** | A voucher match reversal that cannot be re-matched | Investigate with IT; may require a manual journal entry |
| **Receipts routing** | Goods in a routing step are not yet in final stock — the receipt is open | Understand routing stage; goods will clear when moved to STK |
| **Purchase price variance remaining in RNV** | AAI 4330 or 4332 not configured to absorb the full variance | Review AAI configuration |
| **Tax accrued at receipt but not at voucher** | Tax codes entered after receipt cause 4355 imbalance | Reverse and re-process, or post a correcting JE and suspend |

---

## Section 12: Reconciliation Challenges and How RapidReconciler Helps

### 12.1 System Challenges

**F43121 is not a true ledger.** Receipt and voucher reversals overwrite key data elements rather than creating new records. This means:

- There is no row-by-row transaction history for reversed receipts
- As-Of reporting is not available — you cannot reconstruct the RNV balance at a prior date from F43121 alone
- Reconciliation must be performed as a **current balance-to-balance comparison**

**Implications for period-end close:** Because the open receipts listing reflects the current state of F43121 (not a point-in-time snapshot), the RNV reconciliation must be performed as close to the period end as possible, using the current open receipts balance compared to the current GL balance.

### 12.2 Process Challenges

| Challenge | Description |
|---|---|
| **Receipts routing complexity** | Goods in routing stages create open receipts that are not yet in final inventory. Understanding which stage goods are at is required to correctly assess whether an open receipt is legitimate. |
| **Tax configuration** | Multiple tax explanation codes (S, U, V, C, B) produce different journal entries. The presence of AAIs 4350 and 4355 in the RNV sub-ledger adds complexity to the reconciliation. |
| **Landed cost configuration** | PRLAND values determine whether landed costs are eligible for voucher match. PRLAND = 3 records create permanent open balances that must be managed through suspension in RapidReconciler. |
| **Out-of-sequence reversals** | Reversing a receipt or voucher match out of the normal sequence can create accounting entries that are difficult to trace and may require IT intervention to resolve. |
| **Aging open receipts** | Receipts that have been open for an extended period accumulate in the RNV balance. Without a dedicated reconciliation tool, these are difficult to identify and address systematically. |

### 12.3 Methodology Comparison

The absence of As-Of reporting from F43121 means the reconciliation methodology differs from inventory:

| Aspect | Inventory Reconciliation | RNV Reconciliation |
|---|---|---|
| **Method** | Roll-forward from item ledger vs. GL | Current balance-to-balance comparison |
| **Historical view** | Available via As-Of page | **Not available** — F43121 overwrites on reversal |
| **Period comparison** | Can reconcile any prior period | Current balance only |
| **Key risk** | Timing differences between cardex and GL | Open receipts that should be cleared but are not |

### 12.4 How RapidReconciler Helps

| Challenge | RapidReconciler Solution |
|---|---|
| **Manual matching of F43121 to GL** | RapidReconciler imports F43121 and F0911 data and performs the comparison automatically, surfacing only unreconciled items |
| **Identifying which receipts are open** | The Unreconciled link on the home screen shows only purchase orders with open amounts and reconciliation issues |
| **Manual voucher clearances creating false variances** | The Suspension feature allows orders cleared via manual journal entry to be removed from variance calculations |
| **Drill-down to the root cause** | From the summary level, users can drill down to the order, line, and document level to identify exactly where the discrepancy exists |
| **Aging open receipts** | All open receipts are visible in a single view, making it straightforward to identify items outstanding for extended periods |
| **PRLAND = 3 landed cost records** | These can be suspended in RapidReconciler to prevent them from creating a permanent false variance |

---

## Section 13: Period-End Close Checklist

Use this checklist to perform a clean RNV close. Because F43121 cannot be reconstructed historically, the close should occur as close to period end as possible.

**Before close:**

1. Confirm all P4312 receipts for the period are posted (R09801).
2. Confirm all P4314 voucher matches for the period are posted.
3. Run the open receipts report and capture totals by company, branch/plant, and GL account.
4. Capture F0902 RNV balances by the same dimensions.
5. Identify any direct journal entries posted to RNV — investigate each one.

**During reconciliation:**

6. Compare open receipts total to F0902 balance.
7. Drill down on any variance to the order/line/document level.
8. Identify and suspend PRLAND = 3 landed cost records.
9. Identify and suspend orders cleared by manual journal entry.
10. Identify aged open receipts (> 90 days) and assign for follow-up.

**Post-close documentation:**

11. Document the variance, root causes, and resolution path.
12. Retain the open receipts snapshot — this is your only point-in-time evidence.
13. Note any items requiring IT assistance (out-of-sequence reversals, etc.).

---

## Section 14: Troubleshooting Common Issues

| Symptom | Likely Cause | Investigation Path |
|---|---|---|
| RNV balance growing month over month | Voucher matches not keeping pace with receipts; aging open receipts | Review open receipts aging; engage AP team |
| Reconciling variance won't go to zero | Manual JE to RNV; PRLAND = 3 record; out-of-sequence reversal | Drill down by order; suspend non-actionable items |
| 4355 (RNV Tax) doesn't clear | Tax code added at voucher but not at receipt (or vice versa) | Compare F43121 tax fields to F0911 tax entries |
| Landed cost expected but no entry created | GL class missing; UDC 41/9 missing entry; PO not flagged for landed cost | Review Landed Cost Revisions and Item Branch/Plant Category Codes |
| Routing operation balance won't clear | Goods stuck at INSPE or TRAN; never moved via P43250 | Run routing inventory report; engage receiving team |
| Voucher match won't post | AAI configuration missing for combination of company/GL class | Review DMAAI 4320/PC for the company in question |
| Inventory and RNV both off by the same amount | Receipt posted but R09801 not run for that batch | Verify GL Post status |
| 2-way match created an RNV balance | Order configured for 3-way; line type changed mid-process | Review P4310 line type and processing options |

---

## Section 15: Quick-Reference Tables

### 15.1 Match Type Cheat Sheet

| Match Type | Opens or Closes RNV | Source Program |
|---|---|---|
| 1 | Opens | P4312 |
| 2 | Closes | P4314 / P0411 |
| 3 | Closes (reversal) | P4312 |
| 4 | Reopens (reversal) | P4314 / P0411 |
| 5 | Opens (landed cost) | P4312 / P43214 |
| 6 | Closes (landed cost) | P4314 / P0411 |

### 15.2 PRLAND Cheat Sheet

| PRLAND | Type | Vouchered? | RNV Behavior |
|---|---|---|---|
| Blank / 1 | Standard / item line | Yes | Clears at voucher match |
| 2 | Landed cost | Yes | Clears at voucher match |
| 3 | Landed cost accrual | **No** | **Permanent open balance** — suspend in RapidReconciler |

### 15.3 Tax Code Decision Tree

- Is the tax paid to the supplier?
  - Yes, fully → likely **S** (not recoverable) or **V** (recoverable)
  - Yes, partially (Canada) → **C** (PST to supplier) or **B** (PST withheld)
  - No, self-assessed → **U**
- Is the buyer exempt? → **E**

### 15.4 AAI Quick Lookup

| Looking for... | Use AAI |
|---|---|
| Inventory account | 4310 |
| RNV liability | 4320 |
| PPV (price variance) | 4330 |
| Cost of sales variance | 4332 |
| Standard cost variance | 4335 |
| FX variance | 4340 |
| Tax expense | 4350 |
| RNV tax liability | 4355 |
| Routing liability | 4365 |
| Routing asset | 4370 |
| Routing disposition expense | 4375 |
| Landed cost expense | 4385 |
| Landed cost liability | 4390 |
| A/P Trade | PC |
| Tax-related A/P / VAT recoverable | PT |

---

## Section 16: Programs and Tables Index

### 16.1 Programs

| Program | Name | Purpose |
|---|---|---|
| **P4310** | Purchase Order Entry | Create and maintain purchase orders |
| **P4312** | Purchase Order Receipts | Process receipts; create Match Type 1 |
| **P4314** | Voucher Match to Open Receipt | Match invoice to receipt; create Match Type 2 |
| **P0411** | Standard Voucher Entry | Calls P4314 for matched vouchers |
| **P0901** | Account Master | GL chart of accounts |
| **P04012** | Supplier Master | Default tax codes, landed cost rule, terms |
| **P40204** | Order Activity Rules | Status flow for orders by type/line type |
| **P40901** | Distribution AAIs | DMAAI configuration (4310, 4320, etc.) |
| **P40950** | Line Type Constants | Inventory interface, GL flags |
| **P41026** | Item Branch/Plant Category Codes | Item-level landed cost rule assignment |
| **P41291** | Landed Cost Revisions | Define and apply landed costs |
| **P43091** | Receipt Routing Definition | Define routing operation sequence |
| **P43214** | Stand Alone Landed Cost / Open Receipts by Supplier | Apply landed costs outside receipt; reverse PO receipts |
| **P43250** | Movement and Disposition | Move goods between routing operations |
| **R09801** | General Ledger Post | Posts F0911 to F0902; creates A/P Trade entries |

### 16.2 Tables

| Table | Name | Notes |
|---|---|---|
| **F4311** | Purchase Order Detail | Holds GL Offset for tax AAIs in procurement |
| **F43121** | PO Receiver | Source of truth for RNV; not a true ledger (overwrites on reversal) |
| **F0911** | Account Ledger | GL transaction detail |
| **F0902** | Account Balances | GL period-end balances |
| **F4111** | Item Ledger (Cardex) | Inventory transaction history |
| **F0401** | Address Book — Suppliers | Tax authority, supplier records |
| **F4008** | Tax Rate/Areas | Tax rate definitions |
| **F4070** | Tax Rules | System-specific tax rules |

### 16.3 UDC Tables

| UDC | Purpose |
|---|---|
| **00/EX** | Tax Explanation Codes (S, U, V, C, B, E) |
| **40/AV** | Average cost calculation rules |
| **40/CA** | Landed Cost Levels |
| **41/9** | GL Class Codes |
| **41/P5** | Landed Cost Rules |
| **43/RC** | Receipts Routing Operations |

---

## Section 17: Related Documentation

| Document | Relevance |
|---|---|
| [Reconciling RNV in RapidReconciler](../MDS/reconciling-rnv.md) | How to use the PO Receipts module — summary, drill-down, suspension, and F43121 match type reference |
| [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md) | Complete AAI configuration for all purchasing transactions including 4310, 4320, 4330, 4332, 4335, 4340, 4350, 4355, 4385, 4390 |
| [Stock Status and Trial Balance Reconciliation](../MDS/stock-status-trial-balance.md) | Root causes of GL balance discrepancies applicable to both inventory and RNV |
| [Accounting in Purchasing](../MDS/accounting-in-purchasing.md) | Broader context on procurement accounting flow |
| [Sales Order Reference Guide](../MDS/sales_order_reference.md) | Companion guide for the order-to-cash side |
| [Transfer Order Reference Guide](../MDS/transfer_order_reference.md) | ST/OT in-transit tracking, including RapidReconciler alternative to TRAN routing |
| [Product Costing Reference Guide](../MDS/product-costing-reference.md) | Cost methods and bucket updates referenced by landed costs |
| [Zero Balance Adjustments](../MDS/zero-balance-adjustments.md) | Handling residual variances at close |
| [Getting Started with RapidReconciler](../MDS/getting-started-with-rapidreconciler.md) | Login, navigation, and application overview |
