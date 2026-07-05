# Spec: RR University doc links in the Home AI answers

**Status:** in progress (uncommitted). Shipped locally: shared helpers +
allowlist, accountant Ask, worklist per-company cause cards. Not yet done:
admin briefing.
**Surfaces:** RRV8/home.html — accountant Ask, worklist cause cards, admin briefing
**Goal:** when an AI answer touches a topic the KB already documents, append a
small, injection-proof "Learn more" link to the matching RR University doc(s).
The prose stays plain text; only a curated allowlist of doc slugs can ever
become a link.

## Implementation notes (discovered during build)

- **The recon briefing is retired.** The accountant band was removed 2026-06-30
  and the AI-rail `#haiBrief` element no longer exists, so `renderAiBriefing()`
  returns early ([home.html:5112](../../RRV8/home.html)). Its prompt +
  `_parseBrief` were made forward-compatible (docs support added) but render
  nothing today. The live equivalent in the recon view is the **per-company
  worklist cause card** (`_wlFillCauses` / `wlCard`), so the doc link went there
  instead of the retired briefing.
- **Worklist links are DETERMINISTIC, not AI-emitted.** Each card's driver
  component maps to a doc via `WL_CAUSE_DOC` (Carry forward/Manual entries →
  reconciliation, Transactions → compare-jde, Unposted GL/EOD → period-close).
  No per-card `@@DOCS@@` round-trip — reliable + always relevant. The link lives
  OUTSIDE `.wl-cause` (which `_wlType` overwrites on AI fill) so it survives the
  cause refill. Roll-forward-break cards get no link (no matching doc). Renders
  at all tiers incl. off (links are educational, not data).
- Shared gate `_aiFilterDocSlugs` validates both the `@@DOCS@@` token (Ask) and
  the JSON `docs` array (briefings); `_aiDocCatalogPrompt(mode)` has 'token' +
  'json' variants.

---

## 1. Why this needs a spec (not a one-liner)

The AI output is **untrusted** and two of the three surfaces already have a
strict "plain text only, no markdown" instruction. So we cannot just tell the
model "add links" and render its output as HTML — that's an XSS vector and it
breaks the render contract. The safe pattern is:

1. Give the model a **small allowlist** of `slug → title` pairs in the prompt.
2. Have it emit a trailing **token of slugs**, never a URL — mirrors the
   existing `@@ACTION …@@` directive pattern already used by the accountant Ask
   ([home.html:7586](../../RRV8/home.html)).
3. The client resolves each slug against a **hardcoded `{slug: {title, href}}`
   map**, builds the anchors itself, and **silently drops any slug not in the
   map.** Unknown slug ⇒ no link, never a raw URL.
4. The strip is a **separate DOM element** appended beneath the answer body —
   the untrusted prose never becomes HTML.

---

## 2. The three call sites (as built today)

| # | Surface | Function | Render mechanism | Where the strip attaches |
|---|---------|----------|------------------|--------------------------|
| 1 | Recon briefing (accountant / analyst band `#haiBrief`) | `renderAiBriefing` → `_setBrief` ([home.html:4869](../../RRV8/home.html)) | verdict + points via `innerHTML`, **each line `esc()`-escaped**; JSON `{verdict, points}` parsed by `_parseBrief` | a new element after `.hai-points`, **outside** the animated bullets |
| 2 | Accountant Ask (`#acctAskAnswer` in `#acctAnsBand`) | `askAcct` ([home.html:7556](../../RRV8/home.html)) | `ans.textContent = txt` (plain text) | a new sibling after `#acctAskAnswer` inside `#acctAnsBand` |
| 3 | Admin briefing (band `#adminBrief`) | `renderAdminBriefing` → `_setBrief` (animate=true) | same `_setBrief`; `_typewriteBrief` retypes bullet `textContent` | a new element after `.hai-points`, appended **after** typing completes |

### Render caveats that shape the design

- **`_setBrief` escapes prose** (`esc(t)` in the `body()` builder,
  [home.html:4874](../../RRV8/home.html)) — good, but it means we must NOT try to
  smuggle anchors into a bullet; they'd be escaped to visible text. The strip is
  its own element.
- **`_typewriteBrief`** ([home.html:4891](../../RRV8/home.html)) reads
  `span.textContent` and retypes it char-by-char. Any anchor inside an animated
  span would be flattened. ⇒ the admin/briefing strip must live **outside** the
  `.hai-verdict` / `.hai-points` region and be revealed after the typewriter
  finishes (or immediately when reduced-motion).
- **Accountant Ask** is the simplest — plain `textContent`, no animation.

---

## 3. Doc allowlist (slug → title → href)

Hrefs are relative from `RRV8/` ⇒ `../RRUniversity/<file>.html`. Works both on
the dev static server (:8765 serving the repo root) and on GitHub Pages. All
targets are existing public KB docs.

| slug | Title (link label) | href | When it's relevant |
|------|--------------------|------|--------------------|
| `reconciliation` | Inventory Reconciliation | `../RRUniversity/inventory-reconciliation.html` | what recon is, run book, "where to start" |
| `period-close` | Period-Close Troubleshooting | `../RRUniversity/period-close-troubleshooting.html` | "did operations finish", unposted/EOD, waiting to reconcile |
| `cardex-variance` | Cardex Variance | `../RRUniversity/inventory-cardex-variance.html` | perpetual-vs-item-ledger gap, cardex |
| `zero-balance` | Zero-Balance Rows | `../RRUniversity/inventory-zero-balance.html` | residual noise, zero-qty valuation rows |
| `reports-exports` | Reports &amp; Exports | `../RRUniversity/reports-and-exports.html` | audit report, Excel/PDF exports |
| `compare-jde` | Comparing RR to JDE Reports | `../RRUniversity/comparing-rr-to-jde-reports.html` | tying RR to JDE, "why don't these match" |
| `add-account` | Adding an Inventory Account | `../RRUniversity/inventory-add-account-rr.html` | missing offsetting account / account-setup gap |
| `costing` | Inventory Costing | `../RRUniversity/inventory-costing.html` | how perpetual valuation is built, unit cost |

Keep this list **short and recon-shaped**. Adding every module doc turns the
strip into noise (fails the "all signal, no noise" gate). Start with these 8;
add only when a real Ask/briefing topic has no home.

---

## 4. Shared helpers (add once, use in all three)

```js
// slug → { title, href }. The ONLY slugs that can ever become a link.
var _AI_DOCS = {
  'reconciliation':  { title: 'Inventory Reconciliation',        href: '../RRUniversity/inventory-reconciliation.html' },
  'period-close':    { title: 'Period-Close Troubleshooting',    href: '../RRUniversity/period-close-troubleshooting.html' },
  'cardex-variance': { title: 'Cardex Variance',                 href: '../RRUniversity/inventory-cardex-variance.html' },
  'zero-balance':    { title: 'Zero-Balance Rows',               href: '../RRUniversity/inventory-zero-balance.html' },
  'reports-exports': { title: 'Reports & Exports',               href: '../RRUniversity/reports-and-exports.html' },
  'compare-jde':     { title: 'Comparing RR to JDE Reports',     href: '../RRUniversity/comparing-rr-to-jde-reports.html' },
  'add-account':     { title: 'Adding an Inventory Account',     href: '../RRUniversity/inventory-add-account-rr.html' },
  'costing':         { title: 'Inventory Costing',               href: '../RRUniversity/inventory-costing.html' }
};

// Prompt fragment listing the allowlist + the emit contract. Shared by all 3.
function _aiDocCatalogPrompt() {
  var lines = Object.keys(_AI_DOCS).map(function (k) { return '  ' + k + ' = ' + _AI_DOCS[k].title; });
  return 'RELATED HELP DOCS you may cite (slug = topic):\n' + lines.join('\n') + '\n'
    + 'If — and ONLY if — one or two of these docs directly match what the answer is about, '
    + 'END your reply with a single line exactly like "@@DOCS slug, slug@@" (use the slugs above, max TWO, most relevant first). '
    + 'Omit the line entirely when nothing fits. Never invent a slug. This line is the ONLY place a doc reference may appear — '
    + 'do NOT mention doc titles or links in the prose.\n';
}

// Pull the @@DOCS …@@ token out of raw AI text. Returns { text, slugs[] }.
// text has the token stripped; slugs filtered to the allowlist, deduped, capped at 2.
function _aiExtractDocs(raw) {
  var txt = String(raw || ''), slugs = [];
  var m = txt.match(/@@DOCS\s+([^@]+)@@/i);
  if (m) {
    txt = txt.replace(m[0], '').trim();
    var seen = {};
    m[1].split(',').forEach(function (s) {
      s = s.trim().toLowerCase();
      if (_AI_DOCS[s] && !seen[s] && slugs.length < 2) { seen[s] = 1; slugs.push(s); }
    });
  }
  return { text: txt, slugs: slugs };
}

// Build (or clear) a "Learn more" strip inside/after `hostEl`. Anchors are built
// from the allowlist ONLY — slugs already validated by _aiExtractDocs.
// stripId keeps one strip per surface (idempotent re-render).
function _aiRenderDocStrip(hostEl, slugs, stripId) {
  if (!hostEl) return;
  var strip = document.getElementById(stripId);
  if (!slugs || !slugs.length) { if (strip) strip.remove(); return; }
  if (!strip) {
    strip = document.createElement('div');
    strip.id = stripId; strip.className = 'ai-doc-strip';
    hostEl.appendChild(strip);
  }
  strip.innerHTML = '<span class="ai-doc-strip-label">Learn more</span>'
    + slugs.map(function (s) {
        var d = _AI_DOCS[s];
        return '<a class="ai-doc-link" href="' + d.href + '" target="_blank" rel="noopener">' + esc(d.title) + '</a>';
      }).join('');
}
```

`esc()` on the title is belt-and-suspenders (titles are our own constants). The
href is never user/AI-derived — it's the allowlist value.

---

## 5. Per-surface wiring

### 5.1 Accountant Ask (`askAcct`)

- **Prompt:** append `_aiDocCatalogPrompt()` after the existing guidance block
  (before `'Question: ' + q`). Keep the existing "Plain text only" rule for the
  prose — the `@@DOCS@@` line is exempt because we strip it before render.
- **Render** ([home.html:7590](../../RRV8/home.html)): replace
  ```js
  var txt = (r && r.text) ? String(r.text).trim() : '';
  txt = _acctRunAiAction(txt);
  if (ans) ans.textContent = txt || 'No answer came back — try rephrasing.';
  ```
  with
  ```js
  var raw = (r && r.text) ? String(r.text).trim() : '';
  var doc = _aiExtractDocs(raw);
  var txt = _acctRunAiAction(doc.text);   // run @@ACTION@@ on the doc-stripped text
  if (ans) ans.textContent = txt || 'No answer came back — try rephrasing.';
  _aiRenderDocStrip($('acctAnsBand'), doc.slugs, 'acctDocStrip');
  ```
  Order matters: strip `@@DOCS@@` first, then `_acctRunAiAction` handles
  `@@ACTION@@` — both directives can coexist.
- Clear the strip when a new ask starts (in the `if (ans) ans.textContent =
  'Thinking…';` path, call `_aiRenderDocStrip($('acctAnsBand'), [], 'acctDocStrip')`).

### 5.2 Recon briefing (`renderAiBriefing`)

- **Prompt:** the briefing returns strict JSON `{verdict, points}`. Add a THIRD
  optional key rather than a trailing token, so we don't pollute the JSON
  contract:
  `{"verdict":…,"points":[…],"docs":["slug", …]}`  (docs optional, max 2).
  Extend `_parseBrief` ([home.html:5005](../../RRV8/home.html)) to read+validate
  `docs` against `_AI_DOCS` (reuse the same filter as `_aiExtractDocs`).
  Add `_aiDocCatalogPrompt()`-style guidance to the briefing prompt, adapted to
  "put matching slugs in the `docs` array" instead of a `@@DOCS@@` line.
- **Render:** in `_setBrief` success ([home.html:5165](../../RRV8/home.html)),
  after `_setBrief(...)`, call
  `_aiRenderDocStrip(_activeBriefEl(), o.docs || [], 'briefDocStrip')`.
  Because `_activeBriefEl()` is the band root and the strip is appended after
  `.hai-points`, `_typewriteBrief` (which only touches `.hai-verdict`/`.hai-points`)
  won't animate it. For visual consistency, reveal the strip only after typing
  completes — simplest: append it with a short CSS fade, or gate its insertion
  on the typewriter's completion callback.

### 5.3 Admin briefing (`renderAdminBriefing`)

- Same JSON-`docs` approach as 5.2 (it also uses `_parseBrief` + `_setBrief`).
  The admin allowlist could differ (e.g. `login-and-access`,
  `administrator-managing-users`, `administrator-complex-password`,
  `rapidreconciler-licensing`) — consider a separate `_AI_DOCS_ADMIN` map or a
  `group` field per entry. Recommendation: **one map with a `roles` array**
  per entry, and pass the active role into the catalog builder so each surface
  only offers docs that fit it.
- Render: `_aiRenderDocStrip($('adminBrief'), o.docs || [], 'adminDocStrip')`
  after `_setBrief`, same typewriter-completion gating.

---

## 6. Tier gating

- The whole AI band is disabled when tier = **off** (`_recsummaryLevel() ===
  'off'`) — so no strip either; nothing to change.
- For **basic / enhanced / full**: doc links are **educational, not data** —
  they expose nothing about the customer's figures — so the strip is
  **tier-independent** across those three. No extra gating.
- Re-run on tier flip (accountant `_acctLastAsk`, briefing re-render) already
  re-fires the AI call, so the strip regenerates naturally.

---

## 7. Styling (`ai-doc-strip`)

Small, calm, secondary — must not compete with the answer. Reuse existing
tokens.

```css
.ai-doc-strip { display:flex; flex-wrap:wrap; align-items:center; gap:8px;
  margin-top:10px; padding-top:8px; border-top:1px solid var(--hairline,#e6e8ee);
  font-size:12.5px; }
.ai-doc-strip-label { color:var(--muted,#6b7280); font-weight:600;
  text-transform:uppercase; letter-spacing:.04em; font-size:11px; }
.ai-doc-link { color:var(--brand,#1f2d4a); text-decoration:none;
  border:1px solid var(--hairline,#e6e8ee); border-radius:999px;
  padding:2px 10px; background:#fff; }
.ai-doc-link:hover { border-color:var(--brand,#1f2d4a); text-decoration:underline; }
```

Opens in a new tab (`target="_blank" rel="noopener"`) so the user doesn't lose
their reconciliation context.

---

## 8. Edge cases & guardrails

- **Unknown / hallucinated slug** → dropped by the allowlist filter; never a
  link, never a raw URL.
- **Max 2 links** per answer (cap in `_aiExtractDocs` / `_parseBrief`).
- **Dedupe** slugs within one answer.
- **No doc fits** → model omits the token/array → strip is removed/absent.
  This is the common case; the strip should feel like a bonus, not a fixture
  (the "all signal, no noise" gate — a strip on every answer becomes wallpaper).
- **Deterministic fallbacks** (`_fallbackBrief`, `_adminBriefFallback`,
  Ask's catch branch): no AI ran, so no slugs. Optionally attach ONE static,
  always-safe link (e.g. `reconciliation`) on the recon fallback — decide at
  build time; default is no strip on fallback to keep it honest.
- **Stale render guard**: briefing already supersedes via `_briefGen`; the Ask
  is single-flight via `_acctAsking`. The strip renders inside those guarded
  callbacks, so no stale strip can paint.
- **Path**: `../RRUniversity/…` only. Never absolute `/RapidReconciler-UI/…`
  (breaks dev) and never a bare `RRUniversity/…` from `RRV8/` (wrong depth).

---

## 9. Build order

1. Add `_AI_DOCS`, `_aiDocCatalogPrompt`, `_aiExtractDocs`, `_aiRenderDocStrip`,
   and the `.ai-doc-strip` CSS. (No behavior change yet.)
2. Wire the **accountant Ask** (§5.1) — simplest render, fastest to verify.
   Ship + eyeball live: ask "can I get a run book for this" → expect a
   *Reconciliation* link; ask about residual noise → expect *Zero-Balance Rows*.
3. Wire the **recon briefing** (§5.2) incl. `_parseBrief` `docs` support +
   typewriter-safe reveal.
4. Wire the **admin briefing** (§5.3) with the role-scoped allowlist.
5. Verify no console errors, links resolve on :8765 and on Pages, unknown slugs
   drop, off-tier shows nothing.

---

## 10. Verification checklist

- [ ] Ask a recon question → correct doc link appears, opens in new tab.
- [ ] Ask something with no doc match → no strip.
- [ ] Force a bad slug (temporarily) → strip drops it, no console error, no raw URL.
- [ ] Briefing renders strip after the typewriter, not mid-animation.
- [ ] Tier = off → no band, no strip. Tier flip re-runs and re-renders strip.
- [ ] DB / company / period switch supersedes cleanly (no stale strip).
- [ ] Links resolve both locally (`:8765`) and on the deployed Pages URL.
