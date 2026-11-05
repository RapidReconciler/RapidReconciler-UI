/* test-page-source.js -- Tools/page-source.js puts home-frame.css back where the page links it (UI-240 slice 2).
 *
 *   node Tools/test-page-source.js
 *
 * Eight suites judge Home's CSS through readPage(). If it inlined nothing, a "no rule hides X" check would
 * pass on an empty stylesheet, so its failure modes are pinned here, each against real or mutated input:
 *   1  Home and In Transit both link home-frame.css, and readPage() returns its rules inside a <style>.
 *   2  The sheet lands at the link's position: before help-sidebar.css on Home, as the old inline block was.
 *   3  A page that does not link the sheet throws (no silent empty stylesheet).
 *   4  A linked sheet that does not exist throws.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { readPage, inlineSheet } = require('./page-source');

let failures = 0;
function check(name, ok, detail) { console.log((ok ? '  ok   ' : '  FAIL ') + name + (ok || !detail ? '' : '\n         ' + detail)); if (!ok) failures++; }
function throws(fn) { try { fn(); return false; } catch (_) { return true; } }

const ROOT = path.join(__dirname, '..');
const sheet = fs.readFileSync(path.join(ROOT, 'RRV8', 'home-frame.css'), 'utf8').replace(/\r\n/g, '\n');
for (const page of ['RRV8/home.html', 'RRV8/transit.html']) {
    const html = readPage(page);
    const styles = (html.match(/<style>[\s\S]*?<\/style>/g) || []).join('\n');
    check('1 ' + page + ' carries home-frame.css as a <style> block', styles.indexOf('.home-actions') >= 0 && styles.indexOf(sheet.slice(0, 200)) >= 0);
    check('1 ' + page + ' has no home-frame.css link left after inlining', !/href="home-frame\.css"/.test(html));
}
const home = readPage('RRV8/home.html');
check('2 on Home the sheet sits before help-sidebar.css, where the inline block was', home.indexOf('.home-actions') < home.indexOf('help-sidebar.css') && home.indexOf('.home-actions') > 0);

const abs = path.join(ROOT, 'RRV8', 'home.html');
check('3 a page without the link throws', throws(() => inlineSheet('<html><head></head></html>', abs, 'home-frame.css')));
check('3 a link that is not a stylesheet throws', throws(() => inlineSheet('<link href="home-frame.css" rel="preload">', abs, 'home-frame.css')));
check('4 a linked sheet that does not exist throws', throws(() => inlineSheet('<link href="no-such.css" rel="stylesheet">', abs, 'no-such.css')));
check('control: a real link does not throw', !throws(() => inlineSheet('<link href="home-frame.css" rel="stylesheet">', abs, 'home-frame.css')));

console.log(failures ? '\n' + failures + ' FAILURE(S)' : '\nPASS');
process.exit(failures ? 1 : 0);
