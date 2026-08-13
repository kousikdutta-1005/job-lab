"""Turning a raw posting into something you can filter, rank and match against."""

from __future__ import annotations

import re

from .config import (
    ALL_LEXICON_TERMS,
    SENIORITY_META,
    TERM_TO_GROUP,
    is_design_role,
    seniority_from_title,
    term_pattern,
    seniority_from_years,
    years_required,
)
from .geo import classify as classify_location
from .geocode import locate
from .models import Job

# Built once. Word-boundary matching with the longest terms first, so
# "design system" is never counted as a bare "design", and "ai" never matches
# inside "email" or "detail".
_TERM_PATTERNS: list[tuple[str, re.Pattern[str]]] = [
    (term, term_pattern(term)) for term in ALL_LEXICON_TERMS
]


def extract_keywords(text: str) -> tuple[list[str], dict[str, list[str]]]:
    """Which design vocabulary this posting actually uses."""
    if not text:
        return [], {}
    blob = text.lower()
    found: list[str] = []
    for term, rx in _TERM_PATTERNS:
        if rx.search(blob):
            found.append(term)

    grouped: dict[str, list[str]] = {}
    for term in found:
        group = TERM_TO_GROUP.get(term, "other")
        grouped.setdefault(group, []).append(term)
    return found, grouped


def enrich(job: Job) -> Job:
    """Fill in everything derivable from the posting itself."""
    location = classify_location(job.location_raw, job.description_text)
    job.workplace = location["workplace"]
    job.cities = location["cities"]
    job.india = location["india"]
    job.region_lock = location["region_lock"]
    job.eligible = location["eligible"]
    job.eligibility_reason = location["eligibility_reason"]

    # Where it goes on the map. A remote job with no named city has no point,
    # and is listed off-map rather than dropped or invented onto a centroid.
    job.points = locate(job.location_raw)

    lo, hi = years_required(job.description_text)
    job.years_min, job.years_max = lo, hi

    # The title is the strongest signal because it is what the employer chose to
    # advertise. Stated years are the next best, and are real evidence: Airtable
    # writes "Product Designer (8+ YOE)", which is a staff-weight ask however the
    # title reads. Only when neither says anything do we fall back to a working
    # assumption, and then we record that it was one.
    stated = seniority_from_title(job.title)
    if stated:
        job.seniority, job.seniority_source, job.seniority_stated = stated, "title", True
    else:
        implied = seniority_from_years(lo)
        if implied:
            job.seniority, job.seniority_source, job.seniority_stated = implied, "years", True
        else:
            job.seniority, job.seniority_source, job.seniority_stated = "mid", "assumed", False

    label, _, _ = SENIORITY_META.get(job.seniority, ("Mid-level", 2, 6))
    job.seniority_label = label

    job.keywords, job.keyword_groups = extract_keywords(job.description_text or job.title)
    return job


def keep(job: Job) -> bool:
    """The single gate into the board."""
    return is_design_role(job.title, job.description_text)
