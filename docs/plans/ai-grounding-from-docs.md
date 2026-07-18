# AI grounding generated from the docs

## Why this exists

`RRV8/config.js` exposes six grounding catalogs that six AI surfaces read and
prepend to their `/api/v1/ai/explain` prompts:

| Constant | Consuming surface |
|---|---|
| `RRV8.ACCT_GROUNDING` | `home.html` (accountant reads) |
| `RRV8.ANALYST_GROUNDING` | `inventory-transactions.html` |
| `RRV8.CARDEX_GROUNDING` | `inventory-cardex-variance.html`, `home.html` |
| `RRV8.ROLLFORWARD_GROUNDING` | `inventory-account-rollforward.html` |
| `RRV8.ASOF_GROUNDING` | `inventory-asof.html` |
| `RRV8.ADMIN_GROUNDING` | `home.html` (Administrator Ask-AI pills) |

Those catalogs used to be hand-written paraphrases of the knowledge-base docs.
Hand paraphrases drift: someone edits a doc, the grounding stays as it was, and
the AI reasons from a stale copy. This pipeline removes the paraphrase step for
the catalogs that have a clean source. The grounding becomes an extract of the
real doc text instead of a second copy that has to be kept in sync by hand.

The `RRV8.*_GROUNDING` interface does not change. The six surfaces read the same
constant names and are never touched. Only the string content of the constants
changes.

## How it works

`Tools/build-ai-grounding.py` rewrites a marker-delimited block in
`RRV8/config.js`:

```
  // <<AI-GROUNDING GENERATED START -- do not edit by hand>>
  ... the six window.RRV8.*_GROUNDING assignments ...
  // <<AI-GROUNDING GENERATED END>>
```

This is the same insertion-point pattern the release-notes workflow uses. The
generator finds the two markers, splits the block into one segment per catalog,
and for each catalog either regenerates it from its source docs or copies its
current text through unchanged. Everything outside the markers is left alone.

Extraction is stdlib only (`html.parser`, no BeautifulSoup, no pip install). For
each source doc it drops the chrome (`script`, `style`, `nav`, `header`,
`footer`, `aside`, `svg`, `button`, and elements whose class marks them as
sidebar, breadcrumb, page header, feedback band, or footer nav), then keeps the
readable block text: headings, paragraphs, list items, and table rows rendered
as `cell | cell`. Lines are de-duplicated and BOM and zero-width characters are
stripped. Output is escaped for ES5 single-quoted string literals and written
back with the file's existing CRLF endings and no BOM.

Run it directly:

```
python Tools/build-ai-grounding.py          # rewrite the block
python Tools/build-ai-grounding.py --check   # exit non-zero if the block is stale
```

The generator resolves paths from its own location, so the working directory
does not matter.

## Topic to source map

Which catalogs are generated is controlled by the `GENERATE` tuple and the
`SOURCES` map at the top of the generator.

### Generated from docs

`ADMIN` is generated from the RapidReconciler University administrator docs, in
this order:

- `RRUniversity/administrator-start-here.html`
- `RRUniversity/administrator-managing-users.html`
- `RRUniversity/administrator-managing-companies.html`
- `RRUniversity/administrator-complex-password.html`
- `RRUniversity/rapidreconciler-licensing.html`

These are procedural reference docs. Their readable body text works as grounding
without a summarization step, which is why ADMIN is the first catalog moved onto
the pipeline.

### Passthrough pending

The five analyst catalogs are left as their current hand-authored text. Each has
a topic in `SOURCES` with an empty list and a comment naming the closest source:

| Catalog | Closest source | Why it is not generated yet |
|---|---|---|
| `ACCT` | `docs/plans/accounting-reference.md` | Prose reference with no liftable policy block |
| `ANALYST` | `AnalysisGuides/transaction-detail-analysis.md` | 1381-line report guide; needs distillation |
| `CARDEX` | `AnalysisGuides/cardex-variance-analysis.md` | 749-line report guide; needs distillation |
| `ROLLFORWARD` | `AnalysisGuides/inv-account-roll-forward-analysis.md` | 709-line report guide; needs distillation |
| `ASOF` | none | No dedicated as-of guide; the model spans several pages |

The reason is quality, not laziness. The current analyst catalogs are short,
distilled policy that an SME curated. The analysis guides are long-form
references written for a different job. A mechanical extractor can only dump or
truncate them, and either one would replace a tight working catalog with a noisy
wall of text. Turning those guides into grounding needs a summarization step, and
there is no LLM available inside a CI step to do it. Until a distilled source
exists (or the guides grow a dedicated grounding section that can be lifted), the
five stay hand-authored and pass through the generator untouched.

To move a catalog off passthrough later: add its topic to `GENERATE` and give it
a real `SOURCES` list. Nothing else changes.

## Size tradeoff for ADMIN

The generated ADMIN catalog is much larger than the paraphrase it replaced. The
five admin docs extract to roughly 65 KB of text, and that text is prepended to
every admin AI call. Most of the volume comes from `administrator-start-here.html`,
which is a long onboarding hub that covers the AI-assistant data policy, the
vocabulary glossary, and a self-check quiz alongside the procedural material.

This is the fidelity tradeoff the pipeline is built around: the grounding is now
the real doc text rather than a lossy summary, at the cost of length. If the size
becomes a problem for prompt cost, the lever is the `SOURCES["ADMIN"]` list.
Dropping `administrator-start-here.html` cuts it to about 30 KB and keeps the
users, companies, password, and licensing procedures. Trimming the source list
is a one-line edit and does not touch any doc.

## Regeneration in CI

`.github/workflows/refresh-ai-grounding.yml` regenerates the block on push to
`main` when a source doc, the guides, the generator, or the workflow changes,
then commits `RRV8/config.js` back. It mirrors `refresh-indices.yml` (Python
generator, then a commit with a pull-rebase-retry push loop). Two differences:

- It runs on the self-hosted Windows dev-box runner, which has no bash, so every
  step uses `shell: powershell`.
- The generator has no third-party dependencies, so there is no `pip install`
  step.

`RRV8/config.js` is not in the trigger paths, so the bot's own commit does not
retrigger the workflow. The commit also carries `[skip ci]`.

If you would rather run this on a GitHub-hosted Ubuntu runner like
`refresh-indices.yml`, the generator runs there unchanged (stdlib only). Switch
`runs-on` to `ubuntu-latest`, add an `actions/setup-python` step, and translate
the two PowerShell steps to bash.

## Hard boundaries

- The generator reads `RRUniversity/*.html` and never writes to them. Doc content
  is owned by another process.
- The six consuming surfaces are never edited. Only the constant content changes.
- The only file the generator writes is `RRV8/config.js`, and only the region
  between the two markers.
