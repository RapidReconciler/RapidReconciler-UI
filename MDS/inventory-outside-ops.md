# Outside Operations Reference Guide

## Setup, Execution, Accounting, and Troubleshooting

---

## Table of Contents

- [Overview](#overview)
- [Section 1: How Outside Operations Work -- Process Flow](#section-1-how-outside-operations-work----process-flow)
- [Section 2: Item Master Setup (F4101)](#section-2-item-master-setup-f4101)
- [Section 3: Item Branch Setup (F4102)](#section-3-item-branch-setup-f4102)
- [Section 4: Work Center Setup (F3006)](#section-4-work-center-setup-f3006)
- [Section 5: Routing Master Setup (F3003)](#section-5-routing-master-setup-f3003)
- [Section 6: Standard Cost Simulation and Freeze](#section-6-standard-cost-simulation-and-freeze)
- [Section 7: Generate and Print Work Orders (R31410)](#section-7-generate-and-print-work-orders-r31410)
- [Section 8: Purchase Order Receipt (P4312)](#section-8-purchase-order-receipt-p4312)
- [Section 9: Manufacturing WIP Journal Entries (R31802A)](#section-9-manufacturing-wip-journal-entries-r31802a)
- [Section 10: Voucher Match](#section-10-voucher-match)
- [Section 11: Complete Journal Entry Summary](#section-11-complete-journal-entry-summary)
- [Section 12: Troubleshooting -- Why a Purchase Order Is Not Created](#section-12-troubleshooting----why-a-purchase-order-is-not-created)
- [Section 13: Common Mistakes and How to Avoid Them](#section-13-common-mistakes-and-how-to-avoid-them)
- [Section 14: Quick Setup Checklist](#section-14-quick-setup-checklist)
- [Section 15: Related Documentation](#section-15-related-documentation)

---

## Overview

An Outside Operation is Manufacturing's vehicle to interface with Accounts Payable, allowing a purchase order to be created in JD Edwards so that when a vendor sends an invoice for their services, a voucher match can be performed. An Outside Operation represents **payment for services rendered** -- it is not an inventoried item.

Outside Operations are used when a step in a manufacturing routing is performed by an external vendor rather than an internal work center. Common examples include plating, heat treating, painting, powder coating, and specialized machining that cannot be performed in-house.

> **Important:** The setup of an outside operation is not complicated, but each step must be followed exactly and in the correct sequence. Deviating from the prescribed order will produce incorrect or incomplete results including missing purchase orders, incorrect costing, and cardex integrity issues.

---

## Section 1: How Outside Operations Work -- Process Flow

Understanding the end-to-end flow before beginning setup helps prevent common configuration errors.

| Step | Action | Program | Result |
|---|---|---|---|
| **1** | Item Master setup | P4101 | \*OP item created with correct stocking type and line type |
| **2** | Item Branch setup | P4102 | Branch record created with cost in F4105 |
| **3** | Work Center setup | F3006 | Outside operation work center configured |
| **4** | Routing Master setup | F3003 | Routing step created with supplier, PO flag, and D-type cost component |
| **5** | Standard Cost Simulation | R30812 | A1 cost and D-type cost component generated |
| **6** | Frozen Standard Update | R30835 | Costs frozen in F30026 |
| **7** | Work Order Processing | R31410 | Work order created with routing; Outside Operation PO generated via P3420 |
| **8** | PO Receipt | P4312 | OV and IM cardex entries created; P3103 window opens |
| **9** | Manufacturing Accounting | R31802A | IH journal entries created for WIP |
| **10** | Voucher Match | P4314 / P0411 | Vendor invoice matched to RNV; AP liability created |

---

## Section 2: Item Master Setup (F4101)

### 2.1 Item Number Format

The item number for an outside operation **must** follow this naming convention:

**Parent Item Number + \*OP + Operation Sequence Number**

**Example:** `333*OP10`

> **Note:** JD Edwards World software supports decimal-separated operation sequence numbers (e.g., `333*OP10.6`). EnterpriseOne does **not** support this convention.

**Parent item number length restriction:** The parent second item number (LITM) must be **22 characters or fewer**. The item number field in F4101 is limited to 25 characters. R31410 uses the \*OP suffix and operation sequence number, which require at least 3 additional characters. If the parent LITM exceeds 22 characters, the \*OP suffix will be truncated and P3103 will not be called at receipt -- see Section 9.2 for the full explanation.

If the Short Item Number (ITM) or Catalog Number (AITM) is used instead of the correctly formatted second item number, the following will fail:

- The Purchase Order will not be created
- Product Costing will not generate a Dx cost on the parent item
- A cost for the Outside Operation in F30026 will not be generated

### 2.2 Required Item Master Fields

| Field | Required Value | Notes |
|---|---|---|
| **Stocking Type (STKT)** | X | The second description of the X stocking type must be **"P"** in UDC table 41/I |
| **Line Type (LNTY)** | X | Maintains the link between the Purchase Order and the Work Order by controlling whether P3103 is displayed after PO receipt |
| **Inventory Cost Level (CLEV)** | 1 or 2 | Cost Level 3 is not supported. Outside Operations are non-inventory items (payment for services). Multi-Location, Lot Numbers, and Serial Numbers are not supported. |

> **Warning:** Do not make the \*OP item lot-controlled. The OV will be written to the location in the PO fold, but the IM will always be written to the Primary Location, causing cardex integrity problems.

---

## Section 3: Item Branch Setup (F4102)

- The Stocking Type and Line Type will default from the Item Master -- **do not change them**.
- A cost value **must** be entered in the **Cost Revision table (F4105)** for the \*OP item. This is required because it is a purchased part with Stocking Type X and a second description of "P."
- The GL Class Code on the Item Branch record should be reviewed to ensure it maps to the correct AAI accounts for the outside operation.

---

## Section 4: Work Center Setup (F3006)

| Field | Required Value | Notes |
|---|---|---|
| **Pay Point** | 0 (zero) | May be set to "M" if there are very long lead times |
| **Prime Load Code** | O | Required for outside operation processing |
| **Critical Work Center** | N (No) | Must not be flagged as critical |
| **Move or Queue Hours** | Populate if applicable | If lead time should default into the routing, populate here; alternatively, populate directly in the Routing |

---

## Section 5: Routing Master Setup (F3003)

### 5.1 Operation Sequence

The sequence number used in the item number must correspond exactly to the **operation sequence of the Outside Operation** in the defined routing. If the item number is `333*OP10`, the outside operation must be at operation sequence 10 in the routing.

### 5.2 Required Fields for the Outside Operation Routing Step

| Field | Requirement |
|---|---|
| **Supplier Number (VEND)** | Must be a valid Address Book number. This is the supplier to whom the Purchase Order will be written. |
| **PO (POY)** | Must be set to **Y** |
| **Cost Type (COST)** | Must use a cost component starting with **"D"** (reserved by JD Edwards for Outside Operations). If multiple Outside Operations exist on the same routing, each must use a unique cost type (e.g., D1, D2, D3). Each must be defined in UDC table **30/CA** with the Special Handling Code set to **"1"**. If this field is not blank and outside operations are not being used, Manufacturing Accounting (R31802A) will generate a **"Divide by Zero"** error. |
| **Yield Percent** | Must be set to **100%**. A blank value will prevent PO creation. |

### 5.3 Position in the Routing

> **Important:** The Outside Operation **cannot be the last step** on the routing for two reasons:
> - If using Super Backflush, completion cannot occur to an outside operation work center because the pay point must be zero. The last routing operation must be a payable pay point.
> - The purchasing receipt will not update F43121, which prevents voucher match from being performed.

**Workaround:** Add an additional routing step after the outside operation (e.g., "Receive Outside Op") with no machine or labor hours. If using Super Backflush, this final step must be set as a pay point.

---

## Section 6: Standard Cost Simulation and Freeze

### 6.1 Standard Cost Simulation (R30812)

On the Processing tab, enter a valid F4105 cost method that has a cost value associated with it for the Outside Operation in **option 3b**.

A successful R30812 run will produce:

- An **A1 cost** for the \*OP item
- A **"D" type cost component** on the parent item for the Outside Operation

### 6.2 Frozen Standard Update (R30835)

After simulation, run the Frozen Standard Update (R30835) to freeze the simulated costs into F30026. This frozen cost is used by Manufacturing Accounting (R31802A) to calculate the IH journal entry amount.

---

## Section 7: Generate and Print Work Orders (R31410)

### 7.1 Processing Options

**Process tab -- Generate Parts List and Routing Instructions:**
- Enter **2** or **3** to attach a routing.

**Routing tab -- Purchase Order Information (options 2, 3, and 4):**
- Enter the Document Type to be used for the Purchase Order.
- Set the Line Type to **X**.
- Enter a beginning status corresponding to the Order Activity Rules for Purchasing.

> **Important:** The work order routing must be attached using R31410. Without this step, no Outside Operation Purchase Order will be generated. R31410 calls P3420 (Write Purchase Order) to create the PO.

An enhancement in EnterpriseOne release 8.9 introduced support for interactive attachment of routings with outside operation PO generation.

### 7.2 Results When R31410 Completes Successfully

- The **Related PO fields** in the fold are populated with the Related Purchase Order Number and Document Type.
- An **F3112 record** is created for the Outside Operation with the Quantity (UORG) and Quantity at Operation (QMTO) populated with the quantity for which the PO was issued.

---

## Section 8: Purchase Order Receipt (P4312)

### 8.1 Receipt Procedure

- Receive the Outside Operation Purchase Order by entering **1** in the REC OPT field and clicking OK.
- Ensure the **Location (LOCN)** and **Lot/SN (LOTN)** fields are **blank** in the line detail of the Purchase Order.
- Confirm that the beginning status and document type match the processing option values in R31410, P4311, and P4312.
- Confirm that Order Activity Rules are set up for **Line Type X** (accessed from G43A41).

### 8.2 What Happens at Receipt

When the Purchase Order is received:

- An **OV transaction** is written to the cardex, increasing the on-hand balance.
- The **P3103 window** displays immediately after entering the receipt. This window creates an **IM record** in the cardex for the opposite amount of the OV. The net effect is a **zero on-hand balance**.
- The IM will always be written to the **primary location**.
- In the F3112 record: Quantity (UORG) remains the same; Quantity at Operation (QMTO) is decreased by the quantity received; Quantity Shipped (SOQS) is increased by the quantity received.

> **Note:** The Batch Number, GL Date, User ID, and Program ID are **not** updated in the cardex for the IM entry that corresponds to the Outside Operation.

### 8.3 Expected On-Hand Quantity

If the receipt and P3103 process complete correctly, the OV and IM transactions net to zero and there should be **no quantity on hand** for any \*OP item at any time. A non-zero on-hand balance on a \*OP item is always an indicator of a processing error -- most commonly that P3103 was not called at receipt.

> **RapidReconciler:** RapidReconciler automatically assigns the internal account **"Outside Operations"** to each item ledger and location record for \*OP items. These inventory records are not displayed in the application since outside operations are not expected to carry an inventory balance. However, all corresponding **general ledger records remain visible**. If a variance is identified in the GL that was caused by improper outside operation processing, use your internal guidelines to investigate and correct.

### 8.4 Journal Entries at Receipt

Three purchasing AAIs are used at receipt:

| AAI | Entry | Account | Notes |
|---|---|---|---|
| **4310** | Debit | Inventory | Should be an offsetting account with AAI 3401. Balances the 4320 journal entry. |
| **4320** | Credit | Received Not Vouchered (RNV) | Interfaces with Accounts Payable |
| **4335** | | Standard Cost Variance | Used only when a standard cost variance exists between the PO cost and the frozen standard cost |

---

## Section 9: Manufacturing WIP Journal Entries (R31802A)

### 9.1 Overview

After the Outside Operation Purchase Order has been fully or partially received, R31802A can be run to produce **IH journal entries** related to the Outside Operation.

### 9.2 Journal Entries Produced

| AAI | Entry | Account | Notes |
|---|---|---|---|
| **3120** | Debit | Work In Process (WIP) | Represents the value of the Outside Operation incorporated into the parent cost |
| **3401** | Credit | Accruals | Should use the same account number as AAI 4310 -- both accounts are primarily used to balance 3120 and 4320 and are otherwise relatively meaningless as stand-alone balances |

### 9.3 IH Calculation

R31802A performs the following calculation to determine the IH journal entry amount:

**(SOQS − CLUN) × F30026 cost of the Outside Operation**

| Field | Description | Source Table |
|---|---|---|
| **SOQS** | Quantity Shipped | F3112 |
| **CLUN** | Actual Units | F3102 |

An IH document type journal entry is created for the resulting amount. After the calculation, the system updates CLUN in F3102 to match SOQS in F3112, ensuring that duplicate IH journal entries are not created for the Outside Operation.

---

## Section 10: Voucher Match

After the vendor invoice is received, the Outside Operation PO is matched through the standard Accounts Payable voucher match process (P4314 / P0411).

### 10.1 Journal Entries at Voucher Match

| AAI | Entry | Account | Notes |
|---|---|---|---|
| **4320** | Debit | Received Not Vouchered (RNV) | Clears the RNV liability created at receipt |
| **4330** | | Purchase Price Variance | Used if the invoice amount differs from the receipt amount |
| **4332** | | Cost of Sales Variance | Used if goods were consumed before voucher match and a variance exists |
| **PC** | Credit | A/P Trade Account | Records the liability to the vendor |

---

## Section 11: Complete Journal Entry Summary

The following table shows the complete accounting flow for an Outside Operation from receipt through voucher match:

| Step | Document Type | AAI | Account | Debit | Credit |
|---|---|---|---|---|---|
| **PO Receipt** | OV | 4310 | Inventory | x | |
| **PO Receipt** | OV | 4320 | RNV | | x |
| **IM (P3103)** | IM | 4310 | Inventory | | x |
| **IM (P3103)** | IM | 3401 | Accruals | x | |
| **Manufacturing Accounting** | IH | 3120 | WIP | x | |
| **Manufacturing Accounting** | IH | 3401 | Accruals | | x |
| **Voucher Match** | PV | 4320 | RNV | x | |
| **Voucher Match** | PV | PC | A/P Trade | | x |

> **Note:** AAI 4310 and AAI 3401 should point to the same account. The OV debit and IM credit to AAI 4310 net to zero. The IM debit to 3401 and IH credit to 3401 also net to zero. The net effect is that WIP (3120) is debited and RNV (4320) is credited, which is the expected outcome for an outside operation.

---

## Section 12: Troubleshooting -- Why a Purchase Order Is Not Created

If a Purchase Order is not generated for an Outside Operation, or the message **"No PO"** displays in the Outside Operation routing step, use the following checklist to identify the cause.

> **First Step:** Before investigating further, attempt to manually enter a PO for the outside operation item directly from **P4310** (using the same version called by R31410). If an error occurs or the PO cannot be created, the problem likely lies with P4310 or the vendor setup -- see Section 12.4.

### 12.1 Item Setup Issues

| # | Issue | Description |
|---|---|---|
| **1** | Secondary UOM differs from primary UOM | The \*OP item number has a secondary unit of measure different from the primary UOM |
| **2** | Missing UOM conversions | The \*OP item number does not have UOM conversions defined when UOM values are different |
| **3** | Parent second item number contains spaces | Only a problem in releases prior to OneWorld XeU1. See SAR 4719215. |
| **4** | Parent item number exceeds 22 characters | The parent LITM must be 22 characters or fewer to allow the \*OP suffix and operation sequence to fit within the 25-character limit -- see Section 12.5 for full explanation |

### 12.2 System Setup Issues

| # | Issue | Description |
|---|---|---|
| **5** | Short item number set as primary ID | Do not define the short item number as the primary ID in Branch/Plant Constants when using \*OP item numbers -- see Section 12.6 for full explanation |
| **6** | Order Activity Rules mismatch | The Order Activity Rules (P40204) for Order Type OP and Line Type X must match the document type, line type, and beginning status defined in both R31410 Routing tab processing options and P4310 Defaults tab processing options |
| **7** | Special Handling Code not set to 1 | The Special Handling Code on the outside operation cost component in UDC 30/CA must be set to **"1"** -- the cost component does not have to be D1 specifically, but whatever cost component is used must have Special Handling Code = 1 |

### 12.3 Work Order and Routing Setup Issues

| # | Issue | Description |
|---|---|---|
| **8** | Yield Percent is blank | The Yield Percent field on the work order routing must be set to **100%** -- a blank value will prevent PO creation |
| **9** | Required routing fields are blank | PO Type (RCTO) must be "Y"; Primary Supplier (VEND) must contain a valid Address Book number; Cost Type (COST) must be a valid D-type with Special Handling Code "1" in UDC 30/CA |
| **10** | Work order header branch differs from cost center branch | The work order header branch plant is different from the cost center branch (Additional Details 1 tab) -- valid issue for release B7332 only. See SAR 4079001. |

### 12.4 Purchase Order and Vendor Setup Issues

| # | Issue | Description |
|---|---|---|
| **11** | Item is on the vendor's restriction list | The item is included in the vendor's list of item restrictions in Purchasing Instructions (P04012, accessed from G43A16) |
| **12** | Tax Rate/Area set with blank Tax Explanation Code | The vendor is configured with a Tax Rate/Area code (TXA2) but a blank Tax Explanation Code (EXR2) |
| **13** | PO request date precedes work order start date | The PO request date is before the work order header start date -- valid issue for release B7332 only. See SAR 4525293. |

### 12.5 Item Number Length Issue -- P4312/P3103 Logic

The key to understanding the P4312/P3103 behavior is that **the content of the item number does not matter** -- only the **number of characters** does.

**The logic works as follows:**

1. P4312 takes the **second item number (LITM)** of the parent item and counts the number of characters.
2. It **removes that number of characters** from the beginning of the \*OP item number.
3. It checks whether the **next three characters** equal **"\*OP"**.
4. If they do, the item is recognized as an outside operation and P3103 is called. If not, P3103 is not called.

**Example of failure:**

- Parent LITM: `1234567890ABCDEFGHIJKLM` (23 characters)
- R31410 creates: `1234567890ABCDEFGHIJKLM*O` (truncated -- exceeds 25-character limit)
- P4312 removes first 23 characters, leaving: `*O`
- The comparison to `*OP` fails -- P3103 is **not called**
- Result: No IM transaction or blank IM cardex entry; on-hand inventory incorrectly created on the \*OP item number

**Rule:** The parent second item number must be **22 characters or fewer**.

### 12.6 Short Item Number as Primary ID

When R31410 generates the \*OP item number, it uses the **short item number** to construct it. However, when P4312 processes the receipt, it uses the **second item number** character count to identify the \*OP.

**Example of failure:**

- Item: 220 | Short Item Number: 548691
- R31410 generates: `548691*OP10`
- P4312 takes the second item number `220`, counts **3 characters**
- Removes first 3 characters from `548691*OP10`, leaving: `691*OP10`
- The next 3 characters are `691` -- not `*OP`
- P3103 is **not called**

**Exception:** This would only work correctly if the second item number and the short item number have the exact same number of characters.

**Recommendation:** Do not define the short item number as the primary ID in Branch/Plant Constants when using \*OP item numbers.

### 12.7 Security

Insufficient security permissions to the **Item Branch/Plant program (P4102)** will prevent the system from creating a Purchase Order from the Work Order. Verify that the user account running R31410 has the appropriate permissions to P4102.

---

## Section 13: Common Mistakes and How to Avoid Them

| Mistake | Consequence | Prevention |
|---|---|---|
| \*OP item is lot-controlled | OV writes to PO location; IM writes to primary location -- creates a cardex integrity issue | Set Inventory Cost Level to 1 or 2; never make \*OP items lot-controlled |
| Outside operation is the last routing step | Voucher match cannot be performed (F43121 not updated) | Always add a final routing step after the outside operation |
| D-type cost component missing from UDC 30/CA or Special Handling Code not "1" | PO not created; R31802A generates "Divide by Zero" error | Verify UDC 30/CA before running R31410 |
| Parent item number exceeds 22 characters | P3103 not called at receipt; IM not created; on-hand incorrectly created | Enforce 22-character limit on parent LITM |
| Short item number set as primary ID | P3103 not called; outside operation not recognized at receipt | Use second item number (LITM) as primary ID |
| Stocking Type or Line Type changed at Item Branch | Link between PO and Work Order broken | Never override these fields at the branch level |
| R31410 run without routing attachment | No PO generated | Always set Process tab option 2 or 3 to attach routing |
| \*OP item shows quantity on hand | P3103 was not called at receipt -- OV posted but IM did not; on-hand incorrectly created on \*OP item | Investigate root cause (item number length, primary ID setting, security); correct per internal guidelines; RapidReconciler GL records will be visible even though inventory records are not displayed |
| AAI 4310 and 3401 point to different accounts | Offsetting entries do not net to zero; unexplained balances in both accounts | Configure AAI 4310 and 3401 to the same account number |
| Yield Percent left blank on routing | PO not created | Set Yield Percent to 100% on all outside operation routing steps |

---

## Section 14: Quick Setup Checklist

Use this checklist to verify all required configuration before running Work Order Processing (R31410).

- [ ] \*OP item number follows the correct naming convention (Parent LITM + \*OP + Operation Sequence)
- [ ] Parent LITM is 22 characters or fewer
- [ ] \*OP item Stocking Type = X (with UDC 41/I second description = "P")
- [ ] \*OP item Line Type = X
- [ ] \*OP item Inventory Cost Level = 1 or 2 (not 3, not lot-controlled)
- [ ] F4105 cost exists for the \*OP item
- [ ] Outside operation work center Pay Point = 0, Prime Load Code = O, Critical Work Center = N
- [ ] Routing step Supplier Number (VEND) is populated with a valid Address Book number
- [ ] Routing step PO flag (POY) = Y
- [ ] Routing step Cost Type (COST) is a D-type with Special Handling Code = "1" in UDC 30/CA
- [ ] Routing step Yield Percent = 100%
- [ ] Outside operation is NOT the last routing step -- a final step follows it
- [ ] Order Activity Rules configured for Order Type OP, Line Type X
- [ ] R30812 and R30835 run successfully (A1 cost and D-type component visible on parent item)
- [ ] R31410 Process tab set to attach routing (option 2 or 3)
- [ ] R31410 Routing tab has correct Document Type, Line Type X, and beginning status
- [ ] Short item number is NOT set as the primary ID in Branch/Plant Constants
- [ ] Security: R31410 user has access to P4102

---

## Section 15: Related Documentation

- [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md)
- [Manufacturing AAIs and Accounting](../MDS/manufacturing-aais.md)
- [Product Costing Reference Guide](../MDS/product-costing-reference.md)
- [Accounting in Purchasing](../MDS/accounting-in-purchasing.md)
- [Item Ledger and Cardex Analysis Guide](../MDS/item-ledger-cardex-guide.md)
