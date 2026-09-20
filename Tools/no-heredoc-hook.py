#!/usr/bin/env python3
"""PreToolUse hook: refuse Bash commands that open a heredoc.

Hard rule 8 says file content never goes through a bash heredoc. Re-reading the
rule has demonstrably not worked -- it was broken six times across four
sessions, twice in one day on throwaway commands. So the rule gets a gate.

Blocks the heredoc operator `<<`. Deliberately does NOT block:

  * `<<<`  -- a here-STRING is a different operator with a different failure
             mode, and blocking it would make the gate fire on things rule 8
             does not cover. A gate that cries wolf is one you learn to skip.
  * `<<` with nothing word-shaped after it, e.g. `grep "<<"` -- searching FOR
             heredocs is not writing one.

Exit 0 = allow. Exit 2 = block, and stderr goes back to the model.
"""

import json
import re
import sys

# `<<`, not `<<<`, optional `-` (tab-stripping form), optional whitespace,
# optional quote, then a word character -- i.e. the start of a delimiter token.
#
# BOTH guards on the `<` are load-bearing and the test suite proved it: with
# only the lookahead, `<<< "one line"` still matched, because the engine
# re-tried at offset 1 where the 2nd and 3rd `<` form a `<<` that is not
# followed by another one.
HEREDOC = re.compile(r"(?<!<)<<(?!<)-?[ \t]*(['\"]?)[A-Za-z_]")

MESSAGE = (
    "BLOCKED by hard rule 8: this Bash command opens a heredoc.\n"
    "\n"
    "File content never goes through a bash heredoc -- the shell eats "
    "backslash escapes and mis-parses quotes, and the failure is either a "
    "syntax error costing a retry or silent corruption of a real file.\n"
    "\n"
    "Use the Write tool for new files and the Edit tool for changes. For "
    "multi-line input to a command, write the input to a file in the "
    "scratchpad first and redirect from it with `<`.\n"
    "\n"
    "Offending fragment: {frag}"
)


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, ValueError):
        # A hook that cannot parse its own input must not block real work.
        return 0

    if payload.get("tool_name") != "Bash":
        return 0

    command = (payload.get("tool_input") or {}).get("command")
    if not isinstance(command, str):
        return 0

    match = HEREDOC.search(command)
    if not match:
        return 0

    start = max(0, match.start() - 30)
    frag = command[start:match.end() + 20].replace("\n", " ")
    print(MESSAGE.format(frag=frag), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
