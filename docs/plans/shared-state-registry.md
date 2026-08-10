# Shared state and colour registry (UI-80)

Companion to `shared-figure-registry.md`. That file governs numbers. This one
governs status: every dot, pill, chip, badge, banner, row highlight and KPI
colour that makes a claim about whether something is wrong.

## Why this file exists

The figure registry exists because two functions computed one quantity and
disagreed. State fails differently. Almost every defect the UI-80 audit found was
not two functions computing one state. It was one function computing one state
and then picking a colour for it, badly, because nothing said which colours exist
or what each one claims.

`home.html` proves the point. `_cardLevel` reads the admin card's meaning back
out of its CSS class name, so the canonical store for that surface is the paint.
Any two conditions needing the same colour are forced to become the same state,
and no state can be added without a class rename rippling through four consumers.

So this file has two halves, and the vocabulary comes first. A directory of
producers on its own would have caught almost none of it.

## The vocabulary

Four values, from UI-74. Each names the question it answers.

| State | Question it answers | Colour |
|---|---|---|
| `detected` | A check fired on THESE rows. | The alert colour. Nothing else earns it. |
| `classified` | The card carries a named mechanism. Nothing was detected here beyond that. | Informational. Not the alert colour. |
| `open` | Cause not determined, or not evaluated. | None. |
| `muted` | Nothing to report. | None. |

`inventory-transactions.html` is the reference implementation. Read the verdict
switch and its CSS before adding a state anywhere else.

**Activity is not a state.** Loading, refreshing, reconnecting and "job in
progress" describe what the page is doing, not what it found. UI-74 was written
for a panel that never spins, so the vocabulary has a real gap here. Give
activity its own treatment (a pulse, a hollow ring, a spinner) and never the
alert colour. `sidebar.css` currently aliases `.is-amber` to `.is-loading` so
that "working on it" and "needs attention" share both a colour and an animation.
That is the gap showing.

## The rulings

These were settled in code comments across several files, where they get
re-litigated because nobody finds them. They are normative.

**Unknown never inherits a colour from either end.** Not the alert colour, and
never the all-clear. If the server returned nothing, returned `unknown`, or
returned a value this build does not recognise, the indicator makes no claim and
the tooltip says it was not checked. `accounting-dmaais.html` does this correctly
by hiding the badge and logging. `inventory-variance-source.html` does it
correctly with neutral grey and body text that separates "could not read" from
"nothing to reconcile".

Silence reading as the all-clear is the dangerous direction of this error. A
green dot claims a check ran and passed. A grey one claims nothing.

**No all-clear green on a page the analyst opened because something is wrong.**

**Sign is not severity.** A negative number is not a detection. Painting it the
alert colour makes a company at minus four thousand look worse than one at plus
four thousand when both are equally outside tolerance, and it spends the alert
colour inches away from the tolerance dot that carries the real verdict. Natural
sign is the display convention (`reference_transactions_sign_convention`), so
ordinary issues and relief are negative and a correct decomposition renders as a
column of red bars. Use a glyph if a sign cue is needed.

**A producer must not return a colour.** `complexPwReviewLevel` in `sidebar.js`
returns the string `green` or `amber`, and three consumers concatenate it
straight into a class name. Its rule cannot change without changing the paint,
and a fourth return value would render an unstyled, invisible dot.

## The structural rule

**A status indicator's colour is derived from a `data-state` attribute in CSS.
JavaScript sets the state. It never sets a colour class, and it never reads one
back.**

This is what makes the rest mechanically checkable. Grep for a colour word inside
a class-name string and you have the violation set, which is how the audit found
most of what it found.

## Registry

One row per condition that reaches a status indicator. Producer, the state it
maps to, and every consumer.

### Roll forward

Producer: `RRV8.rollForward` in `config.js`.

| Condition | State | Consumers |
|---|---|---|
| `GLOK` or `VarOK` is `no` | `detected` | Data Health band, accountant grid account dot, roll-forward page chip |
| either token is `unk`, or the period is the baseline | `open` | same three |
| neither | `clean` | same three |

The account roll-forward page models all three correctly. The accountant grid
account dot and `applyInventoryLight` both recomputed the retired literal-`no`
rule inline and were absent from the figure registry's consumer table, which is
why the grid told accountants a company had closed clean when accounts in it had
never been compared.

### Sidebar service dots

Producer: the Services status payload, read in `sidebar.js`.

| Condition | State | Colour |
|---|---|---|
| server reports success | `clean` | green |
| server reports a failure | `detected` | red |
| server reports in progress | activity | pulse, not amber |
| server reports `unknown`, `none`, empty, or an unrecognised value | `open` | none |

The last row is the one that matters. It is a documented server state, not an
edge case, and a newer Services jar reporting a value this build does not know
lands there too.

### Admin card dots

Producer: currently the CSS class itself, which is the defect. Conditions
reaching `row-dot amber` today include a fiscal-calendar mismatch and a GL break
(both detections), the nightly refresh running (activity), connectivity inside
the grace window (activity), and three separate review reminders where an admin
has not clicked Acknowledge (none of which detected anything).

An analyst who learns that amber on this page is mostly housekeeping carries that
habit to the Data Health tab and the Variance Analyzer header, where amber means
something fired. The UI-74 rename buys nothing while the same colour is spent on
"click Acknowledge" three cards away.

Review reminders falling due are `classified`: known, named, nothing detected.

## Adding a state

1. Name the question it answers. If the name describes a colour, start again.
2. Map it to one of the four values. If it fits none of them, it is probably
   activity, and activity is not a state.
3. Check that the colour is not already spent on a different question on any
   surface the same analyst sees in one session.
4. Read the text that sits beside it. An alert colour next to reassuring text is
   the shape that started UI-74.
5. Add the row here: condition, producer, state, every consumer.
6. Set `data-state`. Do not write a colour class from JavaScript.

## What does not belong here

Tolerances and thresholds are figures and belong to the figure registry. This
file owns the mapping from a condition to a state to a colour, and nothing else.

Decorative and brand colour is out of scope: the wordmark, module accents, the
navy reference accent, destructive-action button styling.
