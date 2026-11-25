/*
 * VLC-323 (owner 2026-11-24: "Yes, build all three"): the installation prep form asks for what GSI's VALC needs to
 * reach the customer's servers, and the submission carries it.
 *
 *   F1  The SQL Server port, the JDE database port and (Oracle only) the Oracle service name are written into the
 *       submission, on the lines and labels RapidReconciler-Valc install-email-parser.js reads.
 *   F2  Ports are specified, never a default (owner 2026-11-24): a SQL Server source writes "JDE database port: 1433",
 *       filled in from the platform, and no Oracle line; an AS400 source hides the JDE port and writes "not used".
 *   F3  The Oracle service name row shows only for an Oracle source, and Send stays off for Oracle until it is filled.
 *   F4  A blank SQL Server port, or a port that is not 1 to 65535, keeps Send off.
 *   F7  The JDE port fills with 1433 or 1521 as the platform changes, and a port the customer typed survives a change.
 *   F8  The SQL Server port starts at 1433 in the markup (the fake DOM below has no markup to ask).
 *   F5  Sealed (VLC-298): the file opens to the full text, ports and password included; the email text carries the
 *       ports and names the attachment where the password was.
 *   F6  The JDE password box masks what is typed.
 *
 * Then the port line is removed from the page in memory and F1 must go red.
 *
 * ⚠ The page's OWN script runs, extracted from GSIRRSales/rr-installation-prep.html, over a small fake DOM (jsdom is
 *   not a dependency of this repo). The fake answers getElementById for every id and the two radio groups; every
 *   other query returns nothing, so the checklist sections of the submission are empty here. For F5 the page's empty
 *   PREP_RECIPIENTS is replaced, in memory only, with a key made for this run: the shipped page seals for no one
 *   until QA and Prod publish theirs.
 *
 *   node Tools/test-prep-install-fields.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto, createHash } = require('crypto');

const PAGE = path.join(__dirname, '..', 'GSIRRSales', 'rr-installation-prep.html');
const HTML = fs.readFileSync(PAGE, 'utf8');

let pass = 0, fail = 0;
function check(what, ok, detail) {
  if (ok) { pass++; console.log('  PASS  ' + what); }
  else    { fail++; console.log('  FAIL  ' + what + (detail ? '\n          ' + detail : '')); }
}

/** Every inline <script> body, in page order. */
function inlineScripts(html) {
  const out = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html)) !== null) if (!/\bsrc\s*=/i.test(m[1])) out.push(m[2]);
  if (!out.length) throw new Error('no inline script in ' + PAGE);
  return out.join('\n;\n');
}

// ------------------------------------------------------------------ fake DOM

function fakeEl(id, extra) {
  const listeners = {};
  const attrs = {};
  return Object.assign({
    id, value: '', hidden: false, disabled: false, checked: false, textContent: '', placeholder: '', title: '',
    style: {}, className: '',
    classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    setAttribute(k, v) { attrs[k] = String(v); }, getAttribute(k) { return k in attrs ? attrs[k] : null; },
    hasAttribute(k) { return k in attrs; }, removeAttribute(k) { delete attrs[k]; },
    addEventListener(t, fn) { (listeners[t] = listeners[t] || []).push(fn); },
    fire(t) { (listeners[t] || []).forEach((fn) => fn({ target: this })); },
    closest() { return null; }, querySelector() { return null; }, querySelectorAll() { return []; },
    appendChild() {}, removeChild() {}, remove() {}, click() {}, select() {}, focus() {}
  }, extra || {});
}

function boot(scriptSrc) {
  const byId = {};
  const radios = {
    'topology-choice': ['1', '2', '3'].map((v) => fakeEl(null, { value: v, name: 'topology-choice' })),
    'source-choice': ['oracle', 'as400', 'sqlserver'].map((v) => fakeEl(null, { value: v, name: 'source-choice' }))
  };
  const docListeners = {};
  const downloads = [];
  let clipboard = null;
  const document = {
    title: 'prep',
    body: fakeEl('body'),
    getElementById(id) { return byId[id] || (byId[id] = fakeEl(id)); },
    querySelector() { return null; },
    querySelectorAll(sel) {
      const m = /input\[name="([^"]+)"\]/.exec(sel);
      return m && radios[m[1]] ? radios[m[1]] : [];
    },
    createElement(tag) {
      return fakeEl(null, { tagName: tag, click() { if (tag === 'a') downloads.push({ name: this.download, href: this.href }); } });
    },
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); },
    execCommand() { return true; }
  };
  const blobs = {};
  let n = 0;
  const window = {
    crypto: webcrypto,
    location: { href: '' },
    print() {},
    // The first script block waits for the window's DOMContentLoaded; both fire together here.
    addEventListener(t, fn) { (docListeners[t] = docListeners[t] || []).push(fn); }
  };
  const sandbox = {
    window, document, console, setTimeout: (fn) => 0, clearTimeout() {},
    navigator: { clipboard: { writeText(t) { clipboard = t; return Promise.resolve(); } } },
    URL: { createObjectURL(b) { const u = 'blob:' + (++n); blobs[u] = b; return u; }, revokeObjectURL() {} },
    Blob, TextEncoder, btoa, atob, Uint8Array, JSON, String, Error, Promise
  };
  window.document = document;
  vm.createContext(sandbox);
  vm.runInContext(scriptSrc, sandbox);
  (docListeners.DOMContentLoaded || []).forEach((fn) => fn());
  return {
    window, el: (id) => document.getElementById(id),
    pick(group, value) {
      radios[group].forEach((r) => { r.checked = r.value === value; });
      radios[group].find((r) => r.value === value).fire('change');
    },
    type(id, value) { const e = document.getElementById(id); e.value = value; e.fire('input'); },
    clipboard: () => clipboard,
    async lastDownloadText() {
      const d = downloads[downloads.length - 1];
      return d ? { name: d.name, text: await blobs[d.href].text() } : null;
    }
  };
}

/** Fill every required field, with an Oracle source unless told otherwise. */
function fill(p, source) {
  p.pick('topology-choice', '2');
  p.pick('source-choice', source || 'oracle');
  const v = {
    'jde-server': 'JDEORA01', 'jde-server-ip': '10.0.1.9', 'jde-user': 'rapidrec', 'jde-pass': 'Ora;pw 9',
    'jde-qualifier': 'PRODDTA', 'sub-company': 'Acme', 'sub-name': 'Pat Lee', 'sub-title': 'DBA',
    'sub-email': 'pat@acme.example', 'sub-date': '2026-11-24',
    'sql-port': '1433'   // what the markup starts it at (F8)
  };
  Object.keys(v).forEach((id) => p.type(id, v[id]));
}

async function pair() {
  const kp = await webcrypto.subtle.generateKey({ name: 'RSA-OAEP', modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256' }, true, ['encrypt', 'decrypt']);
  const spki = Buffer.from(await webcrypto.subtle.exportKey('spki', kp.publicKey)).toString('base64');
  return { kp, spki, kid: createHash('sha256').update(Buffer.from(spki, 'base64')).digest('hex').slice(0, 16) };
}
async function open(file, p) {
  const f = JSON.parse(file);
  const r = f.recipients.find((x) => x.kid === p.kid);
  const raw = await webcrypto.subtle.decrypt({ name: 'RSA-OAEP' }, p.kp.privateKey, Buffer.from(r.key, 'base64'));
  const aes = await webcrypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['decrypt']);
  return Buffer.from(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: Buffer.from(f.iv, 'base64') }, aes,
    Buffer.from(f.data, 'base64'))).toString('utf8');
}

const LINE = {
  jdePort: '  JDE database port:             1600',
  oracle:  '  Oracle service name:           JDEPRD',
  sqlPort: '  SQL Server port:               14330'
};

async function run(scriptSrc, label) {
  const r = {};
  // F1: an Oracle source with both ports and the service name.
  {
    const p = boot(scriptSrc);
    fill(p, 'oracle');
    p.type('jde-port', '1600');
    p.type('jde-oracle-service', 'JDEPRD');
    p.type('sql-port', '14330');
    await p.window.copyJdeText();
    const t = p.clipboard() || '';
    r.f1 = t.includes(LINE.jdePort) && t.includes(LINE.oracle) && t.includes(LINE.sqlPort);
    r.f1detail = t.split('\r\n').filter((l) => /port|service/i.test(l)).join(' | ');
    // F2 needs fresh pages: a SQL Server source's ports are numbers, filled in, with no Oracle line; AS400 has no port.
    const q = boot(scriptSrc);
    fill(q, 'sqlserver');
    await q.window.copyJdeText();
    const u = q.clipboard() || '';
    const s = boot(scriptSrc);
    fill(s, 'as400');
    const asHidden = s.el('jde-port-row').hidden === true;
    const asSend = s.el('send-email-btn').disabled === false;
    await s.window.copyJdeText();
    const w = s.clipboard() || '';
    r.f2 = u.includes('  JDE database port:             1433') && u.includes('  SQL Server port:               1433')
      && !/Oracle service name/.test(u) && asHidden && asSend && w.includes('  JDE database port:             not used (AS400)');
    r.f2detail = u.split('\r\n').filter((l) => /port|service/i.test(l)).join(' | ') + ' || AS400 hidden=' + asHidden
      + ' send=' + asSend + ' | ' + w.split('\r\n').filter((l) => /JDE database port/.test(l)).join('');
  }
  // F7: the JDE port follows the platform until the customer types one.
  {
    const p = boot(scriptSrc);
    fill(p, 'sqlserver');
    const a = p.el('jde-port').value;
    p.pick('source-choice', 'oracle');
    const b = p.el('jde-port').value;
    p.type('jde-port', '1600');
    p.pick('source-choice', 'sqlserver');
    const c = p.el('jde-port').value;
    r.f7 = a === '1433' && b === '1521' && c === '1600';
    r.f7detail = JSON.stringify({ sqlserver: a, oracle: b, typedThenSqlserver: c });
  }
  // F3 + F4: the row, and Send.
  {
    const p = boot(scriptSrc);
    fill(p, 'sqlserver');
    const row = p.el('jde-oracle-service-row');
    const sqlHidden = row.hidden === true;
    const sqlSend = p.el('send-email-btn').disabled === false;
    p.pick('source-choice', 'oracle');
    const oraShown = row.hidden === false;
    const oraBlocked = p.el('send-email-btn').disabled === true;
    p.type('jde-oracle-service', 'JDEPRD');
    const oraSend = p.el('send-email-btn').disabled === false;
    r.f3 = sqlHidden && sqlSend && oraShown && oraBlocked && oraSend;
    r.f3detail = JSON.stringify({ sqlHidden, sqlSend, oraShown, oraBlocked, oraSend, status: p.el('submit-status').textContent });
    p.type('sql-port', '');
    const blankBlocked = p.el('send-email-btn').disabled === true;
    p.type('sql-port', '99999');
    const badBlocked = p.el('send-email-btn').disabled === true;
    p.type('sql-port', '1500');
    const goodSend = p.el('send-email-btn').disabled === false;
    p.type('jde-port', 'abc');
    const badJde = p.el('send-email-btn').disabled === true;
    p.type('jde-port', '');
    const blankJde = p.el('send-email-btn').disabled === true;
    r.f4 = blankBlocked && badBlocked && goodSend && badJde && blankJde;
    r.f4detail = JSON.stringify({ blankBlocked, badBlocked, goodSend, badJde, blankJde });
  }
  // F5: sealed to a key made for this run.
  {
    const k = await pair();
    const sealedSrc = scriptSrc.replace('var PREP_RECIPIENTS = [];',
      'var PREP_RECIPIENTS = [' + JSON.stringify({ kid: k.kid, spki: k.spki }) + '];');
    r.sealSeam = sealedSrc !== scriptSrc;
    const p = boot(sealedSrc);
    fill(p, 'oracle');
    p.type('jde-port', '1600');
    p.type('jde-oracle-service', 'JDEPRD');
    p.type('sql-port', '14330');
    await p.window.copyJdeText();
    const dl = await p.lastDownloadText();
    const plain = dl ? await open(dl.text, k) : '';
    const mail = p.clipboard() || '';
    r.f5 = !!dl && plain.includes(LINE.jdePort) && plain.includes(LINE.oracle) && plain.includes(LINE.sqlPort)
      && plain.includes('Ora;pw 9') && mail.includes(LINE.sqlPort) && !mail.includes('Ora;pw 9')
      && mail.includes('(in the encrypted attachment)');
    r.f5detail = dl ? dl.name : 'no file downloaded';
    r.plain = plain;
  }
  return r;
}

(async () => {
  const src = inlineScripts(HTML);
  console.log('Shipped page:');
  const r = await run(src);
  check('F1 the SQL port, JDE port and Oracle service name are in the submission', r.f1, r.f1detail);
  check('F2 the ports are written as numbers, no Oracle line on SQL Server, and AS400 says the port is not used', r.f2, r.f2detail);
  check('F3 the Oracle service row follows the source, and Send waits for it on Oracle', r.f3, r.f3detail);
  check('F4 a blank SQL or JDE port, or one outside 1 to 65535, keeps Send off', r.f4, r.f4detail);
  check('F7 the JDE port fills from the platform and keeps a typed port', r.f7, r.f7detail);
  const sqlTag = (/<input[^>]*\bid="sql-port"[^>]*>/.exec(HTML) || [''])[0];
  check('F8 the SQL Server port starts at 1433', /\bvalue="1433"/.test(sqlTag), sqlTag);
  check('F5 seam: PREP_RECIPIENTS replaced in memory', r.sealSeam);
  check('F5 the sealed file opens to the ports and the password; the email text has the ports, not the password', r.f5, r.f5detail);
  // F6 is markup: the browser masks a type="password" input, and the fake DOM has no markup to ask.
  const tag = (/<input[^>]*\bid="jde-pass"[^>]*>/.exec(HTML) || [''])[0];
  check('F6 the JDE password input is type="password"', /\btype="password"/.test(tag), tag);
  if (process.argv[2] === '--dump-sealed') fs.writeFileSync(process.argv[3], r.plain, 'utf8');

  console.log('Arm: the JDE port line removed from buildBody');
  const armed = src.replace(/\s*'  JDE database port:\s+' \+ \(src === 'as400' \? 'not used \(AS400\)' : v\('jde-port'\)\),/, '');
  check('arm applied', armed !== src);
  const a = await run(armed);
  check('arm: F1 goes red without the line', !a.f1, a.f1detail);

  console.log('Arm: the JDE port autofill removed');
  const armed2 = src.replace('portField.value = JDE_PORT_DEFAULT[src];', '');
  check('arm 2 applied', armed2 !== src);
  const a2 = await run(armed2);
  check('arm 2: F7 goes red without the autofill', !a2.f7, a2.f7detail);

  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
