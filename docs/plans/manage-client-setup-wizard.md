# Manage Client — Guided Setup Wizard — plan

**Status:** Slices 1–3 SHIPPED 2026-06-01 (RapidReconciler-Valc #54).
Remaining: slice 4 (strict-for-practice / soft-for-live tab locking),
slice 5 (Next on Topology → Install Prep → Databases — **Topology → Install
Prep shipped 2026-06-01**; Install Prep → Databases still to build), slice 6
(the Domain-URL → App-Server-IP connectivity check, on Install Prep). Builds
on the practice sandbox ([practice-client-and-import-testing.md](practice-client-and-import-testing.md)).

**Refinement 2026-06-01 — Domain URL moved off Client Details to the
Topology App Server card.** Slice 1 surfaced Domain URL on Client Details,
but that contradicted migration V21, which had already moved
`domain_url` (with `agent_external_ip` / `agent_internal_ip`) onto the
`APP_SERVER` `client_servers` row because those three fields describe the
*app server*, not the customer org — "the Manage Client modal stops
surfacing them; reads come from the client_servers row going forward."
Domain URL now lives only on the Topology App Server card (already wired
there). On Client Details it reverts to a hidden round-trip input,
matching its two IP siblings (back-compat on the legacy `clients.domain_url`
column; the column stays). It is no longer part of the Client Details
Save & Next gate. The practice pre-fill of the GSI test domain
(`rrtest-rrsqltest.getgsi.com`) moved to the App Server card, applied when
the field is empty for `is_practice` clients.

**Shipped so far:**
- **Slice 1 — Domain URL** ~~visible, required field on Client Details~~
  → **superseded by the 2026-06-01 refinement above:** Domain URL lives on
  the Topology App Server card (GSI-typed; Cloudflare A-record cross-ref).
- **Slice 2 — gated Save & Next → Topology** (Name + Contact 1 + UI
  Version); saving advances `setup_step` NEW → DETAILS_DONE. (Domain URL
  dropped from this gate by the refinement.)
- **Slice 3 — card entry**: a NEW client's card points at "Finish the
  record in Client Details" (`open-manage:client`); after the Client
  Details save it advances to the installation-prep step
  (`AgentStatusDto.setupStep` + snapshot + populateNextStep).
- **Import now persists** topology + server rows (so the Topology tab
  shows imported data instead of blanking on reload).
- **Practice flow**: Client Details opens blank, Import button
  spotlighted + auto-pastes the sample (no file), UI Version defaults
  V8 — all gated to `is_practice && setup_step=NEW`; live clients
  untouched. (Domain URL pre-fill moved to the App Server card per the
  refinement — applied when empty for `is_practice`.)
- **Practice-client hardening**: seeder guards on `is_practice` (not
  name); the practice client's name is immutable on save (keeps its
  "(Practice)" label, never duplicates).

## "Install Prep" tab → "Install Bundle" — SHIPPED 2026-06-01

Sending the installation-prep doc is a **sales step** (after contract),
not a tech step — and it's the action that *produces* the topology/server
data we import to fill the Topology tab. Keeping it as the focus of a tech
tab created a sequencing inversion (prep must precede Topology, yet the tab
sat after it). Resolved by splitting the two concerns:

- **Send prep → Client Details (optional fallback).** A compact "Send /
  Resend prep" button sits next to Contact 1. Painted from the loaded
  client's `contact1Email` + `prepDocSentAt`; repainted after a save (so a
  freshly-entered contact enables it) and after a send. The `send-prep-doc`
  endpoint + `prepDocSentAt` are unchanged — only the control moved.
  **Update 2026-06-01:** the sales-blurb hint was removed, and the button
  now opens an **email preview/mock-up** (To: Contact 1, the prep subject,
  body mirroring `buildPrepDocBody` with the live doc link); the actual
  send fires from the preview's "Send to customer" button.
- **Install Prep tab → "Install Bundle"** (label only; internal `data-tab`
  / `data-panel` / action codes stay `install`). Its job is now generate +
  send the bundle. The footer **Generate install bundle** button — which
  was `disabled` and never wired (dead control) — now enables when the
  Topology App Server row exists. A lead-in line states the tab's purpose;
  Install Progress stays below as the post-install result.
- **Readiness bug fix.** `ClientReadinessService.check()` compared the
  `ServerRole` enum with `"APP_SERVER".equals(...)` (String vs enum →
  always false), so `hasAppServer`/`ready` were permanently false — the
  other half of why Generate was dead. Fixed to an enum compare.
- **Bundle generation gates on the App Server, not a database.** The
  server's `readiness.ready` also wants a registered DB, but DBs are
  registered *after* install — so the UI gates Generate on
  `readiness.hasAppServer` only (no server-semantics change).
- **Generate button moved to the top of the panel** (owner's call) — the
  bundle is the tab's reason to exist. Footer keeps just Refresh. The
  Install Progress panel stays (it's the live "what's happening" view, and
  its pre-install "no checks yet" state reads honestly).

### Card ladder reworked onto data signals — SHIPPED 2026-06-01

The pre-install ladder used to lead on `setup_step == NEW`, but in the real
flow neither *Send prep* nor *Import* advances `setup_step` (only an explicit
Client Details Save does) — so it would stick on "Finish Client Details"
through the entire prep → import → ready-for-bundle phase. Rekeyed the whole
pre-install lane on the data signals (`prepDocSentAt`, `topologyConfigured`,
`bundleGenerated`, `running`) — `setup_step` is no longer read here (still
used for the practice blank-for-import gate). Matches the owner's real-world
flow (create rudimentary record → send prep → wait → import → send bundle →
wait for heartbeat):

- no prep sent, no topology → "New client. Send the installation prep from
  Client Details (or confirm sales did)…" (`open-manage:client`)
- **prep sent, no topology → "Installation prep sent. Waiting for the
  customer's submission — import it on Client Details when it arrives."**
  (the waiting-on-customer rung, restored)
- topology set, no bundle → "Generate the install bundle" (`open-manage:install`)
- bundle generated, not phoning home → "Install bundle sent. Waiting for the
  customer to install."

`bundleGenerated` = `clients.agent_client_id != null`; new DTO field +
snapshot compute.

### Per-step completion dots — SHIPPED 2026-06-01

A green dot on each **install-path tab** (Client Details / Topology / Install
Bundle / Databases), green once that step's data is in place. Painted by
`refreshTabDots()` from a single `/readiness` fetch (Client Details =
`contact1Email`, Topology = `hasAppServer`, Install Bundle = `agentClientId`,
Databases = `databaseNames`); repainted on every tab switch + after each
step's save, so they green as you progress. Companies / User Accounts have no
dot (ongoing config, not a linear setup step). Pairs with the card ladder:
the ladder says *what's next*, the dots say *what's done*.

### Install Bundle polish + practice tooling — SHIPPED 2026-06-01

A batch of refinements from new-hire-walkthrough testing:

- **Bundle credentials ride in the bundle, not the email.** The agent zip
  now carries `RR-FIRST-LOGIN.txt` (default-admin email + temp password +
  "sign in → you'll set a new password → safe to delete"), so the temp
  password travels inside the one-time signed download — never the email.
  The bundle email was slimmed to the link + "open RR-FIRST-LOGIN.txt"
  pointer (no secret). `adminEmail` + `tempPassword` thread from the
  controller into `InstallBundleService.generate()`; on a re-generate the
  readme falls back to "use your original / contact support".
- **Bundle-ready card does both in one click:** an inline mock of the
  customer email (To / subject / body + link) *and* the credential details,
  both on the page (kept visible for Coral review).
- **"Send prep" → email preview/mock** on Client Details (the sales blurb
  removed); the actual send fires from the preview's "Send to customer".
- **Contacts inline editor:** the Install Progress "Contacts on file" row
  expands to a backup-contact email field (`PUT /{id}/contact2`), greening
  the row in place.
- **Simulate heartbeat (practice only):** `POST /{id}/simulate-heartbeat`
  (gated `is_practice`) stamps the APP_SERVER row's `last_heartbeat_at` so
  the new hire can walk past "waiting for install" into Databases without a
  real agent.
- **Readiness bug fix:** `check()` now returns `agentClientId`, so the
  Install Bundle tab dot greens after generation and the Generate button
  relabels to "Regenerate bundle" on reload.
- **Refresh button feedback:** "Refreshing…" state + a toast + a live
  "Updated H:MM:SS" timestamp (was a silent no-op).
- **Practice card live-updates:** the grid poll now reaches the practice
  card (it renders in its own `#practice-section`, outside the polled
  `#clients-tbody`), and closing the Manage modal fires an immediate poll —
  so the card face reflects changes instead of going stale until reload.

Unrelated nav tweak shipped in the same commit: the VALC sidebar
**Documents** accordion split into **User Docs** (Using Valc, Provisioning,
Installation Prep, Server Migration) and **Tech Docs** (Agent Documentation,
Services Documentation, RRV8 Cutover Plan, Automated Test Plan).

- **Doc sweep:** `using-valc.html` (queued capstone rewrite) + the cutover
  plan should reflect the prep-is-sales / Install-Bundle framing.

## Goal

Turn the Manage Client modal into a **guided, one-page-at-a-time setup
wizard** so a new hire is walked through a customer install in the real
order, instead of free-clicking tabs and guessing the next step. The
Clients-grid card's next-step action drops you into the wizard; each page
has a **Next** button; you advance one page at a time.

## Page sequence

`Client Details → Topology → Install Prep → Databases`

Each page gets a **Next** button (in the modal footer slot for that tab).
Next advances to the following page; the final page's button closes the
wizard.

## Per-page gating

- **Client Details — Next disabled until mandatory fields are filled:**
  - **Name** (already required at Create)
  - **Primary Contact** (already required at Create)
  - **UI Version** — an explicit V7/V8 choice (defaults V7, but the pick
    determines which SPA the customer gets)
  - ~~**Domain URL**~~ — moved to the Topology App Server card (refinement
    above); no longer gated here.
  - **Save advances `setup_step` past `NEW`** (the earlier decision):
    saving/Next on Client Details is the "I've reviewed the record"
    signal that flips the card ladder forward.

- **Topology / Install Prep / Databases:** Next requirements TBD per page
  as we build them (e.g. Topology Next requires a topology + the App
  Server row; Install Prep Next requires the bundle generated; etc.).

## Domain URL + the connectivity test (Install Prep)

**Connectivity DNS check — SHIPPED 2026-06-01.** The Install Progress
"Database registered" row was replaced with a live **"Domain resolves to
app server"** check (`InstallChecksController.valcDomainResolves`): it
resolves the APP_SERVER row's `domain_url` (bounded 2s lookup) and compares
the result to that row's `internal_ip`. Green when they match (verified:
`rrtest-rrsqltest.getgsi.com` → `127.0.0.1`), fail when the host doesn't
resolve, warning on a mismatch. Also: **"Installation prep received"** now
greens once the topology is configured (the imported submission populated
the APP_SERVER row), instead of staying amber after send. Still remaining
on slice 6: the **A-record-request email**.

**Connectivity drives triage + Ping button — SHIPPED 2026-06-01.** A broken
domain means customers can't reach RapidReconciler at all, so it's now a
health signal, not just a diagnostic:

- **Shared `DomainConnectivityService`** (cached 60s, keyed by domain+IP so
  a fix re-checks promptly) is the single source of truth for the resolve
  check — used by both the Install Progress row and the card triage.
- **Triage:** in `populateNextStep`, a *running* client whose domain is set
  but doesn't resolve to its app-server IP is forced to **Needs action**
  (`danger`, rank 11) instead of "All clear" — it does NOT `setHealthy`.
  (Verified: Mauro → Needs action while broken, Healthy once fixed; a
  *missing* domain doesn't penalize.)
- **Card tint follows triage severity:** new server-computed
  `AgentStatusDto.cardTint` (derived from `nextStepKind`: success/warning/
  danger → same, info → secondary) replaces `systemStatusKind` as the
  `health-*` source in both the server-render and the 5s poll. So a
  Needs-action card reads red even though its Services pill is green.
- **Ping button** on the Topology App Server card's Domain URL: resolves
  what's typed (even unsaved) via `GET /{id}/resolve-domain?host=` and shows
  "Resolves to X.X.X.X [Use as internal IP]" — one click drops the resolved
  IP into Internal IP so the check matches. This is also the mitigation for
  VALC-side resolution not being authoritative for the customer's network:
  the new hire sees exactly what VALC resolves and reconciles it.
- **Install Bundle tab dot** greens on `agentClientId` (bundle minted via
  VALC) **or** `agentEverConnected` (any APP_SERVER heartbeat on record) —
  so an installed/established client whose bundle wasn't generated here
  (e.g. Mauro) still shows the step complete.

- **Domain URL is GSI-typed** and lives on the **Topology App Server
  card** (`client_servers.domain_url`, APP_SERVER role). It
  cross-references the customer's **A record at our ISP (Cloudflare)**.
- **A-record request email (slice 6, deferred):** at the right point in
  Install Prep, VALC spawns an email asking the customer to enter the A
  record (Domain URL → App Server). Mirrors the existing prep-email /
  install-bundle email pattern (Contact 1 recipient).
- **Connectivity confirmation:** confirmed by a **ping / resolve of the
  Domain URL** — it must return the **App Server's internal IP**. That
  validates the A record points where it should, and flips the
  corresponding Install Prep check from pending to confirmed.
- **Dependency:** the check needs the App Server's internal IP, which
  comes from the **installation-prep email** (its `SERVER NAMES &
  INTERNAL IPs → Application Server (internal IP: …)` line — already in
  the format) and is persisted on the App Server row. So the import email
  must carry the App Server internal IP for this check to run. (It does
  today.)
- **Timing:** the A record / ping is **not needed until the customer's UI
  is in play** (i.e. the V8 SPA is being stood up for them). It is part of
  **Install Prep validation**, not Topology — Topology just captures the
  Domain URL on the App Server card.

## Navigation model — context-dependent

- **Practice client → STRICT:** later pages stay locked until reached via
  Next, in order. A true one-way wizard that enforces the learning path.
- **Live clients → SOFT:** Next guides forward, but any tab stays
  clickable (matches today's downstream gating, which only locks
  Databases/Companies/Users until an App Server row exists). Experienced
  support can jump around.
- Discriminator: the client's `is_practice` flag (already on the DTO).

## Card entry

The Clients-grid card's next-step for a freshly-created client should
**begin the wizard** rather than jump to "Send installation prep":

- `setup_step = NEW` (just created) → "Finish setting up the client —
  start with Client Details" → opens the modal at Client Details (step 1).
- After Client Details Save (setup_step advances) → the existing
  ladder continues ("Send installation prep", etc.).
- Requires `setupStep` on `AgentStatusDto` + set in `snapshot()` so
  `populateNextStep` ([DashboardController.java](../../RapidReconciler-Valc/src/main/java/coral/rapidreconciler/valc/dashboard/DashboardController.java))
  can branch on it.

**Topology rung — SHIPPED 2026-06-01.** The pre-install ladder jumped
straight from `DETAILS_DONE` to "Send installation prep", so closing the
modal after Client Details but before configuring Topology left a stale
message. Added an intermediate rung keyed on a new
`AgentStatusDto.topologyConfigured` flag (true once an APP_SERVER
`client_servers` row with an internal IP exists — the artifact the
Topology "Save & Next" persists, and the same signal that gates the
downstream tabs). Ladder is now continuous:
- `NEW` → "Finish the record in Client Details" (`open-manage:client`)
- `DETAILS_DONE` + no App Server → "Set up the Topology next"
  (`open-manage:appserver`)
- `DETAILS_DONE` + App Server saved → "Send the installation prep"
  (`open-manage:install`)
- prep sent → "Waiting on the customer's submission"

Install-prep send/sent was already reflected via `prepDocSentAt`, so the
card face now tracks each setup stage. No `setup_step` column change —
the Topology completion is derived from the server row, not a new marker.

## Build order (incremental slices)

1. ~~**Domain URL field on Client Details**~~ — shipped, then moved to
   the Topology App Server card (refinement 2026-06-01). Now a hidden
   round-trip input on Client Details.
2. **Client Details Next** — footer button next to Save; enabled when
   Name + Primary Contact + UI Version are filled; on click, saves,
   advances `setup_step`, and moves to Topology. (SHIPPED; Domain URL
   dropped from the gate by the refinement.)
3. **Card entry** — `setup_step`-aware next-step: NEW → "start setup"
   (opens Client Details); add `setupStep` to the DTO + snapshot. (SHIPPED)
4. **Strict-vs-soft nav** — lock later tabs for the practice client;
   leave soft for live.
5. **Next on Topology / Install Prep / Databases** — page by page.
   - **Topology → Install Prep — SHIPPED 2026-06-01.** "Save Topology"
     demoted to a ghost button; primary **"Save & Next: Install Prep →"**
     added. Gated on a selected topology + the App Server card's label +
     internal IP. On click it persists the server cards (idempotent) and
     advances to Install Prep — **silent on success** (the topology choice
     already auto-saves on selection, so an unchanged board just continues,
     no redundant "Saved" toast). No `setup_step` change (the ladder
     already points at Install Prep after Client Details).
   - Install Prep → Databases, Databases → done: still to build.
6. **Domain → App-Server-internal-IP connectivity test** on Install Prep:
   spawn the A-record-request email, then confirm via a ping/resolve of
   the Domain URL → App Server internal IP. Deferred until the customer
   UI is in play.

## Open / deferred

- Exact mandatory-field set for Topology / Install Prep / Databases Next.
- How the Cloudflare DNS resolution check runs (agent-side vs VALC-side).
- Whether "Next" on the last page closes the modal or shows a summary.
