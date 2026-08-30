/* test-hidden-override.js -- behaviour test for the [hidden]-override trap (UI-159).
 *
 *   node Tools/test-hidden-override.js
 *
 * WHY THIS EXISTS. The browser hides an element carrying the `hidden` attribute with a
 * UA-stylesheet rule, `[hidden] { display: none }`. That rule is the weakest thing in the
 * cascade: ANY author rule that sets `display` to something else beats it. So a page that
 * ships `.banner { display: flex }` and then runs `el.hidden = true` has not hidden
 * anything. The element stays on screen, at full height, holding whatever text it last
 * had, and every piece of JS that reads `el.hidden` agrees it is hidden. Nothing throws.
 * Nothing logs. The only witness is a human looking at the screen.
 *
 * That is UI-116, measured 2026-08-26: the model-review verdict banner sat 60.25px tall
 * with its `hidden` attribute set, still reading "Reviewing the model...". The fix is one
 * line per class -- `.banner[hidden] { display: none }` -- and the whole difficulty is
 * KNOWING WHICH CLASSES NEED IT.
 *
 * WHY THIS IS NOT THE SWEEP THAT CAME BEFORE IT. The earlier audit enumerated from the JS
 * side: grep for `.hidden =`, work back to a class, check for a guard. It found three
 * candidates and provably missed a fourth, `#oeVcode` -- which shares the `.je-vcode`
 * class with `#jeVcode` but is never assigned through any pattern that grep matched. The
 * enumeration was wrong-way-round. The override lives in the CSS and in the markup; how
 * the element got selected in JS is irrelevant to whether the bug is present.
 *
 * So this test inverts it. It parses the markup, parses every author stylesheet the page
 * loads, and for each element that carries `hidden` it RESOLVES THE CASCADE the way a
 * browser would -- specificity, source order, !important, inline style -- and asserts the
 * winning `display` is `none`. It cannot be fooled by how the element was selected,
 * because it never looks at the selection.
 *
 * NO DEPENDENCIES. There is no package.json and no node_modules in this repo, and CI runs
 * bare `node`. The HTML tokenizer, the CSS parser, the selector matcher and the cascade
 * are all in this file. They are deliberately narrow: they implement the subset of CSS
 * these pages actually use, and they FAIL LOUD (see `unsupported`) rather than silently
 * skipping a selector shape they do not understand, so the coverage never quietly shrinks.
 *
 * SOURCE IS NOT RETYPED. Every page under RRV8/ is read off disk at run time, along with
 * every stylesheet it <link>s. Nothing here is a fixture. Add a page and it is covered.
 *
 * ---------------------------------------------------------------------------------
 * WHAT THIS TEST CAN PROVE, AND WHAT IT CANNOT. Read this before trusting a green run.
 *
 * PROVES (Pass 1): for every element written into the shipping HTML with a literal
 *   `hidden` attribute, the author CSS actually collapses it. Full cascade, full ancestor
 *   context, descendant and child combinators included. This is the pass that catches
 *   #oeVcode, .eod-banner and .je-vcode.
 *
 * PROVES (Pass 2, weaker): for every element built inside a JS string that carries
 *   `hidden` in its tag, the classes and id on that tag have a `[hidden]` guard IF any
 *   author rule gives them a non-none display. Class-level only -- a fragment has no
 *   ancestors to resolve against, so this pass reasons about the selector key rather than
 *   the cascade, and will not see a bug that only exists under a descendant selector.
 *
 * PROVES (Pass 3, supplementary): for every id or class the page's own JS hands a `hidden`
 *   assignment to, the elements in markup carrying that id/class collapse WHEN GIVEN the
 *   attribute. This is the enumeration the old sweep used -- and it is kept only as a
 *   supplement, because on its own it is what missed #oeVcode. What is different is the
 *   verdict: this resolves the full cascade instead of grepping for a guard, and it runs
 *   BESIDE the markup pass rather than instead of it. Pass 1 catches what JS obscures;
 *   Pass 3 catches what the markup never declares. Neither alone is the audit.
 *
 * DELIBERATE OVERRIDES ARE ALLOWED, AND ONLY IF SAID OUT LOUD. A rule whose own selector
 *   names `[hidden]` and still sets a non-none display is an author who knew exactly what
 *   they were doing -- `.tx-work-panel[hidden] { display: block; pointer-events: none }` is
 *   a drawer that stays in the layout while it animates out. Those are reported as ACK
 *   lines, not failures. Writing `[hidden]` into the selector is the opt-out, so an
 *   override can never be silent.
 *
 * DOES NOT PROVE -- these are the blind spots, named so nobody has to rediscover them:
 *   - An element hidden at runtime through a reference this file cannot trace back to an
 *     id or a class literal: a DOM node held in an array, walked to via `parentNode`, or
 *     handed in as a function argument. Pass 3 resolves direct `$('id')` /
 *     `getElementById('id')` / `querySelector('.cls')` calls and ONE hop of variable
 *     assignment. Past that it is blind, and so was every sweep before it.
 *   - Classes added or removed by `classList` after load. The test resolves the cascade
 *     against the classes present in source.
 *   - Dynamic pseudo-classes (:hover, :focus, :focus-within, :active, :target, :checked).
 *     Rules gated on them are treated as NOT matching, which is conservative in the sense
 *     that it cannot raise a false alarm -- and blind in the sense that a
 *     `.x:hover { display: flex }` on a hidden element would go unreported.
 *   - Anything a stylesheet outside this repo contributes.
 *   - display set by JS (`el.style.display = 'flex'`). Out of scope by construction: that
 *     is an inline style written after load, and it beats everything either way.
 *
 * A green run means "no [hidden]-override bug is reachable from the markup or the CSS."
 * It does not mean "no [hidden]-override bug exists."
 *
 * ---------------------------------------------------------------------------------
 * MEASURED 2026-08-27, first run, before any guard was added: EIGHT live defects that
 * the earlier JS-side sweep had never reported. The loudest two were `#js-job-guard` on
 * admin-reload-cardex.html and admin-reload-gl.html -- an amber "a job is running"
 * warning that `g.hidden = !running` could not collapse, so it was on screen on both
 * pages whether or not a job was running. The others: `.tab-dot` and `.model-verdict` on
 * accounting-dmaais.html (a stale coloured approval dot and an empty verdict pill),
 * `.msgcenter` and `.ihs-chip` on home.html (an empty message band, and all three
 * instance-health chips unable to hide -- the strip around them had a guard and the chips
 * did not), `.grid-pill` on inventory-transactions.html, and `.fact-who` on
 * inventory-variance-source.html.
 *
 * CONTROL, run last, because a test that passes on everything proves nothing: deleting
 * the `.je-vcode[hidden]` guard from home.html makes this file exit 1 and name BOTH
 * `#jeVcode` AND `#oeVcode` -- and Pass 3, the JS-side enumeration, reports only
 * `#jeVcode`. That is the UI-159 blind spot reproduced on demand, in the output of the
 * test itself, which is the argument for why Pass 1 is the primary and Pass 3 is not.
 */
'use strict';

const fs = require('fs');
const path = require('path');

const RRV8 = path.join(__dirname, '..', 'RRV8');

let failures = 0;
let checkedEls = 0;
let checkedFrags = 0;
const unsupported = new Map();   // selector shape -> count, reported but not fatal

function note(kind) { unsupported.set(kind, (unsupported.get(kind) || 0) + 1); }

/* ================================================================= HTML =========
 * A tag-level tokenizer. It does not need to be a conforming parser -- it needs to
 * produce, for every element, its tag, id, classes, inline style and ancestor chain.
 * <script> and <style> bodies are skipped wholesale so that HTML written inside a JS
 * string never lands in the element tree (Pass 2 handles those separately).
 */
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input',
                      'link', 'meta', 'param', 'source', 'track', 'wbr']);

const ATTR_RE = /([a-zA-Z_:@#\-][a-zA-Z0-9_:.\-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;

function parseAttrs(raw) {
    const out = {};
    ATTR_RE.lastIndex = 0;
    let m;
    while ((m = ATTR_RE.exec(raw)) !== null) {
        const v = m[2] !== undefined ? m[2] : m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : '';
        out[m[1].toLowerCase()] = v;
    }
    return out;
}

function mkEl(tag, attrs, parent) {
    const cls = (attrs['class'] || '').trim();
    return {
        tag: tag,
        id: attrs['id'] || '',
        classes: cls ? cls.split(/\s+/) : [],
        attrs: attrs,
        hasHidden: Object.prototype.hasOwnProperty.call(attrs, 'hidden'),
        style: attrs['style'] || '',
        parent: parent || null,
        children: [],
        index: 0            // 1-based position among element siblings, for +/~
    };
}

// Returns { elements: [...], styles: [ {css, order} ], links: [href] }
function parseHtml(html) {
    const src = html.replace(/<!--[\s\S]*?-->/g, '');
    const elements = [];
    const styles = [];
    const links = [];
    const root = mkEl('#root', {}, null);
    let cur = root;

    const TAG_RE = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"']|"[^"]*"|'[^']*')*)>/g;
    let m;
    while ((m = TAG_RE.exec(src)) !== null) {
        const closing = m[1] === '/';
        const tag = m[2].toLowerCase();
        const rawAttrs = m[3] || '';

        if (!closing && (tag === 'script' || tag === 'style')) {
            const end = src.toLowerCase().indexOf('</' + tag, TAG_RE.lastIndex);
            const body = end < 0 ? '' : src.slice(TAG_RE.lastIndex, end);
            if (tag === 'style') styles.push(body);
            TAG_RE.lastIndex = end < 0 ? src.length : end;
            continue;
        }
        if (closing) {
            // Walk up to the nearest matching open tag; tolerate unclosed inline tags.
            let p = cur;
            while (p && p !== root && p.tag !== tag) p = p.parent;
            if (p && p !== root) cur = p.parent || root;
            continue;
        }
        const attrs = parseAttrs(rawAttrs);
        if (tag === 'link') {
            const rel = (attrs['rel'] || '').toLowerCase();
            if (rel.indexOf('stylesheet') >= 0 && attrs['href']) links.push(attrs['href']);
            continue;
        }
        const el = mkEl(tag, attrs, cur);
        el.index = cur.children.length + 1;
        cur.children.push(el);
        elements.push(el);
        const selfClosing = /\/\s*$/.test(rawAttrs);
        if (!VOID.has(tag) && !selfClosing) cur = el;
    }
    return { elements: elements, styles: styles, links: links };
}

/* ================================================================== CSS =========
 * Rules are flattened out of @media / @supports (their contents DO apply, at some
 * viewport or on some engine, so a display set inside one is every bit as capable of
 * beating [hidden] as a top-level one). @keyframes / @font-face carry no selectors.
 */
// stripper-safety: css-only (UI-170). This is the naive block strip that removed 48% of
// sidebar.js when applied to JAVASCRIPT -- a delimiter inside a string or regex literal
// pairs with the wrong one and swallows everything between. CSS is the one place it is
// defensible: block comments are the ONLY comment form there, so narrowing to line
// comments is not available. Measured 2026-08-30 across every stylesheet in RRV8 -- 25
// blocks, 612,791 bytes -- no stylesheet that was brace-balanced before became unbalanced
// after, so the strip is not eating declarations on today's inputs. Do NOT copy this line
// into a test that reads .js or .html source; Tools/test-comment-stripper-safety.js
// enforces that, and this marker is what exempts this one use.
function stripCssComments(css) { return css.replace(/\/\*[\s\S]*?\*\//g, ''); }

function parseCss(css, srcName, out) {
    css = stripCssComments(css);
    let order = out.length;

    function walk(text, media) {
        let i = 0;
        while (i < text.length) {
            const brace = text.indexOf('{', i);
            if (brace < 0) break;
            let prelude = text.slice(i, brace).trim();
            // find matching close brace
            let depth = 0, j = brace, end = -1;
            for (; j < text.length; j++) {
                if (text[j] === '{') depth++;
                else if (text[j] === '}') { depth--; if (depth === 0) { end = j; break; } }
            }
            if (end < 0) break;
            const body = text.slice(brace + 1, end);
            i = end + 1;
            if (!prelude) continue;
            if (prelude[0] === '@') {
                const name = (prelude.match(/^@([a-zA-Z-]+)/) || [, ''])[1].toLowerCase();
                if (name === 'media' || name === 'supports' || name === 'layer' || name === 'container') {
                    walk(body, media ? media + ' / ' + prelude : prelude);
                }
                // @keyframes, @font-face, @page, @property: no element selectors.
                continue;
            }
            const display = lastDisplay(body);
            if (!display) continue;
            prelude.split(',').forEach(function (sel) {
                sel = sel.trim();
                if (!sel) return;
                out.push({ sel: sel, display: display.value, important: display.important,
                           media: media || '', src: srcName, order: out.length + order });
            });
        }
    }
    walk(css, '');
}

// Last `display:` declaration in a block wins, as in a browser.
function lastDisplay(body) {
    let found = null;
    const RE = /(^|[;{])\s*display\s*:\s*([^;}]+)/gi;
    let m;
    while ((m = RE.exec(body)) !== null) {
        let v = m[2].trim();
        const important = /!\s*important/i.test(v);
        v = v.replace(/!\s*important/i, '').trim().toLowerCase();
        found = { value: v, important: important };
    }
    return found;
}

/* ========================================================= SELECTOR MATCH ======
 * Supported: tag, #id, .class, [attr], [attr=val], [attr~=val], :not(<simple>),
 * and the four combinators. Structural and dynamic pseudo-classes are handled by
 * DYNAMIC (never match) / IGNORABLE (match, do not affect the result) lists; anything
 * else is recorded in `unsupported` and the rule is dropped, so silent shrinkage of
 * coverage shows up in the run output.
 */
const DYNAMIC = new Set(['hover', 'focus', 'focus-within', 'focus-visible', 'active',
                         'target', 'checked', 'disabled', 'indeterminate', 'placeholder-shown',
                         'valid', 'invalid', 'user-invalid', 'open', 'popover-open',
                         'defined', 'fullscreen', 'visited', 'link']);
const IGNORABLE = new Set(['root', 'first-child', 'last-child', 'only-child', 'first-of-type',
                           'last-of-type', 'only-of-type', 'empty', 'enabled', 'required',
                           'optional', 'read-only', 'read-write', 'default', 'any-link',
                           'nth-child', 'nth-of-type', 'nth-last-child', 'nth-last-of-type',
                           'where', 'is', 'scope', 'has', 'dir', 'lang']);

const COMPOUND_RE = /^(?:([a-zA-Z][a-zA-Z0-9-]*|\*)|#([-\w]+)|\.([-\w]+)|\[([^\]]*)\]|::?([-\w]+)(\(([^()]*)\))?)/;

function parseCompound(text) {
    const c = { tag: null, ids: [], classes: [], attrs: [], nots: [], pseudoEl: false, dynamic: false };
    let s = text;
    while (s.length) {
        const m = COMPOUND_RE.exec(s);
        if (!m) return null;
        if (m[1]) { if (m[1] !== '*') c.tag = m[1].toLowerCase(); }
        else if (m[2]) c.ids.push(m[2]);
        else if (m[3]) c.classes.push(m[3]);
        else if (m[4] !== undefined) c.attrs.push(parseAttrSel(m[4]));
        else if (m[5]) {
            const isEl = s.slice(0, 2) === '::';
            const name = m[5].toLowerCase();
            if (isEl || name === 'before' || name === 'after' || name === 'marker'
                || name === 'placeholder' || name === 'backdrop' || name === 'selection'
                || name === 'first-line' || name === 'first-letter') { c.pseudoEl = true; }
            else if (name === 'not') {
                const inner = parseCompound((m[7] || '').trim());
                if (!inner) return null;
                c.nots.push(inner);
            }
            else if (DYNAMIC.has(name)) c.dynamic = true;
            else if (!IGNORABLE.has(name)) return null;
        }
        s = s.slice(m[0].length);
    }
    return c;
}

function parseAttrSel(body) {
    const m = /^\s*([-\w]+)\s*(?:([~^$*|]?=)\s*(?:"([^"]*)"|'([^']*)'|([^\]\s]*)))?\s*$/.exec(body);
    if (!m) return { bad: true };
    return { name: m[1].toLowerCase(), op: m[2] || null,
             val: m[3] !== undefined ? m[3] : m[4] !== undefined ? m[4] : m[5] !== undefined ? m[5] : null };
}

// Split "a > b c + d" into [{comb, compound}, ...], leftmost first.
function parseSelector(sel) {
    const parts = [];
    let buf = '', comb = ' ';
    let depth = 0;
    for (let i = 0; i < sel.length; i++) {
        const ch = sel[i];
        if (ch === '(') depth++;
        if (ch === ')') depth--;
        if (depth === 0 && (ch === '>' || ch === '+' || ch === '~')) {
            if (buf.trim()) { parts.push({ comb: comb, text: buf.trim() }); }
            comb = ch; buf = ''; continue;
        }
        if (depth === 0 && /\s/.test(ch)) {
            if (buf.trim()) { parts.push({ comb: comb, text: buf.trim() }); comb = ' '; buf = ''; }
            continue;
        }
        buf += ch;
    }
    if (buf.trim()) parts.push({ comb: comb, text: buf.trim() });
    if (!parts.length) return null;
    const out = [];
    for (const p of parts) {
        const c = parseCompound(p.text);
        if (!c) return null;
        out.push({ comb: p.comb, c: c });
    }
    return out;
}

function attrMatches(el, a) {
    if (a.bad) return false;
    const has = Object.prototype.hasOwnProperty.call(el.attrs, a.name);
    if (!a.op) return has;
    if (!has) return false;
    const v = el.attrs[a.name];
    switch (a.op) {
        case '=':  return v === a.val;
        case '~=': return v.split(/\s+/).indexOf(a.val) >= 0;
        case '^=': return v.indexOf(a.val) === 0;
        case '$=': return v.slice(-a.val.length) === a.val;
        case '*=': return v.indexOf(a.val) >= 0;
        case '|=': return v === a.val || v.indexOf(a.val + '-') === 0;
    }
    return false;
}

function compoundMatches(el, c) {
    if (c.dynamic) return false;
    if (c.tag && el.tag !== c.tag) return false;
    for (const id of c.ids) if (el.id !== id) return false;
    for (const k of c.classes) if (el.classes.indexOf(k) < 0) return false;
    for (const a of c.attrs) if (!attrMatches(el, a)) return false;
    for (const n of c.nots) if (compoundMatches(el, n)) return false;
    return true;
}

function prevSiblings(el) {
    if (!el.parent) return [];
    const sibs = el.parent.children;
    const at = sibs.indexOf(el);
    return at <= 0 ? [] : sibs.slice(0, at);
}

// Right-to-left match, the way a browser does it.
function selectorMatches(el, parts) {
    function step(node, i) {
        if (i < 0) return true;
        const part = parts[i];
        if (i === parts.length - 1) {
            if (!compoundMatches(node, part.c)) return false;
            return step(node, i - 1);
        }
        return false;
    }
    // walk from the rightmost compound leftwards, carrying the current node
    function rec(node, i) {
        if (!compoundMatches(node, parts[i].c)) return false;
        if (i === 0) return true;
        const nextComb = parts[i].comb;
        if (nextComb === ' ') {
            let p = node.parent;
            while (p && p.tag !== '#root') { if (rec(p, i - 1)) return true; p = p.parent; }
            return false;
        }
        if (nextComb === '>') {
            const p = node.parent;
            return !!p && p.tag !== '#root' && rec(p, i - 1);
        }
        if (nextComb === '+') {
            const sibs = prevSiblings(node);
            const prev = sibs[sibs.length - 1];
            return !!prev && rec(prev, i - 1);
        }
        if (nextComb === '~') {
            const sibs = prevSiblings(node);
            for (let k = sibs.length - 1; k >= 0; k--) if (rec(sibs[k], i - 1)) return true;
            return false;
        }
        return false;
    }
    void step;
    return rec(el, parts.length - 1);
}

function specificity(parts) {
    let a = 0, b = 0, c = 0;
    for (const p of parts) {
        a += p.c.ids.length;
        b += p.c.classes.length + p.c.attrs.length;
        if (p.c.tag) c += 1;
        for (const n of p.c.nots) { a += n.ids.length; b += n.classes.length + n.attrs.length; if (n.tag) c += 1; }
    }
    return a * 10000 + b * 100 + c;
}

/* ============================================================== CASCADE ========= */
function inlineDisplay(styleAttr) {
    if (!styleAttr) return null;
    return lastDisplay(';' + styleAttr);
}

function winningDisplay(el, rules) {
    let best = null;   // { display, important, spec, order, rule }
    for (const r of rules) {
        if (!r.parts) continue;
        if (r.parts[r.parts.length - 1].c.pseudoEl) continue;
        if (!selectorMatches(el, r.parts)) continue;
        const cand = { display: r.display, important: r.important, spec: r.spec, order: r.order, rule: r };
        if (!best) { best = cand; continue; }
        if (cand.important !== best.important) { if (cand.important) best = cand; continue; }
        if (cand.spec !== best.spec) { if (cand.spec > best.spec) best = cand; continue; }
        if (cand.order >= best.order) best = cand;
    }
    const inl = inlineDisplay(el.style);
    if (inl && (!best || !best.important || inl.important)) {
        return { display: inl.value, from: 'inline style="' + el.style.trim() + '"' };
    }
    if (!best) return { display: null, from: null };   // only the UA rule applies -> hidden works
    const lastC = best.rule.parts[best.rule.parts.length - 1].c;
    return { display: best.display,
             acknowledged: lastC.attrs.some(function (a) { return a.name === 'hidden'; }),
             from: best.rule.src + ' :: ' + best.rule.sel
                   + (best.rule.media ? '  [inside ' + best.rule.media + ']' : '') };
}

// Resolve the cascade for an element AS IF the hidden attribute were on it.
function displayWhenHidden(el, rules) {
    const had = Object.prototype.hasOwnProperty.call(el.attrs, 'hidden');
    if (!had) el.attrs.hidden = '';
    try { return winningDisplay(el, rules); }
    finally { if (!had) delete el.attrs.hidden; }
}

function describe(el) {
    let s = '<' + el.tag;
    if (el.id) s += ' id="' + el.id + '"';
    if (el.classes.length) s += ' class="' + el.classes.join(' ') + '"';
    // Say whether the attribute is in the markup or only ever arrives from JS -- the two
    // are different bugs to read about, and printing "hidden>" on both hides that.
    return s + (el.hasHidden ? ' hidden>' : '>  (hidden only ever set from JS)');
}

/* ================================================================ RUN =========== */
const pages = fs.readdirSync(RRV8).filter(function (f) { return /\.html$/i.test(f); }).sort();
if (!pages.length) { console.error('FAIL no RRV8/*.html pages found'); process.exit(1); }

const cssCache = new Map();
function readCss(p) {
    if (!cssCache.has(p)) {
        try { cssCache.set(p, fs.readFileSync(p, 'utf8')); }
        catch (e) { cssCache.set(p, null); }
    }
    return cssCache.get(p);
}

console.log('=== Pass 1 -- cascade resolved against the shipping markup ===');

const perPage = [];
for (const page of pages) {
    const full = path.join(RRV8, page);
    const html = fs.readFileSync(full, 'utf8');
    const doc = parseHtml(html);

    // Author CSS in load order: linked sheets first, then inline <style> blocks.
    const rules = [];
    for (const href of doc.links) {
        if (/^https?:/i.test(href)) continue;                 // outside the repo -- blind spot, named above
        const p = path.resolve(path.dirname(full), href);
        const css = readCss(p);
        if (css === null) continue;
        parseCss(css, href, rules);
    }
    doc.styles.forEach(function (s, i) { parseCss(s, page + ' <style#' + (i + 1) + '>', rules); });

    for (const r of rules) {
        r.parts = parseSelector(r.sel);
        if (!r.parts) { note(r.sel.replace(/[-\w]+/g, function (w) { return w; })); continue; }
        r.spec = specificity(r.parts);
    }

    const hiddenEls = doc.elements.filter(function (e) { return e.hasHidden; });
    perPage.push({ page: page, rules: rules, doc: doc, n: hiddenEls.length });

    for (const el of hiddenEls) {
        checkedEls++;
        const w = winningDisplay(el, rules);
        if (w.display === null || w.display === 'none') continue;
        if (w.acknowledged) {
            console.log('  ACK  ' + page + '  ' + describe(el) + '  -> display: ' + w.display);
            console.log('         deliberate, declared: ' + w.from);
            continue;
        }
        failures++;
        console.log('  FAIL ' + page + '  ' + describe(el));
        console.log('         computes to display: ' + w.display);
        console.log('         winner: ' + w.from);
        console.log('         fix:    add a `[hidden] { display: none }` guard for that selector');
    }
    console.log('  ok   ' + page + '  (' + hiddenEls.length + ' element(s) carrying [hidden], '
                + rules.length + ' display rule(s))');
}

/* --------------------------------------------------------------------------------
 * Pass 2 -- elements built inside JS strings. These never enter the element tree, so
 * there are no ancestors to resolve against; the check is class/id-level. A key is
 * flagged when SOME author rule gives it a non-none display and NO rule combines that
 * key with [hidden] to set display:none.
 */
console.log('');
console.log('=== Pass 2 -- fragments built in JS (class/id level, no ancestor context) ===');

const FRAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)((?:[^>"'\\]|\\.|"[^"]*"|'[^']*')*?)\shidden(?=[\s>\\/])/g;

for (const rec of perPage) {
    const full = path.join(RRV8, rec.page);
    const html = fs.readFileSync(full, 'utf8');
    // script bodies only -- markup fragments in the document itself are Pass 1's job.
    const scripts = [];
    const SC = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = SC.exec(html)) !== null) scripts.push(sm[1]);
    const js = scripts.join('\n');

    // Which keys does a guard exist for?  key -> true
    const guarded = new Set();
    const nonNone = new Map();   // key -> example rule
    for (const r of rec.rules) {
        if (!r.parts) continue;
        const last = r.parts[r.parts.length - 1].c;
        const keys = last.ids.map(function (i) { return '#' + i; })
                     .concat(last.classes.map(function (c) { return '.' + c; }));
        const hasHiddenAttr = last.attrs.some(function (a) { return a.name === 'hidden' && !a.op; });
        if (hasHiddenAttr && r.display === 'none') { keys.forEach(function (k) { guarded.add(k); }); continue; }
        if (r.display !== 'none' && !hasHiddenAttr && !last.dynamic && !last.pseudoEl) {
            keys.forEach(function (k) { if (!nonNone.has(k)) nonNone.set(k, r); });
        }
    }

    FRAG_RE.lastIndex = 0;
    let fm;
    const seen = new Set();
    while ((fm = FRAG_RE.exec(js)) !== null) {
        const attrs = parseAttrs(fm[2].replace(/\\"/g, '"').replace(/\\'/g, "'"));
        const cls = (attrs['class'] || '').trim();
        const keys = (attrs['id'] ? ['#' + attrs['id']] : [])
            .concat(cls ? cls.split(/\s+/).map(function (c) { return '.' + c; }) : []);
        if (!keys.length) continue;
        checkedFrags++;
        for (const k of keys) {
            if (guarded.has(k)) continue;
            if (!nonNone.has(k)) continue;
            const sig = rec.page + k;
            if (seen.has(sig)) continue;
            seen.add(sig);
            failures++;
            const r = nonNone.get(k);
            console.log('  FAIL ' + rec.page + '  JS fragment <' + fm[1] + ' ... hidden> carries ' + k);
            console.log('         ' + r.src + ' :: ' + r.sel + '  sets display: ' + r.display);
            console.log('         and no rule sets display:none for ' + k + '[hidden]');
        }
    }
    console.log('  ok   ' + rec.page);
}

/* --------------------------------------------------------------------------------
 * Pass 3 -- ids and classes the page's JS hands a `hidden` assignment to. Resolves the
 * cascade AS IF the attribute were set, so it answers "would this element actually
 * collapse", not "does a guard exist somewhere". Kept as a supplement to Pass 1, never
 * as a substitute: on its own this is the enumeration that missed #oeVcode.
 */
console.log('');
console.log('=== Pass 3 -- ids/classes the JS assigns `hidden` to (one hop of aliasing) ===');

let checkedJs = 0;
for (const rec of perPage) {
    const html = fs.readFileSync(path.join(RRV8, rec.page), 'utf8');
    const scripts = [];
    const SC = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
    let sm;
    while ((sm = SC.exec(html)) !== null) scripts.push(sm[1]);
    const js = scripts.join('\n');

    // Aliasing, one hop:  var g = $('js-job-guard');  ... g.hidden = ...
    // Resolution is by NEAREST PRECEDING ASSIGNMENT, not by a name->key map. A flat map
    // is how the previous sweep reported #adminAskBar as a bug: `bar` is assigned from
    // $('adminAskBar') in one function and from $('svcMemBar') in another, and a map keyed
    // on the name alone hands every `bar.hidden` in the file to whichever won the race.
    // Same story for `btn`. So: record EVERY assignment to a name, element lookup or not,
    // and if the nearest one before a `.hidden` write is not an element lookup, decline to
    // resolve rather than guess.
    const assigns = new Map();          // name -> [ {at, key|null} ] in source order
    const ASSIGN_RE = /(?:(?:var|let|const)\s+)?([A-Za-z_$][\w$]*)\s*=\s*([^;\n]*)/g;
    const LOOKUP_RE = /^\s*(?:document\s*\.\s*getElementById|\$|document\s*\.\s*querySelector|qs)\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:$|[;,)])/;
    let am;
    while ((am = ASSIGN_RE.exec(js)) !== null) {
        const name = am[1];
        const lm = LOOKUP_RE.exec(am[2]);
        if (!assigns.has(name)) assigns.set(name, []);
        assigns.get(name).push({ at: am.index, key: lm ? lm[1] : null });
    }
    function resolveAt(name, at) {
        const list = assigns.get(name);
        if (!list) return null;
        let best = null;
        for (const a of list) { if (a.at < at) best = a; else break; }
        return best ? best.key : null;   // null when the nearest assignment was not a lookup
    }

    const keys = new Set();
    function addKey(raw) {
        raw = String(raw || '').trim();
        if (!raw) return;
        if (raw[0] === '#' || raw[0] === '.') { keys.add(raw); return; }
        if (/^[-\w]+$/.test(raw)) keys.add('#' + raw);        // a bare getElementById argument
    }

    // direct:  $('x').hidden = ... | getElementById('x').hidden | querySelector('.c').hidden
    const DIRECT_RE = /(?:document\s*\.\s*getElementById|\$|document\s*\.\s*querySelector(?:All)?|qs)\s*\(\s*['"]([^'"]+)['"]\s*\)\s*(?:\.\s*hidden\b|\.\s*(?:set|remove|toggle)Attribute\s*\(\s*['"]hidden['"])/g;
    let dm;
    while ((dm = DIRECT_RE.exec(js)) !== null) addKey(dm[1]);

    // aliased:  g.hidden = ... | g.setAttribute('hidden', '')
    const VAR_RE = /\b([A-Za-z_$][\w$]*)\s*(?:\.\s*hidden\s*=|\.\s*(?:set|remove|toggle)Attribute\s*\(\s*['"]hidden['"])/g;
    let vm2;
    while ((vm2 = VAR_RE.exec(js)) !== null) addKey(resolveAt(vm2[1], vm2.index));

    for (const key of keys) {
        // Only single-key selectors are resolvable here; anything richer is Pass 1's job.
        const parts = parseSelector(key);
        if (!parts || parts.length !== 1) continue;
        const targets = rec.doc.elements.filter(function (e) { return compoundMatches(e, parts[0].c); });
        if (!targets.length) continue;                        // built at runtime -- named blind spot
        for (const el of targets) {
            checkedJs++;
            const w = displayWhenHidden(el, rec.rules);
            if (w.display === null || w.display === 'none' || w.acknowledged) break;
            failures++;
            console.log('  FAIL ' + rec.page + '  JS hides ' + key + '  ->  ' + describe(el));
            console.log('         but it would compute to display: ' + w.display);
            console.log('         winner: ' + w.from);
            break;                                            // one report per key
        }
    }
    console.log('  ok   ' + rec.page);
}

console.log('');
if (unsupported.size) {
    console.log('selector shapes this parser declined (rule dropped, coverage reduced):');
    for (const [k, n] of unsupported) console.log('  ' + n + 'x  ' + k);
    console.log('');
}
console.log('checked ' + checkedEls + ' markup element(s) with [hidden] across ' + pages.length
            + ' page(s), plus ' + checkedFrags + ' JS-built fragment(s) and '
            + checkedJs + ' JS-hidden element(s)');

if (failures) {
    console.log('');
    console.log(failures + ' FAILURE(S) -- an element the code believes is hidden renders on screen.');
    process.exit(1);
}
console.log('PASS');
