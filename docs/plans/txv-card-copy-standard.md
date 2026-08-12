# Transaction-variance card copy: the standard

## Where the standard lives

`Tools/txv-card-copy-standard.json` holds it. Headings, bullet caps, the word
limit, the banned phrases, the baseline. **This document carries no values.** It
explains the reasoning and points at the file, because a number written in two
places is a number that will disagree with itself.

`Tools/check_txv_cards.py` reads that file and enforces it. Run it with
`python Tools/check_txv_cards.py`.

## Why it is a file the gate reads, not a document

The format used to live in five places: the renderer, the AI prompt contract,
CLAUDE.md, two memory entries. On 2026-08-12 the headings were renamed and every
one of those had to be edited by hand. Two were missed, and one of them, the AI
prompt, would have had the model writing findings under headings the page does not
render. Nothing would have caught it.

So the gate cross-checks the derived files against the standard and fails naming
whichever drifted:

- the renderer must render every heading the standard defines
- the AI prompt contract must name them, and must not still name the retired ones

Change a value in the JSON and the gate tells you which file you forgot.

## What the gate enforces

Bullet caps per section, a word limit per bullet, and a denylist of method
phrases. All values are in the JSON with the reason each was chosen.

The denylist is the interesting one. Every phrase in it was live card copy,
removed because it explained how the tool decided rather than what is true.
"Exact class first, the `****` wildcard second" describes the lookup. "A
tolerance, not a rounding, because that column is a float" answers an objection a
new analyst will not raise. Neither changes the next move.

## What it cannot enforce

A gate can count words and match strings. It cannot tell a fact from a method
note, and that was the distinction that mattered most. The `humanRules` block in
the JSON lists what still needs a reader:

A bullet is a fact or an action. A panel says only what its own table proves. No
instruction to use a control already on screen. Scope appears once. No bullet
repeats an appended block.

A passing gate means the card is the right size. It does not mean the card is
good.

## The worked example

Sales DMAAI Net Zero, in `RRV8/config.js` under `SAC`. It went from about 210
words to 60:

```
What happened
- DMAAI 4220 (cost of goods) and 4240 (inventory) point to one account for this
  company, order type and GL class.
- Item ledger relieved inventory. GL nets to zero. The cost never reached cost of
  goods.

What to do
- Point DMAAI 4220 to cost of goods for this company, order type and GL class.
- Check the other order types sharing this DMAAI before calling it isolated. One
  with no shipments this period is still misconfigured.
```

Then the routing block, which carries the accounts. Two sections, two bullets
each, and the analyst can act after the first three lines.

**SAC is deliberately outside the baseline.** Any regression on it fails the
build.

## The backlog

The other 21 cards predate the standard and produce 123 warnings. They are
baselined so the gate can go green today while still failing anything new. That
is a debt, not an exemption. Remove a code from `formatBaseline.cards` when its
card is rewritten and the gate holds it to the standard from then on.

Work them in descending warning count. `MTO` and `CNJ` carry twelve each.

## Related

`docs/plans/txv-claim-assertion-audit.md` gates what a bullet may CLAIM: every
cited assertion must exist in the classifier. This standard gates what a bullet
may LOOK LIKE. A card passes both or neither ships.

`docs/plans/txv-deep-audit-protocol.md` is the audit protocol these cards are read
under.
