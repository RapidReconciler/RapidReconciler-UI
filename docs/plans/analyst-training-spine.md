# Analyst training spine (UI-40)

**Status:** spec, not built. Gated on UI-38 (grounding must be trustworthy first).
**Date:** 2026-07-16 (session #13). Owner-designed; this doc is the end-to-end spec.

## What this is

In-app training for the end customer's analyst, delivered through the AI
assistants they already use. It replaces the old V7 Trainual module. It is not a
Training tab, not a course list, not a guided tour, and not a documentation dump.

The analyst is a JDE and reconciliation veteran who is new to *this tool*. So the
whole thing teaches how RapidReconciler expresses reconciliation they already
know how to do. It never explains the domain. A tutorial that tells a JDE veteran
what a cardex variance is gets the assistant switched off on day one.

## Shape: a spine and its ribs

The spine is one short conversational orientation, "how RapidReconciler works for
you," reachable on demand from the analyst Home lane. It is the map: RR's job for
the analyst, the surfaces they work, the vocabulary, and the one decision that is
RR's rather than JDE's. Six ribs, below.

The ribs are per-surface depth. On each analyst surface, the assistant can orient
to that screen and its live data. A rib stands on its own, so an analyst who lands
straight on Cardex Variance gets the cardex rib without the spine. The spine links
out to the ribs, and the ribs also answer directly where the analyst is working.

## The curriculum (six ribs, tool not domain)

Each rib is short, anchored to the JDE tables the analyst already queries, and
drawn from the shared analysis catalog rather than authored separately.

**Rib 0, the map.** RR's job for you: turn reconciliation variances into source
fixes. You work Transaction Variance, Cardex Variance, and the perpetual /
roll-forward detail. RR finds and classifies; you validate against JDE and decide
the fix. You do not post journal entries. That is the accountant. (Sets scope and
the role split.)

**Rib 1, how RR draws each variance.** Transaction variance is F4111 against
F0911, per document, tied by account. Cardex variance is F4111 against F41021
on-hand, **account-blind**, answering "do the item's transactions add up." The
grains differ, and RR picks. The account-blind nature of the cardex side is a real
gotcha for someone expecting an account tie.

**Rib 2, RR's pattern vocabulary, from their own data.** The classifier labels and
the move for each: duplicate sales, non-stock routing, transfer integrity, MTO
residual, period mismatch, BU account mismatch. Their JDE fluency does not tell
them what RR chose to call a shape or why it flagged. This rib is the pattern
catalog verbatim, the same content the classifier cards and the analyzer pop-up
use.

Rib 2 does not recite a generic glossary. It reads the patterns actually present
in this customer's classified data (the same classification the pattern cards
show, scoped to the active database and the working companies) and, for each
pattern present, gives the RR meaning and the move from the shared catalog. A
static module teaches a fictional company; this teaches the analyst using the
shapes sitting in their own data right now. Two constraints ride with going live:
named patterns get the catalog read, but unclassified residual is called residual
and never given an invented meaning (grounding honesty; ties to AN-1 / UI-36); and
any live citation masks per the active tier (company identifiers hidden at the
scrubbed tier).

**Rib 3, the analyst's decision (it differs by surface).** The decision logic is
RR's, not JDE's, but its shape depends on which variance you are working.

On **cardex** variance the fork is record vs adjust. JDE was off, so fix at source
or route to IT (RR records it and ages the item). JDE ties, so adjust RR to sync.
This includes the align case (UI-39): an item RR ties out but JDE shows off, so
you open it from Full Perpetual Details and adjust balances to align.

On **transaction** variance the decision is different. You classify the pattern
(Rib 2), then either book the source fix (a mapping or routing correction) or
disposition it as immaterial, timing, or self-correcting. A disposition posts no
JE, and the variance can recur until the source is actually fixed. Do not carry
the cardex "adjust to sync" move over to transaction variance; there is no on-hand
balance to sync there.

**Rib 4, what acting does.** Clears versus routes. Every adjustment is reversible
(the adjustment ledger, undo). RR overwrites rather than versions, because it is a
tool, not a system of record. The dispositions surface in the accountant's Audit
Center. This sets expectations about consequences before the analyst commits one.

**Rib 5, the handoff.** Your source fix stops the variance recurring; the
accountant's JE clears the GL this period. Two sides of the same finding. This is
the analyst's view of the carry-forward model and the cross-role disposition
indicator.

## Delivery

Per-role, not per-user. The Home lanes already scope by role, so the assistant
knows it is talking to an analyst. Role logins mean there is no per-person
history, so the design does not pretend to have one.

Pull is primary. The analyst asks the assistant orientation questions any time.
Rib 0 is reachable from Home; the ribs answer where the analyst works.

Push is minimal and earned. The first time a surface opens in a session, the
assistant offers a single dismissable line: "New to this screen? Want the RR
read?" Wave it off and it is gone for the session. A new session offers it again,
softly. A veteran waves it off in half a second; a newcomer takes it.

State is session-scoped, keyed by surface, role, and database in `sessionStorage`
(for example `rrv8.train.seen.<db>.<role>.<surface>`). No server round-trip, no
per-user identity, and a shared machine does not carry one person's dismissals
into the next person's session. "Show once forever" is deliberately not attempted,
because with role logins it would be a lie.

Tone respects expertise. Terse by default, JDE-anchored, no domain explanation. An
optional "more" expansion exists for the one analyst who wants it, per session.

## Knowledge source: one catalog

The ribs are a role-tagged, orientation-purpose *view* of the same knowledge that
feeds the classifier, the AI grounding, and the analyzer pop-up: the analysis
guide plus the grounding blocks in `config.js`. Training is not a new content
store. Change a pattern's definition once and the classifier card, the grounding,
the analyzer, and the training rib all move together. This is
`feedback_analytical_knowledge_one_source` applied.

Mechanically, an "orientation" prompt template composes the existing role and
surface grounding with the live facts, under the instruction "orient a JDE-fluent
analyst to how RR expresses this; assume domain fluency; be terse; anchor to the
JDE tables they know; never explain the domain." The assistant generates the rib
from grounding plus live data. The only genuinely new content is the spine's
structural map, the six rib topics.

## AI wiring

Reuse the analyst assistant already on Home and the per-surface assistants (cardex
Investigate, txv recurrence). They POST to VALC `/api/v1/ai/explain` (Sonnet). Add
an orientation intent that carries the training prompt template. Training honors
the tier ladder (grounded / scrubbed / full): the spine map is about the tool, so
scrubbing barely applies, but any rib that cites a live example masks per the
active tier.

## Non-goals

- No Training tab, course list, or video modules. That is Trainual in-app, the
  documentation flood by another name.
- No guided tour or coach-mark overlay. Intrusive.
- No gating work on training completion. RR is a utility, not enforcement.
- No separate training content store. It drifts from the one source.
- No per-user progress, scores, or certificates. Per-role, no per-user identity.
- No teaching the domain. The audience already knows it.

## Build phases

**Phase 0 (prerequisite):** UI-38 grounding audit clean. The assistants must be
trustworthy before they teach. A confident wrong answer to a learner who cannot
catch it is worse than no training.

**Phase 1:** the orientation intent and prompt template on the analyst assistant,
drawing from the one catalog. Ship Rib 0 reachable from Home.

**Phase 2:** the per-surface ribs (cardex, transaction variance, perpetual) plus
the per-session dismissable offer.

**Phase 3:** tighten the copy live (owner is the SME and the eyes), rib by rib.

## Open decisions for the owner

1. The Home entry affordance: placement (near the analyst Ask box) and label
   ("How RR works for you" / "Get oriented" / "How RR reads your variances").
2. The per-session offer: per-surface (richer, more offers) or once per session
   globally (quieter). Leaning per-surface but light.
3. **Decided (owner, 2026-07-16):** Rib 2 cites the customer's own live patterns,
   scoped to the active DB and working companies, tier-masked, with unclassified
   residual named as residual rather than guessed. The spine map stays generic;
   the ribs go live.
4. **Decided (owner, 2026-07-16):** the six ribs are the full scope and
   SME-confirmed. Rib 3 was corrected during the verify pass (it had
   over-generalized the cardex record-vs-adjust fork to transaction variance,
   which uses a disposition model). Only calls 1 and 2 remain, both build-time UI
   choices.

## Accountant spine

Deferred. Same architecture, different curriculum (suggested-JE build, per-company
disposition model, carry-forward, materiality, Audit Center). Spec it once the
analyst spine is proven.
