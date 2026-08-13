"""PPP and visa-aware relocation math for an Indian passport holder.

The tempting mistake is to compare nominal salaries. That says a US role paying
2x is better even when the visa path is a lottery and the city costs 3x as much.
This module keeps the math explicit: salary evidence, tax drag, PPP/cost source,
and immigration feasibility are separate fields so the UI can avoid a fake
precision score.
"""

from __future__ import annotations

import math
import statistics
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any

from .benchmarks import BenchmarkBand, benchmark_basis, benchmark_for
from .net import fetch_json
from .salary import FX_TO_INR
from .score import Profile

WORLDBANK_IND_PPP_URL = "https://api.worldbank.org/v2/country/IND/indicator/PA.NUS.PPP?format=json&per_page=100"

# Country factors are local currency units per international dollar. Non-India
# values are static fallbacks from recent World Bank PA.NUS.PPP releases; the
# nightly run refreshes India because that is the baseline and the requested URL
# shape has broken before when countries were combined incorrectly.
STATIC_PPP: dict[str, dict[str, Any]] = {
    "IN": {"country": "India", "currency": "INR", "ppp": 23.2, "source": "World Bank PA.NUS.PPP fallback"},
    "US": {"country": "United States", "currency": "USD", "ppp": 1.0, "source": "World Bank PA.NUS.PPP static"},
    "GB": {"country": "United Kingdom", "currency": "GBP", "ppp": 0.69, "source": "World Bank PA.NUS.PPP static"},
    "DE": {"country": "Germany", "currency": "EUR", "ppp": 0.79, "source": "World Bank PA.NUS.PPP static"},
    "SG": {"country": "Singapore", "currency": "SGD", "ppp": 0.84, "source": "World Bank PA.NUS.PPP static"},
    "CA": {"country": "Canada", "currency": "CAD", "ppp": 1.21, "source": "World Bank PA.NUS.PPP static"},
    "AU": {"country": "Australia", "currency": "AUD", "ppp": 1.43, "source": "World Bank PA.NUS.PPP static"},
    "NL": {"country": "Netherlands", "currency": "EUR", "ppp": 0.82, "source": "World Bank PA.NUS.PPP static"},
    "AE": {"country": "United Arab Emirates", "currency": "AED", "ppp": 2.1, "source": "World Bank PA.NUS.PPP static"},
}

CITY_COST_INDEX: dict[str, float] = {
    "Bengaluru": 1.0,
    "Delhi NCR": 1.02,
    "Mumbai": 1.25,
    "Hyderabad": 0.92,
    "Pune": 0.95,
    "Chennai": 0.9,
    "Kolkata": 0.82,
    "Ahmedabad": 0.85,
    "Jaipur": 0.78,
    "Indore": 0.74,
    "Kochi": 0.83,
    "Chandigarh": 0.88,
    "Coimbatore": 0.76,
    "Bhubaneswar": 0.72,
    "Goa": 1.05,
    "San Francisco": 3.1,
    "New York": 3.0,
    "London": 2.45,
    "Berlin": 1.75,
    "Singapore": 2.15,
    "Toronto": 2.0,
    "Sydney": 2.25,
    "Dubai": 1.8,
}

COUNTRY_TAX_AND_VISA: dict[str, dict[str, Any]] = {
    "IN": {"effective_tax_rate": 0.24, "tax_note": "Approximate Indian new-regime burden at senior professional income levels.", "visa_difficulty": "home", "visa_note": "No work visa required for an Indian citizen.", "sources": ["https://www.incometax.gov.in/"]},
    "US": {"effective_tax_rate": 0.32, "tax_note": "Federal, payroll and typical state taxes vary widely.", "visa_difficulty": "very_high", "visa_note": "H-1B is capped and lottery-based unless the employer is cap-exempt; a better salary is not automatically obtainable.", "sources": ["https://www.uscis.gov/working-in-the-united-states/h-1b-specialty-occupations"]},
    "GB": {"effective_tax_rate": 0.36, "tax_note": "Income tax plus national insurance at experienced tech salary levels.", "visa_difficulty": "medium", "visa_note": "Skilled Worker needs sponsorship; Global Talent can work but requires endorsement or prize evidence.", "sources": ["https://www.gov.uk/skilled-worker-visa", "https://www.gov.uk/global-talent"]},
    "DE": {"effective_tax_rate": 0.40, "tax_note": "Income tax and social contributions for a single worker are high but include public benefits.", "visa_difficulty": "medium", "visa_note": "EU Blue Card is realistic for qualifying salary and degree-equivalent roles, but employer and documentation still matter.", "sources": ["https://www.make-it-in-germany.com/en/visa-residence/types/eu-blue-card"]},
    "NL": {"effective_tax_rate": 0.37, "tax_note": "Income tax and social insurance estimate for experienced professional income; the 30% ruling can change this materially.", "visa_difficulty": "medium", "visa_note": "Highly skilled migrant residence is employer-sponsored; feasible with a recognised sponsor and salary threshold, but not automatic.", "sources": ["https://ind.nl/en/residence-permits/work/highly-skilled-migrant"]},
    "SG": {"effective_tax_rate": 0.15, "tax_note": "Singapore income tax is comparatively low; CPF does not usually apply to foreign employees.", "visa_difficulty": "high", "visa_note": "Employment Pass approval uses COMPASS and employer sponsorship; strong pay helps but does not guarantee approval.", "sources": ["https://www.mom.gov.sg/passes-and-permits/employment-pass"]},
    "CA": {"effective_tax_rate": 0.33, "tax_note": "Federal plus provincial tax estimate.", "visa_difficulty": "medium", "visa_note": "Employer work permits and Express Entry are possible but slower than accepting an India/remote role.", "sources": ["https://www.canada.ca/en/immigration-refugees-citizenship/services/work-canada.html"]},
    "AU": {"effective_tax_rate": 0.34, "tax_note": "Income tax plus Medicare levy estimate.", "visa_difficulty": "medium_high", "visa_note": "Skilled and employer-sponsored visas exist, but occupation lists, points and sponsorship decide feasibility.", "sources": ["https://immi.homeaffairs.gov.au/visas/working-in-australia"]},
    "AE": {"effective_tax_rate": 0.02, "tax_note": "No federal personal income tax; estimate leaves room for fees and mandatory costs.", "visa_difficulty": "medium", "visa_note": "Work residency is employer-sponsored; easier than lottery systems but tied to the job.", "sources": ["https://u.ae/en/information-and-services/jobs/work-visas"]},
}

# Roughly, the chance a determined senior designer actually lands the move
# within a year or two. The H-1B lottery alone has run near a quarter in recent
# years, and that is after finding a sponsor willing to file, so "very high"
# difficulty is deliberately harsh. These are judgement calls, not measurements,
# which is why they are named and shown rather than folded silently into a score.
# PPP factors are static country averages and the tax rates are estimates, so a
# gap inside this band is not evidence of anything. The pill uses it too.
COMPARABLE_BAND_PCT = 15

VISA_ATTAINABILITY: dict[str, float] = {
    "home": 1.0,
    "low": 0.9,
    "medium": 0.7,
    "medium_high": 0.5,
    "high": 0.35,
    "very_high": 0.15,
    "unknown": 0.4,
}

VISA_LABEL: dict[str, str] = {
    "home": "no visa needed",
    "low": "low",
    "medium": "medium",
    "medium_high": "medium-high",
    "high": "high",
    "very_high": "very high",
    "unknown": "unknown",
}


UNKNOWN_FOREIGN_TAX_AND_VISA: dict[str, Any] = {
    "effective_tax_rate": None,
    "tax_note": "No committed tax estimate for this country yet.",
    "visa_difficulty": "unknown",
    "visa_note": "Visa feasibility for an Indian passport holder is not modelled for this country yet, so the build refuses to rank it as a relocation upgrade.",
    "sources": [],
}

COUNTRY_ALIASES = {"USA": "US", "United States": "US", "UK": "GB", "United Kingdom": "GB", "Germany": "DE", "Singapore": "SG", "Canada": "CA", "Australia": "AU", "India": "IN", "United Arab Emirates": "AE"}


def _shown(pct: float) -> int:
    """The integer the UI will display, so prose and pill never disagree.

    Python rounds half to even and JavaScript rounds half up, which put "66%"
    in a sentence directly beneath a pill reading "+67%" for the same number.
    """
    return math.floor(abs(pct) + 0.5)


def _worldbank_ind_ppp() -> tuple[float, str, str | None]:
    payload, error = fetch_json(WORLDBANK_IND_PPP_URL, cache_hours=24)
    if error or not isinstance(payload, list) or len(payload) < 2:
        return STATIC_PPP["IN"]["ppp"], "static_fallback", error or "unexpected World Bank response"
    for row in payload[1] or []:
        value = row.get("value")
        if value:
            return float(value), f"World Bank PA.NUS.PPP {row.get('date')}", None
    return STATIC_PPP["IN"]["ppp"], "static_fallback", "World Bank returned no PPP value"


def _remote_market_for(job) -> str:
    if job.india:
        return "India remote"
    if job.eligible:
        return "Eligible global/APAC remote"
    if job.region_lock:
        return f"Remote restricted to {job.region_lock}"
    return "Remote / unspecified"


def _city_points(job) -> list[tuple[str, str]]:
    """Canonical relocation places, never raw location prose.

    Remote strings like "Remote — United States" often geocode to a country
    centroid or to no point at all. Those are not places a person can move to,
    so relocation city rows only come from real, non-approximate geocoder points
    on non-remote postings.
    """
    if job.workplace == "remote":
        return []
    points = []
    for point in job.points:
        if point.get("approximate"):
            continue
        label = point.get("label")
        country = point.get("country")
        if label and country:
            points.append((label, COUNTRY_ALIASES.get(country, country)))
    return points


def _crawled_basis(values: list[int]) -> dict[str, Any]:
    return {
        "tier": 1,
        "kind": "crawled_disclosed_bands",
        "samples": len(values),
        "median_inr": int(statistics.median(values)),
    }


def _benchmark_value(city: str, country: str, seniority: str) -> tuple[int | None, dict | None]:
    band = benchmark_for(city, country, seniority)
    if not band:
        return None, None
    return band.median_inr, benchmark_basis(band)


def _market_value(values: list[int], city: str, country: str, seniority: str) -> tuple[int | None, dict | None]:
    if len(values) >= 3:
        return int(statistics.median(values)), _crawled_basis(values)
    return _benchmark_value(city, country, seniority)


def build_relocation(jobs: list, *, profile: Profile | None = None, ppp_override: float | None = None) -> dict:
    """Compute one relocation row for each city with salary evidence."""
    seniority = profile.seniority if profile else "senior"
    ind_ppp, ppp_source, ppp_error = (ppp_override, "override", None) if ppp_override else _worldbank_ind_ppp()
    ppp_table = {**STATIC_PPP, "IN": {**STATIC_PPP["IN"], "ppp": ind_ppp, "source": ppp_source}}

    buckets: dict[tuple[str, str], list[int]] = defaultdict(list)
    counts: dict[tuple[str, str], int] = defaultdict(int)
    remote_counts: defaultdict[str, int] = defaultdict(int)
    remote_pay: defaultdict[str, list[int]] = defaultdict(list)
    for job in jobs:
        band = job.salary_parsed
        if job.workplace == "remote":
            market = _remote_market_for(job)
            remote_counts[market] += 1
            if band:
                remote_pay[market].append((band["inr_low"] + band["inr_high"]) // 2)
            continue

        for key in _city_points(job):
            counts[key] += 1
            if band:
                buckets[key].append((band["inr_low"] + band["inr_high"]) // 2)

    remote = []
    for market, count in sorted(remote_counts.items(), key=lambda kv: (-kv[1], kv[0])):
        values = sorted(remote_pay.get(market, []))
        remote.append(
            {
                "market": market,
                "jobs": count,
                "salary_samples": len(values),
                "nominal_median_pay_inr": int(statistics.median(values)) if values else None,
                "note": "Remote roles are not relocation cities; pay is shown only as market context.",
            }
        )

    bengaluru_values = buckets.get(("Bengaluru", "IN"), [])
    baseline_nominal, baseline_basis = _market_value(bengaluru_values, "Bengaluru", "IN", seniority)
    baseline_after_tax = baseline_nominal * (1 - COUNTRY_TAX_AND_VISA["IN"]["effective_tax_rate"]) if baseline_nominal else None
    baseline_real = (baseline_after_tax / ind_ppp / CITY_COST_INDEX["Bengaluru"]) if baseline_after_tax else None

    rows = []
    for key in sorted(counts):
        values = buckets.get(key, [])
        city, country = key
        info = COUNTRY_TAX_AND_VISA.get(country, UNKNOWN_FOREIGN_TAX_AND_VISA)
        ppp = ppp_table.get(country)
        nominal, basis = _market_value(values, city, country, seniority)
        if nominal is None:
            rows.append(
                {
                    "city": city,
                    "country": country,
                    "jobs": counts[key],
                    "salary_samples": len(values),
                    "nominal_median_pay_inr": None,
                    "pay_basis": {"tier": 3, "kind": "no_data", "message": "No crawled salary sample and no published benchmark for this city/seniority."},
                    "baseline_basis": baseline_basis,
                    "ppp_adjusted_vs_bengaluru_pct": None,
                    "effective_tax_rate": info["effective_tax_rate"],
                    "visa_difficulty": info["visa_difficulty"],
                    "visa_difficulty_label": VISA_LABEL.get(info["visa_difficulty"], info["visa_difficulty"]),
                    "visa_attainability": VISA_ATTAINABILITY.get(info["visa_difficulty"], VISA_ATTAINABILITY["unknown"]),
                    "expected_uplift_pct": None,
                    "visa_note": info["visa_note"],
                    "verdict": "No crawled salary sample or published benchmark for this city yet, so relocation pay cannot be compared honestly.",
                }
            )
            continue
        if not ppp or info["effective_tax_rate"] is None:
            rows.append(
                {
                    "city": city,
                    "country": country,
                    "jobs": counts[key],
                    "salary_samples": len(values),
                    "nominal_median_pay_inr": nominal,
                    "pay_basis": basis,
                    "baseline_basis": baseline_basis,
                    "ppp_adjusted_vs_bengaluru_pct": None,
                    "effective_tax_rate": info["effective_tax_rate"],
                    "visa_difficulty": info["visa_difficulty"],
                    "visa_difficulty_label": VISA_LABEL.get(info["visa_difficulty"], info["visa_difficulty"]),
                    "visa_attainability": VISA_ATTAINABILITY.get(info["visa_difficulty"], VISA_ATTAINABILITY["unknown"]),
                    "expected_uplift_pct": None,
                    "visa_note": info["visa_note"],
                    "verdict": "Salary was disclosed, but PPP, tax or visa data is missing for this country, so relocation value is not ranked.",
                }
            )
            continue
        currency = ppp.get("currency", "INR")
        fx = FX_TO_INR.get(currency, 1.0)
        local_nominal = nominal / fx if fx else nominal
        after_tax_local = local_nominal * (1 - float(info["effective_tax_rate"]))
        real = after_tax_local / float(ppp["ppp"]) / CITY_COST_INDEX.get(city, 1.0)
        vs_blr = round((real / baseline_real - 1) * 100, 1) if baseline_real else None
        difficulty = info["visa_difficulty"]
        if vs_blr is None:
            verdict = "Not enough Bengaluru salary evidence to compare honestly."
        elif country != "IN" and difficulty in {"very_high", "high"}:
            verdict = f"Looks {_shown(vs_blr)}% {'better' if vs_blr > 0 else 'worse'} on real pay, compared against the {baseline_basis['kind'].replace('_', ' ')} Bengaluru {seniority} band; visa difficulty is {VISA_LABEL.get(difficulty, difficulty)}, so treat as a long shot."
        elif vs_blr > COMPARABLE_BAND_PCT:
            verdict = f"Real pay is about {_shown(vs_blr)}% above Bengaluru after PPP, tax and cost adjustment, compared against the {baseline_basis['kind'].replace('_', ' ')} Bengaluru {seniority} band."
        elif vs_blr < -COMPARABLE_BAND_PCT:
            verdict = f"Real pay is about {_shown(vs_blr)}% below Bengaluru after adjustment, compared against the {baseline_basis['kind'].replace('_', ' ')} Bengaluru {seniority} band."
        else:
            verdict = f"Real pay is roughly comparable to Bengaluru once PPP, tax and local cost are included, using the {baseline_basis['kind'].replace('_', ' ')} Bengaluru {seniority} band."
        # The page promises that visa difficulty is weighted, so it has to be.
        # If the move does not come off you stay where you are, so the discount
        # applies to the upside only — a lottery does not rescue a pay cut.
        attainability = VISA_ATTAINABILITY.get(difficulty, VISA_ATTAINABILITY["unknown"])
        expected = None if vs_blr is None else round(vs_blr * attainability if vs_blr > 0 else vs_blr, 1)
        rows.append(
            {
                "city": city,
                "country": country,
                "jobs": counts[key],
                "salary_samples": len(values),
                "nominal_median_pay_inr": nominal,
                "pay_basis": basis,
                "baseline_basis": baseline_basis,
                "ppp_adjusted_vs_bengaluru_pct": vs_blr,
                "effective_tax_rate": info["effective_tax_rate"],
                "visa_difficulty": difficulty,
                "visa_difficulty_label": VISA_LABEL.get(difficulty, difficulty),
                "visa_attainability": attainability,
                "expected_uplift_pct": expected,
                "visa_note": info["visa_note"],
                "verdict": verdict,
            }
        )

    return {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "baseline": {"city": "Bengaluru", "seniority": seniority, "nominal_median_pay_inr": baseline_nominal, "basis": baseline_basis, "real_after_tax_ppp": round(baseline_real, 2) if baseline_real else None},
        "ppp": {"source": ppp_source, "worldbank_url": WORLDBANK_IND_PPP_URL, "error": ppp_error, "table": ppp_table},
        "tax_and_visa": COUNTRY_TAX_AND_VISA,
        "comparable_band_pct": COMPARABLE_BAND_PCT,
        "cities": sorted(rows, key=lambda r: (r["expected_uplift_pct"] is None, -(r["expected_uplift_pct"] if r["expected_uplift_pct"] is not None else -999), -r["salary_samples"])),
        "remote": remote,
    }
