# RapidReconciler-AI — Project Guide for Claude

A static HTML knowledge base for GSI RapidReconciler, deployed via GitHub Pages
at `https://rapidreconciler.github.io/RapidReconciler-AI/`.

The entry point for everything is `rapidreconciler-hub.html` at the repo root.

---

## Folder structure

```
RapidReconciler-AI/                  ← repo root, hub lives here
├── rapidreconciler-hub.html         ← top-level navigation
├── 404.html                         ← GH Pages fallback for missing-repo-name URLs
├── CLAUDE.md                        ← this file
│
├── HelpDesk/                        ← Help desk: scenario search + Helpdesk Tech home
│   ├── troubleshooting.html         ← canonical Help Desk (techs + customers)
│   └── start-here-helpdesk-tech.html ← Helpdesk Tech onboarding
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
│   ├── search-index.json            ← 273 sections across 24 docs (~1.2 MB)
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
└── Compliance/                      ← SOC 2 attestations (PDFs)
    ├── SOC2-Bridge-Letter.pdf
    └── SOC2-Type2-Report.pdf
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
  `data-common`, `data-category` all drive search/filter logic. Preserve
  them when editing card markup.

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

- **After every commit-and-push, pause and prompt the user to sync their
  local worktree.** The owner runs in a separate clone and needs to pull
  origin/main into their local main before any follow-up work happens on
  top. Standard prompt format: *"Pushed `<sha>`. Pull into your local main
  when ready, then say synced and we'll keep going."* Wait for the user's
  confirmation (typically "synced" or "done") before starting the next
  change. This keeps the local environment lined up with origin and lets
  the user spot-check the GitHub Pages deploy if they want.

- **Auto-regen commits land after every push that touches indexed files.**
  A GitHub Action regenerates `RRUniversity/search-index.json` and
  `Scenarios/scenarios-index.json` (and the install-scenarios index) and
  pushes a `chore: refresh search indices [skip ci]` commit. Don't try to
  hand-edit the index files locally — they'll be overwritten. The
  user-prompt-to-sync above gives the user time to pull both the main
  commit AND the follow-up regen commit before we add anything on top.
