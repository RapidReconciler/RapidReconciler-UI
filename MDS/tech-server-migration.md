# RapidReconciler Technical Guide: Server Migration

## Process Steps for Dedicated and Separate Server Configurations

---

## Table of Contents

- [Section 1: Overview](#section-1-overview)
- [Section 2: Dedicated Server Migration](#section-2-dedicated-server-migration)
- [Section 3: Separate Servers Migration](#section-3-separate-servers-migration)
- [Section 4: Update VALC and Cloudflare](#section-4-update-valc-and-cloudflare)
- [Section 5: Post-Migration Checklist](#section-5-post-migration-checklist)

---

## Section 1: Overview

This guide covers the steps required to migrate the RapidReconciler environment to a new server. There are two migration scenarios depending on the server architecture:

- **Dedicated Server** -- The application (Agent) and database are hosted on the same server.
- **Separate Servers** -- The Agent and database are hosted on different servers.

Both scenarios require a final VALC and Cloudflare update to complete the migration.

> **Important:** Before beginning any migration, notify the client of the planned maintenance window. Data will be unavailable during the migration process. Coordinate timing to minimize disruption.

---

## Section 2: Dedicated Server Migration

### 2.1 Software Prerequisites

Ensure the following are in place on the new server before beginning:

- SQL Server Standard Edition (minimum), Version 2017 or later
- Administrator access to complete all required tasks
- Integration Services installed
- Integration Services Catalog (SSISDB) created
- RapidReconciler folder added to SSISDB
- RRUSER account added or migrated with appropriate permissions
- Visual Studio Community Edition with the SQL Server Integration Services extension (for SSIS package deployment)
- Applicable JDE database drivers (AS/400 or Oracle)

> **Tip:** Refer to the [Installing the RapidReconciler-Prod Database](../MDS/Installing_production_database.md) guide for detailed instructions on creating the SSISDB catalog, RapidReconciler folder, and RRUSER account.

---

### 2.2 Migration Process

Follow these steps in order:

#### Step 1 -- Database Backup and Restore

- Back up the current production RapidReconciler_Prod database on the old server and copy to the new server.
- Restore the RapidReconciler_Prod database on the new server.
- Add the RRUSER SQL Authentication login on the new server using the script from the old server.

> **Note:** Verify the restored database shows the correct record counts before proceeding. Run a quick row count on key tables such as F4111 to confirm the restore was successful.

#### Step 2 -- SSIS Package Migration

Complete steps 1-8 of the following guide to copy, update, and deploy the SSIS package on the new server:

[Configuring and Deploying the Integration Services Package](../MDS/Installing_production_database.md#configuring-and-deploying-the-integration-services-package)

> **Note:** If connection strings reference the old server by name or IP, update them to point to the new server before deploying.

#### Step 3 -- SQL Agent Job

- Create the RapidReconciler SQL Agent job on the new server using the script from the old server.
- Verify the job step points to the correct SSIS package path in the SSISDB catalog.
- Configure the job schedule to match the original server settings.
- Do not enable the schedule until the full migration is validated.

#### Step 4 -- Install the RR Agent

> **Important:** The VALC status for this client must be changed to **"Created"** before installing the agent. If it is not set to "Created", the agent download prompt will not appear after login.

- From the new server, open a web browser and navigate to **https://rapidreconciler.getgsi.com**.
- Log in using the **GSIADMIN** credentials.
- Download and install the RapidReconciler Agent (64-bit in most cases).
- Follow the on-screen prompts. The page will display **"Installation Complete"** when finished.

#### Step 5 -- Obtain IP Addresses for VALC

- Navigate to the RapidReconciler log file on the new server.
- Note the following IP addresses for use in the VALC update (Section 4):
  - Internal IP address
  - External (public-facing) IP address

> **Tip:** The log file is typically located in the RapidReconciler Agent installation directory. If you cannot locate it, check the Windows Event Viewer or contact GSI support.

---

## Section 3: Separate Servers Migration

### 3.1 Application Server

#### Software Prerequisites

- SQL Server Management Studio
- Visual Studio Community Edition with the SQL Server Integration Services extension
- Applicable JDE database drivers (AS/400 or Oracle)

> **Note:** The RapidReconciler Agent will be installed as part of the migration process below -- it does not need to be pre-installed.

#### Application Server Process

##### Step 1 -- Copy the SSIS Package

- Locate the SSIS package file (`.dtsx`) on the old application server and copy it to the new application server.

##### Step 2 -- Install the RR Agent

> **Important:** The VALC status for this client must be changed to **"Created"** before installing the agent. If it is not set to "Created", the agent download prompt will not appear after login.

- From the new application server, open a web browser and navigate to **https://rapidreconciler.getgsi.com**.
- Log in using the **GSIADMIN** credentials.
- Download and install the RapidReconciler Agent (64-bit in most cases).
- Follow the on-screen prompts. The page will display **"Installation Complete"** when finished.

##### Step 3 -- Obtain IP Addresses

- Navigate to the RapidReconciler log file on the new application server.
- Note the **Internal** and **External** IP addresses -- these are required for the VALC update in Section 4.

##### Step 4 -- Deploy the SSIS Package

1. Open **Visual Studio Community** using the Integration Services project template.
2. Create a new project named `RapidReconciler`.
3. Add the copied `.dtsx` package to the project.
4. Update the source (JDE) and destination (RapidReconciler_Prod) connection strings to point to the new servers.
5. Test all connections to confirm they are valid.
6. Deploy the package to the **SSISDB RapidReconciler folder** on the database server.

---

### 3.2 Database Server

#### Software Prerequisites

- SQL Server Standard Edition (minimum), Version 2017 or later
- Administrator access to complete all required tasks
- Integration Services installed
- Integration Services Catalog (SSISDB) created
- RapidReconciler folder added to SSISDB
- Applicable JDE database drivers (AS/400 or Oracle)

> **Tip:** Refer to the [Installing the RapidReconciler-Prod Database](../MDS/Installing_production_database.md) guide for detailed instructions on creating the SSISDB catalog and RapidReconciler folder.

#### Database Server Process

- Back up the current production RapidReconciler database on the old server.
- Restore the RapidReconciler database on the new database server.
- Add the RRUSER SQL Authentication login using the script from the old server.
- Create the RapidReconciler SQL Agent job using the script from the old server.
- Verify the job step points to the correct SSIS package path in the SSISDB catalog.

> **Note:** Verify the restored database shows the correct record counts before proceeding. Run a quick row count on key tables such as F4111 to confirm the restore was successful.

---

## Section 4: Update VALC and Cloudflare

This section applies to both migration scenarios and must be completed after all server work is finished.

### 4.1 Update VALC

- Navigate to the **Client Details** page in VALC and update both the **Internal IP** and **External IP** addresses for the client.
- Navigate to the **Databases** page in VALC and update the **Internal IP** address.

> **Note:** Confirm the new IP addresses are correct before saving. Entering an incorrect IP will prevent the agent from communicating with VALC.

### 4.2 Update Cloudflare

Contact **Daren** to update the IP address in Cloudflare. Provide the following information:

- **Domain URL** -- from the Client Details page in VALC
- **Internal IP** -- from the Client Details page in VALC

> **Important:** Data will not appear in the RapidReconciler UI until the Cloudflare update is in place. Allow time for DNS propagation after the update before testing.

### 4.3 Install the RR Agent (if not already completed)

> **Important:** The VALC status for this client must be changed to **"Created"** before installing the agent.

- From the application server, open a web browser and navigate to **https://rapidreconciler.getgsi.com**.
- Log in using the **GSIADMIN** credentials.
- Download and install the RapidReconciler Agent.

### 4.4 Enable the SQL Agent Job Schedule

- Once the Cloudflare update is confirmed and data is appearing in the UI, enable the SQL Agent job schedule on the new server.
- Verify the first scheduled run completes successfully.

### 4.5 Test Results

- Log in to the RapidReconciler UI using the GSIADMIN credentials.
- Confirm that data appears correctly in the interface.
- Spot-check key figures against the source JDE data to validate accuracy.
- Notify the client that the migration is complete and provide any updated connection details they may need.

---

## Section 5: Post-Migration Checklist

Use this checklist to confirm all steps have been completed:

- [ ] Client notified of maintenance window
- [ ] Database backed up from old server
- [ ] Database restored on new server and record counts verified
- [ ] RRUSER login created on new server
- [ ] SSISDB catalog and RapidReconciler folder created (if new install)
- [ ] SSIS package copied, updated, and deployed
- [ ] SQL Agent job created and configured (schedule not yet enabled)
- [ ] RR Agent installed on server
- [ ] Internal and External IP addresses noted from log file
- [ ] VALC Client Details updated with new IP addresses
- [ ] VALC Databases page updated with new Internal IP
- [ ] Cloudflare updated by Daren
- [ ] DNS propagation confirmed
- [ ] SQL Agent job schedule enabled
- [ ] First job run completed successfully
- [ ] Data verified in RapidReconciler UI
- [ ] Client notified that migration is complete
