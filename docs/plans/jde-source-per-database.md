# Second JDE instance on one box — minimal handling (per-DB JDE override)

**Status:** VALC-side override SHIPPED 2026-06-19. The SQL leg (2nd JDE instance
on one box) is complete + tested; the non-SQL leg stores the DBA-supplied OLE DB
connection + platform for the on-box agent, and the SSIS package provider change
is deferred (see "What shipped" below). Keep it small.

## What shipped (2026-06-19)
- **Migration V49** (`client_databases`): nullable `jde_override_{platform,host,
  port,catalog,username,password_encrypted,qualifier,connstr}`. Null on every
  database by default → the common path is byte-for-byte unchanged.
- **`SsisConfigService.resolveJde`** — the single override-else-client resolver
  used by `resolveRows` / `missingConfig` / `validateConnectivity` /
  `mineDecimals`. When an override is active (host or connstr set) the connection
  identity comes from the override only (never mixes a client password with an
  override host); platform + qualifier fall back to the client when blank.
- **Deployment Center Step 4** — an optional collapsed "Override JDE source for
  this database" block (`/valc/deployment/ssis-jde-override` GET/POST). Password
  kept as its own sensitive field (s28 isolation), empty = keep existing.
- **Verified live:** GET fallback to the client card; save/clear round-trip;
  password masked on read + kept on blank save; a SQL override actually routes
  the JDE connection (validate hits the override host, not the client card); an
  Oracle override defers validate + decimal mine to the on-box agent.
- **DEFERRED (package change):** the shipped `.dtsx` `JDESource` connection
  manager has a hardcoded `Provider=MSOLEDBSQL.1` and only exposes
  `CM.JDESource.{ServerName,InitialCatalog,UserName,Password}` (no Provider /
  ConnectionString param — `JdeConnectionString` is a dead beta.6 leftover with
  no expression). So VALC cannot drive a non-SQL provider through the catalog
  environment. The Oracle/AS400 connstr + platform are stored for the on-box
  agent; re-exposing a full-ConnectionString param in the package is a separate
  task for when a real non-SQL customer exists (and is untestable until then).

---

**(Original plan below — kept for context.)**

**Rare scenario — build only when a real customer
needs it; do NOT build speculatively.** Keep it small.

## The scenario
A customer with **two JDE instances** on one box. In **V7** the only change was the
SSIS **connection string**. In **V8** each database already has **its own SSIS
environment (its own build)**, so the equivalent is simply: that second
database's environment is built with a **different JDE connection**. One box =
one client = one broker/bundle; a 2nd JDE instance = a 2nd database + a 2nd
Services instance under the same broker (no second bundle).

## Do NOT overcomplicate
Rejected (overkill for a rare case): per-database JDE-source data model,
multiple JDE_SOURCE topology cards, client-model overhaul, dev-client reorg.

**Keep per-client JDE source as the default.** The common customer has one JDE
instance → one client JDE source → all its DBs use it. Unchanged. The
NA/TR-as-separate-clients dev setup keeps working as-is.

## Minimal mechanism (when needed): optional per-database JDE override
Add an **optional** per-database JDE connection override. Empty on virtually
every DB → `resolveRows` uses the client's JDE source exactly as today. Set only
on the rare 2nd-JDE database → that DB's SSIS environment builds against the
override instead.

- Storage: optional override fields on the database (JDE server / catalog / login
  / password), or an optional `client_databases.jde_server_id` pointing at a
  second `JDE_SOURCE` row. Null = use client default.
- `SsisConfigService.resolveRows` / `missingConfig`: **override-else-client**
  lookup. One small branch; the common path is unchanged.
- UI: one optional "Override JDE source for this database" affordance on the
  Databases tab / the DB's SSIS config — hidden/secondary, not on the main
  Topology flow.
- Prep form / import: unchanged for the common case. A second JDE instance's
  details can be entered on the override when that DB is added.

## Why this is enough
The connection string is the only thing that differs between the two JDE
instances; everything else (schema, package, broker, bundle) is shared. So the
whole feature is "let one DB's SSIS build use a different JDE connection," which
is a single override + a one-line resolve change — not a model change.
