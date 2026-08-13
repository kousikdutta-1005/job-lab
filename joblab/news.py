"""Industry intelligence from public feeds, with failure treated as data.

The jobs board is intentionally static, so the market context beside it has to be
static too: RSS and no-auth JSON become one small JSON file the browser can read.
Feeds are allowed to disappear or block crawlers. When that happens this module
records the source error and returns the items that did work, rather than making
the nightly build depend on a magazine's uptime.
"""

from __future__ import annotations

import email.utils
import re
from datetime import datetime, timezone
from typing import Any

import feedparser

from .models import html_to_text
from .net import fetch_json, fetch_text

HN_DESIGN_URL = "https://hn.algolia.com/api/v1/search_by_date?query=design&tags=story"
HN_LAYOFFS_URL = "https://hn.algolia.com/api/v1/search_by_date?query=layoffs&tags=story"

RSS_SOURCES: tuple[tuple[str, str], ...] = (
    ("Nielsen Norman Group", "https://www.nngroup.com/feed/rss/"),
    ("Smashing Magazine", "https://www.smashingmagazine.com/feed/"),
    ("A List Apart", "https://alistapart.com/main/feed/"),
    ("UX Collective", "https://uxdesign.cc/feed"),
)

# A tag is a claim about what a story is about, so every one of these has to be
# earned from the story's own words. "layoffs" used to be stamped on anything
# arriving from the layoffs feed, which put the tag on a diagramming tool, and
# it was not in this table at all — so a genuine layoffs piece from any other
# source could never earn it.
#
# The same principle is why feed chrome has to go before any of this runs: see
# strip_feed_chrome below.
_RELEVANCE_TERMS: dict[str, tuple[str, ...]] = {
    "design": ("design", "designer", "ux", "ui", "research", "accessibility", "figma"),
    "product": ("product", "saas", "startup", "ai", "strategy", "roadmap"),
    "career": ("career", "hiring", "jobs", "portfolio", "interview", "salary", "promotion"),
    "layoffs": (
        "layoff", "layoffs", "laid off", "lays off", "lay off", "job cuts", "jobcuts",
        "redundancies", "redundancy", "downsizing", "hiring freeze", "workforce reduction",
        "restructuring", "severance", "riff", "rif",
    ),
    "leadership": ("leadership", "manager", "team", "stakeholder", "collaboration"),
}

# Multi-word terms cannot use the character-class guards the single words use.
_TERM_RE: dict[str, tuple[re.Pattern[str], ...]] = {
    tag: tuple(
        re.compile(
            rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])"
            if " " not in term
            else rf"\b{re.escape(term)}\b"
        )
        for term in terms
    )
    for tag, terms in _RELEVANCE_TERMS.items()
}


_DATE_FORMATS = ("%Y-%m-%dT%H:%M:%S.%fZ", "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%d")


def _iso_date(value: Any) -> str | None:
    """Normalize the date shapes used by Algolia and RSS.

    Feedparser already understands most RSS date formats, but Medium sometimes
    emits RFC822 strings and HN emits ISO strings. Keeping this small parser here
    prevents an unparseable timestamp from dropping an otherwise useful item.
    """
    if not value:
        return None
    if isinstance(value, (tuple, list)) and len(value) >= 6:
        try:
            return datetime(*value[:6], tzinfo=timezone.utc).isoformat(timespec="seconds")
        except (TypeError, ValueError):
            return None
    text = str(value).strip()
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text[:26].rstrip("Z") + ("Z" if text.endswith("Z") else ""), fmt).replace(tzinfo=timezone.utc).isoformat(timespec="seconds")
        except ValueError:
            pass
    try:
        parsed = email.utils.parsedate_to_datetime(text)
        if parsed.tzinfo is None:
            parsed = parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc).isoformat(timespec="seconds")
    except (TypeError, ValueError):
        return None


def _tags_for(*texts: str) -> list[str]:
    blob = " ".join(t or "" for t in texts).lower()
    return [tag for tag, patterns in _TERM_RE.items() if any(r.search(blob) for r in patterns)]


# Feed chrome is the publication talking about itself, not the story. Medium
# signs every item with "Continue reading on UX Collective »", and "UX
# Collective" contains "ux" — so before this stripping existed, every story on
# that feed earned the "design" tag from the masthead. Two of sixty stories on
# the board were kept for no other reason, because _keep_item treats "has any
# tag" as the relevance gate. The 500-character truncation hid the sign-off on
# long items, so it only bit the short teasers: exactly the stories with the
# least real evidence, where one spurious match decides the whole question.
_CHROME_PATTERNS = (
    re.compile(r"continue reading on\b.*", re.I | re.S),
    re.compile(r"\bthe post\b.*?\bappeared first on\b.*", re.I | re.S),
    re.compile(r"\bread (?:more|the rest)\s+(?:on|at)\b.*", re.I | re.S),
    re.compile(r"\boriginally published (?:on|at|in)\b.*", re.I | re.S),
)


def strip_feed_chrome(text: str, source: str) -> str:
    """Drop the publication's sign-off so a tag can only come from the story.

    Removes the known RSS boilerplate tails, then any standalone mention of the
    publication's own name. Both are the feed's words about itself; neither is
    evidence of what the story covers.
    """
    out = text or ""
    for pattern in _CHROME_PATTERNS:
        out = pattern.sub(" ", out)
    name = source.strip()
    if len(name) > 3 and "—" not in name:
        out = re.sub(rf"(?<![a-z0-9]){re.escape(name)}(?![a-z0-9])", " ", out, flags=re.I)
    return re.sub(r"\s+", " ", out).strip()


def _keep_item(title: str, summary: str, *, source: str) -> tuple[bool, list[str]]:
    tags = _tags_for(title, summary)
    if source == "Hacker News — layoffs":
        # The feed is a full-text search, so it returns things like "Show HN:
        # Artful D2 Diagrams". Being on the feed is not evidence of anything.
        return "layoffs" in tags or "career" in tags, tags
    if source == "Hacker News — design":
        blob = f"{title} {summary}".lower()
        product_design = (
            "ux", "ui", "user", "product", "interface", "accessibility", "research",
            "design system", "designer", "portfolio", "hiring", "career", "figma",
        )
        hardware_noise = ("fpga", "pcb", "circuit", "compiler", "chip", "hardware")
        product_match = any(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", blob) for term in product_design)
        if any(re.search(rf"(?<![a-z0-9]){re.escape(term)}(?![a-z0-9])", blob) for term in hardware_noise) and not product_match:
            return False, tags
        return product_match, tags
    return bool(tags), tags


def _hn_items(url: str, source: str) -> tuple[list[dict], dict]:
    payload, error = fetch_json(url, cache_hours=3)
    health = {"kind": "news", "name": source, "url": url, "items": 0, "error": error}
    if error or not isinstance(payload, dict):
        if not error:
            health["error"] = "response was not a JSON object"
        return [], health

    rows: list[dict] = []
    for hit in payload.get("hits") or []:
        title = (hit.get("title") or hit.get("story_title") or "").strip()
        item_url = hit.get("url") or hit.get("story_url") or ""
        summary = strip_feed_chrome(html_to_text(hit.get("story_text") or hit.get("comment_text") or ""), source)[:500]
        keep, tags = _keep_item(title, summary, source=source)
        if not title or not item_url or not keep:
            continue
        rows.append(
            {
                "title": title,
                "url": item_url,
                "source": source,
                "published": _iso_date(hit.get("created_at")),
                "summary": summary,
                "tags": tags,
            }
        )
    health["items"] = len(rows)
    return rows, health


def _rss_items(name: str, url: str) -> tuple[list[dict], dict]:
    text, error = fetch_text(url, cache_hours=3)
    health = {"kind": "news", "name": name, "url": url, "items": 0, "error": error}
    if error or text is None:
        return [], health

    feed = feedparser.parse(text)
    if feed.bozo and not feed.entries:
        health["error"] = str(getattr(feed, "bozo_exception", "invalid feed"))
        return [], health

    rows: list[dict] = []
    for entry in feed.entries[:40]:
        title = html_to_text(entry.get("title", ""))
        raw = html_to_text(entry.get("summary") or entry.get("description") or "")
        summary = strip_feed_chrome(raw, name)[:500]
        keep, tags = _keep_item(title, summary, source=name)
        if not title or not keep:
            continue
        rows.append(
            {
                "title": title,
                "url": entry.get("link", ""),
                "source": name,
                "published": _iso_date(entry.get("published_parsed") or entry.get("updated_parsed") or entry.get("published") or entry.get("updated")),
                "summary": summary,
                "tags": tags,
            }
        )
    health["items"] = len(rows)
    return rows, health


def collect_news(limit: int = 60) -> tuple[dict, list[dict]]:
    """Return frontend-ready news plus one health row per public source."""
    items: list[dict] = []
    health: list[dict] = []

    for url, name in ((HN_DESIGN_URL, "Hacker News — design"), (HN_LAYOFFS_URL, "Hacker News — layoffs")):
        rows, row_health = _hn_items(url, name)
        items.extend(rows)
        health.append(row_health)

    for name, url in RSS_SOURCES:
        rows, row_health = _rss_items(name, url)
        items.extend(rows)
        health.append(row_health)

    seen: set[str] = set()
    deduped: list[dict] = []
    for item in sorted(items, key=lambda r: r.get("published") or "", reverse=True):
        key = item.get("url") or f"{item.get('source')}|{item.get('title')}"
        if key in seen:
            continue
        seen.add(key)
        deduped.append(item)
        if len(deduped) >= limit:
            break

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "items": deduped,
        "sources": health,
    }, health
