# Reconcile window — "last N periods" at bootstrap

**Status:** Design captured 2026-07-10. Owner confirmed the model. **Built +
wired 2026-07-10 (UNCOMMITTED).** DB resolver `usp8_resolve_period_cutoff`
(SSDT + applied to Demo1/Demo2) + per-company override column
`RCompanies.PeriodCutoffPinned`; setting stored in
`RSystemVariables.reconcile_last_n_periods`. VALC calls it at the start of a
date-bounded run (`DeploymentController.ssisRun` → `SsisDeployService
.resolvePeriodCutoff`), before the history horizon is derived; the wizard
control ("Reconcile from the last N periods", default 24) lives on the Step-5
Bootstrap card in `deployment.html`. The manual `restore_periodcutoff.sql`
step is **superseded** — the cutoff is now materialized from the client-level
N at load time (the file is kept as a scrub artifact, not deleted, and no
automated flow references it). Owner must rebuild VALC to activate the wiring.

## Why

`PeriodCutoff` sets where reconciliation starts — the beginning-balance
boundary each company rolls forward from. Today it is set by a manual
`UPDATE RCompanies` step (`_collation_work/restore_periodcutoff.sql`) that
runs *after* bootstrap and gets wiped on every reset. That step is easy to
forget and carries no record of its own value. On 2026-07-10 a Demo2 reset
left `RCompanies` empty and the original cutoff had to be re-derived from a
runbook table — exactly the failure a junior with no institutional memory
will hit on a real install.

Fix: ask the window once, at bootstrap, and materialize the cutoff as
`RCompanies` is built. The separate manual restore step goes away.

## Decisions (owner, 2026-07-10)

1. **Unit = fiscal periods**, not months. Periods are the real boundary;
   months are a leaky abstraction over 4-4-5 and 13/14-period calendars.
2. **Support the full JDE date-pattern range** — up to 14 periods (12
   regular + 13/14 adjustments) and 4-4-5 patterns.
3. **Default = last N periods** (a count), not an absolute date.
4. **Uniform across companies by default.** The window is one client-level
   answer applied to every company; a company added later inherits it with
   no human touch. A per-company override covers the ~0.1% exception.
5. **Adjustment periods (13/14) do not count toward N.** "Last 12" means
   twelve regular operating periods; 13/14 ride along as year-end
   adjustments, they are not counted as periods walked back.

## Model

**Source of truth is a client-level setting — `reconcile_last_n_periods`
(an integer N).** `RCompanies.PeriodCutoff` becomes a *derived* value a
resolver materializes from N. Storing the count (not a date) is what makes
uniformity and per-company correctness coexist:

- Companies that share a fiscal date pattern (the common case) resolve to
  the **same** cutoff date.
- A company on a different pattern resolves to **its own** correct date for
  the same N. Storing a single date instead would force it onto another
  company's boundary and break silently.

### Resolver

For each company, walk its date pattern **by period number**, not by
subtracting days (naive date math skips or double-counts 13/14, since
period 13 often shares December's date range):

1. Read the company's fiscal date-pattern code and current fiscal
   year/period from the source company constants (F0010).
2. Read that pattern's period-end boundaries (F0008).
3. Count back N **regular** periods from the current period (skip 13/14).
4. Set `PeriodCutoff` = the start date of the landing period.

This extends the logic bootstrap already runs — it currently resolves
"day-1-of-current-FY" per company, so it already reads F0010/F0008 at
bootstrap time. "Walk back N periods" is a generalization of that, not a
new data dependency.

> **Open — resolver's calendar source at bootstrap time.** Bootstrap runs
> before the data load, so RR's own `RFiscalCalendar` may not be populated
> yet. Confirm the resolver reads period boundaries from the **source**
> (jdesource F0008/F0010), the same place the current "day-1-of-current-FY"
> default reads them.

### Per-company override

Keep a per-company override flag on `RCompanies`. The resolver fills
`PeriodCutoff` from N **unless** a company is explicitly pinned, so
re-running bootstrap never clobbers a deliberate exception. This is the
0.1% escape hatch.

### New-company hook

When a company is licensed/added later, its `RCompanies` row is built by the
next bootstrap/reload. Run the resolver for it from the stored N at that
point → it lands on the same window automatically. No manual re-set.

## Wizard surface (junior-facing)

In the setup wizard's database/bootstrap step ([[manage-client-setup-wizard]]):

- One control: **"Reconcile from the last N periods."** Frame it as a
  reconciliation **start point**, not a data-volume dial — a finance junior
  should read it as an accounting choice, not a performance setting
  ([[feedback_v8_audience_finance_not_it]]).
- Show the **available range** (earliest GL period for the licensed
  companies) and offer **"all history."** Bound N by what actually exists so
  a junior can't pick 36 periods that trigger a multi-hour first B→C for
  data that isn't there ([[reference_btoc_first_run_hours]]).
- No per-company grid in the common path. Uniformity is the default; the
  override is an advanced escape, not a wizard step.

## Downstream — nothing else changes

- **FULL_LOAD** already computes `historyStart = MIN(PeriodCutoff) − 90`, so
  the load window follows from N automatically (the 90-day pre-roll for
  beginning balances stays). One answer drives both the cutoff and how far
  back the load reaches.
- **B→C** trims to the restored cutoff, as today.
- The manual `restore_periodcutoff.sql` step is **retired** — its value now
  lives in the client-level setting and is applied at build time.

## Open items

- **Adjustment-period counting** — confirmed: 13/14 excluded from the walk
  (decision 5). Implementation must count by pattern period number.
- **Changing N after go-live** — a customer picks 12, later wants 24. Needs
  a defined action: re-resolve `PeriodCutoff` + re-load history, or an
  "extend history" path. Out of scope for v1; note the limit in the wizard.
- **Company with no closed period yet** (brand-new company mid-first-year) —
  resolver should clamp to the earliest available period rather than walk
  past the start of data.
- **Resolver calendar source at bootstrap** — see the note under Resolver.

## Supersedes / relates

- Replaces the "X-periods demo window" stub in
  `demo-data-sanitization-na-tr.md` (the demo path becomes the same
  mechanism as the real install).
- Lands in [[manage-client-setup-wizard]] (UX) +
  `mini-valc-database-provisioning-production-ready.md` (bootstrap run).
- Practice/exit-strategy relevance: this removes a step only the owner knew
  to run ([[user_role_exit_strategy]]).

## CORRECTED BUILD 2026-07-11 (UNCOMMITTED) — F0902 anchor; SSIS flagged for the designer

The first cut anchored on **F0010 current FY** (wrong — can sit ahead of data) and ran
the resolver at FULL_LOAD (silently rewrote the cutoff). Replaced. New anchor = the
**GLOBAL latest non-zero AA-ledger period in SOURCE F0902**, walked back N regular
periods (13/14 excluded), uniform for non-pinned companies, set **at bootstrap**.

**Validated read-only vs jdesource_demo2.PRODDTA.F0902:** anchor = **FY2026 P3**
(all-zero GBFY=29 row excluded). **N=16 → FY2024 P12 → cutoff `2024-12-01`**;
N=24 → FY2024 P4 → `2024-04-01`. Demo2 has a single date pattern (`A`); F0008.cdfy 2-digit.

**DONE (VALC + DB, uncommitted; owner rebuilds VALC + restart):**
- `DeploymentController.ssisRun`: no load-time resolver; BOOTSTRAP calls `persistReconcileN`;
  horizon always derived (`resolveHistoryStart(dbId, null)`). Removed `aaStartDateGr` override
  field from `SsisRunRequest`.
- `SsisDeployService`: `resolvePeriodCutoff` → `persistReconcileN` (upserts
  `RSystemVariables.reconcile_last_n_periods` on the target DB; harmless until SSIS is wired).
  `resolveHistoryStart` unchanged (MIN(PeriodCutoff)−90).
- `deployment.html`: N default 24→**16**; N sent on **BOOTSTRAP** not FULL_LOAD; **History
  Start (Override) control removed** (+ its JS).
- DB: **deleted** the buggy `usp8_resolve_period_cutoff.sql` (F0010 anchor) + its `.sqlproj`
  Build Include. `v8_company_cutoff_pin` kept (pin exception; comment repointed to the SSIS
  resolution). No dev-DB object needed; the dead proc still sits on Demo1/Demo2, uncalled.

**FLAGGED — SSIS `.dtsx` (SSDT designer; ispac rebuild AFTER):** a query-text edit is NOT
possible — `qryBootstrapCompanies` is a static string (not an expression), the Bootstrap task
runs on the **RRLocal target** connection (not JDESource), and RR's `F0902` is empty at
bootstrap (only loaded in the gated-off GL container). So reaching the source anchor needs a
NEW source-connected component. Recommended:
1. **New Execute SQL Task "Read Reconcile Anchor" on the `JDESource` connection** (ResultSet =
   single row), on the edge `Merge RCompanies → (new) → Bootstrap`:
   `SELECT TOP 1 CAST(GBFY AS INT) AnchorFy, v.per AnchorPer FROM proddta.F0902 CROSS APPLY
   (VALUES (1,GBAN01),…,(14,GBAN14)) v(per,amt) WHERE RTRIM(GBLT)='AA' AND v.amt<>0
   ORDER BY GBFY DESC, v.per DESC;` → map to `User::anchorFy`, `User::anchorPer` (Int32).
2. **Bootstrap task stays on RRLocal**; add two ordinal params (`anchorFy`, `anchorPer`); keep
   the insert 13-positional but change the 3rd value from `ccdfyj` to a computed global cutoff:
   read `@n` from `RSystemVariables.reconcile_last_n_periods`, `@abs = @anchorFy*12+(@anchorPer-1)
   − (@n−1)`, land FY=`@abs/12` per=`(@abs%12)+1`, convert to a date via the **RR-side** `dbo.F0008`
   (populated by `Companies`) period-end cols `cddfyj/cdd01j..cdd11j`; pinned companies
   (`v8_company_cutoff_pin`) keep `ccdfyj`. Until this ships, bootstrap writes the old
   day-1-of-FY cutoff (safe fallback) and VALC harmlessly records N.

**Owner decisions (do NOT guess):** (a) **multi-pattern policy** — "one global date → all" is
unambiguous only when every company shares one date pattern (Demo2 = pattern A). For a client
with several fiscal calendars, decide: most-common pattern's calendar vs per-company resolve.
(b) **off-box JDE** — the anchor task must sit on `JDESource`; re-verify against a real off-box
customer topology before shipping.

**Rebuilds:** VALC now (Java + template); ispac only after the SSDT change; no DB deploy (removal-only).
