"""A level the posting never stated is not a level.

The pay-by-level chart read as a ladder, and the ladder said mid-level pays more
than senior and lead. It did not. Titles with no seniority marker were being
defaulted to mid, which swept whole-ladder reqs -- Ramp at $172k-$440k, OpenAI
and Anthropic at $230k-$385k, Airtable's explicit "8+ YOE" -- into the mid
bucket and lifted its median above two rungs above it.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from joblab.classify import enrich
from joblab.config import seniority_from_title, seniority_from_years
from joblab.models import Job
from joblab.salary import benchmarks

problems: list[str] = []


def pass_(msg: str) -> None:
    print(f"  . {msg}")


def fail(msg: str) -> None:
    problems.append(msg)
    print(f"  x {msg}")


def check(cond: bool, ok: str, bad: str) -> None:
    pass_(ok) if cond else fail(bad)


# --- the title only speaks when it speaks -----------------------------------

check(
    seniority_from_title("Product Designer") is None,
    "an unmarked title reports no level rather than guessing mid",
    "an unmarked title still returns a level",
)
check(
    seniority_from_title("Senior Product Designer") == "senior",
    "a stated level is still read from the title",
    "the title parser stopped reading stated levels",
)
for title, want in [
    ("Staff Product Designer", "staff"),
    ("Design Manager", "manager"),
    ("Head of Design", "head"),
    ("Principal Designer", "principal"),
    ("Junior UX Designer", "junior"),
]:
    check(
        seniority_from_title(title) == want,
        f"{title!r} still reads as {want}",
        f"{title!r} read as {seniority_from_title(title)!r}, wanted {want!r}",
    )

# --- stated years are evidence, and outrank an absent title -----------------

check(seniority_from_years(None) is None, "no stated years implies no level", "invented a level from nothing")
check(seniority_from_years(8) == "staff", "8+ years implies staff weight", "8 years did not imply staff")
check(seniority_from_years(5) == "senior", "5 years implies senior", "5 years did not imply senior")
check(seniority_from_years(2) == "mid", "2 years implies mid", "2 years did not imply mid")
check(seniority_from_years(0) == "junior", "0 years implies junior", "0 years did not imply junior")


def made(title: str, text: str = "") -> Job:
    job = Job(
        id="x",
        title=title,
        company="C",
        company_slug="c",
        url="u",
        source="s",
        location_raw="Remote",
    )
    job.description_text = text
    return enrich(job)


airtable = made("Product Designer", "We are looking for someone with 8+ years of experience.")
check(
    airtable.seniority == "staff" and airtable.seniority_source == "years",
    "a plain title with '8+ years' is classified staff, from the years",
    f"got {airtable.seniority}/{airtable.seniority_source}",
)
check(
    airtable.seniority_stated,
    "and counts as stated, because the posting did state it",
    "stated years were not treated as evidence",
)

titled = made("Senior Product Designer", "8+ years of experience required.")
check(
    titled.seniority == "senior" and titled.seniority_source == "title",
    "the title wins over the years when both are present",
    "years overrode an explicit title",
)

silent = made("Product Designer", "Join our team and do great work.")
check(
    silent.seniority_stated is False and silent.seniority_source == "assumed",
    "a posting that says nothing is marked as an assumption",
    "a silent posting was recorded as if it had stated a level",
)
check(
    silent.seniority == "mid",
    "and still carries a workable default so matching keeps functioning",
    "the default was removed, which would break eligibility and matching",
)

# --- the aggregate must exclude assumptions ---------------------------------


def priced(title: str, low: int, high: int, text: str = "") -> Job:
    job = made(title, text)
    job.salary_parsed = {"inr_low": low, "inr_high": high, "currency": "USD"}
    return job


CR = 10_000_000
# Three honest senior postings, plus four whole-ladder reqs that state nothing
# and pay far more. Before the fix the latter landed in mid-level.
jobs = [priced("Senior Product Designer", int(1.5 * CR), int(1.7 * CR)) for _ in range(3)]
jobs += [priced("Product Designer", int(3.0 * CR), int(4.0 * CR)) for _ in range(4)]

pay = benchmarks(jobs)
levels = pay["by_seniority"]

check(
    "Mid-level" not in levels,
    "postings with no stated level do not create a mid-level band",
    f"mid-level band built from assumptions: {levels.get('Mid-level')}",
)
check(
    "Senior" in levels and levels["Senior"]["n"] == 3,
    "the senior band contains exactly the postings that said senior",
    f"senior band is {levels.get('Senior')}",
)
check(
    pay["unstated_level"] is not None and pay["unstated_level"]["n"] == 4,
    "the unstated postings are reported as their own group, not dropped",
    f"unstated group is {pay['unstated_level']}",
)
check(
    pay["unstated_level"]["median"] > levels["Senior"]["median"],
    "and are visibly the better-paying group, which is the honest finding",
    "the unstated group lost its pay signal",
)

# The bug in one assertion: had these been folded in, mid would have outranked
# senior, and the chart would have told a designer that growing up the ladder
# costs money.
folded = [j.salary_parsed for j in jobs]
folded_median = sorted((b["inr_low"] + b["inr_high"]) // 2 for b in folded)[len(folded) // 2]
check(
    folded_median > levels["Senior"]["median"],
    "regression guard: folding them back in would still invert the ladder",
    "the fixture no longer reproduces the original inversion",
)

print()
if problems:
    print(f"FAIL — {len(problems)} problem(s)")
    sys.exit(1)
print("PASS — a level is only reported when the posting stated one")
