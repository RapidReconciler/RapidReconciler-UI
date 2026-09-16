#!/usr/bin/env python3
"""Report class/id selectors that a page styles but never renders.

Answers one question: does any markup in this file carry the class or id
this stylesheet targets? A zero means the rule is dead weight -- or, more
usefully, that a design was written in CSS and never built in HTML.

WHAT IT DOES NOT ANSWER, stated because the distinction cost a session
elsewhere (see the VLC-66 worklist row): a usage count of 1+ does NOT mean
the selector is doing work, and a count of 0 on a PARENT does not mean its
descendant rules are dead. Read the descendants before deleting anything.

Usage:
    python Tools/orphan-selectors.py RRV8/inventory-transactions.html [...]
    python Tools/orphan-selectors.py --self-test

Exit 0 when every file was parsed. Exit 1 on a self-test failure or an
unreadable file. Finding orphans is not an error -- this is a reporter, not
a gate, because a shared stylesheet legitimately styles classes this page
does not use.
"""
import os
import re
import sys

STYLE_BLOCK = re.compile(r"<style\b[^>]*>(.*?)</style>", re.S | re.I)
SCRIPT_BLOCK = re.compile(r"<script\b[^>]*>.*?</script>", re.S | re.I)
COMMENT = re.compile(r"/\*.*?\*/", re.S)
AT_RULE_HEAD = re.compile(r"@[a-z-]+[^{;]*[{;]", re.I)

# A selector token: .name or #name. Hyphens and digits allowed; a leading
# digit is not valid in CSS so it is not matched.
SELECTOR_TOKEN = re.compile(r"([.#])([A-Za-z_][A-Za-z0-9_-]*)")


# ⚠ SCRIPT BODIES ARE NOT STRIPPED, AND THAT IS THE WHOLE POINT.
# The first version of this tool removed them, reasoning that a class merely
# NAMED in JS is not markup. On the V8 pages that inverted the answer: these
# pages build most of their DOM from template strings inside one 7,000-line
# <script>, so `class="popover-row"` at inventory-transactions.html:9262 IS
# how that element gets its class. Stripping scripts reported 227 of 352
# selectors on that page as orphaned, including ten live ones. Caught by
# disagreeing with a hand grep, not by reading the code.
STYLE_ONLY = re.compile(r"<style\b[^>]*>.*?</style>", re.S | re.I)
CLASS_ATTR = re.compile(r"""class\s*=\s*(?:["']([^"']*)["']|\{?`([^`]*)`)""", re.I)
JS_STRING = re.compile(r"""['"]([A-Za-z_][A-Za-z0-9_ -]{1,120})['"]""")
CLASSLIST = re.compile(r"""classList\s*\.\s*(?:add|remove|toggle|contains)\s*\(([^)]*)\)""")


def selectors_in_styles(html):
    """Every class/id token appearing in a selector position, with its line."""
    found = {}
    for m in STYLE_BLOCK.finditer(html):
        base_line = html.count("\n", 0, m.start(1)) + 1
        for key, line in selectors_in_css(m.group(1), base_line).items():
            found.setdefault(key, line)
    return found


def selectors_in_css(body, base_line=1):
    """The same walk, over raw CSS text rather than a <style> block.

    Split out 2026-09-15 (HK-18) so a LINKED stylesheet can be read with
    the identical parser the inline blocks already use. One producer: a
    second CSS parser written for the linked case would have drifted from
    this one, and every defect the comments below record would have had to
    be found twice.
    """
    found = {}
    body = COMMENT.sub(lambda c: "\n" * c.group(0).count("\n"), body)
    # Walk declaration blocks: text before a "{" is a selector list.
    pos = 0
    while True:
        brace = body.find("{", pos)
        if brace < 0:
            break
        head = body[pos:brace]
        close = body.find("}", brace)
        if close < 0:
            close = len(body)
        # An at-rule head (@media, @supports) carries no selectors of
        # its own, and its body is walked by the same loop afterwards.
        # ⚠ `head` is body[pos:brace] and therefore EXCLUDES the brace,
        # while AT_RULE_HEAD requires a trailing `{` or `;`. So that
        # regex could never match here and the at-rule branch was dead
        # code -- harmless while the loop advanced by `brace + 1`
        # regardless, fatal the moment the advance became conditional.
        # Found 2026-09-10 by the self-test's @media case going red.
        is_at_rule = head.strip().startswith("@")
        if not is_at_rule:
            line = base_line + body.count("\n", 0, pos)
            for tok in SELECTOR_TOKEN.finditer(head):
                kind, name = tok.group(1), tok.group(2)
                key = ("id" if kind == "#" else "class", name)
                found.setdefault(key, line + head[:tok.start()].count("\n"))
        # ⚠ THIS USED TO BE `pos = brace + 1` UNCONDITIONALLY, AND THAT
        # SCANNED EVERY DECLARATION BODY AS SELECTOR TEXT. Fixed
        # 2026-09-10. Advancing past the OPENING brace made the next
        # iteration's `head` run from inside the current rule's
        # declarations up to the next rule's brace -- so a value like
        # `--blue-pale: #e6efff;` was read as an id selector `#e6efff`.
        # `close` was already being computed and simply never used.
        #
        # It only ever showed up for hex colours BEGINNING WITH A LETTER,
        # because SELECTOR_TOKEN requires `[A-Za-z_]` after the `#`: on
        # inventory-transactions.html it flagged #e6efff, #f08a24,
        # #d97316, #fbe7ce, #def4e6, #c0392b, #fce5e1, #fafbfd, #f3f5f9,
        # #e6eaf0, #cfd6e0, #fff -- and silently skipped #142037,
        # #2b5fb0, #3d8fd6, #2e8a55. A false-positive rate that depends
        # on which colours a designer picked is the worst kind: it looks
        # like signal. Every orphan count this tool produced before today
        # was inflated by an unpredictable amount.
        #
        # An AT-RULE still advances by one, on purpose: its body holds
        # real nested rules and the comment above promises they are
        # walked. Skipping to its `}` would find the first INNER close
        # brace and under-report every selector inside a @media block,
        # which is the more expensive direction.
        pos = (brace + 1) if is_at_rule else (close + 1)
    return found


def markup_usage(html):
    """Count class/id usages across the file, static markup and JS alike.

    Returns (classes, ids, soft) where `soft` holds names seen only as a
    bare quoted JS string or a classList argument. Those are weaker
    evidence than a class attribute, so they are reported separately --
    but they still count as USED, because the safe direction for an
    orphan reporter is to under-report. Telling someone a live selector
    is dead is the expensive mistake.
    """
    body = STYLE_ONLY.sub(lambda m: "\n" * m.group(0).count("\n"), html)
    sites, stems = class_attr_sites(html)
    classes = {n: c for n, (c, _line) in sites.items()}
    # The FORWARD direction keeps counting stems as usage. Its safe direction
    # is to UNDER-report -- telling someone a live selector is dead is the
    # expensive mistake -- so a stem that happens to match a styled selector
    # must go on suppressing that orphan exactly as it did before.
    for name in stems:
        classes.setdefault(name, 1)
    ids = {}
    for m in re.finditer(r"""id\s*=\s*["']([^"']*)["']""", body, re.I):
        val = m.group(1).strip()
        if val and not val.startswith("$"):
            ids[val] = ids.get(val, 0) + 1
    soft = {}
    for m in CLASSLIST.finditer(body):
        for s in JS_STRING.finditer(m.group(1)):
            for tok in s.group(1).split():
                soft[tok] = soft.get(tok, 0) + 1
    for m in re.finditer(r"""getElementById\s*\(\s*['"]([^'"]+)['"]""", body):
        soft[m.group(1)] = soft.get(m.group(1), 0) + 1
    for m in re.finditer(r"""querySelector(?:All)?\s*\(\s*['"]([^'"]+)['"]""", body):
        for tok in SELECTOR_TOKEN.finditer(m.group(1)):
            soft[tok.group(2)] = soft.get(tok.group(2), 0) + 1
    return classes, ids, soft


# ---------------------------------------------------------------------------
# THE INVERSE DIRECTION -- a class in MARKUP with no rule anywhere. HK-18.
#
# Added 2026-09-15 after I wrote `class="callout is-wide"` into a document
# going to a third party. `is-wide` does not exist; I built it by analogy from
# `is-warn` and `is-shown` elsewhere in the tree, which is hard rule 1 -- an
# identifier used without ever being read out of source. The real class was
# `.callout.warning`, in the same stylesheet the whole time. Nothing would have
# stopped it. A grep I happened to run did.
#
# ⚠ AND THAT GREP WAS WRONG ON ITS FIRST RUN, which is why this lives in the
# existing tool rather than in a new script. I matched DOUBLE-quoted class
# names; the markup builds them in single quotes, so a third unbacked class
# read `used: 0` -- and the control read 0 as well. `CLASS_ATTR` above already
# handles both quote styles AND template literals, and carries a regression
# guard for the script-stripping defect that once reported ten live selectors
# as dead. Writing a second extractor would have meant finding all of that
# again, badly.
#
# ⛔ THE HARD PART IS NOT THE PARSE, IT IS THE FALSE POSITIVES. Two sources
# make a class legitimately unbacked-looking:
#   1. LINKED stylesheets. 79 pages link ../Tools/doc-header.css and style
#      nothing inline. Reading only <style> blocks would report every one of
#      their header classes, which is a gate nobody would ever keep.
#   2. Pure JS hooks -- a class that exists only so a selector can find it.
#      Legitimate, common, and indistinguishable from a typo by parsing alone.
# (1) is fixed here by following the <link>. (2) is what the baseline absorbs.
LINK_CSS = re.compile(
    r"""<link\b[^>]*\brel\s*=\s*["']stylesheet["'][^>]*>""", re.I)
HREF = re.compile(r"""\bhref\s*=\s*["']([^"']+)["']""", re.I)
# `[class*="x"]`, `[class^=…]`, `[class$=…]`, `[class~=…]`. A page that styles
# by substring backs every class containing it, and treating those as unbacked
# would be the expensive direction: telling an author a live class is dead.
CLASS_SUBSTRING_SEL = re.compile(
    r"""\[\s*class\s*[\*\^\$\~\|]?=\s*["']([^"']+)["']""", re.I)


def class_attr_sites(html):
    """{class name: (count, first line)} from every class attribute.

    THE one markup-side extractor. `markup_usage` derives its class counts
    from this so the forward and inverse directions can never disagree
    about what the markup contains -- which is exactly how the hand grep
    that opened HK-18 went wrong.
    """
    body = STYLE_ONLY.sub(lambda m: "\n" * m.group(0).count("\n"), html)
    sites, stems = {}, {}
    for m in CLASS_ATTR.finditer(body):
        line = body.count("\n", 0, m.start()) + 1
        toks = (m.group(1) or m.group(2) or "").split()
        # ⛔ A CLASS BUILT BY CONCATENATION IS A STEM, NOT A CLASS, AND
        # REPORTING IT AS ONE MANUFACTURED A THIRD OF THE FINDINGS ON THE
        # BIGGEST PAGE. Measured 2026-09-15 on the first real run: home.html
        # reported 24 unbacked, and EIGHT were `is-`, `sev-`, `alh-chip-`,
        # `cx-card--`, `cx-container--`, `audit-band-`, `audit-chip-`,
        # `alh-chip-` -- every one the left half of
        # `'<div class="msg-card sev-' + sev + '">'`. None is a typo; all
        # resolve at runtime.
        #
        # ⚠ DETECTED STRUCTURALLY, NOT BY A TRAILING DASH. "ends in a
        # hyphen" would be a guess that happens to fit today's data, and the
        # first stem someone writes as `'tone' + n` would walk straight past
        # it. The real signal is in the source: the quote that closed the
        # attribute is a JS string terminator, so the next non-space
        # character is a `+`. That is unambiguous and cannot be true of a
        # finished HTML attribute.
        tail = body[m.end():m.end() + 40].lstrip()
        if toks and tail.startswith("+"):
            stems.setdefault(toks[-1], line)
            toks = toks[:-1]
        for tok in toks:
            # A template interpolation leaves fragments like ${x} or '+cls+'
            if tok.startswith("$") or "'" in tok or '"' in tok:
                continue
            # `class="sev-${level}"` -- the same stem in template-literal
            # clothing. The token does not START with `$`, so the guard
            # above cannot see it.
            if "${" in tok:
                head = tok.split("${", 1)[0]
                if head:
                    stems.setdefault(head, line)
                continue
            count, first = sites.get(tok, (0, line))
            sites[tok] = (count + 1, first)
    return sites, stems


def linked_stylesheets(html, page_path):
    """Local .css files this page links, resolved against the page's folder.

    Remote hrefs (fonts.googleapis.com and friends) are skipped and COUNTED,
    never silently dropped -- a page whose rules all live on a CDN would
    otherwise look like a page with no rules at all.
    """
    base = os.path.dirname(os.path.abspath(page_path))
    local, remote, missing = [], 0, []
    for tag in LINK_CSS.finditer(html):
        href = HREF.search(tag.group(0))
        if not href:
            continue
        url = href.group(1).strip()
        if url.startswith(("http://", "https://", "//", "data:")):
            remote += 1
            continue
        resolved = os.path.normpath(os.path.join(base, url.split("?")[0].split("#")[0]))
        if os.path.isfile(resolved):
            local.append(resolved)
        else:
            missing.append(url)
    return local, remote, missing


def backed_class_names(html, page_path):
    """Every class name this page has a rule for, inline or linked.

    Returns (names, substrings, sheets, remote, missing). `substrings` are
    the literals out of [class*="…"] selectors: any markup class CONTAINING
    one is treated as backed.
    """
    names = {n for (kind, n) in selectors_in_styles(html) if kind == "class"}
    css_text = "".join(m.group(1) for m in STYLE_BLOCK.finditer(html))
    sheets, remote, missing = linked_stylesheets(html, page_path)
    for sheet in sheets:
        with open(sheet, "r", encoding="utf-8", errors="replace") as fh:
            text = fh.read()
        css_text += text
        names |= {n for (kind, n) in selectors_in_css(text) if kind == "class"}
    substrings = {m.group(1) for m in CLASS_SUBSTRING_SEL.finditer(css_text)}
    return names, substrings, sheets, remote, missing


def unbacked_classes(path):
    """[(line, name, count)] -- classes in markup that nothing styles."""
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        html = fh.read()
    backed, substrings, sheets, remote, missing = backed_class_names(html, path)
    sites, stems = class_attr_sites(html)
    out = []
    for name, (count, line) in sites.items():
        if name in backed:
            continue
        if any(s and s in name for s in substrings):
            continue
        out.append((line, name, count))
    out.sort()
    return out, {"markup": len(sites), "styled": len(backed), "sheets": sheets,
                 "remote": remote, "missing": missing, "stems": len(stems)}


def page_key(path):
    """The baseline key for a page: its path, slash-normalised.

    ⛔ THIS WAS THE BASENAME AND THAT WAS A FAIL-OPEN. Measured 2026-09-15,
    immediately after the first baseline was written: the repository holds
    TWO files called `inventory-cardex-variance.html`, one in RRUniversity
    and one in RRV8. Under a basename key, a class baselined on either one
    is silently accepted on the other -- and the accepting direction is the
    one that hides a defect. One duplicate out of 141 is exactly the density
    at which a bug like this survives review.

    Windows backslashes are normalised so the same file produces the same
    key whether the path came from `git ls-files` or from a shell glob.
    """
    return os.path.relpath(path).replace("\\", "/")


def read_baseline(path):
    """{'RRV8/page.html': {'class-a', 'class-b'}} from a baseline file.

    Format is one `path/page.html  class-name` pair per line, `#` comments
    ignored. Deliberately dumb: this file is generated and regenerated, and
    a format needing a parser is a format that acquires a parser bug.
    """
    known = {}
    with open(path, "r", encoding="utf-8") as fh:
        for raw in fh:
            line = raw.split("#", 1)[0].strip()
            if not line:
                continue
            parts = line.split()
            if len(parts) != 2:
                raise ValueError("baseline line is not `page class`: %r" % raw)
            known.setdefault(parts[0], set()).add(parts[1])
    return known


def check_unbacked(paths, baseline_path=None, write_to=None):
    """Report (and optionally gate on) classes with no rule.

    ⛔ THE BASELINE IS NOT A PASS. `orphan-selectors.py` already reports 209
    orphans on home.html alone in the OTHER direction, so this codebase
    tolerates loose class hygiene, and a gate that went red on a large
    pre-existing backlog would be baselined into silence within a week --
    which is the failure this gate exists to avoid, not a cost of it. Owner
    ruling 2026-09-15: baseline what exists, fail only on what is NEW.
    """
    rows, total_new = {}, 0
    for path in paths:
        found, meta = unbacked_classes(path)
        rows[page_key(path)] = (found, meta)

    if write_to:
        lines = ["# Unbacked markup classes -- the HK-18 baseline.",
                 "#",
                 "# One `page.html  class-name` pair per line. A class listed here is",
                 "# in markup with no CSS rule on this page and is ACCEPTED: most are",
                 "# JS state hooks that were never meant to be styled. A class NOT",
                 "# listed fails the build.",
                 "#",
                 "# ⛔ REGENERATE ONLY DELIBERATELY. `--write-baseline` re-accepts",
                 "# everything currently unbacked, so running it to clear a red build",
                 "# is how this file stops meaning anything. The red line names the",
                 "# class; look it up before you decide it is fine.",
                 "#",
                 "# Generated by: python Tools/orphan-selectors.py --unbacked "
                 "--write-baseline <this file> <pages>",
                 ""]
        for page in sorted(rows):
            found, _meta = rows[page]
            for _line, name, _count in sorted(found, key=lambda r: r[1]):
                lines.append("%-44s %s" % (page, name))
        with open(write_to, "w", encoding="utf-8", newline="\n") as fh:
            fh.write("\n".join(lines) + "\n")
        print("wrote %s -- %d entr%s across %d page(s)"
              % (write_to, sum(len(v[0]) for v in rows.values()),
                 "y" if sum(len(v[0]) for v in rows.values()) == 1 else "ies",
                 len(rows)))
        return 0

    known = read_baseline(baseline_path) if baseline_path else {}
    stale = 0
    for page in sorted(rows):
        found, meta = rows[page]
        accepted = known.get(page, set())
        new = [r for r in found if r[1] not in accepted]
        still = {r[1] for r in found} & accepted
        gone = accepted - {r[1] for r in found}
        stale += len(gone)
        total_new += len(new)
        # ⚠ EVERY NUMBER THIS PRINTS IS NEXT TO THE CONTROL IT DEPENDS ON.
        # `styled` and `sheets` are what makes an unbacked count meaningful:
        # a page reporting 40 unbacked with `styled 0, sheets 0` has not
        # found 40 defects, it has failed to find its stylesheet.
        # ⚠ EVERY NUMBER HERE IS PRINTED NEXT TO THE CONTROL IT DEPENDS ON.
        # `styled`/`sheets` say whether the rules were found at all -- 40
        # unbacked against `0 styled, 0 sheets` is a lost stylesheet, not 40
        # defects. `stems` is the count this run CHOSE not to report, and it
        # is printed because a suppression nobody can see is how a gate
        # quietly stops gating.
        print("%s -- %d class name(s) in markup, %d styled, %d linked sheet(s), "
              "%d computed stem(s) skipped, %d unbacked (%d new, %d baselined)"
              % (page, meta["markup"], meta["styled"], len(meta["sheets"]),
                 meta["stems"], len(found), len(new), len(still)))
        if meta["missing"]:
            # ASCII only in anything PRINTED. A PS5.1 / cp1252 console raises
            # UnicodeEncodeError on the warning glyph, and this branch is the
            # one that fires when a stylesheet has moved -- so the tool would
            # crash exactly when it had something important to say. Measured
            # 2026-09-15 on this box, first run against a real page.
            print("  !! linked stylesheet(s) NOT found on disk, so their rules "
                  "were not read: %s" % ", ".join(meta["missing"]))
        if meta["remote"]:
            print("  note %d remote stylesheet(s) skipped" % meta["remote"])
        for line, name, count in new:
            print("  UNBACKED    line %-6d .%s  (%d use%s, no rule on this page)"
                  % (line, name, count, "" if count == 1 else "s"))
        if gone:
            # Reported, never fatal. The guard-parity baseline fails on a stale
            # entry because it holds five hand-written rulings; this one holds
            # hundreds of mechanical rows, and failing a build because someone
            # DELETED markup would train people to stop deleting markup.
            print("  note %d baselined class(es) no longer appear here (stale, "
                  "not an error): %s" % (len(gone), ", ".join(sorted(gone))))
    if baseline_path:
        print("%d new unbacked class(es); %d stale baseline entr%s"
              % (total_new, stale, "y" if stale == 1 else "ies"))
    return 1 if total_new else 0


def report(path):
    with open(path, "r", encoding="utf-8", errors="replace") as fh:
        html = fh.read()
    styled = selectors_in_styles(html)
    classes, ids, soft = markup_usage(html)
    orphans, soft_only = [], []
    for (kind, name), line in sorted(styled.items(), key=lambda kv: kv[1]):
        hard = (ids if kind == "id" else classes).get(name, 0)
        if hard:
            continue
        if soft.get(name, 0):
            soft_only.append((line, kind, name, soft[name]))
        else:
            orphans.append((line, kind, name))
    print("%s -- %d styled selectors, %d class attrs, %d id attrs, "
          "%d orphaned, %d script-only" % (path, len(styled),
          sum(classes.values()), sum(ids.values()), len(orphans),
          len(soft_only)))
    for line, kind, name in orphans:
        print("  ORPHAN      line %-6d %s%s" % (line, "#" if kind == "id" else ".", name))
    for line, kind, name, n in soft_only:
        print("  script-only line %-6d %s%s  (%d JS reference%s, no class/id "
              "attribute)" % (line, "#" if kind == "id" else ".", name, n,
                              "" if n == 1 else "s"))
    return len(orphans)


SELF_TEST = """<html><head><style>
  .lives { color: red; }
  .orphan-class { color: blue; }
  #js-host.orphan-class { display: none; }
  #lives-id { margin: 0; }
  /* .commented-out { color: green; } */
  @media (max-width: 900px) {
    .orphan-in-media { flex: none; }
    .lives { color: pink; }
  }
  .parent > .orphan-child { gap: 2px; }
  .tpl-built { border: 0; }
  #js-soft-host { color: teal; }
</style></head><body>
  <div class="lives" id="lives-id">x</div>
  <div class="parent">y</div>
  <script>
    var s = 'orphan-class'; el.className = 'orphan-in-media';
    box.innerHTML = '<div class="tpl-built">built from a template string</div>';
    var h = document.getElementById('js-soft-host');
  </script>
</body></html>"""


def self_test():
    import tempfile
    import os
    checks = []
    styled = selectors_in_styles(SELF_TEST)
    names = {n for (_k, n) in styled}
    checks.append(("selector in a plain rule found", ("class", "lives") in styled))
    checks.append(("id selector found", ("id", "lives-id") in styled))
    checks.append(("compound #id.class -- both halves found",
                   ("id", "js-host") in styled and ("class", "orphan-class") in styled))
    checks.append(("selector inside @media found", ("class", "orphan-in-media") in styled))
    checks.append(("@media itself not read as a selector", "media" not in names))
    checks.append(("commented-out rule NOT found", ("class", "commented-out") not in styled))
    checks.append(("descendant selector -- both halves found",
                   ("class", "parent") in styled and ("class", "orphan-child") in styled))

    classes, ids, soft = markup_usage(SELF_TEST)
    checks.append(("markup class counted", classes.get("lives") == 1))
    checks.append(("markup id counted", ids.get("lives-id") == 1))
    checks.append(("a class named only as a bare JS string is NOT usage",
                   classes.get("orphan-class", 0) == 0 and
                   classes.get("orphan-in-media", 0) == 0))
    # THE REGRESSION GUARD for the defect this tool shipped with: the first
    # version stripped <script> bodies and so missed every class attribute
    # written inside a template string, which is how the V8 pages build
    # their DOM. It reported ten live selectors as orphaned.
    checks.append(("class attr inside a <script> template string IS usage",
                   classes.get("tpl-built") == 1))
    checks.append(("getElementById counts as SOFT evidence only",
                   soft.get("js-soft-host") == 1 and
                   "js-soft-host" not in ids))
    checks.append(("a class token containing $ is not counted",
                   not any(k.startswith("$") for k in classes)))

    fd, tmp = tempfile.mkstemp(suffix=".html")
    os.close(fd)
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(SELF_TEST)
    try:
        n = report(tmp)
    finally:
        os.unlink(tmp)
    # 9 styled selectors. Carried by markup: lives, lives-id, parent,
    # tpl-built. Soft-only: js-soft-host. Orphaned: orphan-class, js-host,
    # orphan-in-media, orphan-child = 4.
    # ⚠ This assertion first read 5 and the TOOL was right -- the fixture
    # expectation was the defect, the same slip HK-13's self-test made.
    # Count the fixture by hand before believing a red case.
    checks.append(("orphan count on the fixture is 4", n == 4))

    # ---- the INVERSE direction (HK-18) ----------------------------------
    # Every fixture is written here, not read from the repository. An
    # assertion whose truth depends on the current state of the tree is not
    # an assertion -- it is a snapshot that goes green when the tree drifts.
    import tempfile as _tf
    tmpdir = _tf.mkdtemp()
    try:
        css_path = os.path.join(tmpdir, "linked.css")
        with open(css_path, "w", encoding="utf-8") as fh:
            fh.write(".from-linked-sheet { color: red; }\n"
                     "[class*='ico-'] { width: 1em; }\n")
        page = (
            '<html><head><link rel="stylesheet" href="linked.css">'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/x.css">'
            '<style>.inline-backed { color: blue; }</style></head><body>'
            '<div class="inline-backed">a</div>'
            '<div class="from-linked-sheet">b</div>'
            "<div class='single-quoted-unbacked'>c</div>"
            '<div class="ico-star">d</div>'
            '<script>box.innerHTML = \'<p class="tpl-unbacked">e</p>\';</script>'
            # The two computed-class shapes. `real-card` and `keep-me` sit
            # in the SAME attributes and must still be judged -- a stem fix
            # that swallowed its neighbours would trade one blind spot for
            # a wider one.
            '<script>h = \'<div class="real-card sev-\' + s + \'">f</div>\';'
            "  g = `<b class=\"keep-me tone-${n}\">h</b>`;</script>"
            "</body></html>")
        page_path = os.path.join(tmpdir, "fixture.html")
        with open(page_path, "w", encoding="utf-8") as fh:
            fh.write(page)
        found, meta = unbacked_classes(page_path)
        names = {n for (_l, n, _c) in found}

        checks.append(("a class styled INLINE is backed",
                       "inline-backed" not in names))
        # ⛔ THE ONE THAT MAKES THE GATE KEEPABLE. 79 pages link
        # ../Tools/doc-header.css and style nothing inline; without this the
        # gate reports their entire header and gets switched off in a week.
        checks.append(("a class styled by a LINKED sheet is backed",
                       "from-linked-sheet" not in names))
        # ⛔ THE DEFECT THAT OPENED HK-18. My hand grep matched double-quoted
        # class names only, the markup uses single quotes, and the control
        # read 0 as well so nothing stopped the run.
        checks.append(("a SINGLE-quoted unbacked class IS reported",
                       "single-quoted-unbacked" in names))
        checks.append(("an unbacked class inside a <script> template IS reported",
                       "tpl-unbacked" in names))
        checks.append(("[class*='ico-'] backs .ico-star",
                       "ico-star" not in names))
        checks.append(("a remote stylesheet is counted, not silently dropped",
                       meta["remote"] == 1))
        checks.append(("the linked sheet was actually read",
                       len(meta["sheets"]) == 1 and not meta["missing"]))
        # ⛔ THE STEM CASES. Both were manufacturing findings on the first
        # real run: eight of home.html's twenty-four were concatenation
        # stems like `'msg-card sev-' + sev`.
        checks.append(("a `'... sev-' + x` stem is NOT reported as a class",
                       "sev-" not in names))
        checks.append(("a `tone-${n}` template stem is NOT reported",
                       "tone-" not in names and
                       not any(n.startswith("tone-") for n in names)))
        # …and the control for the fix being too wide: the finished classes
        # sharing those attributes must still be judged.
        checks.append(("the finished class beside a `+` stem IS still judged",
                       "real-card" in names))
        checks.append(("the finished class beside a `${}` stem IS still judged",
                       "keep-me" in names))
        checks.append(("the stem count has a sink (it is reported, not dropped)",
                       meta["stems"] == 2))
        checks.append(("exactly the four unbacked classes are found",
                       len(found) == 4))

        # A missing linked sheet must be SAID, not swallowed -- otherwise a
        # renamed stylesheet turns every class on the page into a finding and
        # the output gives no hint why.
        with open(page_path, "w", encoding="utf-8") as fh:
            fh.write(page.replace('href="linked.css"', 'href="gone.css"'))
        _f2, meta2 = unbacked_classes(page_path)
        checks.append(("a linked sheet that is not on disk is REPORTED",
                       meta2["missing"] == ["gone.css"]))

        # Baseline behaviour, both directions.
        bl = os.path.join(tmpdir, "baseline.txt")
        with open(page_path, "w", encoding="utf-8") as fh:
            fh.write(page)
        # ⛔ THE KEY IS THE PATH, NOT THE BASENAME, so the fixture asks the
        # tool for its own key rather than hardcoding one. Hardcoding
        # "fixture.html" here would have gone on passing after the key
        # changed, which is the shape of a test that validates the author's
        # guess instead of the code.
        key = page_key(page_path)
        with open(bl, "w", encoding="utf-8") as fh:
            fh.write("# comment\n%s  single-quoted-unbacked\n"
                     "%s  never-appears-anywhere\n" % (key, key))
        rc_gated = check_unbacked([page_path], bl)
        checks.append(("a baselined class does NOT fail the build; the other "
                       "one does", rc_gated == 1))
        known = read_baseline(bl)
        checks.append(("the baseline parser ignores comments and blanks",
                       known[key] == {"single-quoted-unbacked",
                                      "never-appears-anywhere"}))
        # ⛔ THE DUPLICATE-BASENAME CASE, which is a real one: this repository
        # holds TWO files called inventory-cardex-variance.html. Under the
        # old basename key, a class accepted on one was accepted on the
        # other -- silently, in the direction that hides a defect.
        sub = os.path.join(tmpdir, "other")
        os.makedirs(sub, exist_ok=True)
        twin = os.path.join(sub, os.path.basename(page_path))
        with open(twin, "w", encoding="utf-8") as fh:
            fh.write(page.replace('href="linked.css"', 'href="../linked.css"'))
        checks.append(("a same-named page in another folder gets its OWN key",
                       page_key(twin) != key))
        checks.append(("...so a class baselined on one twin still fails on "
                       "the other", check_unbacked([twin], bl) == 1))
        # THE MUTATION CONTROL. Baseline BOTH and the run must go green --
        # otherwise the exit code above was reporting something other than
        # what is baselined, and the gate would be red no matter what anyone
        # did about it.
        # ⚠ THIS LISTED TWO AND WENT RED WHEN THE STEM FIX ADDED THE
        # `real-card` / `keep-me` cases to the fixture. The TOOL was right
        # and the expectation was stale -- the same slip the orphan-count
        # assertion above records. Count the fixture by hand before
        # believing a red case.
        with open(bl, "w", encoding="utf-8") as fh:
            fh.write("".join("%s  %s\n" % (key, c) for c in
                             ("single-quoted-unbacked", "tpl-unbacked",
                              "real-card", "keep-me")))
        checks.append(("with ALL baselined the run is green (mutation control)",
                       check_unbacked([page_path], bl) == 0))
        # And the inverse mutation: an empty baseline must go red. A gate
        # that cannot be made to fail has not been shown to be a gate.
        with open(bl, "w", encoding="utf-8") as fh:
            fh.write("# nothing accepted\n")
        checks.append(("with an EMPTY baseline the run is red (mutation control)",
                       check_unbacked([page_path], bl) == 1))
    finally:
        import shutil
        shutil.rmtree(tmpdir, ignore_errors=True)

    bad = [name for name, ok in checks if not ok]
    for name, ok in checks:
        print("  %-58s %s" % (name, "ok" if ok else "BROKEN"))
    print("self-test: %d cases, %d broken" % (len(checks), len(bad)))
    return 1 if bad else 0


if __name__ == "__main__":
    args = sys.argv[1:]
    if not args or args[0] == "--self-test":
        sys.exit(self_test())

    # --unbacked switches direction: markup classes with no rule, gated
    # against a baseline. Hand-rolled rather than argparse to stay in step
    # with the existing plain-positional interface every caller already uses.
    if "--unbacked" in args:
        args = [a for a in args if a != "--unbacked"]
        baseline = write_to = None
        rest = []
        i = 0
        while i < len(args):
            if args[i] == "--baseline" and i + 1 < len(args):
                baseline = args[i + 1]; i += 2
            elif args[i] == "--write-baseline" and i + 1 < len(args):
                write_to = args[i + 1]; i += 2
            else:
                rest.append(args[i]); i += 1
        files = []
        for p in rest:
            if os.path.isdir(p):
                files += sorted(os.path.join(p, f) for f in os.listdir(p)
                                if f.endswith(".html"))
            else:
                files.append(p)
        # ⛔ A RUN WITH NOTHING TO CHECK IS A PASS THAT MEANS NOTHING. The same
        # vacuous-pass guard the js-syntax and guard-parity workflows both
        # carry, and both carry it because a gate that silently narrowed its
        # own scope looks exactly like a gate that found nothing.
        if not files:
            print("no HTML files matched; the check would pass vacuously")
            sys.exit(1)
        print("checking %d file(s)" % len(files))
        sys.exit(check_unbacked(files, baseline, write_to))

    rc = 0
    for path in args:
        try:
            report(path)
        except OSError as exc:
            print("could not read %s: %s" % (path, exc))
            rc = 1
    sys.exit(rc)
