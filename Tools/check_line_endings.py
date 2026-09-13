#!/usr/bin/env python3
"""
check_line_endings.py -- fail the build if a tracked text file carries mixed line
endings in the REPOSITORY, or if the *.js normalisation rule has been removed.

    python Tools/check_line_endings.py

WHY THIS EXISTS
---------------
RRV8/config.js spent an unknown length of time as the only mixed-ending blob in
the repository, and the symptom was not a broken page -- it was a bot proposing
the same 678-line no-op forever.

Tools/build-ai-grounding.py rewrites a marker-delimited block inside config.js
with Path.write_text(newline=""), which writes exactly the bytes it is handed and
performs no newline translation. The block therefore carried the generator's
endings while the rest of the file carried the repository's. Every run of the
grounding workflow produced a diff that `git diff --ignore-cr-at-eol` shows to be
carriage returns and nothing else. Harmless, and indistinguishable at a glance
from a real regeneration, which is what makes it expensive: the next person has to
re-derive that it is noise before they can trust the one that is not.

`*.js text eol=lf` in .gitattributes fixes it by normalising on staging, so the
generator can write whatever it likes and the index still receives LF. Deleting
that line silently restores the churn. This gate is the sink for that.

WHAT IT ASSERTS, AND WHY IT ASKS GIT RATHER THAN READING A FILE
--------------------------------------------------------------
1. No tracked file is `i/mixed`. `git ls-files --eol` reports the INDEX and the
   WORKTREE separately, which is the distinction this whole problem turns on --
   a CRLF working copy on a Windows box is normal and is not what matters.
2. `git check-attr` resolves `text` to `set` for a representative .js path. That
   asks git's own attribute machinery for the answer rather than grepping
   .gitattributes for a line, so a rule that is present but overridden (by
   .git/info/attributes, say) still fails here.

Exit 0 clean, 1 on a finding, 2 if git could not be asked at all -- an unaskable
instrument is not a pass.
"""
from __future__ import annotations

import subprocess
import sys

# A path that must resolve to text=set. Named rather than discovered: this is the
# file the rule exists for, and if it ever stops being tracked that is itself
# worth failing on.
CANARY = "RRV8/config.js"


def git(*args: str) -> str:
    try:
        out = subprocess.run(["git", *args], capture_output=True, text=True, check=False)
    except FileNotFoundError:
        print("FAIL  git is not on PATH, so nothing here was actually checked.")
        raise SystemExit(2)
    if out.returncode != 0:
        print("FAIL  `git %s` exited %d:\n%s" % (" ".join(args), out.returncode, out.stderr.strip()))
        raise SystemExit(2)
    return out.stdout


def main() -> int:
    findings = []

    # ---- 1. no mixed-ending blobs -------------------------------------------
    eol = git("ls-files", "--eol")
    lines = [ln for ln in eol.splitlines() if ln.strip()]
    if not lines:
        print("FAIL  `git ls-files --eol` returned nothing. Either this is not a work "
              "tree or the instrument is broken; a zero here is not a pass.")
        return 2
    mixed = [ln for ln in lines if ln.split()[0] == "i/mixed"]
    print("scanned %d tracked path(s)" % len(lines))
    if mixed:
        findings.append(
            "%d tracked file(s) carry MIXED line endings in the repository:\n    %s\n"
            "  Mixed endings make every rewrite of the file look like a whole-file\n"
            "  change. Normalise with `git add --renormalize -- <path>` once the\n"
            "  matching .gitattributes rule is in place."
            % (len(mixed), "\n    ".join(m.split("\t")[-1] for m in mixed))
        )
    else:
        print("ok    no mixed-ending blobs")

    # ---- 2. the *.js rule still resolves ------------------------------------
    attr = git("check-attr", "text", "--", CANARY).strip()
    # Format: "<path>: text: <value>"
    value = attr.rsplit(":", 1)[-1].strip() if ":" in attr else ""
    if value != "set":
        findings.append(
            "`git check-attr text -- %s` resolved to %r, expected 'set'.\n"
            "  The `*.js text eol=lf` rule in .gitattributes is missing or overridden.\n"
            "  Without it the AI-grounding generator's block rewrite reaches the index\n"
            "  as a carriage-return-only diff and the grounding bot proposes a no-op\n"
            "  PR on every run." % (CANARY, value or attr)
        )
    else:
        print("ok    %s resolves text=set" % CANARY)

    if findings:
        print()
        for f in findings:
            print("FAIL  " + f)
        return 1
    print("\nPASS  line endings clean")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
