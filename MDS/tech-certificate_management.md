# RapidReconciler SSL Certificate and DNS Management

## Table of Contents

1. [Overview](#overview)
2. [Components](#components)
3. [DNS Configuration](#dns-configuration)
4. [SSL Certificate Management](#ssl-certificate-management)
5. [Responsibilities Summary](#responsibilities-summary)
6. [Troubleshooting](#troubleshooting)
7. [Related Documentation](#related-documentation)

---

## Overview

The RapidReconciler user interface is secured using a wildcard SSL certificate (`*.getgsi.com`) provisioned and managed by GSI. This approach eliminates the need for individual customers to purchase, configure, or renew their own SSL certificates, reducing both cost and administrative overhead.

Each customer is assigned a unique domain URL (e.g. `rrprod-customername.getgsi.com`) that is configured in VALC during the initial installation. GSI manages the DNS and certificate infrastructure required to make this URL resolve securely to the customer's server.

---

## Components

| Component | Owner | Description |
|---|---|---|
| Wildcard SSL certificate (`*.getgsi.com`) | GSI | Secures all customer RapidReconciler URLs under the `getgsi.com` domain |
| DNS 'A' record | GSI I/T | Resolves the customer's domain URL to their server's internal IP address |
| Domain URL | GSI (configured in VALC) | Unique URL assigned to each customer during installation |
| RapidReconciler Agent | GSI Development | Deployed to the customer server; must be updated when the certificate is renewed |

---

## DNS Configuration

### How It Works

GSI I/T maintains DNS records with the GSI Internet Service Provider (ISP). For each RapidReconciler customer, an **'A' record** is added that maps the customer's assigned domain URL to the internal IP address of their application server.

**Example:**

| Domain URL | Internal IP Address |
|---|---|
| rrprod-acmemanufacturing.getgsi.com | 192.168.1.100 |

### When a New 'A' Record Is Required

A new or updated 'A' record is required in the following situations:

- A new customer is being set up for the first time
- A customer migrates to a new server with a different IP address
- A customer's internal IP address changes for any reason

### Process

1. The domain URL and internal IP address are confirmed in the **Client Details** page in VALC.
2. The request is submitted to **GSI I/T** with the domain URL and internal IP address.
3. GSI I/T adds or updates the 'A' record with the ISP.
4. Allow time for **DNS propagation** before testing connectivity.

> **Note:** DNS propagation can take anywhere from a few minutes to several hours depending on the ISP and TTL settings. The RapidReconciler UI will not be accessible at the domain URL until propagation is complete.

---

## SSL Certificate Management

### Certificate Scope

The `*.getgsi.com` wildcard certificate covers all subdomains under `getgsi.com`, meaning a single certificate secures every customer's RapidReconciler URL without requiring individual certificates per customer.

### Certificate Renewal Process

GSI is responsible for procuring and renewing the wildcard certificate. When the certificate is renewed, the following steps must be completed to deploy it across all customer environments:

#### Step 1 -- Backend Update (UI Developer)

- The UI developer updates the backend configuration with the renewed certificate.
- This ensures the RapidReconciler web interface continues to serve the correct certificate after renewal.

#### Step 2 -- Agent Deployment via VALC

- Once the backend is updated, the renewed certificate must be deployed to each customer's RapidReconciler Agent.
- This is performed through the **Manage Deploys** process in VALC.
- The deployment pushes the updated agent package to the customer server, ensuring the agent communicates securely using the renewed certificate.

#### Step 3 -- Verification

- After deployment, confirm the RapidReconciler UI loads correctly and the browser shows a valid, non-expired certificate for the customer's domain URL.
- Check that the certificate issuer and expiry date reflect the renewed certificate.

> **Important:** If the certificate is not deployed to the agent before the existing certificate expires, customers will receive browser security warnings and may be unable to access the RapidReconciler UI. Plan renewals well in advance of the expiry date.

---

## Responsibilities Summary

| Task | Responsible Party |
|---|---|
| Procure and renew the wildcard SSL certificate | GSI |
| Add or update DNS 'A' records with the ISP | GSI I/T |
| Configure the domain URL in VALC | GSI Staff |
| Update backend configuration after certificate renewal | GSI UI Developer |
| Deploy updated agent via VALC Manage Deploys | GSI Staff |
| Verify connectivity and certificate validity post-renewal | GSI Staff |

---

## Troubleshooting

| Symptom | Likely Cause | Action |
|---|---|---|
| Browser shows "Not Secure" or certificate warning | Certificate expired or not yet deployed to agent | Verify certificate renewal and redeploy via VALC Manage Deploys |
| Domain URL does not resolve | 'A' record missing or incorrect | Contact GSI I/T to verify the DNS entry |
| UI loads but agent is not connecting | IP address change not reflected in VALC or DNS | Update the internal IP in VALC and request a DNS update from GSI I/T |
| DNS propagation taking too long | ISP TTL settings | Allow additional time; contact GSI I/T if the issue persists beyond 24 hours |

---

## Related Documentation

- [Installing the RapidReconciler-Prod Database](../MDS/Installing_production_database.md)
- [Installing a Client in VALC](../MDS/installing-valc.md)
- [Server Migration Guide](../MDS/server-migration.md)