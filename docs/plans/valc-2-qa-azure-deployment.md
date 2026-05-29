# Plan: VALC 2.0 QA Azure VM deployment readiness

**Status:** Checklist. Not yet executed. Stand up the QA VM as the
**first** environment that mirrors the production cutover path, so
every production-day step is rehearsed end-to-end against a real
Azure host before any customer touches the new stack.

**Source:** session conversation 2026-05-27 (Prompt #1, Foundation
+ Environment Setup) plus Phase 0 of
[`valc-2-cutover-plan.md`](valc-2-cutover-plan.md).

**Reuses existing framework:** the legacy production stack already
runs on Azure VMs reached through the broker / agent JMS protocol,
plus a deploy-panel HTTP-push for Services jar updates. VALC 2.0
adopts the same operational shape &mdash; one Azure VM, broker on
the same port, deploy panel for Services updates. The QA VM is
*operationally identical* to the production VM; only its DNS
hostname, JWT scope (QA users only), and the `RapidReconciler_QA`
database backing it differ.

---

## Hard constraint &mdash; SOC 2 Type II context

The new infrastructure inherits the SOC 2 Type II audit surface
documented under [`Compliance/`](../../Compliance/) in this repo.
Every step in this checklist either preserves existing controls
or stands up the new-stack equivalent. Specifically:

- **Encryption in transit.** Artemis acceptor on TLS only; HTTP
  dashboard behind a TLS reverse proxy or directly on HTTPS.
  No plaintext acceptor exposed beyond the local loopback.
- **Encryption at rest.** Azure-managed disk encryption on the VM
  (default); Postgres `pgcrypto` for any column the schema flags
  for column-level encryption.
- **Access control.** RDP / SSH locked to the GSI VPN range; no
  inbound public-internet management. Postgres bound to localhost
  on the VM; no public port.
- **Audit logging.** Spring Boot actuator + access log on the
  reverse proxy; Postgres `log_connections` / `log_disconnections`
  on. Logs forwarded to the existing log-aggregation surface.
- **Change tracking.** Every deploy via the deploy panel writes a
  `client_deploys` row (append-only); the QA VM's own version
  history travels in `file_versions`. Both already in VALC 2.0's
  schema.
- **Key custody.** The RSA signing key used by `JwtService.mint()`
  matches the production trust anchor (Phase 0 #3, signing-key
  inheritance). On QA, a separate keypair is acceptable as long as
  the agent's `valc-public-key.pem` matches what VALC 2.0 signs
  with.

Any deviation from these gets surfaced in the cutover plan's
release-notes section so the audit trail stays continuous.

---

## Pre-flight (before VM provisioning)

- [ ] Azure subscription + resource group decided (in-house GSI
      subscription; same shape as the existing legacy VALC RG).
- [ ] DNS record reserved for the QA host. Format: `qa-valc.<gsi-domain>`
      or similar &mdash; needs to be a name agent processes can
      reach over WAN, since QA exercises the same WAN path
      production will use.
- [ ] Postgres backup-and-restore plan: QA seeds from a sanitized
      snapshot of the existing Azure VALC's Postgres so the schema
      ETL pass (Phase 0 #5) can be rehearsed against representative
      data. Sanitization: passwords scrambled, customer emails
      masked, `client_deploys` history truncated.
- [ ] JWT signing keypair for QA generated and stored. Two files:
      private `.pem` used by VALC 2.0's `JwtService.mint()`; public
      `.pem` shipped with the QA Services jar at
      `setup/valc-public-key.pem`.
- [ ] TLS cert for `qa-valc.<gsi-domain>`. DigiCert path is wired
      in VALC 2.0 ([`/valc/certificate`](../../GSIRRTech/valc-2-cutover-plan.html));
      generate the CSR there, paste the signed cert back in.
- [ ] Hosts-file alias decision: legacy broker on the test customer
      box needs to reach the QA VM at the same hostname production
      will use. Either DNS, hosts entry, or a per-agent override
      (see VALC 2.0's `valc.jms.ip` / `valc.jms.port` config).

---

## VM provisioning

- [ ] **VM size:** Standard_D2s_v5 (2 vCPU / 8 GiB) is the floor;
      bump to D4s_v5 if the broker load surprises us in QA. Match
      the legacy production VM's size if known.
- [ ] **OS:** Windows Server 2022 (matches the production install
      runbook in [`GSIRRTech/installing-production-database.html`](../../GSIRRTech/installing-production-database.html)).
- [ ] **Disk layout:** OS disk 128 GiB, data disk 256 GiB attached
      for `artifact-store/` + Postgres data + agent logs.
- [ ] **NSG inbound rules:**
      - 443 (HTTPS dashboard, behind reverse proxy or direct)
      - Broker JMS port (the legacy default; pull from
        `valc.broker.port` in `application.yml`)
      - 22 / 3389 restricted to the GSI VPN range only
      - No other inbound exposed
- [ ] **NSG outbound:** unrestricted within Azure; specific egress
      for GitHub Releases (Services jar fetch) and any external
      DigiCert / Cloudflare APIs.
- [ ] **Disk encryption:** Azure-managed-disk encryption enabled
      (default).
- [ ] **Backup:** Azure Backup vault attached; daily snapshot, 30-day
      retention. Postgres `pg_dump` cron as a second-tier backup
      written to the data disk and rotated to blob storage weekly.

---

## Software stack on the VM

- [ ] **Java 21 JDK** at `C:\Development\jdk-21.0.11+10` (matches
      the local dev paths so launch scripts port cleanly).
- [ ] **PostgreSQL 16** installed locally, bound to `127.0.0.1` only.
      `valc` database + `valc` role created; password lives in
      `application-prod.yml` (encrypted at rest via Windows DPAPI
      or vault reference).
- [ ] **VALC 2.0 jar** built from `main` of `RapidReconciler-Valc`
      and dropped at `C:\Program Files\GSI\valc\valc.jar`.
- [ ] **Windows Service** wrapping `java -jar valc.jar` with the
      `prod` profile activated. Restart-on-failure enabled.
      Service account: a dedicated low-privilege local account
      (NOT `LocalSystem`); has rights to the install dir + the
      artifact-store dir only.
- [ ] **TLS reverse proxy** (Nginx for Windows or IIS ARR) terminates
      HTTPS on 443 and forwards to VALC's :8080. Optional;
      acceptable to bind VALC directly on 443 if the reverse-proxy
      story adds friction.

---

## VALC 2.0 configuration

`application-prod.yml` overrides relative to the committed
`application.yml`:

- [ ] **`spring.datasource.url`** &rarr; QA Postgres
      (`jdbc:postgresql://localhost:5432/valc`).
- [ ] **`spring.datasource.username` / `password`** &rarr; QA
      `valc` role.
- [ ] **`valc.broker.port`** &rarr; the production-matching JMS
      port (so the legacy broker on a test customer box can
      connect to QA the same way it'd connect to production).
- [ ] **`valc.broker.tls.keystore-path` / `truststore-path`** &rarr;
      on-VM paths for the QA broker keystore + truststore. Both
      built with the QA TLS cert.
- [ ] **`valc.broker.tls.keystore-password`** &rarr; matches the
      legacy `coralsoftware` value (agent expects this hardcoded
      string).
- [ ] **`agent.jwt.public-key-path`** (in the Services jar's
      config, when deployed to a test customer box) &rarr; QA's
      public key.
- [ ] **`agent.jwt.skip-verification`** &rarr; **`false`** on the
      Services jar deployed for QA. Dev keeps it `true`; QA is
      where signature verification gets exercised before
      production.
- [ ] **CORS allowlist** &rarr; the V8 production host (TBD,
      probably `rapidreconciler.getgsi.com` or a CDN host) only.
      Drop the `localhost:8765` dev origin.

---

## Schema + data prep

- [ ] **Flyway migrations** run on first start. Confirm every
      committed migration applies cleanly on the QA Postgres
      (V1 through whatever's latest).
- [ ] **Schema ETL rehearsal** (Phase 0 #5). Import the sanitized
      Azure VALC snapshot into QA Postgres. Verify:
      - `users` row count matches expected (after sanitization).
      - `clients` rows carry over with their per-customer flags.
      - `client_databases` rows present (one per customer DB).
      - `client_deploys` truncated or imported with redacted
        version strings (no need for full deploy history in QA).
- [ ] **Password store strategy** validation (Phase 0 #6).
      Confirm the password-hash format in the legacy export is
      still verifiable by the new `BCryptPasswordEncoder` once the
      auth flow ships. If formats diverge, flag early &mdash;
      forced-reset on next login is the consequence and that's
      customer-visible on production.

---

## Connectivity / agent framework alignment

- [ ] **Broker reachability from a real legacy agent.** Point one
      test customer's `rr-valc-agent.jar` (or the equivalent dev
      copy) at the QA VM's broker port. Confirm:
      - JMS handshake completes (CORE protocol, TLS).
      - The agent registers in VALC 2.0's `agent_connections`
        table.
      - A `SynchronizeMessage2` round-trips end-to-end.
- [ ] **Deploy-panel push to a test Services jar.** Use VALC 2.0's
      Deployment Center to push a Services version to the test
      agent. Confirm:
      - The jar lands on the customer box.
      - The Services jar starts and reports healthy.
      - The `client_deploys` row transitions through PENDING
        &rarr; IN_TRANSFER &rarr; INSTALLING (and, once Phase 4b
        ships, SUCCEEDED on heartbeat).

---

## Smoke gates before opening QA to other users

- [ ] `GET /actuator/health` returns `{"status":"UP"}` from the
      production hostname.
- [ ] `GET /valc/clients` renders, sidebar dots paint correct
      colors, cert chip shows the QA cert's days-remaining.
- [ ] Login flow: a QA user can sign in, get a JWT, hit a V8
      page, and load data end-to-end against the QA Services jar.
- [ ] `client_deploys` write-path: one successful Services deploy
      logged and visible in the Deployment Center's Results card.
- [ ] Restart-on-failure: stop the VALC Windows service; confirm
      it relaunches within 30 seconds.

---

## Recommendations (carried over from the foundation pass)

- **Don't introduce a separate "VALC QA" repo.** Deploy from
  `RapidReconciler-Valc` `main` with the `prod` Spring profile.
  Same jar, different config &mdash; matches how legacy production
  deploys today.
- **Re-use `start-all.cmd` shape for the VM-side launcher.** On
  the Azure VM, a similar `start-valc-prod.ps1` wrapper around
  the Windows-service start command keeps the operator-facing
  story consistent with dev.
- **Pin the cert renewal to a calendar reminder.** The cert chip
  in VALC 2.0 surfaces days-remaining; add a 30-day-out reminder
  to operations as a backstop.
- **Document the QA VM's IP / hostname / port assignments** in a
  separate on-disk runbook (not committed) the operator can
  consult during incidents. Don't bake them into committed code.

---

## What this checklist deliberately does NOT cover

- **Production VM provisioning.** That's Phase 1 of the cutover
  plan. This QA pass is the rehearsal &mdash; production reuses
  the same checklist with QA-specific knobs swapped for prod.
- **Customer-side broker reconfiguration.** Legacy brokers stay
  pointed at their existing production hostname; QA exercises a
  parallel topology with QA-only hostnames.
- **Per-process operational-ownership assignment** (Phase 0 #8).
  A decision; not part of provisioning.
- **Pricing / contract implications.** Out of scope for an
  engineering checklist.
