"""A tag is a claim about a story, so it has to come from the story.

Anything arriving on the Hacker News layoffs feed was stamped career+layoffs
regardless of content, which put "layoffs" on "Show HN: Daedalus, Artful D2
Diagrams". The tag was not in the lexicon at all, so it only ever meant "came
from that feed", and a real layoffs piece from any other source could not earn it.
"""

from __future__ import annotations

import json
import pathlib
import sys

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from joblab.news import _RELEVANCE_TERMS, _keep_item, _tags_for

PASSES: list[str] = []
FAILURES: list[str] = []
LAYOFF_FEED = "Hacker News — layoffs"


def ok(cond: bool, label: str) -> None:
    (PASSES if cond else FAILURES).append(label)
    print(f"{'.' if cond else 'x'} {label}")


def main() -> int:
    # --- the story that broke it
    keep, tags = _keep_item("Show HN: Daedalus, Artful D2 Diagrams", "", source=LAYOFF_FEED)
    ok(not keep, "a diagramming tool on the layoffs feed is dropped")
    ok("layoffs" not in tags, "and never carries a layoffs tag")

    # --- the ones that must survive it
    for title in (
        "Oracle has drawn up plans for a new round of layoffs this month",
        "Zillow to lay off 500 staff in restructuring",
        "Pixar lays off over 100 Bay Area workers",
        "BrooklynVegan, Alt Press Hit with Mass Layoffs",
    ):
        keep, tags = _keep_item(title, "", source=LAYOFF_FEED)
        ok(keep and "layoffs" in tags, f"kept and tagged: {title[:44]}")

    # --- the tag is real, not a feed name
    ok("layoffs" in _RELEVANCE_TERMS, "layoffs is a tag the lexicon can award")
    ok("layoffs" in _tags_for("Figma announces a hiring freeze", ""),
       "a hiring freeze earns the tag from any source")
    ok("layoffs" in _tags_for("Severance packages at Adobe", ""),
       "multi-word terms match too")
    ok("layoffs" not in _tags_for("A new design system for laying out grids", ""),
       "'laying out' does not earn a layoffs tag")
    ok("layoffs" not in _tags_for("Ten portfolio tips for designers", ""),
       "a portfolio piece is not a layoffs story")

    # --- every tag on every stored item has to be re-derivable from its own text
    path = pathlib.Path(__file__).resolve().parent.parent / "web/public/data/news.json"
    if path.exists():
        items = json.loads(path.read_text())["items"]
        unearned = [
            (i["title"], sorted(set(i["tags"]) - set(_tags_for(i["title"], i.get("summary", "")))))
            for i in items
            if set(i["tags"]) - set(_tags_for(i["title"], i.get("summary", "")))
        ]
        ok(not unearned, f"no stored item claims a tag its own words do not support ({len(items)} items)")
        for title, extra in unearned[:5]:
            print(f"     unearned {extra} on {title[:50]}")

        ok(all(i["tags"] for i in items), "every stored item carries at least one tag")

        feed = [i for i in items if i["source"] == LAYOFF_FEED]
        ok(all("layoffs" in i["tags"] or "career" in i["tags"] for i in feed),
           f"every story kept from the layoffs feed is about work ({len(feed)} items)")

    print()
    if FAILURES:
        print(f"FAIL — {len(FAILURES)} of {len(PASSES) + len(FAILURES)}")
        for f in FAILURES:
            print(f"   x {f}")
        return 1
    print(f"PASS — {len(PASSES)} assertions on news tagging")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
