# RapidReconciler University — Search Index

This folder contains a client-side full-text search system for the
RapidReconciler University knowledge base. It runs entirely in the visitor's
browser — no server, no API, no recurring cost — and works on plain GitHub
Pages hosting.

## How it works

```
build-search-index.py  ──reads──▶  *.html docs
        │
        └──writes──▶  search-index.json
                            │
                            ▼
        rapidreconciler-university.html
                            │
                            ▼
                    lunr.js  (loaded from CDN)
                            │
                            ▼
                Ranked, snippet-highlighted results
                deep-linking to the matched section
```

1. `build-search-index.py` walks the folder, parses every `*.html` doc, and
   splits its content into searchable sections.
2. The script writes `search-index.json` next to itself.
3. The homepage loads `search-index.json` on page load and feeds it to
   [lunr.js](https://lunrjs.com/) — a 30 KB MIT-licensed full-text search
   library.
4. When a user searches, lunr returns ranked hits with anchor URLs that
   deep-link straight to the matched section.

## When to re-run the build script

Re-run the script whenever you:

- Add a new `.html` doc to this folder
- Edit the content of an existing doc
- Rename or delete a doc
- Change document titles or major headings

If you forget, the search will still work — it'll just be searching the
**old** content. Stale results are the worst case; nothing breaks.

## Running it manually

```bash
# One-time setup (only needed the first time on a new machine):
pip install beautifulsoup4

# Re-build the index:
cd path/to/RRUniversity/
python3 build-search-index.py
```

You'll see a per-file count of indexed sections, then the total record count
and output file size:

```
Building search index from 23 files in /…/RRUniversity

  complex-password.html                                7 sections
  getting-started-with-rapidreconciler.html            4 sections
  …
  transfer-order-reference.html                       25 sections

  TOTAL: 238 records across 23 docs
  WROTE: search-index.json (1128.6 KB)
```

After the build, commit both `search-index.json` and any changed `.html`
docs and push to GitHub. GitHub Pages will gzip-compress the JSON over the
wire (the 1.1 MB raw file ships at roughly 220 KB gzipped).

## Page format support

The script handles two layouts automatically:

- **SPA-style pages** — those with `<section class="view">` containers
  (like the four `start-here-*.html` pages and the three `*-reconcile.html`
  walkthroughs). Each view becomes its own search record. URLs use the
  `#anchor` fragment that the page's own JavaScript navigates to via
  `showView('topic-anchor')`.

- **Traditional pages** — content is split on `<h2>` boundaries; each
  section's URL uses the `<h2>`'s `id` attribute as the anchor.

Boilerplate (top nav, page header, breadcrumbs, "On this page" sidebar,
"Last reviewed: …" metadata band, footer, scripts) is stripped before
extracting text, so the index contains only the document content.

## Files

| File | Purpose |
|------|---------|
| `build-search-index.py` | The build script. Run when docs change. |
| `search-index.json` | The generated index. Loaded by the homepage at runtime. |
| `rapidreconciler-university.html` | The homepage. Loads the index, runs queries, renders results. |

`search-index.json` is **generated output** — it can be deleted at any time and
rebuilt by running the script. There's no harm in committing it to git
(everything is static text and diffs cleanly enough), and committing it
means a fresh clone of the repo can be served without first running the
script. If you'd rather not commit a generated file, see "Optional: GitHub
Actions" below.

## Optional: GitHub Actions automation

If you don't want to remember to re-run the script before pushing, add the
workflow below to `.github/workflows/build-search-index.yml`. It runs on
every push that touches an `.html` file in this folder, regenerates
`search-index.json`, and commits the result back.

```yaml
name: Rebuild search index

on:
  push:
    paths:
      - 'RRUniversity/*.html'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          token: ${{ secrets.GITHUB_TOKEN }}

      - uses: actions/setup-python@v5
        with:
          python-version: '3.x'

      - run: pip install beautifulsoup4

      - run: python3 RRUniversity/build-search-index.py RRUniversity/

      - name: Commit if changed
        run: |
          git config user.name  "github-actions[bot]"
          git config user.email "github-actions[bot]@users.noreply.github.com"
          if git diff --quiet RRUniversity/search-index.json; then
            echo "No changes to search-index.json"
          else
            git add RRUniversity/search-index.json
            git commit -m "Rebuild search index"
            git push
          fi
```

If you go this route, give the `GITHUB_TOKEN` write permission for contents
in **Settings → Actions → General → Workflow permissions** (set to "Read
and write permissions").

## Troubleshooting

**The search box says "Loading search index…" forever.**
The homepage couldn't load `search-index.json`. Check that:
- The file exists in the same folder as `rapidreconciler-university.html`
- The file is valid JSON (you can `cat` it; it should start with `[`)
- You're loading the page over HTTP, not `file://` — browsers block `fetch()`
  on local files. Use any local server, e.g. `python3 -m http.server` in the
  RRUniversity folder, then visit `http://localhost:8000/`.

**The search box says "Search unavailable — index file missing".**
Same root cause as above; the homepage gave up after the fetch failed.

**Search returns 0 results for a term I know is in the docs.**
- Make sure you re-ran the build script after editing the doc.
- Try a simpler version of the term — lunr stems words, so "reconciliations"
  and "reconciliation" both find the same content, but unusual coined terms
  may need an exact match. The homepage falls back to prefix-wildcard
  matching if the strict query returns nothing.

**A doc was renamed and old links are broken.**
Search-index.json contains URL references. Re-run the build script to
regenerate them with the new filenames.

## How big can this scale?

lunr handles tens of thousands of records comfortably in the browser. The
current index has 238 records and builds in ~700 ms in Node, similar in a
modern browser. You can roughly 10× the doc count before you need to
consider switching to a server-side search (Algolia, Typesense) or a more
sophisticated client-side library (FlexSearch, MiniSearch).
