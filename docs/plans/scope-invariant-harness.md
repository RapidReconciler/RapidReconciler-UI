# Scope-invariant harness

**Status:** spec, not yet implemented. Written 2026-08-01.
**Problem owner:** the recurring drill-through scoping defect class.

## Why this exists

Two scoping bugs shipped in the same file within a few weeks of each other, both
found by the owner clicking a screen rather than by anything in the code:

- **UI-37** — `filteredRows()` applied no period filter, so a period-scoped card's
  details grid returned that card type across every period in the payload.
- **CNJ/TXI** — the destination page's card-code whitelist drifted out of sync with
  the source page's code list. The unrecognized code left `_state.activeCard` null,
  and the card filter was written as `if (_state.activeCard && ...)`, so it was
  skipped entirely. A card reading 39 rows drilled into a grid of 436.

Both share one shape. **An unresolved filter degrades to no filter, and the result
is a superset that looks like working software.** Nothing asserts otherwise, so
nothing fails. The only detector in the system is a human noticing that two numbers
disagree.

That detector does not scale, and it is not always available.

## The invariant

> For every (source count, destination view) pair, the destination must render
> exactly the rows the source counted, under identical scope.

Everything below exists to make a violation of that sentence announce itself.

## Part 1 — the drill contract

Every drill href carries the count the source is showing:

```
inventory-transactions.html?co=<n>&period=<key>&card=<code>&n=<expected>
```

`n` is advisory and additive. Its absence must never change behavior, so older
links and hand-typed URLs keep working.

The destination, after its first successful render, compares the rendered row
count against `n`. On mismatch it emits one structured console error:

```
[scope] TIE-OUT FAILED  transactions  card=CNJ co=<n> period=<key>
        expected=39 rendered=436  applied=[company,period]  ignored=[card]
```

`applied` and `ignored` are the point. The count tells you something broke; the
two lists tell you which dimension did it. Every drill landing emits the same line
at `console.debug` level even when it ties, so the applied/ignored split is always
visible during a walk.

Console only. Nothing about this reaches the analyst's screen. The audience is a
finance analyst and a diagnostic banner is noise to them.

## Part 2 — unknown values fail loudly

Three states, three behaviors. They are not interchangeable:

| URL param state | Behavior |
|---|---|
| Absent | Dimension not scoped. Legitimate. Render normally. |
| Present, recognized | Filter applied. |
| Present, unrecognized | **Visible error state naming the value. Render no rows.** |

The third row is the fix for the class. Returning an unfiltered superset when a
value doesn't resolve is the worst available outcome, because the analyst has no
way to tell it apart from a correct answer. An empty grid with a plain-English
message is recoverable; 436 rows that should be 39 is not.

Message register: plain English, the offending value quoted, no code identifiers,
no sproc or endpoint names.

## Part 3 — the path registry

One declaration per drill path, in one place:

```js
{ id: 'home.card->transactions',
  source: 'home.html',
  dest:   'inventory-transactions.html',
  dims:   ['company', 'period', 'card'],
  params: { company: 'co', period: 'period', card: 'card' } }
```

The registry buys three things. It enumerates what must be checked, so a new drill
path added without a registry entry is a visible omission rather than a silent one.
It gives the tie-out check its `applied`/`ignored` vocabulary. And it is the input
to Part 4.

Constant lists that must agree across files (card codes, subtype labels, column
orders) get the same treatment: one literal, derived everywhere else. The CNJ bug
existed because two hand-maintained lists were expected to stay equal by discipline
alone. Discipline is not a mechanism.

## Part 4 — the sweep routine

A console-callable routine that walks every registered path for the active company
and period, drives each destination's filter logic against the loaded payload
in-memory (no navigation, no fetch), and returns a pass/fail table:

```
__rrScopeCheck()
  path                          dims            source  dest   result
  home.card->transactions CNJ   co,period,card      39     39   PASS
  home.card->transactions TXI   co,period,card      12     12   PASS
  ...
  17 paths, 17 pass
```

This is the piece that converts "the owner noticed something looked wrong" into a
repeatable check anyone or anything can run before calling a change done. It is
also the regression test the codebase currently lacks, without introducing a test
framework the project doesn't use.

## Rollout

1. Fix the open CNJ/TXI defect and collapse the duplicated code lists. *(in flight)*
2. Land the tie-out contract on the transactions drill, the path with two known
   historical failures.
3. Build the registry from the drill-path sweep already underway.
4. Extend the tie-out to every registered path.
5. Add `__rrScopeCheck()` over the registry.
6. Run it as a gate before any capture or recording work, since a scoping defect
   baked into a recording is expensive to discover later.

## Non-goals

- No test framework, build step, or new dependency. This project ships static HTML.
- No visible diagnostics in the product UI.
- Not a data-correctness check. Whether a card's 39 is the *right* 39 is a separate
  question answered by the classifier and the database. This harness only proves
  that two surfaces agree about the same 39.
