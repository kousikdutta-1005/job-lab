"""The Advisor's skill-gap ranking, which used to rank trivia first.

It sorted by IDF alone. IDF rises as a term gets rarer, so the "highest signal"
gaps were the *least* common terms in the corpus: on the real board that meant
aria, evangelism, jobs to be done, lottie and pattern library — each appearing
in 2 of 183 senior postings — while "ai", in 162 of them, never surfaced.
Nineteen terms tied at exactly the same IDF, so the five shown were simply the
alphabetically first five of that tie, presented as a ranking.

    python3 tests/test_skill_gaps.py
"""

from __future__ import annotations

import sys
from pathlib import Path
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from joblab.insights import build_insights

# Rarer term => higher IDF. This spread is what made the old sort invert.
IDF = {"ai": 1.2, "figma": 2.0, "lottie": 5.8, "aria": 5.8}


def job(
    keywords: list[str],
    *,
    seniority: str = "senior",
    company: str = "Acme",
    eligible: bool = True,
) -> SimpleNamespace:
    return SimpleNamespace(
        keywords=keywords,
        seniority=seniority,
        seniority_label=seniority,
        company=company,
        title="Senior Product Designer",
        url="https://example.com/j",
        location_raw="Bengaluru",
        cities=["Bengaluru"],
        eligible=eligible,
        remote="onsite",
        match_score=80,
        salary_parsed=None,
        posted_at=None,
        india=True,
        description_text="",
    )


def profile(strengths: tuple[str, ...] = ()) -> SimpleNamespace:
    return SimpleNamespace(
        strengths=list(strengths),
        seniority="senior",
        location="Bengaluru",
        to_dict=lambda: {"strengths": list(strengths), "seniority": "senior"},
    )


def corpus() -> list[SimpleNamespace]:
    """40 senior roles: ai in 34, figma in 20, lottie and aria in 2."""
    out = []
    for i in range(40):
        terms: list[str] = []
        if i < 34:
            terms.append("ai")
        if i < 20:
            terms.append("figma")
        if i < 2:
            terms += ["lottie", "aria"]
        out.append(job(terms, company=f"Co{i}"))
    return out


def gap_card(jobs, prof, idf=IDF):
    built = build_insights(jobs, prof, idf, None, None)
    cards = built.get("insights", built) if isinstance(built, dict) else built
    for card in cards:
        if "skill gap" in card["headline"]:
            return card
    return None


def main() -> int:
    failures = 0

    def check(label: str, ok: bool, detail: str = "") -> None:
        nonlocal failures
        print(f"  {'.' if ok else 'x'} {label}" + ("" if ok else f" -> {detail}"))
        failures += 0 if ok else 1

    card = gap_card(corpus(), profile())
    check("a gap card is produced at all", card is not None)
    if card is None:
        print("\nFAIL — no card to inspect")
        return 1

    terms = [row["term"] for row in card["evidence"]]

    check("the term in 34 of 40 senior roles leads", terms[:1] == ["ai"], str(terms))
    check("the term in 20 of 40 also ranks", "figma" in terms, str(terms))
    check("a term in 2 of 40 never ranks (lottie)", "lottie" not in terms, str(terms))
    check("a term in 2 of 40 never ranks (aria)", "aria" not in terms, str(terms))

    lead = card["evidence"][0]
    check("the row carries its raw support", lead["senior_jobs"] == 34, str(lead.get("senior_jobs")))
    check("and its share of the senior market", abs(lead["share"] - 34 / 40) < 0.01, str(lead.get("share")))
    check("the body states that share in words", "85%" in card["body"], card["body"][:90])
    check("leverage beats rarity for ordering", lead["leverage"] > card["evidence"][1]["leverage"], str(terms))

    claimed = gap_card(corpus(), profile(strengths=("ai",)))
    claimed_terms = [row["term"] for row in claimed["evidence"]] if claimed else []
    check("a strength already on the profile is not a gap", "ai" not in claimed_terms, str(claimed_terms))
    check("and the next real gap takes the lead", claimed_terms[:1] == ["figma"], str(claimed_terms))

    # Confidence used to read "medium" whenever three rows happened to exist,
    # which described the layout rather than the evidence.
    check("strong support reads high confidence", card["confidence"] == "high", card["confidence"])

    thin = [job(["lottie"] if i < 2 else [], company=f"Co{i}") for i in range(40)]
    check("thin evidence produces no claim at all", gap_card(thin, profile()) is None)

    junior = [job(["ai"], seniority="junior", company=f"Co{i}") for i in range(20)]
    check("no senior roles means no senior advice", gap_card(junior, profile()) is None)

    # The population the advice is about. The card says these terms unlock
    # senior roles, and the board is the eligible set -- but it counted every
    # crawled posting: "56% of the 173 senior roles on the board", printed
    # beside a nav reading "Board 76". It moved the numbers too. Strategy is in
    # 56% of all senior postings and 46% of the ones you can actually apply to.
    reachable = [job(["ai", "figma"], company=f"Reach{i}") for i in range(6)]
    walled = [job(["lottie"], company=f"Walled{i}", eligible=False) for i in range(40)]
    scoped = gap_card(reachable + walled, profile())
    check("a gap card is still produced from reachable roles alone", scoped is not None)
    if scoped:
        terms = [row["term"] for row in scoped["evidence"]]
        check(
            "a term seen only in roles you cannot take is not offered as a gap",
            "lottie" not in terms, str(terms),
        )
        check("terms from reachable roles are still ranked", "ai" in terms, str(terms))
        check(
            "the sentence names the population it counted",
            "senior roles you can take" in scoped["body"], scoped["body"],
        )
        check(
            "and counts only those, not the whole crawl",
            " 6 senior roles" in scoped["body"], scoped["body"],
        )
        check(
            "and no longer calls the whole crawl the board",
            "on the board" not in scoped["body"], scoped["body"],
        )

    # Evidence has to tell the terms apart. Examples were the first three
    # postings in crawl order, so the same three employers filled every row of
    # every term, three times each, and the rows stopped distinguishing terms.
    repeated = [job(["ai", "figma"], company="Hackerrank") for _ in range(3)]
    repeated += [job(["ai", "figma"], company="Razorpay") for _ in range(3)]
    repeated += [job(["ai", "figma"], company="Pixel One") for _ in range(2)]
    varied = gap_card(repeated, profile())
    check("a gap card is produced from the repeated-company fixture", varied is not None)
    if varied:
        for row in varied["evidence"]:
            firms = [e["company"] for e in row["examples"]]
            check(f"{row['term']} shows each company once", len(firms) == len(set(firms)), str(firms))
            check(f"{row['term']} still shows three examples", len(firms) == 3, str(firms))

    print("\n" + (f"FAIL — {failures} problem(s)" if failures else "PASS — gaps ranked by reach, not rarity"))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
