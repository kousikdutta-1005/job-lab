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

from joblab.news import _RELEVANCE_TERMS, _keep_item, _tags_for, strip_feed_chrome

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

    # --- Feed chrome is the publication's words, not the story's -------------
    # Medium signs every item "Continue reading on UX Collective ». The masthead
    # contains "ux", so the design tag was being awarded by the sign-off.
    loom = "90 years of loom engineering went into teaching machines to catch their mistakes.\n Continue reading on UX Collective \u00bb"
    ok("design" in _tags_for("The loom that raised its hand", loom),
       "the raw teaser does earn a design tag, which is the bug")
    cleaned = strip_feed_chrome(loom, "UX Collective")
    ok("Continue reading" not in cleaned, "the sign-off is stripped")
    ok("UX Collective" not in cleaned, "and the masthead with it")
    ok("loom engineering" in cleaned, "while the story's own sentence survives")
    ok(not _tags_for("The loom that raised its hand", cleaned),
       "a loom story about manufacturing earns no tag once the masthead is gone")

    keep, tags = _keep_item("The loom that raised its hand", cleaned, source="UX Collective")
    ok(not keep, "and it is no longer kept, because having any tag is the relevance gate")

    egg = "On the next hack for our humanity, in the age of AI\n Continue reading on UX Collective \u00bb"
    egg_tags = _tags_for("The side of the egg", strip_feed_chrome(egg, "UX Collective"))
    ok("design" not in egg_tags, "an AI essay stops claiming to be a design story")
    ok("product" in egg_tags, "but keeps the tag its own words earned")

    # A story that genuinely is about design keeps its tag, so the strip is not
    # simply deleting evidence.
    real = "A practical guide to design systems for product teams.\n Continue reading on UX Collective \u00bb"
    ok("design" in _tags_for("Design systems that scale", strip_feed_chrome(real, "UX Collective")),
       "a genuine design piece is untouched")

    ok(strip_feed_chrome("Design at Smashing Magazine is fun.", "Smashing Magazine").strip() == "Design at is fun.",
       "the publication name is removed wherever it appears")
    ok("design" in strip_feed_chrome("Notes on design", "UX Collective"),
       "a source whose name is absent leaves the text alone")
    ok(strip_feed_chrome("On design", "Hacker News \u2014 design") == "On design",
       "a compound feed label never strips a word from the story")
    ok(strip_feed_chrome("", "UX Collective") == "", "empty text is safe")

    for pub, tail in (("A List Apart", "The post Foo appeared first on A List Apart."),
                      ("Smashing Magazine", "Read more on Smashing Magazine")):
        ok(not strip_feed_chrome(f"A story. {tail}", pub).replace("A story.", "").strip(),
           f"{pub} sign-off removed")

    stored = pathlib.Path(__file__).resolve().parent.parent / "web/public/data/news.json"
    if stored.exists():
        items = json.loads(stored.read_text()).get("items", [])
        dirty = [i["title"] for i in items if "continue reading on" in (i.get("summary") or "").lower()]
        ok(not dirty, f"no stored summary still carries feed chrome ({len(items)} items)")
        for t in dirty[:3]:
            print(f"     chrome left on {t[:50]}")

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
