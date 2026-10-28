/* test-log-analyzer-gz.js -- UI-242: the Help Desk Log Analyzer opens a rotated Services log
 * as it sits on disk, and reads V8's timestamps.
 *
 *   node Tools/test-log-analyzer-gz.js [page.html]   (default: HelpDesk/log-analyzer.html)
 *
 * Measured 2026-10-28 on the dev box: each Services instance writes
 * C:\Program Files\Rapid Reconciler V8\logs\services-<port>.log, and Spring Boot rolls each
 * earlier day to services-<port>.log.<yyyy-MM-dd>.<i>.gz. The page took .log/.out/.txt only,
 * and a .gz dropped on the zone was read as text and analysed as binary junk. V8's lines also
 * open "2026-10-28T00:00:00.281Z DEBUG", where V7's open "2026-10-28 00:00:20.305 ERROR",
 * and the entry-start regex knew only V7's, so a whole V8 log stitched into one entry.
 *
 * Runs the SHIPPED page script (the inline <script> of HelpDesk/log-analyzer.html) with
 * Node's own File, Response and DecompressionStream, the same APIs a browser has. The gzip
 * files are made here with zlib.gzipSync, so they are real gzip, not fixtures.
 *
 *   G1  a rotated .gz from the file dialog: the text the page analyses is the log, byte for byte
 *   G2  and the analysis is identical to loading the same log as a plain .log
 *   G3  a .gz dropped on the zone loads the same way
 *   G4  gzip content under a .log name is opened too (checked by its first two bytes)
 *   T1  a plain V8 .log: each timestamped line is its own entry (6, not 1)
 *   T2  a V7 .out.log still parses as before (3 entries)
 *   R1  one condition logged on three threads and requests, with three durations and ages,
 *       is one problem; a different WARN beside it stays its own
 *   R2  V8's DEBUG lines are routine, never "Unrecognized" problems
 *   R3  but a certificate failure logged at DEBUG is still critical: Routine DEBUG is the
 *       LAST rule, VALC's own form, so the two rule tables stay equal (VLC-223)
 *   E1  a .gz that is not gzip: said on the card, nothing analysed, no earlier result left up
 *   E2  a gzip cut short: said on the card the same way
 *   E3  a browser without DecompressionStream: said on the card, with what to do
 *   E4  and a plain .log still loads in that browser
 *   A1  the file dialog offers .gz
 *
 * MUTATION CONTROLS (run 2026-10-28): main's page passes only T2 and G2's file-name line.
 * Reverting only the entry-start regex reddens G1's count, T1, R1, R2, E1's control and E4.
 * Keeping the bracket groups in the grouping key reddens R1 only; dropping Routine DEBUG
 * reddens R1's count and R2 only; placing it straight after Routine INFO reddens R3 only.
 * Real files, same day: the dev box's services-34537.log.2026-10-27.0.gz (55 KB) reads as
 * 2,966 entries and one problem (main: one entry of binary junk); a 4.8 MB V7 out.log
 * snapshot renders identically on main and on this page.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
// An optional page argument runs the checks on another copy (a merge of two branches, main's).
const PAGE_PATH = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'HelpDesk', 'log-analyzer.html');
const PAGE = fs.readFileSync(PAGE_PATH, 'utf8').replace(/\r\n/g, '\n');
const m = /\n<script>\n([\s\S]*?)\n<\/script>\n/.exec(PAGE);
if (!m || m[1].indexOf('function handleAgentFile') < 0) { console.log('HARNESS BROKEN: the page script was not found'); process.exit(1); }
const SCRIPT = m[1];

let failures = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failures++;
  console.log('  ' + (ok ? 'ok  ' : 'FAIL') + '  ' + name + (ok ? '' : '   got ' + JSON.stringify(got) + ' want ' + JSON.stringify(want)));
}

// A Services log in V8's shape (the dev box's services-34537.log, 2026-10-28), with made-up
// content: six entries, one of them carrying a stack trace on continuation lines.
const V8_LOG = [
  '2026-10-27T00:00:00.281Z DEBUG 19620 --- [client-services-agent] [scheduling-1] c.r.c.s.services.WorkingDirJanitor       : Janitor: nothing to sweep',
  '2026-10-27T00:00:25.773Z  INFO 19620 --- [client-services-agent] [https-jsse-nio-0.0.0.0-34537-exec-10] [a24e8c0d11aa] c.r.c.s.c.HealthController               : health ok',
  '2026-10-27T10:00:00.305Z  WARN 19620 --- [client-services-agent] [scheduling-1] c.r.c.s.services.WorkingDirJanitor       : Janitor logs: out-log delete failed for rr-valc-agent.2.out.log',
  '2026-10-27T11:39:31.623Z ERROR 19620 --- [client-services-agent] [https-jsse-nio-0.0.0.0-34537-exec-2] [b988f2c40e1b] c.r.c.s.c.ExampleController             : lookup failed',
  'java.lang.IllegalStateException: example failure',
  '\tat coral.rapidreconciler.client.services.ExampleService.run(ExampleService.java:42)',
  '2026-10-27T11:40:24.082Z  INFO 19620 --- [client-services-agent] [scheduling-1] c.r.c.s.services.ExampleScheduler        : sweep done',
  '2026-10-27T23:59:59.999Z DEBUG 19620 --- [client-services-agent] [scheduling-1] c.r.c.s.services.WorkingDirJanitor       : Janitor: nothing to sweep',
  ''
].join('\n');
// V7's shape (rr-valc-agent_20261028.out.log on the dev box): space, no Z.
const V7_LOG = [
  '2026-10-28 00:00:20.305 ERROR 5960 --- [   scheduling-1] c.r.agent.service.impl.IpServiceImpl     : Error reading the address',
  '',
  'java.io.FileNotFoundException: https://valc.example.test/check-ip',
  '2026-10-28 00:01:00.001  INFO 5960 --- [   scheduling-1] c.r.agent.service.impl.HeartbeatImpl     : Sending heartbeat',
  '2026-10-28 00:02:00.001  WARN 5960 --- [   scheduling-1] c.r.agent.service.impl.ExampleImpl       : slow reply',
  ''
].join('\n');
// One condition logged three times, in the shape of the dev box's 10-27 rotated log: another
// thread, request id, duration and age each time, and the third through the broker's
// interleaved log, whose 15-character thread column cuts the name differently. Made-up WARN
// text from a made-up logger: the measured line, TroubleshootingController's "troubleshooting
// verdict", is noise by owner ruling (VLC-180, carried to the Help Desk by VLC-223), so it
// cannot carry a grouping test.
const V8_SAME = [
  '2026-10-27T12:49:23.393Z  WARN 19620 --- [client-services-agent] [https-jsse-nio-0.0.0.0-34537-exec-9] [797601f46cb5] c.r.c.s.services.ExampleSyncService      : example sync is behind after 18 ms: the last sync finished 44 hours ago.',
  '2026-10-27T12:51:11.863Z  WARN 19620 --- [client-services-agent] [https-jsse-nio-0.0.0.0-34537-exec-5] [0ee8d2607356] c.r.c.s.services.ExampleSyncService      : example sync is behind after 86 ms: the last sync finished 2 days ago.',
  '2026-10-27T12:52:08.327Z  WARN 7596 --- [client-services-agent] [.0-45585-exec-4] [50911c8a95ad] c.r.c.s.services.ExampleSyncService      : example sync is behind after 15 ms: the last sync finished 45 hours ago.',
  '2026-10-27T13:00:00.001Z  WARN 19620 --- [client-services-agent] [scheduling-1] c.r.c.s.services.WorkingDirJanitor       : Janitor logs: out-log delete failed for rr-valc-agent.2.out.log',
  '2026-10-27T13:00:00.002Z DEBUG 19620 --- [client-services-agent] [scheduling-1] c.r.c.s.services.WorkingDirJanitor       : Janitor sweep complete: nothing to delete',
  '2026-10-27T14:00:00.002Z DEBUG 19620 --- [client-services-agent] [scheduling-1] c.r.c.s.services.WorkingDirJanitor       : Janitor sweep complete: nothing to delete',
  ''
].join('\n');
const GZ = zlib.gzipSync(Buffer.from(V8_LOG, 'utf8'));
const GZ_NAME = 'services-34537.log.2026-10-27.0.gz';

// Main's page reads with FileReader.readAsText, which a browser decodes as UTF-8; Blob.text() is that.
class FileReaderStub {
  readAsText(blob) {
    blob.text().then((t) => this.onload && this.onload({ target: { result: t } }),
                     (e) => this.onerror && this.onerror(e));
  }
}

async function load(files, opt) {
  opt = opt || {};
  const els = {};
  // textContent and innerHTML are one node's content, as in a browser: setting either replaces both.
  const el = (id) => els[id] || (els[id] = {
    id, innerHTML: '', value: '', files: null, listeners: {},
    get textContent() { return this.innerHTML.replace(/<[^>]+>/g, ''); },
    set textContent(v) { this.innerHTML = String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;'); },
    classList: { _s: new Set(), add(...c) { c.forEach((x) => this._s.add(x)); }, remove(...c) { c.forEach((x) => this._s.delete(x)); }, contains(c) { return this._s.has(c); } },
    addEventListener(ev, fn) { (this.listeners[ev] = this.listeners[ev] || []).push(fn); },
    click() {}, focus() {}
  });
  const sb = {
    console, setTimeout, clearTimeout, Promise, Uint8Array, TextDecoder,
    requestAnimationFrame: (cb) => setTimeout(cb, 0),
    FileReader: FileReaderStub,
    Response,
    document: { getElementById: el, querySelectorAll: () => [], addEventListener() {} }
  };
  if (!opt.noDecompression) sb.DecompressionStream = DecompressionStream;
  sb.window = sb;
  vm.createContext(sb);
  vm.runInContext(SCRIPT, sb);
  const input = els['input-agent-file'], zone = els['agentDropZone'], meta = els['agentFileMeta'];
  const settle = async () => {
    for (let i = 0; i < 400; i++) {
      await new Promise((r) => setTimeout(r, 2));
      if (!/reading|analyzing|opening/.test(meta.innerHTML)) break;
    }
  };
  const results = [];
  for (const f of files) {
    if (opt.drop) zone.listeners.drop.forEach((fn) => fn({ preventDefault() {}, dataTransfer: { files: [f] } }));
    else { input.files = [f]; input.listeners.change.forEach((fn) => fn()); }
    await settle();
    results.push({
      text: vm.runInContext('agentFileText', sb),
      meta: meta.innerHTML,
      context: els.outputContext.innerHTML,
      shown: els.verdict.classList.contains('active'),
      out: [els.verdictTitle.innerHTML, els.findingsBody.innerHTML, els.signalsBody.innerHTML, els.noiseBody.innerHTML].join('\n')
    });
  }
  return results;
}
const entries = (r) => { const x = /&middot; ([\d,]+) log entr/.exec(r.context); return x ? Number(x[1].replace(/,/g, '')) : null; };
const metaText = (r) => r.meta.replace(/<[^>]+>/g, '').replace(/&middot;/g, '·').replace(/&hellip;/g, '…').replace(/\s+/g, ' ').trim();

(async () => {
  const [gz] = await load([new File([GZ], GZ_NAME)]);
  check('G1 a rotated .gz from the file dialog: the analysed text is the log, byte for byte', gz.text === V8_LOG, true);
  check('G1 and it was analysed as six entries', entries(gz), 6);
  const [plain] = await load([new File([V8_LOG], 'services-34537.log')]);
  check('G2 and the analysis is identical to the same log loaded as a plain .log', gz.out === plain.out && gz.context === plain.context && plain.out.length > 0, true);
  check('G2 and the card names the .gz the operator loaded', metaText(gz).indexOf(GZ_NAME) === 0, true);
  const [dropped] = await load([new File([GZ], GZ_NAME)], { drop: true });
  check('G3 a .gz dropped on the zone loads the same way', dropped.text === V8_LOG && dropped.out === plain.out, true);
  const [renamed] = await load([new File([GZ], 'services-34537.log')]);
  check('G4 gzip content under a .log name is opened too', renamed.text === V8_LOG, true);

  check('T1 a plain V8 .log: each timestamped line is its own entry (6, not 1)', entries(plain), 6);
  const [v7] = await load([new File([V7_LOG], 'rr-valc-agent_20261028.out.log')]);
  check('T2 a V7 .out.log still parses as before (3 entries)', entries(v7), 3);

  const [same] = await load([new File([zlib.gzipSync(Buffer.from(V8_SAME))], GZ_NAME)]);
  check('R1 one condition on three threads, requests, durations and ages is one problem (plus the janitor WARN: 2)',
        same.out.split('\n')[0], '2 distinct problems worth a look');
  check('R1 and that problem counts all three', /Unhandled WARN: example sync is behind after &lt;n&gt; ms: the last sync finished &lt;age&gt; ago\.[\s\S]*?Show 2 more occurrence/.test(same.out), true);
  check('R2 V8 DEBUG lines are routine, never a problem', /Routine DEBUG/.test(same.out) && !/Unrecognized/.test(same.out), true);
  const pkix = '2026-10-27T15:00:00.001Z DEBUG 19620 --- [client-services-agent] [main] c.r.c.s.services.ExampleClient           : PKIX path building failed\n';
  const [cert] = await load([new File([pkix], 'services-34537.log')]);
  check('R3 but a certificate failure logged at DEBUG is still critical (VLC-180\'s case)', /needing action now/.test(cert.out.split('\n')[0]), true);

  // E1 runs after a good load, so a result left up from the earlier file would show.
  const [first, notGz] = await load([new File([V8_LOG], 'services-34537.log'), new File([V8_LOG], GZ_NAME)]);
  check('E1 a .gz that is not gzip: the card says so', /is not a valid \.gz file/.test(metaText(notGz)), true);
  check('E1 and nothing is analysed, and the earlier result is cleared', [notGz.text, notGz.context, notGz.shown], ['', '', false]);
  check('E1 CONTROL: the good load before it did show a result', [entries(first), first.shown], [6, true]);
  const [cut] = await load([new File([GZ.subarray(0, GZ.length - 20)], GZ_NAME)]);
  check('E2 a gzip cut short: the card says it is not a valid .gz', /is not a valid \.gz file/.test(metaText(cut)), true);
  check('E2 and nothing is analysed', [cut.text, cut.context], ['', '']);
  const [old, oldPlain] = await load([new File([GZ], GZ_NAME), new File([V8_LOG], 'services-34537.log')], { noDecompression: true });
  check('E3 a browser without DecompressionStream: the card says it cannot open .gz, and what to do',
        /This browser cannot open \.gz files\. Open this page in a current Edge, Chrome or Firefox/.test(metaText(old)), true);
  check('E3 and nothing is analysed', [old.text, old.context], ['', '']);
  check('E4 and a plain .log still loads in that browser', entries(oldPlain), 6);

  // The picker's filter is markup the browser reads; there is no behaviour to call short of a browser.
  const accept = (/<input type="file" id="input-agent-file" accept="([^"]*)"/.exec(PAGE) || [])[1] || '';
  check('A1 the file dialog offers .gz', accept.split(',').indexOf('.gz') >= 0, true);

  console.log(failures ? failures + ' FAILED' : 'all passed');
  process.exit(failures ? 1 : 0);
})().catch((e) => { console.log('HARNESS ERROR', e && e.stack || e); process.exit(1); });
