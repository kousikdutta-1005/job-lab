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
#
# The long tail is not padding. A Warsaw posting reading "PLN 15,500 – 22,000/mo"
# used to fall through to the dollar default and land on the board at $186,000 —
# a four-fold overstatement of a perfectly ordinary Polish salary, and exactly
# the kind of number that would make someone turn down the right job.
FX_TO_INR: dict[str, float] = {
    "INR": 1.0,
    "USD": 88.0,
    "EUR": 95.0,
    "GBP": 112.0,
    "CAD": 63.0,
    "AUD": 57.0,
    "SGD": 65.0,
    "AED": 24.0,
    "CHF": 102.0,
    "SEK": 8.5,
    "NOK": 8.0,
    "DKK": 12.7,
    "PLN": 23.0,
    "CZK": 3.8,
    "JPY": 0.57,
    "CNY": 12.2,
    "HKD": 11.3,
    "NZD": 51.0,
    "ILS": 24.0,
    "ZAR": 4.8,
    "BRL": 16.0,
    "MXN": 4.7,
    "PHP": 1.5,
    "MYR": 20.0,
    "IDR": 0.0054,
    "THB": 2.6,
    "VND": 0.0035,
    "TRY": 2.1,
    "SAR": 23.5,
    "QAR": 24.2,
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
    # The long tail, symbol-free because most of these only ever appear as a
    # three-letter code next to the number.
    ("CHF", re.compile(r"\bchf\b", re.I)),
    ("SEK", re.compile(r"\bsek\b|\bkr\b", re.I)),
    ("NOK", re.compile(r"\bnok\b", re.I)),
    ("DKK", re.compile(r"\bdkk\b", re.I)),
    ("PLN", re.compile(r"\bpln\b|\bz\u0142\b|\bzloty\b", re.I)),
    ("CZK", re.compile(r"\bczk\b", re.I)),
    ("JPY", re.compile(r"\bjpy\b|\u00a5", re.I)),
    ("CNY", re.compile(r"\bcny\b|\brmb\b", re.I)),
    ("HKD", re.compile(r"\bhkd\b|\bhk\$", re.I)),
    ("NZD", re.compile(r"\bnzd\b|\bnz\$", re.I)),
    ("ILS", re.compile(r"\bils\b|\u20aa", re.I)),
    ("ZAR", re.compile(r"\bzar\b", re.I)),
    ("BRL", re.compile(r"\bbrl\b|\br\$", re.I)),
    ("MXN", re.compile(r"\bmxn\b", re.I)),
    ("PHP", re.compile(r"\bphp\b|\u20b1", re.I)),
    ("MYR", re.compile(r"\bmyr\b|\brm\b", re.I)),
    ("IDR", re.compile(r"\bidr\b", re.I)),
    ("THB", re.compile(r"\bthb\b", re.I)),
    ("VND", re.compile(r"\bvnd\b", re.I)),
    ("TRY", re.compile(r"\btry\b", re.I)),
    ("SAR", re.compile(r"\bsar\b", re.I)),
    ("QAR", re.compile(r"\bqar\b", re.I)),
)

# Codes that are checked ahead of the ambiguous "$" family, because a bare "$"
# also appears inside "C$", "HK$" and "R$".
_QUALIFIED_FIRST = ("CAD", "AUD", "SGD", "NZD", "HKD", "BRL")

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
        if code in _QUALIFIED_FIRST and rx.search(text):
            return code
    for code, rx in _CURRENCY_PATTERNS:
        if rx.search(text):
            return code
    return None


def _currency_near(blob: str, start: int, end: int) -> str | None:
    """Currency read from the number's own neighbourhood before the whole blob.

    Postings that publish several bands put them next to each other:

        • US employees (any location): $189,000–236,200 USD
        • Canadian employees (any location): $178,600–223,200 CAD

    Scanning the whole passage tags the American band as Canadian, which is
    both wrong and flattering — CAD converts lower, so the mistake quietly
    understates the offer. Look around the digits first.
    """
    near = blob[max(0, start - 40) : end + 24]
    return _currency_of(near) or _currency_of(blob)


def _period_of(text: str) -> str:
    lowered = text.lower()
    for period, pattern in _PERIOD_PATTERNS:
        if re.search(pattern, lowered):
            return period
    return "year"


def _period_near(blob: str, start: int, end: int) -> str:
    """Per-what, read beside the number rather than anywhere on the page.

    "In-office 3 days per week unless designated remote. Compensation: ... is
    $150,000 - $165,000" was being read as $150,000 *a week*, multiplied by 52,
    and thrown away by the sanity check as absurd — so a plainly stated band
    vanished because of an office-attendance policy sixty words earlier.

    When nothing sits beside the number, assume a year. Annual is what bands
    are almost always quoted in, and the failure modes are not symmetric:
    guessing yearly on an hourly rate understates it, while guessing weekly on
    a yearly one inflates it fifty-fold.
    """
    near = blob[max(0, start - 30) : end + 44]
    for period, pattern in _PERIOD_PATTERNS:
        if re.search(pattern, near.lower()):
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
            currency = _currency_near(blob, match.start(), match.end())
            period = _period_near(blob, match.start(), match.end())
            # Nobody is paid £150,000 a week. A short period beside a large
            # number means the period belongs to some other sentence.
            if period in ("hour", "day", "week") and low >= 20_000:
                period = "year"
        break

    if low is None or high is None:
        return None
    if low > high:
        low, high = high, low

    multiplier = _PERIOD_TO_ANNUAL.get(period, 1)
    low_annual, high_annual = low * multiplier, high * multiplier

    # No currency means no band. The old fallback guessed rupees above 200,000
    # and dollars below it, which is a coin toss dressed up as a number: it read
    # a benefits paragraph as ₹298,992 for a company that had actually written
    # $182,000-$207,000 further down the page. An employer publishing pay always
    # writes the unit; if it isn't there, this isn't pay.
    if not currency or currency not in FX_TO_INR:
        return None
    inr_low = low_annual * FX_TO_INR[currency]
    inr_high = high_annual * FX_TO_INR[currency]
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


_PAY_KEYWORDS = re.compile(
    r"\b(?:salary|salaries|compensation|pay\s*range|pay\s*band|base\s*pay|pay\s*transparency"
    r"|total\s+(?:comp|compensation|rewards)|remuneration|\bctc\b|\blpa\b|annual\s+pay"
    r"|starting\s+pay|hourly\s+rate|expected\s+pay|budgeted\s+range)",
    re.I,
)

# Big numbers that belong to the company rather than to you. A posting that
# opens with "$180+ billion in annualized transactions" is bragging, not
# offering, and a salary tool that cannot tell the difference is worse than one
# that says nothing.
_NOT_PAY = re.compile(
    r"\b(?:transactions?|revenue|arr\b|valuation|raised|funding|market\s+cap|processes|processed"
    r"|sales|assets\s+under|gmv|turnover|in\s+(?:annual\s+)?bookings|customers|users)\b",
    re.I,
)


def _pay_windows(text: str) -> list[str]:
    """Every passage that might hold a band, best-looking first.

    The old version took the first mention of the word "salary" and read 160
    characters that could contain neither a newline nor a full stop. Employers
    write "Pay Range\\n $144,800 — $199,100" and "$149,040.00 - $195,615.00",
    and they put a "Compensation & Benefits" heading a page above the number.
    All three of those defeated it: 45% of postings state pay and only 16%
    reached the board.
    """
    flat = " ".join(text.split())
    windows: list[str] = []
    for match in _PAY_KEYWORDS.finditer(flat):
        window = flat[max(0, match.start() - 110) : match.end() + 240]
        if not re.search(r"\d", window):
            continue
        # Only veto when the disqualifying word sits beside the digits; plenty
        # of genuine bands are followed by an unrelated sentence about users.
        digit = re.search(r"\d", window)
        neighbourhood = window[max(0, digit.start() - 70) : digit.start() + 70]
        if _NOT_PAY.search(neighbourhood):
            continue
        windows.append(window)
    return windows


def attach_salaries(jobs: list[Job]) -> int:
    """Parse pay for every job that discloses it. Returns how many disclosed."""
    disclosed = 0
    for job in jobs:
        # The structured field first, because a posting that fills in the ATS
        # compensation field is more reliable than one that mentions a number
        # in prose.
        parsed = parse_salary(job.salary)
        if not parsed:
            fallback = None
            for window in _pay_windows(job.description_text or ""):
                candidate = parse_salary(window)
                if not candidate:
                    continue
                # A real range beats a lone figure, and a lone figure beats
                # nothing — but keep looking for the range.
                if candidate["low"] != candidate["high"]:
                    parsed = candidate
                    break
                fallback = fallback or candidate
            parsed = parsed or fallback
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
