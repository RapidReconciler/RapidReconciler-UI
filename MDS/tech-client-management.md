# Installing a Client in VALC (Internal Use Only)

## Table of Contents

- [Overview](#overview)
- [Prerequisites](#prerequisites)
- [Part 1: Initial VALC Setup](#part-1-initial-valc-setup)
- [Part 2: Installing the RapidReconciler Agent](#part-2-installing-the-rapidreconciler-agent)
- [Part 3: Completing the Setup in VALC](#part-3-completing-the-setup-in-valc)
- [Summary Checklist](#summary-checklist)

---

## Overview

This guide covers the end-to-end process for setting up a new customer in VALC and installing the RapidReconciler Agent on their application server. The process consists of three main phases:

- **Part 1: Initial VALC Setup** -- Creating the client record, initial user account, and module configuration in the VALC portal.
- **Part 2: RapidReconciler Agent Installation** -- Downloading, installing, and validating the agent on the customer's server.
- **Part 3: Completing the Setup in VALC** -- Verifying connectivity, database status, and licensing company numbers.

---

## Prerequisites

Before beginning, collect the following information from the sales contract or the customer's IT contact:

- Number of companies purchased (per the sales contract)
- Customer name (e.g., Acme Manufacturing)
- IT contact email address and phone number.
- JD Edwards version *(optional -- for reference only)*

In addition:

1. Ensure you have the necessary permissions to access VALC and perform client setup tasks.
2. Make sure the RapidReconciler_Prod database has been configured and populated.

[Installing Production Database](../MDS/Installing_production_database.md)

---

## Part 1: Initial VALC Setup

### About VALC

VALC (Version and Licensing Control) is a GSI-developed web application hosted on Microsoft Azure. It is used to manage RapidReconciler and Genius customers. All new customers must be added to VALC before the installation process can begin.

> **Important:** Adding a customer in VALC is performed by GSI staff only. Note that this process will be transitioning to Active Directory control in a future update.

**Login URL:** [Rapid Reconciler VALC](https://rr-valc-spa.cloudapp.net/) -- Use the login credentials provided to you by GSI (SSO).

### Navigating VALC

VALC contains five main pages accessible from the top navigation:

![Main Navigation](../Images/rr_valc_main_navigation.png)

| **Page** | **Description** |
|---|---|
| **Clients** *(default)* | Where RapidReconciler clients are added and maintained |
| **SQL Scripts** | Used to deploy RapidReconciler database updates -- *RR developers only* |
| **Message Users** | Displays messages to users at login; messages include expiration dates |
| **Genius Pages** | Two pages are dedicated to Genius customers, including Key Generator |

---

### Step 1 -- Create the Client Record

- Click the **Clients** page in the main navigation bar.
- Click **Create Client** in the top-right corner.

![Create Client](../Images/rr_valc_create_client.png)

Complete the form using the following field guidance:

| **Field** | **Value** |
|---|---|
| **Client Name** | Enter the customer's name (e.g., Acme Manufacturing) |
| **Agent I/P Address** | Leave blank -- populates automatically during agent installation |
| **License Start Date** | Today's date |
| **License End Date** | Last day of the current calendar year *(must be updated manually each year; users are locked out after this date)* |
| **Version** | Select the latest version from the drop-down (this is the Agent version) |
| **JDE Version** | Enter the customer's JDE version -- informational only |
| **HTTPS** | Select **True** -- RapidReconciler requires HTTPS |
| **Maximum Companies Allowed** | Enter the number of licenses per the sales contract |
| **Agent Protocol** | Select **SSL** -- offline functionality is not available |

- Click **Confirm** to save the record.

> **Note:** Once a client record has been created, it cannot be deleted through the application. Use the **Inactive** status option if a client needs to be deactivated (e.g., when they opt out of their maintenance agreement).

After confirming, the new client will appear in the grid with the following initial values:

| **Field** | **Initial Value** | **When It Updates** |
|---|---|---|
| **Status** | Disconnected | Updates to "Connected" once the RR Agent establishes communication |
| **Agent Version** | Blank | Populates once the agent connects |
| **System Status / Messages** | Blank | Populates after database setup is complete and the job runs for the first time |

![Manage Clients](../Images/rr_valc_manage_clients.png)

---

### Step 2 -- Create the Initial User Account

An initial user account must be created before the agent can be installed.

- Click the **Manage Clients** icon for the newly created client.
- Select the **User Accounts** tab.
- Click **New User** and complete the form as follows:

![New User](../Images/rr_valc_new_user.png)

| **Field** | **Value** |
|---|---|
| **Full Name** | GSI Admin |
| **Client Email** | gsiadmin@*clientdomain*.com (e.g., rradmin@acmemanufacturing.com) |
| **Password** | 12345678 |
| **Active** | Yes |

- Click **Confirm**.

The new user will appear as a row on the User Accounts tab. These credentials will be used during the RR Agent installation.

> **Tip:** Confirm with the customer's IT contact that the email domain used here is reachable and correct before proceeding to installation.

---

### Step 3 -- Configure Initial Modules

- Click the **Manage Clients** icon for the client.
- On the **Client Details** tab under the **Tabs** section, check **Inventory** and **Admin** to start.

> **Recommendation:** It is best practice to get the client running on Inventory and Admin before enabling additional modules.

![Initial Tabs](../Images/rr_valc_initial_tabs.png)

The **Setup Step** field will display "Created" at this stage and will cycle through subsequent steps as the installation progresses.

---

### Step 4 -- Configure Additional Fields

![VALC Additional Fields](../Images/rr_valc_additional_fields.png)

| **Field** | **Value** |
|---|---|
| **Agent Internal IP Address** | Obtain from customer |
| **Domain URL** | Example: rrprod-customername.getgsi.com |
| **Max Companies Allowed** | Obtain from contract |
| **Agent Protocol** | SSL |
| **JDE Version** | Optional -- reference only |
| **HTTPS** | True |

---

### Step 5 -- Certificate Management

- Contact I/T to add an **'A' record** to the GSI IP service provider configuration.
- Provide the Agent Internal IP address and domain URL.

> **Note:** This step ensures the application UI will use the `*.getgsi.com` certificate, which is required for the agent to communicate with the database server. Allow time for DNS propagation before proceeding to Part 2.

---

## Part 2: Installing the RapidReconciler Agent

### Prerequisites

- You must be logged in on the **customer's application server** to complete this phase.
- Schedule a web meeting with the customer's IT contact before proceeding.
- The **Setup Step** in the client's VALC record must show **"Created"** in order for the agent download prompt to appear.

---

### Step 1 -- Download and Install the Agent

![Download Agent](../Images/rr_valc_download_agent.png)

- From the customer's application server, open a web browser and navigate to: **https://rapidreconciler.getgsi.com**
- Log in using the user credentials created in VALC (Step 2 above).
- Upon first login, the agent download screen will be displayed.
- Download the appropriate version of the agent. In the vast majority of cases, this will be the **64-bit version**.
- Execute the downloaded file and follow the installation prompts.
- Once installed, the web page will complete the installation automatically. The **"Installation Complete"** message will appear when finished. This process may take several minutes.

> **Note:** If the download screen does not appear after login, verify that the Setup Step in VALC still shows "Created" and that the user account credentials were entered correctly.

---

### Step 2 -- Validate the SQL Server Connection

After installation, return to the web browser. Within a couple of minutes, the **"Validating Data"** screen will appear, followed by the SQL Server connection properties prompt.

Enter the following details:

| **Field** | **Value** |
|---|---|
| **Address** | Internal IP address of the RapidReconciler database server |
| **Port** | Port for the instance (typically **1433**) |
| **User Name** | rruser *(default set during database creation)* |
| **Password** | rruser *(default set during database creation)* |

Once submitted, the browser will display a **"Deploying"** status followed by the **"Installation Complete"** confirmation screen.

> **Tip:** If the connection fails, verify that the RapidReconciler database server is reachable from the customer's application server on the specified port, and that the firewall allows inbound traffic on that port.

---

### Step 3 -- Verify Connectivity in VALC

Return to your local machine and log in to VALC to confirm the following:

- The client's **Status** has updated to **"Connected"**
- The **Agent Version** field is now populated

---

## Part 3: Completing the Setup in VALC

### Verify Database Status

Navigate to the client's **Database** tab in VALC and confirm that all database statuses show as **Online**.

> **Note:** If any database shows a status other than Online, do not proceed to company licensing until the issue is resolved. Contact the database administrator if needed.

### License Company Numbers

Once connectivity is confirmed and the initial data load is complete, the customer's company numbers will become available for licensing.

- Click the **Manage Clients** icon, then select the **Companies** tab.
- Check the applicable company numbers in accordance with the purchase agreement.

> **Note:** If more than one RapidReconciler database has been configured for this client, company licensing must be completed for each database separately.

---

## Summary Checklist

Use this checklist to track progress through the installation:

- [ ] Client record created in VALC
- [ ] License start and end dates set
- [ ] Initial user account (GSI Admin) created
- [ ] Inventory and Admin modules enabled
- [ ] Additional fields configured (IP address, domain URL, etc.)
- [ ] 'A' record added by I/T; DNS confirmed
- [ ] Agent downloaded and installed on customer's application server
- [ ] SQL Server connection validated
- [ ] VALC status shows "Connected" and Agent Version is populated
- [ ] All databases show "Online" on the Database tab
- [ ] Company numbers licensed per the purchase agreement
