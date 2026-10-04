#!/usr/bin/env python3
"""persona-probe.py -- run V8's whole server call surface as a least-privileged
customer, which is the one thing nobody on this project can do by hand.

    python Tools/v8-callsites.py --json Tools/_out/v8-callsites.json
    python Tools/persona-probe.py
    python Tools/persona-probe.py --self-test     # creates nothing; run it first

THE SELF-TEST (HK-38)
=====================

From VALC's move to Spring 7 until 2026-10-04 this file could not create a
persona at all, and nothing said so until someone tried to run it: the bcrypt
classpath asked for spring-jcl, which Spring 7 no longer ships, and the right
was inserted by database NAME, which V85 replaced with `client_database_id`.
`--self-test` checks both against the live jar and schema, running the real
inserts inside a rolled-back transaction, with one mutation arm per defect.
It needs a live VALC jar and Postgres, so it is not in CI (the static half,
v8-callsites.py, is).

WHY THIS EXISTS
===============

VLC-59 was a two-day outage of V8's entire administration surface, and it was
STRUCTURALLY INVISIBLE. `valc_operator` is true for exactly two of six users.
The gate that broke could only be noticed by someone WITHOUT that grant, and
both people who use the product daily hold it. There was no persona in the
building that could see it.

So this creates one. Three throwaway accounts, none of them an operator, none
of them a superuser, each with a single database grant on one active client --
and then it replays every call site V8 actually makes, as each of them, and
reports which ones refuse.

THE ASSERTION IS A MATCH, NOT AN ABSENCE
========================================

"No 403 for a least-privileged user" is the obvious assertion and it is wrong.
Plenty of call sites are legitimately administrator-only and are gated
client-side, so a 403 there is the design working. Asserting their absence
produces a list where half the entries are correct behaviour, which is the
"list nobody can act on" failure HK-13 named.

The real invariant is that the client-side guard and the server-side gate agree:

  guard = none        a page issues this call for any role, so NO persona may
                      be refused. A refusal here is the VLC-59 class. FAILS.
  guard = page-admin  the page halts for a non-admin, so only the ADMIN persona
  guard = fn-admin    is meant to reach it -- and the admin must NOT be refused.
                      A refusal for the admin persona FAILS. A refusal for the
                      analyst is the design and is reported, not failed.

That second line is the whole point. VLC-59's nine endpoints were all
page-admin, and it was the customer ADMINISTRATOR who got 403. Ed and Daren
could not reproduce it because neither of them is a customer administrator --
they are GSI operators, and the operator grant is what made the broken gate
pass for them.

NOTHING IS MUTATED
==================

A POST/PUT/PATCH/DELETE call site is probed with GET instead of its real
method. Spring Security's filter chain runs before the DispatcherServlet, so a
chain-level rule (`requestMatchers("/api/v1/admin/**").hasRole(...)`,
SecurityConfig:207) fires on ANY method -- and the reply distinguishes cleanly:

    403  the chain refused                measured 2026-09-07
    405  the chain passed, no GET handler  measured 2026-09-07
    404  authenticated, route absent       measured 2026-09-07

So the gate that broke in VLC-59 is fully probed without a single write. What
this does NOT reach is method-level authorization: a `@PreAuthorize` on the
handler, and TenantScopeService's four in-method guards, only run once a
handler matches. Those are exercised by the GET sites and by VLC-62's own unit
suite, and this file says so rather than implying coverage it does not have.

An empty-body POST was considered and rejected: Spring rejects a missing body
at parameter binding with 400 BEFORE any in-method guard executes, so it tests
nothing -- measured in VLC-62, where two PUT probes passed for that reason.

CONTROLS, ALL RUN LAST
======================

C1  Re-point every tenant path at the operator prefix and require the run to
    fail. That IS VLC-59, reconstructed against the live service.
C2  A positive control. If VALC is down, every probe "fails" and a reader could
    take the noise for findings; if a known-good call does not answer 200, the
    run reports INCONCLUSIVE rather than a verdict.
C3  The persona really lacks the operator grant -- an operator endpoint must
    403. Without this, a persona accidentally provisioned with valc_operator
    would sail through every assertion and prove nothing. This is the check
    VLC-62's first run needed and did not have.
C4  Cleanup. Zero probe rows left, and the live user / operator counts
    unchanged from the baseline taken before anything was created.

⚠ THE CLEANUP DELETES BY THE PROBE EMAIL DOMAIN, NOT BY A CAPTURED ID. The
first draft captured an id, raised before parsing it, and its own finally block
then failed too -- leaving a real user in the database. A pattern delete cleans
up whatever a run created, whenever it died.
"""

import argparse
import base64
import io
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(HERE)
MANIFEST = os.path.join(HERE, "_out", "v8-callsites.json")

# Everything below is overridable from the environment so the file carries no
# machine-specific truth as a silent default (HK-13's class).
PSQL = os.environ.get("RR_PSQL", r"C:\Program Files\PostgreSQL\16\bin\psql.exe")
JAVA = os.environ.get("RR_JAVA", r"C:\Development\jdk-21.0.11+10\bin\java.exe")
VALC_JAR = os.environ.get(
    "RR_VALC_JAR", r"C:\source\repos\RapidReconciler-Valc\target\valc-8.0.0-SNAPSHOT.jar")
VALC_BASE = os.environ.get("RR_VALC_BASE", "http://localhost:8080")
PG = {
    "host": os.environ.get("RR_PGHOST", "localhost"),
    "port": os.environ.get("RR_PGPORT", "5432"),
    "user": os.environ.get("RR_PGUSER", "valc"),
    "db":   os.environ.get("RR_PGDB", "valc"),
    "pw":   os.environ.get("RR_PGPASSWORD", "valc"),
}

# `.invalid` is reserved by RFC 2606 and can never resolve, so a probe address
# cannot collide with a real one or accidentally receive mail. It also makes
# every probe row obvious in the users table at a glance.
PROBE_DOMAIN = "rr-persona-probe.invalid"
PROBE_PW = "Persona-Probe-Pw-9!"

# The database and client the personas are members of. A member of a client is
# a user holding a permission row on one of that client's ACTIVE databases --
# TenantScopeService and AuthController.buildDbsScoped use the same rule, which
# is why they cannot disagree about who is in a tenant.
PROBE_DB = os.environ.get("RR_PROBE_DB", "RapidReconciler_Demo1")
PROBE_DB_ID = os.environ.get("RR_PROBE_DB_ID")    # wins over the name when set

# Roles, read out of the roles table 2026-09-07 rather than assumed:
#   1 Administrator  tab_admin TRUE   -- the customer administrator
#   2 Analyst        tab_admin FALSE  -- the ordinary customer user
#   7 SSO            every tab FALSE  -- the floor
PERSONAS = [
    {"key": "tenant-admin", "role_id": 1, "admin": True,
     "why": "the persona VLC-59 broke, and the one nobody in the building is: "
            "a customer administrator with NO operator grant"},
    {"key": "analyst", "role_id": 2, "admin": False,
     "why": "the ordinary customer user -- the non-admin lane"},
    {"key": "minimal", "role_id": 7, "admin": False,
     "why": "every role tab false: the floor a grant-only account sits on"},
]


# ---------------------------------------------------------------------------
#  plumbing
# ---------------------------------------------------------------------------

def sql(stmt):
    env = dict(os.environ, PGPASSWORD=PG["pw"])
    p = subprocess.run([PSQL, "-h", PG["host"], "-p", PG["port"], "-U", PG["user"],
                        "-d", PG["db"], "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", stmt],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if p.returncode != 0:
        raise RuntimeError("psql: %s" % p.stderr.decode("utf-8", "replace").strip())
    out = p.stdout.decode("utf-8", "replace").strip()
    # psql -t -A prints the command tag ("INSERT 0 1") on its own line after a
    # RETURNING row. Taking the whole buffer put "81\nINSERT 0 1" into an id and
    # then into the next statement, which broke the insert AND the cleanup.
    return out.splitlines()[0] if out else ""


def http(method, url, token=None, body=None, timeout=30):
    data = json.dumps(body).encode("utf-8") if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    if data is not None:
        req.add_header("Content-Type", "application/json;charset=UTF-8")
    if token:
        req.add_header("Authorization", "Bearer " + token)
    req.add_header("Accept", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, e.read().decode("utf-8", "replace")
    except Exception as e:
        # 0 is not a status. It means the request never got an answer, and it
        # must never be read as a refusal -- see control C2.
        return 0, "%s: %s" % (type(e).__name__, e)


def sql_rows(stmt):
    """Every row of a SELECT, each split on psql's unaligned '|' separator."""
    env = dict(os.environ, PGPASSWORD=PG["pw"])
    p = subprocess.run([PSQL, "-h", PG["host"], "-p", PG["port"], "-U", PG["user"],
                        "-d", PG["db"], "-t", "-A", "-v", "ON_ERROR_STOP=1", "-c", stmt],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE, env=env)
    if p.returncode != 0:
        raise RuntimeError("psql: %s" % p.stderr.decode("utf-8", "replace").strip())
    return [ln.split("|") for ln in p.stdout.decode("utf-8", "replace").splitlines() if ln]


# The three jars the encoder needs, matched on the jar's own file name. HK-38:
# this was "spring-security-crypto + spring-jcl", which is Spring 6's shape.
# VALC moved to Spring Framework 7, which ships no spring-jcl (commons-logging
# instead), and Spring Security 7's encoder also calls into spring-core
# (`org.springframework.util.StringUtils`). Measured 2026-10-04 against the VALC
# jar: dropping any one of the three is a NoClassDefFoundError, which is what
# the self-test's mutation arms assert. A logging bridge of either name is
# accepted so the rule holds on both generations.
CRYPTO_JARS = (
    ("crypto", re.compile(r"^spring-security-crypto-\d.*\.jar$")),
    ("core", re.compile(r"^spring-core-\d.*\.jar$")),
    ("logging", re.compile(r"^(spring-jcl|commons-logging)-\d.*\.jar$")),
)


def select_crypto_jars(names):
    """(entries, missing) for a fat jar's listing. Pure, so the self-test can
    run it on a listing with a jar taken out."""
    picked, missing = [], []
    for role, rx in CRYPTO_JARS:
        hit = [n for n in names
               if n.startswith("BOOT-INF/lib/") and rx.match(n.rsplit("/", 1)[-1])]
        if hit:
            picked.append(sorted(hit)[-1])
        else:
            missing.append(role)
    return picked, missing


def valc_jar_listing():
    if not os.path.exists(VALC_JAR):
        raise RuntimeError("VALC jar not found at %s (set RR_VALC_JAR)" % VALC_JAR)
    jar_exe = os.path.join(os.path.dirname(JAVA), "jar.exe")
    p = subprocess.run([jar_exe, "tf", VALC_JAR], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError("jar tf %s: %s" % (VALC_JAR, p.stderr.decode("utf-8", "replace").strip()))
    return [n.strip() for n in p.stdout.decode("utf-8", "replace").splitlines() if n.strip()]


_CRYPTO_CP = None


def crypto_classpath(entries=None):
    """The crypto jars, unpacked from the SHIPPED fat jar.

    The local Maven cache holds the same versions today, but "today" is the
    problem: a hash has to be one the RUNNING jar accepts, so the classpath
    comes out of that jar. `entries` overrides the selection (self-test only).
    """
    global _CRYPTO_CP
    if entries is None and _CRYPTO_CP:
        return _CRYPTO_CP
    wanted = entries
    if wanted is None:
        wanted, missing = select_crypto_jars(valc_jar_listing())
        if missing:
            raise RuntimeError("VALC jar %s has no %s jar for the bcrypt helper (see "
                               "CRYPTO_JARS)" % (VALC_JAR, " / ".join(missing)))
    out = os.path.join(tempfile.gettempdir(), "rr-persona-crypto")
    if not os.path.isdir(out):
        os.makedirs(out)
    jar_exe = os.path.join(os.path.dirname(JAVA), "jar.exe")
    subprocess.run([jar_exe, "xf", VALC_JAR] + wanted, cwd=out, check=True)
    cp = os.pathsep.join(os.path.join(out, w) for w in wanted)
    if entries is None:
        _CRYPTO_CP = cp
    return cp


def bcrypt(pw, classpath=None):
    p = subprocess.run([JAVA, "-cp", classpath or crypto_classpath(),
                        os.path.join(HERE, "_persona", "BcryptHash.java"), pw],
                       stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if p.returncode != 0:
        raise RuntimeError("bcrypt helper: %s" % p.stderr.decode("utf-8", "replace").strip())
    return p.stdout.decode("ascii").strip()


def jwt_payload(tok):
    part = tok.split(".")[1]
    part += "=" * (-len(part) % 4)
    return json.loads(base64.urlsafe_b64decode(part))


# ---------------------------------------------------------------------------
#  personas
# ---------------------------------------------------------------------------

def resolve_probe_db():
    """(client_database_id, client_id, db_name) of the database the personas join.

    HK-38: rights are keyed by `client_database_id` since V85 (VLC-115), and a
    database NAME is not a tenant key -- every customer has
    RapidReconciler_Prod_V8. So the name is resolved to exactly one ACTIVE row
    here and the run refuses if it is ambiguous, rather than picking one.
    RR_PROBE_DB_ID names the row directly.
    """
    if PROBE_DB_ID:
        where = "d.id = %d" % int(PROBE_DB_ID)
    else:
        where = "d.db_name = '%s'" % PROBE_DB.replace("'", "''")
    rows = sql_rows("SELECT d.id, d.client_id, d.db_name FROM client_databases d "
                    "WHERE %s AND d.deleted_at IS NULL AND d.active ORDER BY d.id;" % where)
    if len(rows) != 1:
        raise RuntimeError("%d active client_databases rows match %s; set RR_PROBE_DB_ID "
                           "to one id" % (len(rows), where))
    return int(rows[0][0]), int(rows[0][1]), rows[0][2]


def persona_statements(email, key, pw_hash, role_id, db):
    """The two inserts that make a persona, in order. One producer: the run and
    the self-test execute exactly these strings.

    The user carries a home client (`users.client_id`), as V85 gave every
    customer user. TenantScopeService.isMemberOf answers from that column first,
    so a persona without it would be a shape no real customer user has.
    The right names only `client_database_id`: the V85 trigger
    `user_database_permissions_name_from_id` writes `database_name` from it, and
    `user_database_permissions_same_client` refuses a database of another client.
    """
    db_id, client_id = db[0], db[1]
    # password_changed_at MUST be set. PasswordPolicyService.isExpired treats a
    # null as expired, which mints a ROLE_MUST_CHANGE token that reaches nothing
    # but /api/v1/auth/change-password -- so every probe would 403 for a reason
    # that has nothing to do with the code under test.
    return [
        "INSERT INTO users (email, display_name, password_hash, is_superuser, "
        "is_active, role_id, valc_operator, password_changed_at, client_id) VALUES "
        "('%s','Persona Probe %s','%s', false, true, %d, false, now(), %d);"
        % (email, key, pw_hash, role_id, client_id),
        "INSERT INTO user_database_permissions (user_id, client_database_id, companies, "
        "company_scope) SELECT u.id, %d, '[]'::jsonb, 'ALL' FROM users u "
        "WHERE u.email = '%s';" % (db_id, email),
    ]


def create_persona(p, pw_hash, db):
    email = "probe-%s@%s" % (p["key"], PROBE_DOMAIN)
    for stmt in persona_statements(email, p["key"], pw_hash, p["role_id"], db):
        sql(stmt)
    uid = sql("SELECT id FROM users WHERE email = '%s';" % email)
    return email, int(uid)


def sign_in(email):
    st, body = http("POST", VALC_BASE + "/api/v1/auth/login",
                    body={"email": email, "password": PROBE_PW})
    if st != 200:
        return None, "login -> %d %s" % (st, body[:200])
    j = json.loads(body)
    return j["token"], None


# ---------------------------------------------------------------------------
#  probing
# ---------------------------------------------------------------------------

def probe_targets(manifest):
    """One target per (route, method, path, query, guard), with its call sites.

    Collapsed to the distinct tuple because eighteen `api/v1/ai/explain` call
    sites hit one endpoint under one guard, and eighteen identical result lines
    is noise. Every collapsed site is still named against its failure.
    """
    targets = {}
    for s in manifest["sites"]:
        if s["route"] == "none" or not s["path"]:
            continue
        # The QUERY IS NOT PART OF THE KEY. Two call sites hitting one endpoint,
        # one of them passing `?ctx=`, are the same target under the same guard
        # -- keying on the query printed the same endpoint twice, once as a pass
        # and once as a gap, which reads as a contradiction rather than as one
        # row. The query keys are unioned instead, and filled once.
        key = (s["route"], s["method"], s["path"], s["guard"])
        e = targets.setdefault(key, {"sites": [], "query": set()})
        e["sites"].append("%s:%d" % (s["file"], s["line"]))
        for pair in (s.get("query") or "").split("&"):
            if pair:
                e["query"].add(pair)
    return targets


# Query parameters, in three classes. Getting this wrong showed up twice:
# `api/v1/tenant/license-usage` with no `?database=` answers 400 MISSING
# PARAMETER, and a column of 400s looks like a result while saying nothing
# about authorization.
#
#   REQUIRED  a real value is supplied. Without it the handler 400s before any
#             authorization question has been answered.
#   OMITTED   dropped, and the probe is still complete. Every one of these
#             NARROWS a read, so the unscoped request is the BROADER ask: if
#             authorization allows the broad one it allows the narrow one, and
#             if it refuses the broad one that is the finding either way.
#             `ctx` is stronger than that -- the source calls it a
#             "server-IGNORED replay disambiguator" in five places.
#   unknown   anything else. Reported as a gap rather than guessed at.
QUERY_REQUIRED = {"database": lambda uid: PROBE_DB}
QUERY_OMITTED = ("ctx", "company", "co", "period", "db", "runId", "limit", "filter",
                 # a date narrows a preview to a range
                 "fromDate", "toDate",
                 # /poll's long-poll switches. Omitting them gives short-poll
                 # mode, which returns immediately -- and the same endpoint is
                 # already probed without them, so nothing is lost.
                 "updating", "recalculating")


def fill_query(query, uid):
    """(query_string, complete). complete=False means do not trust the status."""
    if not query:
        return "", True
    out, complete = [], True
    for pair in query.split("&"):
        if not pair:
            continue
        key = pair.split("=", 1)[0]
        if key in QUERY_REQUIRED:
            out.append("%s=%s" % (key, QUERY_REQUIRED[key](uid)))
        elif key in QUERY_OMITTED:
            continue
        else:
            complete = False
    return "&".join(out), complete


def probe_one(route, method, path, query, token, agent_base, uid):
    """Issue one probe. Returns (url, status, body, complete).

    `complete` is False when the URL could not be fully constructed -- an
    unfilled `{}` segment or a query key with no safe value. Those are reported
    as gaps. A probe of a URL V8 never requests produces a status nobody should
    read, and the first draft of this file did exactly that: it appended a user
    id to `api/v1/tenant/users/` and reported 405, when the endpoint the page
    calls is `/users/{id}/assignments`.
    """
    probe_path, complete = path, True
    # `{}` is a runtime value. The persona's own user id is the right
    # substitution: a persona is always a member of its own client, so it is a
    # legitimate target for its own client's endpoints -- which is what makes a
    # refusal here meaningful rather than an out-of-scope 404.
    if "{}" in probe_path:
        probe_path = probe_path.replace("{}", str(uid))
    q, q_known = fill_query(query, uid)
    if not q_known:
        complete = False
    base = VALC_BASE if route == "valc" else agent_base
    # NEVER MUTATE. GET reaches the security filter chain -- the gate VLC-59
    # broke -- and stops before any handler that could write.
    url = base + "/" + probe_path + ("?" + q if q else "")
    st, body = http("GET", url, token=token)
    return url, st, body, complete


# ---------------------------------------------------------------------------
#  verdicts
# ---------------------------------------------------------------------------

REFUSED = (401, 403)

# Verdict vocabulary, kept to four characters so a persona column stays narrow
# enough to read three of them side by side:
#
#   OK    reached the code it was meant to reach
#   FAIL  refused, or the server broke, where it must not have been
#   EXP   refused for a non-admin on an admin-guarded site -- the design
#   SRV   the server ALLOWS what the client hides. Not a defect; the gate is
#         client-side UX. Printed because a reader should know which is which.
#   DEAD  no answer at all. A service or harness fault, never a finding.
#   GAP   not covered: the URL could not be fully constructed. Named rather
#         than filled in with a plausible guess.
VERDICTS = ("OK", "FAIL", "EXP", "SRV", "DEAD", "GAP")


def verdict(guard, persona, status, complete):
    """One (target, persona) pair.

    DEAD and GAP are separated from FAIL on purpose. Status 0 means no answer
    came back, and folding that into FAIL would let a stopped service render as
    a page of findings. GAP means this file could not build the real URL, and
    calling that a pass would be the vacuous shape.
    """
    if status == 0:
        return "DEAD"
    if not complete:
        return "GAP"
    if status >= 500:
        return "FAIL"
    if guard == "none":
        # No client-side gate, so every role issues this call. Nobody may be
        # refused. This is the VLC-59 class.
        return "FAIL" if status in REFUSED else "OK"
    # Guarded. The ADMIN persona is the one the page lets through, so a refusal
    # for the admin is the defect -- that is exactly what VLC-59 was, and why
    # two GSI operators could not reproduce it.
    if persona["admin"]:
        return "FAIL" if status in REFUSED else "OK"
    return "EXP" if status in REFUSED else "SRV"


# ---------------------------------------------------------------------------
#  self-test (HK-38)
# ---------------------------------------------------------------------------

SELF_TEST_EMAIL = "probe-selftest@" + PROBE_DOMAIN


def _rolled_back(stmts, email):
    """Run `stmts`, then read back what the triggers wrote, in ONE transaction
    that is always rolled back (explicitly, or by psql aborting on the first
    error). Returns (row or None, error or None)."""
    probe = ("SELECT 'HK38', u.client_id, p.client_database_id, p.database_name "
             "FROM users u JOIN user_database_permissions p ON p.user_id = u.id "
             "WHERE u.email = '%s';" % email)
    try:
        rows = sql_rows("BEGIN; " + " ".join(stmts) + " " + probe + " ROLLBACK;")
    except RuntimeError as exc:
        return None, str(exc).splitlines()[0]
    hits = [r for r in rows if r and r[0] == "HK38"]
    return (hits[0] if len(hits) == 1 else None), (None if len(hits) == 1
                                                   else "%d rows read back" % len(hits))


def self_test():
    """What broke in HK-38, checked against the live jar and schema, with an arm
    per defect that must be caught. Creates nothing: the inserts run inside a
    rolled-back transaction, and the residue check after it is the proof."""
    ok = True

    def report(passed, label):
        nonlocal ok
        ok = ok and passed
        print("  %s  %s" % ("PASS" if passed else "FAIL", label))

    def arm(caught, label):
        nonlocal ok
        ok = ok and caught
        print("  %s  %s" % ("CAUGHT" if caught else "MISSED", label))

    print("persona-probe self-test  (VALC jar %s)" % VALC_JAR)

    # The selection rule, on both generations' shapes, then on the real jar.
    s6 = ["BOOT-INF/lib/spring-security-crypto-6.3.4.jar", "BOOT-INF/lib/spring-core-6.1.14.jar",
          "BOOT-INF/lib/spring-jcl-6.1.14.jar"]
    s7 = ["BOOT-INF/lib/spring-security-crypto-7.1.1.jar", "BOOT-INF/lib/spring-core-7.0.9.jar",
          "BOOT-INF/lib/commons-logging-1.3.6.jar", "BOOT-INF/lib/spring-core-test-7.0.9.jar"]
    report(select_crypto_jars(s6)[1] == [], "selection: a Spring 6 listing (spring-jcl) resolves")
    picked7, miss7 = select_crypto_jars(s7)
    report(miss7 == [] and not any("core-test" in p for p in picked7),
           "selection: a Spring 7 listing (commons-logging) resolves, spring-core-test ignored")
    report(select_crypto_jars(s7[:2])[1] == ["logging"],
           "selection: a listing with no logging bridge names what is missing")

    listing = valc_jar_listing()
    entries, missing = select_crypto_jars(listing)
    report(not missing, "the VALC jar holds all three: %s"
           % ", ".join(e.rsplit("/", 1)[-1] for e in entries) if not missing
           else "the VALC jar is missing: %s" % ", ".join(missing))
    if missing:
        return 1
    try:
        pw_hash = bcrypt(PROBE_PW)
        report(pw_hash.startswith("$2"), "bcrypt helper hashes and verifies on that classpath")
    except RuntimeError as exc:
        report(False, "bcrypt helper: %s" % str(exc).splitlines()[0])
        return 1

    # Arms: each jar is required. Measured 2026-10-04: dropping any one is a
    # NoClassDefFoundError (StringUtils, LogFactory).
    for role in ("core", "logging"):
        cp = crypto_classpath([e for e, (r, _) in zip(entries, CRYPTO_JARS) if r != role])
        try:
            bcrypt(PROBE_PW, classpath=cp)
            arm(False, "arm: classpath without %s still hashed (the check cannot see "
                       "this defect)" % role)
        except RuntimeError as exc:
            lines = [ln.strip() for ln in str(exc).splitlines()]
            why = next((ln for ln in lines if "Error" in ln or "Exception" in ln), lines[0])
            # "...NoClassDefFoundError: org/x/Y" -> "NoClassDefFoundError: org/x/Y"
            m = re.search(r"(\w+(?:Error|Exception): \S+)", why)
            arm(True, "arm: classpath without %s refused -- %s"
                % (role, m.group(1) if m else why[:120]))

    # The inserts, against the live schema.
    try:
        db = resolve_probe_db()
    except RuntimeError as exc:
        report(False, "resolve %s: %s" % (PROBE_DB_ID or PROBE_DB, exc))
        return 1
    report(True, "resolved %s to client_databases.id %d (client %d)" % (db[2], db[0], db[1]))
    row, err = _rolled_back(persona_statements(SELF_TEST_EMAIL, "selftest", pw_hash,
                                               PERSONAS[0]["role_id"], db), SELF_TEST_EMAIL)
    report(row is not None and row[1] == str(db[1]) and row[2] == str(db[0]) and row[3] == db[2],
           "persona inserts: home client %s, right on id %s, trigger wrote name %s"
           % (row[1], row[2], row[3]) if row else "persona inserts failed: %s" % err)

    # Arm: the pre-HK-38 insert, a right naming only database_name.
    old = ["INSERT INTO users (email, display_name, password_hash, is_superuser, is_active, "
           "role_id, valc_operator, password_changed_at) VALUES ('%s','Persona Probe old',"
           "'%s', false, true, %d, false, now());"
           % (SELF_TEST_EMAIL, pw_hash, PERSONAS[0]["role_id"]),
           "INSERT INTO user_database_permissions (user_id, database_name, companies, "
           "company_scope) SELECT u.id, '%s', '[]'::jsonb, 'ALL' FROM users u WHERE "
           "u.email = '%s';" % (db[2], SELF_TEST_EMAIL)]
    row, err = _rolled_back(old, SELF_TEST_EMAIL)
    arm(row is None, "arm: the pre-HK-38 name-only right refused -- %s" % err if row is None
        else "arm: the pre-HK-38 name-only right was ACCEPTED")

    # Arm: a home client that does not own the database. Proves the persona's
    # client_id is checked by the live trigger, not merely written.
    other = sql("SELECT min(id) FROM clients WHERE id <> %d;" % db[1])
    if not other:
        report(False, "arm not built: no second client to point the persona at")
    else:
        row, err = _rolled_back(persona_statements(SELF_TEST_EMAIL, "selftest", pw_hash,
                                                   PERSONAS[0]["role_id"],
                                                   (db[0], int(other), db[2])), SELF_TEST_EMAIL)
        arm(row is None, "arm: a persona of client %s on client %d's database refused -- %s"
            % (other, db[1], err) if row is None
            else "arm: a cross-client right was ACCEPTED")

    left = sql("SELECT count(*) FROM users WHERE email = '%s';" % SELF_TEST_EMAIL)
    report(left == "0", "nothing left behind: %s rows for %s" % (left, SELF_TEST_EMAIL))

    print("self-test: %s" % ("PASS" if ok else "FAIL"))
    return 0 if ok else 1


def main(argv):
    ap = argparse.ArgumentParser(add_help=True)
    ap.add_argument("--manifest", default=MANIFEST)
    ap.add_argument("--agent", action="store_true",
                    help="also probe agent-routed GET sites (slower; the agent "
                         "does not gate on role, so the assertion is weaker)")
    ap.add_argument("--self-test", action="store_true",
                    help="check the bcrypt classpath and the persona inserts against "
                         "the live VALC jar and schema, inside a rolled-back "
                         "transaction, plus mutation arms; creates nothing")
    args = ap.parse_args(argv)
    if args.self_test:
        return self_test()

    if not os.path.exists(args.manifest):
        print("no manifest at %s\n  run: python Tools/v8-callsites.py --json %s"
              % (args.manifest, args.manifest))
        return 2
    manifest = json.load(io.open(args.manifest, encoding="utf-8"))

    base_users = sql("SELECT count(*) FROM users WHERE deleted_at IS NULL;")
    base_ops = sql("SELECT count(*) FROM users WHERE valc_operator;")
    global PROBE_DB
    db = resolve_probe_db()
    PROBE_DB = db[2]     # the `?database=` query value is the resolved row's name
    print("baseline: %s live users, %s operators" % (base_users, base_ops))
    print("target:   VALC %s   db %s (client_databases.id %d, client %d)"
          % (VALC_BASE, PROBE_DB, db[0], db[1]))

    failures, dead, inconclusive = [], [], []
    targets = probe_targets(manifest)
    valc_targets = {k: v for k, v in targets.items() if k[0] == "valc"}
    agent_targets = {k: v for k, v in targets.items() if k[0] == "agent-new"}
    v359_targets = {k: v for k, v in targets.items() if k[0] == "agent-v359"}
    print("manifest: %d distinct targets from %d call sites" % (len(targets),
                                                               len(manifest["sites"])))
    print("          %d VALC  %d new-agent  %d v359-only (NOT PROBED -- no v359 "
          "instance on this box)" % (len(valc_targets), len(agent_targets),
                                     len(v359_targets)))
    print()

    try:
        pw_hash = bcrypt(PROBE_PW)
        sessions = []
        for p in PERSONAS:
            email, uid = create_persona(p, pw_hash, db)
            tok, err = sign_in(email)
            if err:
                inconclusive.append("%s: %s" % (p["key"], err))
                print("  %-13s COULD NOT SIGN IN -- %s" % (p["key"], err))
                continue
            pl = jwt_payload(tok)
            dbs = pl.get("dbs") or []
            if not dbs:
                inconclusive.append("%s: token carries no dbs[]" % p["key"])
                continue
            db0 = dbs[0]
            adm = bool(db0.get("t", {}).get("adm"))
            ip = db0.get("ip") or ""
            agent_base = ("http://" if ip.startswith(("localhost", "127.")) else "https://") + ip
            sessions.append(dict(p, email=email, uid=uid, token=tok,
                                 adm=adm, agent=agent_base, role=db0.get("rn")))
            print("  %-13s uid=%-4s role=%-14s t.adm=%-5s su=%-5s agent=%s"
                  % (p["key"], uid, db0.get("rn"), adm, db0.get("su"), agent_base))
            # The persona must BE what the verdict table assumes it is. A
            # tenant-admin whose token says adm=false would turn every
            # page-admin FAIL into a meaningless one.
            if adm != p["admin"]:
                failures.append("persona %s: token t.adm=%s, expected %s"
                                % (p["key"], adm, p["admin"]))

        if not sessions:
            print("\nINCONCLUSIVE: no persona could sign in.")
            return 2

        # ---- the run -------------------------------------------------------
        print()
        print("VALC-ROUTED TARGETS  (non-GET methods probed with GET: 403 = chain "
              "refused, 405 = chain passed)")
        print()
        header = "  %-11s %-6s %-46s" % ("guard", "method", "path")
        print(header + "".join("%-13s" % s["key"][:12] for s in sessions))
        print("  " + "-" * (len(header) - 2 + 13 * len(sessions)))

        gaps = []
        for key in sorted(valc_targets, key=lambda k: (k[3], k[2], k[1])):
            route, method, path, guard = key
            query = "&".join(sorted(valc_targets[key]["query"]))
            call_sites = valc_targets[key]["sites"]
            cells = []
            for s in sessions:
                url, st, body, complete = probe_one(route, method, path, query,
                                                    s["token"], s["agent"], s["uid"])
                v = verdict(guard, s, st, complete)
                cells.append("%-4s %-5s" % (st, v))
                if v == "FAIL":
                    failures.append("%s %s  persona=%s  ->  %d   sites: %s"
                                    % (method, path, s["key"], st,
                                       ", ".join(call_sites[:3])))
                elif v == "DEAD":
                    dead.append("%s %s  persona=%s  (no answer)" % (method, path, s["key"]))
                elif v == "GAP" and s is sessions[0]:
                    gaps.append("%s %s%s  (sites: %s)"
                                % (method, path, "?" + query if query else "",
                                   ", ".join(call_sites[:2])))
            shown = path if len(path) <= 46 else path[:43] + "..."
            print("  %-11s %-6s %-46s" % (guard, method, shown)
                  + "".join("%-13s" % c for c in cells))

        if gaps:
            print()
            print("  NOT COVERED -- %d target(s) whose URL could not be built from the "
                  "source alone:" % len(gaps))
            for g in gaps:
                print("    %s" % g)
            print("    A query key with no safe value, or a path segment supplied at "
                  "runtime. Probing one anyway returns a status for a URL V8 never")
            print("    requests, so these are named rather than filled in.")

        if args.agent:
            print()
            print("NEW-AGENT GET TARGETS  (the agent gates on the TOKEN only, never on "
                  "role, so a refusal here means the token did not arrive --")
            print("a weaker assertion than the VALC table above. A 404 IS worth "
                  "reporting: V8 routes these areas to the new agent by")
            print("RR_TEST_AGENT_AREAS, so a 404 means it routes somewhere that does "
                  "not serve them.")
            print()
            agent_404 = []
            for key in sorted(agent_targets, key=lambda k: (k[2], k[1])):
                route, method, path, guard = key
                if method != "GET":
                    continue
                query = "&".join(sorted(agent_targets[key]["query"]))
                s = sessions[0]
                url, st, body, complete = probe_one(route, method, path, query,
                                                    s["token"], s["agent"], s["uid"])
                if not complete:
                    print("    %-52s --   GAP" % path)
                    continue
                mark = "OK"
                if st == 0:
                    mark, _ = "DEAD", dead.append("agent %s (no answer)" % path)
                elif st in REFUSED:
                    mark = "FAIL"
                    failures.append("agent GET %s  persona=%s  ->  %d"
                                    % (path, s["key"], st))
                elif st >= 500:
                    mark = "FAIL"
                    failures.append("agent GET %s  persona=%s  ->  %d"
                                    % (path, s["key"], st))
                elif st == 404:
                    mark = "404?"
                    agent_404.append("%s  (sites: %s)"
                                     % (path, ", ".join(agent_targets[key]["sites"][:2])))
                print("    %-52s %s %s" % (path, st, mark))

            if agent_404:
                print()
                print("    %d new-agent area(s) answered 404. V8 lists each of these in "
                      "RR_TEST_AGENT_AREAS, so it routes them to the" % len(agent_404))
                print("    new agent, and the new agent has no such mapping. Either the "
                      "handler is missing or the table entry is stale:")
                for a in agent_404:
                    print("      %s" % a)

        # ---- controls, last ------------------------------------------------
        print()
        print("CONTROLS")
        admin_session = next((s for s in sessions if s["admin"]), sessions[0])

        # C2 first among the reported lines, because everything below it is
        # meaningless if the service is not answering.
        st_ping, _ = http("GET", VALC_BASE + "/api/v1/auth/ping",
                          token=admin_session["token"])
        st_good, _ = http("GET", VALC_BASE + "/api/v1/tenant/client",
                          token=admin_session["token"])
        c2 = (st_ping == 200 and st_good == 200)
        print("  %s  C2 positive control: /auth/ping=%s  /tenant/client=%s"
              % ("PASS" if c2 else "FAIL", st_ping, st_good))
        if not c2:
            inconclusive.append("C2 positive control failed: ping=%s tenant/client=%s "
                                "-- the run above cannot be read as findings"
                                % (st_ping, st_good))

        # C3 -- the persona is genuinely not an operator.
        c3_all = True
        for s in sessions:
            st_op, _ = http("GET", VALC_BASE + "/api/v1/admin/users", token=s["token"])
            ok = (st_op == 403)
            c3_all = c3_all and ok
            print("  %s  C3 %-13s operator prefix refused: /api/v1/admin/users -> %s"
                  % ("PASS" if ok else "FAIL", s["key"], st_op))
            if not ok:
                failures.append("C3 %s reached the operator prefix (%d) -- the persona "
                                "is not least-privileged and every verdict above is "
                                "suspect" % (s["key"], st_op))

        # C1 -- reconstruct VLC-59 live: re-point tenant paths at the operator
        # prefix and require refusals. Without this, a run where every gate had
        # been quietly removed would look exactly like a clean one.
        rewritten = sorted(set(k[2] for k in valc_targets
                               if k[2].startswith("api/v1/tenant/")))
        c1_hits = 0
        for path in rewritten:
            mutant = ("api/v1/admin/" + path[len("api/v1/tenant/"):]) \
                .replace("{}", str(admin_session["uid"]))
            st_m, _ = http("GET", VALC_BASE + "/" + mutant, token=admin_session["token"])
            if st_m in REFUSED:
                c1_hits += 1
        if not rewritten:
            # No tenant path to re-point. Reached when the manifest is already
            # the VLC-59 mutant (Tools/_persona/make-vlc59-manifest.py), where
            # every tenant path has been rewritten to the operator prefix. Say
            # that, rather than "the gate is broken" -- the control could not be
            # built, which is a different statement.
            print("  ----  C1 control not built: the manifest contains no "
                  "api/v1/tenant/ path to re-point")
        else:
            c1 = (c1_hits == len(rewritten))
            print("  %s  C1 VLC-59 reconstruction: %d/%d tenant paths refused on the "
                  "operator prefix" % ("PASS" if c1 else "FAIL", c1_hits, len(rewritten)))
            if not c1:
                failures.append("C1 only %d of %d re-pointed paths were refused -- the "
                                "operator gate is not doing what this run assumes"
                                % (c1_hits, len(rewritten)))
    finally:
        # C4. Pattern delete, not id delete -- see the module docstring.
        try:
            sql("DELETE FROM users WHERE email LIKE '%%@" + PROBE_DOMAIN + "';")
        except Exception as exc:
            failures.append("C4 CLEANUP FAILED: %s -- probe accounts may still exist"
                            % exc)
        try:
            left = sql("SELECT count(*) FROM users WHERE email LIKE '%%@"
                       + PROBE_DOMAIN + "';")
            orphan = sql("SELECT count(*) FROM user_database_permissions p "
                         "LEFT JOIN users u ON u.id = p.user_id WHERE u.id IS NULL;")
            now_users = sql("SELECT count(*) FROM users WHERE deleted_at IS NULL;")
            now_ops = sql("SELECT count(*) FROM users WHERE valc_operator;")
            clean = (left == "0" and orphan == "0"
                     and now_users == base_users and now_ops == base_ops)
            print("  %s  C4 cleanup: probe rows=%s orphan perms=%s users %s->%s "
                  "operators %s->%s" % ("PASS" if clean else "FAIL", left, orphan,
                                        base_users, now_users, base_ops, now_ops))
            if not clean:
                failures.append("C4 cleanup left state behind: probe rows=%s orphan "
                                "perms=%s users %s->%s operators %s->%s"
                                % (left, orphan, base_users, now_users,
                                   base_ops, now_ops))
        except Exception as exc:
            print("  FAIL  C4 cleanup could not be verified: %s" % exc)
            failures.append("C4 cleanup unverified: %s" % exc)

    print()
    if inconclusive:
        print("INCONCLUSIVE -- do not read the table above as findings:")
        for i in inconclusive:
            print("  %s" % i)
        return 2
    if dead:
        print("NO ANSWER on %d probe(s):" % len(dead))
        for d in dead[:10]:
            print("  %s" % d)
    if failures:
        print("FAILURES (%d):" % len(failures))
        for f in failures:
            print("  %s" % f)
        return 1
    print("every call site V8 makes answers for a least-privileged customer, and "
          "every control holds")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
