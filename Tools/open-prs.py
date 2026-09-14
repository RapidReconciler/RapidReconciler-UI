#!/usr/bin/env python3
"""open-prs.py -- list every OPEN pull request across the five RR repos.

    python Tools/open-prs.py

WHY THIS EXISTS. Nothing in the session-start routine looked at open PRs, so two
sat invisible until 2026-09-14: a doc-dates bot PR from a FAILED run (one day),
and RapidReconciler-Agent#80 (ELEVEN WEEKS). Neither was hiding -- nobody was
looking. State nobody looks at drifts from reality, and the drift is silent.

⚠ AGE IS NOT A VERDICT, AND THIS SCRIPT DELIBERATELY DOES NOT IMPLY IT IS.
Agent#80 read like abandoned work at eleven weeks. It was not: all three fields
it added were already on main, merged under #81 with an audit log on top. Closing
it on age would have been right by accident. So this prints facts -- age, checks,
mergeability -- and no recommendation. Check what a PR CONTAINS against main
before acting on it.

⚠ A ZERO IS NOT A RESULT (hard rule 4). An empty listing could mean "nothing is
open" or "the query is broken / gh is not authenticated / the repo name is
wrong". So every run ends with a CONTROL: the most recent CLOSED PR numbers from
one repo. If the control is empty too, do not read the zero as good news.

⚠ THE REPO NAME IS NOT THE DIRECTORY NAME. The UI repo was renamed to
RapidReconciler-UI on GitHub; the local clone still uses the old
RapidReconciler-AI directory name. Both spellings are correct in their own
context and neither should be "fixed" to match the other.
"""
import json
import subprocess
import sys
from datetime import datetime, timezone

# gh is not on the PATH the Bash tool sees; the full path is the reliable form.
GH = r"C:\Program Files\GitHub CLI\gh.exe"

# (github repo name, local directory name) -- they differ for the UI repo.
REPOS = [
    ("RapidReconciler-UI",    "RapidReconciler-AI"),
    ("RapidReconciler-Agent", "RapidReconciler-Agent"),
    ("RapidReconciler-Valc",  "RapidReconciler-Valc"),
    ("RapidReconciler-DB",    "RapidReconciler-DB"),
    ("RapidReconciler-SSIS",  "RapidReconciler-SSIS"),
]

OWNER = "RapidReconciler"


def gh_json(args):
    """Run gh and parse JSON. Returns (data, error_string)."""
    try:
        p = subprocess.run([GH] + args, capture_output=True, text=True, timeout=90)
    except FileNotFoundError:
        return None, "gh.exe not found at %s" % GH
    except subprocess.TimeoutExpired:
        return None, "gh timed out"
    if p.returncode != 0:
        return None, (p.stderr or p.stdout).strip().splitlines()[0] if (p.stderr or p.stdout) else "exit %d" % p.returncode
    try:
        return json.loads(p.stdout or "[]"), None
    except json.JSONDecodeError as e:
        return None, "unparseable JSON: %s" % e


def age_days(iso):
    try:
        then = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except Exception:
        return None
    return (datetime.now(timezone.utc) - then).days


def render(pr, counted_flags=None):
    """Format one PR row. Split out so --self-test can exercise it against real
    data: with every repo at zero open, the formatting path would otherwise never
    run, and a clean listing would prove only that the loop body was skipped."""
    d = age_days(pr["createdAt"])
    age = ("%dd" % d) if d is not None else "?"
    flags = []
    if pr.get("isDraft"):
        flags.append("DRAFT")
    if pr.get("mergeable") == "CONFLICTING":
        flags.append("CONFLICTING")
    # A month-old PR is worth a second look, but see the header: this is a prompt
    # to go and check what it contains, never a verdict.
    if d is not None and d >= 30:
        flags.append("STALE?")
    if counted_flags is not None:
        counted_flags.extend(flags)
    tail = ("  [%s]" % " ".join(flags)) if flags else ""
    return ("    #%-5s %-6s %-34s %s%s\n           by %s, opened %s"
            % (pr["number"], age, pr["headRefName"][:34], pr["title"][:46], tail,
               pr["author"]["login"], pr["createdAt"][:10]))


def self_test():
    """Two halves, and they prove different things.

    A: render REAL closed PRs -- proves the field access works against live gh
       output, which a listing of zero open PRs never exercises.
    B: render SYNTHETIC records with known ages and states -- proves each flag
       actually fires. This half is deterministic on purpose.

    ⚠ B USED TO BE PART OF A, AND THAT WAS WRONG. The first version asserted
    STALE? must fire across "the 5 most recent closed PRs"; it went red because
    those five were 0-3 days old, which is the flag behaving CORRECTLY. An
    assertion whose truth depends on how recently somebody happened to merge
    something is not an assertion. The flag logic is now tested on data this
    file controls.
    """
    print("open-prs.py --self-test")
    fails = 0

    # ---- A: real data ----
    data, err = gh_json([
        "pr", "list", "-R", "%s/RapidReconciler-Agent" % OWNER, "--state", "closed",
        "--limit", "3", "--json",
        "number,title,headRefName,author,createdAt,isDraft,mergeable",
    ])
    if err is not None or not data:
        print("  FAIL  A: could not fetch closed PRs to render (%s)" % (err or "empty"))
        fails += 1
    else:
        for pr in data:
            line = render(pr)
            if ("#%s" % pr["number"]) not in line:
                print("  FAIL  A: rendered row omits the PR number"); fails += 1
            print(line)
        print("  ok    A: rendered %d real PR rows against live gh output" % len(data))

    # ---- B: flag logic, on records this file controls ----
    old_iso = "2026-06-26T23:23:52Z"     # Agent#80's real opening date: 80+ days
    cases = [
        ("STALE? on an aged PR",
         {"number": 1, "title": "t", "headRefName": "b", "author": {"login": "x"},
          "createdAt": old_iso, "isDraft": False, "mergeable": "MERGEABLE"},
         "STALE?", True),
        ("no STALE? on a fresh PR",
         {"number": 2, "title": "t", "headRefName": "b", "author": {"login": "x"},
          "createdAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
          "isDraft": False, "mergeable": "MERGEABLE"},
         "STALE?", False),
        ("CONFLICTING is surfaced",
         {"number": 3, "title": "t", "headRefName": "b", "author": {"login": "x"},
          "createdAt": old_iso, "isDraft": False, "mergeable": "CONFLICTING"},
         "CONFLICTING", True),
        ("DRAFT is surfaced",
         {"number": 4, "title": "t", "headRefName": "b", "author": {"login": "x"},
          "createdAt": old_iso, "isDraft": True, "mergeable": "MERGEABLE"},
         "DRAFT", True),
    ]
    for label, pr, token, want in cases:
        got = token in render(pr)
        if got == want:
            print("  ok    B: %s" % label)
        else:
            print("  FAIL  B: %s (token %r present=%s, expected %s)"
                  % (label, token, got, want))
            fails += 1

    print("\n" + ("SELF-TEST PASSED" if fails == 0 else "%d SELF-TEST FAILURE(S)" % fails))
    return 1 if fails else 0


def main():
    if "--self-test" in sys.argv[1:]:
        return self_test()
    total = 0
    broken = []
    print("OPEN PULL REQUESTS -- all five RR repos")
    print("=" * 78)

    for repo, _dirname in REPOS:
        data, err = gh_json([
            "pr", "list", "-R", "%s/%s" % (OWNER, repo), "--state", "open",
            "--json", "number,title,headRefName,author,createdAt,isDraft,mergeable",
        ])
        if err is not None:
            broken.append(repo)
            print("\n  %-24s  QUERY FAILED: %s" % (repo, err))
            continue

        if not data:
            print("\n  %-24s  none open" % repo)
            continue

        print("\n  %s  (%d open)" % (repo, len(data)))
        for pr in sorted(data, key=lambda r: r["createdAt"]):
            total += 1
            print(render(pr))

    print("\n" + "=" * 78)
    print("TOTAL OPEN: %d" % total)

    # ---- CONTROL: prove the query works, so a zero means something ----
    ctl, cerr = gh_json([
        "pr", "list", "-R", "%s/RapidReconciler-UI" % OWNER, "--state", "closed",
        "--limit", "3", "--json", "number",
    ])
    if cerr is not None:
        print("CONTROL FAILED (%s) -- do NOT read the count above as a result." % cerr)
        return 2
    if not ctl:
        print("CONTROL RETURNED NOTHING -- the listing is not trustworthy.")
        return 2
    print("control: closed PRs on RapidReconciler-UI = %s (so the query works)"
          % ",".join(str(p["number"]) for p in ctl))

    if broken:
        print("⚠ %d repo(s) failed to answer: %s -- their count is UNKNOWN, not zero."
              % (len(broken), ", ".join(broken)))
        return 2

    if total:
        print("\nBefore acting on any of these: check what the PR CONTAINS against main.")
        print("Age is not a verdict -- Agent#80 looked abandoned at 11 weeks and was")
        print("actually already merged under #81.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
