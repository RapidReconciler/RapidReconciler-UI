# Analyst-screen standardization — plan

Bring the analyst/accountant work screens onto the product-page visual standard
(the one now on the admin pages) ahead of building the analyst tour. Written
2026-07-19.

## Why this isn't the admin pass repeated

The admin sub-pages were simple single-column card pages, so `admin-chrome.css`'s
`.page`/`.main`/`.card` shell fit them directly. The analyst screens are different:

- **All on the OLD palette** — `--navy-deep:#142037`, `--blue:#2b5fb0`,
  `--bg:#fafbfd` flat (no command-center wash). None link `admin-chrome.css`.
- **Three chrome states** (surveyed 2026-07-19):
  - Old topbar + breadcrumb: `inventory-account-rollforward`, `inventory-reroll`,
    `inventory-variance-source`, `accounting-dmaais`.
  - Neither topbar nor corner-chrome (own work-screen header): `inventory-transactions`,
    `inventory-cardex-variance`, `inventory-asof`, `accounting-model-review`.
  - `home.html` — its own landing chrome (the source of the standard; leave it).
- **Complex layouts** — grids (drag-reorder, column chooser, Excel pill), trend
  charts, scope bars, tabbed panels. `admin-chrome.css`'s `.page{max-width:880px}`
  + `.main{padding:64px}` would fight a full-width grid.

So the goal is: adopt the **universal chrome** (canonical palette + command-center
wash + floating corner-chrome), **without** imposing the admin page-shell.

## Approach — link + override, no new duplication

A standardized work screen should:
1. `<link href="admin-chrome.css">` after fonts, before its inline `<style>` — it
   inherits the palette, wash, `.corner-chrome`/`.home-fab`, and shell defaults.
2. In its inline `<style>`, **override the shell to fit its content** — keep the
   grid/chart widths (`.page`/`.main`/container max-widths as the screen needs),
   its panel headers, scope bars, and tabs. Inline wins by source order.
3. Convert chrome markup: old `.topbar` header → the floating corner-chrome
   (`.corner-chrome > a.home-fab.topbar-home`); delete breadcrumb + footer.
4. Guard any JS that set `#js-topbar-db` / `#js-app-ver` on removed nodes.

This reuses the one shared stylesheet (no per-page palette copy-paste — the same
drift that bit the admin pages) while letting each work screen keep its layout.

**Watch the `.corner-chrome .home-fab` specificity fix** — it already beats
`sidebar.css`'s `.topbar-home` hook, so linking `admin-chrome.css` gives work
screens the correct pill for free.

## Risk split — what to do when

### Low risk — safe to convert now (the old-topbar stragglers)
`inventory-account-rollforward`, `inventory-reroll`, `inventory-variance-source`,
`accounting-dmaais`. These already have the exact old topbar+breadcrumb the admin
pages had; the conversion is the proven transformation + a palette/wash adoption.
Content is simpler than the core grids. **Status: handed to a background agent
2026-07-19; verify live before committing.**

### Higher risk — deliberate pass with the owner's eye (the tour centerpieces)
`inventory-transactions` (the AI centerpiece, 2,900 lines), `inventory-cardex-variance`,
`inventory-asof`, `accounting-model-review`. These have bespoke work-screen chrome
(panel-header standard: company left / title center / action right; scope bands;
magnitude bars; tabs). Adopting the palette + wash + corner-chrome is desirable for
tour consistency, but each needs a **live per-screen check** that the grid/chart/tab
layout survives the palette + shell change — and the panel-header standard
(`project_v8_panel_header_standard`, `project_scope_band_standard`) must be
reconciled with the shared shell, not overwritten. **Do NOT mass-apply blindly.**
Sequence: transactions first (highest value + highest risk), eyeball, then the rest.

## Open question for the owner
Should the universal chrome (palette + wash + corner-chrome) be split OUT of
`admin-chrome.css` into a `product-chrome-core.css` that both admin pages and work
screens import, leaving `admin-chrome.css` as just the admin page-shell on top? That
is the cleaner long-term structure (work screens link only the core), but it
re-touches the just-committed `admin-chrome.css`. The link+override approach above
works without that refactor; the split is a nice-to-have to decide before the core
screens are done.
