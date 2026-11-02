/* test-v8-links.js -- every page a V8 file links to exists (UI-261).
 *
 *   node Tools/test-v8-links.js
 *
 * WHY THIS EXISTS. UI-261 deleted two V8 pages that nothing linked to: admin-data-service.html (unlinked in #302)
 * and inventory-variance-source.html (its last link went when #307 retired the reconciliation page). Deleting a
 * page is the risky direction: if a link to it survives somewhere (an href, a location.href, a help-panel src),
 * the reader gets a 404 and nothing reports it. admin-job-schedule.html was deleted the same way on 2026-09-14,
 * and that check was a one-off grep. This makes it a gate.
 *
 * It reads every .html and .js file under RRV8/ (vendor/ excluded), drops comments, and collects each quoted or
 * attribute-valued "<path>.html" reference: href, src, data-help-src, location.href / location.replace targets,
 * string literals. Each one is resolved against the file's own folder, query and hash stripped. The file it
 * names must exist. A link the browser follows to a missing file is a 404, so this asks what the browser asks.
 * It cannot see a URL assembled from parts ('inventory-' + key + '.html'), and says so in the count it prints.
 *
 *   L1  the harness found references at all (a broken extractor finds none and passes)
 *   L2  every reference resolves to a file that exists
 *
 * MUTATION ARMS, run last:
 *   A1  a link to a deleted page injected into home.html's markup must fail L2
 *   A2  the same link in a script string (location.href = '...') must fail L2
 *   A3  the same name inside a // comment must NOT fail: comments describe history and are allowed to
 */
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const V8 = path.join(ROOT, 'RRV8');

function walk(dir) {
  let out = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== 'vendor' && e.name !== 'node_modules') out = out.concat(walk(p)); }
    else if (/\.(html|js)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Comments name retired files on purpose ("that page was deleted 2026-11-02"), so they are dropped before
// extracting: HTML comments, line comments that open a line (the safe form, see
// test-comment-stripper-safety.js; '//' in an https URL is left alone), and lines that open with '/*' or '*',
// which is how this repo writes block comments (' * login.html renders it'). All three are line-based, so none of
// them has to pair a block comment's delimiters. A block comment written WITHOUT leading stars that names a
// missing page still fails L2; reword it.
function stripComments(src) {
  return src
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, '')
    .replace(/^[ \t]*(?:\/\*|\*).*$/gm, '');
}

// A reference opens with a quote, '=' or whitespace and closes with a quote, '?', '#' or whitespace. Parentheses
// are left out on purpose: config.js's AI grounding titles each section "(administrator-managing-users.html)",
// which names a source and is not a link.
const REF = /["'`=\s]((?:\.\.\/|\.\/)?[A-Za-z0-9_][A-Za-z0-9_.\/-]*\.html)(?=[?#"'`\s]|$)/g;
function refsOf(src) {
  const out = [];
  let m;
  REF.lastIndex = 0;
  while ((m = REF.exec(stripComments(src))) !== null) out.push(m[1]);
  return out;
}

// Returns [{ file, ref }] for every reference whose target is missing.
function deadLinks(override) {
  const dead = [];
  let total = 0;
  for (const f of walk(V8)) {
    const rel = path.relative(ROOT, f).replace(/\\/g, '/');
    const src = (override && override[rel] != null) ? override[rel] : fs.readFileSync(f, 'utf8');
    for (const ref of refsOf(src)) {
      total++;
      const target = path.resolve(path.dirname(f), ref.replace(/[?#].*$/, ''));
      if (!fs.existsSync(target)) dead.push({ file: rel, ref });
    }
  }
  return { dead, total };
}

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok || !detail ? '' : '   ' + detail));
  return ok;
}

const base = deadLinks();
console.log('V8 links (' + base.total + ' references to .html files across RRV8/; URLs built from parts are not seen)');
check('L1 the extractor found references', base.total >= 100, 'found only ' + base.total + ': the extractor is broken');
check('L2 every referenced page exists', base.dead.length === 0,
  base.dead.map((d) => d.file + ' -> ' + d.ref).join('; '));

console.log('\nmutation arms');
const homeRel = 'RRV8/home.html';
const home = fs.readFileSync(path.join(ROOT, homeRel), 'utf8');
const at = home.indexOf('<body');
if (at < 0) { console.log('HARNESS BROKEN: no <body in ' + homeRel); process.exit(1); }
const inject = (s) => home.slice(0, at) + s + '\n' + home.slice(at);
const arm = (name, html, wantDead) => {
  const r = deadLinks({ [homeRel]: html });
  const hit = r.dead.some((d) => d.file === homeRel && /admin-data-service\.html/.test(d.ref));
  check(name, hit === wantDead, hit ? 'the comment was read as a link' : 'the dead link was not caught');
};
arm('A1 an href to a deleted page fails', inject('<a href="admin-data-service.html">Open</a>'), true);
arm('A2 a script string to a deleted page fails', inject('<script>location.href = \'admin-data-service.html?x=1\';</script>'), true);
arm('A3 a comment naming a deleted page passes', inject('<script>\n  // admin-data-service.html was deleted\n</script>'), false);

console.log(failures ? '\nFAIL: ' + failures + ' check(s)' : '\nPASS');
process.exit(failures ? 1 : 0);
