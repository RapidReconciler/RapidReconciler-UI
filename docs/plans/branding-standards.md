# Plan: GSIBranding asset standards (UI repo)

**Status:** Standard + remediation list. The standard below is the
target; current state is mostly compliant with two callouts.

**Source:** session conversation 2026-05-27 (Prompt #1, Foundation
+ Environment Setup) following the introduction of the
`Images/GSIBranding/` source-asset folder.

---

## The standard

### Canonical reference paths

Every HTML / CSS / JS surface in this repo references brand assets
through **stable, neutral filenames** under `Images/`:

| Asset | Canonical path | Used by |
|---|---|---|
| Primary GSI logo (color, on light backgrounds) | `Images/gsi-logo.png` | Every page's topbar / banner |
| GSI logo on dark backgrounds (when needed) | `Images/gsi-logo-white.png` | Reserved &mdash; not currently referenced |
| GSI background imagery (meeting / hero) | `Images/gsi-background.png` | Reserved &mdash; not currently referenced |

Pages MUST reference these canonical paths. They MUST NOT inline
brand imagery as base64 data URLs (see remediation #1 below) or
reference vendor-named files (e.g.
`2740154_GSISimpleLogoEdit_042326.png`) directly.

### `Images/GSIBranding/` is **source material only**

The `Images/GSIBranding/` folder holds the vendor-delivered brand
assets (Tagline-Removal variants, Meeting Background revisions V1
through V6, Simple-Logo edits) as they arrive. Filenames there
carry vendor codes (`2740154_*`, `4iybBR*-*`, etc.) and dates.

**Rule:** nothing in `Images/GSIBranding/` is referenced directly
from a page. When a new variant supersedes the canonical asset,
the workflow is:

1. Drop the new vendor file into `Images/GSIBranding/`.
2. Copy it (or convert / resize it) to the canonical neutral
   filename under `Images/`.
3. Commit both: the source variant (audit trail) and the updated
   canonical file.

This preserves the vendor's delivery history while keeping the
HTML stable.

### When the brand changes (tagline removal, etc.)

If the brand identity itself shifts (e.g. the recent "tagline
removal" variants in `Images/GSIBranding/`), the canonical file
gets updated **once**; every page picks up the change without an
HTML edit. That's the whole point of routing references through
the neutral filename.

Before swapping the canonical file, verify with the brand owner
that:

- The new variant is approved for customer-facing surfaces.
- The aspect ratio is compatible with the existing CSS sizing
  (currently constrained by `width` / `height` attributes on the
  `<img>` tags rather than the file's intrinsic dimensions, so
  most variants drop in cleanly).
- A white-background variant exists for any page that uses the
  logo on dark chrome (e.g. the navy sidebar surfaces &mdash;
  though those mostly use the inline "RR" wordmark mark rather
  than the GSI logo).

---

## Current state &mdash; audit

`grep` across `*.html` / `*.css` / `*.js` finds **every page**
references `Images/gsi-logo.png` consistently. Specifically:

- All top-level customer-facing pages
  (`rapidreconciler-help.html`, `rapidreconciler-hub.html`,
  `login.html`, `release-notes.html`)
- All RR University pages (via the doc-chrome loader at
  `Tools/doc-chrome.js`, which builds `Images/gsi-logo.png` from
  its own script URL)
- All RRV8 topbar logos (`accounting-dmaais.html`,
  `admin-companies.html`, `admin-users.html`,
  `inventory-asof.html`, `inventory-cardex-variance.html`,
  `inventory-reconciliation.html`, `inventory-transactions.html`)
- HelpDesk + Scenarios pages
- The Export Analyzer toolchain (`Tools/how-to-use-export-analyzer.html`)
- The CSS doc-header (`Tools/doc-header.css` references the
  canonical path in a comment)

The pattern is in good shape. Two exceptions to remediate.

---

## Remediation list

### 1. Replace the base64-inlined logo in `GSIRRSales/rr-self-guided-tour.html`

`rr-self-guided-tour.html` embeds the GSI logo as a base64 data
URL (`<img class="gsi-logo" src="data:image/jpeg;base64,/9j/4AAQ...">`).
This dates from before the `Images/gsi-logo.png` standard was
established. The base64 blob:

- Inflates the page weight by ~50&ndash;100 KB.
- Misses every future brand refresh (it's hardcoded; updating
  `Images/gsi-logo.png` doesn't propagate).
- Caches poorly compared to a static asset.

**Fix:** replace the `<img src="data:...">` with
`<img src="../Images/gsi-logo.png" alt="GSI" />` matching the
sibling `rr-assist-self-guided-tour.html` pattern.

Risk: visual difference if the embedded JPEG ever differed from
the canonical PNG. Worth diffing the two before swapping; if they
agree, swap is mechanical.

### 2. Commit `Images/GSIBranding/` so the source assets are tracked

Currently untracked (`git status` shows `?? Images/GSIBranding/`).
Add and commit so the vendor delivery history is preserved.

Files in the directory (verified 2026-05-27):

- `2740154_GSISimpleLogoEdit_042326.{jpg,png}` &mdash; logo edit
- `4ixorcz*-2739511_UpdatedGSIMeetingBackgroundsV{1..4}_051226.png`
  &mdash; meeting background variants delivered 2026-05-12
- `4iybBR*-2739511_UpdatedGSIMeetingBackgroundsV{1,2,5,6}_050626.png`
  &mdash; earlier meeting background variants from 2026-05-06
- `4iybdQ*-2743928_GSI_TaglineRemovalonLogo{Color,White}_050626.png`
  &mdash; tagline-removal logo variants (color + white)
- `Transparent Background.png`, `White Transparent Background.png`
  &mdash; canvas placeholders

Once committed, decide whether the tagline-removal variant should
become the new canonical `Images/gsi-logo.png` (brand-owner
decision, deferred &mdash; not part of this pass).

---

## Recommendations

1. **Adopt the doc-chrome loader pattern more broadly.**
   `Tools/doc-chrome.js` already derives `Images/gsi-logo.png`
   from its own script URL, so per-page hrefs don't need to know
   their depth. Pages currently using `<img src="../Images/gsi-logo.png">`
   work fine, but new doc pages should opt into doc-chrome rather
   than hardcoding the path.
2. **Add a `gsi-logo-white.png` ahead of need.** Any future dark-
   themed surface (the VALC 2.0 sidebar already uses a custom
   inline "RR" wordmark, but a future page might want the real
   GSI logo on navy) should have a white-variant ready. Source
   it from the GSIBranding `*_OnLogoWhite_*.png` delivery.
3. **Document the canonical paths in
   [`CLAUDE.md`](../../CLAUDE.md).** A one-paragraph "Branding
   assets" note pointing at this plan keeps future edits aligned
   without having to rediscover the standard.

---

## What this plan deliberately does NOT cover

- **Brand-identity decisions.** Whether to swap to the
  tagline-removal logo as the canonical file is a brand-owner
  call, not an engineering one.
- **Customer-facing site theming.** The hub / help / launchpad
  pages have their own theming conventions
  (`Tools/welcome-banner.css` vs. doc-chrome); branding asset
  references slot into whichever is in use.
- **Logo usage in the Export Analyzer's generated workbooks.**
  Those are runtime-generated and may embed the logo differently.
  Out of scope for this standard.
