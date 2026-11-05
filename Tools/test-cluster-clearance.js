/* test-cluster-clearance.js -- the page always ends clear of the bottom cluster (UI-240 slice 2 follow-up).
 *
 *   node Tools/test-cluster-clearance.js
 *
 * WHAT IT PINS. Home's bottom cluster (#homeActions) is fixed to the viewport bottom and wraps onto more rows as
 * the window narrows. The page's clearance below its content used to be a constant (.home-main 96px + .wrap 56px
 * = 152px). Measured in headless Chrome on 2026-11-05 with Home's analyst view showing every control:
 *   1440 / 1280 / 1024 / 900 wide: 2 rows, 107px tall      768 wide: 3 rows, 153px tall, 1px short
 * RRV8/home-frame.js now measures the cluster and sets --ha-clear; home-frame.css pads .home-main by
 * max(96px, --ha-clear). This suite runs the SHIPPING home-frame.js on a stand-in DOM carrying those measured
 * geometries:
 *   C1  two rows: the measured need is below the 96px floor, so the page does not move (Home's screenshots at
 *       1440/1280/1024 were unchanged by this fix, measured)
 *   C2  three rows: the padding grows so the clearance covers the cluster plus a 16px gap
 *   C3  hidden controls (empty rects) are not measured; nothing shown needs nothing
 *   C4  the value is set on <html> at load, again when the cluster's own box resizes (a control appears, the AI
 *       dock mounts), and again on a window resize
 *   C5  the cascade both pages load ends with .home-main padding-bottom = max(96px, var(--ha-clear, ...))
 * Each has a mutation arm that must turn it red.
 *
 * BLIND SPOT, named: no layout engine. That the padding really clears the cluster is the headless measurement
 * above (overlap at the end of the scroll 0 at all five widths after the fix, 58-66px with the clearance
 * stripped as a control), not this file.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { readPage } = require('./page-source');

const FRAME = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home-frame.js'), 'utf8');
const CSS_FILE = fs.readFileSync(path.join(__dirname, '..', 'RRV8', 'home-frame.css'), 'utf8');

let failures = 0;
function check(name, got, want, log) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (log !== false) console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok ? '' : '\n         got  ' + JSON.stringify(got) + '\n         want ' + JSON.stringify(want)));
    return ok;
}

// A stand-in page: #homeActions with one rect per control, .wrap with its bottom padding, <html> recording
// the custom property, a ResizeObserver and window listeners that the test can fire.
function page(frameSrc, viewportH, controls) {
    const rec = { vars: {}, ro: null, observed: null, resize: [] };
    const ha = { children: controls.map((r) => ({ getBoundingClientRect: () => r })) };
    const wrap = { style: { paddingBottom: '56px' } };
    const sb = {
        console,
        document: {
            readyState: 'complete',
            getElementById: (id) => (id === 'homeActions' ? ha : null),
            querySelector: (sel) => (sel === '.wrap' ? wrap : null),
            documentElement: { style: { setProperty: (k, v) => { rec.vars[k] = v; } } },
            addEventListener() {}
        },
        getComputedStyle: (el) => el.style,
        ResizeObserver: function (cb) { rec.ro = cb; this.observe = (el) => { rec.observed = el; }; }
    };
    sb.window = { innerHeight: viewportH, addEventListener: (ev, fn) => { if (ev === 'resize') rec.resize.push(fn); } };
    sb.window.document = sb.document;
    vm.createContext(sb);
    vm.runInContext(frameSrc, sb, { filename: 'home-frame.js' });
    return { sb, rec, ha, setControls: (list) => { ha.children = list.map((r) => ({ getBoundingClientRect: () => r })); } };
}
const pill = (top, h) => ({ top, bottom: top + h, width: 150, height: h });
const px = (v) => parseFloat(v);
const effective = (v) => Math.max(96, px(v));   // what home-frame.css's max(96px, var(--ha-clear)) resolves to

function run(frameSrc, css, log) {
    let bad = 0;
    const c = (n, g, w) => { if (!check(n, g, w, log)) bad++; };
    try {
        // C1: 1440 wide, 2 rows: the cluster's top row starts 107px above the viewport bottom (measured).
        let p = page(frameSrc, 900, [pill(793, 34), pill(793, 34), pill(839, 43), pill(841, 34)]);
        c('C1 two rows (107px): --ha-clear is 107 + 16 - 56 = 67px', p.rec.vars['--ha-clear'], '67px');
        c('C1 so .home-main keeps its 96px and the page does not move', effective(p.rec.vars['--ha-clear']), 96);

        // C2: 768 wide, 3 rows, 153px (measured).
        p = page(frameSrc, 900, [pill(747, 34), pill(793, 34), pill(839, 43)]);
        c('C2 three rows (153px): --ha-clear is 153 + 16 - 56 = 113px', p.rec.vars['--ha-clear'], '113px');
        c('C2 so the clearance below the content (padding + .wrap) covers the cluster plus 16px', effective(p.rec.vars['--ha-clear']) + 56 >= 153 + 16, true);

        // C3: hidden controls are display:none and report empty rects.
        p = page(frameSrc, 900, [{ top: 0, bottom: 0, width: 0, height: 0 }, pill(793, 34)]);
        c('C3 a hidden control (empty rect at top 0) is not measured', p.rec.vars['--ha-clear'], '67px');
        p = page(frameSrc, 900, [{ top: 0, bottom: 0, width: 0, height: 0 }]);
        c('C3 nothing shown needs nothing', p.rec.vars['--ha-clear'], '0px');

        // C4: set at load, then followed as the cluster grows.
        p = page(frameSrc, 900, [pill(793, 34)]);
        c('C4 set on <html> at load, and #homeActions is the box observed', [p.rec.vars['--ha-clear'], p.rec.observed === p.ha], ['67px', true]);
        p.setControls([pill(701, 34), pill(747, 34), pill(793, 34)]);   // a fourth row's worth: a control appeared
        if (p.rec.ro) p.rec.ro([]);
        c('C4 when the cluster grows a row, the ResizeObserver re-measures it', p.rec.vars['--ha-clear'], '159px');
        p.setControls([pill(747, 34)]);
        p.rec.resize.forEach((fn) => fn());
        c('C4 and a window resize re-measures it too', p.rec.vars['--ha-clear'], '113px');
    } catch (e) { bad++; if (log !== false) console.log('  FAIL could not run home-frame.js: ' + (e && e.stack || e)); }

    // C5: the cascade each page loads. Rules for exactly `.home-main`, in load order; the last padding-bottom wins.
    for (const pg of ['RRV8/home.html', 'RRV8/transit.html']) {
        const html = readPage(pg, { override: { 'home-frame.css': css } });
        // stripper-safety: css-only. The block-comment strip below runs on <style> contents only, the case UI-170 permits.
        const style = (html.match(/<style\b[^>]*>([\s\S]*?)<\/style>/g) || []).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
        let last = null;
        for (const m of style.matchAll(/(^|[}\s])\.home-main\s*\{([^}]*)\}/g)) {
            const d = /padding-bottom\s*:\s*([^;]+)/.exec(m[2]); if (d) last = d[1].trim();
        }
        c('C5 ' + pg + ': the winning .home-main padding-bottom is max(96px, var(--ha-clear, ...))', !!last && /^max\(\s*96px\s*,\s*var\(--ha-clear\b/.test(last), true);
    }
    return bad;
}

console.log('home-frame.js / home-frame.css as shipped:');
failures += run(FRAME, CSS_FILE, true);

console.log('mutation arms:');
function arm(name, where, from, to) {
    const src = where === 'css' ? CSS_FILE : FRAME;
    if (src.indexOf(from) < 0) { failures++; console.log('  FAIL arm "' + name + '": the text it mutates is gone'); return; }
    const mut = typeof to === 'function' ? to(src) : src.replace(from, to);
    const bad = where === 'css' ? run(FRAME, mut, false) : run(mut, CSS_FILE, false);
    if (bad > 0) console.log('  ok   arm "' + name + '" turns ' + bad + ' assertion(s) red');
    else { failures++; console.log('  FAIL arm "' + name + '" changed nothing'); }
}
arm('no gap above the cluster', 'js', '+ CLUSTER_GAP - (wrapPad || 0)', '- (wrapPad || 0)');
arm('.wrap padding counted twice (not subtracted)', 'js', '+ CLUSTER_GAP - (wrapPad || 0)', '+ CLUSTER_GAP');
arm('hidden controls measured', 'js', 'if (r && r.width > 0 && r.height > 0 && r.top < top)', 'if (r && r.top < top)');
arm('measured from the cluster\'s bottom instead of its top', 'js', 'r.top < top) top = r.top;', 'r.bottom < top) top = r.bottom;');
arm('the cluster is not observed', 'js', 'new ResizeObserver(syncClusterClearance).observe(ha);', '');
arm('no re-measure on window resize', 'js', "window.addEventListener('resize', syncClusterClearance);", '');
arm('the CSS rule dropped', 'css', '.home-main { padding-bottom: max(96px, var(--ha-clear, 96px)); }', '');
// Same rule, moved above the 96px constant: equal specificity, so the constant would win the cascade.
const MAXRULE = '.home-main { padding-bottom: max(96px, var(--ha-clear, 96px)); }', CONSTRULE = '.home-main { flex: 1 1 auto; min-width: 0; padding-bottom: 96px; }';
arm('the CSS rule put before the constant', 'css', MAXRULE, (s) => s.replace(MAXRULE, '').replace(CONSTRULE, MAXRULE + '\n  ' + CONSTRULE));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nPASS');
process.exit(failures ? 1 : 0);
