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

**And it has regressed.** The block above is what the card said when this
document was written. `RRV8/config.js` now carries a 26-word version of the
second bullet and a 37-word version of the second `What to do` bullet, both over
the 25-word limit, so the gate has been exiting 1 on `SAC` alone since before
2026-08-15. Not fixed here: trimming the `What to do` bullet costs the sentence
about order types that shipped nothing this period and so appear nowhere on the
card, which is the reason the DMAAIs tab is worth opening. That is a copy call
for the owner, not a gate call.

## What happened is the detection, and only the detection

Added 2026-08-15, after the owner read a detected card: *"The what happened
section on the card is too long. Don't tell me what worked. Only show the
issues."*

`checked` had been carrying two different kinds of line. One kind says what went
wrong. The other says what was screened, guarded against or excluded on the way
to this card — the document type, the precedence claim that ran first, how wide
the GL search went. Both were true, both cited assertions, and they rendered in
catalog order under one heading, so `ACCT` opened with six bullets of which two
were the finding and `MCM` led with a sentence ending "so the completion-gap
shape is ruled out".

The second kind now lives in `alsoChecked` and renders LAST, under **Also
checked**. Nothing was deleted: every bullet still cites its assertion and the
gate validates `alsoChecked` ids exactly as it validates `checked` ids. Total
cited entries across the catalog before and after: 87 either way.

Which array a bullet belongs in cannot be read off the manifest — an assertion
has a `proc` and a `statement` and no polarity — and it cannot be read off the
wording either, because "no GL completion was found for this work order" is the
detection on `CNJ` and a ruled-out check elsewhere. It is decided per card,
against what the proc's `@asserts` line actually tests.

**Triage cards keep a whole-card baseline.** `T-SALES`, `T-PURCH`, `T-MFG` and
`T-INV` have no identified cause, so their `checked` list is legitimately all
negative results — there is no detection to lead with. The renderer compresses
those to one line instead.

## The backlog

The other 21 cards predate the standard and produce 123 warnings. They are
baselined so the gate can go green today while still failing anything new. That
is a debt, not an exemption.

The baseline is **per field**, not per card: an entry is `{ card, fields }` and
`fields` names the sections still baselined. Anything not named is enforced.
That shape exists because `checked` was retired across all 17 detected cards on
2026-08-15 while the same cards' `found` / `fix` / `context` backlog was
untouched. Whole-card baselining could not express that, so retiring one rule
would have meant rewriting every section of every card first — which is how a
backlog becomes permanent. Drop a field name when its section is rewritten;
drop the whole entry when the card is done.

Work the rest in descending warning count. `MTO` and `CNJ` carry twelve each.

## Related

`docs/plans/txv-claim-assertion-audit.md` gates what a bullet may CLAIM: every
cited assertion must exist in the classifier. This standard gates what a bullet
may LOOK LIKE. A card passes both or neither ships.

`docs/plans/txv-deep-audit-protocol.md` is the audit protocol these cards are read
under.
