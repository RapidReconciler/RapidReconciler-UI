#!/usr/bin/env python3
"""
build-search-index.py — Build search-index.json for the RapidReconciler University KB.

Walks the current directory for *.html files (skipping the homepage and any non-content
pages) and emits a JSON file the homepage can load and feed into lunr.js for full-text
search.

Each "section" of a document becomes its own search record so big SPA-style walkthroughs
return precise hits that deep-link to the right view, rather than dumping the user at the
top of a 1 MB page.

Two page formats are supported automatically:

  1. SPA-style pages, identified by the presence of <section class="view"> containers.
     Each view becomes one record. Anchor URL is "<file>#<view-id minus 'topic-' prefix>".

  2. Traditional pages without view containers. Content is split on <h2> boundaries.
     Anchor URL is "<file>#<h2-id>" when the h2 has an id.

Usage
-----
    pip install beautifulsoup4
    python3 build-search-index.py

Run this script in the same folder as the HTML docs (e.g. inside RRUniversity/).
It writes search-index.json next to itself. Re-run any time docs are added, edited,
removed, or renamed.
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path
from typing import Iterable

try:
    from bs4 import BeautifulSoup, Tag
except ImportError:
    sys.stderr.write(
        "ERROR: BeautifulSoup is not installed.\n"
        "Install it with:  pip install beautifulsoup4\n"
    )
    sys.exit(1)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

# Files to skip — not user-facing content pages.
SKIP_FILES = {
    "rapidreconciler-university.html",  # the homepage itself
    "search-index.json",                # output file (just in case)
}

# These element tags are stripped from a doc before we extract text. They contain
# navigation, scripts, or boilerplate that pollutes the search index.
STRIP_TAGS = ("script", "style", "nav", "header", "footer", "aside")

# The CSS selectors below are also stripped — they target known boilerplate
# patterns in the GSI templates (sidebars, breadcrumb wrappers, feedback bands).
STRIP_SELECTORS = (
    ".sidebar",
    ".sidebar-nav",
    ".section-nav",
    ".topic-footer-nav",
    ".feedback-band",
    ".breadcrumb",
    ".page-header",
    ".page-meta",          # "Last reviewed: ... Reading time: ... Press Ctrl+F"
    ".toc",                # in-page table of contents (duplicates h2 titles)
    ".doc-toc",            # alternate ToC class
    ".back-to-top",        # scroll-to-top control
)

# Title suffixes to remove (the docs all share these tails in <title>).
TITLE_SUFFIXES = (
    " — RapidReconciler University",
    " · RapidReconciler University",
    " - RapidReconciler University",
)

# Drop sections shorter than this many characters of body text — they're
# usually just the section heading with no real content.
MIN_SECTION_BODY_CHARS = 40


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def collapse_ws(s: str) -> str:
    """Collapse runs of whitespace (including non-breaking) into single spaces."""
    return re.sub(r"\s+", " ", s.replace("\xa0", " ")).strip()


def clean_text(el: Tag | None) -> str:
    """Return collapsed plain text of an element, or empty string."""
    if el is None:
        return ""
    return collapse_ws(el.get_text(separator=" "))


def get_page_title(soup: BeautifulSoup) -> str:
    """Extract a clean page title from <title>, falling back to first <h1>."""
    if soup.title and soup.title.string:
        title = soup.title.string
        for suffix in TITLE_SUFFIXES:
            if title.endswith(suffix):
                title = title[: -len(suffix)]
                break
        return collapse_ws(title)
    h1 = soup.find("h1")
    return clean_text(h1) or "Untitled"


def view_id_to_hash(view_id: str | None) -> str:
    """
    Translate a view's id into the URL fragment that triggers it.

    The SPA pages call showView('topic-foo') when the URL hash is '#foo' — i.e. the
    'topic-' prefix is added by the JS, not by the user. The 'home' view is the
    default and is reached without a hash.
    """
    if not view_id or view_id == "home":
        return ""
    if view_id.startswith("topic-"):
        return "#" + view_id[len("topic-") :]
    return "#" + view_id


def strip_boilerplate(root: Tag) -> None:
    """Remove navigation, scripts, and other non-content nodes in-place."""
    for tag_name in STRIP_TAGS:
        for tag in root.find_all(tag_name):
            tag.decompose()
    for selector in STRIP_SELECTORS:
        for tag in root.select(selector):
            tag.decompose()


# ---------------------------------------------------------------------------
# Per-format extractors
# ---------------------------------------------------------------------------

def extract_sections_spa(soup: BeautifulSoup, doc_url: str, page_title: str) -> list[dict]:
    """
    Extract one record per <section class="view"> for SPA-style pages.
    """
    records: list[dict] = []
    for view in soup.select("section.view"):
        # Work on a copy so we don't mangle the soup (not strictly needed, but
        # it makes the function safe to call repeatedly).
        strip_boilerplate(view)

        view_id = view.get("id", "")
        heading = view.find(["h1", "h2", "h3"])
        section_title = clean_text(heading) or page_title
        body = clean_text(view)

        if len(body) < MIN_SECTION_BODY_CHARS:
            continue

        records.append(
            {
                "id": f"{doc_url}::{view_id or 'root'}",
                "url": doc_url + view_id_to_hash(view_id),
                "page_title": page_title,
                "section_title": section_title,
                "body": body,
            }
        )
    return records


def _iter_h2_sections(main: Tag) -> Iterable[tuple[Tag | None, list[Tag]]]:
    """
    Walk the direct descendants of `main` and group them into (h2, [following_nodes])
    tuples. Anything before the first h2 is grouped under (None, [...]).
    """
    h2: Tag | None = None
    bucket: list[Tag] = []
    for child in list(main.descendants):
        # Only consider tags, and only the *first* time we encounter them at any
        # depth (descendants visits each tag once). H2s mark new section bounds.
        if not isinstance(child, Tag):
            continue
        if child.name == "h2":
            # Yield the previous bucket before starting a new one
            yield h2, bucket
            h2 = child
            bucket = []
            continue
    yield h2, bucket  # final bucket — not actually populated by the loop above


def extract_sections_traditional(
    soup: BeautifulSoup, doc_url: str, page_title: str
) -> list[dict]:
    """
    Extract records from a traditional page: split content on <h2> boundaries,
    using the h2's id (when present) for deep-linking.

    We use a sibling-walking approach rather than descendants so that nested
    structures (e.g. an h2 inside a callout) don't confuse boundary detection.
    """
    main = soup.find("article", class_="doc-body") or soup.find("main") or soup.body
    if main is None:
        return []

    strip_boilerplate(main)

    h2s = main.find_all("h2")
    records: list[dict] = []

    if not h2s:
        # No h2s at all — index the whole content area as one record.
        body = clean_text(main)
        if len(body) >= MIN_SECTION_BODY_CHARS:
            records.append(
                {
                    "id": f"{doc_url}::root",
                    "url": doc_url,
                    "page_title": page_title,
                    "section_title": page_title,
                    "body": body,
                }
            )
        return records

    # Each h2 starts a section that runs until the next h2 at the same depth.
    for i, h2 in enumerate(h2s):
        section_title = clean_text(h2)
        section_id = h2.get("id", "")

        parts: list[str] = [section_title]
        # Walk forward through siblings until we hit the next h2 (same parent).
        # If the next h2 isn't a direct sibling (because of nesting), we use
        # find_all_next with a stop condition.
        next_h2 = h2s[i + 1] if i + 1 < len(h2s) else None
        for el in h2.find_all_next():
            if el is next_h2:
                break
            if isinstance(el, Tag):
                # Skip elements that are children of a later h2's section
                # (shouldn't happen at this stage, but be defensive).
                parts.append(clean_text(el))

        body = collapse_ws(" ".join(p for p in parts if p))
        if len(body) < MIN_SECTION_BODY_CHARS:
            continue

        section_url = doc_url + (f"#{section_id}" if section_id else "")
        records.append(
            {
                "id": f"{doc_url}::{section_id or f'h2-{i}'}",
                "url": section_url,
                "page_title": page_title,
                "section_title": section_title,
                "body": body,
            }
        )
    return records




def extract_sections_ui_reference(
    soup: BeautifulSoup, doc_url: str, page_title: str
) -> list[dict]:
    """
    Extract one record per <article class="ui-entry"> for UI-reference-style pages.

    Each entry corresponds to a single UI element (status light, button, panel,
    etc.) with its own id anchor. This gives per-element search granularity so
    a query like "red light" lands the user at the specific entry rather than
    the top of a long reference page.
    """
    records: list[dict] = []
    for article in soup.select("article.ui-entry"):
        strip_boilerplate(article)
        article_id = article.get("id", "")
        heading = article.find(["h1", "h2", "h3"])
        section_title = clean_text(heading) or page_title
        body = clean_text(article)
        if len(body) < MIN_SECTION_BODY_CHARS:
            continue
        records.append(
            {
                "id": f"{doc_url}::{article_id or section_title}",
                "url": doc_url + (f"#{article_id}" if article_id else ""),
                "page_title": page_title,
                "section_title": section_title,
                "body": body,
            }
        )
    return records


# ---------------------------------------------------------------------------
# Driver
# ---------------------------------------------------------------------------

def process_file(path: Path) -> list[dict]:
    """Read one HTML file, decide its format, return a list of search records."""
    with path.open(encoding="utf-8") as f:
        soup = BeautifulSoup(f, "html.parser")

    page_title = get_page_title(soup)
    is_ui_reference = bool(soup.select("article.ui-entry"))
    is_spa = bool(soup.select("section.view"))

    if is_ui_reference:
        return extract_sections_ui_reference(soup, path.name, page_title)
    if is_spa:
        return extract_sections_spa(soup, path.name, page_title)
    return extract_sections_traditional(soup, path.name, page_title)


def main(argv: list[str]) -> int:
    here = Path(argv[1]).resolve() if len(argv) > 1 else Path(__file__).parent.resolve()

    all_records: list[dict] = []
    by_doc: dict[str, int] = {}

    html_files = sorted(p for p in here.glob("*.html") if p.name not in SKIP_FILES)
    if not html_files:
        sys.stderr.write(f"No .html files found in {here}\n")
        return 1

    print(f"Building search index from {len(html_files)} files in {here}\n")
    for path in html_files:
        try:
            records = process_file(path)
            by_doc[path.name] = len(records)
            print(f"  {path.name:50s} {len(records):3d} sections")
            all_records.extend(records)
        except Exception as e:
            print(f"  {path.name:50s} ERROR — {e}", file=sys.stderr)

    out_path = here / "search-index.json"
    # Compact output — gzip on GitHub Pages handles compression for the wire.
    with out_path.open("w", encoding="utf-8") as f:
        json.dump(all_records, f, separators=(",", ":"), ensure_ascii=False)

    size_kb = out_path.stat().st_size / 1024
    print()
    print(f"  TOTAL: {len(all_records)} records across {len(by_doc)} docs")
    print(f"  WROTE: {out_path.name} ({size_kb:.1f} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
