# Analyst-view redesign (home.html)

**Status:** increment 1 built 2026-07-05 (autonomous, owner delegated — UI-4).
**Owner review:** live, read-only verified for no console errors; layout is the owner's eye.

## Why

The accountant home became a real triage surface this cycle: a per-company
reconciliation worklist, GL roll-forward, Perpetual at-a-glance, an AI band.
The **analyst** view kept the same top AI band + sub-nav (Workspace | Reports)
but the **Workspace** was still just a four-row link list (Model DMAAI Review,
DMAAI Analysis, Transactions, Cardex Variance). It named the analyst's tools
but didn't tell them **where the work is** this period.

The analyst owns the half of reconciliation the accountant can't touch:
roll-forward **breaks**. The accountant worklist literally hands red-dot
companies to the analyst ("Roll-forward break — hand to your analyst to
re-roll"). So the analyst's home should open on **exactly that queue** — the
companies whose roll-forward didn't hold — in the same card language.

## Design language (reuse, don't reinvent)

Match the accountant worklist: `.wl-card` / `.wl-dot` / `.wl-break`, red dot =
break, plain-English cause line, `.wl-actions` buttons. Data comes from the
same `_acctData.companies` the accountant renders (`c.co / c.oob / c.ccy /
c.breaks`), so the two views never disagree about which companies broke. All
helpers used are module-level (`_ccyAmt`, `esc`, `_coNames`).

## Increment 1 — Roll-Forward Integrity worklist (BUILT)

On the analyst **Workspace** sub-view, above the existing tools list:

- **Status band** — "Roll-forward integrity" + a state-dependent lede, colored
  at a glance: **amber** (`is-attention`) when any company needs a re-roll,
  calm **green** (`is-clean`) when all rolled clean. A **right-side arrow always
  opens the account roll-forward detail page** (`inventory-account-rollforward.html`),
  so the analyst can inspect even on a clean period (owner request 2026-07-05).
- **Break cards** (biggest |oob| first): red dot, `Co <n>` + name, a "roll
  didn't hold" cause line, and two actions — **Open Roll Forward**
  (`inventory-account-rollforward.html`, the analyst's fix surface) and
  **Cardex Variance** (`inventory-cardex-variance.html`, the usual root cause).
- **Clean summary** — "N companies rolled clean" trails the break cards; when
  none broke the green band alone carries the all-clear (no empty card list).
- Degrades gracefully: no `_acctData` yet → the panel stays empty, so a
  slow/there's-no-recon-data DB never breaks the view.

## Increment 1b — AI task sequence + tools → Reports (BUILT 2026-07-05, owner direction)

The Workspace is now framed as an **AI-narrated task sequence**: on landing, the
assistant works through the analyst's tasks **one at a time**, each with a brief
**"thinking" beat** (a pulsing sparkle + "Reviewing …") that then reveals the
task content. **Roll-forward integrity is task 1.** The mechanics:

- `renderAnalystWorkspace(d)` runs an ordered `tasks[]` array; each task returns
  a promise, and the **next task's beat starts only when the prior reveals** —
  so the reveal is sequential. A generation counter (`_analystTaskGen`) supersedes
  an in-flight sequence on any DB/scope/sub-view switch (no stale paint).
- **The narration is real AI, grounded in code.** The break *set* is computed
  deterministically from `_acctData` (`c.breaks`); the AI only writes the band's
  one-sentence lede from those facts (`POST /api/v1/ai/explain`), with a ~650 ms
  minimum beat and a 9 s timeout so it never stalls. **AI Off** (`_recsummaryLevel()
  === 'off'`) → a short beat then the deterministic lede; nothing leaves the page.
- **Tools card moved to the Reports tab "for now"** — the Set Up / Troubleshooting
  link card (`#analystWorkspace`) is relocated into `#reportsPalette` (safe:
  `renderReportsPalette` never rewrites the palette's innerHTML) and shown on the
  Reports sub-view. The Workspace is now **purely the task sequence**; tasks come
  in **one at a time, and their order matters** (triage order).

## Increment 1c — page-level scope banner, SINGLE-SELECT (BUILT 2026-07-05, owner direction)

A **context banner at the very top of the page** (moved out of the Workspace, above
the top row; analyst-only, hidden for accountant/admin). It **scopes everything
beneath it** — the top chart AND the task sequence.

- Labeled pairs — **Database · Company · Period · Currency · Total variance**
  (`renderAnalystScope`). Total variance is filled by `renderTxVarWidget` once the
  series loads (`#analystScopeAmt`).
- **Company is SINGLE-SELECT** (owner: kills mixed-currency noise) — always exactly
  one company (`_ensureAnalystSolo` defaults to the first in scope; no "All"
  option). `_analystScopedData` narrows `d.companies` to that one and recomputes
  `currencies` so nothing ever reads "mixed". Page-local (`_analystSoloCo`) — never
  touches cross-page scope / what-if exclude. An orphaned pick (DB switched) resets
  to the first company.
- **Picking a company re-scopes everything**: `renderAnalystScope` + `renderPeriodWidget`
  (top chart) + `renderAnalystWorkspace` (tasks) all re-run against the one company.

## Increment 2 — transaction variance by period (BUILT 2026-07-05)

Roadmap: the analyst's job is **accuracy first, then stop variance recurrence**.
This chart **REPLACES the out-of-balance-by-period chart in the top row** for the
analyst view (`#periodWidget` → `renderTxVarWidget`, branched inside
`renderPeriodWidget`; accountant/admin keep OOB / Perpetual). It is **not** a task
card — the Workspace task sequence below stays the accuracy→recurrence worklist
(roll-forward integrity is task 1). It's a **stacked bar — variance by period,
split by module** (Sales / Purchasing / Manufacturing / Inventory):

- **Categorizer:** `_txModuleOf` — the *exact* function the accountant
  transaction-variance modal already uses (`OT`/`DT`/`Type`), not a reinvention.
- **Format:** the SAME `.pw-*` bar format as the OOB / Perpetual period charts —
  stacked segments per period, **current periods bright / historical dimmed**
  (two most recent = current), "Historical periods dimmed" note. Consistent look;
  `mountPeriodBars` (single-series) stayed untouched.
- **Metric:** **Amount** (Σ |net variance| per module, default) with a **Count**
  (row count) toggle. Scoped to the ONE selected company (single-currency).
- **Interaction (owner: both):** click a **module segment** → Transactions worklist
  for that period+module; click the **period column** → focus that period for the
  AI (`_briefPeriodOverride` → re-triage), current-vs-historical aware. The
  current/historical split is also stashed in `_txVarContext` for AI grounding.
- **Data path (verified against agent source):** one `/inventory/transactions`
  call with `period: null` returns all periods (`WHERE (? IS NULL OR PeriodEnds
  = ?)`), each row carrying `PeriodEnds` + `Type`/`OT`/`DT` + `Variance`. Bucket
  client-side by (period × module). Cached per company-scope; the Amount/Count
  toggle re-renders without refetching.
- **recstatus is the key insight (owner):** the feed view `v6ui_reconcilingitems`
  filters `recstatus = 1`, so the graph shows only the **post-auto-netting
  residual** — what proc 008's netting (`recstatus = 2`) couldn't clear. That's
  the genuine recurrence signal. See dacpac **DAC-8** — improving 008's netting
  shrinks this residual.
- **Drill:** click a segment → `inventory-transactions.html?period=…&module=…`;
  that page now has deep-link intake that seeds `_state.period` + `_state.activeModule`.
- Scope-aware: respects the banner's single-of company pick via `_analystScopedData`.

## Increment 3 — recommendation-led AI card (BUILT 2026-07-05, the demo "wow")

Retired the ported accountant Q&A band for the analyst view; built a dedicated,
**recommendation-led** card (`renderAnalystAiCard`, own `askAnalyst`). The shape
change is the point: it doesn't wait to be asked.

- **Proactive lead, no auto-AI** — a **deterministic headline** names the top
  recurring transaction variance for the scoped company instantly
  (`_analystTxStats` → `_analystLeadText`). **No AI call fires on load** (owner);
  the AI why/how (root cause + corrective action) is **on-demand** via a pill or
  the Ask box, and its output lands in the **dismissible answer band**
  (`askAnalyst` → `#acctAnsBand`), not the card head.
- **Chart-reactive** — company switch and **period-column click** re-read the
  card for that scope/period (current-vs-historical aware).
- **Pills reframed for the analyst's job** — "Biggest bang for the buck?",
  "What can I knock out today?" (low-hanging fruit), "Why does this keep coming
  back?" — own class `.an-qa-pill` (the accountant's delegated pill handler never
  fires on them); the shared Ask box submit dispatches by role.
- **Grounding rewired** — `_analystTxFacts` (module × period magnitude,
  recurrence, current/historical, recstatus=1-residual framing), NOT the OOB
  facts. `_analystPrompt` frames the AI as a reconciliation **consultant** whose
  mission is fewest-manual-entries: root cause + corrective action, prioritized
  by return on effort.

**Next — the domain work (owner's expertise is the whole game):** the prompt's
per-category root-cause knowledge is deliberately light (generic JDE-area
framing). Tuning the real **root-cause → corrective-action taxonomy** per
category (Sales/Purchasing/Mfg/Inventory) is what turns the card from generic to
consultant-grade. Then: **tier differentiation** (Basic = what; Full = root
cause + fix — the demo's "why you need the plan"), and **corrective-action
tracking across periods** (mark in-progress/done; watch the residual shrink).

## Briefing tab — accuracy-check sequence (BUILT 2026-07-05)

Tab renamed **Workspace → Briefing**. The sequence is now the analyst's accuracy
checks, each a thinking-beat → status band (amber = needs attention / green =
clean), same concept as roll-forward integrity:
1. **Roll-forward integrity** (per-company re-roll queue).
2. **Model DMAAI** — `inventory/integrity/model-approval`: approved (green) vs
   changed-since-sign-off / awaiting (amber) + the GL-classes-excluded detail +
   Review/View. Client-wide.
3–5. **UOM Conversion · Frozen Cost · GL-Class** — `_intgFetch` count; amber with
   an Excel button when items are flagged, green when clean. **Install-wide scope**
   (matches the Reports report + Excel) — NOT single-company; revisit if the owner
   wants them scoped to the selected company. Order among the three is arbitrary.

Deterministic for now (count/verdict + thinking beat); the AI root-cause layer is
future (tie into the taxonomy). Still ALSO present as Reports-tab rows — remove
the duplication if the owner confirms.

## Later tasks in the Workspace sequence (owner direction — SEQUENCE MATTERS)

Add each as a new `tasks[]` entry, in triage order. More **accuracy checks** will
slot in *ahead of* task 2 (recurrence). Same pattern: deterministic facts in code,
AI narrates the beat.

- **Cardex drift** — items whose perpetual valuation didn't roll cleanly
  (`cxDot` / `inventory-cardex-variance.html`); an accuracy check, likely between
  roll-forward and transaction variance.
- **Model DMAAI review / DMAAI analysis** — setup-side approvals.

Hold each for the owner's call on order + drill depth (Home vs. dedicated pages).

## Transaction Variance tab — the prioritized corrective-action plan (BUILT 2026-07-05, UNCOMMITTED)

New analyst sub-view **Transaction Variance** (key `txvar`), added to
`SUBVIEWS.analyst` between Briefing and Reports. The demo "wow" surface: not a
chart — a **prioritized plan** that answers "what's the shortest path to fewer
manual entries?" Scoped to the single company in the banner; reuses the shared
`_txVarCache` raw rows (recstatus=1 residual from `/inventory/transactions`).

**Two lanes (`renderAnalystTxVar`):**
- 🍃 **Low-hanging fruit — clear now, no journal entry:**
  1. **Netting finder** (`_txvNetting`) — groups residuals **by account** (never
     across accounts), flags accounts whose rows mostly offset (|net| < 15 % of
     gross, both signs, ≥2 rows) as cross-period/timing washes proc 008_1 couldn't
     pair. Shows gross → nets-to → **clearable with no entry**. This is the true
     lowest-hanging fruit + a preview of DAC-8.
  2. **No-JE rebalance patterns** — GL-Only (5.2) / Cardex-Only (5.3) from the
     ported `_txvClassify`; Reload Cardex / re-roll, no JE.
- 💰 **Biggest bang — fix the source, stop it recurring:**
  1. **DMAAI configs behind the residual** (`_txvDmaaiPlays`) — fetches
     `aai-analysis-latest` FIX-FIRST findings, **attributes residual $ to each by
     (company, docType) overlap**, and shows **only findings with real residual $**
     (the "which DMAAIs actually need review" filter), ranked by $. Reflects the
     owner's "75 % of variance is DMAAI root-cause."
  2. **Expense/JE patterns** — Mfg Cost Mismatch (5.16) / PV (5.17): genuine, needs
     an entry, last.

**AI (`_txvBuildPlan`):** deterministic plan paints instantly (no AI on load);
"Build my plan with AI" sends the full deterministic breakdown to
`api/v1/ai/explain` for the consultant narrative in priority order (net → fix
configs → JE), calling out offsetting pairs. Tier-gated (off disables).

**Deep-links (the "jump to the full page" flow):**
- Cards → `inventory-transactions.html?company=NN&pattern=5.2` (added `company` +
  `pattern` URL intake to that page).
- DMAAI cards → `accounting-dmaais.html?tab=analysis&company=NN&finding=Fn` (added
  `company`/`finding`/`tab` intake to that page).

**Ranking:** lanes sort by $ (materiality); effort is implicit in lane placement
(netting < rebalance < DMAAI-fix < JE). Recurrence (period spread) + a formal
(materiality × recurrence) ÷ effort score + recency weighting are the next tuning
step, plus per-card sequential AI reveal and the residual-over-periods "are we
winning?" strip.

**Follow-ups / known gaps:** docType-level DMAAI attribution is coarse (refine to
account/AAI join once validated); Account-Mismatch (5.4) + Period-Mismatch (5.14)
patterns aren't detected on Home yet (they need the DMAAI/cross-period indexes the
full page builds) — the DMAAI lane covers the account-mismatch story via findings
attribution instead.

## Data health landing REDESIGN (BUILT 2026-07-20, UNCOMMITTED — owner-eyeball pending)

Supersedes the "thinking-beat task sequence" Briefing tab. Owner approved the
pattern via a mockup (`scratchpad/analyst-home-proposed.html`); this is that
mockup landed in `home.html`. Fixes the two problems in the old landing: the
cold open, and the "2 ambers but good to go" contradiction (readiness shouting
while the briefing said you're fine).

**The pattern, top to bottom:**
1. **Header** — `renderAnalystHeader(d)` (home.html:8541) rewrites the analyst
   `role-hero-item` in place: H1 = "&lt;First&gt;, here's where you stand today"
   (first name from `RR_SESSION.user.fn`; graceful fallback, never `undefined`),
   subline trimmed to "analyst · &lt;DB&gt; · Company &lt;co&gt;" (name lives in
   the H1 only, not said twice).
2. **Quiet readiness strip** — `renderAnalystReady(d)` (8558) + `#analystReady`
   (2382). Plumbing ONLY (connectivity / data currency / inventory loaded), green
   single row + "N checks" disclosure. Calm-amber on `_connDown`, never loud.
   Page-level (above the tabs), CSS-gated to the analyst view (home.html:1121).
3. **AI briefing leads** — `_analystDayBrief()` (8706) reuses the live grounded
   pipeline (`POST api/v1/ai/explain`, same `_recsummaryLevel()` tier gating,
   scrubbed-tier masks the company to "this company", generation-guarded, 12s
   timed fallback). Grounded STRICTLY in the settled check classification — NOT
   the mockup's illustrative copy. AI Off → deterministic sentence, nothing leaves
   the page.
4. **"Needs your attention · N"** — `_analystInlineRow()`, each check a SINGLE
   inline row `▲ &lt;title&gt; · &lt;detail&gt; [action]`. Roll-forward sorts
   first (it blocks the period from tying out).
5. **"Cleared · N" rollup** — `_analystClearedHtml()`, collapsible.

**Checks** (`renderAnalystWorkspace`, 8797) reuse the existing live fetches,
reclassified by state into readiness / amber / green: roll-forward from
`c.breaks`/`c.glBreak` (same source as the accountant worklist, so the two never
disagree), model DMAAI via `inventory/integrity/model-approval`, UOM/Frozen/
GL-Class via `_intgFetch`. View buttons reopen `_openIntegrityModal`; deep links
preserved. **Subtext floor: 15px** everywhere (uppercase labels 12.5px, titles
larger) — see the CSS block home.html:1121-1175 + `.acct-top[hidden]` at 247.

**Cross-view safety:** the shared `#acctTop` (Ask card + period chart) is hidden
only on the analyst `work` tab (`_at.hidden = (sv==='work')`, home.html:9012) so
the day-brief leads; every other sub-view shows it, and the accountant path
reshows it explicitly (6409). No stranding.

**Preserved:** `_analystTaskGen` supersession, `_analystScopedData`/
`_analystSoloCo` single-select, tier gating, graceful degrade (no `_acctData` →
strip + tab hide, never broken).

**Verified:** static delimiter balance (whole inline script, 0 errors) + a
code review + a live load at :8765 (parse-clean, zero console errors on load,
seams present in the DOM). NOT visually confirmed in the analyst view — that
needs the owner's eye (forcing the analyst view means mutating the shared
`rrv8.viewRole`, declined while the owner is away).

**Open seams / TODO:**
- **Explained variance · no-action** — the third bucket + section markup are
  built (`_analystRenderChecks`, `#analystExplainedWrap`), but `explained` is
  always `[]`: no classifier signal exists yet, so it renders nothing. No
  fabricated entries. Populate it in `renderAnalystWorkspace` once the classifier
  emits the signal (owner's open item — see [[reference_variance_is_always_a_difference]]).
- **AI day-brief copy** is a first pass — grounded correctly, wording needs an
  owner read.
- **Transaction variance + Cardex variance tabs** — the header + readiness strip
  are already page-level, so they inherit those. Applying the rest of the
  guidelines (AI-leads framing, work-headline, subtext floor, "expected · no
  action") to their bodies is the NEXT increment — do it mockup-first (the flow
  that worked for this landing), NOT speculatively, since the mockup only
  detailed Data health.
