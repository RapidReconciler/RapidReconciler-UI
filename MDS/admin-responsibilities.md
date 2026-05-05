# RapidReconciler

## Training Manual: Administrator Responsibilities

---

## Table of Contents

1. [About RapidReconciler Administration](#section-1-about-rapidreconciler-administration)
2. [Company Management](#section-2-company-management)
3. [User Management](#section-3-user-management)
4. [General Settings](#section-4-general-settings)
5. [Offset Accounts (Inventory Offsets)](#section-5-offset-accounts-inventory-offsets)

---

## Section 1: About RapidReconciler Administration

### 1.1 Overview

Any RapidReconciler user can be designated as an administrator by enabling the "Admin" checkbox within their user rights settings. When RapidReconciler is first installed, a "GSI Admin" account is configured as the initial administrator in order to set up the application. GSI will also designate the first customer user as an administrator. That customer administrator then assumes responsibility for maintaining the RapidReconciler configuration going forward.

### 1.2 Areas of Administrator Responsibility

This training manual covers the following four areas of RapidReconciler administration:

- **Company Management** - Configuring licensed companies and start dates.
- **User Management** - Adding and modifying RapidReconciler users and permissions.
- **General Settings** - Roll forward setup, common units of measure, and cardex deletions.
- **Offset Accounts** - Setting up offset accounts for End of Day and Transactional variances.

---

## Section 2: Company Management

### 2.1 Navigation

Company settings are accessed by navigating to **Admin > Companies** in the main navigation panel. Administrator rights must be assigned to your RapidReconciler user ID in order for this option to be visible.

Clicking the Companies link displays a list of all licensed companies. To modify a company's settings, click the **Options** icon in the far-right column of the applicable row.

### 2.2 Licensed Companies

The Companies page displays all companies currently licensed for use in RapidReconciler. The following fields are shown for each company:

![rr-admin-company-management](../Images/rr-admin-company-management.png)

| **Field** | **Description** |
|---|---|
| **Number** | The company number as defined in JD Edwards. |
| **Name** | The company name. |
| **Start Date** | The earliest fiscal period available for reconciliation. |
| **Base Currency** | The base currency of the company, pulled from JD Edwards. |
| **Report Currency** | The currency used for reporting purposes. |
| **Rate Type** | The exchange rate type used for currency conversion, if applicable. |
| **AAI Doc** | The AAI document type used for the model DMAAI table. |
| **Threshold** | The reconciliation threshold value. |
| **Options** | Click to open the Company Options pop-up for editing. |
| **Reroll** | Click to reroll the company, which recalculates the perpetual balance for the company from the baseline date forward. This is typically used if transactions have been backdated more than 1 period. |

> **Important:** Only GSI can add or remove companies, as they are managed per license agreement. If additional company licenses are required, please contact GSI at [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com).

### 2.3 Company Options

Clicking the Options icon opens the Company Options pop-up window. The **Company Number** and **Base Currency** fields are read-only, as they are pulled directly from JD Edwards and cannot be changed within RapidReconciler.

The following fields may be modified:

#### 2.3.1 Start Date

The Start Date represents the earliest fiscal period that can be reconciled. It is always set to the first day of a fiscal period - typically the first day of the current fiscal year. Once the current fiscal year is closed, the administrator should update this date to reflect the new fiscal year.

Key considerations:

- It is highly recommended that at least 2 months of history be retained in the RapidReconciler database at all times.
- The Start Date cannot be moved backwards. Once advanced, RapidReconciler will initiate a purge procedure to remove historical data prior to the new date.
- Advancing the Start Date is a method of recovering server resources and improving application performance. Reducing the volume of data in the database results in faster response times.

#### 2.3.2 Report Currency

The currency used for reporting. This may differ from the base currency where multi-currency reporting is required.

#### 2.3.3 Rate Type

The exchange rate type to be applied for currency conversions, where applicable.

#### 2.3.4 AAI Doc

The AAI document type used to identify the model DMAAI table for the company. The default value is 99. This field should only be changed in consultation with GSI.

#### 2.3.5 Threshold

The reconciliation threshold amount. Variances at or below this value may be treated as within tolerance.

Click **Save Changes** when all modifications are complete.

[Company Management Video Tutorial](https://vimeo.com/167889137)

---

## Section 3: User Management

### 3.1 Navigation

User management is accessed by navigating to **Admin > Users** in the main navigation panel. The Users page displays a list of all current users in the RapidReconciler application, showing their active status, full name, username, and available options.

### 3.2 User Actions

The following actions are available from the Users page:

| **Action** | **How to Access** |
|---|---|
| Add a new user | Click the **New User** button in the top right corner. |
| Edit user details | Click the **paper/pencil icon** in the center of the Options column. |
| Edit user rights | Click the **lock icon** on the left of the Options column. |
| Delete a user | Click the **trash can icon** on the right of the Options column, then confirm the prompt. |

### 3.3 Adding or Editing a User

Clicking the **New User** button or the **paper/pencil icon** opens the user details pop-up window. Complete the following fields:

| **Field** | **Description** |
|---|---|
| **Full Name** | The first and last name of the user. |
| **Email** | The company email address of the user. The user will automatically receive an email regarding the confidentiality policy upon account creation. |
| **Password** | Assign an initial password. The minimum length is 8 characters. If complex passwords have been enabled for your company, the password must meet those requirements. |
| **Temporary Password (1 Day)** | Set to **True** to require the user to reset their password after 1 day. Recommended for new users. |
| **Active** | Set to **True** for active users. Setting this to **False** prevents the user from logging in until it is changed back to **True**. |

Click the **Add User** button when complete to save the new user record.

### 3.4 Editing User Rights

Click the **lock icon** on the Users page to edit the rights and permissions for a specific user. The user rights window is divided into three sections:

#### 3.4.1 Authorized Functions

Authorized functions control access to specific system-level operations. The available functions are:

| **Function** | **Description** |
|---|---|
| **Import JDE** | Grants permission to import data from JD Edwards on an ad hoc basis. This permission is rarely recommended and should not be assigned without first consulting GSI. |
| **Restart Service** | Grants permission to restart RapidReconciler data services. This should only be assigned to RR administrators. It is used when there is difficulty exporting inventory As-Of data to Excel and clears memory on the application server. The restart process takes approximately 5 to 10 minutes. |
| **In Transit Exclude** | Grants the ability to exclude order pairs in the In Transit module. Usually reserved for administrators. |
| **PO Receipts Suspend** | Grants the ability to suspend purchase orders in the PO Receipts module. Usually reserved for administrators. |

#### 3.4.2 Authorized Tabs

Authorized tabs control which modules are visible to the user in the main navigation panel:

| **Tab** | **Description** |
|---|---|
| **Inventory** | Access to the Inventory module. |
| **In Transit** | Access to the In Transit module. |
| **Admin** | Access to the administration module. |
| **PO Receipts** | Access to the PO Receipts module. |

#### 3.4.3 Authorized Companies

The Authorized Companies section limits which company numbers the user can view within the application, broken down by module (Inventory, In Transit, PO Receipts). Enable or disable company access per module as appropriate for each user's role.

Click **Done** when all rights have been configured.

### 3.5 Deleting a User

To delete a user, click the **trash can icon** to the right of their name on the Users page and confirm the prompt when displayed.

[User Management Video Tutorial](https://vimeo.com/rapidreconciler/user-management)

---

## Section 4: General Settings

### 4.1 Navigation

General settings are accessed by navigating to **Admin > General** in the main navigation panel. From this page, administrators can configure or execute the following:

- Common Units of Measure
- Roll Forward Report Settings
- Delete RapidReconciler Cardex Records

### 4.2 Common Units of Measure

Common units of measure allow quantities to be restated in a single unit of measure across all items. This is useful in scenarios where multiple items in a warehouse have different primary units of measure but each has a conversion factor set up for a common unit.

**Example:** If hundreds of items in a particular warehouse need to be totaled by weight, and each item has a conversion factor defined for "LB" (pounds), adding "LB" as a common unit of measure allows the total weight to be reported across all items in that single unit.

**Procedure:**

1. Type the 2-character UOM code into the input field.
2. Click the **Add UOM** button.
3. The added UOM will be available for use after the next data refresh cycle.

[Common Units of Measure Video Tutorial](https://vimeo.com/167889079)

### 4.3 Roll Forward Settings

The roll forward settings define the columns displayed between the opening and closing balance columns on the Roll Forward page within the Inventory module. Each row in the settings represents one column in the report. Units or amounts are summarized from the item ledger table F4111 based on either the order type (DCTO) or document type (DCT) field.

Use the **New Setting** button in the top right corner to add a new row. The maximum limit is 12 rows or "totals columns."

Each setting contains the following fields:

| **Field** | **Description** |
|---|---|
| **Column Title** | A user-defined title describing the type of transactions being summarized in that column. |
| **Sort** | The sequence of the column in the report output. The order can be manually adjusted. |
| **Field** | Determines whether the total is calculated using the order type (DCTO) or document type (DCT). |
| **Codes 1 through 6** | The specific order types or document types to be summarized in that column. The maximum is 6 codes per row. If additional codes are required, add a new setting. |

To delete a setting, click the **trash can icon** at the far right of the row. To edit an existing setting, click the **paper/pencil icon**.

When editing a setting, key the desired values into the applicable fields. For fields with drop-down arrows, select the value from the list provided. Click **Save Changes** when complete.

**Sample Roll Forward Configuration:**

| **Column Title** | **Sort** | **Field** | **Code 1** | **Code 2** | **Code 3** | **Code 4** | **Code 5** | **Code 6** |
|---|---|---|---|---|---|---|---|---|
| Receipts | 1 | DCTO | OP | OL | OO | OT | | |
| NetWO | 2 | DCTO | WO | W1 | WR | | | |
| Adjustments | 3 | DCT | PI | IA | II | IR | IT | IB |
| Transfers | 4 | DCTO | ST | S2 | S3 | S5 | S6 | S7 |
| Shipments | 5 | DCTO | SO | SI | SJ | SM | S8 | S9 |
| Returns | 6 | DCTO | CO | C2 | CW | | | |
| WriteDowns | 7 | DCT | WD | | | | | |

[Roll Forward Settings Video Tutorial](https://vimeo.com/252701483)

### 4.4 Delete RapidReconciler Cardex Records

This function allows administrators to delete cardex records from the RapidReconciler database. A training video is available within the application to guide administrators through this process.

> **Note:** This is an administrative function that should be used with caution. Refer to the in-application video for full guidance before proceeding.

[Delete Cardex Records Video Tutorial](https://vimeo.com/250146759)

---

## Section 5: Offset Accounts (Inventory Offsets)

### 5.1 Navigation

Offset account settings are accessed by navigating to **Admin > Inventory Offsets** in the main navigation panel.

Offset accounts are used to set up the GL accounts that will be used for End of Day and Transactional variance journal entries within the Inventory module.

### 5.2 Configuration

A training video is available within the application to provide detailed guidance on Inventory Offset Management. It is recommended that administrators review this video before configuring offset accounts.

Navigate to **Admin > Inventory Offsets** in the main navigation bar to access the setup screen.