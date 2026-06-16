# Topology — test/dev DB server card + per-database server assignment

**Status:** Requirements captured 2026-06-16. **To be planned + implemented next
session** (owner: "plan for this next after a commit and session change"). This
doc is the spec hand-off, not a design yet.

## The ask (owner, verbatim intent)

Add a **fourth server card** to **Manage Client → Topology**, alongside App /
Database / JDE Source:

- **Same fields as the Database Server card** — Label, Internal IP, SQL Username,
  SQL Password (i.e. a SQL Server connection: host + credentials).
- **No radio button** — like the JDE Source card, it is not a topology *choice*;
  it's an optional extra server.
- **Placed to the right of the JDE Source card** (next column in the topology grid).
- **Internal only — hidden from customer-facing documentation.** Customers don't
  see it; they have to *ask* for it and give us the details separately.

### Why
Some customers run **production RR in with their other production databases**,
but also want a **test setup on a development box**. The fourth card captures
that **test/dev DB server's connection-string info** so we can stand the test
instance up on the dev box.

### The structural consequence
- **Each RR database now needs a server assignment** — which server that
  database physically lives on.
- **Defaults follow the current Config 1 / Config 2 selection — no change there.**
  (Config 1 co-located → the app/DB box; Config 2 → the Database Server.) The new
  test/dev server is just an *additional* assignable target.
- **The point is the SSIS config build:** when we render a database's SSIS
  environment, we must know **where the DB lives** to put the **correct host +
  credentials** in its RR connection string. A test DB on the dev box needs the
  dev box's connection, not the production DB server's.

## Existing groundwork to leverage (don't rebuild)

- `client_databases` **already carries `server_id`** — `db.getServerId()`. And
  `SsisConfigService.resolveRows` **already** prefers the assigned server's host
  for the RR connection string:
  `if (db.getServerId() != null) rrHost = serverRepo.findById(serverId).getHost()`,
  falling back to the inline `db_address`. So the DB→server link is partly there;
  the missing pieces are (a) the new server card/role, (b) the per-DB assignment
  UI, (c) the credentials wiring into the connection string.
- Servers are `ClientServerEntity` rows with a `ServerRole` enum
  (`APP_SERVER`, `SQL_SERVER`, `JDE_SOURCE`). A new role would be added.
- Topology grid is in `dashboard.html` (`.topology-grid`, currently
  `grid-template-columns: 1fr 1fr 1fr`; App=col1, DB=col2, JDE=col3). A 4th
  column (or a card to the right of JDE) is the layout change.

## Open design questions (next session)

1. **Schema/role:** new `ServerRole` (e.g. `TEST_DB` / `DEV_DB`) on
   `client_servers`? Migration + enum + controller wiring (mirror the V44
   `JDE_SOURCE` add).
2. **Per-DB server assignment UI:** each database picks its server. `server_id`
   exists on `client_databases`; surface a picker (Databases tab? Topology?).
   How a DB gets flagged as "test"/assigned to the dev box.
3. **Default logic:** Config 1 → app box, Config 2 → DB server, test DBs → the
   new card. Confirm the defaulting stays automatic (owner: "no changes there").
4. **SSIS config build:** `resolveRows` already reads `server_id` for the host —
   confirm it also pulls **that server's credentials** (today RR creds come from
   the `db` row's `rruser`/password; a test box may use different creds). This is
   the crux: "we need to know where the db is to get the credentials correct."
5. **Grid layout:** widen `.topology-grid` to 4 columns (or place the card to the
   right of JDE); keep it non-radio like JDE Source.
6. **Hidden from customer docs:** ensure provisioning / installation-prep docs
   don't surface it; it's internal capture only.

## Related
- The **1:1 RR↔JDE** licensing rule + client-per-RR model (this session's
  discussion) — a test instance is a separate RR, but on a shared/dev box.
- `SsisConfigService.resolveRows` / `mineDecimals` (per-DB config build).
- Memories: `project_databases_manually_tracked`,
  `project_companies_tab_aligns_v8_admin`, the SSIS-config-per-customer plan
  (`ssis-management-and-jde-extraction.md`).
