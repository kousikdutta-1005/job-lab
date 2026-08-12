"""The nightly run: fetch everything, keep the design jobs, explain the result.

Ordered so that each stage can fail without taking the rest down. A dead source
contributes zero jobs and one line in the health report; it never stops the
board from being rebuilt from everything else that answered.
"""

from __future__ import annotations

import json
import re
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timezone
from pathlib import Path

from . import __version__
from .benchmarks import export_benchmarks
from .classify import enrich, keep
from .contacts import email_guesses, linkedin_links
from .corpus import build_idf, corpus_stats
from .insights import build_insights
from .models import Job, dedupe_key
from .news import collect_news
from .registry import load_registry, resolve_boards
from .relocation import build_relocation
from .salary import attach_salaries, benchmarks
from .score import load_profile, score_job
from .sources.aggregators import AGGREGATORS
from .sources.ats import fetch_ats
from .trends import build_trends

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "web" / "public" / "data"

# A posting direct from the company's own ATS beats the same posting relayed by
# an aggregator: fresher, fuller text, and a link that applies rather than one
# that redirects.
SOURCE_PRIORITY = {
    "greenhouse": 10,
    "lever": 10,
    "ashby": 10,
    "workable": 9,
    "smartrecruiters": 9,
    "recruitee": 9,
    "remotive": 5,
    "himalayas": 4,
    "weworkremotely": 4,
    "arbeitnow": 3,
}

_DESCRIPTION_MARKUP_RE = re.compile(r"<div|<p(?:\s|>)|<br|</|&lt;|&amp;|&nbsp;", re.I)


def _collect_company_jobs(companies, ats_map, workers: int = 10) -> tuple[list[Job], list[dict]]:
    """Pull every board in the registry, in parallel, recording what happened."""
    targets = []
    for company in companies:
        entry = ats_map.get(company.key) or {}
        if entry.get("ats") and entry.get("slug"):
            targets.append((company, entry))

    jobs: list[Job] = []
    health: list[dict] = []

    def one(pair):
        company, entry = pair
        found, error = fetch_ats(entry["ats"], entry["slug"], company.name, cache_hours=6)
        return company, entry, found, error

    with ThreadPoolExecutor(max_workers=workers) as pool:
        futures = [pool.submit(one, pair) for pair in targets]
        for future in as_completed(futures):
            try:
                company, entry, found, error = future.result()
            except Exception as exc:  # noqa: BLE001 - one bad board must not stop the crawl
                health.append({"kind": "company", "name": "unknown", "error": str(exc), "jobs": 0})
                continue

            design = [j for j in found if keep(j)]
            for job in design:
                job.company = company.name
                job.company_domain = company.domain
            jobs.extend(design)
            health.append(
                {
                    "kind": "company",
                    "name": company.name,
                    "ats": entry["ats"],
                    "slug": entry["slug"],
                    "confidence": entry.get("confidence"),
                    "postings": len(found),
                    "jobs": len(design),
                    "error": error,
                }
            )

    return jobs, health


def _collect_aggregators() -> tuple[list[Job], list[dict]]:
    jobs: list[Job] = []
    health: list[dict] = []

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = {pool.submit(fn): name for name, fn in AGGREGATORS.items()}
        for future in as_completed(futures):
            name = futures[future]
            try:
                found, error = future.result()
            except Exception as exc:  # noqa: BLE001
                health.append({"kind": "aggregator", "name": name, "error": str(exc), "jobs": 0})
                continue
            design = [j for j in found if keep(j)]
            jobs.extend(design)
            health.append(
                {
                    "kind": "aggregator",
                    "name": name,
                    "postings": len(found),
                    "jobs": len(design),
                    "error": error,
                }
            )

    return jobs, health


def _dedupe(jobs: list[Job]) -> tuple[list[Job], int]:
    """One row per real job, keeping the best copy of it."""
    best: dict[str, Job] = {}
    for job in jobs:
        key = dedupe_key(job.company, job.title, job.location_raw)
        current = best.get(key)
        if current is None:
            best[key] = job
            continue
        # Prefer the direct source; break ties on which copy has more text.
        rank_new = (SOURCE_PRIORITY.get(job.source, 0), len(job.description_text or ""))
        rank_old = (SOURCE_PRIORITY.get(current.source, 0), len(current.description_text or ""))
        if rank_new > rank_old:
            best[key] = job
    return list(best.values()), len(jobs) - len(best)


def _description_markup_offenders(jobs: list[Job]) -> list[dict]:
    """Descriptions must be plain text before they become user-visible JSON.

    Greenhouse once returned HTML escaped as text. Stripping tags before
    unescaping made the UI show literal `<div>` and `<p>` tags, which is exactly
    the kind of data bug that only appears after deployment. Failing the build
    here keeps that regression noisy.
    """
    offenders = []
    for job in jobs:
        text = job.description_text or ""
        if _DESCRIPTION_MARKUP_RE.search(text):
            offenders.append(
                {
                    "id": job.id,
                    "source": job.source,
                    "company": job.company,
                    "title": job.title,
                    "snippet": text[:160],
                }
            )
    return offenders


def run(*, force_detect: bool = False, workers: int = 10, write: bool = True) -> dict:
    started = time.time()
    today = date.today()

    companies = load_registry()
    ats_map, detect_stats = resolve_boards(companies, workers=workers, force=force_detect)
    domains = {c.name: c.domain for c in companies}
    tags = {c.name: list(c.tags) for c in companies}

    company_jobs, company_health = _collect_company_jobs(companies, ats_map, workers=workers)
    aggregator_jobs, aggregator_health = _collect_aggregators()

    raw = company_jobs + aggregator_jobs
    jobs, duplicates_removed = _dedupe(raw)

    for job in jobs:
        enrich(job)
        if not job.company_domain:
            job.company_domain = domains.get(job.company)

    profile = load_profile()
    for job in jobs:
        verdict = score_job(job, profile, today=today)
        job.match_score = verdict.score
        job.match_reasons = verdict.reasons

    disclosed = attach_salaries(jobs)
    pay = benchmarks(jobs)

    idf = build_idf(jobs)
    news, news_health = collect_news()
    trends = build_trends(jobs, write=write)
    salary_benchmarks = export_benchmarks()
    pay["tiers"] = {
        "tier_1": "Crawled disclosed salary bands from live postings.",
        "tier_2": "Published benchmarks from data/benchmarks.yaml, with source and confidence.",
        "tier_3": "No data; the UI should say so.",
    }
    pay["published_benchmarks"] = salary_benchmarks
    relocation = build_relocation(jobs, profile=profile)
    relocation_health = {
        "kind": "relocation",
        "name": "World Bank PPP",
        "url": relocation["ppp"]["worldbank_url"],
        "items": 1 if not relocation["ppp"].get("error") else 0,
        "error": relocation["ppp"].get("error"),
        "source": relocation["ppp"].get("source"),
    }
    insights = build_insights(jobs, profile, idf, trends, relocation)

    # Contacts are resolved per company, not per job, because the mail setup and
    # the LinkedIn routes are the same for every role at the same employer.
    by_company: dict[str, list[Job]] = {}
    for job in jobs:
        by_company.setdefault(job.company, []).append(job)

    company_contacts: dict[str, dict] = {}
    with ThreadPoolExecutor(max_workers=8) as pool:
        futures = {
            pool.submit(
                email_guesses,
                domains.get(name) or (rows[0].company_domain if rows else None),
                evidence_texts=[r.description_text for r in rows[:6]],
            ): name
            for name, rows in by_company.items()
        }
        for future in as_completed(futures):
            name = futures[future]
            try:
                company_contacts[name] = future.result()
            except Exception:  # noqa: BLE001
                company_contacts[name] = {"confidence": "none", "patterns": []}

    for job in jobs:
        guess = company_contacts.get(job.company, {})
        job.email_pattern = (guess.get("patterns") or [{}])[0].get("pattern")
        job.email_pattern_confidence = guess.get("confidence", "none")
        job.linkedin = linkedin_links(job.company, job.seniority)

    jobs.sort(key=lambda j: (-j.match_score, j.posted_at or "", j.company))

    markup_offenders = _description_markup_offenders(jobs)
    if markup_offenders:
        sample = "; ".join(
            f"{row['source']} {row['company']} {row['title']}: {row['snippet']!r}"
            for row in markup_offenders[:3]
        )
        raise RuntimeError(f"{len(markup_offenders)} job descriptions still contain HTML markup/entities. {sample}")

    eligible = [j for j in jobs if j.eligible]

    # The map works on cities, not postings. Aggregating here means the browser
    # renders a few dozen points instead of clustering a few thousand on every
    # pan, and the counts stay honest because they are computed once.
    places: dict[str, dict] = {}
    for job in jobs:
        for point in job.points:
            place = places.setdefault(
                point["label"],
                {
                    "label": point["label"],
                    "country": point.get("country", ""),
                    "lat": point["lat"],
                    "lon": point["lon"],
                    "approximate": point.get("approximate", False),
                    "jobs": 0,
                    "eligible": 0,
                    "companies": set(),
                    "top_score": 0,
                },
            )
            place["jobs"] += 1
            place["eligible"] += 1 if job.eligible else 0
            place["companies"].add(job.company)
            place["top_score"] = max(place["top_score"], job.match_score)

    map_places = sorted(
        (
            {**place, "companies": len(place["companies"])}
            for place in places.values()
        ),
        key=lambda p: -p["jobs"],
    )

    off_map = [j for j in jobs if not j.points]

    payload = {
        "jobs": [j.to_dict() for j in jobs],
        "places": map_places,
        "pay": pay,
        "companies": {
            name: {
                "domain": domains.get(name),
                "tags": tags.get(name, []),
                "contacts": company_contacts.get(name, {}),
                "linkedin": linkedin_links(name),
                "open_roles": len(rows),
            }
            for name, rows in by_company.items()
        },
    }

    health = {
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "version": __version__,
        "duration_seconds": round(time.time() - started, 1),
        "detection": detect_stats,
        "counts": {
            "companies_in_registry": len(companies),
            "companies_with_board": sum(1 for c in companies if (ats_map.get(c.key) or {}).get("ats")),
            "raw_design_postings": len(raw),
            "duplicates_removed": duplicates_removed,
            "jobs": len(jobs),
            "eligible": len(eligible),
            "ineligible": len(jobs) - len(eligible),
            "on_map": len(jobs) - len(off_map),
            "off_map": len(off_map),
            "places": len(map_places),
            "salary_disclosed": disclosed,
            "news_items": len(news["items"]),
            "insights": len(insights["insights"]),
        },
        "by_source": dict(Counter(j.source for j in jobs).most_common()),
        "by_seniority": dict(Counter(j.seniority_label for j in jobs).most_common()),
        "by_workplace": dict(Counter(j.workplace for j in jobs).most_common()),
        "sources": sorted(
            company_health + aggregator_health + news_health + [relocation_health],
            key=lambda h: (-(h.get("jobs") or 0), h.get("name") or ""),
        ),
        "companies_without_board": [
            {"name": c.name, "why": (ats_map.get(c.key) or {}).get("how", "not checked")}
            for c in companies
            if not (ats_map.get(c.key) or {}).get("ats")
        ],
        "corpus": corpus_stats(jobs, idf),
    }

    if write:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        (OUT_DIR / "jobs.json").write_text(json.dumps(payload, separators=(",", ":")))
        (OUT_DIR / "idf.json").write_text(json.dumps(idf, separators=(",", ":")))
        (OUT_DIR / "news.json").write_text(json.dumps(news, separators=(",", ":")))
        (OUT_DIR / "trends.json").write_text(json.dumps(trends, separators=(",", ":")))
        (OUT_DIR / "relocation.json").write_text(json.dumps(relocation, separators=(",", ":")))
        (OUT_DIR / "insights.json").write_text(json.dumps(insights, separators=(",", ":")))
        (OUT_DIR / "benchmarks.json").write_text(json.dumps(salary_benchmarks, separators=(",", ":")))
        (OUT_DIR / "health.json").write_text(json.dumps(health, indent=2))
        (OUT_DIR / "profile.json").write_text(json.dumps(profile.to_dict(), indent=2))

    return health
