# Demo company archetypes (draft)

**Internal sales content. Held, never committed to the public UI repo.** Belongs
in the future private demo repo. Drafted from the live demo DBs on 2026-07-16
(verified, not from memory).

Purpose: the intro page a prospect (or Bud, from discovery) uses to pick the
demo company closest to their own operation, then branch into the role tours.

## Data provenance

Queried `RapidReconciler_Demo1/2/3` directly. Company names are already
sanitized (fictional). Cost method: 07 = standard, 02 = average / WAC.

| Demo | Companies | Currency | Cost method |
|------|-----------|----------|-------------|
| Demo1 | 80002 Summit Industrial, Inc.; 80008 Summit Industrial, Ltd. | USD + GBP | standard (07), a little average on the UK entity |
| Demo2 | 80003 Harbor Wholesale Supply; 80004 Crossroads Distribution; 80010 Nationwide Trading; 80013 Eastbrook Provisions; 80023 Grandview Distributors; 80041 Silverline Supply | all USD | all average (02) |
| Demo3 | 30001 Golden Harvest Foods Ltd. (GBP); 30002 Golden Harvest Foods USA Inc. (USD) | GBP + USD | mixed, mostly average, plus large transfer/in-transit volume |

## Archetype A — Summit Industrial (Demo1)

**The standard-cost manufacturer with an overseas entity.**

Pick this if: you make what you sell, you run standard costs, and you have a
second legal entity in another currency.

- Two entities under one business: a US parent and a UK company, USD and GBP.
- Standard cost almost everywhere.
- The cleanest of the three. Good for a first look, where the story is "here is
  how RR handles standard-cost variance and a second currency" without a lot of
  noise competing for attention.

## Archetype B — Harbor Wholesale group (Demo2)

**The multi-company distribution group.**

Pick this if: you run several distribution or wholesale companies on one JDE,
one currency, average cost, high SKU count and volume.

- Six companies, all USD, all average cost. Buy and resell, not manufacture.
- The story is scale: reconciling many companies at once, average-cost behavior,
  and company-by-company disposition. This is the "we have a lot to reconcile and
  not enough people" prospect.

## Archetype C — Golden Harvest Foods (Demo3)

**The intercompany, multi-currency operation that moves stock between entities.**

Pick this if: you transfer inventory between entities and currencies, you run
intercompany transfers, and reconciliation is genuinely hard today.

- A UK parent (GBP) and a US subsidiary (USD), food, mixed costing.
- The messiest data of the three on purpose: intercompany transfers, in-transit
  inventory, mixed cost methods. This is the "if RR can handle this, it can
  handle us" archetype, and where the transfer-integrity and multi-currency
  strengths show best.

## Notes for the tour design

- The archetype is only the front door. Each one branches into the same three
  role tours (analyst, accountant, admin); what differs is the data the prospect
  is looking at and one or two archetype-specific talking points (dual-currency
  for A, many-companies for B, transfers for C).
- Verify the "XX / blank" cost-method rows in Demo3 before they show on screen.
  They are a large slice and may read as messy to a prospect; decide whether they
  are legitimate in-transit/non-stock or a sanitization leftover to clean.
- Owner is the SME on the pitch language; the structural facts above are verified,
  the framing is a first draft.
