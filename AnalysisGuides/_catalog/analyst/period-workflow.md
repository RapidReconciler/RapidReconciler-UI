# PERIOD WORKFLOW — analyst role brain, "what do I click and in what order" (single-source catalog)

**Role:** analyst (variance root-cause → SOURCE fix; posts no journal entries).

**Status:** PROMOTED source of truth for the PROCESS half of
`RRV8.ANALYST_GROUNDING`. Wired 2026-08-14: `Tools/build-ai-grounding.py` has
`"ANALYST"` in `GENERATE` and reads `_catalog/analyst/transaction.md` then this
file, composing the `_core.md` invariants in ahead of the bullets. Edit the fence
here and re-run the generator; never hand-edit the catalog inside `config.js`.

The wiring was NOT the two edits this file used to describe. Adding only this file
to `SOURCES["ANALYST"]` would have replaced 27 shipped pattern bullets with process
bullets and reported success, because the generator overwrites a GENERATE topic
wholesale. The pattern half had to be lifted into `transaction.md` first, and the
Markdown read path and shared-core composition — declared in the generator's
config but never implemented — had to be written before either catalog could be
read at all.

**Altitude:** PROCEDURE, not pattern. `transaction-detail-analysis.md` and
`_catalog/analyst/transaction.md` say what a variance *means*; this file says which
control the analyst uses, in what order, what each state means, and what is
recorded. The two must never contradict each other on who does what.

**Why this file exists:** the assistant could not answer "guide me through the
clicks" for the Transaction Variance period close, because the sequence was
written down nowhere. It lived only in `home.html` render branches, so answering
it meant reading `data-txv-act` values out of a 14,000-line page. A junior analyst
has no such option, and neither does the AI.

**Provenance:** mined from the shipped controls in `RRV8/home.html` on 2026-08-13
— the three `data-txv-act` states (`resolve` / `save` / `reopen`), the
`Recommendations` editor label and its placeholder, the period-level
`data-txv-review` and `data-txv-reopen` / `data-txv-reopen-attributed` branches,
and the `Handed off this cycle: N of M` line. Not from recollection.

The lines inside the fence are lifted exactly as written — no blank lines, no
prose outside the fence is read. Keep every line a single grounding bullet.

```grounding
ANALYST POLICY (period workflow) — reason from these rules:
- THE ANALYST'S JOB IS TO PREVENT RECURRENCE, not to post journal entries. Every control below records what was found and what was changed at the source; none of them post to the GL. The accountant posts. If asked to make a variance "go away" with an entry, say that is the accountant's step and that the analyst's step is finding why it happened.
- WORK THE CARDS FIRST, THEN THE PERIOD. Marking the period reviewed snapshots the card counts as they stand at that moment, so a card handed off after the period was marked is not counted in it. The order is not cosmetic.
- STEP ONE IS A MATERIALITY DECISION, not a click. Read the card's variance, its row count and the LIKELY CAUSE, then decide whether this is worth investigating. If it is immaterial in the analyst's judgement they are done investigating and can mark the period reviewed — that is a recorded decision with zero source fixes, not a skipped step. If it is material, open the variance drill first and let the finding come from the rows.
- A CARD IS ONE DOCUMENT, one root cause. The card header carries the company, the pattern name (for example "Sales DMAAI Net Zero"), the period, and a "Variance $X" link that drills to the transaction detail for that document. The LIKELY CAUSE block under it is the classifier's reading of the rows, not a confirmed diagnosis — it is where the analyst starts, not where they stop.
- THE VARIANCE LINK IS THE FIRST STEP AND THE QUIETEST CONTROL ON THE CARD. It is a text link with an arrow; the only solid button is "Mark reviewed", which is the LAST step. If asked how to investigate, name the variance link explicitly — a reader who scans for the button-shaped thing finds the control that closes the card without opening anything.
- ON THE TRANSACTION DETAIL PAGE, "SAVE" CAPTURES THE FINDING AND NOTHING ELSE. It is the ONLY button on the Findings panel. It stores the finding text against the company, card and period, and deliberately does not mark any row worked, does not send anything to the Audit Center, and does not advance the card's status. The finding then appears on the Home card labelled "Your recorded finding". This page had a second button also called "Mark reviewed" until 2026-08-15; it is gone. If asked where a finding is handed off, the answer is always the Home card and never this page.
- THE CARD BUTTON HAS THREE STATES and each names the action available. Untouched card: "Mark reviewed". Card already carrying a saved finding: "Review & submit". Either one OPENS the Recommendations editor and the same button becomes the save. Completed card: "Reopen to edit". Reopened card: "Mark reviewed", with the editor already open. Nothing is saved by opening the editor.
- REVIEWING THE CARD DISPOSITIONS THE WHOLE CARD, not the rows that happened to be on screen. The review action marks every row the card counted as worked, persists them, records the card complete, and writes the corrective to the activity log. It is all-or-nothing at card grain on purpose: a card is one document pattern with one root cause, so the card is the unit of judgement. An analyst who genuinely worked only part of it is still visible — the card's meta line reads "N worked" whenever the worked count is short of the row count. Never describe the review as marking a filtered subset.
- A FAILED HAND-OFF LEAVES THE CARD OPEN AND SAYS SO ON THE CARD. If the rows cannot be saved, nothing is recorded: the card keeps its previous state, the rows stay unmarked, and the reason prints on the card itself. So a card that still reads as open after a review attempt has genuinely not been handed off — read the message on it rather than assuming the click was missed.
- WHAT YOU TYPE IN "RECOMMENDATIONS" IS THE RECORD. It is stored as the card's source-fix text against the company, card and period. Its placeholder ("Waiting investigation — replaced with recommendations from the transaction details page.") is a PROMPT, not a value: an untouched card saves an empty resolution, which is correct. Never treat the placeholder text as analyst content.
- WRITE THE RECOMMENDATION AS AN INVESTIGATION RESULT: what you checked, what you found, and what stops it recurring. "Immaterial" is a disposition, not a finding. A resolution that names no source change has not prevented anything.
- HANDED OFF THIS CYCLE: N OF M is the count of cards saved complete against the total on the period. It is the figure that decides whether the period can later be reopened silently, so read it before marking the period reviewed.
- "MARK PERIOD REVIEWED" records how many card slices were fixed at the source and how many were left to ride, stamped with your name and the time server-side. It does not require every card to be complete — leaving cards to ride is a legitimate outcome, and the count says so.
- AFTER THE PERIOD IS REVIEWED the button becomes a "Reviewed <date>" chip. Whether it can be undone depends on whether work left the period. Nothing handed off, no source fixes recorded and no accountant adjustment means the review is inert and a plain "Reopen period" button undoes it outright. Any of those three means work left the period.
- REOPENING A CONSEQUENTIAL PERIOD REQUIRES A REASON, and the reasons it is locked are printed beside the button — cards handed off, source fixes recorded at review, accountant adjustment recorded. The reason is recorded against your name BEFORE the review is removed, and surfaces on the Audit tab under Reconciliation Audit Findings; if that record cannot be written, the period is left exactly as it was. A reversal that nobody can attribute is refused rather than performed quietly.
- REOPENING IS A CORRECTION, NOT A ROUTINE STEP. Someone downstream may have acted on the close. State in the reason what changed, not that you clicked the wrong thing.
- A ZERO OR NEAR-ZERO VARIANCE IS STILL A DECISION. An immaterial period can be marked reviewed without research, and that is a recorded choice with a count of zero source fixes. Do not describe it as "nothing to do" — describe it as a disposition the analyst owns.
- EVERY PERIOD-LEVEL ACT REACHES THE AUDIT SURFACE. Marking a period reviewed, reopening it inertly and reopening it with a reason all write an entry carrying the actor from the signed-in session. The Audit tab reads that stream, so the analyst's sign-off appears there under Analyst alongside their card findings and the DMAAI model approval.
- THE AUDIT TAB IS PER-COMPANY AND PER-PERIOD. A review recorded against one company does not appear while another company is in focus. Before concluding an entry is missing, check the company in the header — that is the usual explanation.
- THE PERIOD ENTRY IS A HEADER, NOT THE RECORD. It says who signed off, when, and with what counts. The substance an auditor needs months later is the card finding text. A period line reading "0 fixed at source · 1 let ride" reports a decision, not a reason.
- APPROVING THE DMAAI ACCOUNT MODEL IS ANALYST WORK, not accountant work. A wrong AAI is what produces a variance, so signing off the routing model is prevent-recurrence work and is recorded under Analyst. The `accounting-` prefix on the model-review page filename is a misnomer, not a role assignment.
- THE ROLL-FORWARD FIGURE AND THE RECONCILING ITEMS ARE NOT EXPECTED TO TIE. The chart sums every posted non-manual row at account grain; the card counts only documents over the materiality threshold at document grain. Two restrictions and a different grain, so they differ in either direction — the narrower population can be the LARGER number. Never explain the gap with filtering alone, which only fits one sign.
```
