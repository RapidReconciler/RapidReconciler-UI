#!/usr/bin/env python3
"""Append entries to release-notes.html for new commits in a BEFORE..AFTER range.

Invoked by .github/workflows/update-release-notes.yml on every push to main.
For each commit in the range that isn't filtered out, builds an <article>
block and inserts it directly after the RELEASE_NOTES_INSERTION_POINT marker
so the newest entry stays at the top of the rendered page.

Filtering rules (commits skipped):
  - Subject or body contains: [skip release notes], [skip-release-notes], [skip ci]
  - Subject starts with:      "chore: refresh search indices"   (auto-regen workflow)
  - Subject starts with:      "chore: append release notes"     (this workflow's own commits)

Common trailers (Co-Authored-By, Signed-off-by, etc.) are stripped from the body
before rendering, since they aren't useful in release notes.
"""

import html
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

REPO_URL    = "https://github.com/RapidReconciler/RapidReconciler-AI"
NOTES_FILE  = Path("release-notes.html")
MARKER      = "<!-- RELEASE_NOTES_INSERTION_POINT -->"

# Cap on how many <article class="rn-entry"> blocks live on the page. After
# every prepend the script trims the oldest entries past this count so the
# file doesn't grow indefinitely. Older changes remain reachable via the
# GitHub commit-history link in the page footer.
MAX_ENTRIES = 100

SKIP_MARKERS  = ("[skip release notes]", "[skip-release-notes]", "[skip ci]")
SKIP_PREFIXES = ("chore: refresh search indices", "chore: append release notes")

# git log format: SHA \x1f ISODATE \x1f SUBJECT \x1f BODY \x1e (one record per commit)
GIT_FMT = "%H%x1f%aI%x1f%s%x1f%b%x1e"

# Known git trailer keys we strip from the body so the release-notes entry
# shows the prose only. A line starting with one of these followed by ": "
# at the very end of the body is treated as a trailer.
TRAILER_KEYS = (
    "co-authored-by", "signed-off-by", "reviewed-by", "acked-by",
    "reported-by", "tested-by", "helped-by", "suggested-by",
    "fixes", "closes", "resolves", "refs",
)
TRAILER_RE = re.compile(
    r"^(?:" + "|".join(TRAILER_KEYS) + r"):\s",
    re.IGNORECASE,
)


def run(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, check=True).stdout


def get_commits(before: str, after: str):
    if not before or before == "0" * 40:
        ref_range = "HEAD~1..HEAD"
    else:
        ref_range = f"{before}..{after}"
    out = run(["git", "log", "--reverse", "--no-merges", f"--pretty=format:{GIT_FMT}", ref_range])
    commits = []
    for record in (r for r in out.strip("\x1e").split("\x1e") if r.strip()):
        parts = record.strip().split("\x1f")
        if len(parts) < 4:
            continue
        commits.append({
            "sha":     parts[0],
            "date":    parts[1],
            "subject": parts[2],
            "body":    parts[3].strip(),
        })
    return commits


def should_skip(commit) -> bool:
    full = commit["subject"] + "\n" + commit["body"]
    if any(m in full for m in SKIP_MARKERS):
        return True
    if any(commit["subject"].startswith(p) for p in SKIP_PREFIXES):
        return True
    return False


def strip_trailers(body: str) -> str:
    # Drop trailing trailer-block lines whose key matches a known git trailer.
    # Conservative: only strips a known set so a sentence like "Note: ..." at
    # the end of a body paragraph isn't accidentally treated as a trailer.
    lines = body.split("\n")
    while lines and TRAILER_RE.match(lines[-1] or ""):
        lines.pop()
    # Also strip any blank line that fell at the new end of the body
    while lines and not lines[-1].strip():
        lines.pop()
    return "\n".join(lines).rstrip()


def render_paragraphs(text: str) -> str:
    text = text.strip()
    if not text:
        return ""
    out = []
    for paragraph in re.split(r"\n\s*\n", text):
        joined = " ".join(line.strip() for line in paragraph.split("\n") if line.strip())
        if joined:
            out.append(f"      <p>{html.escape(joined)}</p>")
    return "\n".join(out)


def build_entry(commit) -> str:
    short_sha   = commit["sha"][:7]
    dt          = datetime.fromisoformat(commit["date"])
    iso_date    = dt.strftime("%Y-%m-%d")
    pretty_date = dt.strftime("%B %-d, %Y")
    body        = strip_trailers(commit["body"])
    text        = commit["subject"] if not body else commit["subject"] + "\n\n" + body
    paras       = render_paragraphs(text)
    return (
        f'  <article class="rn-entry" data-sha="{short_sha}">\n'
        f'    <div class="rn-entry-meta">\n'
        f'      <time class="rn-entry-date" datetime="{iso_date}">{pretty_date}</time>\n'
        f'      <a class="rn-entry-sha" href="{REPO_URL}/commit/{commit["sha"]}" target="_blank" rel="noopener">{short_sha}</a>\n'
        f'    </div>\n'
        f'    <div class="rn-entry-body">\n'
        f'{paras}\n'
        f'    </div>\n'
        f'  </article>'
    )


ARTICLE_RE = re.compile(
    r'  <article class="rn-entry"[^>]*>.*?</article>',
    re.DOTALL,
)


def trim_to_cap(text: str, max_entries: int = MAX_ENTRIES) -> tuple[str, int]:
    """Drop the oldest <article> blocks once total exceeds max_entries.

    Returns (new_text, removed_count). Content after the last article (the
    history-note div and the </main> tag) is preserved verbatim.
    """
    matches = list(ARTICLE_RE.finditer(text))
    if len(matches) <= max_entries:
        return text, 0
    keep_end  = matches[max_entries - 1].end()  # end of the Nth (oldest kept) article
    drop_end  = matches[-1].end()               # end of the very last (oldest) article
    removed   = len(matches) - max_entries
    new_text  = text[:keep_end] + text[drop_end:]
    return new_text, removed


def main(before: str, after: str):
    commits = get_commits(before, after)
    if not commits:
        print("No commits in range.")
        return
    keep = [c for c in commits if not should_skip(c)]
    if not keep:
        print(f"All {len(commits)} commit(s) filtered out by skip rules.")
        return

    # git log --reverse → oldest-first. We want newest at the top of the page,
    # so reverse here and join with blank-line separators.
    keep_newest_first = list(reversed(keep))
    new_block = "\n\n".join(build_entry(c) for c in keep_newest_first)

    text = NOTES_FILE.read_text(encoding="utf-8")
    if MARKER not in text:
        raise SystemExit(f"Marker '{MARKER}' not found in {NOTES_FILE}")

    pre, post = text.split(MARKER, 1)
    # Normalize the gap between marker and the existing first entry to exactly one blank line.
    post = re.sub(r"^\n+", "\n\n", post, count=1)
    updated = pre + MARKER + "\n\n" + new_block + post

    # Enforce the page-length cap by dropping the oldest entries past MAX_ENTRIES.
    updated, removed = trim_to_cap(updated)

    NOTES_FILE.write_text(updated, encoding="utf-8")
    msg = f"Appended {len(keep)} entry/entries from {len(commits)} commit(s) in range."
    if removed:
        msg += f" Trimmed {removed} oldest entry/entries to keep page under {MAX_ENTRIES}."
    print(msg)


if __name__ == "__main__":
    main(
        sys.argv[1] if len(sys.argv) > 1 else "",
        sys.argv[2] if len(sys.argv) > 2 else "HEAD",
    )
