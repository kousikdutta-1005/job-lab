"""How rare a requirement is, measured across every job on the board.

A job description that mentions Figma is telling you nothing — every design job
mentions Figma. One that mentions design tokens, or WCAG, or service blueprints
is telling you what the role is actually about. Inverse document frequency is
the difference between those two cases, and computing it here means the browser
can weight a resume gap without shipping a model or calling an API.
"""

from __future__ import annotations

import math

from .models import Job


def build_idf(jobs: list[Job]) -> dict[str, float]:
    """Inverse document frequency for every term the corpus actually contains."""
    total = len(jobs)
    if not total:
        return {}

    document_frequency: dict[str, int] = {}
    for job in jobs:
        for term in set(job.keywords):
            document_frequency[term] = document_frequency.get(term, 0) + 1

    # Smoothed, so a term in every posting scores just above zero rather than
    # exactly zero, and a term in one posting does not dominate everything.
    return {
        term: round(math.log((total + 1) / (df + 1)) + 1.0, 4)
        for term, df in document_frequency.items()
    }


def corpus_stats(jobs: list[Job], idf: dict[str, float]) -> dict:
    """A readable summary of what the board learned tonight."""
    total = len(jobs)
    document_frequency: dict[str, int] = {}
    for job in jobs:
        for term in set(job.keywords):
            document_frequency[term] = document_frequency.get(term, 0) + 1

    ranked = sorted(document_frequency.items(), key=lambda kv: kv[1], reverse=True)
    return {
        "documents": total,
        "distinct_terms": len(document_frequency),
        "most_common": [
            {"term": t, "jobs": c, "share": round(c / total, 3), "idf": idf.get(t, 0)}
            for t, c in ranked[:25]
        ],
        "most_distinctive": [
            {"term": t, "jobs": c, "idf": idf.get(t, 0)}
            for t, c in sorted(ranked, key=lambda kv: idf.get(kv[0], 0), reverse=True)[:25]
        ],
    }
