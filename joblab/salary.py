"""What the market is actually paying, taken from postings that say so.

Most salary tools estimate. This one only reports. Every number here was
written down by an employer in a live job posting, which makes the sample
small and biased toward companies confident enough to publish a band — but it
makes each number real, and it means the board can show its working.

Anything inferred rather than stated is labelled as such, and postings that
disclose nothing are counted so the coverage is visible instead of implied.
"""

from __future__ import annotations

import re
import statistics
from collections import defaultdict

from .models import Job

# Approximate INR per unit, used only to put bands on one axis so they can be
# compared. Rates move; the board shows the original currency alongside.
FX_TO_INR: dict[str, float] = {
    "INR": 1.0,
    "USD": 88.0,
    "EUR": 95.0,
    "GBP": 112.0,
    "CAD": 63.0,
    "AUD": 57.0,
    "SGD": 65.0,
    "AED": 24.0,
}

_CURRENCY_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    # Word-boundary matched, and this is not fussiness. Substring matching read
    # "rs " out of "Offe(rs )Equity" and tagged every "$130K – $180K" band as
    # rupees, which put a Bay Area salary below an Indian one on the same axis.
    ("INR", re.compile(r"₹|\binr\b|\brs\.?\b|\brupees?\b|\blpa\b|\blakhs?\b|\blacs?\b|\bcrores?\b", re.I)),
    ("USD", re.compile(r"\$|\busd\b|\bdollars?\b", re.I)),
    ("EUR", re.compile(r"€|\beur\b|\beuros?\b", re.I)),
    ("GBP", re.compile(r"£|\bgbp\b|\bpounds?\b", re.I)),
    ("CAD", re.compile(r"\bcad\b|\bc\$", re.I)),
    ("AUD", re.compile(r"\baud\b|\ba\$", re.I)),
    ("SGD", re.compile(r"\bsgd\b|\bs\$", re.I)),
    ("AED", re.compile(r"\baed\b|\bdirhams?\b", re.I)),
)

# Ordered: the most explicit forms first, so "12-18 LPA" is never read as a
# bare number range in an unknown unit.
_AMOUNT_PATTERNS: tuple[tuple[str, re.Pattern[str]], ...] = (
    (
        "lpa_range",
        re.compile(r"(\d{1,3}(?:\.\d+)?)\s*(?:-|–|—|to)\s*(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lacs?|lakhs?)\b", re.I),
    ),
    (
        "lpa_single",
        re.compile(r"(\d{1,3}(?:\.\d+)?)\s*(?:lpa|lacs?|lakhs?)\b", re.I),
    ),
    (
        "plain_range",
        re.compile(
            r"(?:[₹$€£]|\b(?:inr|usd|eur|gbp|cad|aud|sgd)\b)?\s*"
            r"(\d[\d,]{0,12}(?:\.\d+)?)\s*(?:k\b)?\s*(?:-|–|—|to)\s*"
            r"(?:[₹$€£]|\b(?:inr|usd|eur|gbp|cad|aud|sgd)\b)?\s*"
            r"(\d[\d,]{0,12}(?:\.\d+)?)\s*(k\b)?",
            re.I,
        ),
    ),
)

_PERIOD_PATTERNS: tuple[tuple[str, str], ...] = (
    ("hour", r"(per\s+hour|/\s*hr|hourly|an hour|/hour)"),
    ("month", r"(per\s+month|/\s*mo\b|monthly|a month|/month)"),
    ("week", r"(per\s+week|/\s*wk|weekly|a week)"),
    ("day", r"(per\s+day|/\s*day|daily|a day)"),
    ("year", r"(per\s+year|/\s*yr|annually|annual|a year|per\s+annum|p\.a\.|lpa)"),
)

_PERIOD_TO_ANNUAL = {"hour": 2000, "day": 250, "week": 52, "month": 12, "year": 1}


def _currency_of(text: str) -> str | None:
    # Dollar-family symbols are ambiguous, so a qualified "C$" or "A$" wins
    # over the bare "$" that also appears inside them.
    for code, rx in _CURRENCY_PATTERNS:
        if code in ("CAD", "AUD", "SGD") and rx.search(text):
            return code
    for code, rx in _CURRENCY_PATTERNS:
        if rx.search(text):
            return code
    return None


def _period_of(text: str) -> str:
    lowered = text.lower()
    for period, pattern in _PERIOD_PATTERNS:
        if re.search(pattern, lowered):
            return period
    return "year"


def _to_number(raw: str, *, thousands: bool = False) -> float:
    value = float(raw.replace(",", ""))
    return value * 1000 if thousands else value


def parse_salary(text: str | None) -> dict | None:
    """Read a pay band out of whatever the ATS handed us.

    Returns annualised low/high in the stated currency, plus an INR equivalent
    so that bands from different countries can sit on the same axis.
    """
    if not text:
        return None
    blob = " ".join(str(text).split())[:400]
    if not re.search(r"\d", blob):
        return None

    currency = _currency_of(blob)
    period = _period_of(blob)

    low = high = None
    for kind, rx in _AMOUNT_PATTERNS:
        match = rx.search(blob)
        if not match:
            continue
        if kind == "lpa_range":
            low = float(match.group(1)) * 100_000
            high = float(match.group(2)) * 100_000
            currency, period = "INR", "year"
        elif kind == "lpa_single":
            low = high = float(match.group(1)) * 100_000
            currency, period = "INR", "year"
        else:
            thousands = bool(match.group(3))
            low = _to_number(match.group(1), thousands=thousands)
            high = _to_number(match.group(2), thousands=thousands)
        break

    if low is None or high is None:
        return None
    if low > high:
        low, high = high, low

    multiplier = _PERIOD_TO_ANNUAL.get(period, 1)
    low_annual, high_annual = low * multiplier, high * multiplier

    # Sanity. Anything outside this range is a misread number — a job id, a
    # headcount, a founding year — not a salary.
    if not currency:
        currency = "INR" if low_annual > 200_000 else "USD"
    inr_low = low_annual * FX_TO_INR.get(currency, 1.0)
    inr_high = high_annual * FX_TO_INR.get(currency, 1.0)
    if inr_low < 100_000 or inr_high > 200_000_000:
        return None

    return {
        "currency": currency,
        "period": "year",
        "low": round(low_annual),
        "high": round(high_annual),
        "inr_low": round(inr_low),
        "inr_high": round(inr_high),
        "source_text": blob[:160],
    }


def attach_salaries(jobs: list[Job]) -> int:
    """Parse pay for every job that discloses it. Returns how many disclosed."""
    disclosed = 0
    for job in jobs:
        # The structured field first, then the description, because a posting
        # that fills in the ATS compensation field is more reliable than one
        # that mentions a number in prose.
        parsed = parse_salary(job.salary)
        if not parsed:
            window = (job.description_text or "")
            match = re.search(
                r"[^.\n]{0,120}(?:salary|compensation|ctc|pay range|base pay|remuneration|lpa)[^.\n]{0,160}",
                window,
                re.I,
            )
            if match:
                parsed = parse_salary(match.group(0))
        job.salary_parsed = parsed
        if parsed:
            disclosed += 1
    return disclosed


def _band(values: list[int]) -> dict:
    values = sorted(values)
    return {
        "n": len(values),
        "min": values[0],
        "p25": int(statistics.quantiles(values, n=4)[0]) if len(values) >= 4 else values[0],
        "median": int(statistics.median(values)),
        "p75": int(statistics.quantiles(values, n=4)[2]) if len(values) >= 4 else values[-1],
        "max": values[-1],
    }


def benchmarks(jobs: list[Job]) -> dict:
    """What the disclosed postings say the market pays, sliced usefully.

    Deliberately refuses to report a band from fewer than three postings. A
    median of one number is not a market rate, and printing it anyway is how
    salary tools end up quietly making things up.
    """
    disclosed = [j for j in jobs if getattr(j, "salary_parsed", None)]

    def collect(key_fn) -> dict:
        buckets: dict[str, list[int]] = defaultdict(list)
        for job in disclosed:
            key = key_fn(job)
            if not key:
                continue
            band = job.salary_parsed
            midpoint = (band["inr_low"] + band["inr_high"]) // 2
            buckets[key].append(midpoint)
        return {
            key: _band(values)
            for key, values in sorted(buckets.items(), key=lambda kv: -len(kv[1]))
            if len(values) >= 3
        }

    india = [j for j in disclosed if j.india]
    remote = [j for j in disclosed if j.workplace == "remote" and j.eligible]

    return {
        "coverage": {
            "jobs": len(jobs),
            "disclosed": len(disclosed),
            "share": round(len(disclosed) / len(jobs), 3) if jobs else 0,
            "india_disclosed": len(india),
        },
        "by_seniority": collect(lambda j: j.seniority_label),
        "by_city": collect(lambda j: j.cities[0] if j.cities else None),
        "india_by_seniority": {
            k: v
            for k, v in collect(lambda j: j.seniority_label if j.india else None).items()
        },
        "remote_eligible": _band(
            [(j.salary_parsed["inr_low"] + j.salary_parsed["inr_high"]) // 2 for j in remote]
        )
        if len(remote) >= 3
        else None,
        "top_paying": [
            {
                "title": j.title,
                "company": j.company,
                "location": j.location_raw,
                "url": j.url,
                "band": j.salary_parsed,
            }
            for j in sorted(
                disclosed, key=lambda j: -(j.salary_parsed["inr_high"]), 
            )[:15]
        ],
    }
