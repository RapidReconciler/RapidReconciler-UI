/* test-export-progress.js -- what the page says while an export is running.
 *
 * UI-179. The export watchdog showed an advisory at 40s and NOTHING before it.
 * toast() holds 2,600ms, so between 2.6s and 40s the page went silent while the
 * report built. The owner found it by running the export on 2026-09-15:
 *
 *   "I do see a 'Building Audit Report' toast for a few seconds but then it
 *    disappears, nothing happens for several seconds, then the complete message
 *    shows. There should be something in the interim."
 *
 * ⚠ AND THERE WAS NO COMMITTED TEST. UI-179 records a 14-assertion harness with
 * a mutation control, but a grep of Tools/ for `withExportWatchdog`, `expStall`
 * and `ExportStall` returns nothing -- control: the same grep for `canAnalyst`
 * returns two files, so the instrument works. That harness was never wired, and
 * the interval it did not cover is what shipped.
 *
 * WHAT THIS ASSERTS. The real functions, EXTRACTED FROM home.html rather than
 * retyped, run against a stub DOM with a fake clock. A retyped copy tests the
 * copy; the point is to exercise the shipped text.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const HOME = path.resolve(__dirname, '..', 'RRV8', 'home.html');
let failures = 0;
function check(name, got, want) {
    const ok = JSON.stringify(got) === JSON.stringify(want);
    if (!ok) { failures++; console.log(`  FAIL  ${name}\n          got  ${JSON.stringify(got)}\n          want ${JSON.stringify(want)}`); }
    else console.log(`  ok    ${name}`);
}

/* Pull one `function NAME(...) { ... }` out of the page by brace-matching.
   Fails loudly if absent: a missing subject must never read as a pass. */
function extract(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error(`cannot find function ${name}() in home.html`);
    let i = src.indexOf('{', start), depth = 0;
    for (; i < src.length; i++) {
        if (src[i] === '{') depth++;
        else if (src[i] === '}') { depth--; if (depth === 0) return src.slice(start, i + 1); }
    }
    throw new Error(`unbalanced braces reading ${name}()`);
}

const html = fs.readFileSync(HOME, 'utf8');

/* The two constants, read from the page so a change to either is caught here
   rather than silently diverging from what ships. */
function constant(name) {
    const m = new RegExp('var\\s+' + name + '\\s*=\\s*(\\d+)').exec(html);
    if (!m) throw new Error(`cannot find ${name} in home.html`);
    return Number(m[1]);
}
const WORKING_MS = constant('EXPORT_WORKING_MS');
const STALL_MS   = constant('EXPORT_STALL_MS');
const TOAST_MS   = 2600;   // toast()'s default hold: Math.max(1200, holdMs || 2600)

console.log('=== the timings leave no silent gap ===');
check('the working banner starts after the toast has gone',
      WORKING_MS >= TOAST_MS, true);
check('the working banner starts well before the stall advisory',
      WORKING_MS < STALL_MS, true);
check('EXPORT_STALL_MS is still 40s', STALL_MS, 40000);

/* ---------------------------------------------------------------- stub DOM */
function makeEnv() {
    const painted = [];
    const el = (id) => ({
        id, hidden: true, textContent: '', className: '',
        classList: { add(c) { this._c = c; }, remove() { this._c = null; } },
        appendChild() {}, addEventListener() {},
    });
    const nodes = {
        expStall: el('expStall'), expStallTitle: el('expStallTitle'),
        expStallBody: el('expStallBody'), expStallActs: el('expStallActs'),
    };
    const timers = [];
    let now = 0;
    const ctx = {
        $: (id) => nodes[id] || null,
        document: { createElement: () => el('x') },
        requestAnimationFrame: (fn) => fn(),
        setTimeout: (fn, ms) => { timers.push({ fn, at: now + ms, live: true }); return timers.length - 1; },
        clearTimeout: (h) => { if (timers[h]) timers[h].live = false; },
        // canRestartService is a dependency of _showExportStall; both branches
        // are exercised by flipping this.
        canRestartService: () => ctx.__canRestart,
        __canRestart: true,
        Promise, console,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    for (const fn of ['_hideExportStall', '_showExportWorking', '_showExportStall', 'withExportWatchdog']) {
        vm.runInContext(extract(html, fn), ctx, { filename: 'home.html:' + fn });
    }
    vm.runInContext('var EXPORT_WORKING_MS = ' + WORKING_MS + '; var EXPORT_STALL_MS = ' + STALL_MS
                    + '; var _expStallDepth = 0;', ctx);
    return {
        ctx, nodes, painted,
        advance(ms) { now += ms; timers.forEach(t => { if (t.live && t.at <= now) { t.live = false; t.fn(); } }); },
        liveTimers: () => timers.filter(t => t.live).length,
        state: () => nodes.expStall.hidden ? '<hidden>' : nodes.expStallTitle.textContent,
    };
}

console.log('=== the banner sequence over one slow export ===');
{
    const E = makeEnv();
    let settle;
    const p = new Promise(r => { settle = r; });
    const wrapped = vm.runInContext('withExportWatchdog', E.ctx)('Perpetual Reconciliation report', p);

    check('nothing is shown while the toast is still up', E.state(), '<hidden>');
    E.advance(WORKING_MS);
    check('the working banner names the report',
          E.state(), 'Building the Perpetual Reconciliation report…');
    check('the working banner offers NO remedy (nothing is wrong yet)',
          E.nodes.expStallActs.textContent, '');
    E.advance(STALL_MS - WORKING_MS);
    check('at 40s it escalates in place, same banner',
          E.state(), 'The Perpetual Reconciliation report is taking longer than usual');

    settle('done');
    return wrapped.then(v => {
        check('the value passes through', v, 'done');
        check('the banner is cleared on success', E.state(), '<hidden>');
        check('no timer is left running', E.liveTimers(), 0);
        return rejectionCase();
    });
}

function rejectionCase() {
    console.log('=== failure still clears it, and the caller still sees the error ===');
    const E = makeEnv();
    let boom;
    const p = new Promise((_r, j) => { boom = j; });
    const wrapped = vm.runInContext('withExportWatchdog', E.ctx)('report', p);
    E.advance(WORKING_MS);
    check('the working banner is up before the failure', E.state(), 'Building the report…');
    boom(new Error('export blew up'));
    return wrapped.then(
        () => { failures++; console.log('  FAIL  a rejection resolved instead of throwing'); },
        (e) => {
            check('the rejection is rethrown to the caller', e.message, 'export blew up');
            check('the banner is cleared on failure too', E.state(), '<hidden>');
            check('no timer is left running after a failure', E.liveTimers(), 0);
        }
    ).then(fastExportCase);
}

function fastExportCase() {
    /* ⛔ THE CASE THAT ACTUALLY NEEDS clearTimeout(workTimer), AND THE FIRST
       DRAFT OF THIS FILE MISSED IT. A mutation control removing that line left
       every assertion green, because the other cases advance PAST the working
       timer before settling -- by then it has already fired and is no longer
       armed, so nothing was being tested.

       The real leak is the ORDINARY export: it finishes in a couple of seconds
       (the owner's did), the work timer is still armed, and without the clear it
       fires afterwards and paints "Building…" over a page where nothing is
       running. Every fast export would flash a stale banner three seconds after
       its own download appeared. */
    console.log('=== a FAST export leaves nothing armed behind it ===');
    const E = makeEnv();
    let settle;
    const p = new Promise(r => { settle = r; });
    const wrapped = vm.runInContext('withExportWatchdog', E.ctx)('report', p);
    E.advance(WORKING_MS - 500);                 // finishes before the banner is due
    check('a fast export never shows the banner at all', E.state(), '<hidden>');
    settle('quick');
    return wrapped.then(() => {
        check('nothing is armed once it has settled', E.liveTimers(), 0);
        E.advance(STALL_MS * 2);                 // run the clock well past both
        check('and no stale banner appears afterwards', E.state(), '<hidden>');
    }).then(overlapCase);
}

function overlapCase() {
    console.log('=== two overlapping exports ===');
    const E = makeEnv();
    let a, b;
    const pa = new Promise(r => { a = r; }), pb = new Promise(r => { b = r; });
    const wd = vm.runInContext('withExportWatchdog', E.ctx);
    const wa = wd('Excel report', pa);
    const wb = wd('PDF report', pb);
    E.advance(WORKING_MS);
    // Neither label: with two in flight, naming one would name whichever
    // started second, and someone reading it could cancel the wrong export.
    check('with two running it names NEITHER, it counts them',
          E.state(), 'Building 2 reports…');
    a('x');
    return wa.then(() => {
        check('the FIRST to finish does not clear it',
              E.state(), 'Building 2 reports…');
        b('y');
        return wb;
    }).then(() => {
        check('the LAST to finish clears it', E.state(), '<hidden>');
        return permissionCase();
    });
}

function permissionCase() {
    console.log('=== the advisory still honours the restart grant ===');
    {
        const E = makeEnv();
        E.ctx.__canRestart = false;
        const wd = vm.runInContext('withExportWatchdog', E.ctx);
        wd('report', new Promise(() => {}));
        E.advance(STALL_MS);
        check('no rs grant: the advisory still appears',
              E.state(), 'The report is taking longer than usual');
        // ⚠ A NEGATIVE ASSERTION ALONE IS VACUOUS. "no restart button" passes on
        // a build where the advisory never renders at all, which is exactly the
        // pre-fix behaviour. It only means something paired with the line above.
        check('no rs grant: no restart button is offered',
              String(E.nodes.expStallActs.textContent).includes('Restart'), false);
    }
    console.log('');
    if (failures) { console.log(`${failures} CHECK(S) FAILED`); process.exit(1); }
    console.log('ALL CHECKS PASSED');
    process.exit(0);
}
