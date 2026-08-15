#!/usr/bin/env python3
"""Gate: every txv card claim must cite an assertion the classifier actually makes.

RRV8/config.js describes each transaction-variance card, including a `finding`
block whose `checked` array is the analyst's "what I checked" list. Those lines
are read as investigation evidence months later in the Audit Center, so a line
claiming something the SQL never tested is worse than no line at all.

The contract: each `checked` entry is `{ a: '<assertion id>', t: '<analyst text>' }`,
where the id exists in RRV8/txv-assertions.json -- generated from the `@asserts`
lines in the classifier procs over in RapidReconciler-DB. A bare string in
`checked` is an unlabelled prose claim and fails. Things that are true but not
tested per row go in `context`, which is a plain string array and is not gated.

    python Tools/check_txv_cards.py
    python Tools/check_txv_cards.py --self-test

config.js is a browser script -- not JSON, not importable -- so it is read by a
small brace-matching extractor that respects quotes, escapes, and comments. The
extractor reports how many cards and `checked` entries it found: a parser that
quietly matches nothing is the exact failure this gate exists to prevent, so it
must be visible rather than green.

Exit codes: 0 clean (warnings may print), 1 any violation.
"""

import argparse
import io
import json
import os
import re
import sys

DEFAULT_CONFIG = os.path.join("RRV8", "config.js")
DEFAULT_MANIFEST = os.path.join("RRV8", "txv-assertions.json")
FIXTURE_DIR = os.path.join("Tools", "_test_txv_gate")

META_RE = re.compile(r"\bvar\s+META\s*=\s*\{")
IDENT_RE = re.compile(r"[A-Za-z_$][A-Za-z0-9_$]*")

SIMPLE_ESCAPES = {
    "n": "\n",
    "t": "\t",
    "r": "\r",
    "b": "\b",
    "f": "\f",
    "v": "\v",
    "0": "\0",
}


class ParseError(Exception):
    """config.js did not have the shape the extractor requires."""


# --------------------------------------------------------------------------
# A small, deliberate reader for the JS object-literal subset config.js uses.
# Strings, arrays, nested objects, and `//` + `/* */` comments. No execution.
# --------------------------------------------------------------------------


def skip_trivia(s, i):
    """Advance past whitespace and comments."""
    n = len(s)
    while i < n:
        c = s[i]
        if c in " \t\r\n":
            i += 1
        elif s.startswith("//", i):
            nl = s.find("\n", i)
            i = n if nl < 0 else nl + 1
        elif s.startswith("/*", i):
            end = s.find("*/", i + 2)
            if end < 0:
                raise ParseError("unterminated /* */ comment at offset %d" % i)
            i = end + 2
        else:
            break
    return i


def read_string(s, i):
    """Read a quoted string starting at s[i]; return (value, next_index)."""
    quote = s[i]
    i += 1
    out = []
    n = len(s)
    while i < n:
        c = s[i]
        if c == "\\":
            if i + 1 >= n:
                raise ParseError("string ends on a backslash at offset %d" % i)
            esc = s[i + 1]
            if esc in SIMPLE_ESCAPES:
                out.append(SIMPLE_ESCAPES[esc])
                i += 2
            elif esc == "u":
                if i + 2 < n and s[i + 2] == "{":
                    close = s.find("}", i + 3)
                    if close < 0:
                        raise ParseError("unterminated \\u{...} at offset %d" % i)
                    out.append(chr(int(s[i + 3 : close], 16)))
                    i = close + 1
                else:
                    out.append(chr(int(s[i + 2 : i + 6], 16)))
                    i += 6
            elif esc == "x":
                out.append(chr(int(s[i + 2 : i + 4], 16)))
                i += 4
            elif esc == "\n":
                i += 2  # line continuation
            else:
                out.append(esc)  # \' \" \\ \/ and friends
                i += 2
        elif c == quote:
            return "".join(out), i + 1
        elif c == "\n" and quote != "`":
            raise ParseError("newline inside a %s-quoted string at offset %d" % (quote, i))
        else:
            out.append(c)
            i += 1
    raise ParseError("unterminated string starting at offset %d" % i)


def read_raw(s, i):
    """Read a scalar (number, bool, null, identifier) up to its delimiter."""
    n = len(s)
    start = i
    while i < n and s[i] not in ",}]":
        if s[i] in "\"'`":
            _, i = read_string(s, i)
            continue
        if s.startswith("//", i) or s.startswith("/*", i):
            break
        i += 1
    return ("raw", s[start:i].strip()), i


def read_value(s, i):
    i = skip_trivia(s, i)
    if i >= len(s):
        raise ParseError("value expected at end of input")
    c = s[i]
    if c == "{":
        return read_object(s, i)
    if c == "[":
        return read_array(s, i)
    if c in "\"'`":
        value, i = read_string(s, i)
        return ("str", value), i
    return read_raw(s, i)


def read_key(s, i):
    c = s[i]
    if c in "\"'`":
        return read_string(s, i)
    m = IDENT_RE.match(s, i)
    if not m:
        raise ParseError("object key expected at offset %d (saw %r)" % (i, s[i : i + 20]))
    return m.group(0), m.end()


def read_object(s, i):
    """Read `{ key: value, ... }`; return (('obj', dict), next_index)."""
    if s[i] != "{":
        raise ParseError("object expected at offset %d" % i)
    i += 1
    out = {}
    while True:
        i = skip_trivia(s, i)
        if i >= len(s):
            raise ParseError("unterminated object")
        if s[i] == "}":
            return ("obj", out), i + 1
        if s[i] == ",":
            i += 1
            continue
        key, i = read_key(s, i)
        i = skip_trivia(s, i)
        if i >= len(s) or s[i] != ":":
            raise ParseError("expected ':' after key %r at offset %d" % (key, i))
        node, i = read_value(s, i + 1)
        out[key] = node


def read_array(s, i):
    """Read `[ value, ... ]`; return (('arr', list), next_index)."""
    if s[i] != "[":
        raise ParseError("array expected at offset %d" % i)
    i += 1
    out = []
    while True:
        i = skip_trivia(s, i)
        if i >= len(s):
            raise ParseError("unterminated array")
        if s[i] == "]":
            return ("arr", out), i + 1
        if s[i] == ",":
            i += 1
            continue
        node, i = read_value(s, i)
        out.append(node)


def extract_meta(text):
    """Locate `var META = {` and parse the balanced region into a dict of nodes."""
    hits = [m for m in META_RE.finditer(text)]
    if not hits:
        raise ParseError(
            "no `var META = {` assignment found -- the card catalog moved or was "
            "renamed. Update Tools/check_txv_cards.py to match."
        )
    if len(hits) > 1:
        lines = ", ".join(str(text.count("\n", 0, m.start()) + 1) for m in hits)
        raise ParseError(
            "found %d `var META = {` assignments (lines %s). The extractor needs "
            "exactly one; disambiguate the catalog or update this script."
            % (len(hits), lines)
        )
    brace = text.index("{", hits[0].start())
    (_, meta), _ = read_object(text, brace)
    return meta


# Both of these hold `{ a, t }` citations and both are id-validated. `checked` is
# the detection; `alsoChecked` is every other check the classifier ran for this
# card. They were one array until 2026-08-15, which is why a detected card's
# "What happened" opened with the screens and guards and buried the detection.
# Splitting the array without teaching the gate about the second half would have
# silently un-gated the moved bullets -- the ids would stop being validated and
# would resurface as "referenced by no card", which is the same evidence loss as
# deleting them.
CITED_FIELDS = ("checked", "alsoChecked")


def collect_cards(meta):
    """[(code, field, [entry_node, ...])] for every cited array, catalog order."""
    cards = []
    for code, node in meta.items():
        if node[0] != "obj":
            cards.append((code, "checked", None))
            continue
        finding = node[1].get("finding")
        if not finding or finding[0] != "obj":
            cards.append((code, "checked", []))
            continue
        for field in CITED_FIELDS:
            arr = finding[1].get(field)
            if not arr:
                # `checked` absent is reported as empty so the card still appears in
                # the walk; `alsoChecked` is optional and simply contributes nothing.
                if field == "checked":
                    cards.append((code, field, []))
            elif arr[0] != "arr":
                cards.append((code, field, None))
            else:
                cards.append((code, field, arr[1]))
    return cards


# --------------------------------------------------------------------------
# The gate
# --------------------------------------------------------------------------


def run_check(config_path, manifest_path, standard_path=None):
    """Return (errors, warnings, stats). Empty errors == the gate passes.

    `standard_path` exists for the self-test. It used to read the PRODUCTION
    standard against a 3-card fixture catalog, so every real card code in the
    format baseline looked stale the moment the baseline-existence check was
    added -- and every future edit to the production baseline would have broken
    the self-test for reasons that have nothing to do with the fixtures.
    """
    errors, warnings = [], []
    stats = {"cards": 0, "checked": 0, "manifest": 0}

    manifest_ids = set()
    if not os.path.isfile(manifest_path):
        errors.append(
            "manifest not found at %s -- regenerate it from the DB repo with "
            "`python Tools/gen_txv_assertions.py --write <path>`." % manifest_path
        )
    else:
        try:
            with open(manifest_path, "r", encoding="utf-8") as fh:
                doc = json.load(fh)
            assertions = doc["assertions"]
            if not isinstance(assertions, dict):
                raise ValueError("`assertions` is not an object")
            manifest_ids = set(assertions)
        except Exception as exc:
            errors.append("manifest at %s is unparseable: %s" % (manifest_path, exc))
    stats["manifest"] = len(manifest_ids)

    try:
        with open(config_path, "r", encoding="utf-8") as fh:
            text = fh.read()
        meta = extract_meta(text)
    except (OSError, ParseError) as exc:
        errors.append("could not read the card catalog in %s: %s" % (config_path, exc))
        return errors, warnings, stats

    cards = collect_cards(meta)
    # DISTINCT card codes. collect_cards emits one tuple per cited ARRAY since the
    # checked/alsoChecked split, so len(cards) counts arrays -- and this number is
    # the gate's own "the extractor is really matching something" signal, which is
    # worthless if it drifts with a schema change.
    stats["cards"] = len({c for c, _f, _e in cards})
    if not cards:
        errors.append(
            "the extractor found ZERO cards in %s. The catalog shape changed and "
            "this gate is no longer testing anything." % config_path
        )

    referenced = set()
    ids_by_card = {}
    for code, field, entries in cards:
        if entries is None:
            errors.append(
                "%s: could not read `finding.%s` -- expected an array of "
                "{a, t} objects." % (code, field)
            )
            continue
        ids_here = ids_by_card.setdefault(code, [])
        for idx, entry in enumerate(entries, 1):
            stats["checked"] += 1
            where = "%s %s[%d]" % (code, field, idx)
            if entry[0] == "str":
                errors.append(
                    "%s is a bare string, not { a, t }. Every cited line names the "
                    "assertion that backs it; move an untested statement to `context`. "
                    "Text: %s" % (where, _snip(entry[1]))
                )
                continue
            if entry[0] != "obj":
                errors.append("%s is neither a string nor an { a, t } object." % where)
                continue
            props = entry[1]
            aid = props.get("a")
            text_node = props.get("t")
            if aid is None or aid[0] != "str" or not aid[1].strip():
                errors.append("%s has no usable `a` (assertion id)." % where)
            else:
                ident = aid[1].strip()
                ids_here.append(ident)
                referenced.add(ident)
                if manifest_ids and ident not in manifest_ids:
                    errors.append(
                        "%s cites `%s`, which is not in the manifest. Either the "
                        "classifier does not assert it, or the manifest is stale."
                        % (where, ident)
                    )
            if text_node is None or text_node[0] != "str" or not text_node[1].strip():
                errors.append("%s has an empty or missing `t` (analyst text)." % where)
    # Judged per CARD, not per array: a card's detection can legitimately cite a
    # precedence claim from the card that ran before it while its own assertions sit
    # in `alsoChecked`. Splitting the arrays without pooling the ids here would have
    # invented a warning on every such card.
    for code, ids_here in ids_by_card.items():
        if ids_here and all(i.split(".")[0] != code for i in ids_here):
            warnings.append(
                "%s cites only assertions belonging to other cards (%s). Legitimate "
                "for a precedence claim -- worth a look otherwise."
                % (code, ", ".join(sorted(set(ids_here))))
            )

    # POPULATION assertions are true of the WHOLE residual set, not of any one
    # card's claim, so no card can legitimately cite them and "referenced by no
    # card" is a false positive for them. Left unexempted they warn forever, and a
    # permanently-warning gate is exactly how the 123-warning backlog trained
    # everyone to skim past this output. Named in the standard so the exemption is
    # a declared list rather than a silent skip; any id NOT in that list still
    # warns, so this cannot be used to hide a genuinely orphaned assertion.
    # Errors go to a throwaway list: check_copy_standard() loads the same file a
    # few lines below and already reports an unparseable standard, so collecting
    # them here too would double-report one fault.
    population = set(load_standard([], standard_path)
                     .get("populationAssertions", {}).get("ids", []))
    unknown_exempt = population - manifest_ids
    if unknown_exempt:
        errors.append(
            "populationAssertions names %d id(s) absent from the manifest (%s). "
            "A stale exemption silently exempts nothing."
            % (len(unknown_exempt), ", ".join(sorted(unknown_exempt)))
        )
    for ident in sorted(manifest_ids - referenced - population):
        warnings.append("manifest id `%s` is referenced by no card." % ident)

    check_copy_standard(meta, config_path, errors, warnings, standard_path)

    return errors, warnings, stats


# --------------------------------------------------------------------------
# Card-copy standard
#
# Tools/txv-card-copy-standard.json is the SINGLE SOURCE OF TRUTH for card
# format. The renderer and the AI prompt contract restate parts of it, so this
# section reads the standard and FAILS when any of them has drifted. Without the
# cross-check the standard is just a fourth opinion: the 2026-08-12 rename had to
# be applied by hand to the renderer AND the prompt, and forgetting either would
# have shipped findings under headings the page does not render.
# --------------------------------------------------------------------------

STANDARD_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "txv-card-copy-standard.json")


def load_standard(errors, path=None):
    path = path or STANDARD_PATH
    try:
        with io.open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except Exception as exc:                     # noqa: BLE001 - reported, not raised
        errors.append("card-copy standard unreadable at %s (%s). It is the source of "
                      "truth for card format; the gate cannot check format without it."
                      % (path, exc))
        return None


def parse_baseline(std, errors):
    """{card code -> "*" | set(field names)} from formatBaseline.cards.

    Two accepted entry shapes: `{ "card": "MTO", "fields": [...] }` names the
    sections still baselined, and a bare `"MTO"` means the whole card. The bare
    form is the looser of the two, so it is read but never written -- a hand-added
    string quietly re-exempts every rule on that card.
    """
    out = {}
    for entry in std.get("formatBaseline", {}).get("cards", []):
        if isinstance(entry, str):
            out[entry] = "*"
            continue
        if not isinstance(entry, dict) or not entry.get("card"):
            errors.append(
                "format baseline entry %r is neither a card code nor "
                "{ card, fields }." % (entry,)
            )
            continue
        fields = entry.get("fields", "*")
        out[entry["card"]] = "*" if fields == "*" else set(fields or ())
    return out


def _bullet_texts(node):
    """Bullets are either bare strings or {a, t} objects. Yield their text."""
    if node is None or node[0] != "arr":
        return []
    out = []
    for item in node[1]:
        if item[0] == "str":
            out.append(item[1])
        elif item[0] == "obj":
            t = item[1].get("t")
            if t is not None and t[0] == "str":
                out.append(t[1])
    return out


def check_copy_standard(meta, config_path, errors, warnings, standard_path=None):
    std = load_standard(errors, standard_path)
    if not std:
        return

    limit = std.get("bulletWordLimit", 25)
    banned = [p.lower() for p in std.get("bannedPhrases", {}).get("phrases", [])]
    baseline = parse_baseline(std, errors)
    # The header comment has always promised this check; until 2026-08-15 nothing
    # performed it, so a code for a card that no longer exists would have sat there
    # exempting nothing and reading as coverage.
    for code in sorted(baseline):
        if code not in meta:
            errors.append(
                "format baseline lists `%s`, which is not a card in %s. A stale code "
                "exempts nothing and rots -- delete it or fix the spelling."
                % (code, config_path)
            )

    def emit(code, field, msg):
        """Baselined cards warn; everything else fails.

        The standard arrived after 21 cards were already written, so failing them
        all on day one would just get the gate switched off. Warning on the
        backlog and failing on anything outside it stops NEW drift immediately,
        which is the whole point.

        Per FIELD since 2026-08-15. `checked` was rewritten on all 17 detected
        cards and is enforced there now, while the same cards' found / fix /
        context backlog still warns. Whole-card baselining could not say that, so
        retiring one rule meant rewriting every section of every card first --
        which is exactly how a backlog stops being one.
        """
        fields = baseline.get(code)
        if fields == "*" or (fields is not None and field in fields):
            warnings.append("%s [baselined] %s" % (code, msg))
        else:
            errors.append("%s %s" % (code, msg))

    # collect_cards() returns only the cited arrays, so walk meta directly to
    # reach found / fix / context as well.
    for code, node in meta.items():
        if node[0] != "obj":
            continue
        finding = node[1].get("finding")
        if finding is None or finding[0] != "obj":
            continue
        for sec in std.get("headings", {}).get("order", []):
            field, heading = sec["field"], sec["heading"]
            bullets = _bullet_texts(finding[1].get(field))
            cap = sec.get("maxBullets")
            if cap is not None and len(bullets) > cap:
                emit(code, field, "`%s` (%s) has %d bullets, max %d. Trim it or move "
                     "the detail into an appended block."
                     % (field, heading, len(bullets), cap))
            for b in bullets:
                words = len(b.split())
                if words > limit:
                    emit(code, field, "`%s` bullet runs %d words (max %d): \"%s\". Over "
                         "the limit a bullet is carrying two ideas or explaining method."
                         % (field, words, limit, _snip(b)))
                low = b.lower()
                for phrase in banned:
                    if phrase in low:
                        emit(code, field, "`%s` bullet contains banned phrase \"%s\". "
                             "That is method, not finding: \"%s\""
                             % (field, phrase, _snip(b)))

    # ---- the derived files, cross-checked against the standard --------------
    derived = std.get("derivedFiles", {})
    root = os.path.dirname(os.path.dirname(os.path.abspath(config_path)))
    headings = [s["heading"] for s in std.get("headings", {}).get("order", [])]

    rend = derived.get("renderer", {})
    if rend.get("mustContainHeadings"):
        path = os.path.join(root, rend["path"].replace("/", os.sep))
        try:
            with io.open(path, encoding="utf-8", errors="replace") as fh:
                src = fh.read()
            for h in headings:
                if "'%s'" % h not in src and '"%s"' % h not in src:
                    errors.append(
                        "renderer %s does not render the heading \"%s\". The standard "
                        "defines it; the page and the standard have drifted."
                        % (rend["path"], h)
                    )
        except IOError:
            warnings.append("renderer %s not readable; heading cross-check skipped."
                            % rend["path"])

    prompt = derived.get("aiPromptContract", {})
    if prompt:
        path = os.path.join(root, prompt["path"].replace("/", os.sep))
        try:
            with io.open(path, encoding="utf-8", errors="replace") as fh:
                src = fh.read()
            for h in prompt.get("mustNameHeadings", []):
                if h not in src:
                    errors.append(
                        "AI prompt contract in %s does not name the heading \"%s\". "
                        "Generated findings would arrive under headings the page does "
                        "not render." % (prompt["path"], h)
                    )
            for stale in prompt.get("mustNotContain", []):
                if stale in src:
                    errors.append(
                        "AI prompt contract in %s still says \"%s\", which the standard "
                        "retired. Update it or the AI writes to the old format."
                        % (prompt["path"], stale)
                    )
        except IOError:
            warnings.append("%s not readable; prompt cross-check skipped."
                            % prompt["path"])


def _snip(s, width=70):
    s = " ".join(s.split())
    return s if len(s) <= width else s[: width - 1] + "…"


def report(errors, warnings, stats, label=""):
    prefix = "%s: " % label if label else ""
    for w in warnings:
        print("%sWARN  %s" % (prefix, w))
    for e in errors:
        print("%sFAIL  %s" % (prefix, e), file=sys.stderr)
    line = "%s%d cards, %d checked entries, %d manifest assertions" % (
        prefix,
        stats["cards"],
        stats["checked"],
        stats["manifest"],
    )
    if errors:
        print("%s -- %d violation(s)" % (line, len(errors)), file=sys.stderr)
    else:
        print("%s -- clean" % line)


# --------------------------------------------------------------------------
# Self-test: the fixtures prove each rule trips on its own, and that the
# extractor finds the expected counts (not zero, not everything).
# --------------------------------------------------------------------------

VALID_STANDARD = "valid.standard.fixture.json"

SELF_TESTS = [
    # (label, config fixture, manifest fixture, standard fixture, should_pass)
    ("valid", "valid.config.fixture.js", "valid.assertions.fixture.json", VALID_STANDARD, True),
    ("bare string", "bare-string.config.fixture.js", "valid.assertions.fixture.json", VALID_STANDARD, False),
    ("unknown id", "unknown-id.config.fixture.js", "valid.assertions.fixture.json", VALID_STANDARD, False),
    ("empty t", "empty-t.config.fixture.js", "valid.assertions.fixture.json", VALID_STANDARD, False),
    ("missing manifest", "valid.config.fixture.js", "no-such-manifest.json", VALID_STANDARD, False),
    ("bad manifest", "valid.config.fixture.js", "broken.assertions.fixture.json", VALID_STANDARD, False),
    # The two rules added 2026-08-15, each with its own fixture so it trips alone.
    ("alsoChecked bare", "also-checked-bare.config.fixture.js", "valid.assertions.fixture.json", VALID_STANDARD, False),
    ("stale baseline", "valid.config.fixture.js", "valid.assertions.fixture.json", "stale-baseline.standard.fixture.json", False),
]

# The valid fixture's shape, asserted so a parser that matches nothing fails
# loudly instead of passing with zero cards.
EXPECT_CARDS = 3
EXPECT_CHECKED = 5
EXPECT_ERROR_SUBSTR = {
    "bare string": "bare string",
    "unknown id": "not in the manifest",
    "empty t": "empty or missing `t`",
    "missing manifest": "manifest not found",
    "bad manifest": "unparseable",
    "alsoChecked bare": "TXI alsoChecked[1] is a bare string",
    "stale baseline": "baseline lists `NOSUCHCARD`",
}


def self_test(root):
    fixtures = os.path.join(root, FIXTURE_DIR)
    failures = []
    for label, cfg, man, std, should_pass in SELF_TESTS:
        errors, warnings, stats = run_check(
            os.path.join(fixtures, cfg), os.path.join(fixtures, man),
            os.path.join(fixtures, std)
        )
        passed = not errors
        status = "ok" if passed == should_pass else "FAILED"
        if passed != should_pass:
            failures.append(
                "%s: expected %s, got %s (%s)"
                % (
                    label,
                    "pass" if should_pass else "fail",
                    "pass" if passed else "fail",
                    "; ".join(errors) or "no errors",
                )
            )
        elif not should_pass:
            want = EXPECT_ERROR_SUBSTR[label]
            if not any(want in e for e in errors):
                failures.append(
                    "%s: failed for the wrong reason -- no error mentioned %r. Got: %s"
                    % (label, want, "; ".join(errors))
                )
            elif len(errors) != 1:
                failures.append(
                    "%s: tripped %d rules, expected exactly 1: %s"
                    % (label, len(errors), "; ".join(errors))
                )
        print(
            "  [%s] %-17s %d cards, %d checked, %d manifest, %d error(s), %d warning(s)"
            % (status, label, stats["cards"], stats["checked"], stats["manifest"],
               len(errors), len(warnings))
        )
        if label == "valid":
            if stats["cards"] != EXPECT_CARDS:
                failures.append(
                    "valid fixture: extractor found %d cards, expected %d"
                    % (stats["cards"], EXPECT_CARDS)
                )
            if stats["checked"] != EXPECT_CHECKED:
                failures.append(
                    "valid fixture: extractor found %d checked entries, expected %d"
                    % (stats["checked"], EXPECT_CHECKED)
                )
            # The valid fixture is built to exercise both warning paths.
            if not any("referenced by no card" in w for w in warnings):
                failures.append(
                    "valid fixture: expected an unreferenced-manifest-id warning"
                )
            if not any("belonging to other cards" in w for w in warnings):
                failures.append(
                    "valid fixture: expected a foreign-prefix (precedence) warning"
                )

    if failures:
        print("\nself-test FAILED:", file=sys.stderr)
        for f in failures:
            print("  - %s" % f, file=sys.stderr)
        return 1
    print("self-test passed: %d cases" % len(SELF_TESTS))
    return 0


def repo_root():
    """The repo root, derived from this script's location (Tools/ sits at root)."""
    return os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--config", default=None, help="path to config.js")
    ap.add_argument("--manifest", default=None, help="path to txv-assertions.json")
    ap.add_argument(
        "--self-test",
        action="store_true",
        help="run the fixture suite in Tools/_test_txv_gate and exit",
    )
    args = ap.parse_args(argv)

    root = repo_root()
    if args.self_test:
        return self_test(root)

    config_path = args.config or os.path.join(root, DEFAULT_CONFIG)
    manifest_path = args.manifest or os.path.join(root, DEFAULT_MANIFEST)
    errors, warnings, stats = run_check(config_path, manifest_path)
    report(errors, warnings, stats)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
