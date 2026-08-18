#!/usr/bin/env python3
"""Syntax-check a .js file, or every inline <script> in a .html file.

    python Tools/parsecheck.py C:/absolute/path/to/file.html [more files...]

Exits 1 on the first syntax error, naming the FILE line the offending inline
script starts at plus the parser's own line inside it. Read-only.

Why this exists: the browser is the only place these pages really run, and a
typo in an inline <script> is silent there -- the block just stops executing,
the page renders, and the feature quietly does nothing. This catches that
without a browser.

TWO ENGINES, AND THE OUTPUT ALWAYS SAYS WHICH ONE RAN
-----------------------------------------------------
1. V8, via `Tools/parsecheck-v8.js`. Preferred, because V8 IS the browser's
   parser -- anything it accepts the browser accepts, and it needs none of the
   workarounds below. There is no Node on this box, but Azure Data Studio ships
   Electron and `ELECTRON_RUN_AS_NODE=1 azuredatastudio.exe` is a Node process.
   Point PARSECHECK_V8 at any Node-compatible binary to override discovery.

2. esprima 4, the Python package, as the fallback when no V8 host is found.
   It stops at ES2017, so it CANNOT parse optional chaining (`a?.b`), nullish
   coalescing, or private class fields -- all of which this codebase uses. On
   the fallback path those report as syntax errors that are not real (UI-111:
   esprima returns `FAIL ... Unexpected token .` on every run against
   RapidReconciler-Valc/.../dashboard.html because of one `value?.trim()`).

   A gate that quietly degrades to the blind engine is worse than no gate, so
   the fallback is announced on stderr every time and its findings are labelled
   `FAIL?` rather than `FAIL`. Treat a fallback-only failure as "go look",
   not as "the file is broken".

esprima also predates two things the codebase uses legitimately, so both are
neutralised on the FALLBACK path only (V8 needs neither):
  * ES2021 numeric separators (6_000_000)
  * the U+0001 (SOH) key separator that home.html / config.js /
    accounting-model-review.html carry inside string literals on purpose
Neither substitution can mask a real syntax error: the first only removes
underscores between digits, the second only replaces one control character
that is never syntax.
"""
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile

_NUM_SEP = re.compile(r"(?<=\d)_(?=\d)")
_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>", re.S | re.I)
_MODULE = re.compile(r'type=["\']?module')

_V8_DRIVER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "parsecheck-v8.js")

# Electron hosts that double as a Node runtime under ELECTRON_RUN_AS_NODE=1.
_V8_CANDIDATES = (
    r"C:\Program Files\Azure Data Studio\azuredatastudio.exe",
    r"C:\Program Files\Microsoft VS Code\Code.exe",
    r"C:\Program Files\nodejs\node.exe",
)


def _find_v8_host():
    """Resolve a Node-compatible binary, or None.

    PARSECHECK_V8 accepts either a full path or a bare command name -- CI sets
    it to `node`, which is on PATH but is not a path, and rejecting it there
    would drop the whole gate onto the blind esprima engine without failing.
    """
    override = os.environ.get("PARSECHECK_V8")
    if override:
        if os.path.exists(override):
            return override
        found = shutil.which(override)
        if found:
            return found
        sys.stderr.write("parsecheck: PARSECHECK_V8=%r is neither a file nor on PATH\n" % override)
        return None
    for path in _V8_CANDIDATES:
        if os.path.exists(path):
            return path
    return shutil.which("node")


def _run_v8(host, units):
    """Compile every unit with V8. Returns (engine, results) or None if the
    harness itself could not run -- never a verdict on the code."""
    fd, job = tempfile.mkstemp(suffix=".json", prefix="parsecheck-")
    os.close(fd)
    try:
        with io.open(job, "w", encoding="utf-8") as fh:
            fh.write(json.dumps(units))
        env = dict(os.environ)
        env["ELECTRON_RUN_AS_NODE"] = "1"
        proc = subprocess.run([host, _V8_DRIVER, job],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
        if proc.returncode != 0:
            sys.stderr.write("parsecheck: V8 host failed (exit %d): %s\n"
                             % (proc.returncode, proc.stderr.decode("utf-8", "replace").strip()))
            return None
        payload = json.loads(proc.stdout.decode("utf-8", "replace"))
        return payload["engine"], payload["results"]
    except Exception as exc:                      # host missing, bad JSON, etc.
        sys.stderr.write("parsecheck: V8 host unusable (%s)\n" % exc)
        return None
    finally:
        try:
            os.unlink(job)
        except OSError:
            pass


def _run_esprima(units):
    try:
        import esprima
    except ImportError:
        return None
    results = []
    for u in units:
        src = _NUM_SEP.sub("", u["src"]).replace("\x01", "@")
        try:
            if u.get("module"):
                esprima.parseModule(src)
            else:
                esprima.parseScript(src)
            results.append({"ok": True})
        except Exception as exc:                  # esprima raises its own Error type
            line = getattr(exc, "lineNumber", None)
            # esprima's str() already starts "Line N: ...", where N is relative
            # to the fragment. We report the absolute file line ourselves, so
            # strip its copy rather than printing two different numbers.
            message = re.sub(r"^Line\s+\d+:\s*", "", str(exc))
            results.append({
                "ok": False,
                "message": message,
                "line": (line + u.get("lineOffset", 0)) if isinstance(line, int) else None,
            })
    return "esprima 4 (ES2017 -- CANNOT parse ?. or ??)", results


def collect(path):
    """Return the list of check units for one file, or None if unsupported."""
    ext = os.path.splitext(path)[1].lower()
    src = io.open(path, encoding="utf-8").read()
    if ext == ".js":
        return [{"label": path, "filename": path, "lineOffset": 0, "src": src}]
    if ext not in (".html", ".htm"):
        return None
    units = []
    for m in _SCRIPT.finditer(src):
        attrs, body = m.group(1).lower(), m.group(2)
        # A data island is not JavaScript. `type="module"` and a bare/JS type are.
        if "type=" in attrs and not re.search(
                r'type=["\']?(text/javascript|module|application/javascript)', attrs):
            continue
        line0 = src[: m.start(2)].count("\n") + 1
        units.append({
            "label": "%s inline <script> starting at line %d" % (path, line0),
            "filename": path,
            "lineOffset": line0 - 1,
            "module": bool(_MODULE.search(attrs)),
            "src": body,
        })
    return units


def main(argv):
    if not argv:
        sys.exit(__doc__)

    paths, ok = [], True
    for path in argv:
        if not os.path.isabs(path):
            print("NOTE %s is relative; absolute paths are the contract here" % path)
        if not os.path.exists(path):
            print("FAIL %s does not exist" % path)
            ok = False
            continue
        if os.path.splitext(path)[1].lower() not in (".js", ".html", ".htm"):
            print("SKIP %s (not .js or .html)" % path)
            continue
        paths.append(path)

    if not paths:
        return 0 if ok else 1

    # One flat unit list across every file, so the V8 host is spawned once.
    units, spans = [], []
    for path in paths:
        found = collect(path)
        spans.append((path, len(units), len(found)))
        units.extend(found)

    outcome = None
    host = _find_v8_host()
    if host:
        outcome = _run_v8(host, units)
    if outcome is None:
        sys.stderr.write(
            "parsecheck: NO V8 HOST -- falling back to esprima 4, which cannot parse\n"
            "            optional chaining, nullish coalescing or private fields. Failures\n"
            "            below are marked FAIL? and may not be real. Set PARSECHECK_V8 to a\n"
            "            Node-compatible binary for a trustworthy result.\n")
        outcome = _run_esprima(units)
    if outcome is None:
        sys.exit("parsecheck: no usable engine (no V8 host and the esprima package is absent)")

    engine, results = outcome
    trusted = engine.startswith("v8")
    verdict = "FAIL" if trusted else "FAIL?"
    print("engine: %s" % engine)

    for path, start, count in spans:
        chunk = results[start:start + count]
        bad = [(units[start + i], r) for i, r in enumerate(chunk) if not r["ok"]]
        if bad:
            unit, res = bad[0]
            where = (" Line %d:" % res["line"]) if res.get("line") else ""
            print("%s %s ->%s %s" % (verdict, unit["label"], where, res["message"]))
            ok = False
            continue
        if os.path.splitext(path)[1].lower() == ".js":
            print("OK   %s" % path)
        else:
            print("OK   %s (%d inline script%s)" % (path, count, "" if count == 1 else "s"))

    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
