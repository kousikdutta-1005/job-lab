"""Evidence-backed career recommendations assembled from the static datasets.

This is deliberately not a generative layer. It only says things that can point
back to jobs, trends, salary rows, or the public profile; when the evidence is
thin the output says so instead of inventing confidence.
"""

from __future__ import annotations

import statistics
from collections import Counter
from datetime import datetime, timezone

from .benchmarks import benchmark_basis, benchmark_for
from .score import Profile


def _insight(headline: str, body: str, evidence: list[dict], confidence: str) -> dict:
    return {"headline": headline, "body": body, "evidence": evidence, "confidence": confidence}


def _band(values: list[int]) -> dict:
    values = sorted(values)
    return {
        "samples": len(values),
        "median_inr": int(statistics.median(values)),
        "p25_inr": values[len(values) // 4],
        "p75_inr": values[(len(values) * 3) // 4],
    }


def _pay_context(jobs: list, profile: Profile) -> dict:
    """Salary evidence split by market so foreign pay never becomes an India anchor."""
    values = []
    india = []
    foreign_remote = []
    for job in jobs:
        if job.seniority != profile.seniority or not job.salary_parsed:
            continue
        band = job.salary_parsed
        midpoint = (band["inr_low"] + band["inr_high"]) // 2
        values.append(midpoint)
        if job.india:
            india.append(midpoint)
        else:
            foreign_remote.append(midpoint)

    city = "Bengaluru" if (profile.location or "").lower() == "india" else profile.location
    benchmark = benchmark_for(city, "IN", profile.seniority) if city else None
    current_ctc = getattr(profile, "current_ctc", None)
    benchmark_gap = None
    if benchmark and current_ctc:
        benchmark_gap = {
            "current_ctc_inr": current_ctc,
            "vs_median_inr": current_ctc - benchmark.median_inr,
            "vs_median_pct": round((current_ctc / benchmark.median_inr - 1) * 100, 1) if benchmark.median_inr else None,
        }

    return {
        "seniority": profile.seniority,
        "all_markets_samples": len(values),
        "india": {
            "market": "India-based postings",
            "samples": len(india),
            "band": _band(india) if len(india) >= 3 else None,
            "note": "Reportable only with at least 3 disclosed India-based postings.",
        },
        "foreign_remote_context": {
            "market": "Foreign and remote postings, INR-converted for context only",
            "samples": len(foreign_remote),
            "band": _band(foreign_remote) if len(foreign_remote) >= 3 else None,
            "note": "Do not use this as an Indian negotiation anchor; it mixes employer countries, tax systems and visa access.",
        },
        "published_india_benchmark": benchmark_basis(benchmark) if benchmark else None,
        "current_ctc_gap": benchmark_gap,
    }


def build_insights(jobs: list, profile: Profile, idf: dict[str, float], trends: dict | None, relocation: dict | None) -> dict:
    insights: list[dict] = []
    senior_jobs = [job for job in jobs if job.seniority in {"senior", "lead", "staff", "principal"}]
    profile_terms = set(profile.strengths)

    skill_counts: Counter[str] = Counter()
    examples: dict[str, list[dict]] = {}
    for job in senior_jobs:
        for term in set(job.keywords) - profile_terms:
            skill_counts[term] += 1
            examples.setdefault(term, []).append({"company": job.company, "title": job.title, "url": job.url})

    gaps = [
        {"term": term, "senior_jobs": count, "idf": idf.get(term, 0), "examples": examples.get(term, [])[:3]}
        for term, count in skill_counts.items()
        if count >= 2
    ]
    gaps.sort(key=lambda row: (-row["idf"], -row["senior_jobs"], row["term"]))
    if gaps:
        top = gaps[:5]
        insights.append(
            _insight(
                "Close the highest-signal senior skill gaps",
                "These terms appear in multiple senior-or-higher postings but are not listed in the public profile strengths. Treat them as portfolio proof points only if they are genuinely true.",
                top,
                "medium" if len(top) >= 3 else "low",
            )
        )

    companies = Counter(job.company for job in jobs if job.eligible)
    builders = [{"company": name, "open_roles": count} for name, count in companies.most_common() if count >= 2][:10]
    if builders:
        insights.append(
            _insight(
                "Prioritise companies building a design bench",
                "Multiple open design roles at the same company are a stronger application signal than a single isolated posting.",
                builders,
                "high" if builders[0]["open_roles"] >= 3 else "medium",
            )
        )

    pay = _pay_context(jobs, profile)
    india_band = pay["india"]["band"]
    context_band = pay["foreign_remote_context"]["band"]
    if india_band:
        insights.append(
            _insight(
                "Use India-disclosed pay cautiously as a negotiation anchor",
                f"For India-based {profile.seniority} roles with disclosed bands (n={india_band['samples']}), the median midpoint is ₹{india_band['median_inr']:,}; the middle range runs roughly ₹{india_band['p25_inr']:,}–₹{india_band['p75_inr']:,}.",
                [pay],
                "medium",
            )
        )
    elif pay["published_india_benchmark"]:
        band = pay["published_india_benchmark"]["band"]
        gap = pay.get("current_ctc_gap")
        if gap:
            if gap["vs_median_inr"] >= 0:
                gap_text = f"The optional current CTC is ₹{gap['current_ctc_inr']:,}, about {gap['vs_median_pct']:.1f}% above this benchmark median."
            else:
                gap_text = f"The optional current CTC is ₹{gap['current_ctc_inr']:,}, about {abs(gap['vs_median_pct']):.1f}% below this benchmark median."
        else:
            gap_text = "No current CTC is present in the committed profile, so the build can state the target band but not the personal gap."
        insights.append(
            _insight(
                "Use the published Bengaluru senior band as the India pay anchor",
                f"Indian employers in this crawl published too few {profile.seniority} pay bands to report from postings (n={pay['india']['samples']}). The tier-2 published Bengaluru {profile.seniority} benchmark is ₹{band['low_inr']:,}–₹{band['high_inr']:,}, median ₹{band['median_inr']:,} ({band['confidence']}, {band['source_name']}). {gap_text}",
                [pay],
                "medium" if band["confidence"] == "verified" else "low",
            )
        )
    elif context_band:
        insights.append(
            _insight(
                "Do not anchor Indian negotiation on foreign salary bands",
                f"Indian employers in this crawl published too few {profile.seniority} pay bands to report honestly (n={pay['india']['samples']}). Foreign and remote postings disclose more (n={context_band['samples']}), with a median INR-converted midpoint of ₹{context_band['median_inr']:,}, but that is context only because it crosses currencies, tax regimes and visa constraints.",
                [pay],
                "high",
            )
        )
    else:
        insights.append(
            _insight(
                "Pay data is too thin to anchor negotiation",
                f"Fewer than three {profile.seniority} postings disclosed pay in India or in foreign/remote markets, so the build refuses to print a market band.",
                [pay],
                "high",
            )
        )

    city_rows = (relocation or {}).get("cities") or []
    realistic = [r for r in city_rows if r.get("ppp_adjusted_vs_bengaluru_pct") is not None and r.get("visa_difficulty") in {"home", "medium"}]
    if realistic:
        best = realistic[:5]
        insights.append(
            _insight(
                "Relocation only beats Bengaluru where access is realistic",
                "These cities rank best after PPP, tax, local cost and visa reality. Lottery or high-friction visa paths are intentionally not treated as easy wins.",
                best,
                "medium" if best[0].get("salary_samples", 0) >= 3 else "low",
            )
        )

    comparison = (trends or {}).get("comparisons", {}).get("7d") or {}
    if comparison.get("status") == "ok":
        direction = "heating" if comparison.get("eligible_count_change", 0) > 0 else "cooling" if comparison.get("eligible_count_change", 0) < 0 else "flat"
        insights.append(
            _insight(
                f"The eligible market is {direction} week over week",
                f"Eligible design roles changed by {comparison.get('eligible_count_change', 0)} and total design roles changed by {comparison.get('job_count_change', 0)} versus {comparison.get('from_date')}.",
                [comparison],
                "medium",
            )
        )
    else:
        insights.append(
            _insight(
                "Trend calls need more committed history",
                "Today has been snapshotted, but there is not enough 7-day history yet to claim the market is heating or cooling.",
                [{"status": comparison.get("status", "not_enough_history")}],
                "high",
            )
        )

    if not insights:
        insights.append(
            _insight("Not enough evidence for recommendations yet", "The build completed, but the current dataset is too thin to make a concrete recommendation without overstating the data.", [], "high")
        )

    return {"generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"), "profile": profile.to_dict(), "insights": insights}
