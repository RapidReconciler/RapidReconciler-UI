# V7 to V8 migration plan

Status: documentation phase (2026-07-11). The model is designed and the
schema compatibility is verified. Nothing is built or tested yet. Open
items are listed at the end.

## What this covers

How a customer moves from a V7 RapidReconciler database to V8. V8 installs
as a new database next to the existing V7 one and takes over reconciliation.
The two run on the same SQL instance during the move, which is why V8
databases are named `RapidReconciler_<env>_V8`. The `_V8` suffix keeps them
distinct from the customer's V7 `RapidReconciler_Prod` and still matches
VALC's `RapidReconciler_` discovery prefix, so no VALC change is needed for
discovery. See `project_v8_db_naming_convention`.

## Governing constraint

A customer has already reported and reconciled against V7's perpetual
inventory numbers. The migration must not change those numbers.

RapidReconciler computes each item's perpetual position by rolling the
cardex forward from a beginning balance. Re-running that calculation in V8,
after the reconcile-window cutoff redesign, the conversion-factor fixes, and
other changes since V7, would produce different beginning balances than V7
showed. That is a restatement, and customers will not accept it.

So the rule is: preserve the reported numbers, do not recompute them. The
migration carries the computed values forward as data and V8 continues from
there.

## What moves and what does not

Copied verbatim from V7, holding the reported numbers and their supporting
detail:

- RItems
- RTransactions
- RPerpetualInv
- RInvAsOf
- F4111 (the cardex detail behind the inventory numbers, kept so the figures
  stay defensible under audit)

Copied verbatim from V7, holding operator-set configuration that cannot be
regenerated from JDE:

- RCompanies (reconcile start date in `PeriodCutoff`, the fiscal calendar
  fields, `Threshold` for materiality, `AAIDocType`)
- RCompaniesLic (the licensed-company set)

Not copied, re-pulled from JDE:

- F0902 (GL balances). JDE reloads it nightly and it is authoritative there,
  so V8 pulls it fresh rather than carrying it.

### Schema compatibility (verified)

All seven copied tables are schema-identical between the V7 base (object
rev 178) and current V8. 110 columns were compared across the seven tables
with zero differences in name, type, length, precision, scale, or
nullability. Every V7 customer database is kept current at rev 178, so this
result holds for all customers, not just one sample. The copy is a straight
column-for-column move with no per-table or per-customer transform.

The tradeoff to keep in view: these seven tables are now migration
load-bearing. V8 keeps wide latitude to change its schema elsewhere, but any
change to one of these seven has to be matched by a transform in the
migration copy, or the straight-copy assumption breaks with no error. This
is worth a guard: a schema-drift check in CI, or a documented invariant in
the DB repo.

## Why the numbers survive V8's own processing

V8's perpetual model is baseline-anchored, so preservation follows from how
the tables already work:

- RInvAsOf carries a `bl` flag. `bl=1` rows are the beginning-balance anchor
  per item. `bl=0` rows are the period positions computed from it.
- RPerpetualInv stores the baseline directly in `baselineqoh`,
  `baselineaoh`, `baselineqic`, `baselineaic`, and `baselinevar`.
- `usp6_roll_item_from_baseline` computes each period as the baseline plus
  cumulative activity. A straight re-roll preserves the baseline and only
  recomputes forward. It changes `bl=1` only when explicitly told to, through
  the zero-beginning-balance or remove-variance options.
- `usp6_maint_clearcardex_from_date` clears cardex and transaction rows only
  from a given date forward, leaving earlier history in place.

Once V7's tables are imported, the `bl=1` baseline is the customer's reported
beginning balance, and V8 rolls forward from it. Recompute only ever touches
the forward roll. This is the same anchor the cardex sync page's "Adjust
Beginning Balance" writes.

## Operational guard

Two operations overwrite the carried baseline: a full database reset
(`reset_RapidReconciler_database 'F'`) and a re-roll that explicitly zeroes
the beginning balance. Both recompute `bl=1` from scratch. The migration
contract is that a migrated database only ever sees windowed, from-baseline
operations, and never a full reset. A partial reset (`'P'`) preserves
RCompanies and the baseline, so it is safe.

## Ongoing model after cutover

V8 holds the carried perpetual as its frozen base. New activity arrives
through F4111, and V8 rolls the perpetual forward from the baseline. It
reconciles that perpetual position against the nightly-fresh F0902. This is
RapidReconciler's normal job, perpetual against GL, now running on carried
numbers plus new activity.

## VALC orchestration

The Deployment Center install flow already does most of the mechanical work:
create the database, deploy the dacpac schema, provision rruser, deploy and
configure SSIS, register the database, and start the Services jar. A
migration is that flow with migration-specific steps added.

1. Detect and profile V7. Connect with the sysadmin credentials the install
   flow already collects, find the existing `RapidReconciler_Prod`, read its
   version marker, and show its companies, licensed set, and JDE
   configuration so the operator confirms the target.
2. Provision the V8 database (`RapidReconciler_Prod_V8`) through the existing
   install flow.
3. Carry forward configuration. V7 and V8 are on the same instance, so this
   is a cross-database copy run through VALC's execute-sql path. No SSIS is
   needed for the config tables.
4. Copy the seven preserve tables from V7 to V8 by SSIS, same instance,
   straight copy. This is the step that carries the reported numbers.
5. Parity report. Because the opening position was copied and not recomputed,
   it matches V7 by construction. The report confirms the copy was faithful
   rather than confirming that two recomputations happened to agree.
6. Cutover. Register and start the V8 Services jar, activate it, flip the
   client's ui_version from v7 to v8 to open the V8 areas, and leave V7
   read-only as a fallback until parity is accepted, then retire it.

Run it like the load board (`project_load_board_authoritative_state`): one
server-computed state per step, idempotent, resumable, recorded on the
activity spine. A migration is long-running and must not half-complete.

## Registration is a prerequisite

VALC 2.0 manages only what is in its registry. It has its own Postgres
store (clients, client_servers, client_databases), and every deploy,
Services-jar spawn, and licensing action keys off it. Existing V7
customers run on the legacy stack and are not in this registry, so each
one has to be registered before the migration wizard can act on it.
Registration is three layered rows: the client (the customer org), one or
more client_servers (a SQL host plus stored credentials), and the
client_databases row for the new RapidReconciler_<env>_V8. The wizard's
provision step creates and registers the V8 database; onboarding the
client and its server comes first.

Registration and data migration are separate concerns. Registration is
the control-plane setup that lets VALC drive the install and manage the
database afterward. The seven-table copy is a step inside that flow, not a
replacement for it.

Registering a customer does not expose them to V8 before they are ready.
The client card carries a ui_version switch (clients.ui_version, default
v7). While a client is v7 it stays out of the V8-only areas it does not
yet support; flipping it to v8 at cutover is what opens those surfaces. So
a customer can be registered and worked up well ahead of being fully on
V8, and the switch, not the registration, controls what they see.

### Minimum data to register

The V7 Postgres does not carry V8's topology (V8 adds licensing, SSO, a
JDE-source override, per-company password policy, and more), so
registration is not a straight import. The required inputs are small,
though. Only these columns are NOT NULL with no default:

- clients: name, license_start_date, license_end_date
- client_servers: client_id, label, host
- client_databases: client_id, display_name, db_address, db_username,
  db_password_encrypted, db_name (uuid is generated by the application)

Everything else has a default: port 1433, max memory 2048, server_role
SQL_SERVER, the feature tabs, AI level off, SSO off, ui_version v7, and so
on. So the human-supplied floor is a client name, the two license dates, a
server label and host, and the database's host, SQL login, password, and
name.

The legacy V7 data covers effectively all of the required fields. The RR
database supplies the customer name, host, SQL credentials, and database
name, and its rsystemvariables carries the license end date
(expirationdate) and license key directly. The license start date lives at
the V7 client-config level (the V7 client card tracks it, e.g. 11-17-2015
for RR Test Server), so both license dates come from V7 rather than being
invented at onboarding. Registration can therefore be sourced from V7 with
little or no manual entry at the minimum level. The V8-only enhancements
(SSO, JDE-source override, service_port, per-company password policy) are
the parts set fresh in the Deployment Center after registration.

## Open items

- Whether there is a separate AAIDocType table beyond the
  `RCompanies.AAIDocType` column, and if so whether it needs carrying.
- Whether the reconcile cutoff lives only in `RCompanies.PeriodCutoff`, or in
  a separate `v8_company_cutoff_pin` table that also has to be carried.
- Confirm the routine B to C path never re-establishes `bl=1` on a normal
  run. The baseline is preserved in the roll-from-baseline path; this checks
  that nothing in the standard nightly cycle resets it.
- Confirm RCompaniesLic is preserved on a partial reset. RCompanies is; its
  one-column sibling needs the same treatment, or the never-full-reset guard
  has a hole.
- V7 revision range. All customers are at rev 178 today, which is what makes
  the straight copy universal. If that stops being true, the copy needs
  per-revision handling.
- Testing is deferred. A test needs sanitized V7-shaped data, which is not
  available yet.
- Onboarding approach depends on customer count. A handful can be
  registered by hand through the Deployment Center during each migration.
  A large set is worth a bulk-onboard that seeds clients / client_servers /
  db_name and the license window from the legacy client config, leaving
  only the V8-only fields to fill in per customer.
- The bulk-onboard depends on access to the production legacy
  control-plane Postgres (the rrvalc database that backs the current client
  cards). It is co-located on the production VALC server and is not
  reachable from the V8 dev network (different subnet), so the extract has
  to run on that server or, more simply, arrive as a pg_dump of rrvalc
  restored onto a reachable host. This is an infra-access task for whoever
  administers the production box.
