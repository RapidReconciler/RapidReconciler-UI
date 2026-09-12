#!/usr/bin/env python3
"""v8-callsites.py -- enumerate every server call V8 makes, and gate the one
defect class that a session provably cannot see.

    python Tools/v8-callsites.py                 # gate: exit 1 on a failure
    python Tools/v8-callsites.py --report        # human-readable inventory
    python Tools/v8-callsites.py --json <path>   # write the manifest for the prober

WHY THIS EXISTS
===============

VLC-59. Between Valc #241 (2026-09-04) and #248 (2026-09-06), every customer
administrator got HTTP 403 on the ENTIRE V8 administration surface -- nine
endpoints across four pages. It ran for two days and nobody noticed, because
`valc_operator` is true for exactly two of six users, and the gate that broke
could only be noticed by someone WITHOUT that grant. Both people who use the
product daily hold it.

The sweep that was supposed to cover this (HK-11 S1) counted ENDPOINTS and the
gates in front of them. It never enumerated CLIENT CALL SITES, so it was
correct about everything it looked at and blind to the defect. VLC-62 then
found a FIFTH page still on the operator prefix that a hand enumeration had
missed. Twice in two rows, a control beat a list somebody wrote out.

This file is the missing noun: the client call sites, enumerated mechanically,
with the routing each one resolves to and the client-side guard in front of it.

WHAT IT ASSERTS
===============

A0  THE ENUMERATION IS NOT VACUOUS. Every source file tokenized, and the call
    surface is above a floor. A1 "passes" trivially against zero call sites, so
    without this a tokenizer that silently stopped seeing anything, or a glob
    that stopped matching, would turn the whole gate green. That is the exact
    shape HK-11's sweep 5 found in check-js-syntax.yml, which is why that
    workflow asserts a non-zero file count before it trusts a verdict.

A1  NO CALL SITE ROUTES TO THE OPERATOR PREFIX. `/api/v1/admin/**` requires
    ROLE_VALC_OPERATOR (SecurityConfig:207). V8 is a customer surface, so any
    call site under it is 403 for every customer by construction. This is
    VLC-59 expressed as a gate rather than as a story.

A2  EVERY DYNAMIC AREA IS RESOLVED, AND NO RESOLUTION IS STALE. A call site
    whose area is a variable cannot be classified by reading it, so each one
    has a hand-written entry in v8-callsite-overrides.json giving the literal
    it builds and why. An unresolved site fails; so does an override whose
    call site no longer exists, because a stale exemption is how a gate goes
    quiet without anyone deciding it should.

A3  THE ENUMERATION IS CLOSED. Every `api/v1/` string literal in executable
    position must be attributed to a call site this file found. rrFetch is NOT
    the only way V8 talks to a server -- there are nine other fetch wrappers
    plus bare `fetch()`, and `admin-users.html:1352` builds a VALC URL by hand.
    An enumerator that knew only rrFetch would have missed the tenant roles,
    invite, role and assignment endpoints entirely and reported a clean sweep.
    A3 is what stops that: if a VALC path exists that no known call shape
    explains, the gate fails instead of passing quietly.

A5  EVERY VALC PATH IS ROUTABLE BY rrFetch. Reported, not failed. rrFetch picks
    VALC-vs-agent purely from RR_VALC_PREFIXES, so a VALC path outside that
    table works only while its call site hand-builds the URL; move that call to
    rrFetch -- the shape 22 of 23 files already use -- and it silently goes to
    the data services agent, which 404s. Found on the first run:
    /api/v1/messages and /api/v1/messages/{id}/dismiss.

A4  HARNESS CONTROL, RUN LAST. VLC-59's defect is fixed, so A1 has nothing to
    catch today and a broken A1 would look identical to a clean repo. The
    control reconstructs the pre-fix state in memory -- rewrites one page's
    `api/v1/tenant/` to `api/v1/admin/` -- and requires A1 to catch it. A check
    only ever run against fixed code is untested.

WHAT IT DOES NOT DO, NAMED
==========================

  * It does not run anything. Whether a call site actually answers for a
    least-privileged user is Tools/persona-probe.py, which needs a live VALC,
    live agents and Postgres. This half needs none of them and can run in CI.
  * The client-side guard it records is a HEURISTIC, and it is deliberately
    biased toward reporting. See classify_guard().
  * A3's closure covers VALC paths only. Agent paths have no distinctive
    prefix to count against, so there is NO equivalent proof that the agent
    half of the enumeration is complete. A new agent call shape that does not
    fit the name rule in is_fetch_name() would be missed silently.
  * It says nothing about whether an endpoint's answer is CORRECT. Only about
    who is allowed to ask.
"""

import argparse
import io
import json
import os
import re
import sys
import tempfile

try:
    import esprima
except ImportError:                                   # pragma: no cover
    sys.stderr.write("v8-callsites: needs the `esprima` package\n")
    raise SystemExit(2)

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
RRV8 = os.path.join(REPO, "RRV8")
OVERRIDES = os.path.join(HERE, "v8-callsite-overrides.json")

# Matches parsecheck.py so the two agree on what counts as JavaScript.
_SCRIPT = re.compile(r"<script(?![^>]*\bsrc=)([^>]*)>(.*?)</script>", re.S | re.I)
_NUM_SEP = re.compile(r"(?<=\d)_(?=\d)")

# The operator half. Anything under it needs ROLE_VALC_OPERATOR, which no
# customer holds -- so a V8 call site here is 403 for every customer.
OPERATOR_PREFIX = "api/v1/admin/"

# Identifier names that gate on the administrator claim. Read out of the
# source, not invented: home.html:3868 `isAdmin`, admin-users.html:947
# `admClaim` / :956 `adminGateOpen`.
ADMIN_GUARD_NAMES = ("isAdmin", "admClaim", "adminGateOpen")

# A path shaped like an API route rather than a static asset.
_PATHISH = re.compile(r"^/?[a-z][a-z0-9]*(?:[/-][A-Za-z0-9_.:?=&%-]*)*$")

# Header VALUES look exactly like paths to a pattern match, and the first pass
# of this file reported `application/json` and
# `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` as agent
# endpoints. They are Accept / Content-Type values sitting in the same init
# object. Excluded by their registry trees rather than by a blanket rule, so a
# real endpoint under one of these names would still be seen.
_MIME = re.compile(r"^(application|text|image|audio|video|font|multipart)/")

# Every VALC API path starts here, and no agent path does -- rrFetch builds an
# agent URL as base + '/' + area with no prefix at all. That makes the prefix a
# stronger routing signal than RR_VALC_PREFIXES, which is only the subset
# rrFetch happens to know about (see assertion A5).
API_PREFIX = "api/v1/"

# FLOORS, not expected values. Measured 2026-09-07 at wire-up: 263 call sites
# across 23 files, 46 of them VALC-routed. These are set well below that on
# purpose -- they exist to catch the enumeration COLLAPSING (a tokenizer that
# stopped seeing anything, a glob that stopped matching, a refactor that renamed
# every wrapper), not to pin a number that legitimate work will move.
#
# If real work takes the surface below a floor, lower the floor deliberately and
# say why in the commit. Do not delete the check: A1 passes trivially against
# zero call sites, and a gate that cannot tell "clean" from "blind" is worse
# than no gate, because it reports confidence it has not earned.
MIN_CALL_SITES = 150
MIN_VALC_SITES = 20
MIN_FILES = 15


# ---------------------------------------------------------------------------
#  source -> token streams
# ---------------------------------------------------------------------------

def script_units(path):
    """Every JavaScript region of one file, as (line_offset, source)."""
    src = io.open(path, encoding="utf-8").read()
    if path.lower().endswith(".js"):
        return [(0, src)]
    out = []
    for m in _SCRIPT.finditer(src):
        attrs, body = m.group(1).lower(), m.group(2)
        if "type=" in attrs and not re.search(
                r'type=["\']?(text/javascript|module|application/javascript)', attrs):
            continue                                  # a data island is not code
        out.append((src[: m.start(2)].count("\n"), body))
    return out


def tokenize(src):
    """Tokens with locations, comments already gone.

    tokenize() rather than parse() on purpose: esprima 4 is ES2017 and cannot
    PARSE `?.` or `??`, but it TOKENIZES them fine, and a token stream is all
    this needs. Numeric separators (`6_000_000`, inventory-transactions.html)
    are the one shape it cannot even tokenize, so they are removed first --
    dropping a character, never a line, so every reported line stays true.
    """
    return esprima.tokenize(_NUM_SEP.sub("", src), options={"loc": True})


def source_files():
    return [os.path.join(RRV8, n) for n in sorted(os.listdir(RRV8))
            if n.lower().endswith((".html", ".js"))]


# ---------------------------------------------------------------------------
#  routing tables, read from config.js rather than copied
# ---------------------------------------------------------------------------

def read_string_array(toks, name):
    """The string literals of `<name> = [ ... ]`, or None if absent."""
    n = len(toks)
    for i in range(n - 2):
        if toks[i].type == "Identifier" and toks[i].value == name:
            j = i + 1
            while j < n and not (toks[j].type == "Punctuator" and toks[j].value in "=[;"):
                j += 1
            if j < n and toks[j].type == "Punctuator" and toks[j].value == "=":
                while j < n and not (toks[j].type == "Punctuator" and toks[j].value == "["):
                    if toks[j].type == "Punctuator" and toks[j].value == ";":
                        break
                    j += 1
                if j < n and toks[j].value == "[":
                    out, k = [], j + 1
                    while k < n and not (toks[k].type == "Punctuator" and toks[k].value == "]"):
                        if toks[k].type == "String":
                            out.append(str(toks[k].value).strip("'\""))
                        k += 1
                    return out
    return None


def routing_tables():
    """RR_VALC_PREFIXES / RR_TEST_AGENT_AREAS / RR_TEST_AGENT_PREFIXES.

    Read out of the shipping config.js. A copy in this file would be a second
    producer of the same fact, and would go stale the first time somebody adds
    a prefix -- see feedback_one_producer_per_figure.
    """
    cfg = os.path.join(RRV8, "config.js")
    toks = tokenize(io.open(cfg, encoding="utf-8").read())
    tables = {}
    for name in ("RR_VALC_PREFIXES", "RR_TEST_AGENT_AREAS", "RR_TEST_AGENT_PREFIXES"):
        got = read_string_array(toks, name)
        if got is None:
            raise RuntimeError(
                "config.js no longer defines %s -- routing cannot be classified, "
                "and guessing it would make every verdict below meaningless" % name)
        tables[name] = got
    if OPERATOR_PREFIX not in tables["RR_VALC_PREFIXES"]:
        # Not fatal: dropping it would route a stray operator call to the AGENT
        # instead of VALC, which is a different bug. Say so rather than
        # silently changing what A1 means.
        sys.stderr.write("v8-callsites: NOTE %s is no longer in RR_VALC_PREFIXES\n"
                         % OPERATOR_PREFIX)
    return tables


# ---------------------------------------------------------------------------
#  guard classification
# ---------------------------------------------------------------------------

def page_admin_gate(toks):
    """True when this file carries a page-level administrator gate that is
    actually WIRED, not merely defined.

    The four admin pages use TWO shapes for the same gate, and both were read
    out of the source rather than assumed:

      adminGateOpen()  defined and called   -- admin-users.html:956 / :980,
                                                admin-companies.html:619 / :980
      admClaim() inline in the boot path    -- admin-complex-passwords.html:522,
        + haltPage('js-halt-claim')            admin-data-service.html:380

    Either way the page "issues no calls at all" for a non-admin
    (admin-users.html:955). So the test is: the page reads the admin claim
    (`admClaim`) AND something halts on it -- a called `adminGateOpen`, or the
    `js-halt-claim` notice this codebase uses for exactly that stop.

    Requiring the gate to be REACHED, not just present, is the loadAiPlan
    lesson: a guard nothing invokes reads as protection to anyone grepping and
    protects nothing.
    """
    reads_claim = False
    gate_called = False
    halt_notice = False
    n = len(toks)
    for i in range(n - 1):
        t = toks[i]
        if t.type == "Identifier" and t.value == "admClaim":
            reads_claim = True
        if t.type == "Identifier" and t.value == "adminGateOpen":
            is_def = i > 0 and toks[i - 1].type == "Keyword" and toks[i - 1].value == "function"
            is_call = toks[i + 1].type == "Punctuator" and toks[i + 1].value == "("
            if is_call and not is_def:
                gate_called = True
        if t.type == "String" and "js-halt-claim" in str(t.value):
            halt_notice = True
    return reads_claim and (gate_called or halt_notice)


def classify_guard(toks, idx, has_page_gate):
    """What stands between a non-admin and this call site.

    BIASED TOWARD REPORTING, ON PURPOSE. The enclosing-function region is taken
    by scanning BACKWARD to the nearest `function` keyword, which for a call
    inside a callback yields the CALLBACK's body -- a smaller region than the
    real enclosing function. A smaller region finds fewer guards, so the bias is
    toward calling a site unguarded and printing it. A false report is a line
    somebody reads; a false exemption is the vacuous-gate shape that this
    codebase has paid for repeatedly.
    """
    if has_page_gate:
        return "page-admin"
    start = 0
    for j in range(idx, -1, -1):
        if toks[j].type == "Keyword" and toks[j].value == "function":
            start = j
            break
    for j in range(start, idx):
        if toks[j].type == "Identifier" and toks[j].value in ADMIN_GUARD_NAMES:
            return "fn-admin"
    return "none"


# ---------------------------------------------------------------------------
#  call-site enumeration
# ---------------------------------------------------------------------------

def _call_region(toks, open_paren):
    """Token indices [open_paren, close] for a balanced call argument list."""
    depth, j, n = 0, open_paren, len(toks)
    while j < n:
        t = toks[j]
        if t.type == "Punctuator" and t.value in "([{":
            depth += 1
        elif t.type == "Punctuator" and t.value in ")]}":
            depth -= 1
            if depth == 0:
                return open_paren, j
        j += 1
    return open_paren, n - 1


def _query_keys_in(toks, lo, hi):
    """Keys of rrFetch's `query:` option, as a `k={}` template.

    rrFetch puts the query in the OPTIONS object, not the area:
        rrFetch('api/v1/tenant/license-usage', { query: { database: dbName } })
    so a resolver reading only the area sees no query at all, and the prober
    then called that endpoint without its required parameter and got 400 --
    a status that says nothing about authorization while filling the column.
    """
    for j in range(lo, hi - 2):
        if toks[j].type == "Identifier" and toks[j].value == "query" \
                and toks[j + 1].type == "Punctuator" and toks[j + 1].value == ":" \
                and toks[j + 2].type == "Punctuator" and toks[j + 2].value == "{":
            keys, k, depth = [], j + 2, 0
            while k < hi:
                t = toks[k]
                if t.type == "Punctuator" and t.value == "{":
                    depth += 1
                elif t.type == "Punctuator" and t.value == "}":
                    depth -= 1
                    if depth == 0:
                        break
                elif depth == 1 and t.type in ("Identifier", "String") \
                        and k + 1 < hi and toks[k + 1].type == "Punctuator" \
                        and toks[k + 1].value == ":":
                    keys.append(str(t.value).strip("'\""))
                k += 1
            return "&".join("%s={}" % x for x in keys)
    return ""


def _method_in(toks, lo, hi):
    for j in range(lo, hi - 2):
        if toks[j].type == "Identifier" and toks[j].value == "method" \
                and toks[j + 1].type == "Punctuator" and toks[j + 1].value == ":" \
                and toks[j + 2].type == "String":
            return str(toks[j + 2].value).strip("'\"").upper()
    return None


def join_url_literals(toks, lo, hi):
    """Rebuild a concatenated URL expression as a TEMPLATE.

        'api/v1/tenant/users/' + encodeURIComponent(id) + '/assignments'
          ->  api/v1/tenant/users/{}/assignments

    Taking only the FIRST literal produced `api/v1/tenant/users/`, and the live
    prober then appended an id and probed `/api/v1/tenant/users/84` -- which
    returned 405, because TenantUsersController has no GET there. The endpoint
    the page actually calls is `/users/{id}/assignments`, and the probe was
    reporting a status for a URL V8 never requests. A wrong URL answering
    plausibly is worse than no coverage, because it fills the column with a
    number nobody questions.

    `{}` marks a runtime value the caller supplies. The prober substitutes it.
    """
    parts, gap_pending = [], False
    for j in range(lo, hi):
        t = toks[j]
        if t.type == "String":
            lit = str(t.value).strip("'\"")
            if gap_pending and parts:
                # ⚠ A `{}` immediately before a literal that OPENS a query
                # string is spurious. The shape is
                #     '/api/v1/ai/health' + (dbq ? '?db=' + enc(dbq) : '')
                # where the identifier between the two literals is the
                # CONDITION, not a path segment. Left in, it produced
                # `api/v1/ai/health{}` -- a path V8 never requests, probed and
                # reported as a 404 for two runs before this was noticed.
                if not lit.startswith(("?", "&")):
                    parts.append("{}")
            parts.append(lit)
            gap_pending = False
        elif t.type in ("Identifier", "Numeric", "Keyword"):
            # any expression between two literals is a runtime value
            if parts:
                gap_pending = True
    # A TRAILING runtime value is a path segment too, and dropping it is what
    # turned `rrFetch('api/v1/tenant/users/' + enc(id), {method:'PUT'})` into
    # `api/v1/tenant/users/` -- which has no handler at all, so the probe
    # reported 404 for an endpoint that works.
    if gap_pending and parts:
        parts.append("{}")
    return "".join(parts)


def backward_assignment_template(toks, idx, ident):
    """The URL TEMPLATE of the nearest preceding assignment to `ident`.

    admin-users.html:1352 is
        const url = (RR_CONFIG.valcBase || '...') + '/api/v1/tenant/roles';
        fetch(url, { headers: prodHeaders(), cache: 'no-store' })
    so the path is one line ABOVE the call and nothing inside the call region
    names it. This resolves it mechanically instead of asking for a hand-written
    exemption: scan back to the nearest `<ident> =` within the enclosing
    function and template that statement.

    It also unlocks the two-level shape at admin-users.html:1541
        const base = valcBase + '/api/v1/tenant/users/' + id;
        fetch(base + '/role',        { method: 'PUT' })
        fetch(base + '/assignments', { method: 'PUT' })
    where neither half is a whole path. The caller composes this template with
    the call region's own literals -- `api/v1/tenant/users/{}` + `/role`.
    Before that composition existed, both resolved to `api/v1/tenant/users/`,
    an endpoint with no handler, and the prober reported 404 for two endpoints
    that work.

    Bounded by the enclosing `function` keyword so it cannot reach across a
    function boundary and attribute some unrelated variable of the same name.
    """
    if not ident:
        return ""
    stop = 0
    for j in range(idx, -1, -1):
        if toks[j].type == "Keyword" and toks[j].value == "function":
            stop = j
            break
    for j in range(idx - 1, stop, -1):
        if toks[j].type == "Identifier" and toks[j].value == ident \
                and j + 1 < len(toks) and toks[j + 1].type == "Punctuator" \
                and toks[j + 1].value == "=":
            k = j + 2
            while k < len(toks):
                t = toks[k]
                if t.type == "Punctuator" and t.value == ";":
                    break
                k += 1
            return join_url_literals(toks, j + 2, k)
    return ""


def is_fetch_name(name):
    """Any of the ten call shapes V8 actually uses.

    Measured 2026-09-07 across RRV8/: rrFetch, agentFetch, rlgFetch,
    fireBulkFetch, _intgFetch, valcFetch, _perpFetch, _auditFetch,
    _analystModelRoutesFetch, and bare fetch. The name-shape rule covers all
    ten; assertion A3 is what catches an eleventh that does not fit it.
    """
    return name == "fetch" or name.endswith(("Fetch", "fetch"))


def enumerate_file(path, tables, errors=None):
    """Every call site in one file.

    A unit that will not tokenize is recorded in `errors` rather than raised.
    A traceback would still fail the run, but it would fail it as a crash --
    and the count of files actually READ is what assertion A0 needs in order to
    tell a clean repo from a blind enumerator.
    """
    name = os.path.basename(path)
    sites, api_literals = [], []
    for (off, src) in script_units(path):
        try:
            toks = tokenize(src)
        except Exception as exc:
            if errors is None:
                raise
            errors.append("%s inline script at line %d: %s"
                          % (name, off + 1, str(exc)[:140]))
            continue
        has_gate = page_admin_gate(toks)
        n = len(toks)
        for i in range(n - 1):
            t = toks[i]
            if t.type == "String" and "api/v1/" in str(t.value):
                # esprima's String token .value INCLUDES the quote characters.
                # Leaving them on made every literal fail to match the same
                # literal collected (stripped) from a call region, so A3
                # reported all 54 as orphans -- a gate failing on its own
                # formatting rather than on the code.
                api_literals.append({"file": name, "line": t.loc.start.line + off,
                                     "text": str(t.value).strip("'\"")})
            if t.type != "Identifier" or not is_fetch_name(t.value):
                continue
            if not (toks[i + 1].type == "Punctuator" and toks[i + 1].value == "("):
                continue
            if i > 0 and toks[i - 1].type == "Keyword" and toks[i - 1].value == "function":
                continue                              # a definition, not a call
            if i > 0 and toks[i - 1].type == "Punctuator" and toks[i - 1].value == ".":
                continue                              # a method on some object
            lo, hi = _call_region(toks, i + 1)
            # FIRST ARGUMENT ONLY. Collecting every string in the whole call
            # region swept in the init object's header values, and the report
            # listed `application/json` as an agent endpoint. The url is
            # argument one; everything past the first depth-1 comma is options.
            arg1_end, depth = hi, 0
            for j in range(lo, hi):
                t2 = toks[j]
                if t2.type == "Punctuator" and t2.value in "([{":
                    depth += 1
                elif t2.type == "Punctuator" and t2.value in ")]}":
                    depth -= 1
                elif t2.type == "Punctuator" and t2.value == "," and depth == 1:
                    arg1_end = j
                    break
            strings = [str(toks[j].value).strip("'\"")
                       for j in range(lo, arg1_end) if toks[j].type == "String"]
            url_template = join_url_literals(toks, lo, arg1_end)
            first_arg = toks[i + 2] if i + 2 < n else None
            assigned = ""
            if first_arg is not None and first_arg.type == "Identifier":
                assigned = backward_assignment_template(toks, i, str(first_arg.value))
                # COMPOSE. arg1 is `base + '/role'`, so the identifier's own
                # template is the prefix and the call region's literals are the
                # suffix. Concatenating in this order is what turns two
                # half-paths into the one the page actually requests.
                if assigned and url_template:
                    url_template = assigned + url_template
                elif assigned:
                    url_template = assigned
            sites.append({
                "file": name,
                "line": t.loc.start.line + off,
                "caller": t.value,
                "method": _method_in(toks, lo, hi) or "GET",
                "argType": first_arg.type if first_arg is not None else "None",
                "argValue": (str(first_arg.value).strip("'\"")
                             if first_arg is not None and first_arg.type == "String"
                             else (str(first_arg.value) if first_arg is not None else "")),
                "strings": strings,
                "urlTemplate": url_template,
                "optQuery": _query_keys_in(toks, arg1_end, hi),
                "assignedTemplate": assigned,
                "guard": classify_guard(toks, i, has_gate),
            })
    return sites, api_literals


# ---------------------------------------------------------------------------
#  path + routing resolution
# ---------------------------------------------------------------------------

def _split(url):
    """(path, query) with the leading slash gone.

    The query is kept rather than discarded: `api/v1/tenant/license-usage`
    without `?database=` answers 400 MISSING PARAMETER, and a column of 400s
    tells a reader nothing about authorization. Keeping the key lets the prober
    supply a real value and get a real answer.
    """
    if url is None:
        return None, ""
    url = url.lstrip("/")
    if "?" in url:
        p, q = url.split("?", 1)
        return p, q
    return url, ""


def resolve_path(site, overrides):
    """The server path this site hits, and how it was worked out.

    Three shapes, in order of how much is inferred:
      literal   -- rrFetch('inventory/status')          the argument says it
      override  -- rrFetch(_ctxUrl)                     a human read it once
      derived   -- fetch(base + '/api/v1/tenant/roles') the path literal in the
                   argument region, which is the whole point of A3
    """
    tmpl = site.get("urlTemplate") or ""

    if site["caller"] == "rrFetch":
        if site["argType"] == "String":
            # The TEMPLATE, not the first literal. rrFetch is called with a
            # concatenation in several places -- 'api/v1/tenant/users/' +
            # encodeURIComponent(id) + '/assignments' -- and taking argValue
            # gave `api/v1/tenant/users/`, an endpoint that does not exist.
            return _split(tmpl or site["argValue"]) + ("literal",)
        key = "%s::%s" % (site["file"], site["argValue"])
        if key in overrides:
            return _split(overrides[key]["area"]) + ("override",)
        return (None, "", "unresolved")

    if API_PREFIX in tmpl:
        # A hand-built URL is base + path, so the template opens with the base
        # expression's own literals; keep from the api prefix onward.
        how = "assigned" if site.get("assignedTemplate") else "derived"
        return _split(tmpl[tmpl.index(API_PREFIX):]) + (how,)
    for s in site["strings"]:
        if _MIME.match(s):
            continue
        if s.startswith("data/") or s.endswith((".json", ".bin")):
            return (None, "", "static")
        if s in ("poll", "health") or (_PATHISH.match(s) and "/" in s.strip("/")):
            return _split(s) + ("derived",)
    return (None, "", "opaque")


def route_of(path, tables):
    """valc | agent-new | agent-v359 -- where the request actually lands.

    THE AGENT HALF SPLITS, AND CONFLATING IT PRODUCES FALSE FINDINGS. rrFetch
    sends an area to the green-field data-services agent when it is in
    RR_TEST_AGENT_AREAS / _PREFIXES, and otherwise to the v359 Services jar.
    This dev box runs only the new agent, so every v359-only area answers 404
    here and would look like a dead call site.
    Measured 2026-09-07: `reconciliation`, `transactions`, `audit-report-detail`
    and `inventory/work-notes` are all v359-only and all 404 -- expected, not
    findings.

    `system-status-log` USED TO BE the one that mattered, and this paragraph is
    kept because the reasoning is the thing to reuse, not because the case is
    still live. It was in RR_TEST_AGENT_AREAS, so V8 routed it to the new agent,
    which has no such mapping (it has POST /system-status and GET
    /admin/system-status) -- measured 404. v359 did not serve it either, so the
    name was dead on BOTH agents rather than mis-routed between them.
    ✅ Retired 2026-09-12 (UI-181): both call sites sat inside `if (IS_DEMO)`
    blocks and went with the demo sweep, and the RR_TEST_AGENT_AREAS entry went
    with them. The area no longer appears in config.js.
    ⚠ Do not read the surviving `demoFile: 'system-status-log'` string in
    home.html as this entry returning: that call site's AREA is `poll`, and
    `demoFile` is an inert option key nothing reads.

    `api/v1/` first, because that is true of the whole VALC API and of no agent
    path. The prefix TABLE is only what rrFetch knows: the first pass of this
    file routed `api/v1/messages` (home.html:16788, built off RR_CONFIG.valcBase)
    to the AGENT, because that path is not in RR_VALC_PREFIXES. It reaches VALC
    today only because that call site bypasses rrFetch and builds the URL by
    hand -- which is exactly the latent trap assertion A5 reports.
    """
    if path is None:
        return "none"
    if path.startswith(API_PREFIX):
        return "valc"
    for p in tables["RR_VALC_PREFIXES"]:
        if path.startswith(p):
            return "valc"
    if path in tables["RR_TEST_AGENT_AREAS"]:
        return "agent-new"
    for p in tables["RR_TEST_AGENT_PREFIXES"]:
        if path.startswith(p):
            return "agent-new"
    return "agent-v359"


def build_manifest():
    tables = routing_tables()
    overrides = json.load(io.open(OVERRIDES, encoding="utf-8"))["resolutions"] \
        if os.path.exists(OVERRIDES) else {}

    sites, api_literals, errors = [], [], []
    files = source_files()
    for path in files:
        s, a = enumerate_file(path, tables, errors)
        sites.extend(s)
        api_literals.extend(a)

    for site in sites:
        path, query, how = resolve_path(site, overrides)
        site["path"] = path
        # The area's own query string and rrFetch's `query:` option are the same
        # thing at the wire, so they merge into one field.
        merged = [q for q in (query, site.get("optQuery") or "") if q]
        site["query"] = "&".join(merged)
        site["resolvedBy"] = how
        site["route"] = route_of(path, tables)
        site["operatorPrefix"] = bool(path and path.startswith(OPERATOR_PREFIX))

    return {"tables": tables, "sites": sites, "apiLiterals": api_literals,
            "overrides": overrides, "fileCount": len(files), "errors": errors}


# ---------------------------------------------------------------------------
#  assertions
# ---------------------------------------------------------------------------

class Result(object):
    def __init__(self):
        self.failures = []
        self.notes = []

    def check(self, ok, label, detail=""):
        print("  %s  %s" % ("PASS" if ok else "FAIL", label))
        if not ok:
            if detail:
                for line in detail.splitlines():
                    print("        %s" % line)
            self.failures.append(label)
        return ok


def a0_not_vacuous(m, res):
    """The gate must be able to tell "clean" from "blind".

    Runs FIRST because every verdict below it is meaningless if the enumeration
    came back empty, and a reader scanning a column of PASS lines has no way to
    see that from the output alone.
    """
    res.check(not m["errors"],
              "A0a every source file tokenized  (%d files)" % m["fileCount"],
              "\n".join(m["errors"]))

    valc = [s for s in m["sites"] if s["route"] == "valc"]
    res.check(m["fileCount"] >= MIN_FILES
              and len(m["sites"]) >= MIN_CALL_SITES
              and len(valc) >= MIN_VALC_SITES,
              "A0b call surface is above the floor  (%d files, %d sites, %d VALC)"
              % (m["fileCount"], len(m["sites"]), len(valc)),
              "floors are %d files / %d sites / %d VALC. Below one of them the "
              "enumeration has collapsed and A1 would pass by finding nothing. "
              "If real work shrank the surface, lower the floor deliberately."
              % (MIN_FILES, MIN_CALL_SITES, MIN_VALC_SITES))


def a1_operator_prefix(m, res):
    bad = [s for s in m["sites"] if s["operatorPrefix"]]
    detail = "\n".join("%s:%d  %s %s  (via %s)"
                       % (s["file"], s["line"], s["method"], s["path"], s["caller"])
                       for s in bad)
    return res.check(not bad,
                     "A1  no call site routes to %s  (%d checked)"
                     % (OPERATOR_PREFIX, len(m["sites"])), detail)


def a2_overrides(m, res):
    unresolved = [s for s in m["sites"] if s["resolvedBy"] == "unresolved"]
    res.check(not unresolved,
              "A2a every dynamic rrFetch area is resolved",
              "\n".join("%s:%d  rrFetch(%s)  -- add \"%s::%s\" to %s"
                        % (s["file"], s["line"], s["argValue"], s["file"], s["argValue"],
                           os.path.basename(OVERRIDES))
                        for s in unresolved))

    used = set("%s::%s" % (s["file"], s["argValue"])
               for s in m["sites"] if s["resolvedBy"] == "override")
    stale = sorted(set(m["overrides"]) - used)
    res.check(not stale,
              "A2b no override is stale  (%d in use)" % len(used),
              "\n".join("%s  -- no live call site matches; the exemption is "
                        "silently covering nothing" % k for k in stale))

    opaque = [s for s in m["sites"] if s["resolvedBy"] == "opaque"]
    if opaque:
        res.notes.append(
            "%d non-rrFetch call sites carry no path literal at all (a wrapper "
            "forwarding a caller's url). They are not probed." % len(opaque))


def a3_closed_enumeration(m, res):
    """Every api/v1/ literal must belong to a call site we found.

    This is the assertion that would have saved the enumeration. Without it,
    knowing only rrFetch reports 12 VALC call sites and misses the tenant
    roles, invite, role, assignments, messages and company-password-policy
    endpoints -- and reports a clean sweep while doing it.
    """
    accounted = set()
    for s in m["sites"]:
        for lit in s["strings"] + [s.get("assignedTemplate") or ""]:
            if "api/v1/" in lit:
                accounted.add((s["file"], lit))
        if s["path"] and "api/v1/" in s["path"]:
            accounted.add((s["file"], s["path"]))
            accounted.add((s["file"], "/" + s["path"]))

    # config.js's own prefix table and sidebar.js's error-branch keys are the
    # routing machinery, not call sites. Named individually rather than
    # skipped by pattern, so a NEW unattributed literal in either file still
    # fails.
    machinery = {
        ("config.js", "api/v1/tenant/"),
        ("config.js", "api/v1/admin/"),
        ("config.js", "api/v1/ai/"),
        # Added 2026-09-08 when A5's finding was fixed. `api/v1/messages` joined
        # RR_VALC_PREFIXES so that moving home.html's hand-built Message Center
        # calls to rrFetch cannot silently route them to the agent.
        #
        # ⚠ A3 FAILED THE MOMENT THAT ENTRY LANDED, WHICH IS THE POINT. Listing
        # these individually rather than skipping config.js by pattern is what
        # made a new unattributed literal in the routing table stop the build
        # instead of being absorbed. It cost one line to re-authorise and it
        # would have caught a call site added to the table by mistake.
        ("config.js", "api/v1/messages"),
        ("sidebar.js", "api/v1/admin/"),
        ("sidebar.js", "api/v1/ai/"),
    }

    orphans = []
    for lit in m["apiLiterals"]:
        key = (lit["file"], lit["text"])
        if key in machinery or key in accounted:
            continue
        if (lit["file"], lit["text"].lstrip("/")) in accounted:
            continue
        orphans.append(lit)

    return res.check(
        not orphans,
        "A3  every api/v1 literal is attributed to a call site  (%d literals)"
        % len(m["apiLiterals"]),
        "\n".join("%s:%d  %s  -- reached by a call shape this file does not know"
                  % (o["file"], o["line"], o["text"]) for o in orphans))


def a5_prefix_table_covers_valc(m, res):
    """Every VALC path V8 calls must be routable BY rrFetch.

    rrFetch decides VALC-vs-agent purely from RR_VALC_PREFIXES. A VALC path
    outside that table works only while its call site hand-builds the URL off
    RR_CONFIG.valcBase; move that call to rrFetch -- the obvious tidy-up, and
    the shape 22 of 23 files already use -- and it silently routes to the data
    services agent instead, which answers 404. Nothing fails at build time and
    nothing says why at runtime.

    Found by this file on 2026-09-07: /api/v1/messages and
    /api/v1/messages/{id}/dismiss (home.html:16788, :16812).

    A note, not a failure. The paths are correct today; a table entry is the
    fix, and it is the product's call whether to add one or to leave the
    hand-built URL alone deliberately.
    """
    table = m["tables"]["RR_VALC_PREFIXES"]
    uncovered = {}
    for s in m["sites"]:
        p = s["path"]
        if not p or s["route"] != "valc":
            continue
        if any(p.startswith(x) for x in table):
            continue
        uncovered.setdefault(p, []).append("%s:%d" % (s["file"], s["line"]))

    if not uncovered:
        print("  PASS  A5  every VALC path is covered by RR_VALC_PREFIXES")
        return True
    print("  NOTE  A5  %d VALC path(s) NOT covered by RR_VALC_PREFIXES -- "
          "reachable only while the call site bypasses rrFetch" % len(uncovered))
    for p in sorted(uncovered):
        print("        %-42s %s" % (p, ", ".join(uncovered[p])))
    res.notes.append("A5: %d VALC path(s) outside RR_VALC_PREFIXES. Routing through "
                     "rrFetch would send them to the agent." % len(uncovered))
    return True


def a4_control(m, res):
    """Re-inject VLC-59 and require A1 to catch it.

    A1 has nothing to find in a fixed repo, so on its own it is indistinguish-
    able from a check that stopped working. This rewrites the tenant prefix to
    the operator prefix in ONE page's real source, re-runs the enumeration over
    the mutant, and requires A1 to fail on it. Runs last so a harness that quit
    asserting cannot hide behind the green lines above.
    """
    victim = os.path.join(RRV8, "admin-users.html")
    src = io.open(victim, encoding="utf-8").read()
    mutant = src.replace("api/v1/tenant/", "api/v1/admin/")
    if mutant == src:
        return res.check(False, "A4  control could not be built",
                         "admin-users.html contains no 'api/v1/tenant/' to mutate, so "
                         "A1 was never exercised against a defect and proves nothing.")

    # The mutant goes to the system temp dir, never beside the real file. Written
    # into RRV8/ it would be an untracked working-tree file for the length of the
    # run, and a CI job that later diffs the tree -- or a developer who Ctrl-C's
    # mid-run -- would find a near-copy of a shipping page sitting next to it.
    fd, tmp = tempfile.mkstemp(suffix=".html", prefix="v8-callsites-a4-")
    os.close(fd)
    try:
        io.open(tmp, "w", encoding="utf-8").write(mutant)
        sites, _ = enumerate_file(tmp, m["tables"])
        for s in sites:
            p, _q, _how = resolve_path(s, m["overrides"])
            s["operatorPrefix"] = bool(p and p.startswith(OPERATOR_PREFIX))
        caught = [s for s in sites if s["operatorPrefix"]]
        ok = res.check(bool(caught),
                       "A4  control: the re-injected VLC-59 defect is caught  "
                       "(%d operator-prefix sites seen in the mutant)" % len(caught),
                       "A1 passed on a page rewritten to call the operator prefix. "
                       "The gate is not testing anything.")
        # and the real file must still be clean, measured after the mutant ran
        real, _ = enumerate_file(victim, m["tables"])
        for s in real:
            p, _q, _how = resolve_path(s, m["overrides"])
            s["operatorPrefix"] = bool(p and p.startswith(OPERATOR_PREFIX))
        ok = res.check(not [s for s in real if s["operatorPrefix"]],
                       "A4b control cleanup: the real file is untouched") and ok
        return ok
    finally:
        try:
            os.unlink(tmp)
        except OSError:
            pass


# ---------------------------------------------------------------------------
#  reporting
# ---------------------------------------------------------------------------

def report(m):
    sites = m["sites"]
    print("V8 SERVER CALL SURFACE -- %d call sites across %d files"
          % (len(sites), len(set(s["file"] for s in sites))))
    print()
    by_route = {}
    for s in sites:
        by_route.setdefault(s["route"], []).append(s)
    for route in ("valc", "agent-new", "agent-v359", "none"):
        group = by_route.get(route, [])
        print("  %-11s %3d call sites" % (route, len(group)))
    print()

    print("  by how the path was resolved")
    by_how = {}
    for s in sites:
        by_how[s["resolvedBy"]] = by_how.get(s["resolvedBy"], 0) + 1
    for how in sorted(by_how):
        print("    %-11s %3d" % (how, by_how[how]))
    print()

    print("  by client-side guard  (VALC-routed only -- the agent does not gate on role)")
    valc = [s for s in sites if s["route"] == "valc"]
    by_guard = {}
    for s in valc:
        by_guard[s["guard"]] = by_guard.get(s["guard"], 0) + 1
    for g in sorted(by_guard):
        print("    %-11s %3d" % (g, by_guard[g]))
    print()

    print("  VALC-routed paths  (guard / method / path / where)")
    seen = {}
    for s in valc:
        seen.setdefault((s["guard"], s["method"], s["path"]), []).append(
            "%s:%d" % (s["file"], s["line"]))
    for key in sorted(seen, key=lambda k: (k[0], k[2] or "", k[1])):
        guard, method, path = key
        where = seen[key]
        print("    %-11s %-6s %-46s %s%s"
              % (guard, method, path, ", ".join(where[:2]),
                 " +%d" % (len(where) - 2) if len(where) > 2 else ""))
    print()

    for label, route in (("AGENT paths served by the NEW data-services agent", "agent-new"),
                         ("AGENT paths still on the v359 Services jar", "agent-v359")):
        print("  %s" % label)
        agent = [s for s in sites if s["route"] == route]
        ap = {}
        for s in agent:
            ap.setdefault((s["method"], s["path"]), []).append(
                "%s:%d" % (s["file"], s["line"]))
        for key in sorted(ap, key=lambda k: (k[1] or "", k[0])):
            print("    %-6s %-50s %d site%s"
                  % (key[0], key[1], len(ap[key]), "" if len(ap[key]) == 1 else "s"))
        print()


def main(argv):
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--report", action="store_true", help="print the inventory")
    ap.add_argument("--json", metavar="PATH", help="write the manifest for persona-probe.py")
    args = ap.parse_args(argv)

    m = build_manifest()

    if args.report:
        report(m)
        print()

    print("STATIC GATE")
    res = Result()
    a0_not_vacuous(m, res)
    a1_operator_prefix(m, res)
    a2_overrides(m, res)
    a3_closed_enumeration(m, res)
    a5_prefix_table_covers_valc(m, res)
    a4_control(m, res)

    for note in res.notes:
        print("  NOTE  %s" % note)

    if args.json:
        out = {"sites": m["sites"], "tables": m["tables"]}
        d = os.path.dirname(os.path.abspath(args.json))
        if d and not os.path.isdir(d):
            os.makedirs(d)
        io.open(args.json, "w", encoding="utf-8").write(
            json.dumps(out, indent=1, sort_keys=True))
        print("  manifest -> %s  (%d sites)" % (args.json, len(m["sites"])))

    print()
    if res.failures:
        print("FAILED: %s" % "; ".join(res.failures))
        return 1
    print("all static assertions pass")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
