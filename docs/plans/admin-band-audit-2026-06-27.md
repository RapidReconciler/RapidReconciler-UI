# Administrator Band audit — 2026-06-27 (overnight)

Deep audit of the Administrator Band cards on `RRV8/home.html`, **excluding
Service Health + Utilities** (owner is working those). Scope = 6 cards across 2
panels, plus their linked help docs:

| Panel | Card | Page |
|---|---|---|
| People & Licensing | Licensing | `admin-companies.html` |
| | RR Team | `admin-users.html` |
| | Complex Passwords | `admin-complex-passwords.html` |
| Data Management | JDE data refresh | `admin-data-refresh.html` |
| | Purge old data | `admin-purge-data.html` |
| | Correct a Period-End Date | `admin-fiscal-period.html` |

Checks: translation-readiness (`lang="en"`, no `translate="no"`/`notranslate`
on prose, no text baked into SVG/`<img>`), doc/help currency vs. behavior, and
finance-audience content (no SQL/sproc/endpoint/RR-plumbing in user-facing
strings).

---

## ✅ Fixed in this pass (safe, low-risk)

1. **`admin-users.html` — access-review amber band had no background.**
   `.review-band.is-amber` (and the heat-row rule) referenced `var(--orange-pale)`,
   which was **never defined** in `:root`. The "needs review / overdue" band
   therefore showed only its left border + dot in orange, with a white fill.
   Added `--orange-pale: #fdf4e3;` to `:root`. This directly affects the
   access-review band shipped in UI #287 / Valc #169 (V57). *(Verify on reload:
   an overdue/never-reviewed band should now read amber.)*

2. **`admin-companies.html` — `colspan="9"` → `"8"`** on the Licensed Companies
   table's empty-state and error-state rows (lines ~838, ~1366). The table has
   8 columns (the loading row already used 8); the empty/error cells spanned a
   phantom 9th column.

3. **`admin-companies.html` — stale header comment.** The file header claimed
   "Options and Re-roll are intentionally non-functional today." Both are now
   fully wired (Options = edit modal/PUT, Re-roll = confirm/POST). Comment
   updated to match.

4. **`admin-data-refresh.html` — finance-audience leak.** The 409 error message
   ended "…no refresh job is configured **(check VALC)**." "VALC" is internal
   tooling a finance admin won't recognize. Reworded to "…the nightly refresh
   job hasn't been set up yet. If this keeps happening, contact RapidReconciler
   support."

### Verified NOT a problem (false positive)
- **Help-doc deep-link anchors are correct.** Several pages use
  `data-help-src="…/administrator-start-here.html#data"` (and `#utilities`).
  These look "stale" vs. the real section ids (`topic-data`, `topic-utilities`),
  but `administrator-start-here.html`'s `DOMContentLoaded` handler does
  `showView('topic-' + hash)` — so `#data` → `showView('topic-data')` is
  **correct**. Changing them to `#topic-data` would produce `topic-topic-data`
  and break the deep-link. **Left as-is.**

---

## 🚩 Flagged for owner review (behavioral / larger / design call)

### Cross-cutting
- **`toast()` severity argument is silently dropped.** On every admin page the
  `toast()` helper takes one param, but callers pass a severity
  (`toast('…','err')`, `'warn'`, `'ok'`). Error/warn toasts therefore render
  identically to success toasts (no red/amber). Fix is a coherent **batch**:
  add a `kind` param + CSS variants across the admin pages. Left for a
  dedicated pass so it's done consistently and you can eyeball the colors.
- **Runtime-injected status/toast strings may escape browser auto-translate.**
  Toasts and status lines are written via `textContent`/`innerHTML` after load;
  browsers translate initial DOM reliably but can miss late writes. Real but
  inherent; the proper fix (a `lang`-aware message catalog) is a design
  decision, not a one-liner. The *static* page chrome is fully translation-ready
  on all six pages.

### `admin-users.html` (RR Team)
- Cadence `<select>` hard-defaults to **60 days** and isn't synced to the last
  recorded review's `cadenceDays` on load — an admin who chose 90 sees 60 on
  return. Confirm intended.
- Network-error banner surfaces `<code>/api/v1/admin/users</code>` (a raw
  endpoint path) to the user. Borderline finance-audience leak; only on backend
  failure. Consider a softer message.
- Breadcrumb "Administrator" is `href="#"` (dead focusable link; nav is via the
  topbar Home button). Cosmetic.

### `admin-data-refresh.html` (JDE data refresh)
- **Content-currency gap.** The lede asserts the refresh "runs every night," but
  the page is purely manual on-demand (a "Refresh now" button) — it shows no
  schedule, last-run, or next-run. Either the copy overpromises, or the page
  should display the actual schedule/last-run (needs an endpoint). Worth a
  decision.
- The 409 message still conflates two causes ("already running" vs. "not set
  up"). If the in-flight case is already covered by the button-disable guard,
  the "already running" half may be redundant. Confirm the agent's 409 semantics
  before tightening.

### `admin-fiscal-period.html` (Correct a Period-End Date)
- **`MODE` defaults to `'demo'`** when neither `?mode=` nor `RR_CONFIG.mode` is
  set, and the Step-1 auto-detect is gated on `if (!IS_DEMO)`. So the headline
  auto-detect-on-load silently won't fire unless production sets a non-demo
  mode. Confirm prod deploys set `mode=prod`/`RR_CONFIG.mode`. (Manual "Check"
  still works.)
- An apply-time 400 routes its error to the Step-2 Preview message (up near the
  button), not the apply hint — can land off-screen if the user scrolled to the
  results. UX nit.

### `admin-purge-data.html` (Purge old data)
- `js-rec-sub.innerHTML` renders recommendation text sourced partly from the
  shared `RRV8.purgeRecommendation` helper (`sidebar.js`) plus a
  `localStorage` date — injected as raw HTML (intentional, carries `<b>`). Low
  risk; noting the trust boundary.
- "tempdb" / "Autogrowth" appear in the visible "Why purge?" insight —
  borderline finance-audience, acceptable for an admin-gated data page.

### Help docs (the cards' documentation)
- **`administrator-complex-password.html` bakes text into illustrative SVGs.**
  The password-breakdown diagram and the login/reset screen mockups use `<svg>`
  `<text>` for all their labels (lines ~664–805). That text **won't
  auto-translate**. This is the hard diagram/mockup case — converting to
  translatable HTML/CSS is a non-trivial, layout-sensitive rework, so it's
  flagged rather than done blind. (The audited *admin app pages* are all clean
  of baked-in SVG text; this is specific to the KB help doc.)
- Spot-check of the linked help sections (managing-users, managing-companies,
  complex-password, start-here topic-data/utilities) found content **current**
  vs. behavior. A deeper line-by-line pass of each KB doc body was out of scope.

---

## Notes on the doc-date / footer check
None of the RRV8 admin pages carry a `<span class="doc-last-updated"><time>`
element — **correct by design**. These are app-shell pages (topbar + footer +
`sidebar`/`help-sidebar` chrome), not doc-chrome KB pages, so the
`update_doc_dates.py` stamp doesn't apply. Each has an `app-footer` with the
version stamp. Per the CLAUDE.md doc-chrome exception list.
