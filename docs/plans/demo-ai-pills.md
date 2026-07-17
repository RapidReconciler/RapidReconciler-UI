# AI suggested-question pills, per surface (draft for red-pen)

**What this is.** Each AI assistant on a surface shows a few suggested questions as
clickable pills. Clicking one stages the question and asks the assistant. The same
curated set does three jobs at once: it teaches a new user what is worth asking, it
is the demo's canned AI script, and it is the starter set a real customer sees.

**Why it is drafted this way.** The audience knows JDE and reconciliation. The pills
teach the tool, not the domain. They are phrased the way an analyst, accountant, or
admin would actually ask, not as prompts.

**Two constraints that ride with this.**
1. The pill text is the capture key. The AI request carries the prompt, and that
   becomes the replay signature, so a pill has to be settled before we capture its
   answer. Rewording a pill later means recapturing it.
2. We capture each pill's answer at every tier the demo shows (Basic / Enhanced /
   Full), so a presenter can flip tiers live and each pill still answers.

Red-pen freely: cut, reword, reorder, or tell me a surface needs a different angle.
The count per surface is a starting point, not a rule. Three to five reads well.
We settle the wording surface by surface as we walk the build, not all up front.
No spine pill: just the working questions on each surface.

---

## Administrator home

The admin is the customer's own person running the instance. These lean into that:
the console is theirs to run.

- What needs my attention right now?
- When does our license expire, and what is the renewal step?
- Who has not signed in lately, and should I remove them?
- Is the instance healthy, or is anything starting to degrade?
- What does the activity log tell me?

## Analyst home: Data Health

Validation and configuration checks. Is the foundation sound before the variance
numbers can be trusted.

- Is this company ready to reconcile, or is something upstream broken?
- Why is the account roll-forward off, and is it mine to fix?
- Which configuration checks are flagged, and do they actually matter?
- What has to be clean before I trust the variance numbers?

## Analyst: Transaction Variance

F4111 against F0911 per document, tied by account. Pattern first, then the move.

- What is driving the transaction variance this period?
- Which of these are duplicate sales versus a real gap?
- Is this one a source fix, or can I disposition it as timing?
- What pattern does RR see here, and what does it want me to do about it?

## Analyst: Cardex Variance

F4111 against on-hand, account-blind. Do the item's transactions add up.

- Do this item's transactions actually add up?
- Why is the perpetual off from the ledger for this item?
- Should I record this variance, or adjust the balances to sync?
- What happened to this item across the last few periods?

## Analyst: Account Roll-Forward (drill)

The "why is this account off" explainer. Grounded to the F0902 balance versus the
F0911 detail, with a next action.

- Why is this account off by this amount?
- Is this a repost in JDE, or something I re-roll in RR?
- What is the next action to clear it?

## Analyst: As-Of / Full Perpetual Details

- What is this item's position as of the close date?
- RR ties for this item but JDE shows it off. How do I align it?

## Analyst: Model review

The inventory-account (DMAAI) model. This is an analyst check, not the accountant's;
it also shows on the analyst Data Health tab as the "Model reviewed & approved" card.

- Is the inventory-account model complete for this company?
- What GL classes are excluded, and does that leave a gap?

## Accountant home / worklist

Clear this period's variances, post the entries, close.

- What can I actually clear this period?
- Draft the journal entry for this variance.
- What is blocked and waiting on the analyst?
- Am I ready to close, or is something still open?

---

## Open calls for you

- **Wording is worked as we go.** SME copy, settled surface by surface during the
  build, not authored all up front.
- **Which surfaces the demo walks** decides capture order. Golden Harvest (Demo3) is
  the analyst showcase, so its analyst surfaces come first; the accountant set rides
  the accountant tour on a clearable company.
- **How many tiers to show.** If the demo flips Basic to Full to sell the ladder, we
  capture every pill at every shown tier. If it stays on Full, we capture once.
