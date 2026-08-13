"""Pay bands that employers really wrote, taken from postings we really crawled.

Every string in here is copied verbatim out of `web/public/data/jobs.json`,
including the newlines, because the newlines were the bug. Salary is the single
most decision-relevant fact on a card and the parser was silently dropping most
of the ones sitting in plain sight: 45% of postings state a number, only 16%
made it onto the board.

    python3 tests/test_salary_prose.py
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from joblab.models import Job
from joblab.salary import attach_salaries, parse_salary


def band(description: str, *, salary: str | None = None) -> dict | None:
    row = Job(
        id="t",
        title="Product Designer",
        company="Test",
        company_slug="test",
        source="test",
        url="https://example.com",
        location_raw="Remote",
        description_text=description,
        salary=salary,
    )
    attach_salaries([row])
    return row.salary_parsed


# Verbatim from the crawl. The whitespace is the point.
ANDURIL = (
    "Design systems at scale.\n\n US Salary Range\n $154,000 — $231,000 USD \n\n "
    "The salary range for this role is an estimate based on a wide range of factors."
)
OSCAR = (
    "This is a hybrid role. #LI-Hybrid\n\n Pay Transparency: \n\n "
    "The base pay for this role is: $149,040.00 - $195,615.00 per year. "
    "You are also eligible for employee benefits."
)
MERCURY = (
    "The total rewards package.\n\nThe salary ranges for this role are the following:\n\n"
    "• US employees (any location): $189,000–236,200 USD\n\n"
    "• Canadian employees (any location): $178,600–223,200 CAD"
)
DATABRICKS = (
    "For information regarding which range your location is in visit our page here .\n\n "
    "Zone 1 Pay Range\n $144,800 — $199,100 USD \n\n Pay Range Transparency \n\n "
    "Databricks is committed to fair and equitable compensation practices."
)
CUSTOMER_IO = (
    "Compensation & Benefits\n\n We believe in transparency. Starting salary for this "
    "role is $171k–$193k USD (or equivalent in local currency) depending on experience."
)
# The trap: a company metric, not pay. There is no salary anywhere in this one.
RAZORPAY = (
    "We are helping businesses manage money more efficiently. Our scale speaks volumes: "
    "Razorpay processes $180+ billion in annualized transactions, powering leading "
    "businesses. We offer competitive compensation and a great culture."
)
# The other trap: a keyword early with no number, the real band much later.
LATE_BAND = (
    "We offer competitive compensation and generous benefits.\n\n"
    + ("Responsibilities include shaping the design language. " * 30)
    + "\n\nBase salary range\n $120,000 — $160,000 USD"
)
INDIA = "Compensation: ₹45,00,000 - ₹60,00,000 per annum, plus ESOPs."
INDIA_LPA = "CTC: 28-40 LPA depending on experience."

CASES = [
    ("Anduril, band on its own line", ANDURIL, 154_000, 231_000, "USD"),
    ("Oscar Health, decimal points", OSCAR, 149_040, 195_615, "USD"),
    ("Mercury, band in a bullet list", MERCURY, 189_000, 236_200, "USD"),
    ("Databricks, zone heading", DATABRICKS, 144_800, 199_100, "USD"),
    ("Customer.io, k-notation after a heading", CUSTOMER_IO, 171_000, 193_000, "USD"),
    ("late band beats an early keyword", LATE_BAND, 120_000, 160_000, "USD"),
    ("Indian rupee band", INDIA, 4_500_000, 6_000_000, "INR"),
    ("Indian LPA band", INDIA_LPA, 2_800_000, 4_000_000, "INR"),
]


def main() -> int:
    failures = 0

    for label, text, low, high, currency in CASES:
        got = band(text)
        if got and got["low"] == low and got["high"] == high and got["currency"] == currency:
            print(f"  . {label}")
        else:
            print(f"  x {label} -> {got}")
            failures += 1

    checks = [
        ("a $180 billion transaction volume is not a salary", band(RAZORPAY), None),
        (
            "the ATS compensation field still wins over prose",
            band(ANDURIL, salary="$200,000 - $250,000"),
            200_000,
        ),
        (
            "silence stays silent",
            band("We are a remote-first team of 40 people building developer tools."),
            None,
        ),
        (
            "hourly rates still annualise",
            parse_salary("Competitive contract compensation range of $50 - $80 per hour"),
            100_000,
        ),
    ]
    for label, got, expected_low in checks:
        ok = got is None if expected_low is None else bool(got and got["low"] == expected_low)
        print(f"  {'.' if ok else 'x'} {label}" + ("" if ok else f" -> {got}"))
        failures += 0 if ok else 1

    print("\n" + (f"FAIL — {failures} problem(s)" if failures else "PASS — prose bands read correctly"))
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
