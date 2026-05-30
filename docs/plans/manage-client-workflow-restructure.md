# Plan: Manage Client modal as a left-to-right workflow

**Status:** Phase 1 + Phase 2 + Install tab slice 1 shipped. Pre-flight
validation grid and deploy progression remain (slice 2+).

- Phase 1 (5-tab restructure, schema V18–V21) — VALC [#34](https://github.com/RapidReconciler/RapidReconciler-Valc/pull/34).
- Phase 2 (Import-from-email, legacy Servers grid removed, password
  link to sidebar, Topology cred UX, LP overlay killer, App Server
  connection pill) + Install tab slice 1 (readiness probe, RRAdmin
  auto-seed, Generate install bundle action) — VALC [#35](https://github.com/RapidReconciler/RapidReconciler-Valc/pull/35).
- Slice 2+ (pre-flight validation grid, deploy step progression,
  Companies re-grant) — pending.

The Manage Client modal today is a flat tab strip
(Client Details · Databases · Companies · User Accounts) with
placeholder fields scattered across the wrong tabs and no enforced
order. This plan re-frames it as a **left-to-right workflow** that
mirrors the provisioning docs the customer fills out before install
(`GSIRRSales/rr-provisioning.html`,
`GSIRRSales/rr-installation-prep.html`). Each tab captures one
phase of configuration; subsequent tabs prefill what they can from
prior selections.

---

## Source of truth

The provisioning docs are the authoritative model for what data a
customer install requires. Two docs:

- **`rr-provisioning.html`** — what the customer reads. Defines the
  three topologies and the server roles in each.
- **`rr-installation-prep.html`** — what the customer fills out and
  submits. Defines the exact fields gathered: topology choice +
  per-server names/IPs + source platform + JDE connection details +
  data-dictionary decimals.

Tab structure below mirrors the prep-doc sections in order, so the
modal teaches the workflow as the admin moves through it.

---

## Target tab order

1. **Client Details** — *who is the customer*
2. **Application Server** *(new)* — *where does the application run; topology selection*
3. **Databases** — *which database(s) does the application serve; prefilled from #2*
4. **Companies** *(existing)* — JDE companies under each database
5. **User Accounts** *(existing)* — login + per-DB permissions

Workflow rule: every customer **must** have an application server
configured before any database can be added. The modal enforces
this by disabling the Databases tab until the application server is
saved.

---

## Tab 1 — Client Details

**What lives here:**

- Customer name, address, contact info (already present).
- **JDE configuration block** *(new)* — the four data-dictionary
  decimals (`ECST`, `UNCS`, `PQOH`, `TRQT`), table qualifier
  (default `proddta`), source platform (Oracle / AS400 /
  SQL Server). Submitter contact (customer / name / title /
  email / phone / date) — already collected on the installation-
  prep email, captured here as the canonical record.

**What gets removed:**

- Application server hostname / IP / port. Those move to Tab 2.
- Any "database server" inputs that crept onto this tab.

**Why:** Client Details should describe the *customer organization* +
their *JDE source platform* — both of which are stable across
re-installs and server moves. Server hostnames are infrastructure;
they belong on infrastructure tabs.

---

## Tab 2 — Application Server *(new tab)*

The lynchpin tab. Captures:

- **Topology choice** — three radio buttons matching the provisioning
  doc:
  - Configuration 1 — Co-located (DB + SSIS + App on one box)
  - Configuration 2 — Separate DB & App (DB+SSIS on one, App on
    another) *(default; most common)*
  - Configuration 3 — Separate SSIS (DB, SSIS, App on three boxes)
- **Application server card** — hostname/FQDN, internal IP, OS
  version, RAM, static-IP flag. Always required. Persisted as a
  `client_servers` row with `server_role = APP_SERVER` *(new role
  needs a Flyway migration; see schema notes)*.
- **SSIS placement** *(derived from topology)*:
  - Config 1 → SSIS is on the App server (same box). No separate
    input.
  - Config 2 → SSIS is on the DB server. SSIS placement implicit;
    no separate input.
  - Config 3 → SSIS is on its own server. Adds a second card on
    this tab for the SSIS server (hostname + IP).

**Why this is a separate tab and not folded into Databases:** the
application server is **required for every customer regardless of
how many databases they have**. The Databases tab is variadic
(0..n rows); the App Server tab is exactly 1. Different cardinality,
different lifecycles, different tab.

---

## Tab 3 — Databases (restructured)

After topology + app server are saved on Tab 2, the Databases tab
*prefills aggressively* based on the topology:

- **Config 1 (Co-located)** — Database server section is **hidden
  entirely**. The DB host + port + credentials all derive from the
  App Server entry on Tab 2. Admin just clicks "Add Database" → the
  discovery picker shows `RapidReconciler_*` databases on the App
  Server's host.

- **Config 2 (Separate DB & App)** — Database server section is
  **visible** with a single empty card. Admin enters the DB server's
  hostname + IP + credentials. Once saved, that becomes a
  `client_servers` row with `server_role = SQL_SERVER`. The discovery
  picker then targets that server.

- **Config 3 (Separate SSIS)** — Same as Config 2 from the Databases
  tab perspective. The SSIS server lives on Tab 2.

**Add Database picker (already in PR #33)**: unchanged. Discovery
runs against whichever `client_servers` row matches `SQL_SERVER`
role under this client. Topology choice determines whether one or
more such rows exist.

**Per-row spawn button** *(deferred to next slice)*: each registered
database row gets a Start/Stop button that calls
`AgentLifecycleService.start()` with a descriptor built from the
row. Dynamic port allocation (32145–49152) already wired; this is
purely UI plumbing.

---

## Tab 4 — Companies *(existing, lightly polished)*

No structural change. The DB dropdown at the top of this tab was
already noted as needing to switch from a hardcoded list to
`/api/v1/clients/{c}/databases` — that work lines up with the
multi-DB plumbing and lands here.

---

## Tab 5 — User Accounts *(existing, lightly polished)*

No structural change. Per-DB permission rows already key off the
client's databases; will populate correctly once Tab 3 starts
emitting real rows.

---

## Schema additions

**V18__app_server_role.sql** *(new migration)*

Add `APP_SERVER` to the `client_servers.server_role` check
constraint (today: `SQL_SERVER`, `SSIS`).

**V19__client_topology.sql** *(new migration)*

```sql
ALTER TABLE clients
  ADD COLUMN topology VARCHAR(10);     -- 'CONFIG_1' | 'CONFIG_2' | 'CONFIG_3'

-- Backfill existing clients to CONFIG_2 (most common) so the
-- workflow tab structure renders sensibly even on pre-migration
-- rows. Admins re-confirm at next edit.
UPDATE clients SET topology = 'CONFIG_2' WHERE topology IS NULL;
```

**V20__client_jde_config.sql** *(new migration)*

```sql
ALTER TABLE clients
  ADD COLUMN jde_source_platform VARCHAR(20),    -- 'ORACLE' | 'AS400' | 'SQLSERVER'
  ADD COLUMN jde_table_qualifier VARCHAR(60),    -- e.g. 'proddta'
  ADD COLUMN jde_ecst SMALLINT,                  -- extended-cost decimals
  ADD COLUMN jde_uncs SMALLINT,                  -- unit-cost decimals
  ADD COLUMN jde_pqoh SMALLINT,                  -- qty-on-hand decimals
  ADD COLUMN jde_trqt SMALLINT;                  -- cardex-qty decimals
```

`client_databases.db_address` / `db_port` columns stay as legacy
back-compat fallback; new flows resolve through `client_servers`
via `server_id`.

---

## API additions

- `PUT /api/v1/clients/{id}/topology` — body `{topology, appServerId}`.
  Validates: at least one `client_servers` row with role `APP_SERVER`
  exists, no DB-only rows orphaned by the change.
- `PUT /api/v1/clients/{id}/jde-config` — body
  `{sourcePlatform, tableQualifier, ecst, uncs, pqoh, trqt}`.

Existing endpoints stay; the new ones just isolate the
topology-driven data into its own surface so the UI doesn't
accidentally mix it with infrastructure writes.

---

## UI flow rules

1. **Tab gating** — Databases tab is disabled until an App Server
   row exists with non-blank hostname + IP. Companies + Users
   inherit gating from Databases (must have ≥1 DB).

2. **Prefill direction is one-way (left → right)** — editing the
   App Server tab repaints the Databases tab's prefilled host/port
   fields. Editing fields on the Databases tab doesn't write back
   to the App Server tab.

3. **Topology change is a deliberate action** — the radio buttons
   on Tab 2 surface a "Change topology" confirm modal when the
   client already has databases registered. Three outcomes:
   - Config 1 ↔ Config 2: shifts DB server role between
     co-located and separate; existing `client_databases` rows
     are kept, just re-pointed to the appropriate `client_servers`
     row.
   - Anything → Config 3: the SSIS server card on Tab 2 becomes
     required; saving Tab 2 blocks until it's filled.
   - Config 3 → 1/2: the SSIS server row is soft-deleted on save.

4. **Bookmarkable URL state**: the modal accepts a `?tab=` query
   param so users can deep-link to a specific tab.

---

## Import from the customer's submission email (shipped in VALC #35)

The installation-prep doc produces a structured plain-text email
when the customer clicks "Submit" (rendered in
`rr-installation-prep.html` via the `buildBody` JS helper). The
shape is stable:

```
TOPOLOGY: Configuration 2 (Separate DB and Application Servers)
SOURCE PLATFORM: Microsoft SQL Server

JDE DATA DICTIONARY DECIMALS:
  ECST (extended cost decimals): 2
  UNCS (unit cost decimals):     4
  PQOH (qty on hand decimals):   0
  TRQT (cardex qty decimals):    0

JDE CONNECTION:
  JDE data server / warehouse:   JDEPROD01.contoso.local
  Database username:             rapidrec
  Database password:             rapidrec
  JDE server type:               SQL Server
  Table qualifier:               proddta

SERVERS:
  Database server (DB+SSIS):     RRDB01.contoso.local — 10.0.1.5
  Application server:            RRAPP01.contoso.local — 10.0.1.6
...
```

**Shipped in VALC [#35](https://github.com/RapidReconciler/RapidReconciler-Valc/pull/35):**
an "Import from email" banner above the Client Details form. The
admin pastes the customer's submission, clicks Parse & Fill, and
every tab pre-populates (topology → CONFIG_N radio + auto-PUT,
source platform, table qualifier, ECST/UNCS/PQOH/TRQT decimals,
customer name, submitter email → Contact 1 if empty, and the 1–3
server card label + internal IP rows). Admin reviews and saves
each tab as usual.

The parser lives client-side in `dashboard.html` rather than a
`ClientImportService.java` — small enough (~150 lines) that
collocating with the UI keeps it where the next person looks.

---

## Out of scope for this plan

- The full Application Server lifecycle (deploy, update, monitor) —
  separate larger plan piece.
- Multi-environment routing (a single customer with Prod / QA / Dev
  environments each with their own app server stack). Today VALC
  assumes one app server per customer; the topology selection here
  is per-environment from a future "Environments" tab.
- Audit logging on tab-by-tab saves. Already pending in the broader
  VALC plan; will compose with this restructure once the audit
  store lands.

---

## Implementation order

**Phase 1 (shipped, VALC [#34](https://github.com/RapidReconciler/RapidReconciler-Valc/pull/34)):**
1. Schema migrations V18/V19/V20/V21.
2. Topology backend (new endpoints + ClientEntity fields + ClientServerEntity).
3. Topology frontend (3-column grid, radio handler, role-keyed cards).
4. Tab gating (downstream tabs disabled until APP_SERVER saved).
5. Tab 3 prefill (read topology, auto-fill, hide DB card on Config 1).
6. Tab 1 JDE config block.

**Phase 2 + Install slice 1 (shipped, VALC [#35](https://github.com/RapidReconciler/RapidReconciler-Valc/pull/35)):**
1. Legacy Servers grid removed from Databases tab (Topology is canonical).
2. Import-from-email banner on Client Details with the labeled-block parser.
3. Password policy link re-added to sidebar Documents.
4. Topology card cred UX: default rruser/rruser, show/hide eye toggle.
5. Password-manager overlay killer (attributes + body-level CSS + MutationObserver sweeper).
6. App Server Connected/Disconnected pill mirroring the client-card face.
7. New Install tab between Databases and Companies with three states
   (Blocked / Ready / Success) and newcomer-friendly copy.
8. `ClientReadinessService` + `GET /readiness` + `POST /install-bundle`.
9. RRAdmin auto-seed (BCrypt temp password, full per-DB perms,
   `passwordChangedAt=null` first-login reset, idempotent).

**Install slice 2+ (pending):**
- Pre-flight validation grid (7 checks: network / SQL reach / SQL auth /
  JDBC driver / JDE reach / SSIS env / cert trusted) with per-check Re-run.
- Deploy step progression (push DB schema → Services jar → SSIS) with
  retry on each step.
- Companies re-grant after first SSIS pull populates `client_companies`
  (RRAdmin's `companies` JSONB updates with the full licensed list).
- Email-the-install-bundle automation (today the support person reads
  the temp password off the screen and forwards manually).
