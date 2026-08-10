#!/usr/bin/env python3
"""Syntax-check a .js file, or every inline <script> in a .html file.

    python Tools/parsecheck.py C:/absolute/path/to/file.html [more files...]

Exits 1 on the first syntax error, naming the FILE line the offending inline
script starts at plus the parser's own line offset inside it. Read-only.

Why this exists: the browser is the only place these pages really run, and a
typo in an inline <script> is silent there -- the block just stops executing,
the page renders, and the feature quietly does nothing. This catches that
without a browser and without Node (neither is installed on this box).

esprima 4 predates two things this codebase legitimately uses, so both are
neutralised for the parse rather than reported as errors:
  * ES2021 numeric separators (6_000_000)
  * the U+0001 (SOH) key separator that home.html / config.js /
    accounting-model-review.html carry inside string literals on purpose
Neither substitution can mask a real syntax error: the first only removes
underscores between digits, the second only replaces one control character
that is never syntax.

Requires the `esprima` package (already installed on this machine).
"""
import io
import os
import re
import sys

try:
    import esprima
except ImportError:
    sys.exit("parsecheck: the esprima package is not installed (pip install esprima)")

_NUM_SEP = re.compile(r"(?<=\d)_(?=\d)")
_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>", re.S | re.I)


def _normalise(src):
    return _NUM_SEP.sub("", src).replace("\x01", "@")


def _parse(src, label):
    try:
        esprima.parseScript(_normalise(src))
    except Exception as exc:                      # esprima raises its own Error type
        print("FAIL %s -> %s" % (label, exc))
        return False
    return True


def check_js(path):
    src = io.open(path, encoding="utf-8").read()
    if not _parse(src, path):
        return False
    print("OK   %s" % path)
    return True


def check_html(path):
    src = io.open(path, encoding="utf-8").read()
    n = 0
    for m in _SCRIPT.finditer(src):
        attrs, body = m.group(1).lower(), m.group(2)
        # A data island is not JavaScript. `type="module"` and a bare/JS type are.
        if "type=" in attrs and not re.search(r'type=["\']?(text/javascript|module|application/javascript)', attrs):
            continue
        line0 = src[: m.start(2)].count("\n") + 1
        if not _parse(body, "%s inline <script> starting at line %d" % (path, line0)):
            return False
        n += 1
    print("OK   %s (%d inline script%s)" % (path, n, "" if n == 1 else "s"))
    return True


def main(argv):
    if not argv:
        sys.exit(__doc__)
    ok = True
    for path in argv:
        if not os.path.isabs(path):
            print("NOTE %s is relative; absolute paths are the contract here" % path)
        if not os.path.exists(path):
            print("FAIL %s does not exist" % path)
            ok = False
            continue
        ext = os.path.splitext(path)[1].lower()
        if ext == ".js":
            ok = check_js(path) and ok
        elif ext in (".html", ".htm"):
            ok = check_html(path) and ok
        else:
            print("SKIP %s (not .js or .html)" % path)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
