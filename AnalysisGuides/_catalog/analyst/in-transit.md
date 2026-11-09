# IN TRANSIT — accountant and analyst brain, in-transit grounding (single-source catalog)

**Roles:** both lanes of `RRV8/transit.html`. The accountant (Overview, Accounts, On Hand, Audit Center) signs off
the period and books the closing entry. The analyst (Data Health, Transaction Variance, Orders) finds the cause,
triages and excludes orders, and fixes the source so it does not recur; the analyst posts no journal entries. The
file sits under `analyst/` because the generator keys catalogs by topic, and most of the policy here is the
analyst's. Move it if an `accountant/` folder appears first.

**Status:** DRAFT, not yet wired. Intended source of truth for a new `window.RRV8.TRANSIT_GROUNDING`. Nothing reads
it until the wiring below lands. Edit the fence here and re-run the generator; never hand-edit the catalog inside
`config.js`.

**Altitude:** policy the AI reasons from: what each roll-forward component means, who acts on it, and how it is
cleared or prevented. Not a doc dump. The long-form references stay the three RR University guides
(`RRUniversity/transfer-order-reconcile.html`, `transfer-order-reference.html`, `transfer-order-exclusion-guide.html`),
and this catalog has to agree with them. Generic DMAAI routing for transfers (which AAI carries in transit at cost
vs. cost plus, 4320 on the receipt) is NOT here: the server prepends it to every `/api/v1/ai/explain` call. The 4335
bullet stays because it is transfer policy (no single setting clears every case), which the server text does not say.

## Inherits from `_core.md` (recommended tags)

- **INV-1** (variance is always a difference). An immaterial exclusion left unjournaled is still a variance,
  explained. Add `topic:transit` to its `Applies:` line.
- **INV-2** (natural sign, no silent flips). This is the In Transit sign rule in general form; the fence states
  the module-specific half (stored signs, no Inventory `transactions` flip). Add `topic:transit`.
- **INV-3** (DMAAI routing is server-side). This is why the fence names no ship-side or receipt-side AAI. Add
  `topic:transit`.
- **INV-4** (RR is a utility, JDE is the book of record). The KB says the same thing in its own words: RR is
  read-only and every correction is made in JDE. Add `topic:transit`.
- **INV-5** ("current" = two most recent loaded periods). Arrives through `all`; no change needed.

Tag by topic rather than leaning on `ROLE_OF`. The page serves both roles, and `ROLE_OF` takes one, so a
`role:analyst` match would be an accident of where the file lives. Update the token list at the top of `_core.md`
(it currently names four analyst catalogs) when the tag is added.

## Generator wiring needed (not done here)

1. `GENERATE = ("ADMIN", "CARDEX", "ANALYST", "TRANSIT")`.
2. `SOURCES["TRANSIT"] = ["AnalysisGuides/_catalog/analyst/in-transit.md"]`.
3. Optional: `ROLE_OF["TRANSIT"]`. Absent, `ROLE_OF.get` returns `""` and only `all` plus `topic:transit` compose
   in, which is the intent above.
4. **Seed the assignment by hand once.** `rewrite_block()` regenerates only assignments that already exist inside
   the marker block; it never appends a missing one. Add
   `window.RRV8.TRANSIT_GROUNDING = [].join('\n');` inside the block first, or the generator skips TRANSIT, prints
   success, and `--check` stays green.
5. Update the generator's docstring ("six catalogs") and its header list.
6. A consumer. **Done:** `transit.html`'s question prompt (`itPrompt`) leads with this page's GLOSSARY entries for
   the view (`RRV8.glossaryFor('transit', view)`, UI-240, 2026-11-09), then `TRANSIT_GROUNDING`; the analyst day
   brief prepends `TRANSIT_GROUNDING`. `Tools/test-transit-ai.js` groups P and G pin both.

## Provenance

Distilled 2026-11-05 from the three RR University guides, cross-checked against
`docs/plans/in-transit-module.md`, `RRV8/API.md` § In Transit, and the header, `QUICK`, `REPORTS` and column
definitions in `RRV8/transit.html`. Three facts the KB does not state were read from the DB code (worktree
`_wt/dac-90-db`) rather than inferred:

- Transaction variance is `ledger − in transit` (`v6_transit_reconcile`: `sum(LedgerAmount) - sum(TransitAmount)`).
- Roll status values are `baseline`, `yes`, `no` and `end`; `end` marks the latest calendar period, which the roll
  checks skip (`usp6_009a_in_transit`).
- The closed-PO receipt status is the lowest next status across the order's lines for that item
  (`v8_transit_item_activity`), which matches the KB's "lowest next status on any line is 999".

## Open questions for the owner (sources disagree; the fence states only what they share)

1. **Which AAI defines "the in-transit account."** The KB reconcile guide puts the clearing account
   "typically via DMAAI 4220 or 4245". `ANALYST_GROUNDING` in `config.js` says "the 4220 / 4245 in-transit
   clearing account". `transit.html` (GL classes report) says "no in-transit AAI (4320 / 4322) covers", and
   `v6_transit_accounts` resolves accounts from 4320/4322. VALC's prompt has 4245 "repurposed to Inventory In-Transit"
   on a cost-plus ST, and lists 4320 generally as received-not-vouchered. These are compatible only if every
   install points both sides at one account. **4322 appears in no KB guide and not in VALC's reference.** The fence
   names no table.
   - **Owner, 2026-11-05: "4220/4245 (the KB)".** Measured the same day, before encoding it, in RapidReconciler-DB
     `bb29559`: `v6_transit_accounts.sql:44` selects the in-transit accounts with `TableNumber in ('4320','4322')`
     (DAC-88). The two Data Health reports read the same rows. 4245 is used only to choose cost-plus pricing
     (`v8_transit_item_activity.sql:112`), and `v6_transit_cost_variances.sql:142` notes that V7 also "took any 4320
     account". A fence bullet saying the account IS 4220/4245 would contradict RR's own In-transit accounts report.
   - **RESOLVED, owner 2026-11-05: "Ground both sides".** The fence's THE IN-TRANSIT ACCOUNT bullet: the ship side
     posts through 4220/4245 (the KB's wording), the receipt clears through 4320/4322 (what the DB views and V7
     read), and both should be one account, with a mismatch being a set-up fault. The views are unchanged. Not
     verified against a live JDE: that both sides normally hit one account is the owner's ruling, not a measurement.
2. **GL classes not in the model: which table.** KB Report 2 says "Add missing GL class codes to the transit DMAAI
   table 4310". V8's report (`v_integrity_trans_exc_glc`) tests 4320/4322. The existing `RRV8.GLOSSARY` entry
   EXCLUDED GL CLASS means "no 4152 entry". Three tables for one phrase.
3. **The "model" report.** KB Report 1, Model AAI Table: "DMAAI 4152 entries for transfer order GL account
   assignment". V8's In-transit accounts report (`v_integrity_trans_base`) is the expanded 4320/4322 rows.
4. **Unposted GL batches in the out of balance.** The KB says of the variance lines that "The sum of all lines
   equals the Out of Balance amount", and GL Batches is one of them. The identity in API.md, `transit.html` and the
   proc has no batches term (`OOB = BegVar - EndofDay + Exclusions + Variance + JEs`); unposted batches sit beside
   the GL roll. All agree batches must be posted before close, so the fence says only that.
5. **Does every exclusion need a journal entry.** The reconcile guide: "Exclude and post a JE for the dollar
   variance". The exclusion guide: "not every exclusion requires a journal entry", subject to a documented
   materiality threshold. The fence says the Exclusions line is the amount to journal and takes no side on
   materiality.
6. **Where the in-transit detail comes from.** KB (As-Of) says it is sourced from F4211/F4311 "not the item
   ledger (F4111)". The plan doc says `Transit_Item_Details` is "ship and receipt cardex", and the view header
   reads "Every transfer ship and receipt the cardex holds". The code reads `vcr_F42119` and `F4311` with a cardex
   join for the receipt date. The fence names no source table.
7. **Two out-of-balance figures, not proven equal.** The Journal Entry sheet computes `EndingGL − AmountOnHand`
   (`v6ui_transentry`). The roll forward computes the identity above. Not measured: whether they agree when end of
   day or unposted batches are non-zero. The fence ties the closing entry to the roll-forward OOB with both at zero.
8. **Integrity report count.** KB Step 7 says "Run the Four Integrity Reports"; its own reference table lists
   five (0 to 4); V8 shows five. Minor.
9. **Transaction tolerance.** The KB says documents under 1 monetary unit are hidden by default, adjustable by the
   administrator. V8's "Variances only" toggle hides under 0.005, and the proc clears documents under .01 with
   a hard-coded threshold. Minor; the fence says only that hiding a row changes no total.

The KB also describes V7 features V8 dropped by ruling (pie drill-down, PDF audit report, the End of Day "Suggested
Entry" popup). The fence does not mention them.

## RRV8.GLOSSARY entries for In Transit (added 2026-11-09)

**Owner ruling 2026-11-09: "Add all five."** They are in `RRV8.GLOSSARY` (`RRV8/config.js`), tagged `[ON=transit]`,
with `[VIEWS=analyst,accountant]` on 1, 2 and 5. The whole GLOSSARY still goes into every analyst prompt on Home,
Transactions and Cardex Variance, so those carry them too. In Transit's own prompt and help panel take only the
entries tagged for the page and view (`RRV8.glossaryFor`; `data-help-glossary="transit"`): the analyst sees all
five, the accountant 1, 2 and 5.

Bar from the GLOSSARY header: the term is on a screen AND would otherwise be got wrong. All five are on
`transit.html`. The list below is what was proposed; `config.js` holds the wording that shipped.

1. **ON HAND / IN TRANSIT (In Transit module):** stock shipped and not yet received at period end, net of excluded
   orders. It is not the cardex perpetual that Inventory's On Hand means. Both views.
2. **BEG VAR (beginning variance):** the out of balance brought in from the prior period (V7: Carry Forward). It
   sits next to Beg GL and is easily read as a GL opening balance. Both views.
3. **GL CLASSES NOT IN THE MODEL (In Transit Data Health):** no in-transit AAI covers the class. It is NOT the
   4152 Model DMAAI that the existing MODEL DMAAI TABLE and EXCLUDED GL CLASS entries define. This one collides
   directly with GLOSSARY as it stands. Analyst.
4. **EXCL VAR QTY / EXCL VAR AMOUNT (Orders):** activity on an order after it was excluded; non-zero means
   unexclude and re-exclude. Not a reconciliation variance. Analyst.
5. **TXN VARIANCE (In Transit):** per transfer document, ledger − in transit. It is not F4111 against F0911, which
   is what `ANALYST_GROUNDING` defines transaction variance as. Both views.

The lines inside the fence are lifted exactly as written. No blank lines; keep every line a single grounding bullet.

```grounding
IN TRANSIT POLICY (transfer-order in-transit reconciliation, accountant and analyst) — reason from these rules:
- SCOPE: In Transit reconciles the in-transit GL account(s) against goods shipped on a transfer (ST/OT) and not yet received. It is its own module with its own data. Do not carry Inventory's rules across: no cardex variance, no on-hand perpetual, no transactions sign flip.
- ORDER PAIR: one ST, its related OT and one item make one row. In transit = shipped − received, in BOTH quantity and amount, and a pair is clear only when both are zero. The GL holds dollars only, so quantity is the check the GL cannot give.
- THE IN-TRANSIT ACCOUNT has two sides: the shipment (ST) posts to it through the shipping AAIs 4220/4245, and the receipt (OT) clears it through the receipt AAIs 4320/4322. Set up correctly, both sides point at the same account. RR finds the in-transit accounts from the receipt AAIs, as V7 did. An account the shipping side posts to that the receipt side never clears, or the reverse, is a set-up fault for the analyst to fix in the AAIs, not a journal entry.
- OUT OF BALANCE is GL − in transit, per company, in-transit account and period. Positive means the GL carries more than what is in transit; negative means less.
- ON HAND on this page is stock shipped and not yet received at period end, net of excluded orders. It is the figure the roll forward compares with the GL, and it is not the cardex perpetual.
- THE ROLL FORWARD, in the signs the data stores: OOB = BegVar − EndofDay + Exclusions + Variance + JEs on every row. Read each component in that sign. Do not apply Inventory's transactions flip, and never re-sign a figure to make it tie.
- BEGINNING VARIANCE (V7: Carry Forward) is the out of balance brought in from the prior period. On a Baseline row, the first loaded period, it is the opening gap (End GL − in transit) and exclusions do not count. Explain it in the prior period; if that period is closed it goes into the current closing entry with a documented reason.
- UNPOSTED GL BATCHES are transfer entries in F0911 not yet posted to the in-transit account. They sit beside the GL roll, not in the identity above. Finance posts them before close; they are never cleared with a journal entry.
- END OF DAY is ship-confirmed transfer lines that Sales Update has not processed: in transit holds them, the GL does not, and they have no batch or GL date yet. It must be zero before close. The fix is the transfer version of R42800 (A/R interface off) running to completion, never a journal entry.
- EXCLUSIONS is the in-transit balance of order pairs the analyst excluded on Orders, in the period each counts in. The line is the exact amount of the offsetting entry the accountant books in JDE; excluding a pair changes nothing in JDE.
- TRANSACTION VARIANCE is per transfer document (order, document, batch): ledger amount − in-transit amount, so positive means the GL booked more than the transfer moved. Test account or DMAAI mismatch first, then period mismatch, then amount. Each is cleared by an offsetting entry plus a note; marking a document Worked, noting it, or hiding small rows changes no total.
- MANUAL JEs are entries posted straight to the in-transit account outside transfer processing. They count in the out of balance, never in transaction variance, and the closing entry shows up here after the next refresh.
- THE CLOSING ENTRY: once unposted batches and end of day are zero, one combined entry per account equal to its out of balance (beginning variance + exclusions + transaction variance, plus any JEs already in the period) clears it. Credit the in-transit account for a positive out of balance, debit it for a negative, offset per the company's policy. After the next refresh it lands in JEs and out of balance reads zero; a residual means a component moved.
- OFFSET BY CAUSE, decided with the controller: goods lost or damaged go to shrink or loss expense; a closed pair short on quantity goes to inventory variance; an ST/OT cost or price mismatch goes to a cost or purchase-price variance. Every entry names the ST and OT numbers, item, quantity and reason.
- ROLL-FORWARD CHECKS, per account and period: GL roll (GLOK) Yes means beginning GL equals the prior period's ending GL. Var roll (VarOK) Yes means beginning variance equals the prior period's out of balance. No is a break between the two periods: settle the prior period before booking anything in this one. Baseline is the first loaded period, with nothing to roll from. End (shown as Open period) is the latest period, not yet checked.
- ORDERS IS NOW: the Orders tab shows every pair in transit or excluded as of today, whatever period is picked. On Hand and the roll forward are as of the period end. Never compare an Orders total with a past period.
- QUICK FILTER, RECEIPTS WITHOUT SHIPMENTS (received, nothing shipped): an old receipt usually predates the data's start date and is excluded; a recent one is a missing or late ship confirm or Sales Update at the shipping branch. Fix it by ship-confirming and sales-updating the ST so both sides net. Prevent it by blocking receipt until the ST has shipped (receipt routing or a status check).
- QUICK FILTER, IN TRANSIT ON A CLOSED PO (receipt status 999 with quantity still in transit): shipped and received disagree and the OT can take nothing more. Usual causes are a short receipt closed out, goods lost or damaged, or units received against another order. Investigate with the warehouse; once JDE cannot clear it, exclude it and journal by cause. Prevent it by restricting P4312's close-remaining option and training receivers to split a receipt across open OTs for the same item.
- QUICK FILTER, ZERO QUANTITY IN TRANSIT (quantity ties, amount does not): the goods moved but the dollars did not match, which is a ship-vs-receipt cost difference. It never clears on its own. Exclude it so the amount moves to Exclusions for the entry, and fix the cost at the source.
- EXCLUDE ONLY AFTER INVESTIGATING: exclude a pair when JDE can no longer correct it, typically both ST and OT at status 999. An unjustified exclusion hides a missing transaction or an AAI fault. Excluding stops RR counting the pair and posts nothing.
- EXCLUSION VARIANCE: ExclVarQty or ExclVarAmt not zero means new activity hit a pair after it was excluded, usually an open OT taking another receipt. Unexclude and re-exclude to recalculate it, then the accountant reverses and re-books the entry for the new net amount. Never leave one non-zero at sign-off.
- RECALCULATE BALANCE after excluding or including: make all the exclusions first, then recalculate once, so on hand, exclusions and out of balance reflect them now. It reads nothing new from JDE; entries posted in JDE still wait for the next scheduled refresh.
- DATA HEALTH, SHIP VS RECEIPT COST: pairs whose receipt cost differs from what shipped. They will not clear on receipt and are the most common stuck balance. Prevent them at the source: keep the OT cost equal to the ST cost (at cost) or price (cost plus), keep branch standard costs in step, run cost rolls when little is in transit, and edit STs only in the transfer order-entry version.
- 4335 CANNOT CLEAR EVERY CASE: pointed at in transit it absorbs cost-roll timing, pointed at PPV it absorbs branch-cost differences and markup. A cost roll combined with a branch difference, or an OT cost that differs from the ST price, leaves a residual whichever way it is set. Set it for the dominant case, document the choice, and expect the rest to need entries.
- DATA HEALTH, GL CLASSES NOT IN THE MODEL: transfer lines whose GL class no in-transit AAI covers. RR cannot give them an account, so their value sits outside the reconciliation entirely. Judge them by the amount they hold; fix by adding the class to the transfer AAI set-up in JDE.
- DATA HEALTH, IN-TRANSIT ACCOUNTS: the accounts RR reconciles as in transit, resolved from the transfer AAIs. Every figure on the page depends on this list, and a missing account means part of the balance is not reconciled. The expense offset for non-stock transfer receipts is deliberately not an in-transit account.
- DATA HEALTH, TRANSFER AAIs: the JDE AAI rows a transfer posts through, by document type and GL class. Read them when a transaction variance or a missing GL class points at set-up.
- DATA HEALTH, EXCLUDED ORDERS: every exclusion and the period it counts in. Each needs a documented reason and its entry; this list is the audit trail behind the Exclusions line.
- ONE COMPANY AT A TIME: companies carry different currencies, so never add or compare amounts across companies. Overview shows each company in its own currency.
- ANALYST: finds the cause in JDE, triages Orders, excludes and re-excludes, recalculates, notes each transaction variance, and fixes set-up and process so it does not recur. The analyst posts no journal entries.
- ACCOUNTANT: confirms unposted batches and end of day are zero, books the combined closing entry in JDE, confirms out of balance reads zero after the refresh, keeps the audit report, and signs off the period.
- Audience is JDE fluent: ST/OT, F0911, R42800, P4312, AAI, status 999 and GL class are fine as written; no SQL or plumbing terms.
```
