/* test-dock-clearance.js -- behaviour test for the Home workbar's left inset (UI-163).
 *
 *   node Tools/test-dock-clearance.js
 *
 * WHY THIS EXISTS. Two fixed-position elements share the bottom-left of every V8
 * page: the AI governance dock (mounted by sidebar.js, bottom-left, viewport-
 * anchored) and Home's workbar (the Welcome / Database / Data-as-of / Companies /
 * View pills, centered in a 1340px box). They must not sit on top of each other.
 *
 * Until 2026-08-27 the separation was a constant: `.home-actions { padding-left:
 * 404px }`, hand-measured against the dock as it rendered that day. A constant
 * cannot be right, and this one was wrong in three different directions at once:
 *
 *   - the dock's width is four proportional-font tier labels (Off / Basic /
 *     Enhanced / Full) plus an "AI" cap; relabel one and 404 is stale;
 *   - the <=980px media query overrode the pad back to 24px, which did not move the
 *     dock -- it just drove the pills through it;
 *   - in mode=prod the dock is never mounted at all (mountAiTierDock returns early),
 *     so production reserved 404px of empty gutter to clear a control that is not
 *     on the page.
 *
 * The fix replaces the constant with a measurement: sidebar.js reads both rects and
 * sets --dock-clear on every [data-dock-clear] element. That is what this test
 * locks, in two assertions, because there are two separate ways for it to break.
 *
 * ASSERTION 1 -- THE ARITHMETIC. syncDockClearance is sliced out of the shipping
 * sidebar.js and driven against stub geometry for the three cases that matter: no
 * dock (prod), a dock overlapping a bar pinned at viewport left, and a dock well
 * clear of a bar centered on a wide viewport. The no-dock case is the one a
 * "subtract the dock width" implementation quietly gets wrong, and it is the case
 * every production customer runs.
 *
 * ASSERTION 2 -- THE PROPERTY HAS A SINK, AND THE CONSTANT HAS NOT COME BACK.
 * sidebar.js setting --dock-clear is worth nothing if home.html does not read it
 * back, and the property name is the kind of thing a rename splits silently. So
 * this checks the whole contract as it ships: the bar declares data-dock-clear,
 * its padding-left reads var(--dock-clear), NO rule anywhere in the file pins
 * .home-actions' left padding to a constant again (that is how the 404 got in and
 * how the media query undid it), and .ha-db no longer carries the margin-left:auto
 * that split the pills into two groups. The owner superseded that split on
 * 2026-08-27; without this assertion the next reader restores it as a tidy-up.
 *
 * SOURCE IS NOT RETYPED. The function is sliced out of the shipping sidebar.js and
 * the CSS assertions run over the shipping home.html.
 *
 * BLIND SPOTS, named:
 *   - It does not prove the pills FIT once inset. Five pills wider than the bar
 *     still overflow; flex-wrap catches that visually and only human eyes confirm
 *     the result. Owner is the eyes on the render.
 *   - It does not prove syncDockClearance is CALLED on the paths that change the
 *     dock's width. It checks the arithmetic and the contract, not every caller.
 *   - It measures nothing about the dock's real rendered width -- by design. The
 *     whole point is that the shipping code stops needing to know it.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SIDEBAR = path.join(__dirname, '..', 'RRV8', 'sidebar.js');
const HOME = path.join(__dirname, '..', 'RRV8', 'home.html');
const sidebarSrc = fs.readFileSync(SIDEBAR, 'utf8');
const homeSrc = fs.readFileSync(HOME, 'utf8');

let failures = 0;
function check(name, got, want) {
    const g = JSON.stringify(got), w = JSON.stringify(want);
    if (g === w) { console.log('  ok   ' + name); return; }
    console.log('  FAIL ' + name + '\n         got  ' + g + '\n         want ' + w);
    failures++;
}

/* ---- slice the shipping function out of sidebar.js ---------------------- */
function slice(src, header) {
    // Normalise CRLF: the repo checks out with Windows endings locally and LF in
    // CI, and an exact-match brace scan silently finds nothing against '\r'.
    const lines = src.replace(/\r\n/g, '\n').split('\n');
    const start = lines.findIndex(l => l.trim().startsWith(header));
    if (start < 0) throw new Error('could not find `' + header + '` in sidebar.js');
    const indent = lines[start].match(/^\s*/)[0];
    for (let i = start + 1; i < lines.length; i++) {
        if (lines[i] === indent + '}') return lines.slice(start, i + 1).join('\n');
    }
    throw new Error('could not find the end of `' + header + '`');
}

const fnSrc = slice(sidebarSrc, 'function syncDockClearance()');

// DOCK_CLEAR_GAP lives beside the function; read it rather than retyping it, so a
// change to the gap changes the expectations here too instead of failing them.
const gapMatch = sidebarSrc.match(/var\s+DOCK_CLEAR_GAP\s*=\s*(\d+)/);
if (!gapMatch) { console.log('  FAIL DOCK_CLEAR_GAP not found in sidebar.js'); failures++; }
const GAP = gapMatch ? Number(gapMatch[1]) : 0;

/* ---- assertion 1: the arithmetic --------------------------------------- */
// A stub element records what gets written to --dock-clear.
function makeBar(left, min, hostsDock) {
    return {
        _set: null,
        getAttribute: () => String(min),
        getBoundingClientRect: () => ({ left, right: left + 900, width: 900 }),
        // The bar is asked whether the dock is one of its own children. A hosted
        // dock is a flex child, not an overlapping layer, so it needs no clearance.
        contains: () => !!hostsDock,
        style: { setProperty(k, v) { if (k === '--dock-clear') this._owner._set = v; } }
    };
}
function run(dockRect, barLeft, min, hostsDock) {
    const bar = makeBar(barLeft, min, hostsDock);
    bar.style._owner = bar;
    const sandbox = {
        DOCK_CLEAR_GAP: GAP,
        Math, Array, parseFloat,
        document: {
            querySelectorAll: sel => (sel === '[data-dock-clear]' ? [bar] : []),
            getElementById: id => {
                if (id !== 'rrai-dock' || !dockRect) return null;
                return { offsetParent: {}, getBoundingClientRect: () => dockRect };
            }
        }
    };
    vm.createContext(sandbox);
    vm.runInContext(fnSrc + '\nsyncDockClearance();', sandbox);
    return bar._set;
}

console.log('assertion 1 -- the inset arithmetic');
// mode=prod / any page with no dock: falls back to the element's own minimum.
check('no dock on the page -> the declared minimum',
    run(null, 0, 24), '24px');
// A dock whose rect has no width (mid-mount) is not a measurement -- same fallback.
check('dock present but unmeasurable -> the declared minimum',
    run({ left: 16, right: 16, width: 0 }, 0, 24), '24px');
// Bar pinned at viewport left (viewport <= 1340): full clearance needed.
check('dock at 16..332, bar at viewport left -> clears the dock plus the gap',
    run({ left: 16, right: 332, width: 316 }, 0, 24), (332 + GAP) + 'px');
// Wide viewport: the bar is centered, so its own left edge is already past the
// dock and it needs no inset beyond its gutter. This is the case the old constant
// got most wrong -- it indented 404px on top of an already-clear bar.
check('wide viewport, bar centered clear of the dock -> the declared minimum',
    run({ left: 16, right: 332, width: 316 }, 500, 24), '24px');
// Narrow viewport where the media query used to force the pad to 24 -- the dock is
// still there, so the inset must still clear it.
check('narrow viewport -> still clears the dock (the old breakpoint did not)',
    run({ left: 10, right: 300, width: 290 }, 0, 24), (300 + GAP) + 'px');
// HOSTED (2026-08-27): the dock is mounted INSIDE the bar as its last flex child,
// so the bar must not reserve a gutter for it. Same geometry as the overlapping
// case above and the opposite answer -- which is the whole point of the guard.
// Without it the inset is self-referential: padding pushes the bar right, which
// pushes the dock right, which asks for more padding.
check('dock hosted inside the bar -> the declared minimum, not a gutter',
    run({ left: 16, right: 332, width: 316 }, 0, 24, true), '24px');

/* ---- assertion 2: the property has a sink, and the constant is gone ----- */
console.log('assertion 2 -- the contract as it ships');

check('sidebar.js targets [data-dock-clear]',
    /querySelectorAll\(\s*'\[data-dock-clear\]'\s*\)/.test(sidebarSrc), true);
check('sidebar.js writes the --dock-clear property',
    /setProperty\(\s*'--dock-clear'/.test(sidebarSrc), true);
check('home.html declares data-dock-clear on the workbar',
    /class="home-actions"[^>]*data-dock-clear=/.test(homeSrc), true);

// The hosted mount, end to end. Owner ruling 2026-08-27: the AI pill belongs to
// the RIGHT of the View pill, which only holds if the dock is a child of the bar
// AND its flex order sorts after .ha-roles. Both halves are checked, because
// either one alone renders the pill in the wrong place with no error.
check('sidebar.js looks for a host container',
    /querySelector\(\s*'\[data-ai-dock-host\]'\s*\)/.test(sidebarSrc), true);
check('sidebar.js marks a hosted dock inline (drops position:fixed)',
    /rrai-dock--inline\{position:static/.test(sidebarSrc)
    && /classList\.add\('rrai-dock--inline'\)/.test(sidebarSrc), true);
check('home.html offers the workbar as the dock host',
    /class="home-actions"[^>]*data-ai-dock-host/.test(homeSrc), true);

// Read the flex order off a .home-actions rule. Deliberately NOT a regex built
// from the selector string: escaping a selector into a RegExp is the kind of
// double-escaped construction that silently mis-parses, and there are exactly
// two rules to read. Plain string scan, then one literal regex for the value.
function orderOf(selector) {
    const at = homeSrc.indexOf(selector + ' {');
    if (at < 0) return null;
    const open = homeSrc.indexOf('{', at);
    const close = homeSrc.indexOf('}', open);
    if (open < 0 || close < 0) return null;
    const o = homeSrc.slice(open + 1, close).match(/(?:^|;)\s*order\s*:\s*(-?\d+)/);
    return o ? Number(o[1]) : null;
}
const viewOrder = orderOf('.home-actions .ha-roles');
const aiOrder = orderOf('.home-actions #rrai-dock');
check('the View pill declares a flex order', viewOrder !== null, true);
check('the AI dock declares a flex order', aiOrder !== null, true);
check('the AI pill sorts to the RIGHT of the View pill',
    (viewOrder !== null && aiOrder !== null) ? aiOrder > viewOrder : false, true);

// Every declaration of .home-actions in the file, base rule and media queries
// alike. A left padding on any of them that is not var(--dock-clear) is the
// regression: that is precisely the shape of both the original 404px and the
// <=980px override that undid it.
const decls = [];
const re = /\.home-actions\s*\{([^}]*)\}/g;
let m;
while ((m = re.exec(homeSrc)) !== null) decls.push(m[1]);
check('.home-actions is declared at least once', decls.length > 0, true);

const leftPadRe = /(?:^|;)\s*padding-left\s*:\s*([^;]+)/;
const shorthandRe = /(?:^|;)\s*padding\s*:\s*([^;]+)/;
const offenders = [];
decls.forEach(body => {
    const lp = body.match(leftPadRe);
    if (lp && !/var\(--dock-clear/.test(lp[1])) offenders.push('padding-left: ' + lp[1].trim());
    // A shorthand `padding:` resets the left value too, so it is the same defect
    // unless it also routes through the custom property.
    const sh = body.match(shorthandRe);
    if (sh && !/var\(--dock-clear/.test(sh[1])) offenders.push('padding: ' + sh[1].trim());
});
check('no .home-actions rule pins the left padding to a constant', offenders, []);

check('the workbar reads var(--dock-clear) for its left padding',
    decls.some(b => /padding-left\s*:\s*var\(--dock-clear/.test(b)), true);

// The 2026-07-11 left/right split, superseded by the owner on 2026-08-27.
const haDb = homeSrc.match(/\.home-actions\s+\.ha-db\s*\{([^}]*)\}/);
check('.ha-db rule exists', !!haDb, true);
check('.ha-db no longer floats the pills into a right-hand group',
    haDb ? /margin-left\s*:\s*auto/.test(haDb[1]) : true, false);

console.log(failures === 0
    ? '\nPASS -- workbar inset is measured, not constant; pills flow left.'
    : '\n' + failures + ' FAILURE(S)');
process.exit(failures === 0 ? 0 : 1);
