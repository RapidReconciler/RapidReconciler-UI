/* parsecheck-v8.js -- the V8 back end for Tools/parsecheck.py.
 *
 * WHY V8 AND NOT A PYTHON PARSER. The gate exists to catch a syntax error the
 * BROWSER would hit, and V8 is the browser's parser. Every Python JS parser
 * available here is an approximation of it: esprima 4 (the version installed)
 * stops at ES2017, so it reports `value?.trim()` as "Unexpected token ." and
 * returns FAIL on every run against any file using optional chaining -- which
 * is zero coverage of exactly the files that most need it (UI-111).
 *
 * There is no Node on this box. Azure Data Studio ships Electron, and Electron
 * run with ELECTRON_RUN_AS_NODE=1 is a Node process, so this file runs there.
 * parsecheck.py finds the host and falls back to esprima when it cannot.
 *
 * `new vm.Script(src)` COMPILES without EXECUTING, which is exactly what a
 * syntax gate needs -- no side effects, no DOM, no network.
 *
 * CONTRACT. argv[2] is the path to a UTF-8 JSON job file:
 *     [ { "label": "<human label>", "filename": "<shown in errors>",
 *         "lineOffset": <0-based lines to add to reported line numbers>,
 *         "src": "<the script text>" }, ... ]
 * Emits one JSON object on stdout:
 *     { "engine": "v8 <ver>", "results": [ { "ok": true } |
 *                                          { "ok": false, "message": "...",
 *                                            "line": <n|null> }, ... ] }
 * Exit code is 0 whenever the job itself ran; per-unit verdicts live in the
 * JSON. A non-zero exit means the harness failed, not that the code is bad --
 * parsecheck.py treats those differently on purpose.
 */
'use strict';

const fs = require('fs');
const vm = require('vm');

function main() {
    const jobPath = process.argv[2];
    if (!jobPath) {
        process.stderr.write('parsecheck-v8: no job file argument\n');
        process.exit(2);
    }

    let units;
    try {
        units = JSON.parse(fs.readFileSync(jobPath, 'utf8'));
    } catch (e) {
        process.stderr.write('parsecheck-v8: cannot read job file: ' + e.message + '\n');
        process.exit(2);
    }

    const results = units.map(function (u) {
        try {
            // lineOffset makes V8 report the line in the ORIGINAL file rather
            // than inside the extracted fragment.
            new vm.Script(u.src, {
                filename: u.filename || u.label || 'inline',
                lineOffset: u.lineOffset || 0
            });
            return { ok: true };
        } catch (e) {
            // V8 puts the location in the first stack line
            // (`<filename>:<line>`), and the bare message carries no line at
            // all, so the stack is the only place the number exists.
            let line = null;
            if (e.stack) {
                const m = /^[^\r\n]*?:(\d+)(?:$|\D)/m.exec(String(e.stack));
                if (m) { line = parseInt(m[1], 10); }
            }
            return {
                ok: false,
                message: (e && e.name ? e.name + ': ' : '') + (e && e.message ? e.message : String(e)),
                line: line
            };
        }
    });

    process.stdout.write(JSON.stringify({
        engine: 'v8 ' + (process.versions && process.versions.v8 ? process.versions.v8 : 'unknown'),
        results: results
    }));
}

main();
