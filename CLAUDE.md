# RapidReconciler-AI — Project Guide for Claude

## What this project is

A static HTML knowledge base for GSI RapidReconciler, deployed via GitHub Pages at
`https://rapidreconciler.github.io/RapidReconciler-AI/`. It has two main branches:

- **RR University** — public-facing guides for customers and end users
- **GSI RR Tech / Sales** — internal operational docs for GSI staff

The entry point for everything is `Hub/rapidreconciler-hub.html`.

---

## Folder structure

```
RapidReconciler-AI/          ← repo root
├── 404.html                 ← GitHub Pages redirect for missing-repo-name URLs
├── CLAUDE.md                ← this file
├── rapidreconciler-hub.html ← top-level navigation (lives at the repo root)
│
├── RRUniversity/            ← PUBLIC: customer-facing knowledge base
│   ├── rapidreconciler-university.html
│   ├── getting-started-with-rapidreconciler.html
│   ├── ui-reference.html
│   ├── build-search-index.py
│   ├── search-index.json
│   ├── administrator-start-here.html
│   ├── administrator-complex-password.html
│   ├── inventory-*.html               (10 docs — Inventory module)
│   ├── po-receipts-*.html             (3 docs — AP / PO Receipts module)
│   ├── transfer-order-*.html          (3 docs — Transfers module)
│   └── start-here-{inventory,ap,transfers}.html
│
├── GSIRRTech/               ← INTERNAL: technical staff docs
│   ├── troubleshooting.html
│   ├── Scenarios/
│   ├── start-here-monitor.html
│   ├── start-here-dba.html
│   ├── start-here-developer.html
│   ├── start-here-network-tech.html
│   └── installing-production-database.html / -client-in-valc.html / etc.
│
├── GSIRRSales/              ← INTERNAL: sales staff docs
│   ├── sales-client-management.html
│   ├── start-here-sales.html
│   ├── rr-self-guided-tour.html
│   └── rr-{provisioning,installation-prep,msa-template,contract-template,sow-template,fact-sheet}.html
│
└── Compliance/              ← Compliance attestations (PDFs)
    ├── SOC2-Bridge-Letter.pdf
    └── SOC2-Type2-Report.pdf
```

**Critical for links:** Because `rapidreconciler-hub.html` lives at the repo
root, links from the hub to other folders are written WITHOUT a `../` prefix
(e.g. `href="GSIRRTech/troubleshooting.html"`, not `href="../GSIRRTech/..."`).
A `../` from the root traverses above the repo, dropping `RapidReconciler-AI`
from the URL.

---

---

## Module system (RR University)

The four role cards on `rapidreconciler-university.html` each map to a filename prefix.
Search results are filtered by which cards are toggled on.

| Role card       | Filename prefix   | Docs |
|-----------------|-------------------|------|
| Inventory       | `inventory-`      | 10   |
| AP              | `po-receipts-`    | 3    |
| Transfers       | `transfer-order-` | 3    |
| Administrators  | `administrator-`  | 2    |

**General docs** (no module prefix: `start-here-*`, `getting-started-*`, `ui-reference.html`)
are always visible regardless of toggle state.

**Default toggle state:** Inventory ON, all others OFF. Persists to `localStorage`
under key `rru-search-filters-v1`.

---

## Key conventions

### Naming
- Module docs use `module-descriptive-name.html` (e.g. `inventory-costing.html`)
- Admin docs use `administrator-` prefix (renamed from `start-here-administrator.html`
  and `complex-password.html` — do not use the old names anywhere)
- Scenario files use `scenario-slug.html` inside `GSIRRTech/Scenarios/`

### Links
- Always use **relative paths** between files (`../RRUniversity/foo.html`)
- Never use root-relative paths (`/RRUniversity/foo.html`) — these break on GitHub Pages
  because the site lives at `/RapidReconciler-AI/`, not at `/`

### GitHub Pages URL structure
```
https://rapidreconciler.github.io/RapidReconciler-AI/Hub/rapidreconciler-hub.html
https://rapidreconciler.github.io/RapidReconciler-AI/RRUniversity/rapidreconciler-university.html
https://rapidreconciler.github.io/RapidReconciler-AI/GSIRRTech/troubleshooting.html
```
If a URL is missing `/RapidReconciler-AI/`, the `404.html` at the repo root will
auto-redirect to the correct path.

---

## Regenerating the search index

Run from inside `RRUniversity/` after adding, removing, or renaming any HTML file:

```
python build-search-index.py
```

Requires Python + `beautifulsoup4` (`pip install beautifulsoup4`).

Output: `search-index.json` (273 records across 24 docs as of last build).

The script has a custom extractor for `ui-reference.html` (articles with
`class="ui-entry"`) — one record per entry, 35 total.

---

## Troubleshooting page notes

- Drop-the-email input and paste textarea live in `<section class="hero">`
- Match results live in `<section class="match-section">` below the hero
- Scenario files in `GSIRRTech/Scenarios/` are loaded from `scenarios-index.json`
- The `[hidden] { display: none !important; }` global CSS rule is intentional —
  it ensures JS `element.hidden = true` always wins over display: flex/grid rules
- `EMAIL_STOPWORDS` (300 words) and `EMAIL_PHRASE_BONUSES` live in Block 1 of the
  main `<script>` — they must initialize before `tokenizeEmail()` or the page crashes
- Title-weight scoring: title hits score 3×, body hits score 1×, phrase bonuses 6× (title) / 3× (body)

---

## What NOT to touch without understanding the impact

- `search-index.json` — always regenerate via script, never hand-edit
- The `<script type="application/json">` blocks in `rapidreconciler-hub.html` —
  these are the role-contacts and JSM config data blocks; they've been stripped but
  the CSS selectors for `.jsm-fields` are dead code left intentionally
- `scenarios-index.json` — generated by `build_scenarios_index.py` in repo root
- The `data-role` attributes on path cards must exactly match `data-search-toggle`
  values and the `ROLE_TO_PREFIX` keys in `rapidreconciler-university.html`'s JS
