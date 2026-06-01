# Install Bundle Generator — build plan

**Status:** Spec / not started. Keystone for end-to-end Add Client
(HANDOFF queue #2). Unblocks the truthful rewrite of
`using-valc.html` and the customer install/move docs.

**Decisions settled (session 2026-06-01):**

- **Delivery = authenticated/signed in-app download, never email.**
  V7 already proved this: `rr-valc`'s
  `external/controller/DownloadController` serves the agent installer
  via `GET /client/download-installation-x64/{clientId}` with
  `Content-Disposition: attachment`. `.exe` email attachments get
  filtered. The email to Contact 1 carries a **link**, not the binary.
- **Format = V7's proven Inno installer, delivered inside a
  per-download zip.** Lowest *install-execution* risk on locked-down
  customer Windows (WinSW service registration, bundled JRE, Program
  Files layout — all battle-tested in V7). A raw zip+script shifts
  risk onto the customer's most fragile surface (PS execution policy,
  AV, manual service reg) — rejected.
- **Per-customer surface is tiny.** V7's installer is *generic*
  (one file per arch × protocol) because identity was external IP.
  Our only new per-customer artifact is the agent's external
  `application.properties` (`valc.client-id` + `valc.secret` +
  broker URL) — a few hundred bytes. Everything else (WinSW + JRE +
  jar + truststore + broker URL) is identical for every customer.
- **No binary or secret in Postgres.** Generic installer lives on
  disk (V7 + VALC's `ArtifactStorageService` precedent). Postgres
  holds a **manifest row** per generation. The secret is hash-only at
  rest (V27 `clients.agent_secret_hash`).
- **Resend = regenerate, which rotates the secret** (mint new →
  overwrite hash → re-stamp). A feature: invalidates any stale/leaked
  copy. No need to retain the old file.
- **Stamp on the fly:** the per-download zip = static signed
  installer + freshly-stamped `application.properties`, assembled per
  request. Nothing customer-specific sits at rest; secret is
  transient in the response stream only.
- **Code-sign the generic installer** — single biggest customer-IT
  friction/risk reducer (SmartScreen/AV). Confirm + reuse V7's signing.

---

## Track A — VALC-side (buildable now, testable with a stand-in base installer)

### Stage 1 — Manifest schema (Flyway V28)
`client_install_bundles`: `id`, `client_id` FK, `generated_at`,
`generated_by`, `download_token` (unguessable, unique, indexed),
`token_expires_at`, `status` (`PENDING`/`DOWNLOADED`/`EXPIRED`/
`SUPERSEDED`), `base_installer_version` (or FK to `file_versions`),
`secret_rotated_at`, `downloaded_at`. **No secret, no binary.**
Generating a new bundle supersedes prior `PENDING` rows for the client.

### Stage 2 — Mint/rotate + stamp service
- Fix the secret-shown-once trap: `ClientReadinessService.provisionAgentIdentity`
  is currently idempotent (returns early when `agentClientId` exists,
  WITHOUT a new secret). Add a `forceRotate` path that mints a fresh
  secret and overwrites `agent_secret_hash`.
- Build the per-customer `application.properties` string
  (`valc.client-id`, `valc.secret`, broker URL, truststore ref) from
  the client row + a freshly-minted secret.
- Write the `client_install_bundles` row + token.

### Stage 3 — Signed download endpoint (model on V7 `DownloadController`)
`GET /client/install-bundle/{token}` — token-gated (the token IS the
capability; stays token-gated when `SecurityConfig` tightens from
today's `permitAll`). Validate token + expiry + status → assemble the
zip on the fly (static base installer from the artifact store + the
stamped `application.properties`) → stream `application/zip` with
`Content-Disposition`. Mark `DOWNLOADED`; allow re-download until
expiry.

### Stage 4 — Wire generate + email-the-link
- `ClientsController` `POST /{id}/install-bundle` (today a stub that
  only seeds admin): generate bundle (Stage 2) → compose email to
  Contact 1 with the signed URL → send via `EmailService` (records
  `email_audit`; STUBBED in dev). Return `SeedResult` + the URL.
- Dashboard "Generate install bundle" shows the link + "emailed to
  Contact 1" + a **Resend** action (regenerate → rotate → new link).

### Stage 5 — Expiry hygiene (light)
Scheduled sweep marks expired tokens `EXPIRED`. With on-the-fly
stamping there's no cached per-customer zip to purge — properties are
generated per request — so this is bookkeeping only.

---

## Track B — the generic signed installer (mostly outside VALC)

**Reverse-engineered from the live V7 install** on the RR Test Server
(`C:\Program Files\Rapid Reconciler\`, 2026-06-01) — it *is* an Inno
install (`unins000.exe`), and `ISCC.exe` (Inno Setup 6) is present on
this box, so we can compile here.

### Target layout the installer must reproduce
```
C:\Program Files\Rapid Reconciler\
  jre\                     bundled JRE (live install = 1.8.0_45)
  rr-valc-agent.exe        WinSW wrapper (renamed winsw.exe)
  rr-valc-agent.exe.config WinSW .NET runtime config
  rr-valc-agent.xml        WinSW service definition (below)
  rr-valc-agent.jar        the broker jar (~47 MB; the identity-bearing component)
  keystore.rr.jks          JMS truststore (valc.jms.keystore.path)
  files\                   Services jars land here (fetched from VALC, not bundled)
  logs\                    WinSW + agent logs
```
WinSW service (`rr-valc-agent.xml`): `id=rr-valc-agent`,
name "Rapid Reconciler 7 Agent", `executable=%BASE%\jre\bin\java.exe`,
`arguments=-jar "%BASE%\rr-valc-agent.jar"`, `startmode=Automatic`,
`onfailure restart 10s / 30s / reboot`, `logpath=%BASE%\logs`,
`env RRAGENT_HOME=%BASE%`.

### Where the stamped identity goes
The live install carries **no external `application.properties`** — the
broker runs on its jar-baked config. Spring loads an external
`application.properties` from the process working dir (`%BASE%`) and it
**overrides** the packaged one. So the bundle's stamped properties must
land at **`%BASE%\application.properties`**; the patched broker
(`Properties.java` reads `${valc.client-id:}` / `${valc.secret:}`) picks
them up there. The Services jar is **not** bundled — the broker fetches
it from VALC via the existing file-transfer deploy.

### Java-runtime bridge — DECIDED: Option A (dual-JRE)
- V7 broker (`rr-valc-agent`) targets **Java 1.8**; the new Services jar
  (`RapidReconciler-Agent`) targets **Java 21 / Spring Boot 3.3.5**. The broker
  spawns Services with its own `java.home`, so a Java 8 broker launching a Java
  21 jar → `UnsupportedClassVersionError`.
- **Chosen — (A) dual-JRE bundle.** Ship **both** JRE 8 (broker) and JRE 21
  (Services). The broker's `AgentInitializer` now reads
  **`valc.services-java-home`** and spawns Services with that path, falling back
  to its own `java.home` when unset (backward-compatible — existing installs
  unaffected). **Broker patch landed** in `RapidReconciler-V7-Broker`
  (local-only). The installer sets `valc.services-java-home` to the bundled
  JRE 21 path in `%BASE%\application.properties`.
- (B) Migrate the broker to Java 21 — deferred (a real Spring Boot upgrade);
  the eventual single-runtime end state.
- (C) Services jar on Java 8 — impossible (Spring Boot 3 needs 17+).

**Flagged for Coral** in the cutover plan, Phase 0 (the runtime split to be
aware of when building/validating the new Services jar against the broker).

### Other gating deps
- **Code-signing cert** — the single biggest customer-IT friction reducer
  (SmartScreen/AV). Confirm + reuse V7's signing setup. External.
- **Build the patched broker jar** (V7-Broker, local-only — clientId/secret
  `Properties` already added) and wire its build.
- **`.iss` home** — likely `RapidReconciler-Agent` (the agent-shipping repo) or
  a dedicated `installer/` track; decide.

### Recommended sequence
Resolve the **A/B Java-runtime decision first** (it's the long pole and shapes
the payload), get the **signing cert**, then author the `.iss` + WinSW config
modeled on the layout above, compile with `ISCC.exe`, sign, and drop the result
into `valc.install-bundle.base-installer-path`. Track A already consumes it with
zero code change.

Until then, **Track A is fully functional** with the placeholder base — the
mint/stamp/deliver/email/manifest flow doesn't depend on the real installer bytes.

---

## Out of scope / later
- At-rest encryption of `credentials_password_encrypted` /
  `db_password_encrypted` (separate queue item).
- The `login.html` sidebar link prod URL + the UI-side delete/repoint
  of `services-version-control.html` (separate, prod-URL-gated).
