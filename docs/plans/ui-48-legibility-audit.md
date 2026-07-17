# UI-48 legibility audit (Phase 1, read-only)

Date: 2026-07-17. Auditor: Claude (Opus 4.8). Read-only. No code was
edited and nothing was committed.

## What this is

A per-surface catalog of two failure shapes on the analyst and admin
chrome:

1. Reading/subtext prose rendering below the 13.5px floor
   (`feedback_ui_bullets_and_readable`).
2. Stacked, low-density layouts that waste vertical height and leave
   horizontal whitespace, where an inline treatment reads better. The
   shipped reference is the analyst check-band (`_analystCheckBand` +
   `.analyst-wl-lede`, 12.5px stacked to 14px inline).

Financial DATA grids are out of scope and were not flagged
(`.intg-table`, `.perp-grid`, `.acct-grid`, `.pv-table`, tx/asof/cardex
grid cells, `.cx-drawer-tbl`, `.ws-matrix`).

## Method and what "flag" means

Measured rendered px at 1440px width on a separate MCP browser tab
against Demo1 (companies 80002/80008), viewRole switched through
Analyst, Administrator, and Accountant. The viewRole value was restored
to its original setting afterward. On the 12 standalone `admin-*.html`
pages the declared font sizes are absolute px with no em inheritance, and
a live check on `admin-users.html` confirmed rendered px equals declared
px, so the CSS-computed values for those pages are trustworthy. Items in
modals or conditional bands that did not render in the default demo state
are marked "CSS-computed".

Two categories are separated on purpose:

- Reading prose (descriptions, notes, ledes, status sentences, reminder
  copy). This is what the 13.5px floor is about. These are the real
  findings.
- The micro-label layer (uppercase eyebrows, pills, table column heads,
  count chips, timestamps, short CTA links like "Manage" or "Show
  items"). These sit at 10 to 12.5px by design. They are listed where
  relevant but ranked low, and uppercase small-caps labels were excluded
  from the walker entirely.

A note on 13px prose: reading text at 13px is 0.5px under the floor. It
is technically a violation but a trivial one. Those rows are marked
"marginal" so they can be swept or skipped as a batch decision.

---

## Headline

- Total findings: 34 distinct selectors under the floor across the
  audited surfaces (analyst 7, admin home lane 6, standalone admin pages
  12 shared or per-page, accountant chrome 9 cheap-pass).
- Worst surface: the standalone `admin-*.html` pages, and specifically
  the shared reminder/footer chrome plus the modal role-description
  paragraphs. Worst single item is `.ai-level-desc` at 11.5px (AI-tier
  description prose in the admin home lane), which is genuine reading
  text well under the floor and visible by default.
- The analyst tab chrome (Data Health / Transaction Variance / Cardex
  Variance) and the analyst worklist check-bands are largely already at
  the floor, the same result UI-41/43 found for the pages it measured.
  The check-bands render at 14px, `.analyst-card .row-sub` at 13px. What
  remains in the analyst lane is the caption/CTA micro-layer at 12 to
  12.5px, not prose blocks.
- The admin surfaces have real gaps, but it is a targeted fix-set, not a
  rewrite. Because the admin pages share a common chrome, a handful of
  shared-class bumps (`.review-*`, `.app-footer`, plus `.ai-level-desc`)
  clears most of the repeated offenders. The rest is per-page prose,
  mostly the modal role-description `<p>` blocks on `admin-users.html`.
- Low-density layout findings are minor. The stacked-to-inline pattern
  from the reference fix has already been applied where it mattered most
  (the check-bands). The remaining candidates are the cardex figure
  captions and the AI-tier ladder rows, both borderline.

---

## Analyst surfaces (home.html, viewRole = analyst)

Measured live on Demo1. Default view and all three tabs.

| Selector | Surface / tab | Rendered px | Kind | Proposed fix |
|---|---|---|---|---|
| `.ai-level-desc` | AI dock (persistent) | 11.5 | prose | 13.5 |
| `.cxh-fig-k` | Cardex Variance card caption | 12 | label | 13 |
| `.txv-ai-ctx` | Transaction Variance context line (5 visible) | 12.5 | reading/meta | 13.5 |
| `.cxh-mv-h` | Cardex mini-movement sub-head | 12.5 | label | 13 or leave |
| `.cx-fw-details` "Full details" | Cardex CTA link | 12 | CTA | 13 or leave |
| `.cx-card-go` "Show items" | Cardex expander CTA | 12 | CTA | 13 or leave |
| `.rrai-dock-opt` / tier spans | AI dock toggle labels | 11.5 to 12 | micro-label | leave |

Notes:

- The check-bands (`.analyst-wl-title`, `.analyst-wl-lede`) are already
  at 14px inline. No change.
- `.analyst-card .row-sub` and `.analyst-wl-*` ledes measured at or above
  13px. Marginal at worst.
- `.txv-ai-ctx` is the most defensible prose finding here: it is a
  context sentence under the variance cards, not a chip, and 5 instances
  render by default.

## Analyst / accountant shared detail chrome (CSS-computed)

These classes back the Transaction Variance detail cards and the
Residual Optimizer / accounting-model surfaces. They did not all render
in the default Demo1 state, so the px below are from the stylesheet
(validated approach for absolute-px rules).

| Selector | Where | px | Kind | Proposed fix |
|---|---|---|---|---|
| `.txv-card-meta` | TxV detail card meta | 12 | reading/meta | 13 |
| `.txv-card-cause` | TxV detail card cause prose | 13 | prose | 13.5 (marginal) |
| `.txv-fig-lbl` | TxV figure label | 12.5 | label | 13 |
| `.perp-opt-note` | Residual optimizer note band | 12.5 | prose | 13.5 |
| `.perp-resid` | Residual summary band | 12.5 | reading | 13.5 |
| `.reports-col-cap` | Reports column caption | 12.5 | prose | 13.5 |
| `.rep-ldesc` | Report list description | 12.5 | prose | 13.5 |
| `.oe-note` / `.oe-warn` / `.oe-defaultnote` | Offset-entry notes | 12 to 13 | prose | 13.5 |
| `.acct-ans-q` | Accountant answer question line | 12.5 | prose | 13.5 |
| `.audit-band-msg` / `.audit-band-meta` | Audit band message + meta | 12 to 13 | prose | 13.5 |

The accountant view was a cheap pass only (analyst and admin were the
ask). If the fix batch touches these files anyway, the accountant prose
above is worth including.

---

## Admin home lane (home.html, viewRole = administrator)

Measured live on Demo1.

| Selector | Surface | Rendered px | Kind | Proposed fix |
|---|---|---|---|---|
| `.ai-level-desc` | AI-tier ladder description (4 visible) | 11.5 | prose | 13.5 |
| `.act-when` | Activity item timestamp (3 visible) | 11.5 | micro-label | leave or 12 |
| `.svc-uptime` | Data-service uptime line | 12 | status prose | 13 |
| `.svc-mem-cap` | Data-service memory line | 12 | status prose | 13 |
| `.row-sub` | Card subtext ("Running normally") | 12.5 | prose | 13.5 |
| `.act-label` | Activity item text | 13 | prose | 13.5 (marginal) |
| `.grid-card-count`, `.af-ver` footer | count / version | 12 | micro-label | leave |

`.ai-level-desc` is the priority. It is a full sentence of description
("Deterministic figures only, no data leaves your server") rendered at
11.5px and visible on load.

Not rendered in the default state but present in the stylesheet:
`.tile-desc` (12.5), `.db-fact-sub` (11.5), `.ctx-sub` (12), `.ready-sub`
(13), `.ri-sub` (12.5), `.wz-action .a-sub` (12.5), `.wz-ai .s` (12),
`.dc-result-meta` (11.5), `.lane-summary-note` (12.5). Most are card
subtext or wizard/search prose. Bump the prose ones to 13.5, leave the
count/meta micro-labels.

---

## Standalone admin pages (admin-*.html)

12 pages share a common chrome block. CSS-computed, spot-validated live
on `admin-users.html` (rendered px matched declared px exactly).

### Shared across all or most admin pages

| Selector | px | Kind | Pages | Proposed fix |
|---|---|---|---|---|
| `.app-footer` | 12 | footer prose | all 12 | 13 or leave (footer) |
| `.review-label` | 12.5 | reminder prose | activity-log, claude-assistant, complex-passwords, job-schedule | 13.5 |
| `.review-btn` | 12.5 | button | same | 13 or leave |
| `.review-text` | 13 | reminder prose | same | 13.5 (marginal) |
| `.fetch-error` | 13 | error prose | most | 13.5 (marginal) |
| `.toast` | 13 | transient prose | all 12 | leave (transient) |
| `.breadcrumb`, `.topbar-brand-db` | 11 | uppercase micro-label | all 12 | leave |

The `.review-*` reminder band is the highest-value shared fix: it is the
access-review reminder copy an admin actually reads, repeated on four
pages, sitting at 12.5px.

### Per-page prose under the floor

| Page | Selector | px | Kind | Proposed fix |
|---|---|---|---|---|
| admin-users | modal role-desc `<p style>` (5 blocks: lines ~771, 776, 784, 822, 827) | 12 | prose | 13.5 |
| admin-users | `.review-sub`, `.review-cadence` | 12.5 | prose | 13.5 |
| admin-users | `.nu-co` | 12.5 | reading | 13.5 |
| admin-users | `.perm-cos-hint` | 11 | prose | 13 to 13.5 |
| admin-users | `.perm-cos-empty`, `.fab-pop .fab-foot` | 12 | prose | 13.5 |
| admin-claude-assistant | `.conn-sub` | 12.5 | prose | 13.5 |
| admin-claude-assistant | `.feat-sub` | 13 | prose | 13.5 (marginal) |
| admin-claude-assistant | `.feat-preview` | 12 | CTA | 13 or leave |
| admin-companies | `.lic-snooze`, `.cta-err` | 12.5 | prose | 13.5 |
| admin-companies | `.lic-term-sub`, `.unlicensed-cta p` | 13 | prose | 13.5 (marginal) |
| admin-fiscal-period | `.scanned` | 12 | status prose | 13.5 |
| admin-fiscal-period | inline `<p style="font-size:13px">` | 13 | prose | 13.5 (marginal) |
| admin-job-schedule | `.row-sub`, `.sched-hero-runs`, `.note` | 13 | prose | 13.5 (marginal) |
| admin-data-service | `.svc-mem-cap`, `.svc-restart-label` | 13 | status prose | 13.5 (marginal) |
| admin-purge-data | `.purge-rec-remind` | 12.5 | reminder prose | 13.5 |
| admin-purge-data | `.log-count` | 12 | micro-label | leave |
| admin-purge-data | `.log-empty`, `.insight ul` | 13 | prose | 13.5 (marginal) |
| admin-reload-cardex | `.eod-banner` | 13 | prose | 13.5 (marginal) |
| admin-reload-cardex | `.btn-snooze` | 12.5 | button | 13 or leave |
| admin-reload-gl | (only shared chrome + code/error prose) | 12 to 13 | prose | as shared |

`admin-users.html` is the page with the most real prose gaps, driven by
the role-description paragraphs inside its New User and Permissions
modals, all inline-styled at 12px.

---

## Low-density layout findings

The stacked-to-inline smell is mostly already handled. Remaining
candidates, ranked:

1. Cardex Variance figure blocks (`.cxh-fig-k` caption stacked above its
   value, 12px caption). Same shape as the pre-fix check-band. Inline
   caption-plus-value at 13px would tighten it and lift the caption to
   the floor. Borderline: these sit on a data card.
2. AI-tier ladder rows in admin home (`.ai-level-name` at 12.5 plus
   `.ai-level-desc` at 11.5). Already a row layout, so this is really a
   px fix, not a re-layout. Bump the description to 13.5.
3. The `.review-*` reminder band on admin pages reads as a stacked
   label/sub/ack/button block. It is conditionally shown (only when a
   review is due, so it was not visible in the demo state). If it renders
   tall with horizontal whitespace, it is a candidate for the inline
   check-band treatment; confirm when a review is actually due.

No broad low-density rewrite is warranted.

---

## Recommendation

Treat this as a targeted fix-set, not a rewrite. Suggested order for the
owner-reviewed batch:

1. `.ai-level-desc` to 13.5 (worst, visible in both analyst dock and
   admin home).
2. Shared admin chrome: `.review-label`, `.review-text`, `.review-sub`,
   `.review-cadence`, `.fetch-error` to 13.5.
3. `admin-users.html` modal role-description paragraphs to 13.5.
4. Analyst prose: `.txv-ai-ctx`, `.perp-opt-note`, `.perp-resid` to
   13.5.
5. Per-page admin prose (`.conn-sub`, `.scanned`, `.purge-rec-remind`,
   `.nu-co`, `.perm-cos-*`) to 13.5.
6. Batch decision on the 13px "marginal" rows: sweep them 13 to 13.5, or
   leave them.

Leave the micro-label layer alone: uppercase eyebrows, pills, table
column heads, count chips, footers, timestamps, and short CTA links.
Raising those breaks the visual hierarchy the pages depend on and adds
noise for no legibility gain.
