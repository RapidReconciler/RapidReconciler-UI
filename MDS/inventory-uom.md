## Overview, Setup, Configuration, and Change Procedures

---

## Table of Contents

1. [Overview](#overview)
2. [Section 1: Storage Tables](#section-1-storage-tables)
3. [Section 2: UOM Hierarchy and Search Sequence](#section-2-uom-hierarchy-and-search-sequence)
4. [Section 3: Setup and Configuration](#section-3-setup-and-configuration)
5. [Section 4: Default Units of Measure for an Item](#section-4-default-units-of-measure-for-an-item)
6. [Section 5: Sales and Purchase Order UOM Behavior](#section-5-sales-and-purchase-order-uom-behavior)
7. [Section 6: Weight and Volume UOM](#section-6-weight-and-volume-uom)
8. [Section 7: Changing the Primary Unit of Measure](#section-7-changing-the-primary-unit-of-measure)
9. [Section 8: Quick Reference Summary](#section-8-quick-reference-summary)
10. [Section 9: Related Documentation](#section-9-related-documentation)

---

## Overview

Unit of Measure (UOM) conversion in JD Edwards serves two purposes:

- **Standard UOM Conversions** -- Apply to all items system-wide (e.g., 12 inches = 1 foot).
- **Item-Specific UOM Conversions** -- Apply to a specific item or item/branch plant combination.

Getting UOM configuration right at the time of item setup is critical. Changes to the primary UOM after operating in a live inventory environment carry significant risk to data integrity and are not recommended. This document covers the full UOM framework and the procedures required when changes must be made.

---

## Section 1: Storage Tables

| Table | Contents |
|---|---|
| **F41003** | Standard Unit of Measure Conversions |
| **F41002** | Item-specific or item/branch UOM Conversions |

---

## Section 2: UOM Hierarchy and Search Sequence

When the system needs to resolve a UOM conversion for an item, it searches in the following order:

1. **Item/Branch UOM Conversion table (F41002)** -- searches for the item or item/branch combination first.
2. **Standard UOM Conversion table (F41003)** -- if not found in F41002.
3. **Error message** -- if no conversion is found in either table.

---

## Section 3: Setup and Configuration

### 3.1 UDC Table Setup

Before any UOM conversions can be configured, all units of measure must be set up in UDC table **00/UM**.

### 3.2 Standard UOM Conversions

Standard UOM conversions are set up using **P41003**, accessed from menu **G4141**. Data is stored in table F41003. Once configured, these conversions apply universally to all items and do not need to be entered individually in the Item UOM Conversion table (F41002).

### 3.3 Item UOM Conversion Setup

To access the Item UOM Conversion table, press **F8** from the Default Unit of Measure screen within the Item Master program.

When entering conversions:

- Enter the unit of measure to convert **from** on the left side of the screen.
- Enter the number of units required to equal the **to** unit of measure.
- The system automatically creates the **reciprocal conversion** on the right side.
- An unlimited number of conversions can be entered for each item.
- Each unit of measure should be converted back to the **primary unit of measure**.
- Each conversion set up makes that UOM valid within entry and inquiry screens.

> **Note:** The Structured Only field is used in the Warehouse Management system only.

### 3.4 Unit of Measure Conversions by Branch

The **Unit of Measure Conversions by Branch** field (BUMC) in System Constants controls whether UOM conversions are maintained at the item level or the item/branch level. System Constants is accessed by pressing **F10** from the Branch/Plant Constants screen. This is a **universal system-wide setting**.

| Setting | Behavior |
|---|---|
| **Y** | UOM conversion is set up for an **item and branch/plant** combination. The branch field will appear on the Item UOM screen. |
| **N** | UOM conversion is set up for an **item across all branch/plants**. |

> **Important:** If this field is changed after conversions have been set up, all UOM conversions will need to be re-entered for all applicable items.

---

## Section 4: Default Units of Measure for an Item

Each item has a set of Default Units of Measure, each serving a specific purpose. These are accessed from **Item Master (G4111)** by pressing **F8** to navigate to the Default Units of Measure screen.

| UOM Type | Description |
|---|---|
| **Primary** (Stocking UOM) | The primary UOM must be the **smallest unit of measure** for the item. Many programs are hard-coded to convert to the primary UOM and back to the transaction UOM. Items whose primary UOM is not the smallest may encounter unexpected and unpredictable results. |
| **Secondary** | An additional valid UOM for use in Inventory, Sales, or Purchasing programs. Not specifically used by any program other than for validation. Some clients use this UOM to create advanced pricing formulas. |
| **Purchasing** | The UOM used when purchasing an item. Defaults into the purchasing UOM field. If processing option 8 behind Purchase Order Entry is set to blank, this UOM defaults into the transaction UOM. |
| **Pricing** | The UOM generally used when selling an item. Defaults into the pricing UOM field. If processing option 8 is set to 1, the pricing UOM defaults into the transaction UOM on sales orders. |
| **Shipping** | Typically used when shipping an item. Serves as another valid item UOM value and is used for freight calculations. |
| **Production** | Used in Manufacturing. |
| **Component** | Used in Manufacturing. |
| **Weight/Volume** | The primary UOM for weight and volume ratios. Used when setting up Landed Cost and Shipping tables. Provides the default for displaying weight/volume on sales and purchase orders and is used for freight calculations. |

> **Key Rule:** The Primary UOM must always be the **smallest unit of measure** for the item. This is one of the most important UOM configuration decisions and is very difficult to correct after live transactions have been processed.

---

## Section 5: Sales and Purchase Order UOM Behavior

### 5.1 Purchase Order Transaction UOM

Processing option 8 behind **Purchase Order Entry (P4311)** controls which UOM defaults into the transaction UOM:

| Processing Option 8 | Behavior | Example |
|---|---|---|
| **Blank** | Purchasing UOM defaults into transaction UOM | Transaction UOM = Case; order for 10 cases |
| **1** | Primary UOM defaults into transaction UOM | Transaction UOM = Can; order for 10 cans |

The extended cost is determined by the transaction unit of measure in both scenarios.

### 5.2 Sales Order Transaction UOM

Processing option 8 behind **Sales Order Entry (P4211)** controls which UOM defaults into the transaction UOM:

| Processing Option 8 | Behavior | Example |
|---|---|---|
| **Blank** | Primary UOM defaults into transaction UOM | Transaction UOM = Can; order for 10 cans |
| **1** | Pricing UOM defaults into transaction UOM | Transaction UOM = Case; order for 10 cases |

### 5.3 Sales and Purchase Price Retrieval UOM

The sales and purchase price retrieval UOM is also configured in System Constants. This setting controls which UOM is used to retrieve the price on sales and purchasing orders. Options include the primary, transaction, or pricing unit of measure. This is a **universal system-wide setting**.

---

## Section 6: Weight and Volume UOM

### 6.1 UDC Table Configuration

To enable weight and volume usage in transactions, navigate to UDC table **00/UM** and open the fold for each applicable UOM. In the **Special Handling Code** field, enter:

| Value | Meaning |
|---|---|
| **V** | Volume -- specifies this UOM can be used for volume |
| **W** | Weight -- specifies this UOM can be used for weight |

### 6.2 Customer Billing Instructions

Navigate to **page 2 of the Customer Billing Instructions** and specify the **Display Weight/Volume Unit of Measure** to be used for that customer.

### 6.3 Usage in Transactions

Once configured, weight and volume UOM data is used in the following areas:

- **Landed Cost Revisions** -- A rate can be charged based on weight or volume. The system multiplies that rate by the unit weight or volume and the item cost to calculate the landed cost.
- **Sales Order Detail** -- Extended weight and volume display in the details behind the detail line.
- **Purchase Order Detail** -- Extended weight and volume display in the details behind the detail line.
- **Freight calculations** -- Weight and volume drive freight cost calculations on orders.

---

## Section 7: Changing the Primary Unit of Measure

> **Warning:** Changing the primary unit of measure after operating in a live inventory environment is **not recommended**. A fundamental principle of the inventory system is that the primary UOM should be established as the smallest unit of measure and maintained consistently. Setting up items otherwise, or changing it after live transactions, may generate unpredictable and difficult-to-correct results.

### 7.1 Recommended Alternative -- Create Replacement Items

Before proceeding with a primary UOM change, consider this alternative:

Create a set of **new items cross-referenced as replacement items** for the existing ones, using recognizable but slightly different product numbers. Configure the replacement items with the correct primary UOM. Inventory counts and all active sales and purchase orders are then cleared from the old items and re-established under the new items.

This approach avoids the history, ledger, and data integrity risks outlined in Section 7.3 and is the preferred solution in most cases.

If this alternative is not viable and the existing items must be changed, follow the procedure below carefully.

### 7.2 Pre-Change Requirements

Before beginning the change procedure:

- **Test first** -- Perform the conversion in a test environment and review the results thoroughly before making any changes in production.
- **Start with one item** -- Observe the effects of converting a single item before applying the procedure to multiple items.
- **Consult management** -- Discuss the project with the client manager before undertaking the conversion. Ensure all stakeholders are aware of the risks.
- **Document the current state** -- Record current on-hand quantities, open orders, costs, and selling prices for the item before making any changes.

### 7.3 Impact on History and Ledger Files

Several history and ledger files store the primary UOM for an item. Records written prior to the change will retain the original primary UOM, and reports referencing the primary UOM from these files may present incorrect information after the change.

| File | Description | Impact |
|---|---|---|
| **F43199** | Purchasing ledger | Prior records retain original UOM |
| **F42199** | Sales ledger | Prior records retain original UOM |
| **F42119** | Sales history | Prior records retain original UOM |
| **F4115** | Item sales by branch and fiscal year | Cumulative quantities corrupted -- mixes old and new UOM in the same period bucket |
| **F4229** | Item sales by customer, order type, line type, branch, and fiscal year | Cumulative quantities corrupted -- mixes old and new UOM in the same period bucket |

**Example of F4115 corruption:** If F4115 contains a record for item "widget" with a primary UOM of "dozen" and the January bucket contains 10 (representing 10 dozen widgets sold), changing the primary UOM to "each" and selling 2 more in January would update the bucket to 12 -- incorrectly mixing 10 dozen and 2 each in the same field.

JD Edwards does not provide programs to make retroactive changes to history or ledger files. Available correction options include:

- Correcting records using a data file utility (prone to error)
- Using an RPG program or World Writer to replace the data
- Correcting only the most recent history records and modifying reporting to exclude data older than a defined cutoff date

### 7.4 Other Considerations Before Changing

**Bill of Material**

If the item is a kit, a manufactured item, or a component of a kit or manufactured item, and a bill of material exists in table F3002, the BOM must be updated to reflect the new unit of measure.

**General Ledger**

If units are updated to the general ledger (F0911 and F0902), and a single transaction UOM is used for the item, the GL unit totals will mix old and new UOM values in the same fields after the change, as conversions are not applied upon updating the GL.

**Advanced Warehousing**

If the Advanced Warehousing module is in use, verify:

- No open purchase orders or sales orders exist for the item
- No on-hand quantity exists for the item
- No F4602 records exist for the item
- F4611 and F46130 records have been purged for the item, as these files store the primary UOM

**EDI**

If the EDI module is in use, verify that all 47-series files for incoming and outgoing data do not contain an incorrect primary UOM for the item.

**Processing Options**

Several programs allow a transaction UOM to be specified in processing options. After a primary UOM change, review the processing options for each of the following to verify the transaction UOM remains valid:

- Sales Order Entry (P4211)
- Purchase Order Entry (P4311)
- Sales Transfers (P4242)
- Direct Ship Orders (P4243)

### 7.5 Change Procedure

The following steps must be completed **in the order listed**. Deviating from this sequence may result in data integrity issues.

#### Step 1 -- Complete or Cancel All Open Orders

Close all open sales orders, purchase orders, and work orders for the item. Use **Supply/Demand Inquiry (P4021)** to verify that no open orders remain.

#### Step 2 -- Zero Out All Inventory Locations

Issue out the inventory from all locations so that the on-hand quantity is zero. Verify using **Summary Availability Inquiry (P41202)**. Ensure all lots and locations are at zero before proceeding.

#### Step 3 -- Change the Primary UOM in the Item Master

Update the primary UOM field in the **Item Master** record.

#### Step 4 -- Update Default Units of Measure (P41012)

Change other UOM fields as required in the Default Units of Measure screen. The Primary UOM field will reflect the change made in Step 3.

#### Step 5 -- Verify the UOM Conversion Table

Confirm that the conversion table (F41002) is still valid for the new primary UOM, or make corrections as needed using program **P41002**.

#### Step 6 -- Verify Costs and Selling Prices

Ensure that costs (P4105) and selling prices (P4106) are correct for the new primary UOM. Costs and prices are stored per UOM and may need to be re-entered.

#### Step 7 -- Adjust On-Hand Quantity Back Into Inventory

Enter the actual on-hand quantity, expressed in the **new primary UOM**, back into the applicable inventory locations.

#### Step 8 -- Re-Enter Previously Cancelled Orders

Recreate any active orders that were cancelled in Step 1 using the new primary UOM.

---

## Section 8: Quick Reference Summary

| Topic | Key Point |
|---|---|
| Primary UOM rule | Must always be the **smallest unit of measure** for the item |
| UOM search sequence | F41002 (item/branch) first, then F41003 (standard), then error |
| Conversions by branch | Controlled by BUMC field in System Constants -- system-wide setting |
| Changing BUMC after setup | All conversions must be re-entered |
| Changing primary UOM | Not recommended -- consider creating replacement items instead |
| Pre-change requirement | Test in a non-production environment first |
| History file impact | F4115 and F4229 cumulative quantities will be corrupted |
| Ledger file impact | F43199, F42199, F42119 retain original UOM on prior records |
| Open orders | Must be completed or cancelled before changing primary UOM |
| On-hand inventory | Must be at zero before changing primary UOM |
| BOM | Must be updated if item is a kit, manufactured item, or component |
| Processing options | Review P4211, P4311, P4242, P4243 after any primary UOM change |

---

## Section 9: Related Documentation

- [DMAAI Reference Guide](../MDS/dmaai-reference-guide.md)
- [GL Class Code Management and Change Procedures](../MDS/gl-class-code-changes.md)
- [Installing the RapidReconciler-Prod Database](../MDS/Installing_production_database.md)
