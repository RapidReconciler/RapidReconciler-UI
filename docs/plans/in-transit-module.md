# In Transit module for V8

Owner ask, 2026-10-26: build the In Transit module with an analyst and an accountant view. Admin is unchanged.
Owner picks the same day ("Use your picks"), recorded under [Rulings](#rulings). Worklist rows: DAC-88, UI-239,
UI-240 (chunk `in-transit`), VLC-212 (chunk `module-rights`), HK-49 (chunk `worklist-module-filter`). All five sit
under the worklist's "6. In Transit module" group, and VALC's Development page filters to them (HK-49).

## Rulings

1. Per-user module checkboxes, per database: Inventory, In Transit, RNV. They replace the role's module flags.
   Each assignment is backfilled from the user's current role, so nobody's access changes on deploy. RNV is greyed
   "Coming soon". Shown in VALC's user rights dialog and on V8's customer admin page (VLC-212).
2. In Transit uses the same company list as Inventory for each user. V7 kept a separate list per module.
3. Orders and exclusions belong to the analyst view. The exclude button and recalc need the existing `ite`
   permission, checked on the server.
4. Dropped from V7: the pie drill-down (V8's post-deploy drops its proc), the PDF audit report (V8 exports are
   Excel, built in the browser), and End of Day's "RR Suggested Entry" link (broken in V7: no in-transit endpoint).
   The Excel audit report stays.
5. Screens are this build's design call (owner: "you can design the screens"). Home stays the Inventory module;
   In Transit gets its own landing page, reached from Home's module pill.
6. Owner, 2026-10-27: Demo1's `9999842.512498` is the transfer's offset account, not an in-transit account. The 4320
   AAI sends non-stock transfer lines (order type `ON`) to it, because JDE routes a non-stock receipt to an expense
   account. `v6_transit_accounts` now drops any account whose transfer lines are mostly non-stock (DAC-88).

## What exists today (measured 2026-10-26)

**Data.** `UserTabNames 'in transit'` was 0 on Demo1, Demo2 and Demo3, and every `Transit_*` table held 0 rows.
The owner turned In Transit on in VALC Client Details on 2026-10-26; all three now read 1. Demo1 is the only
database with transfer orders: 68,534 `F4311` lines with `pdps01 = 1` and 4 `Transit_Accounts`. Demo2 and Demo3
have no transfer lines.

**Database.** `usp6_009a_in_transit` (called by `usp6_001_run_b_to_c` when the tab is enabled) builds the whole
reconciliation:

| Table | Grain | Filled from |
|---|---|---|
| `Transit_Accounts` | company, short account | `v6_transit_accounts`: AAI tables 4320/4322, limited to doc types and GL classes on transfer POs |
| `Transit_Item_Details` | account, period, order line, doc | `v6_transit_item_details` (ship and receipt cardex) |
| `Transit_GL_Details` / `Transit_GL_Balance` | JE line / account-period | F0911 on the transit accounts |
| `Transit_Item_Balance` | account, item, lot, UOM | current in-transit quantity and amount, net of exclusions |
| `Transit_Orders` | order, item, lot, branches | `v6_transit_order_balance`: ship vs. receipt per order |
| `Transit_Compare` / `Transit_Compare2` | batch, doc, order | transit amount vs. ledger amount; feeds Transaction Variance |
| `Transit_Summary` | company, account, period | the roll-forward the UI reads |
| `Transit_Excluded_Orders` | order line | user exclusions (V7 Orders screen) |

The out-of-balance identity, from the proc:

    OOB = (BeginningBalance + TransitAmount − AmountOnHand) − EndOfDay + Exclusions + TransactionVariance + JournalEntries

On a baseline period, `EndingGLBalance − AmountOnHand` stands in for the first bracket and Exclusions drops out.
`AmountOnHand` is `v6ui_transasof`: `Transit_Item_Balance` rolled back through `Transit_Item_Details`, with
excluded orders added back. Inventory's on hand is the cardex perpetual, so In Transit's comes from somewhere else:
it is what has shipped and not yet been received.

**Agent.** No In Transit endpoints. The V7 source to port is in `RapidReconciler-V7-Services`.

**V8.** No In Transit pages. The analyst/accountant split lives in `RRV8/home.html` as a role lens; the
`inventory-*.html` pages are role-agnostic drill-ins. Home's module pill already lists In Transit as "Coming soon"
(`_homeModules`, `live: false`).

**Rights.** Client-level module checkboxes exist on VALC Client Details and also drive SSIS and `UserTabNames`. Per
user, module access is the role's `tab_*` flags (since VALC V32/V33). The token's `t` claim comes from the role
alone, and nothing on the server reads `t` or `m`.

## V7 defects not to copy

- Company authorization only on `/in-transit/reconciliation`, `/reconciliation-filtered` and `/status`. Every other
  endpoint, export and write took companies from the request.
- No server-side check that the user had the In Transit tab at all.
- The exclude permission (`aite`) was enforced only in the browser, so any token could exclude orders or recalc.
- `usp6transasof` has its company filter commented out: asked for one company on Demo1, it returned 2,541 rows of
  another. (Its trailing `and (...)` was thought to break the bare call; it lands in the join's ON clause and parses.)
- The Journal Entry export drops the company filter (`usp6transfilteredview`).
- Every account the 4320/4322 AAI reaches counted as in transit, the expense offset for non-stock receipts included.
- Transaction notes went to the inventory note table (`RCardexLedgerCompare2WorkNote`), plus a `TransitWorkNote`
  copy that nothing reads.
- The screen (`transsummary`) flips the sign of unposted batches and end of day; the audit report and Roll Forward
  export (`v6ui_transfullsummary`) do not.
- Bulk exclude re-ran a 10-minute grid cache and fell back to the default filter (every allowed company) on a miss.
- Recalc errors were swallowed.
- `Transit_Excluded_Orders.note` is `NCHAR(100)`; the V7 textarea had no limit.

## Phases

**0. Data (DAC-88).** Run the in-transit load on Demo1 and check `GLRollOK` and `OOBRollOK` per account and
period. If V7's numbers do not tie out on Demo1, that is found before any UI exists.

**1. Database (DAC-88). Built 2026-10-27, not committed.**
- `v6_transit_accounts` drops the expense offset and the unresolved-AAI placeholders, and set-up keeps
  `Transit_Accounts` in step with it.
- The transit dispatcher (`usp6transfilteredview` and 15 wrappers) is retired, as the inventory one was. V8 reads
  views, scoped by `CompanyNumber` in the Agent, and the dispatcher's Journal Entry and notes defects go with it.
- New views: `v8ui_transit_transactions` (notes from `TransitWorkNote`), `v_integrity_trans_aais`,
  `v_integrity_trans_base` and `v_integrity_trans_exc_glc`. With `v6_transit_excluded_details` and
  `v6_transit_cost_variances` (now limited to `Transit_Accounts`), that is the five-report catalog. The whitelist is
  Agent code (Phase 2).
- `usp6transasof` honours its company list.
- Sign: V8 shows `v6ui_transfullsummary`'s stored signs, as Inventory shows `v6ui_raccountsummary`'s. Every row
  satisfies OOB = BegVar − EndofDay + Exclusions + Variance + JEs.
- Gated by `tests/dac88-transit-offset-account.sql` and `tests/dac88-transit-views.sql`. The dacpac publishes at the
  SQL 2019 floor. Deploys through VALC.
- **DAC-90 (built 2026-11-03): the baseline carries stock in transit.** `v6_transit_item_details` kept only periods
  ending on or after cutoff − 1, and the baseline on hand is `Transit_Item_Balance` rolled back through those same
  rows, so it was 0 by construction and every account opened out by its whole GL balance. The body moved to
  `v8_transit_item_activity` (no period filter); the details view is the window as before plus an **opening layer**:
  the older rows of order lines still in transit when the window opens (net quantity > 0), dated at cutoff − 1.
  Closed lines, receipts with no shipment in the cardex, and placeholder accounts stay out. Baseline-dated rows reach
  on hand and Orders only (compare keeps `periodends > PeriodCutoff`; end of day joins `RFiscalCalendar`). On Demo1,
  80002 opens at 0.00 instead of 61,520.64, and the same rule over V7's history at that date ties its GL to the cent.
  Gated by `tests/dac90-transit-opening-on-hand.sql`.

**2. Agent (UI-239).** `/in-transit/*`, each with a spec in `specs/` and an API.md entry first:

| Endpoint | V7 source | SQL |
|---|---|---|
| `GET in-transit/status` | StatusController | validation (`usp6returnvalidationstatustran`) + filter universe (`v6ui_transbusinessunits`, `v6ui_transobjects`, `v6ui_transsubs`) |
| `POST in-transit/reconciliation/rows`, `/history` | ReconciliationController | `v6ui_transfullsummary` (stored signs), `v6ui_transentry` (Journal Entry) |
| `POST in-transit/variance-component` | ReconciliationReportsController | `v6ui_transbatches`, `v6ui_transendofday`, `v6_transit_excluded_details`, `v6ui_transjes` |
| `POST in-transit/transactions`, `/details`, `/save-notes` | TransactionsController | `v8ui_transit_transactions`, `usp6transcompare2`, writes `TransitWorkNote` |
| `POST in-transit/as-of`, `/details` | AsOfController | `usp6transasof`, `usp6transitemroll` |
| `POST in-transit/orders`, `/exclusions`, `/recalc` | OrdersController | `v6ui_transorders`, `Transit_Excluded_Orders`, `usp6_transit_recalc` |
| `POST in-transit/integrity` | IntegrityController | the five transit reports |

Every endpoint checks the user's company list and module access (`t.it` and `m.it`); exclusions and recalc also
check `ite`. Bulk exclude takes explicit row keys. Recalc reports its failure.

**3. Rights (VLC-212).** Flyway V102; nullable `Boolean` module fields on the assignment (V8's `extractAssignment`
sends none, so a primitive `false` would revoke every grant on the first save); `t` built from the assignment; the
Agent parses `t` and `m`. Check v359 first. Update the Agent Documentation pair and Using VALC in the same commit.

**4. V8 pages (UI-240).**

| View | Tabs |
|---|---|
| Accountant | Overview (out of balance by company and period), Accounts, On Hand (`v6ui_transasof`), Audit Center (Excel audit report) |
| Analyst | Data Health (roll-forward checks, transit AAIs, GL class not in the model, ship vs. receipt cost), Transaction Variance, Orders (V7's columns, totals and quick filters, exclusions, and Recalculate balance above the grid since 2026-11-05) |

Drill-ins: `transit-transactions.html`, `transit-asof.html`, `transit-orders.html`. Orders keeps V7's three quick
filters: receipts without shipments, items in transit on a closed PO, and zero quantity in transit. Then Home's
module pill goes live for In Transit (one line in `_homeModules`), RNV stays "Coming soon", and the glossary, AI
docs, `RR_TEST_AGENT_AREAS`, API.md, GRID-STANDARDS coverage and tests follow.

**Slice 1, built 2026-11-03: `RRV8/transit.html`, the landing page.** Both lenses, all eight tabs, on the live
endpoints; `'in-transit/'` in `RR_TEST_AGENT_PREFIXES`; API.md and GRID-STANDARDS updated;
`Tools/test-transit-page.js` pins the module gate (t.it AND m.it, fail closed), the routing, the three quick filters,
the exclusion key's bound shape and the `perms.ite` gate, each with a mutation arm. One company at a time, because
companies carry different currencies.
**The pill went live 2026-11-05, ahead of the drill-ins (owner: "Turn it on now").** `_homeModules` lists In Transit
with `href: 'transit.html'`, so a user licensed and granted In Transit picks it from Home's module menu; anyone else
still gets no row at all. `test-module-pill.js` pins it (enabled, no Coming soon tag, its href a real page); PO
Receipts stays "Coming soon". Until the drill-ins land, the landing page is the whole module.
**Orders brought to V7, built 2026-11-05 (owner: "It should have the same functionality as V7 orders page. Make it a
tab on the analyst view").** Every column V7's grid showed: `v6ui_transorders`, measured on Demo1, minus `OrderMonth`.
That adds both companies, last ship and receipt dates, both UOMs, currencies and rate, short and third item, and
`ExclQty` / `ExclAmt` / `ExclVarQty` / `ExclVarAmt`. Totals of the rows shown sit in the grid header: in transit,
excluded, and any activity on excluded orders. **Recalculate balance** sits above the grid, where V7 put it, and only
for `perms.ite`. The Tools tab held nothing else and is gone. The analyst tabs are Data Health, Transaction
Variance, Orders. `test-transit-page.js` F1-F5 pin it, each with a mutation arm. So `transit-orders.html` is no
longer needed: the tab is V7's page.

**Slice 2, built 2026-11-05: In Transit in Home's frame (owner 2026-11-05).** "The accountant and analyst pages should be
separate and formatted as close to the inventory pages as possible. The expectation is that a user switching between
the modules sees very little difference in the screens. The data is the big difference." Inventory's two views are
`home.html` itself: `body[data-view-role]`, the role switcher `#haRoles` in the bottom-right `#homeActions` cluster,
`#subNav` tabs per role (`SUBVIEWS`), `#roleHero`, `#acctTop` (AI card), `#periodWidget`, and grids in the
`.acct-g-*` style. `transit.html` instead has its own top controls row and an Accountant/Analyst toggle (`#itLens`),
and uses admin-chrome.css. Design call (this build's, per ruling 5):
- **One page, Home's frame, not two hand-made pages.** `transit.html` takes Home's layout and mechanisms:
  `body[data-view-role]` with the same `rrv8.viewRole` key; the same switcher and cluster (role, companies,
  **Module: In Transit**, University, database); `#subNav` tabs (accountant: Overview, Accounts, On Hand, Audit
  Center; analyst: Data Health, Transaction Variance, Orders); the role hero; Home's grid styling. The lens toggle
  and the top controls row go. In the module picker, Inventory goes back to `home.html`.
- **Share the frame, do not copy it.** Home's frame CSS is inline (about 3,050 lines, 58-3112). Move the frame part
  into `RRV8/home-frame.css`, linked by both pages, so they cannot drift. Measure Home before and after with a
  headless screenshot per view, and require no difference.
- **Data stays In Transit's.** The `/in-transit/*` calls and renderers stay as built; only their containers change.
  Notes on Transaction Variance (`transit-transactions.html`) and the item roll (`transit-asof.html`) are still drill-ins.
- **Verify:** the owner switches Inventory → In Transit → Inventory as an analyst and as an accountant and sees the
  same frame. A user without the module gets no picker row and a 403 from the Agent.

**What slice 2 built.**
- **Stylesheet.** Home's whole inline `<style>` block (3,053 lines) moved byte for byte into `RRV8/home-frame.css`,
  linked at the block's old position. It is the whole block, not a "frame" subset: a split would put the rest at a
  second cascade position, and equal-specificity rules resolve by order. Measured with a headless harness (stubbed
  session, every off-origin request failed, `Date` frozen). Home was shot per role (admin, analyst, accountant) before
  and after, and every element's computed style was dumped. Result: 0 differing pixels and 0 differing computed
  styles on all three roles. The controls held: a reshoot of the unchanged page gave 0, and admin vs analyst gave
  739,107 px and 635 elements. Not covered: the data-bearing panels, which this harness renders empty.
- **Shared script.** `RRV8/home-frame.js` (`window.RRFrame`) holds the Module pill's catalog (`modules()`, Inventory
  now carries `href: 'home.html'`), its menu markup (`moduleMenuHtml`) and the RR University popover
  (`wireUniSearch`, moved verbatim from Home's `wire()`). Home's `_homeModules()` / `_moduleMenuHtml()` delegate to
  it. Home's `caps()` and `dbShortName()` stay in Home because their suites mutate those exact sources.
- **transit.html.** `body[data-view-role]` from `rrv8.viewRole`, clamped to the lanes held. A stored `admin` lands on
  the first lane and is not overwritten. Neither lane gives Home's `none` state. The page has Home's cluster
  (account, database, **Module: In Transit**, Company, View, RR University, the AI dock and the help button),
  `#subNav` tabs per view, `#roleHero` with the roll-forward pill in the freshness slot, and `#periodWidget`
  (click a bar to pick the period; hidden on Orders). The grids use Home's On Hand markup. The company is the
  Companies pill, single-select for both views. The lens toggle and the controls row are gone. The tab memory is
  `rrv8.itSubview`, apart from Home's `rrv8.subview`. The page now loads `sidebar.js` like Home, so it also gets
  the idle and expiry guard and the AI dock.
- **Tests.** `test-transit-page.js` G1-G5 (17 assertions, 10 new mutation arms, all red);
  `test-module-pill.js` gains In Transit's pill (5 checks, 3 arms); `test-uni-search.js` slices the shared file
  and requires both pages to call it; new `Tools/page-source.js` + `test-page-source.js`. Eight suites that read
  Home's inline `<style>` read it through `readPage()`, which throws if the link is gone. All 93 suites pass.
- **The bottom cluster's clearance is measured, not constant (follow-up, same day).** With every control
  showing, the cluster is 2 rows (107px) at 1440, 1280, 1024 and 900 wide, and 3 rows (153px) at 768. This holds
  on Home and on In Transit alike. The page's clearance below its content was a fixed 152px (.home-main 96 + .wrap
  56): enough at the four wider widths (overlap at the end of the scroll 0), 1px short at 768, and a fourth row
  would have covered content. `home-frame.js` now measures the cluster (on load, on resize, and whenever its own
  box resizes) and sets `--ha-clear`; `home-frame.css` pads `.home-main` by `max(96px, var(--ha-clear))`.
  - Gate: Home per role, and Home's analyst view with data at 1440/1280/1024: 0 pixels changed. At 768: only
    y 888 and below changed. That is the cluster (moved down with the 17px taller page) and the added space; the
    last content ends at y 875.
  - Control: two runs of the unchanged page differ by 0. With the clearance stripped, the probe reports 58-135px
    of overlap.
  - Tested by `Tools/test-cluster-clearance.js` (11 assertions, 8 arms).
  - The slice-2 note that "the AI switch covers content" at 1440 was wrong: it came from a viewport shot at the
    top of the page, where any fixed bar sits over content mid-scroll, on Home as well.
- **Exercised in headless Chrome** on fictional fixtures (companies 90001 USD / 90002 GBP): view switch through the
  cluster, tabs, module menu, a quick filter, a period bar, the company pill. A user without the module made zero
  `/in-transit/*` requests. Not exercised: the live Agent on Demo1.

**Still to build:** the two drill-ins, the glossary and AI-doc entries (they feed every analyst prompt), and the
live check on Demo1 as an analyst, an accountant and a user without the module.

**5. Verify.** On Demo1 as an analyst, an accountant, and a user without the module (no pill, and a 403 from the
Agent). Update the RR University transfer-order docs wherever V8 differs from V7.
