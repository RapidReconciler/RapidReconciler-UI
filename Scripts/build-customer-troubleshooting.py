#!/usr/bin/env python3
"""
Build customer-troubleshooting.html from troubleshooting.html.

Transforms the staff Help Desk doc into a customer-facing troubleshooting page
by stripping internal-only content (VALC references, escalation contacts, Jira
config, Tier 2/3 cards, etc.) and rewriting the page header.

The script is intentionally fail-loud: any sensitive marker that survives the
strip causes a non-zero exit. This is the safety net for the CI workflow.

Usage:
    python3 scripts/build-customer-troubleshooting.py

Environment variables (optional):
    TS_SOURCE  — input file path  (default: troubleshooting.html)
    TS_OUTPUT  — output file path (default: customer-troubleshooting.html)

Exits non-zero if:
    - Source file is missing or unreadable
    - Required markers are not found in the source (template drift)
    - Any sensitive marker survives in the output (verification failed)
"""

from __future__ import annotations

import os
import re
import sys
from pathlib import Path

try:
    from bs4 import BeautifulSoup, Tag
except ImportError:
    sys.stderr.write(
        "ERROR: BeautifulSoup4 is required. Install with: pip install beautifulsoup4 lxml\n"
    )
    sys.exit(2)

REPO_ROOT = Path(__file__).resolve().parent.parent
SOURCE_PATH = Path(os.environ.get("TS_SOURCE", REPO_ROOT / "troubleshooting.html"))
OUTPUT_PATH = Path(os.environ.get("TS_OUTPUT", REPO_ROOT / "customer-troubleshooting.html"))

# --- Card disposition (single source of truth) -----------------------------
# Tier-1 cards a customer can both recognize the symptom of AND act on.
# Everything else is dropped. This list is reviewed manually whenever a new
# card is added in the staff doc; a card not in either list will fail the
# build with a clear message.
CUSTOMER_KEEP_IDS = {
    "customer-no-data-hard-reload",
    "customer-no-data-vpn",
    "user-no-companies-session-refresh",
    "customer-browser-local-network-access",
    "customer-clear-browser-data",
    "inventory-validation-red-variance",
    "system-status-light-red",
}

CUSTOMER_DROP_IDS = {
    # Tier 1 cards whose symptom is staff-side only (VALC tabs, install flow)
    "agent-download-not-appearing",
    "clients-grid-not-updating",
    "companies-tab-empty",
    "database-status-unknown-stopped",
    "setup-step-not-advancing",
}

# --- Sensitive markers (verified absent from output) ----------------------
SENSITIVE_MARKERS = [
    # Personal names / individuals
    "Daren",
    "daren",  # catches the email local-part too — verified separately
    # Internal admin tool & DB object names
    "VALC",
    "Manage Client",
    "Edit Database",
    "Authorized Companies",
    "GSIADMIN",
    "gsiadmin",
    "rruser",
    "RapidReconciler_Prod",
    "ssisdb",
    "SSISDB",
    # Per-customer infra hostname pattern
    "rrprod-",
    # Personal / internal emails
    "edward.gutkowski@getgsi.com",
    "daren.belsterli@getgsi.com",
    # Internal infrastructure config
    "atlassian.net",
    "projectKey",
    "projectId",
    "issueTypeId",
    # Old role label that should have been replaced staff-side
    "GSI I/T",
    # Staff workflow / escalation tier vocabulary — customer should never see
    "Tier 1",
    "Tier 2",
    "Tier 3",
    "Tier-1",
    "Tier-2",
    "Tier-3",
    "Network Tech",
    "RR Developer",
    "Helpdesk Tech",
    "JSM ticket",
    "Create JSM",
]

# --- Pre-flight markers (must be present in source — template-drift guard) -
REQUIRED_SOURCE_MARKERS = [
    'id="role-contacts-data"',
    'id="jsm-config-data"',
    'class="ts-card',
    'class="ts-detail-pane',
]


def fatal(msg: str) -> None:
    sys.stderr.write(f"ERROR: {msg}\n")
    sys.exit(1)


def info(msg: str) -> None:
    sys.stdout.write(f"  {msg}\n")


def remove_node(node: Tag | None, *, label: str = "") -> None:
    """Remove a node if present; quiet no-op otherwise."""
    if node is not None:
        node.decompose()


def strip_attrs_starting_with(soup: BeautifulSoup, prefix: str) -> int:
    """Remove every attribute beginning with `prefix` from every element. Returns count."""
    n = 0
    for el in soup.find_all(True):
        for attr in list(el.attrs):
            if attr.startswith(prefix):
                del el.attrs[attr]
                n += 1
    return n


def replace_title_and_header(soup: BeautifulSoup) -> None:
    """Swap staff-facing branding for customer-facing branding."""
    # <title>
    title = soup.find("title")
    if title:
        title.string = "RapidReconciler Troubleshooting"

    # <meta name="description">
    desc = soup.find("meta", attrs={"name": "description"})
    if desc and desc.get("content"):
        desc["content"] = (
            "Common issues you can resolve yourself before contacting support."
        )

    # Brand product tag (Help Desk → Troubleshooting)
    tag_span = soup.select_one(".brand-product-tag")
    if tag_span:
        tag_span.string = "Troubleshooting"

    # Hero title — replace with a customer-friendly version
    hero_title = soup.select_one(".hero-title")
    if hero_title:
        hero_title.clear()
        hero_title.append("Troubleshooting")

    # Hero subtitle
    hero_sub = soup.select_one(".hero-sub")
    if hero_sub:
        hero_sub.clear()
        hero_sub.append("Search for the issue you're seeing, or browse the list below.")

    # Search input placeholder — remove staff-flavored examples (SSIS)
    search_input = soup.select_one(".hero-search-input, #ts-search")
    if search_input:
        search_input["placeholder"] = (
            "Try \u201cno data\u201d, \u201ccertificate\u201d, \u201cVPN\u201d\u2026"
        )

    # Search hint — drop tier-1 / sort references
    hint = soup.select_one(".hero-search-hint")
    if hint:
        hint.clear()
        hint.append("Press ")
        kbd = soup.new_tag("kbd")
        kbd.string = "/"
        hint.append(kbd)
        hint.append(" to search\u00a0\u00b7\u00a0")
        kbd2 = soup.new_tag("kbd")
        kbd2.string = "Esc"
        hint.append(kbd2)
        hint.append(" to close a topic")

    # Footer copy — the source has a <span> containing both the brand text
    # and an "internal reference for the GSI RapidReconciler tech team" tail.
    # Replace the whole span content rather than just the <strong>.
    for line in soup.select(".footer-line"):
        for span in line.find_all("span", recursive=False):
            text = span.get_text(strip=True)
            if "internal reference" in text.lower() or "Help Desk" in text or "GSI RR" in text:
                span.clear()
                strong = soup.new_tag("strong")
                strong.string = "RapidReconciler Troubleshooting"
                span.append(strong)

    # The "Spot something off..." feedback band uses class="feedback-band"
    # in this template (not feedback-banner / feedback-callout). Replace
    # its content with a simple support callout.
    for el in soup.select(".feedback-band, .feedback-banner, .feedback-callout, .feedback-strip, .feedback-inner"):
        # Only act if this contains the staff text (avoid stomping unrelated bands)
        text = el.get_text(" ", strip=True)
        if "Spot something off" in text or "new scenario" in text or "internal reference" in text.lower():
            # Clear and replace
            el.clear()
            new_p = soup.new_tag("p", attrs={"class": "ts-customer-support-line"})
            new_p.append("Need more help? Email ")
            link = soup.new_tag("a", href="mailto:rrsupport@getgsi.com")
            link.string = "rrsupport@getgsi.com"
            new_p.append(link)
            new_p.append(".")
            el.append(new_p)

    # The card grid is hidden by default in the staff doc (search-first UX).
    # In the customer doc with only 7 cards, show them by default.
    grid_wrap = soup.select_one(".ts-grid-wrap, #ts-grid-wrap")
    if grid_wrap and grid_wrap.has_attr("hidden"):
        del grid_wrap.attrs["hidden"]


def strip_internal_sections(soup: BeautifulSoup) -> None:
    """Remove staff-only configuration scripts and helper UI sections."""
    # JSON config blocks
    for sid in ("role-contacts-data", "jsm-config-data"):
        node = soup.find(id=sid)
        if node is not None:
            node.decompose()
            info(f"removed <script id={sid!r}>")

    # Whole staff-only sections
    for selector in (
        # Welcome banner with tier explanation
        ".welcome-banner",
        # Stats strip with tier counts
        ".stats-strip",
        # Email-driven intake workflow
        ".emaillookup-section",
        "#emaillookup-bar",
        ".emaillookup-bar",
        # Sort-by-tier / sort-by-difficulty controls
        ".sort-bar",
        # Escalation reference pane (and related)
        "#escalation-pane",
        ".escalation-pane",
        '[data-section="escalation"]',
        ".esc-pane",
        ".esc-section",
        ".esc-trigger",
        ".esc-jsm-config",
        "#esc-bar",
        ".esc-bar",
        "#esc-contacts-grid",
        ".esc-contacts",
        # Console & log error pattern lookup (glossary)
        ".glossary-section",
        "#glossary-bar",
        ".glossary-bar",
        ".glossary-body",
        # Browse-all collapse toggle (cards always visible in customer view)
        ".ts-collapse-bar",
        # Topnav cross-links to other staff hub pages
        ".section-nav",
        ".nav-cta",
        # Misc start-here / intake controls
        "#start-from-email",
        ".start-from-email",
        '[data-section="start-from-email"]',
        ".intake-from-email",
        "#email-lookup",
        ".email-lookup",
        ".email-lookup-bar",
        ".email-lookup-results",
        # Difficulty narrative banner with VALC mention
        ".difficulty-banner",
        ".difficulty-narrative",
        ".sort-narrative",
        # "Related" link rows in detail panes (point to staff installation guides
        # and dropped Tier 2/3 cards). Most of the link targets we removed
        # anyway, but the surviving links go to staff-only docs we don't
        # publish to customers.
        ".ts-detail-related",
    ):
        for n in soup.select(selector):
            n.decompose()


def strip_difficulty_tooltips(soup: BeautifulSoup) -> None:
    """Drop the staff-language tooltips on card difficulty stars.

    Source has things like title="Difficulty for tier-1: Quick VALC / browser check"
    on .ts-card-difficulty elements. These leak VALC and aren't useful to customers
    anyway (the visual stars convey the difficulty fine).
    """
    n = 0
    for el in soup.select("[title]"):
        title_attr = el.get("title", "")
        # Only strip titles containing internal markers
        if any(m in title_attr for m in ("VALC", "tier-1", "tier-2", "tier-3", "Helpdesk", "Network Tech", "RR Developer")):
            del el.attrs["title"]
            n += 1
    info(f"stripped {n} staff-language title attributes")


def scrub_internal_css_comments(soup: BeautifulSoup) -> int:
    """Remove CSS comments inside <style> blocks that mention internal-only
    terms. The comments are invisible to users, but they still ship in the
    served HTML and contain staff workflow vocabulary that the verification
    step would otherwise flag.
    """
    INTERNAL_RE = re.compile(
        r"\b(VALC|Daren|Helpdesk Tech|Network Tech|RR Developer|"
        r"Tier[ -]?[123]|JSM ticket|Create JSM|GSIADMIN|rruser|"
        r"RapidReconciler_Prod|ssisdb|GSI I/T|gsiadmin)\b",
        re.IGNORECASE,
    )
    n = 0
    for style in soup.find_all("style"):
        # lxml wraps stylesheet content in a Stylesheet node, so iterate contents
        # rather than relying on .string. Operate on the full text and rewrite.
        css = "".join(str(c) for c in style.contents)
        if not css:
            continue

        def replace_comment(m: re.Match) -> str:
            nonlocal n
            comment = m.group(0)
            if INTERNAL_RE.search(comment):
                n += 1
                return ""
            return comment

        new_css = re.sub(r"/\*.*?\*/", replace_comment, css, flags=re.DOTALL)
        if new_css != css:
            # Replace the entire children with the rewritten CSS as a single string
            style.clear()
            style.append(new_css)

    return n


def relocate_detail_panes(soup: BeautifulSoup) -> None:
    """Move each detail pane to immediately follow its corresponding card.

    Source layout has cards in .ts-grid and detail panes in a separate area.
    Staff JS dynamically positions panes when opening; the customer minimal JS
    doesn't, so we move them in the DOM at build time. Each pane sits inside
    .ts-grid right after its card, where it can use grid-column: 1/-1 to span.
    """
    n = 0
    for card in soup.select("article.ts-card"):
        cid = card.get("data-id", "")
        if not cid:
            continue
        pane = soup.find("section", id=f"ts-detail-{cid}")
        if pane is None:
            continue
        # Move the pane to be the next sibling of the card
        card.insert_after(pane)
        n += 1
    info(f"relocated {n} detail panes adjacent to their cards")


def replace_staff_script_with_customer_minimal(soup: BeautifulSoup) -> None:
    """Replace the large staff-side <script> block (search + filters + JSM +
    escalation + email intake + owner badges + ...) with a minimal customer
    script that handles only what the customer view needs:

      - Search input filters cards by data-search keyword match
      - Click a card title or "view steps" CTA to open the matching detail pane
      - Detail pane has a "close" / "back to list" interaction
      - Hash-link support so /customer-troubleshooting.html#system-status-light-red
        opens that card directly
    """
    # Find the body-tail script — it's the largest <script> at the end of <body>
    # without an id and without a type other than text/javascript. Conservative:
    # remove every <script> in <body> that is plain JS and isn't referenced by id.
    # We've already removed the JSON config scripts in strip_internal_sections.
    body = soup.find("body")
    if body is None:
        return

    removed = 0
    for s in list(body.find_all("script")):
        # Skip JSON config scripts (already gone, but defensive)
        if s.get("type") and s.get("type") != "text/javascript":
            continue
        s.decompose()
        removed += 1
    info(f"removed {removed} <script> blocks from body")

    # Inject the minimal replacement at the end of body
    minimal_js = """
(function() {
  'use strict';

  // ---- Card filtering by search -----------------------------------------
  var searchInput = document.querySelector('input[type="search"], #ts-search-input, .ts-search-input');
  var cards = Array.prototype.slice.call(document.querySelectorAll('article.ts-card'));

  function applySearchFilter() {
    if (!searchInput) return;
    var q = (searchInput.value || '').trim().toLowerCase();
    cards.forEach(function(card) {
      if (!q) {
        card.hidden = false;
        return;
      }
      var hay = (card.getAttribute('data-search') || '').toLowerCase()
        + ' ' + (card.textContent || '').toLowerCase();
      card.hidden = hay.indexOf(q) === -1;
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', applySearchFilter);
  }

  // ---- Card expand to detail pane ---------------------------------------
  function detailFor(card) {
    var id = card.getAttribute('data-id');
    if (!id) return null;
    return document.getElementById('ts-detail-' + id);
  }

  function closeAllDetails() {
    document.querySelectorAll('section.ts-detail-pane').forEach(function(p) {
      p.hidden = true;
      p.classList.remove('visible');
    });
    document.querySelectorAll('article.ts-card').forEach(function(c) {
      c.classList.remove('is-open');
      var btn = c.querySelector('.ts-card-toggle');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function openDetailFor(card) {
    closeAllDetails();
    var pane = detailFor(card);
    if (!pane) return;
    pane.hidden = false;
    pane.classList.add('visible');
    card.classList.add('is-open');
    var btn = card.querySelector('.ts-card-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    pane.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  cards.forEach(function(card) {
    var toggle = card.querySelector('.ts-card-toggle');
    if (toggle) {
      toggle.addEventListener('click', function(e) {
        e.preventDefault();
        if (card.classList.contains('is-open')) {
          closeAllDetails();
        } else {
          openDetailFor(card);
        }
      });
    }
  });

  // Detail pane close-button (if present in source)
  document.querySelectorAll('.ts-detail-close, [data-action="close-detail"]').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      e.preventDefault();
      closeAllDetails();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  // ---- Hash deep-link ---------------------------------------------------
  function openFromHash() {
    var hash = (window.location.hash || '').replace('#', '');
    if (!hash) return;
    var card = document.querySelector('article.ts-card[data-id="' + hash + '"]');
    if (card) openDetailFor(card);
  }
  window.addEventListener('hashchange', openFromHash);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', openFromHash);
  } else {
    openFromHash();
  }

})();
"""
    new_script = soup.new_tag("script")
    new_script.string = minimal_js
    body.append(new_script)


def strip_filter_pills(soup: BeautifulSoup) -> None:
    """Remove tier filter pills (only Tier 1 remains, so the filter is meaningless)."""
    # Approach: drop every pill with data-filter-type="tier", except the "all"
    # pill which we'll rewrite to say "All" with the customer count. Actually
    # simpler — drop the whole tier filter row.
    for pill in soup.select('.ts-filter-pill[data-filter-type="tier"]'):
        pill.decompose()

    # Drop the entire filter section since with no pills it's just an empty row
    for sel in (".filter-section", ".ts-filter-row", ".ts-filter-bar", "#tier-filter-group", ".filter-group"):
        for n in soup.select(sel):
            n.decompose()


def filter_cards_and_details(soup: BeautifulSoup) -> tuple[int, int]:
    """Drop every card and detail not in CUSTOMER_KEEP_IDS. Returns (kept, dropped)."""
    kept = 0
    dropped = 0
    seen_ids: set[str] = set()

    for card in list(soup.select("article.ts-card")):
        cid = card.get("data-id", "")
        seen_ids.add(cid)

        if cid in CUSTOMER_KEEP_IDS:
            kept += 1
            continue

        if cid in CUSTOMER_DROP_IDS:
            card.decompose()
            dropped += 1
            continue

        # Card present in source but not in either list — fail loud
        # (Tier 2/3 cards are also in this branch; we drop them but log them
        # at info level. Cards that look Tier 1 but aren't classified are an
        # error.)
        tier = card.get("data-tier", "?")
        if tier in ("2", "3"):
            card.decompose()
            dropped += 1
        else:
            fatal(
                f"Card {cid!r} is Tier {tier} but not classified in CUSTOMER_KEEP_IDS "
                f"or CUSTOMER_DROP_IDS. Update scripts/build-customer-troubleshooting.py "
                f"to classify it before this build can succeed."
            )

    # Now drop the detail panes for any card we removed
    for pane in list(soup.select("section.ts-detail-pane")):
        pid = pane.get("id", "")
        # Detail IDs are "ts-detail-<card-id>"
        cid = pid[len("ts-detail-"):] if pid.startswith("ts-detail-") else ""
        if cid not in CUSTOMER_KEEP_IDS:
            pane.decompose()

    return kept, dropped


def strip_copy_payloads_and_jsm_buttons(soup: BeautifulSoup) -> None:
    """Strip clipboard payloads and JSM ticket buttons from kept cards.

    The data-clip and data-clip-html attributes contain serialized internal
    references (VALC, etc.). The JSM-ticket buttons rely on the Jira config
    which we removed.
    """
    n_clip = strip_attrs_starting_with(soup, "data-clip")
    info(f"stripped {n_clip} data-clip* attributes from copy buttons")

    # Remove the copy/JSM buttons themselves — without their payloads and Jira
    # config they're inert UI clutter.
    for sel in (".ts-copy-btn", ".ts-jsm-btn"):
        for btn in soup.select(sel):
            btn.decompose()

    # The container that wraps those buttons may now be empty
    for wrap in soup.select(".ts-detail-actions, .ts-card-actions"):
        if not wrap.get_text(strip=True) and not wrap.find(True):
            wrap.decompose()


def strip_tier_badges_and_role_notes(soup: BeautifulSoup) -> None:
    """Remove tier indicators from kept cards and role-coordination notes from details."""
    for el in soup.select(
        ".ts-card-tier, .ts-detail-tier, .diff-note, .ts-detail-rolenote, .ts-detail-difficulty"
    ):
        el.decompose()


def add_customer_footer_to_cards(soup: BeautifulSoup) -> None:
    """Append a 'Still stuck? Email rrsupport@getgsi.com' footer to each kept detail pane."""
    for pane in soup.select("section.ts-detail-pane"):
        footer = soup.new_tag("p", attrs={"class": "ts-customer-footer"})
        footer.append("Still stuck? Email ")
        link = soup.new_tag("a", href="mailto:rrsupport@getgsi.com")
        link.string = "rrsupport@getgsi.com"
        footer.append(link)
        footer.append(".")
        pane.append(footer)


def add_customer_styles(soup: BeautifulSoup) -> None:
    """Inject CSS for the customer footer and any minor visual cleanups."""
    style = soup.find("style")
    if not style:
        # If the source has no <style> for some reason, create one in <head>
        head = soup.find("head")
        if not head:
            return
        style = soup.new_tag("style")
        head.append(style)
    additional = """
  /* Customer-version additions */
  .ts-customer-footer {
    margin-top: 18px;
    padding: 12px 14px;
    background: var(--bg-soft, #f6f8fb);
    border-left: 3px solid var(--blue, #2b5fb0);
    font-size: 13px;
    color: var(--text, #1f2d4a);
  }
  .ts-customer-footer a { color: var(--blue, #2b5fb0); }

  /* Honor hidden attribute on cards (overridden by display:flex in source CSS) */
  article.ts-card[hidden],
  section.ts-detail-pane[hidden] { display: none !important; }
"""
    style.append(additional)


def strip_internal_sentences(soup: BeautifulSoup) -> int:
    """Remove sentences and list items inside kept cards that mention
    internal-only tools, names, or staff workflow terms.

    Operates in two passes:
      1. List-item pass — drop entire <li> elements (in cards/details) whose
         text matches an internal pattern. This avoids leaving a partial
         sentence stub in the middle of a numbered list.
      2. Sentence pass — for remaining text nodes, split on sentence
         boundaries and drop any sentence matching an internal pattern.

    The verification step at the end of the build still catches anything
    these passes miss.
    """
    INTERNAL_PATTERNS = [
        # Internal admin tool / DB object / per-person references
        r"VALC",
        r"Manage Client",
        r"Edit Database",
        r"Authorized Companies",
        r"GSIADMIN",
        r"\brruser\b",
        r"RapidReconciler_Prod",
        r"\brrprod-",
        r"ssisdb",
        r"\bDaren\b",
        r"daren\.belsterli",
        r"edward\.gutkowski",
        # Staff workflow / escalation vocabulary
        r"\bTier[ -][123]\b",
        r"\bNetwork Tech\b",
        r"\bRR Developer\b",
        r"\bHelpdesk Tech\b",
        r"\bJSM ticket\b",
        r"\bCreate JSM\b",
        r"\bnext[- ]tier\b",
        r"escalate via the same path",
        r"same escalation path",
    ]
    pattern = re.compile("|".join(INTERNAL_PATTERNS), re.IGNORECASE)

    def scrub_text(text: str) -> str:
        sentences = re.split(r"(?<=[.!?])\s+", text)
        kept = [s for s in sentences if not pattern.search(s)]
        return " ".join(kept)

    n_changes = 0

    # Pass 1: drop whole <li> items that match internal patterns
    for scope in soup.select("article.ts-card, section.ts-detail-pane"):
        for li in list(scope.find_all("li")):
            li_text = li.get_text(" ", strip=True)
            if pattern.search(li_text):
                li.decompose()
                n_changes += 1

    # Pass 2: sentence-level removal for remaining text nodes
    for scope in soup.select("article.ts-card, section.ts-detail-pane"):
        for text_node in list(scope.find_all(string=True)):
            original = str(text_node)
            if not pattern.search(original):
                continue
            cleaned = scrub_text(original)
            if cleaned != original:
                text_node.replace_with(cleaned)
                n_changes += 1

    return n_changes


def add_generated_banner(soup: BeautifulSoup) -> None:
    """Add an HTML comment at the top of the doc noting it is auto-generated."""
    head = soup.find("head")
    if head is None:
        return
    comment_text = (
        " THIS FILE IS AUTO-GENERATED. Do not edit by hand. "
        "Source: troubleshooting.html. "
        "Regenerate via: python3 scripts/build-customer-troubleshooting.py "
    )
    from bs4 import Comment
    head.insert(0, Comment(comment_text))


def verify_no_sensitive_markers(html: str) -> list[str]:
    """Scan the output for sensitive markers. Returns list of (marker, surrounding-context)."""
    findings: list[str] = []
    for marker in SENSITIVE_MARKERS:
        # Case-sensitive find (markers list already includes case variants)
        idx = 0
        while True:
            pos = html.find(marker, idx)
            if pos == -1:
                break
            # Capture ~60 chars of context
            start = max(0, pos - 30)
            end = min(len(html), pos + len(marker) + 30)
            context = html[start:end].replace("\n", " ")
            findings.append(f"{marker!r}: ...{context}...")
            idx = pos + 1
    return findings


def main() -> None:
    if not SOURCE_PATH.exists():
        fatal(f"Source file not found: {SOURCE_PATH}")

    print(f"Reading source: {SOURCE_PATH}")
    src = SOURCE_PATH.read_text(encoding="utf-8")

    # Pre-flight: source must contain expected markers (template-drift guard)
    missing = [m for m in REQUIRED_SOURCE_MARKERS if m not in src]
    if missing:
        fatal(
            "Source file is missing required markers — template may have changed. "
            f"Missing: {missing}"
        )

    soup = BeautifulSoup(src, "lxml")

    print("Transforming...")
    replace_title_and_header(soup)
    strip_internal_sections(soup)
    strip_filter_pills(soup)
    kept, dropped = filter_cards_and_details(soup)
    info(f"kept {kept} cards, dropped {dropped}")
    strip_copy_payloads_and_jsm_buttons(soup)
    strip_tier_badges_and_role_notes(soup)
    strip_difficulty_tooltips(soup)
    n_sentences = strip_internal_sentences(soup)
    info(f"removed {n_sentences} sentences containing internal markers")
    add_customer_footer_to_cards(soup)
    add_customer_styles(soup)
    n_css_comments = scrub_internal_css_comments(soup)
    info(f"scrubbed {n_css_comments} internal CSS comments")
    relocate_detail_panes(soup)
    replace_staff_script_with_customer_minimal(soup)
    add_generated_banner(soup)

    output = str(soup)

    # Verification: fail loud if any sensitive marker survives
    findings = verify_no_sensitive_markers(output)
    if findings:
        sys.stderr.write("\nFAILED: sensitive markers found in generated output:\n")
        for f in findings[:20]:  # cap output to avoid wall-of-text
            sys.stderr.write(f"  {f}\n")
        if len(findings) > 20:
            sys.stderr.write(f"  ... and {len(findings) - 20} more\n")
        sys.stderr.write(
            "\nFix the source file or update scripts/build-customer-troubleshooting.py "
            "to handle the new pattern, then re-run.\n"
        )
        sys.exit(1)

    OUTPUT_PATH.write_text(output, encoding="utf-8")
    print(f"\nWrote: {OUTPUT_PATH}")
    print(f"  size: {len(output):,} bytes")
    print("  verification: PASS (no sensitive markers found)")


if __name__ == "__main__":
    main()
