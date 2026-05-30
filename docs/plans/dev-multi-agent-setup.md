# Plan: dev-box multi-agent setup (V7 architecture parity)

**Status:** Tonight (2026-05-30) landed the **agent + V8 routing
infrastructure**. The **data side** (cloning a second SQL Server
database + seeding the VALC tables) is the next user-driven step.

This plan exists because the V8 user-menu DB switcher has been
broken-by-architecture on the dev box for a while: only one test
agent runs on `:34537` (hardwired to `RapidReconciler_Dev`), so
picking a different database in the dropdown is theatre &mdash; the
data never changes. V7's actual production architecture is **one
Services jar per database, each on its own port**; the JWT lists all
agents in `dbs[]` and the SPA hits `dbs[activeDbIndex].ip` for every
endpoint. Aligning the dev box with that pattern fixes the dropdown
permanently.

---

## What landed tonight (2026-05-30)

### `RapidReconciler-Agent/setup/run-test-agent.ps1`

Parameterized. Now accepts:

- `-Id <slug>` (default `dev`) &mdash; used in the log filename so
  multiple agents don't tangle outputs.
- `-DatabaseName <name>` (default `RapidReconciler_Dev`) &mdash;
  passed to the JVM as `--agent.database-name=<name>` AND
  `--spring.datasource.url=jdbc:sqlserver://localhost:1433;databaseName=<name>;...`
  so the single jar serves any database.
- `-Port <n>` (default `34537`) &mdash; HTTP listen port.
- `-Detached` &mdash; spawn in the background; used by the multi-agent
  launcher.

Pre-flight check refuses to spawn if the port's already in use.

### `RapidReconciler-Agent/setup/test-agents.psd1`

Registry of test agents for the dev box. One entry per
(database, port) pair. Today contains just `dev` (port 34537,
RapidReconciler_Dev); add more as databases land.

### `RapidReconciler-Agent/setup/run-all-test-agents.ps1`

Reads `test-agents.psd1` and spawns each entry detached via
`run-test-agent.ps1`. Idempotent &mdash; skips entries whose port is
already in use. Polls `/health` on each port until all UP or the
timeout fires.

Run with:

```powershell
pwsh ./setup/run-all-test-agents.ps1
```

### `RapidReconciler-Valc/.../AgentDescriptor.java` + `AgentLifecycleService`

Descriptor gained a `databaseName` field. When VALC's dashboard
spawns an agent (via the dashboard's Start button or
`AgentLifecycleService.start()`), it now passes
`--agent.database-name=<name>` AND
`--spring.datasource.url=...databaseName=<name>...` to the JVM, so
each agent process serves exactly the database its descriptor names.

### `RapidReconciler-Valc/.../application.yml`

The existing `dev` agent entry got an explicit `database-name:
RapidReconciler_Dev` (was previously implicit via the agent's
bundled YAML). A commented-out QA entry shows the shape for adding
the second agent tomorrow.

### V8 rrFetch refactor (`RapidReconciler-UI/RRV8/`)

Across all 7 V8 pages (`inventory-reconciliation`,
`inventory-transactions`, `inventory-asof`,
`inventory-cardex-variance`, `accounting-dmaais`, `admin-companies`,
`admin-users`):

- The test-agent branch now reads
  `dbs[activeDbIndex].ip` and constructs the URL from it (HTTP for
  localhost, HTTPS otherwise). `testAgentBase` survives as a
  boot-race fallback only.
- The fall-through (legacy v359 endpoints) branch is also scheme-
  aware so localhost agents don't get an unsupported HTTPS URL.

Net effect: **the user-menu DB switcher actually changes which agent
V8 hits**. Picking `RapidReconciler_Dev` &rarr; hits the agent on
:34537. Picking `RapidReconciler_QA` (once it exists) &rarr; hits the
agent on :34538. Different numbers for different DBs &mdash; the
recurring "all zeros" cycle stops here.

---

## Tomorrow's checklist (user-driven, data side)

### Step 1 &mdash; create the second SQL Server database

Either clone the existing Dev DB (data + schema) or create an empty
one with just the schema. Cloning gives the most realistic test.

**Path A &mdash; copy-with-data** (preferred; ~5 min for the dev DB
size):

```sql
-- in SQL Server Management Studio or sqlcmd
USE master;
GO

-- Take a fresh backup of Dev
BACKUP DATABASE RapidReconciler_Dev
  TO DISK = N'C:\Temp\RapidReconciler_Dev_clone.bak'
  WITH INIT, NAME = N'Dev clone for QA test bed';
GO

-- Restore as QA, redirecting file paths so they don't collide
RESTORE DATABASE RapidReconciler_QA
  FROM DISK = N'C:\Temp\RapidReconciler_Dev_clone.bak'
  WITH
    MOVE N'RapidReconciler_Dev'      TO N'C:\SQLData\RapidReconciler_QA.mdf',
    MOVE N'RapidReconciler_Dev_log'  TO N'C:\SQLData\RapidReconciler_QA_log.ldf',
    REPLACE;
GO

-- Bring compat level into line with the dev DB
-- (the workspace CLAUDE.md targets compat 100 to catch
--  forbidden T-SQL syntax in CI)
ALTER DATABASE RapidReconciler_QA SET COMPATIBILITY_LEVEL = 100;
GO

-- Grant rruser the same access it has on Dev
USE RapidReconciler_QA;
GO
CREATE USER rruser FOR LOGIN rruser;
EXEC sp_addrolemember 'db_owner', 'rruser';
GO
```

(Adjust the file paths above to match your SQL Server data directory.
Quickly verify with `SELECT physical_name FROM sys.database_files`
inside `RapidReconciler_Dev` first.)

### Step 2 &mdash; tell VALC about the new agent

Edit `RapidReconciler-Valc/src/main/resources/application.yml` and
uncomment the QA agent block (or add a new one with whatever name
you used). Adjust paths if needed:

```yaml
- id:               qa
  name:             RR QA Server
  port:             34538
  database-name:    RapidReconciler_QA
  jar-path:         C:/source/repos/RapidReconciler-Agent/target/client-services-0.1.0-SNAPSHOT.jar
  java-home:        C:/Development/jdk-21.0.11+10
  services-version: 0.1.0-SNAPSHOT
  agent-version:    test
```

Also add an entry to `RapidReconciler-Agent/setup/test-agents.psd1`:

```powershell
@{ Id = 'qa';  Database = 'RapidReconciler_QA';  Port = 34538 }
```

(Keep the two lists in lockstep; the VALC dashboard reads its
config from `application.yml`, the launcher reads from
`test-agents.psd1`.)

### Step 3 &mdash; row in `client_databases`

VALC's Postgres needs to know the database exists. From `psql` or
your Postgres client of choice:

```sql
-- Connect to valc/valc on Postgres :5432
-- Find an appropriate client_id (likely 1 for "RR Test Server")
SELECT id, name FROM clients;

-- Insert the QA database
INSERT INTO client_databases (client_id, db_name, service_port, server_id, db_category, created_at)
VALUES (
  1,                          -- client_id from the SELECT above
  'RapidReconciler_QA',
  34538,                      -- matches the agent's port
  (SELECT id FROM client_servers WHERE client_id = 1 LIMIT 1),
  'TEST',
  NOW()
);
```

(Column list may have shifted since this was written; check
`\d client_databases` first. The point is one row identifying the
new database to VALC.)

### Step 4 &mdash; grant your user permission to the new database

Without this row, VALC's `AuthController.buildDbsScoped` won't put
RapidReconciler_QA into your JWT's `dbs[]` array and V8's dropdown
won't show it.

```sql
-- Find your user id
SELECT id, email FROM users WHERE email = '<your email>';

-- Grant full perms on the QA database
INSERT INTO user_database_permissions (
  user_id,
  database_name,
  tab_admin, tab_inventory, tab_in_transit, tab_po_receipts,
  import_jde, restart_service, dmaais,
  in_transit_exclude, po_receipts_suspend,
  companies_json
)
VALUES (
  <your user id>,
  'RapidReconciler_QA',
  TRUE, TRUE, TRUE, TRUE,
  TRUE, TRUE, TRUE,
  TRUE, TRUE,
  '[{"companyNumber":"00010","inventory":true,"inTransit":true,"poReceipts":true},
    {"companyNumber":"00050","inventory":true,"inTransit":true,"poReceipts":true}]'
);
```

### Step 5 &mdash; restart everything and test

```powershell
# Bounce VALC so it picks up the new agent in valc.dashboard.agents[]
cd C:\source\repos\RapidReconciler-Valc
pwsh ./setup/restart-valc.ps1

# Spawn both agents (dev + qa) on their respective ports
cd C:\source\repos\RapidReconciler-Agent
pwsh ./setup/run-all-test-agents.ps1
```

Then:

1. Open `http://localhost:8080/valc/clients` &mdash; the dashboard
   should show two rows, both green.
2. Open V8 (`http://localhost:8765/RRV8/inventory-reconciliation.html`).
3. Sign in via VALC&rsquo;s auth flow (once it ships) OR hand-mint a
   token via the existing DevTools snippet pattern in HANDOFF.md.
4. The user-menu DB switcher should now show **both** databases.
5. Picking each one should change the numbers on the page.

If picking QA gives an error / different shape, that's a real bug
to investigate. If it gives different numbers from Dev, the
multi-agent path is working end-to-end.

---

## What this *doesn't* fix

- The auth-shape rewrite (HANDOFF Tier 1 #1) is still queued. With
  the V7-vs-VALC-2.0 token-shape divergence we documented today,
  the JWT may still need surgery before customers can use it.
- The signature-verification gap (V7's `isSigned()`-only path vs
  the new agent's `parseSignedClaims()`) still applies; see
  `RapidReconciler-Agent/docs/gotchas.md` &sect; *Signature
  verification difference*.
- VALC 2.0&rsquo;s real `/resource/client/login` endpoint isn't wired
  yet, so the JWT-mint side that would automatically include
  user-scoped `dbs[]` is incomplete. Until that ships, the DevTools-
  paste workflow remains for swapping tokens on the dev box.

These are queued items, not regressions &mdash; cleared by the
broader auth chunk when capacity frees up.
