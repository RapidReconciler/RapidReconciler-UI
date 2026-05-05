# RapidReconciler Technical Requirements

---

![RR Diagram](../Images/rr_diagram.png)

---

## Table of Contents

- [RR Database Server](#rr-database-server)
- [Integration Services](#integration-services)
- [RR Application Server](#rr-application-server)
- [End User PC](#end-user-pc)
- [JD Edwards Information](#jd-edwards-information)
- [Appendix A -- Creating the Integration Services Catalog](#appendix-a--creating-the-integration-services-catalog)
- [Appendix B -- Proof of Concept Requirements](#appendix-b--proof-of-concept-requirements)

---

## RR Database Server

In most cases, existing servers running Microsoft SQL Server will meet the minimum requirements. If a new server needs to be built, use the guidelines below.

**Operating System:** Windows Server 2019 or later

**Processor:** Quad-core minimum

### Microsoft SQL Server

| Requirement | Specification |
|---|---|
| Version | 2019 or later |
| RAM | 16 GB minimum |
| Edition | Standard or higher |
| Authentication | Mixed mode |

**Default File Locations:**
- Initial data file size: 20 GB
- Initial log file size: 10 GB

**Additional Requirements:**
- SQL administrative access to the server instance
- SQL-based login and role created during installation for user connectivity
- SQL Server 2019 and later: Create Integration Services Catalog *(see Appendix A)*

### Storage Estimates

- 100 GB per 1 million cardex (F4111) records per month
- Estimate covers 1 year of data; records may be purged after year-end close
- **Example:** 2,000,000 cardex records per month requires 200 GB of allocated disk space

### Network Information to Note

- IP address of the database server
- If using a named instance, note the listening port number

---

## Integration Services

Integration Services is typically installed and run on the database server. However, in certain cases it may be preferable to run on an alternate server. The OLE DB provider must be installed on the server running the services.

### Alternate Server Requirements

| Requirement | Specification |
|---|---|
| Operating System | Windows Server 2019 or later |
| RAM | 16 GB minimum |

### SQL Server Management Tools

- SQL Server Management Studio (SSMS)
- Visual Studio Community 2019 or later

### OLE DB Provider Configuration

**Data source on AS/400 (I-Series):**
- Install I-Series Access (Client Access)
- Ensure the OLE DB component is installed on the hard drive
- Verify OLE DB drivers are selected, as this is not enabled by default

**Data source on Oracle:**
- Install Oracle 32-bit client using the **Administrator** option
- Make applicable `tnsnames.ora` entries
- Both versions must reside in the same Oracle home

**Data source on SQL Server:**
- No additional configuration required

---

## RR Application Server

> It is highly recommended to use a dedicated server.

| Requirement | Specification |
|---|---|
| Operating System | Windows Server 2019 or later |
| RAM | 16 GB minimum |
| Browser | Microsoft Edge or Google Chrome |
| IP Address | Static |
| Credentials | Local administrative credentials required for configuration |

### Network Access

**Internal Access**
- Port range: 32145–49152
- URL: `rrprod-[companyname].getgsi.com` *(provide internal IP of app server)*

**External Access (Port 443)**
- `rapidreconciler.getgsi.com` — 191.237.24.89
- `rr-valc-spa.cloudapp.net` — 23.96.83.121 *(rr-valc-spa.cloudapp.net/check-ip returns external IP)*
- `rr-spa.cloudapp.net` — 52.170.255.174

---

## End User PC

| Requirement | Specification |
|---|---|
| Operating System | Windows 10 or later / macOS 12 (Monterey) or later |
| RAM | 8 GB minimum |
| Screen Resolution | 1280 x 800 minimum recommended |
| Browsers | Microsoft Edge, Chrome, Firefox, Safari |
| Microsoft Excel | 2016 or later (required for export/import functionality) |
| PDF Viewer | Adobe Acrobat Reader or equivalent |
| Internet Access | https://rapidreconciler.getgsi.com |
| Network | Access to application server required |

---

## JD Edwards Information

> **Note:** The values below are to be recorded and submitted to GSI for product configuration during installation.

### Data Dictionary Variables

| Variable | Description | Typical Value | Customer Value |
|---|---|---|---|
| ECST | Decimal places for extended cost | 2 | _____________ |
| UNCS | Decimal places for unit cost | 4 | _____________ |
| PQOH | Decimal places for quantity on hand | — | _____________ |
| TRQT | Decimal places for transaction quantities in cardex | — | _____________ |

### JD Edwards Connection Details

| Item | Customer Value |
|---|---|
| Name or IP address of the JDE data server or data warehouse | _____________ |
| Database username *(use `rapidrec` if possible)* | _____________ |
| Database password *(use `rapidrec` if possible)* | _____________ |
| JDE server type *(I-Series, Oracle, or Microsoft SQL Server)* | _____________ |
| Table qualifier name *(e.g., `proddta`)* | _____________ |

### Submitted By

| Field | Value |
|---|---|
| Name | _____________ |
| Title | _____________ |
| Email | _____________ |
| Phone | _____________ |
| Date | _____________ |

---

## Appendix A – Creating the Integration Services Catalog

### Create the Catalog

1. Open **SQL Server Management Studio (SSMS)** and connect to the target SQL Server instance.
2. In the Object Explorer, right-click the **Integration Services** node and select **Create Catalog**.
3. The catalog name defaults to `SSISDB` and cannot be changed.
4. Provide a strong password for the database master key used for encryption.
5. After creation, it is recommended to **back up the database master key**.

> **Note:** Integration Services uses CLR-based stored procedures. CLR is not enabled by default on a SQL Server instance. Ensure **Enable CLR Integration** is checked before creating the catalog.

### Create the Project Folder

1. In SSMS, right-click the `SSISDB` catalog under the Integration Services node.
2. Select **Create Folder**.
3. Name the folder `RapidReconciler` and provide an optional description.
4. The RapidReconciler SSIS package may now be deployed to the server and scheduled.

---

## Appendix B – Proof of Concept Requirements

To provide data to GSI for a proof of concept, follow the steps below.

### Steps

1. Create an empty database in Microsoft SQL Server 2012 or later.
2. Using the ETL tool of your choice, run each of the select statements in the table below.
3. Destination tables must use the same naming conventions as the original JDE tables.
4. Once complete, create a compressed backup of the database.
5. Email [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com) for data transfer instructions.
6. The GSI sales team will contact you to schedule a results presentation.

> **Important:** Extract tables F41021 and F4111 as close together in time as possible, when system activity is at a minimum.

### Table Extract Statements

All tables below are accessed by RapidReconciler in **read-only** mode. The Select Statement column is provided for proof of concept extracts; tables without a Select Statement are referenced by RapidReconciler but are not part of the proof of concept extract.

| Table | Description | Select Statement for Proof of Concept |
|---|---|---|
| F0006 | Business Unit Master | `SELECT * FROM F0006` |
| F0008 | Fiscal Date Patterns | `SELECT * FROM F0008` |
| F0010 | Company Master | `SELECT * FROM F0010` |
| F0011 | Batch Headers | `SELECT * FROM F0011 WHERE ICDICJ >= 125001` |
| F0013 | Currency Codes | `SELECT * FROM F0013` |
| F0015 | Currency Exchange Rates | `SELECT * FROM F0015 WHERE CXEFT >= 125001` |
| F0101 | Address Book (Vendor Names Only) | `SELECT ABAN8, ABALPH FROM F0101` |
| F0901 | Account Master | `SELECT * FROM F0901` |
| F0902 | Account Balances | `SELECT GBAID, GBCO, GBFY, GBLT, SUM(GBAPYC), SUM(GBAN01–GBAN14) FROM F0902 WHERE GBFY BETWEEN 11 AND 40 AND GBLT = 'AA' GROUP BY GBAID, GBCO, GBFY, GBLT` |
| F0911 | Account Ledger | `SELECT * FROM F0911 WHERE GLLT = 'AA' AND GLDGJ >= 125001` |
| F1113 | Currency Restatement Rates | `SELECT * FROM F1113 WHERE C1EFT >= 125001` |
| F30026 | Cost Components | `SELECT * FROM F30026 WHERE IELEDG = '07'` |
| F3106 | Work Order Cross Ref | `SELECT * FROM F3106 WHERE SDDICJ >= 125001` |
| F4095 | D/M Accounting Instructions | `SELECT * FROM F4095` |
| F4096 | Flex Accounting Instructions | `SELECT * FROM F4096` |
| F41001 | Inventory Constants | `SELECT * FROM F41001` |
| F41002 | UOM Conversions | `SELECT * FROM F41002` |
| F41003 | Standard Conversions | `SELECT * FROM F41003` |
| F4101 | Item Master | `SELECT * FROM F4101` |
| F4102 | Item Branch Plant | `SELECT * FROM F4102` |
| F41021 | Item Location / Balances | `SELECT * FROM F41021` |
| F4105 | Cost Ledger | `SELECT * FROM F4105 WHERE COCSIN = 'I'` |
| F4108 | Lot Master | |
| F4111 | Item Ledger | `SELECT * FROM F4111 WHERE ILCRDJ >= 124350` |
| F4211 | Sales Order Details | `SELECT * FROM F4211 WHERE SDUPMJ >= 124350` |
| F42119 | Sales Order History | `SELECT * FROM F42119 WHERE SDUPMJ >= 124350` |
| F4311 | Purchase Order Details | `SELECT * FROM F4311 WHERE PDTRDJ >= 124350` |
| F43121 | Purchase Order Receipts | `SELECT * FROM F43121` |
| F4801 | Work Order Headers | `SELECT * FROM F4801 WHERE WAUPMJ >= 125001` |