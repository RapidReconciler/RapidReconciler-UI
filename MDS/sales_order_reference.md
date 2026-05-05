# JD Edwards Sales Order Reference Guide

## Sales Update, Tax, Direct Ship Orders, and Intercompany Processing

---

## Table of Contents

- [Overview](#overview)
- [Section 1: Sales Update (R42800)](#section-1-sales-update-r42800)
- [Section 2: Tax in Sales](#section-2-tax-in-sales)
- [Section 3: Direct Ship Orders](#section-3-direct-ship-orders)
- [Section 4: Sales Order Intercompany Processing](#section-4-sales-order-intercompany-processing)
- [Section 5: Related Documentation](#section-5-related-documentation)

---

## Overview

This reference guide covers four key areas of JD Edwards Sales Order Management. Each section is self-contained and can be referenced independently.

| Section | Topic |
|---|---|
| **Section 1** | Sales Update (R42800) -- Purpose, processing, AAIs, errors, and common problems |
| **Section 2** | Tax in Sales -- Setup, explanation codes, AAIs, and error resolution |
| **Section 3** | Direct Ship Orders -- Configuration, partial shipments, and multi-currency |
| **Section 4** | Intercompany Processing -- SI/SK/OK orders, journal entries, and cost alignment |

---

## Section 1: Sales Update (R42800)

### 1.1 Overview

Sales Update is the final step in the sales order process. It provides the interface between Sales Order Processing and the JD Edwards Inventory, Accounts Receivable, and General Ledger modules.

**Sales Update serves four main purposes:**

- **Updates the Financials systems** -- Creates journal entries in the General Ledger (F0911) and receivable records in Accounts Receivable (F0311)
- **Updates inventory on-hand quantity** -- If not previously done by Shipment Confirmation (P4205)
- **Closes out the sales order** -- Advances status to 999
- **Purges the sales order** -- Moves records to history files if configured to do so

### 1.2 Files Updated

| File | Description |
|---|---|
| **F0311** | Accounts Receivable Ledger |
| **F0911** | General Ledger Account Ledger |
| **F41021 / F4111** | Item Location / Item Ledger (Cardex) |
| **F4229 / F4115** | Sales Summary History / Detailed Sales History |
| **F0018** | Tax Reporting (written at Post, not at Sales Update) |
| **F42005** | Sales Commissions |
| **F4211** | Sales Order Detail (status advanced to 999) |
| **F4314** | Text File |
| **F42199** | Sales Order Detail Ledger |
| **F42119** | Sales Order Detail History |
| **F42019** | Sales Order Header History |

### 1.3 Processing Order

Sales Update processes all selected F4211 records in two or three major cycles:

**First (if applicable):** If processing option 22 is set, the Update Sales Price/Cost program (P42950) processes all F4211 records.

**Second:** Sales Update creates records in F0311 (A/R) and F0911 (GL), processing one F4211 record at a time.

- F0311 records are created dependent on processing option 14
- F0911 records require both the GL Interface flag in the line type AND the Interface with GL flag in Branch/Plant Constants to be set

**Third:** After all F0311 and F0911 records are created, Sales Update updates the following files in order:

F41021 → F4111 → F4115 → F4229 → F42005 → F4314 → F4211 (status to 999) → F42199 → F4074 → F42119 → F42019

> **Note:** F4201 records will not purge to F42019 until all associated F4211 records have been purged to F42119.

### 1.4 Inventory Relief -- Ship Confirmation vs. Sales Update

| Method | Cardex Behavior | When to Use |
|---|---|---|
| **At Ship Confirmation** | Cardex record written with sales order doc type and number; no GL date. During Sales Update, the sales order doc number is replaced with the invoice doc number and GL date is assigned. | Order type must be in UDC table **40/IU** |
| **At Sales Update** | Cardex updated once with invoice number in the Document Number and Type fields. Sales order number visible in Item Ledger Information (V4111W). | Order type must **not** be in UDC table 40/IU |

### 1.5 AAIs Used by Sales Update

| AAI | Description |
|---|---|
| **4220** | Cost of Goods Sold |
| **4230** | Revenue |
| **4240** | Inventory |
| **4245** | Accounts Receivable Trade (used when bypassing A/R) |
| **RC** | Accounts Receivable Trade (created at Post) |
| **4250** | Tax Liability |
| **4260** | Interbranch Revenue |
| **4270** | Price Adjustments |
| **4280** | Rebates Payable |
| **RT** | VAT and Provincial Sales Tax (validated at Sales Update; GL entry created at Post) |

> **Note:** AAI table numbers are hard-coded within Sales Update and cannot be changed.

### 1.6 Bypassing Accounts Receivable

Setting processing option 14 prevents the creation of F0311 records. F0911 records are still created to maintain a balanced entry. AAI 4245 is used for the A/R entry when bypassing A/R.

| | Bypassing A/R | Not Bypassing A/R |
|---|---|---|
| **At Sales Update -- Debit** | COGS; 4245 A/R | COGS |
| **At Sales Update -- Credit** | Revenue; Inventory | Revenue; Inventory |
| **At Post -- Debit** | -- | RC A/R |

> **Important:** You cannot bypass A/R by setting the A/R flag in the order line type to N. This creates a three-way journal entry that will not post because it is out of balance.

### 1.7 Batch Types Created by Sales Update

| Scenario | Batch Types |
|---|---|
| Running in detail (not summarizing Inventory/COGS) | All entries in **I-batch** |
| Summarizing Inventory and COGS to separate batch (option 12 = 1) | Sales in **I-batch**; Inventory and COGS in **G-batch** |
| Interbranch -- not creating A/R and A/P batches (option 26 = blank) | Regular entries in **I-batch**; interbranch settlement in **ST batch** |
| Interbranch -- creating A/R and A/P batches (option 26 = 1) | Regular entries in **I-batch**; creates **V batch** |

### 1.8 Summary vs. Detail Mode

**A/R Entries -- Summary:** Summarizes F4211 records by invoice number into one pay item. Records only summarize if all of the following fields are identical: KCO, DOC, DCT, CO, TXA1, EXR1, PTC, ITM (if specified in tax rate/area setup).

- Lines with different Tax Explanation Codes or Tax Rate/Areas will not summarize.
- Lines where calculated Due Dates or Discount Due Dates differ will not summarize even if Payment Terms are the same.

**GL Entries -- Summary:** Summarizes F4211 records by invoice number using Short Account ID (AID), Subledger (SBL), and Subledger Type (SBLT).

### 1.9 Proof vs. Final Mode

| Mode | Behavior |
|---|---|
| **Proof** | Generates Invoice Journal (P42800) and Error Report (may not be complete). Does not update status codes or any files. Use to preview journal entries and identify errors. |
| **Final** | Generates Invoice Journal, Error Report (P42801), and Sales Journal (if selected). Updates status codes and files. Performs edits against the GL and A/R functional servers. |

### 1.10 Versions of Sales Update

**Sales Update -- Proof or Final:** Use when the order has been run through Invoice Print (P42565) and contains a document number and type in F4211.
- Data selection: Invoice NE \*BLANKS
- Required sequencing: DOC → DCT → KCO

**Sales Update -- Assign Invoice No. -- Proof or Final:** Use when the order has not been run through Invoice Print.
- Data selection: \*ALL except Invoice Date NE \*ZEROS
- Required sequencing: DOCO → DCTO → KCOO

> **Important:** Do not change the data sequencing for either version.

### 1.11 Reports Generated by Sales Update

| Report | Program | Description |
|---|---|---|
| **Invoice Journal** | P42800 | Journal entry account numbers and amounts for all invoices. Prints in both proof and final mode. |
| **Error Report** | P42801 | Lists errors encountered during processing. Generated automatically. |
| **Sales Journal** (optional) | P42810 | Controlled by processing option 8. Categorizes sales into stock, non-stock, or miscellaneous and displays gross profit percent. |

### 1.12 Common Problems and Resolutions

| Problem | Cause | Resolution |
|---|---|---|
| Multiple F0311 and F0911 records | Running the wrong version of Sales Update -- version that assumes invoice exists when none assigned | Confirm the version and match it to whether an invoice number has been assigned |
| F0311 records created but no F0911 records | GL interface flags not set correctly | Check both the GL Interface flag in the order line type AND the Interface with GL flag in Branch/Plant Constants |
| A/R records not summarizing despite processing option 10 being set | One or more of the seven required fields differ between lines | Review all summarization fields; check C/D flag settings in applicable line types |
| Sales Update stopped mid-processing | Problem F4211 record | Identify record from job log; clean up using DFU/DBU/SQL; verify files updated for prior records |
| Tax file (F0018) not populating | Post program processing option 9 not set | Check option 9 in P09800 -- historical entries must be entered manually via P0018 |
| Status advanced to 999 but no GL/AR/cardex records created | Detail line was already at status 999 before Sales Update ran | Check SDPID field in F4211; use file manipulation to reset status |

### 1.13 Sales Update Error Reference

| Error(s) | Data Item | Type | Cause | Resolution |
|---|---|---|---|---|
| **0000** | DG | 0911 | A/R and GL date from processing options 1 and 3 are in a future fiscal year | Check fiscal date pattern. Batch is still created and will post. |
| **0002** | DCT, DOC, SFX | 0311 | Line did not close to 999, or invoice already processed with pay item not incremented | Change status to 999, or change the pay item of the existing F0311 record |
| **0025 / 2362** | DCT | 0311 | Invoice document type not defined in UDC 00/DI or 00/DT | Add the document type to the applicable UDC tables |
| **0027** | PDCT | 0311 | Related order number exists without an order type | Check the related order type; verify blanks is valid in UDC 00/DT |
| **0028 / 0381** | ANI, AAI | 0911 | AAI not set up (0381) or account number incorrect/not in chart of accounts (0028) | Add missing AAI; verify account in AAI table and chart of accounts |
| **0064** | DGJ | 0311 | GL/A/R date less than beginning fiscal date in company constants | Check fiscal date pattern or enter valid date in processing options |
| **0065** | DG | 0911 | Fiscal date pattern set to future period relative to order date | Check fiscal date pattern; confirm PBCO postings allowed if prior period posting needed |
| **0069** | ANI | 0911 | Account being booked has a posting edit code that does not allow entry | Change the posting edit code in the chart of accounts |
| **0272** | TXA1 | 0311 | Tax Rate/Area not set up, or detail line has Tax Explanation Code but no Tax Rate/Area | Verify Tax Rate/Area setup and effective dates |
| **0748** | EXR1 | 0311 | Tax Explanation Code removed from UDC 00/EX after order was entered | Add the code back to UDC 00/EX or change the F4211 record |
| **1829** | TXA1 | 0311 | RT AAI not set up -- validated for all transactions including non-taxable lines | Set up RT AAI using GL Class Code from GL Offset in Tax Rates and Areas |
| **1837** | AN8 | 0311 | Hold Invoice flag in customer master set to Y | Change customer's Hold Invoice flag to N |
| **3490** | AN8 | 0311 | Address Book number valid but no Customer Master record exists | Add the Customer Master record |
| **3740** | -- | -- | No currency code for customer in multi-currency environment | Add currency code to Customer Master |

---

## Section 2: Tax in Sales

### 2.1 Tax Setup

Tax setup is accessed from menu **G0021**, shared with Financials. The following options are used by Distribution:

- Tax Authorities
- Tax Rates & Areas
- Tax Explanation Codes
- Tax Rules by Company

### 2.2 Tax Explanation Codes

Tax Explanation Codes are defined in UDC table **00/EX** and tell the system what type of tax to apply.

| Code | Description |
|---|---|
| **S** | Standard sales tax |
| **V** | VAT Tax |
| **V+** | VAT Tax with tax-on-tax capability |
| **C** | Canadian Tax with tax-on-tax capability |
| **E** | Exempt from tax |

**Custom codes:** New tax explanation codes can be created but must begin with S, V, C, or E to write a valid record to the tax file (F0018) at post. The tax calculator program (X4008C) is hard-coded to recognize the first character.

> **Important:** Do not create a code of "TX." Although the system will accept it on the UDC table and on an order, no tax amount will be written to the F0018 tax file.

### 2.3 Tax Rate/Area

The Tax Rate/Area identifies a geographic or tax area and defines the tax percentage to be accrued.

| Field | Description |
|---|---|
| **Tax Authority** | Address Book number of the municipality to whom the tax is remitted. Up to five tax authorities can be defined per Tax Rate/Area. |
| **Tax Rate** | The tax percentage for a particular tax authority. |
| **GL Offset** | The GL Class code used by the tax AAIs. |
| **Calc Method** | Indicates whether tax-on-tax applies. Primarily used with Canadian taxes. |
| **VAT Exp** | Percentage of VAT not eligible for input credits. Valid for the third, fourth, and fifth tax authorities with codes C, V, and B. |
| **Total Area Tax Rate** | Sum of all tax authorities' rates, including tax-on-tax where applicable. |

### 2.4 Tax Setup in Item Branch and Line Type

- **Item Branch -- Sales Taxable field:** Determines taxability by item. Defaults to the sales order detail line and can be overridden.
- **Line Type Definition -- TX01 flag:** Controls taxability for non-stock lines. Y = taxable; N = not taxable; 3-8 = taxable at rate indicated by the group number (used for VAT grouping).

### 2.5 Entering Tax on a Sales Order

The Tax Explanation Code and Tax Rate/Area default into the sales order header from Customer Master records.

**Defaulting rules:**
- **Tax Explanation Code** comes from the **Sold-To** customer
- **Tax Rate/Area** comes from the **Ship-To** customer
- If no Tax Explanation Code exists on the Sold-To, both fields are taken from the **Ship-To**

Both fields must be populated. These values default down to the detail lines.

**Viewing tax online:** Use **On-Line Invoice (P42230)**, accessed with F6 from the detail. Press F15 for detailed tax information (V42235).

### 2.6 Tax Explanation Code Examples and AAIs

#### "S" -- Standard U.S. Sales Tax

The standard for United States sales tax. The customer pays the item price plus tax; the supplier remits to tax authorities.

**AAI:** DMAAI **4250**
- Company defaults from the detail Branch/Plant
- GL Class code from the GL Offset in the Tax Rate/Area

**Example:** On a $100 order with 5% tax:
- A/R = $105 | Revenue = $100 | Tax Payable (4250) = $5

The tax amount and account are visible on the Sales Update report.

#### "V" -- VAT Tax

Commonly used in Canada and Europe.

**AAI:** Financial AAI **RT** (accessed via fast path AAI, then F16 for table format)

The RT AAI is structured as RT + the GL Class Code from the Tax Rate/Area setup (e.g., RTTAXX).

The VAT tax amount appears on the Sales Update report, but the GL account distribution is not visible until the batch is posted -- written as an automatic entry (AE) at post.

#### "C" -- Canadian Tax with Tax-on-Tax

Used in Canada for tax-on-tax scenarios.

**AAIs:** Both **RT** and **4250**
- The tax-on-tax percentage uses the **4250 AAI**
- The base tax percentage uses the **RT AAI**

**Example:** Tax Rate/Area with 7% base tax and 8.56% tax-on-tax = 15.56% Total Area Tax Rate.

#### "E" -- Exempt from Tax

No tax is written, but the system **still validates** the RT AAI for exempt orders.

> **Important:** Due to Vertex integration, the system checks that the RT AAI is configured with a valid account number even for exempt orders. If the RT AAI is not set up, **error 1829** will be generated at Sales Update.

### 2.7 Tax AAI Summary

| AAI | Used With | Key Behavior |
|---|---|---|
| **4250** | "S" tax explanation code only | Searches for company, order type, and GL Class Code. Tax amount and account visible at Sales Update. Missing setup generates **error 0381**. |
| **RT** | "V", "C", "E" codes; also non-taxable items/lines | Tax amount visible at Sales Update; GL distribution not visible until post. Also validated for exempt orders and non-taxable lines -- missing setup generates **error 1829**. |

**RT AAI structure:** RT + GL Class Code from the Tax Rate/Area GL Offset. Example: For Tax Rate/Area "COLO" with GL Offset "TAXX" and Company 00001 → **RTTAXX**.

> **Note:** The data item and field value in error 1829 reference the Tax Rate/Area name. The resolution is to set up the RT AAI using the GL Class Code from the Tax Rate/Area GL Offset -- not the Tax Rate/Area name itself.

### 2.8 Tax Calculation Date

The date used for tax calculation can be controlled by configuration:

| Release | Default | Options |
|---|---|---|
| A7.3 | Order date | Enhancement planned (SAR 6361376) to add choice between Invoice Date and Order Date |
| A8.1 | Order date (blank) | 1 = Order date; 2 = Invoice date; 3 = Ship date |

**Where to configure in A8.1 (Tax Service Date Selection -- TXSD):**
- Ship-to address number level: **Customer Billing Instructions** (page 2)
- Header Branch/Plant company level: **Tax Rules by Company** (System A/R)

**Priority:** If the ship-to value is blank, the header Branch/Plant company value is used. If both are blank, order date defaults.

### 2.9 Tax Work File (F0018)

Tax amounts are written to F0018 at **Post** (P09800), not at Sales Update. Processing option 9 in P09800 controls this:

| Setting | Behavior |
|---|---|
| **1** | VAT or Use Tax |
| **2** | All Tax Amounts |
| **3** | All Tax Explanation Codes |
| **Blank** | No update to F0018 |

---

## Section 3: Direct Ship Orders

### 3.1 Overview

A direct ship order records the sale of items purchased from a supplier who ships directly to the customer. The organization does not physically handle the goods -- inventory quantities and availability are not updated in JD Edwards.

When a direct ship order is created, the system generates both a **sales order** and a **purchase order** simultaneously. Direct ship orders are entered using program **P4243**.

### 3.2 Line Type Configuration

The line type typically used for direct ship orders is **"D"**, which carries a **D inventory interface**. This interface:

- Checks inventory for a valid item number
- Does **not** update on-hand quantities
- Does **not** check availability

A 2-way voucher match can be used for the purchase order since inventory quantities are not being updated.

### 3.3 Related Order Fields

The sales order and purchase order generated by a direct ship transaction are linked through the **Related Order** fields in F4211 and F4311:

- In the **sales order**: Found on the detail behind the details (option 1 from a detail line)
- In the **purchase order**: Found in the fold of the detail line

### 3.4 Making Changes to Direct Ship Orders

All changes should be made through program **P4243**.

- Changes made to the **sales order** will automatically update the corresponding purchase order
- Changes made to the **purchase order** will **not** update the sales order

The receipts program (P4312) can be configured to update the sales order status upon full receipt of a direct ship PO line. Partial receipts will not trigger a status update.

> **Note:** Associated text must be entered separately on the sales order and purchase order -- it does not transfer between the two automatically.

> **Note:** Kit and configured items cannot be entered on a direct ship order. Use standard sales or purchase order entry programs for kits.

### 3.5 AAIs Used in Direct Ship Processing

| Side | AAI | Account |
|---|---|---|
| **Sales** | 4230 | Revenue |
| **Sales** | 4220 | Cost of Goods Sold |
| **Sales** | 4240 | Inventory |
| **Sales** | RC / 4245 | Accounts Receivable |
| **Purchasing** | 4310 | Inventory |
| **Purchasing** | PC | Accounts Payable Trade |

### 3.6 Partial Shipments

> **Critical Rule:** Always **ship confirm BEFORE receiving** against the OD document. Ensure that processing option #16 behind ship confirm is set to **blank**.

**Process for partial shipments:**

1. The supplier ships a partial quantity and invoices for that portion.
2. Ship confirm the partial quantity on the sales order side.
3. Invoice the customer for the partial shipment.
4. Process the partial receipt against the OD purchase order document.
5. When the supplier ships the remaining quantity, ship confirm and invoice the customer **before** processing the receipt for the remaining quantity.

### 3.7 Multi-Currency

- A processing option can compare exchange rates on the sales order and issue a warning if a significant currency rate change is detected.
- **Foreign currency mode:** Extended price for the sales order uses the Sold-To customer currency; extended cost for the purchase order uses the Supplier Master currency.
- **Domestic currency mode:** Both sides display using the base currency decimals of the company.
- Changes can only be made in one currency mode at a time. The system automatically updates both foreign and domestic fields when a change is made.

---

## Section 4: Sales Order Intercompany Processing

### 4.1 Overview

The Sales Order Intercompany process fills a customer order from a branch plant other than the revenue/header branch, invoices the customer, and generates an intercompany sales order and purchase order between the two branch plants.

**Order types used:**

| Order Type | Description |
|---|---|
| **SI** | Sales order from Header Branch/Plant to the external customer |
| **SK** | Intercompany sales order -- Detail Branch/Plant bills Header Branch/Plant |
| **OK** | Intercompany purchase order -- Header Branch/Plant owes Detail Branch/Plant |

> **Note:** The item must be set up in both branch plants. The SI base price defaults from the **header** Branch/Plant, not the detail Branch/Plant.

### 4.2 Setup

**Sales Order Entry (P4210) Processing Options for SI Creation:**

**Interbranch tab:**
- **Option 1** -- Set to **1** to enable intercompany processing. If blank, SI orders process as interbranch (not intercompany).
- **Option 2** -- Enter the Order Type that triggers intercompany processing (e.g., SI).

**Process tab:**
- **Option 11 (Cost or Base Price)** -- Determines how the SI cost is calculated. This is critical because the SI cost becomes the price on the SK and the cost on the OK.

| Setting | Result |
|---|---|
| **Blank** | SI cost = cost of item in the Detail Branch/Plant |
| **1** | SI cost = cost of item in Detail Branch/Plant plus markup |
| **2** | SI cost = base price of the Detail Branch/Plant |

### 4.3 Creating the Intercompany SK and OK Orders (R4210IC)

The **Create Intercompany Sales Order (R4210IC)** batch program creates both the SK and OK from the SI. R4210IC calls a version of P4210 to create the SK, which in turn calls a version of P4310 to create the OK.

**Line Type for SK (IC):**
- Inventory Interface: **N** -- edits against item master; allows item's GL Offset to be used on the SK
- Order Activity Rules must be set up for Order Type SK and Line Type IC
- The Header Branch/Plant Address Book Number must be set up as a **customer** in the Customer Master

**Line Type for OK (D):**
- Inventory Interface: **D** -- supports 2-way voucher match
- Order Activity Rules must be set up for Order Type OK and Line Type D
- The Detail Branch/Plant Address Book Number must be set up as a **supplier** in the Supplier Master

**Data selection for R4210IC:**
- BC Document-Original (SDODOC) = zero -- prevents SI lines already processed from being reprocessed
- Inter Branch Sales (SDSO01) = 2 or 4 -- ensures only intercompany orders are selected

### 4.4 Navigating Between Orders

| From | To | Method |
|---|---|---|
| SI | SK | Customer Service Inquiry (P4210) → Additional Information row exit |
| SK | SI and OK | Customer Service Inquiry (P4210) → Additional Information row exit |
| OK | SK | Open Order Inquiry (P4310) → Order Detail row exit → Additional Information form exit |

### 4.5 Running Sales Update (R42800) for Intercompany Orders

Sales Update must process all three orders (SI, SK, OK) to:
- Create an A/R invoice for the SI customer
- Create an A/R invoice for the SK customer (Header Branch/Plant)
- Create an A/P voucher for the OK supplier (Detail Branch/Plant)

**Interbranch tab processing options for R42800:**

| Option | Setting | Purpose |
|---|---|---|
| **Option 1** | SK | Order Type created by R4210IC to be processed |
| **Option 2** | 1 | Creates A/R batch for SK/RT and A/P batch for OK/PV -- required for intercompany |
| **Option 3** | Version of P4314 | Version of Voucher Match to use for OK voucher creation |

### 4.6 Journal Entries

Sales Update creates three batches: an IB batch for the SI, an IB batch for the SK, and a V batch for the OK.

**SI Journal Entries:**

| Account | Debit | Credit | AAI |
|---|---|---|---|
| A/R (Header Co.) | $950.00 | | RC |
| Revenue (Header Co.) | | $950.00 | 4230 |
| COGS (Header Co.) | $850.00 | | 4220 |
| **In Transit / Inventory (Header Co.)** | | **$850.00** | **4240** |

**SK Journal Entries:**

| Account | Debit | Credit | AAI |
|---|---|---|---|
| A/R (Detail Co.) | $850.00 | | RC |
| Revenue (Detail Co.) | | $850.00 | 4230 |
| COGS (Detail Co.) | $85.00 | | 4220 |
| Inventory (Detail Co.) | | $85.00 | 4240 |

**OK Journal Entries:**

| Account | Debit | Credit | AAI |
|---|---|---|---|
| **In Transit / Inventory (Header Co.)** | **$850.00** | | **4310** |
| A/P (Header Co.) | | $850.00 | PC |

### 4.7 In Transit Account

Sales Update hits the 4240 (Inventory) AAI with the Header Company for the SI because the Header Company is the billing entity. Since the Header Company did not physically ship any product, this entry must be washed out. The SI credit to AAI 4240 is offset by the debit to AAI 4310 when the OK is processed.

> **Recommendation:** Configure DMAAI 4240 for the Header Company and Order Type SI to point to an **In Transit account**. Configure DMAAI 4310 for the Header Company and Order Type OK to point to the **same In Transit account**, effectively clearing it when the OK voucher is created.

### 4.8 Cost Alignment -- Key Principle

The cost on the SI must equal the price on the SK and the cost on the OK:

- The SI cost credit must be washed out by the OK cost debit
- The OK cost and SK price must be equal so the OK A/P voucher can pay the SK A/R invoice

Advanced pricing and discounts do not affect the price on the SK. One recommended approach for applying discounts is through **payment terms** on the SK and OK, which can carry discount amounts to be applied during A/P check creation and A/R cash receipts processing.

### 4.9 Cost or Base Price -- Processing Option 11 Scenarios

| Option 11 | SI Cost | SK Price | OK Cost | SDSO01 |
|---|---|---|---|---|
| **Blank** (item cost) | $85.00 (Detail Branch cost) | $85.00 | $85.00 | 2 |
| **1** (cost + markup) | $170.00 (cost + 100% markup) | $170.00 | $170.00 | 2 |
| **2** (base price) | $850.00 (Detail Branch base price) | $850.00 | $850.00 | 4 |

**Setting Up Branch Markup (when option 11 = 1):** Access **Branch Sales Markup (P3403)** on menu G4241. Markups can be defined by item or by sales catalog section category code (UDC 41/S1).

### 4.10 Intercompany Settlements

Sales Order Intercompany processing follows the same rules as all other multi-company journal entries with respect to the **Intercompany Settlements flag** in General Accounting constants.

| Flag | Description |
|---|---|
| **Intercompany Settlements** | Balances journal entries that span multiple companies upon posting |
| **Allow Multi-Currency Intercompany Transactions** | Determines whether journal entries can be created across companies with different base currencies |

---

## Section 5: Related Documentation

- [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md)
- [Item Ledger and Cardex Analysis Guide](../MDS/item-ledger-cardex-guide.md)
- [Zero Balance Adjustments](../MDS/zero-balance-adjustments.md)
- [Accounting in Purchasing](../MDS/accounting-in-purchasing.md)
- [Outside Operations Reference Guide](../MDS/outside-operations.md)
- [Stock Status and Trial Balance Reconciliation](../MDS/stock-status-trial-balance.md)