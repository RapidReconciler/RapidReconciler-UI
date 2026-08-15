#!/usr/bin/env python3
"""
build-ai-grounding.py -- Generate the in-app AI grounding catalogs FROM the
knowledge-base docs, so RRV8/config.js no longer carries hand-authored
paraphrases that silently drift from the real docs.

WHAT IT DOES
------------
RRV8/config.js exposes six grounding catalogs that six AI surfaces read and
inject into the /api/v1/ai/explain prompt:

    window.RRV8.ACCT_GROUNDING
    window.RRV8.ANALYST_GROUNDING
    window.RRV8.CARDEX_GROUNDING
    window.RRV8.ROLLFORWARD_GROUNDING
    window.RRV8.ASOF_GROUNDING
    window.RRV8.ADMIN_GROUNDING

Those six assignments live inside a marker-delimited block (mirrors the repo's
release-notes insertion-point pattern):

    // <<AI-GROUNDING GENERATED START -- do not edit by hand>>
    ... the six assignments ...
    // <<AI-GROUNDING GENERATED END>>

This script rewrites that block. For every topic in GENERATE (below) it extracts
the authoritative readable text from that topic's SOURCE docs and emits a fresh
`window.RRV8.<TOPIC>_GROUNDING = [ ... ].join('\\n');` assignment. Every other
topic is PASSED THROUGH verbatim -- its current hand-authored content is kept
byte-for-byte so a working catalog never regresses.

The six *consuming* AI surfaces are never touched: the RRV8.*_GROUNDING interface
is preserved exactly; only the string CONTENT changes.

TOPIC -> SOURCE MAP
-------------------
ADMIN is generated from the RRUniversity administrator docs via the HTMLParser
extractor. The analyst / accountant catalogs generate from curated Markdown under
AnalysisGuides/_catalog/ -- the ```grounding fence is lifted byte-for-byte and the
prose around it is authoring context the AI never sees. That indirection exists
because the long-form AnalysisGuides/*.md references have no liftable concise
section: a mechanical extractor pointed at them would dump or truncate, which is a
regression. CARDEX and ANALYST read those catalogs today; ACCT, ROLLFORWARD and
ASOF stay passthrough until their catalog is authored. See
docs/plans/ai-grounding-from-docs.md.

USAGE
-----
    python build-ai-grounding.py            # run from anywhere; paths are repo-relative
    python build-ai-grounding.py --check    # verify block is up to date; non-zero if stale

No third-party dependencies (stdlib html.parser) so it runs in CI with no pip
install and on a box that cannot install Python packages.
"""

from __future__ import annotations

import html
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

# --------------------------------------------------------------------------
# Configuration
# --------------------------------------------------------------------------

REPO_ROOT = Path(__file__).resolve().parent.parent
CONFIG_JS = REPO_ROOT / "RRV8" / "config.js"

MARKER_START = "  // <<AI-GROUNDING GENERATED START -- do not edit by hand>>"
MARKER_END = "  // <<AI-GROUNDING GENERATED END>>"

# Topics regenerated from docs on every run. Everything else in the block is
# preserved verbatim. Flip a topic to "generated" by adding it here AND giving
# it a SOURCES entry.
#
# ADMIN generates from HTML KB docs via the HTMLParser extractor. Analyst /
# accountant topics generate from a curated Markdown catalog under
# AnalysisGuides/_catalog/ (the ```grounding fence is lifted verbatim), plus the
# shared-core invariants tagged for that catalog in _catalog/_core.md. The read
# path is chosen per topic by source extension (.md vs .html).
GENERATE = ("ADMIN", "CARDEX", "ANALYST")

# The single-source shared-core catalog: cross-role invariants authored once and
# composed into each role catalog the generator builds (see load_core_invariants).
CORE_CATALOG = "AnalysisGuides/_catalog/_core.md"

# Which role brain each grounding topic belongs to. Drives shared-core selection:
# an invariant tagged `role:analyst` composes into every analyst topic; a topic
# tagged `topic:cardex` composes into cardex only. Keeps the transaction topic
# (ANALYST) distinct from the analyst role that spans all four analyst topics.
ROLE_OF = {
    "ACCT": "accountant",
    "ANALYST": "analyst",
    "CARDEX": "analyst",
    "ROLLFORWARD": "analyst",
    "ASOF": "analyst",
    "ADMIN": "admin",
}

# TOPIC -> ordered list of source doc paths (repo-relative). Only topics in
# GENERATE are read; the rest are documentation of intent.
SOURCES = {
    # administrator-start-here.html is intentionally EXCLUDED: it's an
    # onboarding hub (data-retention prose, a vocabulary glossary, a self-check
    # quiz) that is noise on every admin AI call. Ground on the four PROCEDURE
    # docs only ("all signal, no noise"). Add it back only if answers show a
    # concrete orientation gap that isn't better fixed in a procedure doc.
    "ADMIN": [
        "RRUniversity/administrator-managing-users.html",
        "RRUniversity/administrator-managing-companies.html",
        "RRUniversity/administrator-complex-password.html",
        "RRUniversity/rapidreconciler-licensing.html",
    ],
    # CARDEX is generated from a curated Markdown catalog (the distilled analyst
    # brain), NOT from the 749-line reference: the ```grounding fence in this file
    # is lifted verbatim, then _core.md invariants tagged for it are composed in.
    "CARDEX": ["AnalysisGuides/_catalog/analyst/cardex.md"],
    # ANALYST reads TWO catalogs and the ORDER IS THE POINT: transaction.md is the
    # PATTERN half (what a per-document gap means), period-workflow.md is the
    # PROCESS half (which control, in what order). Pattern before process, because
    # the analyst decides materiality from the pattern before touching a button.
    # transaction.md was lifted element-for-element out of the hand-authored array
    # in config.js, so wiring this topic ADDS the process bullets rather than
    # replacing the playbook -- listing only period-workflow.md here would delete
    # 27 pattern bullets and still report success.
    "ANALYST": [
        "AnalysisGuides/_catalog/analyst/transaction.md",
        "AnalysisGuides/_catalog/analyst/period-workflow.md",
    ],
    # Passthrough-pending -- author the curated _catalog/*.md, then add here + to
    # GENERATE. Each seed distillation already lives under _grounding/*.md.
    "ACCT": [],         # -> _catalog/accountant/acct.md (seed: _grounding/acct.md; docs/plans/accounting-reference.md)
    "ROLLFORWARD": [],  # -> _catalog/analyst/rollforward.md (seed: _grounding/rollforward.md; MERGED, cannot be generated from the guide alone)
    "ASOF": [],         # -> _catalog/analyst/asof.md (seed: _grounding/asof.md; no single upstream guide)
}

# A short, human-readable label per generated HTML topic used in the block header.
# Markdown topics carry their own header line inside the fence and skip this.
TOPIC_LABELS = {
    "ADMIN": "RapidReconciler University administrator docs",
}

# --------------------------------------------------------------------------
# HTML -> readable plain text extraction (stdlib only)
# --------------------------------------------------------------------------

# Whole subtrees to drop -- chrome, nav, scripts, icons, controls.
SKIP_TAGS = frozenset(
    ("script", "style", "nav", "header", "footer", "aside", "svg", "button",
     "form", "select", "option", "noscript", "template")
)

# Any element whose class list intersects these is dropped with its subtree.
SKIP_CLASSES = frozenset(
    ("page-header", "doc-feedback", "feedback-band", "breadcrumb", "doc-header",
     "section-nav", "view-nav", "topic-nav", "tab-nav", "tabs", "sidebar",
     "sidebar-nav", "toc", "doc-toc", "back-to-top", "page-meta", "skip-link",
     "topic-footer-nav", "view-switcher", "doc-nav", "crumbs")
)

# Block-level elements that each start a fresh output line.
BLOCK_TAGS = frozenset(
    ("h1", "h2", "h3", "h4", "h5", "h6", "p", "li", "blockquote",
     "dt", "dd", "caption", "figcaption")
)
HEADING_TAGS = frozenset(("h1", "h2", "h3", "h4", "h5", "h6"))
VOID_TAGS = frozenset(
    ("br", "hr", "img", "meta", "link", "input", "source", "col", "area", "wbr")
)


def _classes(attrs):
    for k, v in attrs:
        if k == "class" and v:
            return v.split()
    return []


class Extractor(HTMLParser):
    """Walk an HTML doc and collect readable block-level text lines."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []          # list of dicts: {name, skip}
        self.skip_depth = 0      # >0 means inside a dropped subtree
        self.lines = []          # emitted output lines
        self.buf = []            # current block text fragments
        self.prefix = ""         # prefix for the current block ("- " for li)
        self.in_row = False
        self.row_cells = []
        self.cell_buf = []
        self.in_cell = False
        self.title = None
        self._in_title = False

    # -- block flushing ----------------------------------------------------
    def _flush_block(self):
        text = _collapse(" ".join(self.buf))
        if text:
            self.lines.append(self.prefix + text)
        self.buf = []
        self.prefix = ""

    def _flush_cell(self):
        text = _collapse(" ".join(self.cell_buf))
        if text:
            self.row_cells.append(text)
        self.cell_buf = []
        self.in_cell = False

    def _flush_row(self):
        cells = [c for c in self.row_cells if c]
        if cells:
            self.lines.append(" | ".join(cells))
        self.row_cells = []
        self.in_row = False

    # -- parser hooks ------------------------------------------------------
    def handle_starttag(self, tag, attrs):
        if tag == "title":
            self._in_title = True
            return
        skip = tag in SKIP_TAGS or bool(set(_classes(attrs)) & SKIP_CLASSES)
        if tag in VOID_TAGS:
            return
        self.stack.append({"name": tag, "skip": skip})
        if skip:
            self.skip_depth += 1
            return
        if self.skip_depth:
            return
        if tag == "tr":
            self._flush_block()
            self.in_row = True
            self.row_cells = []
            return
        if tag in ("td", "th"):
            self._flush_cell()
            self.in_cell = True
            self.cell_buf = []
            return
        if tag in BLOCK_TAGS:
            self._flush_block()
            self.prefix = "- " if tag == "li" else ""

    def handle_endtag(self, tag):
        if tag == "title":
            self._in_title = False
            return
        if tag in VOID_TAGS:
            return
        # Pop the matching stack frame (tolerate minor mismatches).
        popped = None
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i]["name"] == tag:
                popped = self.stack[i]
                del self.stack[i:]
                break
        if popped is None:
            return
        if popped["skip"]:
            self.skip_depth = max(0, self.skip_depth - 1)
            return
        if self.skip_depth:
            return
        if tag in ("td", "th"):
            self._flush_cell()
            return
        if tag == "tr":
            self._flush_cell()
            self._flush_row()
            return
        if tag in BLOCK_TAGS:
            self._flush_block()

    def handle_data(self, data):
        if self._in_title:
            self.title = _collapse((self.title or "") + " " + data)
            return
        # Inside a dropped subtree (script/style/nav/sidebar/etc.) -> ignore.
        if self.skip_depth:
            return
        if self.in_cell or self.in_row:
            # text inside a table row (in a cell, or stray between cells)
            self.cell_buf.append(data)
        else:
            self.buf.append(data)

    def close(self):
        super().close()
        self._flush_cell()
        self._flush_row()
        self._flush_block()


# Zero-width / BOM / directional marks that leak from source docs and add no
# readable value.
_ZERO_WIDTH_RE = re.compile("[﻿​‌‍⁠]")


def _collapse(s: str) -> str:
    s = _ZERO_WIDTH_RE.sub("", s.replace("\xa0", " "))
    return re.sub(r"\s+", " ", s).strip()


TITLE_SUFFIXES = (
    " — RapidReconciler University",
    " · RapidReconciler University",
    " - RapidReconciler University",
    " — RapidReconciler",
)


def clean_title(t: str | None, fallback: str) -> str:
    if not t:
        return fallback
    t = html.unescape(t)
    for suf in TITLE_SUFFIXES:
        if t.endswith(suf):
            t = t[: -len(suf)]
            break
    return _collapse(t) or fallback


def extract_doc_lines(path: Path) -> tuple[str, list[str]]:
    """Return (title, [readable lines]) for one HTML doc."""
    raw = path.read_text(encoding="utf-8")
    ext = Extractor()
    ext.feed(raw)
    ext.close()
    title = clean_title(ext.title, path.stem)

    seen = set()
    out = []
    for line in ext.lines:
        line = html.unescape(line).strip()
        # Drop trivially short fragments (stray labels, icon glyphs).
        core = line[2:] if line.startswith("- ") else line
        if len(core) < 3:
            continue
        key = re.sub(r"\s+", " ", line.lower())
        if key in seen:
            continue
        seen.add(key)
        out.append(line)
    return title, out


# --------------------------------------------------------------------------
# Markdown catalog extraction (the curated analyst / accountant brains)
# --------------------------------------------------------------------------
#
# A catalog .md is prose plus exactly one ```grounding fence. Only the fence is
# read, one line per grounding bullet, lifted BYTE-FOR-BYTE -- no reflow, no
# stripping, no Markdown interpretation. The prose outside the fence is authoring
# context (provenance, altitude, carried-over engineering notes) and never reaches
# the AI. That is the whole contract, and it is why the catalog files carry the
# line "Keep every line a single grounding bullet."

FENCE_OPEN = "```grounding"


def extract_md_fence(path: Path) -> list[str]:
    """Return the lines inside a .md file's single ```grounding fence."""
    raw = path.read_text(encoding="utf-8")
    lines = raw.replace("\r\n", "\n").split("\n")
    out: list[str] = []
    inside = False
    for line in lines:
        if not inside:
            if line.strip() == FENCE_OPEN:
                inside = True
            continue
        if line.startswith("```"):
            return out
        if line.strip() == "":
            # A blank line inside the fence would emit an empty grounding bullet.
            sys.stderr.write("  WARN: blank line inside the fence in %s -- dropped\n"
                             % path.name)
            continue
        out.append(line)
    if inside:
        raise SystemExit("ERROR: unterminated ```grounding fence in %s" % path)
    return out


def load_core_invariants(topic: str) -> list[str]:
    """Shared-core bullets from _core.md that this topic inherits.

    Format in _core.md: an `Applies:` line naming role / topic tokens, then a
    ```grounding fence holding that invariant's bullets. The nearest `Applies:`
    line above a fence governs it. A fence with no `Applies:` above it is skipped
    with a warning rather than silently inherited everywhere.
    """
    path = REPO_ROOT / CORE_CATALOG
    if not path.exists():
        sys.stderr.write("  WARN: shared-core catalog not found: %s\n" % CORE_CATALOG)
        return []
    role = ROLE_OF.get(topic, "")
    wanted = {"all", "role:%s" % role, "topic:%s" % topic.lower()}

    out: list[str] = []
    applies: set[str] | None = None
    inside = False
    take = False
    for line in path.read_text(encoding="utf-8").replace("\r\n", "\n").split("\n"):
        if not inside:
            if line.startswith("Applies:"):
                applies = {
                    t.strip().lower()
                    for t in line.split(":", 1)[1].split(",")
                    if t.strip()
                }
                continue
            if line.strip() == FENCE_OPEN:
                inside = True
                if applies is None:
                    sys.stderr.write(
                        "  WARN: %s has a grounding fence with no Applies: line "
                        "above it -- skipped\n" % CORE_CATALOG)
                    take = False
                else:
                    take = bool(applies & wanted)
                applies = None
            continue
        if line.startswith("```"):
            inside = False
            take = False
            continue
        if take and line.strip():
            out.append(line)
    return out


def build_md_lines(topic: str) -> list[str]:
    """Payload for a topic generated from curated Markdown catalogs.

    Emission order is deliberate: the first catalog's POLICY header line, then the
    shared-core invariants (`_core.md` authors them once; they sit AHEAD of the
    catalog's own bullets), then each catalog's bullets in SOURCES order. For
    ANALYST that puts pattern before process, which is the order the analyst
    reasons in -- what the gap means, then which control to use.
    """
    core = load_core_invariants(topic)
    lines: list[str] = []
    core_emitted = False
    seen: set[str] = set()

    def add(s: str) -> None:
        if s in seen:
            sys.stderr.write("  NOTE: duplicate grounding bullet dropped: %s...\n" % s[:60])
            return
        seen.add(s)
        lines.append(s)

    for rel in SOURCES[topic]:
        path = REPO_ROOT / rel
        if not path.exists():
            sys.stderr.write("  WARN: source not found: %s\n" % rel)
            continue
        fence = extract_md_fence(path)
        if not fence:
            sys.stderr.write("  WARN: no ```grounding fence content in %s\n" % rel)
            continue
        body = fence
        if not fence[0].startswith("- "):
            add(fence[0])          # the catalog's own POLICY header line
            body = fence[1:]
        if not core_emitted:
            for inv in core:
                add(inv)
            core_emitted = True
        for b in body:
            add(b)

    if not lines:
        raise SystemExit(
            "ERROR: topic %s is in GENERATE but produced no grounding lines -- "
            "refusing to overwrite a working catalog with nothing" % topic)
    return lines


# --------------------------------------------------------------------------
# JS string emission
# --------------------------------------------------------------------------

def js_escape(s: str) -> str:
    """Escape a Python string for a single-quoted ES5 string literal."""
    s = s.replace("\\", "\\\\").replace("'", "\\'")
    s = s.replace("\r", "").replace("\n", " ")
    return s


def build_generated_lines(topic: str) -> list[str]:
    """Build the array-of-strings payload for a generated topic.

    The read path is chosen by source extension: curated Markdown catalogs are
    lifted from their ```grounding fence, HTML KB docs go through the HTMLParser
    extractor. A topic mixing the two is rejected rather than half-read -- the two
    paths produce different shapes (fence bullets vs `=== title ===` sections).
    """
    exts = {Path(r).suffix.lower() for r in SOURCES[topic]}
    if exts == {".md"}:
        return build_md_lines(topic)
    if ".md" in exts:
        raise SystemExit(
            "ERROR: topic %s mixes .md catalogs with other sources; split it into "
            "one read path" % topic)
    label = TOPIC_LABELS.get(topic, topic)
    lines = [
        "%s GROUNDING -- generated from the %s. Reason from the documented "
        "process below; this is the authoritative text, not a paraphrase."
        % (topic, label),
    ]
    for rel in SOURCES[topic]:
        path = REPO_ROOT / rel
        if not path.exists():
            sys.stderr.write("  WARN: source not found: %s\n" % rel)
            continue
        title, doc_lines = extract_doc_lines(path)
        if not doc_lines:
            continue
        lines.append("")
        lines.append("=== %s (%s) ===" % (title, path.name))
        lines.extend(doc_lines)
    return lines


def render_assignment(topic: str, lines: list[str]) -> str:
    """Render a `window.RRV8.<TOPIC>_GROUNDING = [ ... ].join('\\n');` block."""
    items = ",\r\n".join("    '%s'" % js_escape(l) for l in lines)
    return (
        "  window.RRV8.%s_GROUNDING = [\r\n%s\r\n  ].join('\\n');"
        % (topic, items)
    )


def render_generated_segment(topic: str) -> str:
    """Full segment (comment + assignment) for a generated topic."""
    lines = build_generated_lines(topic)
    comment = (
        "\r\n"
        "  // %s_GROUNDING -- GENERATED from the knowledge-base docs by\r\n"
        "  // Tools/build-ai-grounding.py. DO NOT edit by hand: edit the source\r\n"
        "  // docs and re-run the generator (or let the GHA regenerate on push).\r\n"
        "  // Sources: %s\r\n"
        % (topic, ", ".join(SOURCES[topic]))
    )
    # No trailing newline: the segment ends exactly at the assignment's `;`,
    # matching the span the matcher captured. The newline before the END marker
    # lives in the block's trailing text. Adding one here would accumulate a
    # blank line on every run (non-idempotent).
    return comment + render_assignment(topic, lines)


# --------------------------------------------------------------------------
# config.js block rewrite
# --------------------------------------------------------------------------

ASSIGN_RE = re.compile(
    r"window\.RRV8\.(\w+)_GROUNDING\s*=\s*\[.*?\]\.join\('\\n'\);",
    re.DOTALL,
)


def ensure_markers(text: str) -> str:
    """Insert the START/END markers around the six assignments if absent."""
    if MARKER_START in text and MARKER_END in text:
        return text
    matches = list(ASSIGN_RE.finditer(text))
    if not matches:
        raise SystemExit("ERROR: no RRV8.*_GROUNDING assignments found in config.js")
    first, last = matches[0], matches[-1]
    # Walk back over the comment lines immediately preceding the first assignment.
    line_start = text.rfind("\n", 0, first.start()) + 1
    while True:
        prev_nl = text.rfind("\n", 0, line_start - 1) + 1
        prev_line = text[prev_nl:line_start].strip()
        if prev_line.startswith("//"):
            line_start = prev_nl
            continue
        break
    block_start = line_start
    block_end = last.end()
    new_text = (
        text[:block_start]
        + MARKER_START + "\r\n"
        + text[block_start:block_end]
        + "\r\n" + MARKER_END
        + text[block_end:]
    )
    return new_text


def rewrite_block(text: str) -> str:
    text = ensure_markers(text)
    si = text.index(MARKER_START) + len(MARKER_START)
    ei = text.index(MARKER_END)
    inner = text[si:ei]

    matches = list(ASSIGN_RE.finditer(inner))
    if not matches:
        raise SystemExit("ERROR: no assignments inside the marker block")

    rebuilt = []
    prev_end = 0
    for m in matches:
        topic = m.group(1)
        seg = inner[prev_end:m.end()]
        if topic in GENERATE:
            rebuilt.append(render_generated_segment(topic))
        else:
            rebuilt.append(seg)
        prev_end = m.end()
    # Everything after the last assignment is just the separator before the END
    # marker. Normalize it to a single CRLF so repeated runs stay byte-identical
    # (idempotent) and any accumulated blank lines are collapsed.
    new_inner = "".join(rebuilt) + "\r\n"
    return text[:si] + new_inner + text[ei:]


def main(argv: list[str]) -> int:
    check_only = "--check" in argv[1:]
    original = CONFIG_JS.read_text(encoding="utf-8", newline="")
    updated = rewrite_block(original)

    if check_only:
        if updated != original:
            sys.stderr.write(
                "AI grounding block in RRV8/config.js is STALE -- run "
                "Tools/build-ai-grounding.py to regenerate.\n"
            )
            return 1
        print("AI grounding block is up to date.")
        return 0

    if updated == original:
        print("AI grounding block already up to date -- no change.")
        return 0

    CONFIG_JS.write_text(updated, encoding="utf-8", newline="")
    generated = ", ".join(GENERATE)
    passthrough = ", ".join(
        t for t in ("ACCT", "ANALYST", "CARDEX", "ROLLFORWARD", "ASOF", "ADMIN")
        if t not in GENERATE
    )
    print("Regenerated AI grounding block in %s" % CONFIG_JS)
    print("  generated from docs : %s" % generated)
    print("  passthrough verbatim: %s" % passthrough)
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
