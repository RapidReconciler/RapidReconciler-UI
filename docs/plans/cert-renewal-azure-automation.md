# Automated certificate renewal — Azure issuance → fleet auto-deploy

**For:** Daren (planning to automate the wildcard renewal in Azure).
**Question asked:** *"Can we mine the cert data and automatically deploy any
updates to the fleet, instead of today's Services release?"*
**Answer:** **Yes — feasibility is good, and it doesn't require touching the
frozen broker.** But there's a hard prerequisite (decouple the cert from the
Services jar) that has to land first. This doc is design + feasibility only —
no implementation; the cutover needs your + Daren's sign-off because it changes
how every customer box gets its TLS cert.

---

## TL;DR

- The cert that needs renewing is the **`*.getgsi.com` wildcard** that secures
  each customer's RR URL (HTTPS on the Services jar's HTTP server, the thing V8
  talks to). One cert, whole fleet.
- **Today it's baked into the Services jar** as a `classpath:` PKCS12 resource,
  so renewing it = bumping `server.ssl.key-store`, cutting a Services release,
  and rolling the new jar to every box. That's the "Services release" pain.
- **Two independent levers** turn that into automated renewal:
  1. **Decouple** the cert from the jar (`classpath:` → `file:`) and add a
     `component='tls-cert'` slot to the existing `file_versions` artifact
     catalog. Now the cert is its own deployable, pushed over the **existing**
     JMS / Manage-Deploy fleet machinery — no broker change, no jar rebuild.
  2. **Automate issuance in Azure** (Daren's side): Key Vault auto-renews the
     wildcard; a VALC connector mines the new cert from Key Vault, publishes it
     to the `tls-cert` slot, and triggers a fleet rollout.
- Lever 1 is the prerequisite and is the bigger lift. Lever 2 is a thin
  connector once Lever 1 exists.

---

## Current state (so the gap is clear)

**The wildcard cert (`*.getgsi.com`) — the renewal subject:**
- Procured/renewed by GSI ~every 6 months, CA-issued, DNS-01 validated,
  browser-trusted. Customers never touch it.
- On each box it serves HTTPS for the Services jar via, today:
  ```
  server.ssl.key-store=classpath:wildcard_getgsi_com-<dates>.pfx
  server.ssl.key-store-password=<pw>
  server.ssl.keyStoreType=PKCS12
  ```
  → the `.pfx` is a **classpath resource inside the jar**. Renewal therefore
  forces a Services version bump + full fleet jar roll. A past renewal that
  slipped caused a **real expiry-during-rollout SSO outage** across multiple
  customers — so the manual path is both heavy and risky.

**The VALC "Certificate Renewal" page does NOT manage this cert.** It manages
the *broker* keystore (the JMS broker↔agent TLS, a separate, self-signed,
truststore-pinned cert) — single keystore, local box only, CSR-generate +
import, no fleet concept, no scheduling, no ACME. Useful prior art for the UI,
but it is not the fleet wildcard tool. (Don't conflate the two — see the
broker note under Constraints.)

**Fleet reach today:**
- VALC knows each box via `client_servers` (heartbeat-auto-filled) +
  `client_databases` (one row per per-DB Services instance).
- **JMS is the only channel that reaches a real customer box** — customers
  don't expose internal IPs, and the HTTP self-update path is loopback-only.
  The frozen broker (`rr-valc-agent.jar`) streams files in chunks over JMS,
  SHA1-verifies, and drives the per-instance lifecycle via `SynchronizeMessage2`.
- `file_versions` is the artifact catalog; its `component` column already
  carries `valc`/`agent`/`services` and is documented as built to take new
  component types. `FleetRolloutService` fans a component out across customers
  (resume-safe, skip-if-current, append-only `client_deploys` audit).

So the transport and orchestration to push a file to the whole fleet **already
exist and already work** — they just only know about `db`/`services`/`ssis`
today.

---

## Target architecture

```
  Azure (Daren)                         VALC 2.0 control plane              Customer box
 ┌──────────────────┐  new version    ┌────────────────────────────┐      ┌──────────────────┐
 │ Key Vault         │  (Event Grid    │ CertSyncService            │ JMS  │ frozen broker     │
 │  *.getgsi.com     │   or poll)      │  1. pull PFX from KV        │ file │  rr-valc-agent.jar│
 │  auto-renew (CA / ├────────────────▶│  2. publish file_versions   │stream│   ↓ writes file   │
 │  ACME, DNS-01)    │                 │     component='tls-cert'    ├─────▶│ rr.cert-store/    │
 └──────────────────┘                 │  3. FleetRolloutService     │      │  wildcard.pfx     │
                                        │     fan-out + verify        │      │   ↓ restart inst. │
                                        └────────────────────────────┘      │ Services jar (TLS)│
                                                                            └──────────────────┘
```

### Lever 1 — decouple the cert from the Services jar (prerequisite, in-tree)

All on the **changeable** Services jar + VALC control plane; the broker is
untouched.

1. **Services jar:** change `server.ssl.key-store` from `classpath:...pfx` to
   `file:${rr.cert-store}/wildcard-getgsi.pfx` (default e.g.
   `C:\Program Files\Rapid Reconciler\certs\`).

   > **Corrected 2026-08-28.** This step used to read "the green-field
   > `application.yml` currently has **no `server.ssl` block at all**". That is
   > no longer true. Services **v8.0.20** added one, and it bundles the renewed
   > wildcard as a `classpath:` resource — the owner ruled "Option A" on
   > 2026-08-27 to get the expired cert replaced without waiting for this
   > decouple.
   >
   > So the porting this step describes has happened, in the shape this
   > document argues against. The work left is not "port the block" but
   > "change `classpath:` to `file:` in the V8 agent, and get the keystore back
   > out of git". **The private key now sits in two repositories rather than
   > one**, which makes Lever 1 more urgent, not less. Next renewal is
   > **2027-02-18**; this should land before it, not after.
2. **Keystore password:** today it's in the properties file inside the jar.
   With a `file:` cert it needs a home that isn't the jar — options: an env var
   set by the installer/WinSW, a VALC-pushed config alongside the cert, or
   (cleanest) a password that travels *with* the artifact and is written to a
   local config the jar reads. Pick one — this is a design decision, not a
   detail. (The wildcard PFX private key is the crown jewel; treat its password
   as secret material, never in the repo. version2 already commits a plaintext
   broker password — do **not** copy that pattern.)
3. **`file_versions`:** add `component='tls-cert'`. The cert artifact = the PFX
   bytes + metadata (issue/expiry dates, SHA-256, subject/SANs). Reuse the
   existing publish + catalog plumbing.
4. **Deploy target:** extend `FleetRolloutService` / the Manage-Deploy
   orchestrator to handle a `tls-cert` component — the deploy action is "stream
   the PFX to `rr.cert-store/`, then restart the Services instance(s) on that
   box" (instead of "swap the jar"). The JMS file-stream + SHA1 + health-check
   path is identical; only the on-box write target and the post-write action
   differ.
5. **Reload semantics:** Spring Boot `server.ssl` does **not** hot-reload a cert
   file by default. Two paths:
   - **Restart the Services instance(s)** after the cert lands (simplest;
     still far lighter than a jar release — no version bump, seconds of
     downtime per instance, sequenced across DBs).
   - **SSL bundle reload** (Spring Boot 3.2+ `spring.ssl.bundle.*` with
     reload-on-change) — no restart, but more config surface. Defer to a later
     phase; restart is fine for a 6-month cadence.

**Outcome of Lever 1 alone:** even with manual issuance, cert renewal stops
being a Services release — GSI drops the new PFX into VALC, clicks deploy, and
the existing fleet rollout pushes it. This is worth doing on its own.

### Lever 2 — automate issuance in Azure (Daren's side + a thin VALC connector)

Daren owns issuance; VALC owns ingest + fleet push. The clean contract:

**Azure side (Daren):**
- **Key Vault certificate** for `*.getgsi.com` with **auto-rotation** enabled,
  validated via **DNS-01 against Azure DNS** (required for a wildcard). Issuer
  is either a Key Vault-integrated CA (DigiCert/GlobalSign partner integration)
  or an ACME/Let's Encrypt flow driven by an Azure Function — either way Key
  Vault holds the renewed cert + private key.
- The cert must be **exportable as PKCS12 with its private key** (Key Vault
  policy `exportable`), since the Services jar needs the full PFX, not just the
  public cert.
- **Notification:** Key Vault → **Event Grid** `CertificateNewVersionCreated`
  (preferred — push), or VALC polls Key Vault for a new version on a schedule
  (simpler — no inbound endpoint to secure). Recommend Event Grid → a VALC
  webhook if there's an HTTPS ingress; otherwise poll daily.

**VALC side (new `CertSyncService`):**
1. On notification/poll, authenticate to Key Vault (managed identity if VALC
   runs in Azure, else a service principal / Key Vault access policy), pull the
   new PFX + password.
2. Publish to `file_versions` as `component='tls-cert'` (dedupe by SHA-256 so a
   re-poll doesn't double-publish).
3. **Preflight** (the lesson from the past outage): verify the new cert's
   validity window and SANs *before* rollout; refuse to deploy an
   already-expired or wrong-subject cert.
4. Trigger `FleetRolloutService` for the `tls-cert` component; per-box verify =
   the existing health check **plus** an HTTPS handshake that confirms the new
   expiry date is live (and, ideally, an SSO round-trip since that's what broke
   last time).
5. Record per-box `client_deploys` rows (SOC 2 append-only audit) + surface
   status on the VALC cert page.

---

## Constraints & risks

- **Broker is frozen.** `rr-valc-agent.jar` (JMS connect, file streaming, SHA1,
  instance lifecycle, `SynchronizeMessage2`) has no source in these repos and
  must not change. **Good news:** nothing above requires it to — we reuse the
  existing file-stream/sync contract as-is and only add a new `component` the
  control plane understands and a new on-box write target the *Services* side
  honors. Confirm the frozen broker's file-stream path can write to an
  arbitrary cert path (not just the jar store) — if it can only land files in
  the versioned jar store, the cert may need to ride to `rr.cert-store` via a
  small Services-side move step after the stream (still no broker change).
- **Empty desired-state footgun:** any `SynchronizeMessage2` publish must carry
  the FULL `InstanceState2[]` — an empty `instances[]` terminates the whole
  running fleet on the box. The cert rollout must not regress this.
- **One cert, whole fleet** — simpler than per-customer (no per-client cert
  matrix), but also means a bad cert breaks everyone at once. Hence the
  preflight + staged rollout (canary one client, then fan out) rather than
  blast-all.
- **Password/key custody** is the main security design decision (above). The
  wildcard private key in Key Vault + in transit + at rest on each box is SOC 2
  in-scope (encryption-in-transit already satisfied by JMS TLS; add at-rest
  handling for the on-box PFX).
- **No Azure Key Vault anywhere in the platform today** — this is net-new Azure
  surface. The VALC 2.0 QA Azure plan
  ([valc-2-qa-azure-deployment.md](valc-2-qa-azure-deployment.md)) reuses the
  broker/JMS shape and mentions only managed-disk encryption, no Key Vault.

---

## Phasing

1. **Phase 0 — decision.** Confirm with Daren: Key Vault as the issuance home,
   exportable PFX, Event-Grid vs poll, and who owns the DNS-01 / Azure DNS
   setup. Confirm the keystore-password custody approach.
2. **Phase 1 — Lever 1 (decouple).** `classpath:`→`file:` in the Services jar +
   port the `server.ssl` block, password custody, `tls-cert` `file_versions`
   component, `FleetRolloutService` support, restart-after-deploy. Manual cert
   drop still, but renewal is no longer a Services release. **Ship + verify on
   one box first.**
3. **Phase 2 — Lever 2 (automate).** `CertSyncService`: Key Vault ingest →
   publish → preflight → staged rollout → verify. Canary one client before
   fleet-wide.
4. **Phase 3 (optional) — zero-downtime reload** via Spring SSL bundle
   reload-on-change, dropping the per-instance restart.

---

## Answer to relay to Daren

Yes — once we decouple the wildcard from the Services jar (a one-time change on
our changeable side, no broker work), your Azure-renewed cert can flow to the
whole fleet automatically over the deploy machinery we already use for jars. The
clean hand-off is: **put the renewed `*.getgsi.com` cert in Key Vault as an
exportable PFX with auto-rotation + DNS-01, and let us know on new-version
(Event Grid or we poll).** We mine it from Key Vault, validate it, and push it
to every box ourselves — no more cert-driven Services releases, and a preflight
check so we never repeat the expiry-during-rollout outage. The prerequisite
decouple is the bigger piece of work and is on our side; the Azure→fleet
connector is thin once that's in.
