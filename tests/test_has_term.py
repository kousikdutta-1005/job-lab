"""Counting a term means counting a word.

`strength in description_text` is a substring test. It put "ai" in 322 of the
330 crawled postings -- 98% -- because "ai" sits inside detail, email,
available, maintain, training, certain and Chennai. That count drives the
Advisor sentence naming which of your claims to lead a pitch with, so the
inflation reordered what the app told you to say about yourself.

The web app already had this rule as hasTerm() in resume.ts. This is the same
rule on the Python side, in one place, with an optional plural so that "design
systems" counts as "design system".

    python3 tests/test_has_term.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from joblab.classify import extract_keywords
from joblab.config import has_term

failures = 0


def check(label: str, ok: bool, detail: str = "") -> None:
    global failures
    print(f"  {'.' if ok else 'x'} {label}" + ("" if ok else f" -> {detail}"))
    failures += 0 if ok else 1


# The sentences that inflated the count. Every one contains the letters "ai"
# and none of them is about AI.
DECOYS = [
    "Strong attention to detail is essential.",
    "Send an email to the hiring team.",
    "Available to start immediately.",
    "You will maintain the component library.",
    "Ongoing training and development budget.",
    "Our Chennai office is hiring.",
    "A certain amount of ambiguity is expected.",
    "Please retain a copy for your records.",
    "We are looking for a bargain.",
    "Daily standups with the wider chain of teams.",
]

for text in DECOYS:
    check(f"not AI: {text[:44]!r}", not has_term(text, "ai"), "matched inside a word")

REAL = [
    "Experience designing AI products.",
    "You have shipped ai-native features.",
    "Familiarity with AI/ML tooling.",
    "Our work is AI, end to end.",
    "(AI)",
]
for text in REAL:
    check(f"is AI: {text[:44]!r}", has_term(text, "ai"), "missed a genuine mention")

# Plurals are the same term. Rejecting them would trade one undercount for
# another, which is how a fix becomes the next bug.
check("'design systems' counts as 'design system'", has_term("we own the design systems", "design system"))
check("'design system' still counts", has_term("our design system", "design system"))
check("'user flows' counts as 'user flow'", has_term("map the user flows", "user flow"))
check(
    "but a longer word is still not the term",
    not has_term("systemic change", "system"),
    "'system' matched inside 'systemic'",
)
check(
    "and a prefix is not the term either",
    not has_term("redesigned the flow", "design"),
    "'design' matched inside 'redesigned'",
)

# Boundaries and empties.
check("term at the start of the text", has_term("Figma is required", "figma"))
check("term at the very end", has_term("we use figma", "figma"))
check("case does not matter", has_term("FIGMA and Sketch", "figma"))
check("punctuation does not hide a term", has_term("tools: figma, sketch.", "figma"))
check("empty text matches nothing", not has_term("", "figma"))
check("None text matches nothing", not has_term(None, "figma"))
check("empty term matches nothing", not has_term("figma", ""))

# The keyword extractor must agree with it -- one rule, not two.
kw, _ = extract_keywords("Strong attention to detail. Send an email. Available now. Chennai.")
check("the extractor finds no AI in the decoy paragraph", "ai" not in kw, str(kw))
kw2, _ = extract_keywords("We build AI products and own the design systems.")
check("the extractor finds AI when it is really there", "ai" in kw2, str(kw2))
check("and picks up the plural design systems", "design system" in kw2, str(kw2))

# The measurement that started this, restated as an assertion: on the real
# corpus, substring counting and word counting must not agree, or the fixture
# has stopped reproducing the bug.
corpus = Path(__file__).resolve().parents[1] / "web/public/data/jobs.json"
if corpus.exists():
    import json

    jobs = json.loads(corpus.read_text())["jobs"]
    subs = sum(1 for j in jobs if "ai" in (j.get("description_text") or "").lower())
    words = sum(1 for j in jobs if has_term(j.get("description_text"), "ai"))
    check(
        f"on the live corpus substring counting still inflates ai ({subs} vs {words})",
        subs > words,
        "the corpus no longer demonstrates the inflation",
    )
    check(
        f"and the word count is not a near-universal {round(100 * words / max(1, len(jobs)))}%",
        words < len(jobs) * 0.95,
        "word counting still claims almost every posting mentions ai",
    )

print()
if failures:
    print(f"FAIL — {failures} problem(s)")
    sys.exit(1)
print("PASS — terms are matched as words")
