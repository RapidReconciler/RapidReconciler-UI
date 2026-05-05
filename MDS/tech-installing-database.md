# Installing the RapidReconciler-Prod Database

## Technical Overview and First Steps

---

## Table of Contents

- [Skill Sets](#skill-sets)
- [Architecture Overview](#architecture-overview)
- [Working with a New Client](#working-with-a-new-client)
- [Separate Application Server Requirements (If Needed)](#separate-application-server-requirements-if-needed)
- [Database Server Requirements](#database-server-requirements)
- [Creating the Integration Services Catalog](#creating-the-integration-services-catalog)
- [Installing the RapidReconciler Database](#installing-the-rapidreconciler-database)
- [Configuring and Deploying the Integration Services Package](#configuring-and-deploying-the-integration-services-package)
- [Performing the Initial Data Load](#performing-the-initial-data-load)
- [Security Requirements](#security-requirements)

---

## Skill Sets

RapidReconciler is a Microsoft SQL Server based product. Anyone designated to install RapidReconciler should have at least some basic knowledge in:

- Running scripts in SQL Server Management Studio
- SQL Server Database configuration
- SQL Server Agent Job configuration
- SQL Server Integration Services configuration and project deployments

---

## Architecture Overview

RapidReconciler consists of several hardware components. Setup is flexible and can vary based on the needs of the individual customer. The main components are:

- **Database server** running Microsoft SQL Server. Data is extracted using Integration Services (Read Only).
- **Application server** for the installation of the RapidReconciler agent and data services.
- **User PC** The user must be connected to the company network to view data.
- **Version control server** maintains licensing and control information for RapidReconciler configurations. (VALC)

### Data Synchronized with the RR Agent

All data stored on GSI servers employs 256-bit encryption and is limited to:

- Public facing IP address of the application server
- Internal IP address of the application server
- IP address of the database server
- Credentials to access the RapidReconciler database
- RapidReconciler database(s) names and port numbers
- Usernames and passwords *(GSI cannot retrieve passwords, only reset them)*
- User access security settings (companies and tabs)
- 5-digit company number and name from JD Edwards *(used for licensing purposes only)*

Internet traffic is outbound only.

### Notes

> - If a server is dedicated for RapidReconciler, both the database and agent can be on the same machine.
> - Port 443 outbound is used by RapidReconciler for JMS communications.
> - Work with the customer's I/T support to decide how RapidReconciler will be deployed.
> - Only 1 instance of the Agent can be run on the internal network. The agent can support multiple RapidReconciler databases, even if they are on different servers.

---

## Working with a New Client

When a new customer purchases RapidReconciler, the licensing is based on JD Edwards company numbers (normally 1 license per company). Obtain the following critical information from the sales rep:

- The number of companies purchased
- The exact JD Edwards company numbers (e.g. 00001, 00002, etc.)
- The name of the customer (e.g. Acme Manufacturing)
- The I/T contact email/phone number for the client -- send the [Tech Requirements](../MDS/tech-requirements.md) to them and have them return the requested information from page 3

Arrange a **2-hour web meeting** with the I/T contact in order to:

1. Ensure the server(s) meet the minimum requirements. (Drivers, Visual Studio, SSMS, etc.)
2. Install the RapidReconciler database and create the `rruser` ID and `RapidReconciler_Prod` SQL Agent job
3. Create the Integration Services Catalog
4. Configure and deploy the SSIS package
5. Perform the initial data load

---

## Separate Application Server Requirements (If Needed)

| Requirement | Details |
|---|---|
| Operating System | Windows Server 2008 or later |
| RAM | 16 GB minimum |
| Credentials | Local administrative credentials for configuration |
| Browser | Microsoft Edge, Safari or Chrome |
| IP Address | Static external IP address |

### Access Requirements *(access by name preferred)*

| Host | IP Address | Ports |
|---|---|---|
| rapidreconciler.getgsi.com | 191.237.24.89 | 80 and 443 outbound |
| rr-valc-spa.cloudapp.net | 23.96.83.121 | 80 and 443 outbound |
| rr-spa.cloudapp.net | 52.170.255.174 | 443 outbound |

### Connectivity Tests

- Navigate to `rapidreconciler.getgsi.com` -- the log in page should appear.

---

### SSIS Server (If different from the database server)

- Windows Server 2016 or later
- 16 GB RAM minimum
- SQL Server Management Studio
- SQL Server Data Tools

### OLE DB Provider

| JDE Data Source | Requirement |
|---|---|
| AS400 / I-Series | I-Series Access (Client Access) -- ensure OLE DB component is installed for both 32 and 64 bit. |
| Oracle | Oracle 32-bit client (64-bit optional) -- select 'Administrator' option, make applicable `tnsnames.ora` entries; if installing both versions, place in the same Oracle home. |
| SQL Server | No additional configuration required. |

---

## Database Server Requirements

### Minimum Requirements

| Requirement | Details |
|---|---|
| Operating System | Windows Server 2016 or later |
| Processor | Quad core |
| SQL Server | Standard Edition minimum, Version 2017 or later |
| RAM | 16 GB minimum |
| Authentication | Mixed mode |
| Other | Integration Services installed |

---

## Creating the Integration Services Catalog

The Integration Services Catalog (SSISDB) must exist on the target SQL Server before the RapidReconciler SSIS package can be deployed. If the catalog has already been created, skip to **Step 2** to create the RapidReconciler folder.

---

### Step 1 -- Create the SSISDB Catalog

1. Open **SQL Server Management Studio** and connect to the target SQL Server instance
2. In **Object Explorer**, expand the server node
3. Right-click **Integration Services Catalogs** and select **Create Catalog**
4. In the **Create Catalog** dialog:
   - Check **Enable CLR Integration** if not already enabled
   - Check **Enable automatic execution of Integration Services stored procedure at SQL Server startup**
   - Enter and confirm a **Password** to protect the database master key
5. Click **OK** to create the catalog
6. Confirm **SSISDB** now appears under **Integration Services Catalogs** in Object Explorer

> **Note:** Creation of the SSISDB catalog requires sysadmin privileges on the SQL Server instance. The password entered here will be required if the catalog ever needs to be restored from backup -- store it in a secure location.

---

![SSIS Catalog](../Images/rr_ssis_catalog.png)

### Step 2 -- Create the RapidReconciler Folder

1. In **Object Explorer**, expand **Integration Services Catalogs -> SSISDB**
2. Right-click **SSISDB** and select **Create Folder**
3. In the **Create Folder** dialog:
   - Set **Folder name** to `RapidReconciler` or `RR` as shown above
   - Optionally enter a description such as `RapidReconciler SSIS packages`
4. Click **OK** to create the folder
5. Confirm the `RapidReconciler` folder now appears under **SSISDB** in Object Explorer

> **Note:** This folder name must match the deployment path used when deploying the SSIS project from Visual Studio. The path `/SSISDB/RapidReconciler/RapidReconciler` references this folder as the first `RapidReconciler` segment.

### Disk Space

- **100 GB** per 1 million cardex (F4111) records per month
- Estimate covers 1 year of data; records may be purged after year-end close

**Example:** 2,000,000 cardex records/month requires **200 GB** disk space allocated.

---

## Installing the RapidReconciler Database

### Step 1 -- Send the Zip File to the Client

[RRV7 - Build 178](https://github.com/RapidReconciler/RapidReconciler-SQL/blob/main/Installation%20Files/RRV7%20-%20Build%20178.zip?raw=true)

Have the I/T contact download and place the zip file on the database server and unzip the contents. The files will be needed for database and SSIS installation. The zip contains the following scripts:

| File | Purpose |
|---|---|
| `1 - RapidReconciler Database Creation Script.sql` | Creates the database, mdf/ldf files, and sets initial size |
| `2 - RapidReconciler Database Object Script 178.sql` | Creates all database objects |
| `3 - RapidReconciler User Creation Script.sql` | Creates the `rruser` SQL login |
| `4 - RapidReconciler SQL Agent Job Creation Script.sql` | Creates the SQL Agent job |
| `RapidReconciler-Prod.dtsx` | The SSIS package to be deployed to the SSIS Catalog |

### Step 2 -- Create the Database

1. Log on to the designated database server with the I/T contact
2. Open SQL Server Management Studio
3. Log in to SSMS with a login that has sysadmin privileges
4. Run **`1 - RapidReconciler Database Creation Script.sql`**

The script will:

- Create `mdf` and `ldf` files in the default locations specified by the server instance
- Set the initial DB size to **5 GB**
- Create the database with the default name **`RapidReconciler_Prod`**

> [!CAUTION]
> Change the database name from Master to `RapidReconciler_Prod` in the connection dropdown after opening each of the following scripts.

### Step 3 -- Add Database Objects

Run **`2 - RapidReconciler Database Object Script 178.sql`** in the same SQL Server instance and wait for the **"Successfully Completed"** message.

### Step 4 -- Create the SQL User ID

Run **`3 - RapidReconciler User Creation Script.sql`**. These are the credentials the application uses to read and write data to the SQL database.

### Step 5 -- Create the SQL Agent Job

Run **`4 - RapidReconciler SQL Agent Job Creation Script.sql`**. The job steps will need to be modified and a schedule added -- this will be covered later.

---

## Configuring and Deploying the Integration Services Package

### Prerequisites

- Visual Studio Community with the **SQL Server Integration Services** extension installed
- The RapidReconciler SSIS package file `RapidReconciler-Prod.dtsx` extracted from the installation zip
- Access to the target SQL Server with Integration Services Catalog configured

---

### Step 1 -- Obtain Configuration Information

Before opening Visual Studio, gather the following JD Edwards-specific information from the Technical Requirements documentation:

#### JD Edwards Connection Details

- Name or IP address of the JDE data server
- Read only credentials for the JDE database *(use `rapidrec`/`rapidrec` if possible)*
- JDE server type: **I-Series**, **Oracle**, or **Microsoft SQL Server**

---

### Step 2 -- Create the Visual Studio Solution

1. Launch **Visual Studio Community**. Run as an administrator if possible to avoid permission issues during deployment.
2. Select **Create a new project**

![SSIS Create Project](../Images/rr_ssis_create_project.png)


3. Search for and select **Integration Services Project**, then click **Next**

![SSIS Integration Services Project Template](../Images/rr_ssis_is_project_template.png)

4. Set the **Project name** to `RapidReconciler`
5. Choose an appropriate location on the server to save the solution
6. Click **Create**

![SSIS Configure Project](../Images/rr_ssis_configure_project.png)

7. Once the solution loads, confirm the project appears in **Solution Explorer** as `RapidReconciler`

---

### Step 3 -- Add the Existing SSIS Package

![SSIS Add Existing Package](../Images/rr_ssis_add_existing_package.png)


1. In **Solution Explorer**, right-click the `RapidReconciler` project
2. Select **Add -> Existing Item**
3. Browse to the location where the installation zip was extracted
4. Select **`RapidReconciler-Prod.dtsx`** and click **Add**
5. Confirm the package appears under the `RapidReconciler` project in **Solution Explorer**
6. Double click the package to open it in the designer and verify the control flow and variables load correctly.
7. If prompted to upgrade the package, click **OK** to allow Visual Studio to make any necessary updates to the package format.
8. The package should open without errors. If there are connection errors, they can be ignored for now as the connections will be updated in the next steps.
9. Passwords must be re-entered in the connection managers after deployment, so it is normal for the connections to show as invalid at this stage.

---

![SSIS Control Flow Variables](../Images/rr_ssis_controlflow_variables.png)
**Figure 1 -- RapidReconciler SSIS Package in Visual Studio**

### Step 4 -- Configure the Connection Managers

1. Locate the **Connection Managers** at the bottom center of the display as shown in Figure 1.
2. Double-click the **JDE source connection** and update the following:
   - Server name or IP address of the JDE data server
   - Database credentials *(use `rapidrec`/`rapidrec` if possible)*
   - Click **Test Connection** to verify connectivity to the JDE data source
   - Click **OK** to save changes
3. Double-click the **RapidReconciler destination connection** and update the following:
   - Database server name hosting `RapidReconciler_Prod`
   - Select `RapidReconciler_Prod` from the dropdown
   - Enter the `rruser` credentials created in the database installation steps
   - Click **Test Connection** to verify connectivity to the `RapidReconciler_Prod` database
   - Click **OK** to save changes

---

### Step 5 -- Configure the Variables

1. Navigate to the **Variables** window. Go to **View -> Other Windows -> Variables** if not visible.
2. Reference Figure 1 above for the variable names (shown in yellow).
3. Update the following variables using the values gathered in Step 1:

| Variable | Value |
|---|---|
| Start Date for data extraction | aaStartDateGr - Change this to 2 months prior to the current fiscal year |
| Table qualifier for JDE data (e.g. `proddta.`) | dbowner - Note: Ensure there is a period at the end of the name |
| Decimal places for extended cost | DecExtCost - 1 + ECST number of zeros |
| Decimal places for unit cost | DecUnitCost - 1 + UNCS number of zeros |
| Decimal places for quantity on hand | DecQTY - 1 + PQOH number of zeros |
| Decimal places for transaction quantities in cardex | DecQtyCX - 1 + TRQT number of zeros |

Save all changes to the package by clicking **File -> Save All** or pressing `Ctrl + Shift + S`.

---

### Step 6 -- Deploy the Project to the SSIS Catalog

1. In **Solution Explorer**, right-click the `RapidReconciler` project and select **Deploy**
2. The **Integration Services Deployment Wizard** will open -- click **Next**
3. On the **Select Destination** page:
   - Set **Server name** to the target SQL Server instance
   - Connect to the server using **Windows Authentication**
   - Set **Path** to `/SSISDB/RapidReconciler/RapidReconciler`
4. Click **Next**, review the summary, then click **Deploy**
5. Wait for all deployment steps to show a **Passed** status
6. Click **Close** when complete

> **Note:** Windows Authentication is required for deployment to the SSIS catalog. Ensure the account you are logged in with has **sysadmin** or **ssis_admin** privileges on the target SQL Server instance before proceeding.

---

### Step 7 -- Verify the Deployment

1. Open **SQL Server Management Studio** and connect to the target server
2. Expand **Integration Services Catalogs -> SSISDB -> RapidReconciler**
3. Confirm the RapidReconciler project appears and is accessible

---

### Step 8 -- Configure the SQL Agent Package Path

![SSIS Package Path](../Images/rr_ssis_package_path.png)

1. In SSMS, navigate to **SQL Server Agent -> Jobs -> RapidReconciler_Prod**
2. Right-click the job and select **Properties**
3. Click **Steps** in the left panel
4. Edit step 1 to point to the deployed SSIS package path in the SSISDB catalog

---

## Performing the Initial Data Load

### Step 1 -- Open SQL Server Agent

1. Launch **SQL Server Management Studio (SSMS)** and connect to your SQL Server instance
2. In the **Object Explorer**, expand the server node
3. Expand **SQL Server Agent**
4. Expand **Jobs**

### Step 2 -- Open the Job Properties

1. Right-click the job **RapidReconciler_Prod**
2. Select **Properties** from the context menu
3. The **Job Properties** dialog box will open

### Step 3 -- Navigate to the Schedules Tab

1. In the left-hand panel of the Job Properties dialog, click **Schedules**
2. You will see a list of schedules currently associated with the job

### Step 4 -- Enable the Job Schedule

![SQL Agent Job Schedule](../Images/rr_sqlagent_jobschedule.png)

1. Select the schedule from the list and click **Edit**
2. In the **Job Schedule Properties** dialog, check the **Enabled** checkbox at the top

### Step 5 -- Update the Run Time

> **Note:** The RapidReconciler job should be scheduled to run during off-peak hours, such as overnight, to minimize impact on system performance and provide the most accurate results. If possible, coordinate with the client to determine the best time for the initial data load, which may take longer than subsequent runs.

1. Under the **Daily frequency** section, update the **Occurs once at** or **Occurs every** time fields to your desired run time
2. Adjust the **Start date** and **End date** in the **Duration** section if needed
3. Click **OK** to save the schedule changes

### Step 6 -- Save the Job

1. Click **OK** in the **Job Properties** dialog to apply all changes
2. The job schedule is now enabled and updated

> **Note:** Changes take effect at the next scheduled run time and will not interrupt a currently running job. After the initial load, the schedule can be adjusted as needed to meet the client's requirements for data refresh frequency and timing.

---

Once all steps have been completed, the client can be set up in VALC. [Set Up VALC](../MDS/installing-valc.md)

---

## Security Requirements

### SQL Server Login and User Permissions

The `rruser` SQL login must be configured with the following permissions:

| Object | Account | Permission |
|---|---|---|
| `RapidReconciler_Prod` database | `rruser` | `db_datareader` |
| `RapidReconciler_Prod` database | `rruser` | `db_datawriter` |
| `msdb` | `rruser` | `SQLAgentOperatorRole` |

To configure `rruser`:

1. In SSMS, navigate to **Security -> Logins** and open the `rruser` login properties
2. Under **User Mapping**, select `RapidReconciler_Prod` and assign `db_datareader` and `db_datawriter`
3. Also map to `msdb` and assign `SQLAgentOperatorRole`
4. Click **OK** to save

### SQL Server Agent Service Account

The SQL Server Agent service account must be configured separately from `rruser`. Ensure the following:

- The service account has `db_datareader` and `db_datawriter` on `RapidReconciler_Prod`
- The service account has **Log on as a service** rights on the server running the agent job
- If a **proxy account** is used for job steps instead of the service account, the proxy must be explicitly granted access to the **SSIS subsystem** under **SQL Server Agent -> Proxies**

### SSIS Catalog Permissions

The account running the SQL Agent job must have access to execute the SSIS packages in the catalog:

| Role | Account | Purpose |
|---|---|---|
| `ssis_admin` | SQL Agent service account or proxy | Full administrative access to the SSIS catalog |
| `ssis_logreader` | SQL Agent service account or proxy | Read access to execution logs for troubleshooting |
| `dc_operator` | SQL Agent service account or proxy | Permission to execute packages |
| `READ` on SSIS Environment | SQL Agent service account or proxy | Required if environments are used to store connection credentials |

To configure:

1. In SSMS, expand **Integration Services Catalogs -> SSISDB**
2. Right-click **SSISDB** and select **Properties**
3. Click **Permissions** and add the SQL Agent service account or `rruser`
4. Grant **`dc_operator`** at minimum to allow package execution
5. Grant **`ssis_logreader`** to allow log visibility for troubleshooting
6. If SSIS environments are used to store connection manager parameters, grant **`READ`** on the environment and ensure it is referenced in the package execution properties
7. Click **OK** to save

> **Note:** If the SQL Agent job steps run under a proxy account, the proxy must also be granted access to any network shares or UNC paths used by the SSIS package, in addition to the SSIS catalog permissions above.
