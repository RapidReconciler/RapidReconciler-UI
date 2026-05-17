# RapidReconciler-AI — Project Guide for Claude

A static HTML knowledge base for GSI RapidReconciler, deployed via GitHub Pages
at `https://rapidreconciler.github.io/RapidReconciler-AI/`.

Two top-level landing pages at the repo root:

- **`rapidreconciler-help.html`** &mdash; the **customer-facing cover page**
  (Help portal). Three destination cards: University, Help Desk, Export
  Analyzer. The in-app Help button and external links target this page.
- **`rapidreconciler-hub.html`** &mdash; the **internal staff hub**. Routes
  GSI sales, tech, and support staff to per-team landing pages. Not
  customer-facing.

---

## Folder structure

```
RapidReconciler-AI/                  ← repo root
├── rapidreconciler-help.html        ← customer-facing cover (3 destination cards)
├── rapidreconciler-hub.html         ← internal staff hub (per-team landing pages)
├── release-notes.html               ← auto-updated by GHA on push to main
├── 404.html                         ← GH Pages fallback for missing-repo-name URLs
├── CLAUDE.md                        ← this file
│
├── .github/
│   ├── scripts/
│   │   ├── update_release_notes.py  ← prepends Release-Note: trailer content to release-notes.html
│   │   └── update_doc_dates.py      ← injects per-file last-commit date into each customer doc
│   └── workflows/
│       ├── refresh-indices.yml      ← regenerates the 3 search-index JSONs
│       ├── update-release-notes.yml ← runs update_release_notes.py on push to main
│       └── update-doc-dates.yml     ← runs update_doc_dates.py on push to main
│
├── HelpDesk/                        ← Help desk: scenario search + Helpdesk Tech home
│   ├── troubleshooting.html         ← canonical Help Desk (techs + customers)
│   └── start-here-helpdesk-tech.html ← Helpdesk Tech onboarding
│
├── Tools/                           ← In-browser utilities (third surface on the help page)
│   └── analysis-workbook.html       ← Drop-an-xlsx → formatted analysis workbook generator (8 templates)
│
├── Scenarios/                       ← One HTML file per troubleshooting scenario
│   ├── scenarios-index.json         ← search index (22 scenarios)
│   ├── scenario-template.html       ← template for new scenarios
│   └── scenario-*.html              ← 22 scenario pages
│
├── RRUniversity/                    ← PUBLIC: customer-facing KB + Help
│   ├── rapidreconciler-university.html  ← KB landing + per-module search
│   ├── help.html                    ← redirect shim → ../HelpDesk/troubleshooting.html
│   ├── getting-started-with-rapidreconciler.html
│   ├── ui-reference.html
│   ├── search-index.json            ← ~290 sections across the 35 RR University docs (~1.2 MB)
│   ├── build-search-index.py        ← regenerates search-index.json (Python)
│   ├── administrator-*.html         (Administrator module)
│   ├── inventory-*.html             (Inventory module — 10 docs)
│   ├── po-receipts-*.html           (A/P module — 3 docs)
│   ├── transfer-order-*.html        (Transfers module — 3 docs)
│   └── start-here-{inventory,ap,transfers,administrator}.html
│
├── GSIRRTech/                       ← INTERNAL: install + product engineering
│   ├── tech-team.html               ← 3 tech role cards (DBA, Network Tech, DB Developer)
│   ├── tech-client-management.html  ← workflow: install → go-live
│   ├── start-here-{dba,network-tech,developer}.html
│   ├── installing-production-database.html
│   ├── installing-client-in-valc.html
│   ├── certificate-management.html
│   ├── install-troubleshooting.html ← search hub for install scenarios
│   └── install-scenarios/           ← 16 install scenario pages
│       └── scenario-*.html
│
│   Note: Helpdesk Tech onboarding lives in HelpDesk/. server-migration.html
│   lives in RRUniversity/.
│
├── GSIRRSales/                      ← INTERNAL: sales staff docs
│   ├── sales-client-management.html ← workflow: prospect → contract
│   ├── start-here-sales.html
│   ├── rr-self-guided-tour.html
│   ├── rr-discovery-call.html
│   ├── rr-provisioning.html
│   ├── rr-installation-prep.html
│   ├── proof-of-concept.html
│   └── rr-{msa,contract,sow}-template.html
│
├── Compliance/                      ← SOC 2 attestations (PDFs)
│   ├── SOC2-Bridge-Letter.pdf
│   └── SOC2-Type2-Report.pdf
│
└── docs/                            ← INTERNAL: repo-side planning + design notes
    └── plans/                       ← saved plans for deferred features — read on session start
        ├── analyzer-disclaimer-and-feedback.md
        ├── dmaai-system-context.md
        └── rapidreconciler-db-bootstrap.md
```

---

## Link path rules — read this before editing hrefs

**The hub lives at the repo root**, not in a `Hub/` subfolder. Get path
prefixes right depending on which file the link is in:

| Source file location          | Linking to a sibling folder file        | Use this href                          |
|-------------------------------|-----------------------------------------|----------------------------------------|
| Repo root (the hub)           | `HelpDesk/troubleshooting.html`         | `HelpDesk/troubleshooting.html`        |
| Inside any subfolder          | `HelpDesk/troubleshooting.html`         | `../HelpDesk/troubleshooting.html`     |
| Inside `HelpDesk/`            | The hub itself                           | `../rapidreconciler-hub.html`          |
| Inside `HelpDesk/`            | A scenario file in `Scenarios/`         | `../Scenarios/scenario-foo.html`       |

**Never write `../FOLDER/file.html` from the hub** (which is at root) — the
`../` traverses above the repo and the URL drops the `RapidReconciler-AI`
segment, producing 404s.

**Never write `/RapidReconciler-AI/...`** absolute paths — works only on the
deployed site, breaks every other context.

---

## Architecture: Customer-facing cover page

`rapidreconciler-help.html` is the landing page customers see when they
click the in-app Help button (via the `RRUniversity/help.html` redirect
shim) or open the public Help portal.

- **Wordmark banner** with brand, `HELP` + `Beta` pills, a `Take the
  90-second tour` button, and a `Release notes` link (pill, mirrors the
  tour button styling so they read as a pair).
- **Split hero** &mdash; title/lede on the left, a 3-card fanned product
  collage on the right (hidden under 960px). Below the lede is a
  **persona-chip row** (`.persona-chips`) with three chips: *I am using
  the application*, *I am supporting the application*, *I need to
  analyze an export*. Each chip has a `data-target` (`university` /
  `helpdesk` / `analyzer`).
- **3 destination cards** (`.destination-card`) for University, Help
  Desk, and the Export Analyzer. Each card carries a matching
  `data-card` attribute so the chip handler can find it.

**Chip → spotlight behavior**: clicking a chip adds `.has-spotlight` to
the `.destinations` container and `.is-spotlit` to the matching card.
CSS dims the non-spotlit cards to 38% opacity + desaturate and gives
the chosen card an accent-colored glow ring with a slow pulse
(`@keyframes persona-pulse-*`). Re-clicking the active chip clears the
state. Respects `prefers-reduced-motion`. When editing cards, **preserve
the `data-card` attribute** &mdash; without it the chip can't find the
card to spotlight.

---

## Architecture: Hub

`rapidreconciler-hub.html` is intentionally minimal:

- **Topnav** with brand + 3 links: RR University, Help Desk, (Documents
  scrolls down)
- **Hero** with title/lede + 2 compliance shortcut buttons (SOC 2 Bridge
  Letter, SOC 2 Type 2 Report — both compose-email mailtos) + a "What's
  inside" glass card with 5 destination links: See the product, Sales
  Roles, Tech Team, RR University, Help Desk
- **Stats band** (24 / 6 / 2 / 12+)
- **Footer**

The hub does NOT embed roles, scenarios, or compliance documents. Each lives
on its own per-team page.

---

## Architecture: Per-team role pages

- `GSIRRTech/tech-team.html` — 3 tech role cards (RR DBA, Network Tech, DB
  Developer). Hero links to: Tech Workflow, Install Reference, Help Desk,
  Certificate Management. The Helpdesk Tech role is intentionally excluded —
  it's a triage role (not workflow execution), so its onboarding doc and
  daily tool both live on the Help Desk page.

The hub's "Sales" link goes directly to `GSIRRSales/start-here-sales.html`
(no per-team role landing page on the sales side).

Each tech role card uses the original `entry-card` format with VIEW DETAILS →
start-here doc and WORKFLOW → workflow doc footer links.

---

## Architecture: Help Desk page

A single search-first page serves both techs and customers:

- **`HelpDesk/troubleshooting.html`** — the canonical Help Desk. Sibling
  `start-here-helpdesk-tech.html` is the Helpdesk Tech onboarding doc;
  sibling `log-analyzer.html` is the agent-log / browser-console paste
  triage tool. Both are linked from the welcome banner with internal-leaning
  labels — customer visitors self-filter past them.
- **`RRUniversity/help.html`** — a thin auto-redirect shim
  (`<meta http-equiv="refresh">` + `window.location.replace`) pointing at
  `../HelpDesk/troubleshooting.html`. The deployed RapidReconciler app has
  its in-app "Help" button hard-baked at this URL, so the path is preserved
  forever as a redirect — never restore a separate customer-facing page
  here.

The page:

- Hero has a 6-row textarea (paste-friendly — Copilot-summarized emails,
  pasted error messages). Search debounce: 180ms.
- **Default state**: Common scenarios panel shows 6 hand-picked cards. The
  6 cards are the only scenario cards in the HTML; the other scenarios live
  solely in `scenarios-index.json` and surface via search.
- **Search state**: Common scenarios panel hides; results panel shows a flat
  list of matching scenario titles + category pills. Source:
  `../Scenarios/scenarios-index.json` (lazy-fetched on first search, cached
  for the session). A race-condition guard discards stale renders if the
  user keeps typing.
- Clicking a result navigates to the destination scenario page.

The RR University search is **scoped to RR University only** (handled on
`RRUniversity/rapidreconciler-university.html`). The Help Desk page searches
**scenarios only**. Each page has one focused search index, no parallel
multi-source fetching.

**To add or swap common scenarios**: toggle the `data-common="true"`
attribute on a scenario card in the HTML. To add a card, copy an existing
one's structure and update the slug/title/category/data-search.

**Scenarios are designed for runbook-style content**: each scenario page
should contain self-resolution steps for a customer, plus an "If it still
doesn't work, escalate to RR support" block. Older scenarios use the
description / possible solutions / related format and will be migrated to
runbooks gradually.

---

## Architecture: RR University

`RRUniversity/rapidreconciler-university.html` is the public KB landing page
with module-aware search:

- **4 role cards** (Inventory / AP / Transfers / Administrators), each with
  an "Include in search" toggle. Default: only Inventory ON; persisted to
  localStorage as `rru-search-filters-v1`.
- **Module → filename prefix mapping** for filtering:

  | Role card       | Filename prefix    | Docs |
  |-----------------|--------------------|------|
  | Inventory       | `inventory-`       | 10   |
  | AP              | `po-receipts-`     | 3    |
  | Transfers       | `transfer-order-`  | 3    |
  | Administrators  | `administrator-`   | 2    |

- **General docs** (no prefix — `start-here-*`, `getting-started-*`,
  `ui-reference.html`) are always visible regardless of toggle state.
- **Search results** render as a 2-tier tree: doc title → section anchors.

---

## Search engine split

Two engines, deliberately:

- **RR University** (`RRUniversity/rapidreconciler-university.html`) uses
  **Lunr.js** with stemming, default English stopwords, and a 3-tier matching
  fallback (strict AND of non-stopword tokens → AND with prefix wildcards on
  ≥4-char tokens → OR with wildcards as last resort). Right tool for ~273
  doc sections with relevance scoring and stemming.

- **The two scenario-search pages** — `HelpDesk/troubleshooting.html` and
  `GSIRRTech/install-troubleshooting.html` — use a **custom matcher**:
  tokenize → strip apostrophes → drop short tokens → drop English stopwords
  → require all remaining tokens to appear in the scenario's `data_search`
  field. Falls back to literal substring match if every token was a stopword.
  Sufficient for small flat indices (10-14 records each) with hand-curated
  `data_search` blobs. Do NOT add Lunr to
  these pages — the custom matcher is intentional.

Behavior across the two scenario-search pages must stay aligned. If you
change the matcher logic on one, change it on the other.

---

## search-index.json regeneration

`RRUniversity/search-index.json` is built from RR University HTML files by
`RRUniversity/build-search-index.py`. The script extracts every `<section>`
or heading-anchored block and emits a record:

```json
{
  "id":            "doc.html::section-anchor",
  "url":           "doc.html#section-anchor",
  "page_title":    "Document Title",
  "section_title": "Section Title",
  "body":          "concatenated searchable text"
}
```

**Regeneration constraint**: this repo's owner cannot install Python locally
(company policy). Two options:

1. **GitHub Actions** (recommended): set up a workflow that runs the script
   on push to `RRUniversity/` and commits the regenerated index back. No
   local Python required.
2. **Manual**: regenerate in a Python environment elsewhere and drop the new
   `search-index.json` into the repo.

`Scenarios/scenarios-index.json` is generated similarly — same constraints
apply.

---

## Release notes (auto-published)

`release-notes.html` at the repo root is the customer-readable changelog
linked from the cover page's wordmark banner. Entries are appended
**newest-first** by `.github/workflows/update-release-notes.yml`, which
runs `.github/scripts/update_release_notes.py` on every push to `main`.

**Publish model: opt-in via `Release-Note:` trailer.** A commit only
produces a release-notes entry if its body contains a `Release-Note:`
trailer. The trailer's content (the text from the colon through end-of-
body, minus any subsequent known-trailer block like `Co-Authored-By`)
becomes the entry text &mdash; the commit subject and main body are NOT
published. This keeps engineering-detailed commits (which often contain
customer doc numbers, dollar amounts, file names, etc.) off the customer-
facing page; authors write a deliberately customer-safe note in the
trailer.

A commit with no `Release-Note:` trailer is silently skipped.

Trailer formats both supported:

```
Release-Note: One-line customer-safe summary of what shipped.
```

```
Release-Note:
Multi-paragraph notes are also fine — everything from the colon through
the end of the body becomes the entry. Blank lines separate paragraphs.

Co-Authored-By: ...
```

The script:

- Walks `github.event.before..github.sha` (or `HEAD~1..HEAD` on manual
  dispatch).
- Skips commits whose message contains `[skip release notes]`,
  `[skip-release-notes]`, or `[skip ci]`, or whose subject starts with
  `chore: refresh search indices` or `chore: append release notes`.
  (These filters win even if a `Release-Note:` trailer is present.)
- For each remaining commit, extracts the `Release-Note:` trailer
  content. **No trailer = no entry.**
- HTML-escapes the trailer content and inserts a new
  `<article class="rn-entry">` block immediately after the
  `<!-- RELEASE_NOTES_INSERTION_POINT -->` marker.
- **Caps the page at `MAX_ENTRIES` (100)** &mdash; after each prepend,
  trims the oldest articles past the cap so the file doesn't grow
  unbounded.
- Commits with `chore: append release notes [skip release notes][skip ci]`
  to prevent feedback loops.

**To publish a release-notes entry:** include a `Release-Note:` trailer
with deliberately customer-safe wording. The commit subject and body can
contain whatever engineering detail you want.

**To keep a commit out of release notes:** just omit the trailer (the
default). For belt-and-suspenders on a chore commit, also add
`[skip release notes]` to the message.

---

## Common pitfalls

- **Adding `../` to a hub link.** The hub is at root; this dumps the visitor
  out of the repo on click.
- **Modifying `troubleshooting.html` cards directly.** Cards are display-only
  for the 6 commons. Search reads from the indices. Don't try to add a
  17th card to the HTML — add it to `scenarios-index.json` instead.
- **Quoting more than 15 words from any source.** Standing content rule for
  RR University and any external citation.
- **Tier-based language.** The "Tier 1 / Tier 2 / Tier 3" framing was
  retired across the project. Don't reintroduce it.
- **Removing tracked attributes when editing cards.** `data-search`,
  `data-common`, `data-category` drive search/filter logic on Help Desk
  cards; `data-card` (on cover destination cards) and `data-target` (on
  cover persona chips) drive the spotlight handler. Preserve all of
  these when editing card markup.

---

## Style & content conventions

- **Voice**: present tense, second person ("you click", not "the user
  clicks"). Concise, no filler.
- **Code in HTML**: `<code>` for any literal command, path, env var, role
  name like `rrsupport@getgsi.com`, or button label.
- **Em dashes**: written as `&mdash;` in source.
- **Headings**: `<h1>` for page title, `<h2>` for major sections, `<h3>`
  for subsections. Each section should have an `id` for deep linking.
- **Fonts**: Open Sans for body, Source Sans 3 for headings (loaded from
  Google Fonts at the top of every standalone page).
- **Color tokens**: defined in `:root` at the top of each file. Navy
  (#1f2d4a) is the primary brand color; sales = navy, tech = green/teal,
  helpdesk = orange, certificate = orange, db = teal.

---

## Deployment

- **GitHub Pages** serves from the repo root.
- **Site URL**: `https://rapidreconciler.github.io/RapidReconciler-AI/`
- **404 handler**: `404.html` redirects URLs that are missing the
  `/RapidReconciler-AI/` repo-name segment by prepending it.
- **No build step required** for HTML/CSS/JS edits — push, GitHub Pages
  serves immediately.
- **Search index regeneration** is the only build step; see above.

---

## Workflow

- **Work on a worktree branch and squash-merge to main when a chunk is
  release-worthy.** Don't commit directly to main during multi-task
  sessions. Accumulate multiple per-step commits on the worktree branch
  (e.g. `claude/<adjective-name>-<sha>`), then squash-merge to main as
  a single commit whose subject + body describe the released change.
  That squash commit becomes one entry in `release-notes.html`. Trade-
  off accepted: one extra merge step at the end vs. the noise of many
  per-step commits in main's history and in the release-notes page.

- **Hold commits during a working session if the user signals they want
  to batch.** When the user opens with "several tasks lined up" or asks
  to "avoid a large number of commits," stage edits without committing
  until you hit a natural breakpoint, then ask before pushing. (Saved
  to memory as `feedback_batched_commits.md`.)

- **When the owner says "commit," run the full commit-to-sync flow
  end-to-end — don't pause to ask whether to push.** "Commit" means:
  git commit → `git push -u origin <branch>` → open PR via
  `gh pr create` (with the `Release-Note:` trailer in the body) →
  `gh pr merge --squash` → poll for bot commits to settle → fast-
  forward the owner's main clone (the next bullet). Only stop to ask
  if you hit a genuine obstacle (merge conflict, CI failure,
  destructive-action prompt). "Should I push next?" is not a question
  to ask — the owner considers the full sequence one action. Use the
  full path `/c/Program Files/GitHub CLI/gh.exe` since `gh` isn't on
  the PATH the Bash tool sees.

- **After every PR merge, auto-pull origin/main into the owner's main
  clone — no "say synced" handshake.** The worktree shares its `.git/`
  dir with the owner's main clone at `C:/source/repos/RapidReconciler-AI`,
  so once the bots have settled, run
  `git -C "C:/source/repos/RapidReconciler-AI" pull --ff-only origin main`
  to update the main clone, then fast-forward / reset the worktree
  branch to match. Report the new main SHA + which bot commits landed.
  If the pull fails (uncommitted changes in the main clone, owner on a
  non-main branch, etc.) — DON'T force or destroy. Surface the failure
  and let the owner resolve it manually. (Saved to memory as
  `feedback_auto_pull_main.md`.)

- **Auto-regen + release-notes + doc-dates commits land after every
  push to main.** Three GitHub Actions fire:
    - `refresh-indices.yml` regenerates the three search indices when
      relevant HTML or build scripts change, and pushes back a
      `chore: refresh search indices [skip ci]` commit.
    - `update-release-notes.yml` appends an `<article>` entry to
      `release-notes.html` for every commit that carries a
      `Release-Note:` trailer (commits without the trailer are silently
      skipped), and pushes back a `chore: append release notes [skip
      release notes][skip ci]` commit.
    - `update-doc-dates.yml` runs `update_doc_dates.py` to inject each
      customer-facing doc's last-commit date into its `<time
      class="doc-last-updated">` element, and pushes back a `chore:
      refresh doc dates [skip ci]` commit when any dates changed.
  All three workflows ignore each other's commits via `paths-ignore`
  and job-level `if:` guards. Typically two to three of them push a
  follow-up commit per merge (refresh-indices always runs if relevant
  files were touched; release-notes only if a trailer was present;
  doc-dates only if a customer doc was touched).
  Don't try to hand-edit the regenerated index files, the doc-date
  `<time>` elements, or expect the release-notes file to be untouched
  between sessions.
