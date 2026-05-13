# Plan: Analyzer disclaimer + feedback submission path

**Status:** Spec ready. Not yet executed. Pick up in a fresh session.

**Source of this plan:** session-transcript on 2026-05-13, immediately after
landing Pattern 5.7 (`f2bdbb6`). The customer asked whether the analyzer
should disclose its limitations and whether to offer a submission path for
workbook review. Both were agreed in principle; implementation deferred due
to usage budget.

**Related plans:** `dmaai-system-context.md`, `rapidreconciler-db-bootstrap.md`
— independent. This plan can land in any order relative to those.

---

## Goal

Tell users the analyzer is a hypothesis-generator with an evolving pattern
library, give them a low-friction way to flag misdiagnoses, and preserve the
"Local-only · no upload" privacy claim that lives on the cover card.

## Architecture decisions already locked in

These were settled in the source conversation. **Do not re-derive.**

- **No backend upload.** Submission goes through the customer's own email
  client. The `mailto:` link prefills subject + body; the customer attaches
  the saved workbook manually. This preserves the no-upload privacy story.
- **Notes tab is auto-generated** in every output workbook with a fixed
  template. Captures structured feedback the customer fills in before
  emailing.
- **Two disclaimer placements**: the analyzer page (the "before you upload"
  surface) and the output xlsx Analysis tab (the "before you act" surface).
  No placement on the cover card — the existing Beta pill in the analyzer's
  own banner is enough at that level.
- **Tone is honest, not legalese.** No "we make no warranties" boilerplate.
  Plain "verify before acting" reads as confident.
- **The word "AI" is deliberately avoided** in disclaimer text. The analyzer
  is deterministic pattern matching, not AI.

## Scope — option (c) from the source discussion

Three pieces, all in one commit:

### Piece 1 — Disclaimer on the analyzer page

Adds a small notice near the drop zone or in the welcome banner on
`Tools/analysis-workbook.html`.

**Proposed wording (exact):**

> **The analyzer surfaces likely root causes based on patterns it recognizes
> today.** Customer configurations and uncommon transaction types may
> produce findings that don't fit your situation. Always verify the
> diagnosis against your JDE setup before posting correcting entries or
> changing configuration. If a finding looks wrong, fill in the Notes tab
> in the analysis workbook and email it to
> [rrsupport@getgsi.com](mailto:rrsupport@getgsi.com?subject=RapidReconciler%20Analyzer%20review)
> — we'll review and expand the pattern library.

Visual treatment: same family as the existing supported-reports panel
header (subtle, not alarming). Could collapse to a one-liner with a
"learn more" expand if the full text feels heavy. Either is fine.

### Piece 2 — Disclaimer in the output xlsx Analysis tab

Inserts a notice block near the top — between the headline row and the
variance card — in every generated Analysis tab.

**Proposed wording (exact):**

> **⚠ Verify before acting.** This is a pattern-match against the
> analyzer's current library of known root causes. Customer DMAAI /
> order-type / line-type configurations vary, and patterns specific to
> your setup may not be recognized yet. Review the Evidence below and
> confirm the diagnosis in JDE before posting any journal entries or
> making configuration changes. If this diagnosis doesn't fit, fill in the
> Notes tab and send the workbook to rrsupport@getgsi.com.

The existing Caution block at the bottom of the Analysis tab (test in
non-prod, review Transactions page before posting) **stays** — it's about
*how* to act. This new disclaimer is about *whether* the diagnosis is
right. Different layer; both belong.

Implementation: add a new render helper in the rendering chrome module
(near `renderCardPair` / `renderVarianceCard`) — `renderDisclaimer` — that
writes the block. Wire it into `TransactionDetailTemplate.render()` and
every other template's `render()` so the disclaimer is universal across
the eight templates.

### Piece 3 — Notes / Feedback tab in every output workbook

Adds a third worksheet to every generated workbook, after Analysis and
Transaction Details. Fixed template with prompts the customer fills in.

**Proposed structure:**

| Row | A | B |
|---|---|---|
| 1 | Notes / Feedback for RapidReconciler Support | (header, merged) |
| 2 | | |
| 3 | Was the diagnosis correct? | (dropdown: Yes / Partially / No) |
| 4 | What's the real root cause? | (free text — customer fills in) |
| 5 | Customer-specific context | (DMAAI conventions, order-type splits, etc.) |
| 6 | Priority for support follow-up | (dropdown: Routine / Important / Urgent) |
| 7 | Your name | |
| 8 | Customer / company | |
| 9 | | |
| 10 | (instructions block, merged across columns) | |

Instructions block (row 10+):

> If the diagnosis didn't fit your situation, fill in the rows above, save
> this workbook, and email it to rrsupport@getgsi.com. We'll review and
> expand the analyzer's pattern library.
>
> Your workbook is the only thing leaving your machine — and only via your
> own email client. Nothing flows to a GSI server.

Visual treatment: match the family used by the rest of the analysis (Open
Sans, navy headings, soft grid). Wider column B so the free-text answers
have room.

Implementation: add a new render module — `renderNotesTab(workbook)` —
called from `TransactionDetailTemplate.render()` and every other
template's `render()` after the Transaction Details copy.

### Piece 4 (small) — `mailto:` link wired consistently

The same prefilled `mailto:` link in three places:
- The analyzer-page disclaimer (Piece 1)
- The output-xlsx Analysis-tab disclaimer (Piece 2)
- The Notes-tab instructions block (Piece 3)

Use this exact format so the support inbox can route on subject:

```
mailto:rrsupport@getgsi.com?subject=RapidReconciler%20Analyzer%20review%20%E2%80%94%20Doc%20<DOC>%20(<DT>)&body=Hi%2C%0A%0APlease%20review%20the%20attached%20workbook.%20I've%20added%20observations%20on%20the%20Notes%20tab.%0A%0AATTACH%3A%20<FILENAME>%0A%0AThanks.
```

The `<DOC>`, `<DT>`, and `<FILENAME>` placeholders get substituted at
analysis time. Static link on the analyzer page (no doc-specific
substitution — just the bare subject).

## Files to modify

- `Tools/analysis-workbook.html` — all changes live here:
  - HTML/CSS for the analyzer-page disclaimer (near `#step1` drop zone)
  - New `renderDisclaimer` helper in the chrome module (`F.renderDisclaimer`?)
  - New `renderNotesTab` module called from every template's `render()`
  - All 8 templates' `render()` get a 2-line addition (disclaimer + Notes
    tab calls)

That's it. No other files.

## Verification — what "done" looks like

- [ ] Analyzer page shows the disclaimer near the drop zone, links to
      `mailto:rrsupport@getgsi.com?subject=...`.
- [ ] Every output workbook (test with Transaction Detail at minimum) has
      the disclaimer between headline and variance card on the Analysis tab.
- [ ] Every output workbook has a Notes tab in the expected shape.
- [ ] Existing Caution block at the bottom of Analysis tab is unchanged.
- [ ] `mailto:` link in the Notes tab instructions resolves correctly when
      clicked from Excel (Excel does honor `mailto:` hyperlinks).
- [ ] Privacy badge on the cover card still says "Local-only · no upload"
      — no change.

## Estimated effort

~75 minutes in a fresh session:
- Piece 1 (analyzer page disclaimer): 15 min
- Piece 2 (output xlsx disclaimer): 20 min
- Piece 3 (Notes tab): 25 min
- Piece 4 (mailto wiring): 10 min
- Verify + browser check: 15 min

## How to resume

In a fresh Claude Code session, open Claude Code and say:

> "Pick up the plan at `docs/plans/analyzer-disclaimer-and-feedback.md`.
> Execute pieces 1-4 in one commit. Use the proposed wording verbatim
> unless something obvious needs tweaking."

The plan is self-contained — no re-deriving design.

## Out of scope

- Backend upload of workbooks. **Hard "no"** — would invalidate the privacy
  claim on the cover card.
- Tracking submission rates / analytics on the disclaimer. Not now.
- A "submit" button on the analyzer page that auto-attaches the just-
  generated workbook. Browsers don't allow programmatic mail-with-attachment
  via `mailto:` — the user has to attach manually. Mention this in the
  workbook instructions; don't try to engineer around the browser limit.
- Localization. Single language (English) for now.
