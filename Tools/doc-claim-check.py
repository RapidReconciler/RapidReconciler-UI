#!/usr/bin/env python
"""Find docs that name a JS symbol as WIRED when it has no reachable caller.

    python Tools/doc-claim-check.py                 # report; exit 1 on a finding
    python Tools/doc-claim-check.py --negatives     # also list "not wired" claims
    python Tools/doc-claim-check.py --quiet         # exit code only

WHY THIS EXISTS. HK-7, opened 2026-09-02 after the fifth instance in two days:
docs assert component states the code has moved past, and only a human reader
ever catches it. That row measured **19 such claims across 14 files** and, more
usefully, split them in two:

  * the EASY third -- a doc saying something is "not wired" / "a stub" / "has no
    caller" when it now does. Findable by grepping the phrasing.
  * the HARD two-thirds -- a doc asserting a POSITIVE wiring that never landed.
    **No phrase grep can see this**, because the sentence contains none of the
    negative words. HK-7's own warning: a checker catching only the easy third
    "while reading as coverage of the whole problem would be worse than no
    check."

UI-174 is the proof that the hard half is the real one, and it also handed over
the only mechanical form of it anyone has found. `RRV8/API.md` and the closing
summary of VLC-41 both said V8 "gains canAccountant()". It did: the function was
defined. Its only reference sat inside `_hasAccountantGrant()`, which nothing
invoked, so `perms.ac` was minted by VALC, transported, and enforced by the
agent while V8 consumed none of it. **A named symbol asserted as wired whose
REACHABLE call-site count is zero is checkable**, which is what this file
checks.

⚠ REACHABLE, NOT REFERENCED, AND THE DIFFERENCE IS THE WHOLE POINT. A raw
call-site count says 1 for `canAccountant()` in the broken code. The first draft
of `Tools/test-role-entitlement.js` made exactly that mistake and passed against
the defect it was written for. A call site only counts here when the function
CONTAINING it is itself called somewhere.

⚠ THE BLIND SPOT THIS TOOL SHIPPED WITH, FOUND 2026-09-05 AND NOW REPORTED.
For its first two days `if not owners: continue` sat BEFORE `checked += 1`, so
a claim naming a symbol that could not be resolved AT ALL was dropped without
appearing in any number printed. The run said "41 claims checked, 0 findings"
while 11 more had been seen and discarded in silence.

That is the wrong way round, because the dropped class contains the WORSE
defect. "Declared but unreachable" is what this tool was built for; "named in a
doc and declared nowhere" is strictly worse and was invisible. It found one the
day the counter was added: `RRV8/WORKFLOW.md:151,155` present
`computeFilteredView()` as "the single seam" that the hero, side stats, variance
steps and page subtitle all read from, and `computeFilteredHistory()` as what
regroups the 13-period trend. **Neither string occurs in any .html or .js in
this repo.** The behaviour around them is real -- `accountRows` and
`rrv8-filter-selections-v1` are both live in inventory-transactions.html,
inventory-asof.html and sidebar.js -- so the section documents shipped work
under two names the code does not carry.

Unresolved claims are COUNTED and reported but do NOT set the exit code. Most
are legitimately unresolvable here: SQL builtins (`ROUND()`), template
placeholders from plan docs (`loadXAck()`), and Java symbols in the other repos
(`buildUpgradeClients()`). Failing on those would make the gate unusable. Run
with --unresolved to read the list; treat it as a shortlist, like the findings.

⚠ WHAT THIS DOES NOT COVER, stated plainly because HK-7 says an overstated
checker is worse than none:

  * Only JavaScript symbols written as `name()` inside backticks in a doc. A
    claim in prose with no backticks is invisible to it.
  * Only symbols declared as `function name(`. Arrow functions assigned to
    consts, object methods and class methods are not resolved.
  * Reachability is same-file (a caller that is itself called) OR a cross-file
    `.name(` member call anywhere in RRV8/. That member test is deliberately
    generous and cannot be traced to a declaration textually, so a symbol whose
    name collides with an unrelated method elsewhere will be cleared. That trades
    a false NEGATIVE for a false POSITIVE, which is the right way round for a
    shortlist -- but it means every finding still needs a human to confirm, and
    it is a SHORTLIST, not a verdict.
  * Nothing about Java, SQL, or endpoint behaviour. VLC-33's `rebuild-gl` defect
    (API.md naming a caller that did not exist) is the same disease in a
    language this does not read.

    ⚠ EXTENDING INTO JAVA WAS MEASURED AND REFUSED, 2026-09-05, on two counts.
    YIELD: across every tracked .md in five repos, exactly 2 positive claims
    resolve to a Java method (`buildUpgradeClients()`, `readBoardExec()`) and
    BOTH are true -- real callers at DeploymentController:201,444 and
    SsisDeployService:2223,2311. Zero defects for the whole extension.
    VIABILITY: Java reachability here is not a caller count. A probe over 1,618
    method declarations at git HEAD put 26% at "zero in-source callers", then
    3 of the first 3 samples checked by hand turned out to HAVE callers --
    `SecurityConfig::writeUnauthorizedJson` and `::isBearerRequest` are invoked
    as method references (no parens for a regex to find) and
    `parseCompaniesIds` was mis-scored because `return name(` matched the
    declaration pattern. A model that got its first three spot-checks wrong
    would produce a checker that is mostly noise, which HK-7 says is the same
    outcome as no checker. Reopen only with a real parser, not a regex.
  * Extending to SQL buys 0 claims and to arrow / const-function / object- and
    class-method JS declarations buys 1, both measured the same day over the
    same corpus. Neither is worth the coverage-bound text it would cost.

So: a clean run means "none of the JS wiring claims this can see are false". It
does not mean the docs are accurate.
"""
import argparse
import io
import os
import re
import subprocess
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Docs that make wiring claims about the V8 surface. Kept as the FALLBACK set;
# doc_paths() prefers every tracked .md in the repo. See that function.
DOC_GLOBS = [
    ("RRV8", ".md"),
    (os.path.join("docs", "plans"), ".md"),
]

# The source the claims are about.
SRC_DIRS = [("RRV8", (".html", ".js"))]

# A positive wiring verb within this many characters of the symbol.
WINDOW = 140
POSITIVE = re.compile(
    r"\b(call(?:s|ed|er|ers|ing)?|invoke[sd]?|wired|wire[sd]|gains?|consume[sd]?|"
    r"reads?|drives?|driven by|hooked|used by|uses)\b", re.I)
NEGATIVE = re.compile(
    r"(not wired|isn't wired|is a stub|a stub|no caller|zero call|never called|"
    r"not built yet|does not exist yet|doesn't exist yet|not yet wired)", re.I)

SYMBOL = re.compile(r"`(_?[a-zA-Z][A-Za-z0-9_$]*)\(\)`")


def read(path):
    return io.open(path, encoding="utf-8", errors="replace").read()


def doc_paths():
    """Every tracked .md in the repo, repo-relative.

    Widened 2026-09-05 from RRV8/*.md + docs/plans/*.md. Measured before
    changing it: the two original directories held 52 of the repo's 59 positive
    wiring claims, and the 7 outside them sit in AnalysisGuides/, docs/ and
    specs/. 5 of those 7 name symbols this resolver already handles, so the
    widening is a glob change that buys 5 more checked claims and no new
    machinery.

    ⚠ CONSEQUENCE, STATED BECAUSE IT IS A REAL BEHAVIOUR CHANGE: only TRACKED
    docs are seen now. A brand-new .md that has not been `git add`ed is
    invisible to this tool, where the old os.listdir walk would have read it.
    That is the right trade -- the gate should check what ships -- but a claim
    written this morning is not covered until it is staged.

    ⚠ AND THE HONEST YIELD OF THIS WIDENING IS ZERO, measured 2026-09-05. It
    took the doc corpus from 113 files to 149 and the claim count did not move:
    52 seen before, 52 after. The 7 extra claims the sizing pass found live in
    `RapidReconciler-Agent/specs/`, a sibling repo this tool does not read and
    should not, because it resolves against RRV8 JS only. Kept anyway, since it
    removes a silent scope limit at no cost -- but it bought nothing today and
    saying otherwise would overstate the coverage.

    ⚠ `git ls-files` RATHER THAN A FILESYSTEM WALK, DELIBERATELY. A background
    agent's git worktree can live under the gitignored `.claude/worktrees/`,
    carrying a full second copy of RRV8/*.md. A walk scans it and reports every
    claim twice; the index does not see it. Measured on 2026-09-05 with such a
    worktree present: `git ls-files '*.md'` returned 0 paths under `.claude/`,
    while a recursive grep returned the duplicates.
    """
    try:
        out = subprocess.run(["git", "ls-files", "*.md"], cwd=ROOT,
                             capture_output=True, text=True,
                             encoding="utf-8", errors="replace").stdout
        paths = [p.strip() for p in out.split("\n") if p.strip()]
        if paths:
            return sorted(paths)
    except (OSError, subprocess.SubprocessError):
        pass
    out = []
    for rel, ext in DOC_GLOBS:
        base = os.path.join(ROOT, rel)
        if os.path.isdir(base):
            out += [os.path.join(rel, n) for n in sorted(os.listdir(base))
                    if n.endswith(ext)]
    return out


def load_sources():
    """{path: code-with-line-comments-stripped} for the V8 surface."""
    out = {}
    for rel, exts in SRC_DIRS:
        base = os.path.join(ROOT, rel)
        if not os.path.isdir(base):
            continue
        for name in sorted(os.listdir(base)):
            if not name.endswith(exts):
                continue
            code = read(os.path.join(base, name))
            # ⚠ HTML COMMENTS MUST GO, and finding that out cost a wrong answer
            # in both directions. Run against a fixture reproducing the pre-UI-174
            # ladder, the first version of this tool reported `canAccountant()`
            # as REACHABLE with 2 call sites -- one of which was the sentence
            # "canAccountant() defined" inside an <!-- --> comment describing the
            # defect. A doc-claim checker that reads prose about a symbol as a
            # call to it will clear exactly the files that discuss their own
            # wiring, which is every file this tool exists to check.
            if name.endswith(".html"):
                code = re.sub(r"<!--.*?-->", " ", code, flags=re.S)
            # Line comments -- UI-170. A block-comment stripper has mangled
            # offsets in this codebase before, so /* */ is deliberately left.
            code = re.sub(r"^[ \t]*//.*$", "", code, flags=re.M)
            out[os.path.join(rel, name)] = code
    return out


def declared_in(code, name):
    return re.search(r"function\s+" + re.escape(name) + r"\s*\(", code) is not None


def call_indexes(code, name):
    """Byte offsets of real invocations of `name` -- not its declaration."""
    hits = []
    for m in re.finditer(r"(^|[^\w.$])" + re.escape(name) + r"\s*\(", code):
        at = m.index if hasattr(m, "index") else m.start() + len(m.group(1))
        if re.search(r"function\s+$", code[max(0, at - 12):at]):
            continue
        hits.append(at)
    return hits


def enclosing(code, idx):
    """Name of the innermost `function X(...) {` whose BODY contains idx.

    ⚠ THE FIRST VERSION TOOK THE NEAREST PRECEDING DECLARATION, WHICH IS NOT THE
    SAME THING AND INVERTED A CONTROL. A module-scope `applyViewRole();` written
    just after `function applyViewRole() { ... }` resolved to itself as its own
    host, so the call was discarded as self-recursion and a correct doc claim was
    reported as a defect. "The last function declared before this point" and "the
    function this point is inside" only agree when nothing has closed in between.
    Brace matching is what tells them apart.

    Braces inside string literals are not excluded, so a `'{'` in a string can
    skew the depth. That is a shortlist tool's tolerance, not a parser's -- and
    it is why a finding here is confirmed by hand before it is believed.
    """
    best = None
    for m in re.finditer(r"function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{", code):
        open_at = code.index("{", m.end() - 1)
        if open_at > idx:
            break
        depth = 0
        close_at = None
        for i in range(open_at, len(code)):
            c = code[i]
            if c == "{":
                depth += 1
            elif c == "}":
                depth -= 1
                if depth == 0:
                    close_at = i
                    break
        if close_at is not None and open_at < idx < close_at:
            best = m.group(1)      # innermost wins: later matches are nested
    return best


def reachable_calls(code, name):
    """Invocations of `name` whose containing function is itself invoked."""
    good = 0
    for at in call_indexes(code, name):
        host = enclosing(code, at)
        if host is None:            # module scope -- always runs
            good += 1
        elif host != name and len(call_indexes(code, host)) >= 1:
            good += 1
    return good


# ⚠ ADDED AFTER THE FIRST RUN, WHICH PRODUCED A FALSE POSITIVE THE HEADER HAD
# ALREADY PREDICTED. `summary()` is declared in RRV8/config.js, has zero
# same-file callers, and is called from home.html:7002 and
# inventory-account-rollforward.html:592 as `RRV8.rollForward.summary(...)`.
# Exporting onto a namespace object is the NORMAL shape in this codebase, so
# same-file-only reachability would report the ordinary case as a defect -- and
# a checker whose findings are mostly noise gets ignored, which is the same
# outcome as no checker. A member call cannot be traced to a declaration
# textually, so this is deliberately generous: any `.name(` anywhere in the
# source set counts. That trades a false NEGATIVE (a doc claiming a symbol is
# wired when only an unrelated same-named method is called) for the false
# POSITIVE, which is the right way round for a shortlist.
MEMBER_CALL = "member"


def called_as_member(sources, name):
    pat = re.compile(r"\.\s*" + re.escape(name) + r"\s*\(")
    return [p for p, code in sources.items() if pat.search(code)]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--negatives", action="store_true",
                    help="also list the easy third (negative-phrasing claims)")
    ap.add_argument("--unresolved", action="store_true",
                    help="list the claims naming a symbol this tool cannot "
                         "resolve at all (counted by default, listed only here)")
    ap.add_argument("--quiet", action="store_true")
    args = ap.parse_args()

    sources = load_sources()
    findings = []
    unresolved = []
    checked = 0

    for doc in doc_paths():
        path = os.path.join(ROOT, doc)
        if not os.path.isfile(path):
            continue
        text = read(path)
        for m in SYMBOL.finditer(text):
            sym = m.group(1)
            around = text[max(0, m.start() - WINDOW): m.end() + WINDOW]
            if NEGATIVE.search(around) or not POSITIVE.search(around):
                continue
            line = text[:m.start()].count("\n") + 1
            ctx = " ".join(around.split())[:150]
            owners = [p for p, code in sources.items() if declared_in(code, sym)]
            if not owners:
                # ⚠ NOT a `continue` any more. This bucket held the worse half
                # of HK-7's defect class in silence for two days -- a doc
                # naming a symbol declared NOWHERE. See the header.
                unresolved.append((doc, line, sym, ctx))
                continue
            checked += 1
            members = called_as_member(sources, sym)
            if members:
                continue            # exported and called cross-file
            if all(reachable_calls(sources[p], sym) == 0 for p in owners):
                findings.append((doc, line, sym, owners, ctx))

    if args.quiet:
        return 1 if findings else 0

    print("doc-claim-check")
    print("  positive wiring claims seen         %d" % (checked + len(unresolved)))
    print("  ...resolvable, and checked          %d" % checked)
    print("  ...naming an UNREACHABLE symbol     %d   <- findings, sets exit code"
          % len(findings))
    print("  ...UNRESOLVABLE by this tool        %d   <- informational; --unresolved"
          % len(unresolved))
    print()

    for doc, line, sym, owners, ctx in findings:
        print("  %s:%d  `%s()`" % (doc, line, sym))
        print("        declared in: %s" % ", ".join(owners))
        print("        reachable call sites: 0")
        print("        claim: ...%s...\n" % ctx)

    if args.unresolved:
        print("  --- claims naming a symbol this tool cannot resolve ---")
        print("  Expect SQL builtins, plan-doc placeholders and Java symbols in\n"
              "  the sibling repos. What matters here is a JS symbol that ought\n"
              "  to exist and does not: that is HK-7's worse half.\n")
        for doc, line, sym, ctx in unresolved:
            print("  %s:%d  `%s()`" % (doc, line, sym))
            print("        ...%s...\n" % ctx)

    if args.negatives:
        print("  --- the easy third: negative-phrasing claims, for manual re-check ---")
        for rel, ext in DOC_GLOBS:
            base = os.path.join(ROOT, rel)
            if not os.path.isdir(base):
                continue
            for name in sorted(os.listdir(base)):
                if not name.endswith(ext):
                    continue
                for n, ln in enumerate(read(os.path.join(base, name)).split("\n"), 1):
                    if NEGATIVE.search(ln):
                        print("  %s:%d  %s" % (os.path.join(rel, name), n,
                                               " ".join(ln.split())[:120]))

    print("  Coverage bound: backticked `name()` symbols in every TRACKED .md in\n"
          "  this repo, resolved only against `function name(` in RRV8/*.{html,js}.\n"
          "  Reachable = a same-file caller that is itself called, OR any cross-file\n"
          "  `.name(` member call. A finding is a SHORTLIST entry to confirm by hand,\n"
          "  and a clean run does NOT mean the docs are accurate -- it means none of\n"
          "  the JS wiring claims this can SEE are false. The unresolvable count above\n"
          "  is the size of what it cannot see; Java and SQL are measured and\n"
          "  deliberately out of scope. See this file's header for why.")
    return 1 if findings else 0


if __name__ == "__main__":
    sys.exit(main())
